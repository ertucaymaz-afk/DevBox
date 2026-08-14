import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { spawn, type IPty } from "node-pty";
import type { TerminalEvent, TerminalSummary } from "../../shared/contracts.js";

type TerminalRecord = {
  process: IPty;
  summary: TerminalSummary;
};

const SAFE_TERMINAL_ENV_KEYS = new Set([
  "ALLUSERSPROFILE", "APPDATA", "CHOCOLATEYINSTALL", "COMSPEC", "DOTNET_ROOT", "HOME", "HOMEDRIVE",
  "HOMEPATH", "LANG", "LOCALAPPDATA", "NUMBER_OF_PROCESSORS", "OS", "PATH", "PATHEXT", "PNPM_HOME",
  "PROCESSOR_ARCHITECTURE", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PSMODULEPATH", "SYSTEMDRIVE",
  "SYSTEMROOT", "TEMP", "TMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR", "WT_SESSION", "WT_PROFILE_ID"
]);

function safeEnvironment(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && SAFE_TERMINAL_ENV_KEYS.has(key.toLocaleUpperCase("en-US"))) result[key] = value;
  }
  result.TERM = "xterm-256color";
  result.COLORTERM = "truecolor";
  return result;
}

function executableOnPath(name: string): string | null {
  const pathValue = process.env.PATH ?? "";
  for (const directory of pathValue.split(delimiter)) {
    const candidate = join(directory, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveShell(preference: "pwsh" | "powershell" | "cmd"): { executable: string; args: string[] } {
  if (preference === "pwsh") {
    const pwsh = executableOnPath("pwsh.exe") ?? executableOnPath("pwsh");
    if (pwsh) return { executable: pwsh, args: ["-NoLogo"] };
  }
  if (preference !== "cmd") {
    const powershell = executableOnPath("powershell.exe") ?? "powershell.exe";
    return { executable: powershell, args: ["-NoLogo"] };
  }
  return { executable: process.env.COMSPEC ?? "cmd.exe", args: [] };
}

export class TerminalService {
  readonly #terminals = new Map<string, TerminalRecord>();
  readonly #emit: (event: TerminalEvent) => void;

  public constructor(emit: (event: TerminalEvent) => void) {
    this.#emit = emit;
  }

  public list(projectId?: string): TerminalSummary[] {
    return [...this.#terminals.values()]
      .map((record) => record.summary)
      .filter((summary) => !projectId || summary.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  public start(projectId: string, cwd: string, preference: "pwsh" | "powershell" | "cmd", cols: number, rows: number): TerminalSummary {
    const shell = resolveShell(preference);
    const id = randomUUID();
    const ptyProcess = spawn(shell.executable, shell.args, {
      name: "xterm-256color",
      cwd,
      cols,
      rows,
      env: safeEnvironment(),
      useConpty: globalThis.process.platform === "win32",
      handleFlowControl: true
    });
    const summary: TerminalSummary = {
      id,
      projectId,
      cwd,
      shell: shell.executable,
      pid: ptyProcess.pid,
      cols,
      rows,
      state: "RUNNING",
      exitCode: null,
      createdAt: new Date().toISOString()
    };
    this.#terminals.set(id, { process: ptyProcess, summary });
    ptyProcess.onData((data) => {
      for (let offset = 0; offset < data.length; offset += 1_048_576) {
        this.#emit({ kind: "data", terminalId: id, data: data.slice(offset, offset + 1_048_576) });
      }
    });
    ptyProcess.onExit(({ exitCode, signal }) => {
      const record = this.#terminals.get(id);
      if (record) record.summary = { ...record.summary, state: "EXITED", exitCode };
      this.#emit({ kind: "exit", terminalId: id, exitCode, signal: signal ?? null });
    });
    return summary;
  }

  public write(id: string, data: string): void {
    const record = this.#running(id);
    record.process.write(data);
  }

  public resize(id: string, cols: number, rows: number): TerminalSummary {
    const record = this.#running(id);
    record.process.resize(cols, rows);
    record.summary = { ...record.summary, cols, rows };
    return record.summary;
  }

  public kill(id: string): void {
    const record = this.#terminals.get(id);
    if (!record) return;
    if (record.summary.state === "RUNNING") record.process.kill();
    this.#terminals.delete(id);
  }

  public close(): void {
    for (const id of [...this.#terminals.keys()]) this.kill(id);
  }

  #running(id: string): TerminalRecord {
    const record = this.#terminals.get(id);
    if (!record) throw new Error("TERMINAL_NOT_FOUND");
    if (record.summary.state !== "RUNNING") throw new Error("TERMINAL_EXITED");
    return record;
  }
}
