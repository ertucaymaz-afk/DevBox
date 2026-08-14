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
});
