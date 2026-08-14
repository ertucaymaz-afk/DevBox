import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

export type ProtocolKind = "lsp" | "dap";
export type ProtocolMessage = Record<string, unknown>;

const MAX_PROTOCOL_MESSAGE_BYTES = 8 * 1_048_576;

export class ContentLengthFramer {
  #buffer = Buffer.alloc(0);

  public push(chunk: Buffer): ProtocolMessage[] {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const messages: ProtocolMessage[] = [];
    while (true) {
      const headerEnd = this.#buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = this.#buffer.subarray(0, headerEnd).toString("ascii");
      const lengthHeader = header.split("\r\n").find((line) => line.toLocaleLowerCase("en-US").startsWith("content-length:"));
      if (!lengthHeader) throw new Error("PROTOCOL_CONTENT_LENGTH_MISSING");
      const length = Number(lengthHeader.slice(lengthHeader.indexOf(":") + 1).trim());
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_PROTOCOL_MESSAGE_BYTES) throw new Error("PROTOCOL_CONTENT_LENGTH_INVALID");
      const payloadStart = headerEnd + 4;
      if (this.#buffer.length < payloadStart + length) break;
      const payload = this.#buffer.subarray(payloadStart, payloadStart + length).toString("utf8");
      this.#buffer = this.#buffer.subarray(payloadStart + length);
      const parsed = JSON.parse(payload) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("PROTOCOL_MESSAGE_INVALID");
      messages.push(parsed as ProtocolMessage);
    }
    if (this.#buffer.length > MAX_PROTOCOL_MESSAGE_BYTES + 8_192) throw new Error("PROTOCOL_BUFFER_LIMIT_EXCEEDED");
    return messages;
  }

  public static encode(message: ProtocolMessage): Buffer {
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    if (payload.length > MAX_PROTOCOL_MESSAGE_BYTES) throw new Error("PROTOCOL_MESSAGE_TOO_LARGE");
    return Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "ascii"), payload]);
  }
}

type PendingRequest = {
  resolve: (value: ProtocolMessage) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
};

export class ProtocolSession {
  readonly id = randomUUID();
  readonly kind: ProtocolKind;
  readonly #process: ChildProcessWithoutNullStreams;
  readonly #framer = new ContentLengthFramer();
  readonly #pending = new Map<number, PendingRequest>();
  readonly #listeners = new Set<(message: ProtocolMessage) => void>();
  #sequence = 0;
  #closed = false;

  public constructor(kind: ProtocolKind, executable: string, args: readonly string[], cwd: string, environment: NodeJS.ProcessEnv) {
    this.kind = kind;
    this.#process = spawn(executable, [...args], { cwd, env: environment, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.#process.stdout.on("data", (chunk: Buffer) => {
      try {
        for (const message of this.#framer.push(chunk)) this.#dispatch(message);
      } catch (error) {
        this.close(error instanceof Error ? error : new Error("PROTOCOL_PARSE_FAILED"));
      }
    });
    this.#process.stderr.on("data", (chunk: Buffer) => {
      this.#notify({ type: "stderr", body: chunk.toString("utf8").slice(0, 64_000) });
    });
    this.#process.on("error", (error) => this.close(error));
    this.#process.on("exit", (code, signal) => this.close(new Error(`PROTOCOL_PROCESS_EXITED:${code ?? "null"}:${signal ?? "null"}`)));
  }

  public onMessage(listener: (message: ProtocolMessage) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public async request(method: string, params: unknown, timeoutMs = 30_000): Promise<ProtocolMessage> {
    if (this.#closed) throw new Error("PROTOCOL_SESSION_CLOSED");
    const id = ++this.#sequence;
    const message = this.kind === "lsp"
      ? { jsonrpc: "2.0", id, method, params }
      : { seq: id, type: "request", command: method, arguments: params };
    return await new Promise<ProtocolMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error("PROTOCOL_REQUEST_TIMEOUT"));
      }, timeoutMs);
      timeout.unref();
      this.#pending.set(id, { resolve, reject, timeout });
      this.#process.stdin.write(ContentLengthFramer.encode(message));
    });
  }

  public notify(method: string, params: unknown): void {
    if (this.#closed) throw new Error("PROTOCOL_SESSION_CLOSED");
    const message = this.kind === "lsp"
      ? { jsonrpc: "2.0", method, params }
      : { seq: ++this.#sequence, type: "event", event: method, body: params };
    this.#process.stdin.write(ContentLengthFramer.encode(message));
  }

  public close(reason = new Error("PROTOCOL_SESSION_CLOSED")): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(reason);
    }
    this.#pending.clear();
    this.#listeners.clear();
    if (!this.#process.killed) this.#process.kill();
  }

  #dispatch(message: ProtocolMessage): void {
    const responseId = this.kind === "lsp"
      ? typeof message.id === "number" && ("result" in message || "error" in message) ? message.id : null
      : message.type === "response" && typeof message.request_seq === "number" ? message.request_seq : null;
    if (responseId !== null) {
      const pending = this.#pending.get(responseId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.#pending.delete(responseId);
        if (message.error) pending.reject(new Error("PROTOCOL_REMOTE_ERROR"));
        else pending.resolve(message);
        return;
      }
    }
    this.#notify(message);
  }

  #notify(message: ProtocolMessage): void {
    for (const listener of this.#listeners) listener(message);
  }
}
