import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CommandRunner } from "./command-runner.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe("bounded command runner", () => {
  it("spawns without a shell and records real exit evidence", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-runner-test-"));
    temporaryDirectories.push(directory);
    const result = await new CommandRunner().run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('runner-ok')"],
      cwd: directory
    });

    expect(result.exitReason).toBe("EXITED");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("runner-ok");
    expect(result.commandDisplay).toContain(JSON.stringify(process.execPath));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("supports bounded stdin without exposing it in commandDisplay", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-runner-stdin-test-"));
    temporaryDirectories.push(directory);
    const result = await new CommandRunner().run({
      executable: process.execPath,
      args: ["-e", "process.stdin.setEncoding('utf8'); let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => process.stdout.write(data.toUpperCase()))"],
      cwd: directory,
      stdinText: "devbox-stdin-ok"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("DEVBOX-STDIN-OK");
    expect(result.commandDisplay).not.toContain("devbox-stdin-ok");
  });

  it("redacts secrets and enforces the combined output limit", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-runner-test-"));
    temporaryDirectories.push(directory);
    const result = await new CommandRunner().run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('Bearer unsafe.token-123 ' + 'x'.repeat(500))"],
      cwd: directory,
      maxOutputBytes: 64
    });

    expect(result.stdout).not.toContain("unsafe.token-123");
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(64);
  });

  it("streams redacted stdout and stderr lines while the process is still running", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-runner-stream-test-"));
    temporaryDirectories.push(directory);
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const result = await new CommandRunner().run({
      executable: process.execPath,
      args: ["-e", "console.log('stage-one'); console.error('Bearer secret-token'); setTimeout(() => console.log('stage-two'), 25)"],
      cwd: directory,
      onStdoutLine: (line) => stdoutLines.push(line),
      onStderrLine: (line) => stderrLines.push(line)
    });

    expect(result.exitCode).toBe(0);
    expect(stdoutLines).toEqual(["stage-one", "stage-two"]);
    expect(stderrLines.join(" ")).not.toContain("secret-token");
  });

  it("cancels owned child processes during application shutdown", async () => {
    const runner = new CommandRunner();
    const pending = runner.run({
      executable: process.execPath,
      args: ["-e", "setInterval(() => undefined, 1000)"],
      cwd: process.cwd(),
      timeoutMs: 30_000
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await runner.close();
    const result = await pending;
    expect(result.exitReason).toBe("CANCELLED");
    await expect(runner.run({ executable: process.execPath, args: ["--version"], cwd: process.cwd() })).rejects.toThrow("COMMAND_RUNNER_CLOSED");
  });
});
