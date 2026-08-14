import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CommandResult } from "../../shared/contracts.js";
import { CommandRunner, type CommandRequest } from "./command-runner.js";
import { SshTrustService } from "./ssh-trust-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

function result(request: CommandRequest, stdout: string): CommandResult {
  const timestamp = new Date().toISOString();
  return {
    runId: "ssh-trust-test",
    commandDisplay: request.executable,
    cwd: request.cwd,
    exitCode: 0,
    signal: null,
    stdout,
    stderr: "",
    startedAt: timestamp,
    endedAt: timestamp,
    durationMs: 1,
    timedOut: false,
    truncated: false,
    exitReason: "EXITED"
  };
}

class SshCommandRunner extends CommandRunner {
  public override async run(request: CommandRequest): Promise<CommandResult> {
    if (request.executable === "ssh-keyscan") {
      return result(request, "[example.com]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKeyMaterial==\n");
    }
    if (request.executable === "ssh-keygen") {
      return result(request, "256 SHA256:devbox-test-fingerprint [example.com]:2222 (ED25519)\n");
    }
    throw new Error(`UNEXPECTED_COMMAND:${request.executable}`);
  }
}

describe("SSH trust service", () => {
  it("scans, pins, audits and rejects a changed known-host key", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-ssh-trust-"));
    temporaryDirectories.push(root);
    const service = new SshTrustService(root, new SshCommandRunner());

    const candidate = await service.scan("deploy@example.com:2222", process.cwd());
    expect(candidate).toMatchObject({ host: "example.com", port: 2222 });
    expect(candidate.fingerprint).toContain("SHA256:devbox-test-fingerprint");

    const pin = await service.pinCandidate(candidate);
    expect(pin.knownHostsPath).toMatch(/\.known_hosts$/u);
    await expect(service.list()).resolves.toEqual([pin]);

    await expect(service.pinCandidate({
      ...candidate,
      knownHostsContent: "[example.com]:2222 ssh-ed25519 AAAAC3NzaChangedKeyMaterial==\n"
    })).rejects.toThrow("SSH_HOST_KEY_CHANGED");
  });
});
