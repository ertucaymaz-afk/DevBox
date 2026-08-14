import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const entry = process.argv[2];
const MAX_MESSAGE_BYTES = 8 * 1_048_576;
let proxySequence = 1_000_000_000;

class Framer {
  buffer = Buffer.alloc(0);

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const rawLength = header.split("\r\n").find((line) => line.toLowerCase().startsWith("content-length:"));
      const length = rawLength ? Number(rawLength.slice(rawLength.indexOf(":") + 1).trim()) : Number.NaN;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_MESSAGE_BYTES) throw new Error("DEVBOX_JS_DEBUG_FRAME_INVALID");
      const payloadStart = headerEnd + 4;
      if (this.buffer.length < payloadStart + length) break;
      const parsed = JSON.parse(this.buffer.subarray(payloadStart, payloadStart + length).toString("utf8"));
      this.buffer = this.buffer.subarray(payloadStart + length);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("DEVBOX_JS_DEBUG_MESSAGE_INVALID");
      messages.push(parsed);
    }
    if (this.buffer.length > MAX_MESSAGE_BYTES + 8_192) throw new Error("DEVBOX_JS_DEBUG_BUFFER_LIMIT");
    return messages;
  }
}

function encode(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  if (payload.length > MAX_MESSAGE_BYTES) throw new Error("DEVBOX_JS_DEBUG_MESSAGE_TOO_LARGE");
  return Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "ascii"), payload]);
}

if (!entry) {
  process.stderr.write("DEVBOX_JS_DEBUG_ENTRY_MISSING\n");
  process.exitCode = 64;
} else {
  let parentSocket;
  let activeTargetSocket;
  let closed = false;
  let connected = false;
  let startup = "";
  let serverPort = 0;
  let initializeArguments;
  const stdinFramer = new Framer();
  const pendingTargets = new Set();
  const pendingParentLaunchResponses = [];

  const server = spawn(process.execPath, [entry, "0", "127.0.0.1"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const shutdown = (code = 0) => {
    if (closed) return;
    closed = true;
    parentSocket?.destroy();
    activeTargetSocket?.destroy();
    if (!server.killed) server.kill();
    process.exitCode = code;
  };

  const sendReverseResponse = (socket, request, success, message) => {
    socket.write(encode({
      seq: ++proxySequence,
      type: "response",
      request_seq: request.seq,
      success,
      command: request.command,
      ...(message ? { message } : {})
    }));
  };

  const createTargetSession = async (request, sourceSocket) => {
    if (!initializeArguments || !serverPort) throw new Error("DEVBOX_JS_DEBUG_PARENT_NOT_INITIALIZED");
    const configuration = request.arguments?.configuration;
    if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) throw new Error("DEVBOX_JS_DEBUG_CHILD_CONFIGURATION_INVALID");

    const target = net.createConnection({ host: "127.0.0.1", port: serverPort });
    target.setNoDelay(true);
    const framer = new Framer();
    const pending = new Map();
    let initializedResolve;
    let initializedReject;
    const initialized = new Promise((resolve, reject) => { initializedResolve = resolve; initializedReject = reject; });
    const connectedPromise = new Promise((resolve, reject) => {
      target.once("connect", resolve);
      target.once("error", reject);
    });
    const requestTarget = (command, args, timeoutMs = 15_000) => new Promise((resolve, reject) => {
      const seq = ++proxySequence;
      const timeout = setTimeout(() => {
        pending.delete(seq);
        reject(new Error(`DEVBOX_JS_DEBUG_CHILD_TIMEOUT:${command}`));
      }, timeoutMs);
      timeout.unref();
      pending.set(seq, { resolve, reject, timeout });
      target.write(encode({ seq, type: "request", command, arguments: args }));
    });

    target.on("data", (chunk) => {
      try {
        for (const message of framer.push(chunk)) {
          if (message.type === "response" && typeof message.request_seq === "number" && pending.has(message.request_seq)) {
            const operation = pending.get(message.request_seq);
            clearTimeout(operation.timeout);
            pending.delete(message.request_seq);
            if (message.success === false) operation.reject(new Error(`DEVBOX_JS_DEBUG_CHILD_REJECTED:${message.command}:${message.message ?? "UNKNOWN"}`));
            else operation.resolve(message);
            continue;
          }
          if (message.type === "event" && message.event === "initialized") {
            initializedResolve();
            continue;
          }
          if (message.type === "request" && message.command === "startDebugging") {
            void createTargetSession(message, target).catch((error) => sendReverseResponse(target, message, false, error instanceof Error ? error.message : "DEVBOX_JS_DEBUG_NESTED_TARGET_FAILED"));
            continue;
          }
          process.stdout.write(encode(message));
        }
      } catch (error) {
        initializedReject(error);
        process.stderr.write(`${error instanceof Error ? error.message : "DEVBOX_JS_DEBUG_CHILD_PARSE_FAILED"}\n`);
        target.destroy();
      }
    });
    target.on("error", (error) => {
      initializedReject(error);
      for (const operation of pending.values()) {
        clearTimeout(operation.timeout);
        operation.reject(error);
      }
      pending.clear();
    });
    target.on("close", () => {
      if (activeTargetSocket === target) activeTargetSocket = undefined;
    });

    await connectedPromise;
    const initializePromise = requestTarget("initialize", initializeArguments);
    await Promise.all([initializePromise, initialized]);
    const launchPromise = requestTarget(request.arguments?.request === "attach" ? "attach" : "launch", configuration, 45_000);
    await requestTarget("configurationDone", {});
    await launchPromise;
    activeTargetSocket = target;
    sendReverseResponse(sourceSocket, request, true);
    for (const response of pendingParentLaunchResponses.splice(0)) process.stdout.write(encode(response));
  };

  const connectParent = (port) => {
    if (connected || closed) return;
    connected = true;
    serverPort = port;
    parentSocket = net.createConnection({ host: "127.0.0.1", port });
    parentSocket.setNoDelay(true);
    const parentFramer = new Framer();
    parentSocket.on("connect", () => {
      process.stdin.on("data", (chunk) => {
        try {
          for (const message of stdinFramer.push(chunk)) {
            if (message.type === "request" && message.command === "initialize") initializeArguments = message.arguments;
            (activeTargetSocket && !activeTargetSocket.destroyed ? activeTargetSocket : parentSocket).write(encode(message));
          }
        } catch (error) {
          process.stderr.write(`${error instanceof Error ? error.message : "DEVBOX_JS_DEBUG_STDIN_PARSE_FAILED"}\n`);
          shutdown(1);
        }
      });
    });
    parentSocket.on("data", (chunk) => {
      try {
        for (const message of parentFramer.push(chunk)) {
          if (message.type === "request" && message.command === "startDebugging") {
            if (pendingTargets.has(message.seq)) continue;
            pendingTargets.add(message.seq);
            void createTargetSession(message, parentSocket)
              .catch((error) => sendReverseResponse(parentSocket, message, false, error instanceof Error ? error.message : "DEVBOX_JS_DEBUG_TARGET_FAILED"))
              .finally(() => pendingTargets.delete(message.seq));
            continue;
          }
          // vscode-js-debug's root session can acknowledge launch before its
          // reverse startDebugging target has completed the second DAP
          // connection. DevBox exposes one logical session, so do not report
          // launch as ready until later commands can be routed to that target.
          if (message.type === "response" && ["launch", "attach"].includes(message.command) && !activeTargetSocket) {
            pendingParentLaunchResponses.push(message);
            continue;
          }
          process.stdout.write(encode(message));
        }
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : "DEVBOX_JS_DEBUG_PARENT_PARSE_FAILED"}\n`);
        shutdown(1);
      }
    });
    parentSocket.on("error", (error) => {
      process.stderr.write(`DEVBOX_JS_DEBUG_SOCKET_FAILED:${error.message}\n`);
      shutdown(1);
    });
    parentSocket.on("close", () => shutdown(0));
  };

  server.stdout.on("data", (chunk) => {
    startup += chunk.toString("utf8");
    const match = /Debug server listening at 127\.0\.0\.1:(\d+)/u.exec(startup);
    if (match) connectParent(Number(match[1]));
    if (startup.length > 16_384) startup = startup.slice(-8_192);
  });
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  server.on("error", (error) => {
    process.stderr.write(`DEVBOX_JS_DEBUG_PROCESS_FAILED:${error.message}\n`);
    shutdown(1);
  });
  server.on("exit", (code, signal) => {
    if (!closed) {
      process.stderr.write(`DEVBOX_JS_DEBUG_EXITED:${code ?? "null"}:${signal ?? "null"}\n`);
      shutdown(code ?? 1);
    }
  });

  const startupTimeout = setTimeout(() => {
    if (!connected) {
      process.stderr.write("DEVBOX_JS_DEBUG_START_TIMEOUT\n");
      shutdown(1);
    }
  }, 15_000);
  startupTimeout.unref();

  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));
  process.stdin.on("close", () => shutdown(0));
}
