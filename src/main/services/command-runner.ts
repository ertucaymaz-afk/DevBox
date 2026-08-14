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
  cancellation?: AbortSignal;
  environment?: Readonly<Record<string, string>>;
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
        stdio: ["ignore", "pipe", "pipe"]
      });

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

      child.stdout.on("data", (chunk: Buffer<ArrayBufferLike>) => {
        stdout = append(stdout, chunk);
      });
      child.stderr.on("data", (chunk: Buffer<ArrayBufferLike>) => {
        stderr = append(stderr, chunk);
      });

      const stop = (): void => {
        if (!child.killed) {
          child.kill();
        }
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
