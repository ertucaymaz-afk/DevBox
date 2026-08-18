import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { CommandResult } from "../../shared/contracts.js";
import { redactText } from "../security/redaction.js";

const SAFE_ENVIRONMENT_KEYS = new Set([
  "ALLUSERSPROFILE",
  "APPDATA",
  "CHOCOLATEYINSTALL",
  "COMSPEC",
  "DOTNET_ROOT",
  "GIT_CONFIG_NOSYSTEM",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "LANG",
  "LOCALAPPDATA",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATH",
  "PATHEXT",
  "PNPM_HOME",
  "PROCESSOR_ARCHITECTURE",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PSMODULEPATH",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE",
  "WINDIR"
]);

export type CommandRequest = {
  executable: string;
  args: readonly string[];
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  cancellation?: AbortSignal | undefined;
  environment?: Readonly<Record<string, string>>;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  /** Optional bounded stdin payload. It is never included in commandDisplay or audit output. */
  stdinText?: string;
};

type ActiveCommand = {
  cancel: () => void;
  closed: Promise<void>;
};

function sanitizedEnvironment(additional: Readonly<Record<string, string>> | undefined): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && SAFE_ENVIRONMENT_KEYS.has(key.toLocaleUpperCase("en-US"))) {
      result[key] = value;
    }
  }
  for (const [key, value] of Object.entries(additional ?? {})) {
    result[key] = value;
  }
  result.CI = result.CI ?? "1";
  result.NO_COLOR = result.NO_COLOR ?? "1";
  return result;
}

function displayArgument(argument: string): string {
  return /^[A-Za-z0-9_./:=@-]+$/.test(argument) ? argument : JSON.stringify(argument);
}

function terminateProcessTree(child: ReturnType<typeof spawn>): void {
  if (!child.pid) {
    child.kill();
    return;
  }
  if (process.platform === "win32") {
    // Node's child.kill() does not reliably terminate grandchildren on Windows. Codex/Hermes can
    // spawn shells and tool processes, so Durdur/timeouts must tear down the complete process tree.
    try {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        shell: false,
        stdio: "ignore"
      });
      killer.once("error", () => { try { child.kill(); } catch { /* process may already be gone */ } });
      killer.unref();
    } catch {
      try { child.kill(); } catch { /* process may already be gone */ }
    }
    const fallback = setTimeout(() => { try { child.kill(); } catch { /* process may already be gone */ } }, 1_500);
    fallback.unref();
    return;
  }
  try { child.kill("SIGTERM"); } catch { /* process may already be gone */ }
}

export class CommandRunner {
  readonly #active = new Set<ActiveCommand>();
  #closed = false;

  public async run(request: CommandRequest): Promise<CommandResult> {
    if (this.#closed) throw new Error("COMMAND_RUNNER_CLOSED");
    const started = new Date();
    const startedMonotonic = performance.now();
    const timeoutMs = request.timeoutMs ?? 30_000;
    const maxOutputBytes = request.maxOutputBytes ?? 1_048_576;
    const runId = randomUUID();
    const commandDisplay = [request.executable, ...request.args].map(displayArgument).join(" ");

    return await new Promise<CommandResult>((resolve) => {
      let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let truncated = false;
      let stdoutLineBuffer = "";
      let stderrLineBuffer = "";
      let timedOut = false;
      let cancelled = false;
      let finished = false;
      let resolveClosed!: () => void;
      const closed = new Promise<void>((resolveClosedPromise) => {
        resolveClosed = resolveClosedPromise;
      });

      const child = spawn(request.executable, [...request.args], {
        cwd: request.cwd,
        env: sanitizedEnvironment(request.environment),
        shell: false,
        windowsHide: true,
        stdio: [request.stdinText === undefined ? "ignore" : "pipe", "pipe", "pipe"]
      });

      if (request.stdinText !== undefined && child.stdin) {
        const payload = request.stdinText.slice(0, 1_048_576);
        child.stdin.on("error", () => { /* Process exit/result remains authoritative; do not crash on EPIPE. */ });
        child.stdin.end(payload, "utf8");
      }

      const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> => {
        const remaining = maxOutputBytes - stdout.byteLength - stderr.byteLength;
        if (remaining <= 0) {
          truncated = true;
          return current;
        }
        if (chunk.byteLength > remaining) {
          truncated = true;
          return Buffer.concat([current, chunk.subarray(0, remaining)]);
        }
        return Buffer.concat([current, chunk]);
      };

      const streamLines = (current: string, chunk: Buffer<ArrayBufferLike>, listener: ((line: string) => void) | undefined): string => {
        const combined = current + chunk.toString("utf8");
        const parts = combined.split(/\r?\n/u);
        const remainder = parts.pop() ?? "";
        if (listener) {
          for (const line of parts) {
            const safe = redactText(line).slice(0, 8_192);
            if (safe.trim()) listener(safe);
          }
        }
        return remainder.slice(-16_384);
      };

      child.stdout?.on("data", (chunk: Buffer<ArrayBufferLike>) => {
        stdout = append(stdout, chunk);
        stdoutLineBuffer = streamLines(stdoutLineBuffer, chunk, request.onStdoutLine);
      });
      child.stderr?.on("data", (chunk: Buffer<ArrayBufferLike>) => {
        stderr = append(stderr, chunk);
        stderrLineBuffer = streamLines(stderrLineBuffer, chunk, request.onStderrLine);
      });

      const stop = (): void => {
        if (!child.killed) terminateProcessTree(child);
      };
      const active: ActiveCommand = {
        cancel: () => {
          cancelled = true;
          stop();
        },
        closed
      };
      this.#active.add(active);
      const timeout = setTimeout(() => {
        timedOut = true;
        stop();
      }, timeoutMs);
      timeout.unref();

      const onAbort = (): void => {
        cancelled = true;
        stop();
      };
      request.cancellation?.addEventListener("abort", onAbort, { once: true });

      const finish = (exitCode: number | null, signal: NodeJS.Signals | null, spawnError?: Error): void => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        request.cancellation?.removeEventListener("abort", onAbort);
        this.#active.delete(active);
        resolveClosed();
        if (request.onStdoutLine && stdoutLineBuffer.trim()) request.onStdoutLine(redactText(stdoutLineBuffer).slice(0, 8_192));
        if (request.onStderrLine && stderrLineBuffer.trim()) request.onStderrLine(redactText(stderrLineBuffer).slice(0, 8_192));
        const ended = new Date();
        resolve({
          runId,
          commandDisplay,
          cwd: request.cwd,
          exitCode,
          signal,
          stdout: redactText(stdout.toString("utf8")),
          stderr: redactText(`${stderr.toString("utf8")}${spawnError ? `${stderr.byteLength ? "\n" : ""}${spawnError.message}` : ""}`),
          startedAt: started.toISOString(),
          endedAt: ended.toISOString(),
          durationMs: Math.max(0, Math.round(performance.now() - startedMonotonic)),
          timedOut,
          truncated,
          exitReason: spawnError ? "SPAWN_ERROR" : cancelled ? "CANCELLED" : timedOut ? "TIMEOUT" : "EXITED"
        });
      };

      child.on("error", (error) => finish(null, null, error));
      child.on("close", (code, signal) => finish(code, signal));
    });
  }

  public async close(timeoutMs = 5_000): Promise<void> {
    if (this.#closed && this.#active.size === 0) return;
    this.#closed = true;
    const active = [...this.#active];
    for (const command of active) command.cancel();
    if (active.length === 0) return;

    let timeout: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.all(active.map(async (command) => await command.closed)),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      })
    ]);
    if (timeout) clearTimeout(timeout);
  }
}
