import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { CommandRunner } from "./command-runner.js";

const HostPinSchema = z.object({
  schemaVersion: z.literal(1),
  target: z.string().min(1).max(320),
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65_535),
  fingerprint: z.string().min(16).max(512),
  knownHostsPath: z.string().min(1).max(32_768),
  pinnedAt: z.iso.datetime()
}).strict();

export type HostPin = z.infer<typeof HostPinSchema>;
export type HostKeyCandidate = {
  target: string;
  host: string;
  port: number;
  fingerprint: string;
  knownHostsContent: string;
};

function parseTarget(value: string): { target: string; host: string; port: number } {
  const trimmed = value.trim();
  const withoutUser = trimmed.includes("@") ? trimmed.slice(trimmed.lastIndexOf("@") + 1) : trimmed;
  const bracketed = /^\[([0-9A-Fa-f:]+)\](?::(\d{1,5}))?$/u.exec(withoutUser);
  const named = /^([A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)(?::(\d{1,5}))?$/u.exec(withoutUser);
  const match = bracketed ?? named;
  if (!match) throw new Error("SSH_TARGET_INVALID");
  const port = match[2] ? Number(match[2]) : 22;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("SSH_PORT_INVALID");
  return { target: trimmed, host: match[1]!, port };
}

function hostId(host: string, port: number): string {
  return createHash("sha256").update(`${host.toLocaleLowerCase("en-US")}:${port}`, "utf8").digest("hex");
}

export class SshTrustService {
  readonly #root: string;
  readonly #runner: CommandRunner;

  public constructor(rootDirectory: string, runner: CommandRunner) {
    this.#root = path.resolve(rootDirectory);
    this.#runner = runner;
  }

  public async pin(targetValue: string, cwd: string): Promise<HostPin> {
    return await this.pinCandidate(await this.scan(targetValue, cwd));
  }

  public async scan(targetValue: string, cwd: string): Promise<HostKeyCandidate> {
    const target = parseTarget(targetValue);
    await mkdir(this.#root, { recursive: true });
    const scan = await this.#runner.run({
      executable: "ssh-keyscan",
      args: ["-T", "8", "-p", String(target.port), target.host],
      cwd,
      timeoutMs: 12_000,
      maxOutputBytes: 256 * 1024
    });
    if (scan.exitCode !== 0) throw new Error(`SSH_KEYSCAN_FAILED:${scan.stderr || scan.exitReason}`);
    const keyLines = scan.stdout.split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    if (keyLines.length === 0 || keyLines.length > 32 || keyLines.some((line) => !/^(?:\[[^\]]+\]:\d+|[^\s]+)\s+(?:ssh-|ecdsa-)[^\s]+\s+[A-Za-z0-9+/=]+$/u.test(line))) {
      throw new Error("SSH_KEYSCAN_OUTPUT_INVALID");
    }
    const normalizedKeys = `${[...new Set(keyLines)].sort().join("\n")}\n`;
    const id = hostId(target.host, target.port);
    const temporaryPath = path.join(this.#root, `.${id}.${randomUUID()}.scan.tmp`);
    await writeFile(temporaryPath, normalizedKeys, { encoding: "utf8", flag: "wx", mode: 0o600 });
    try {
      const fingerprintResult = await this.#runner.run({ executable: "ssh-keygen", args: ["-lf", temporaryPath, "-E", "sha256"], cwd, timeoutMs: 10_000, maxOutputBytes: 128 * 1024 });
      if (fingerprintResult.exitCode !== 0 || !fingerprintResult.stdout.includes("SHA256:")) throw new Error("SSH_FINGERPRINT_FAILED");
      return { ...target, fingerprint: fingerprintResult.stdout.trim(), knownHostsContent: normalizedKeys };
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  public async pinCandidate(candidate: HostKeyCandidate): Promise<HostPin> {
    const target = parseTarget(candidate.target);
    if (target.host !== candidate.host || target.port !== candidate.port || !candidate.fingerprint.includes("SHA256:") || !candidate.knownHostsContent.trim()) {
      throw new Error("SSH_HOST_KEY_CANDIDATE_INVALID");
    }
    await mkdir(this.#root, { recursive: true });
    const id = hostId(target.host, target.port);
    const knownHostsPath = path.join(this.#root, `${id}.known_hosts`);
    const metadataPath = path.join(this.#root, `${id}.json`);
    const existing = await readFile(knownHostsPath, "utf8").catch(() => null);
    if (existing !== null && existing !== candidate.knownHostsContent) throw new Error("SSH_HOST_KEY_CHANGED");
    if (existing === null) {
      const keyTemporary = path.join(this.#root, `.${id}.${randomUUID()}.known-hosts.tmp`);
      await writeFile(keyTemporary, candidate.knownHostsContent, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(keyTemporary, knownHostsPath);
    }
    const pin = HostPinSchema.parse({
      schemaVersion: 1,
      target: target.target,
      host: target.host,
      port: target.port,
      fingerprint: candidate.fingerprint,
      knownHostsPath,
      pinnedAt: new Date().toISOString()
    });
    const metadataTemporary = path.join(this.#root, `.${id}.${randomUUID()}.json.tmp`);
    await writeFile(metadataTemporary, `${JSON.stringify(pin, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rm(metadataPath, { force: true });
    await rename(metadataTemporary, metadataPath);
    return pin;
  }

  public async list(): Promise<HostPin[]> {
    await mkdir(this.#root, { recursive: true });
    const pins: HostPin[] = [];
    for (const entry of await readdir(this.#root, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/u.test(entry.name)) continue;
      const pin = HostPinSchema.parse(JSON.parse(await readFile(path.join(this.#root, entry.name), "utf8")) as unknown);
      const knownHosts = await readFile(pin.knownHostsPath, "utf8");
      if (!knownHosts.trim()) throw new Error("SSH_PIN_FILE_EMPTY");
      pins.push(pin);
    }
    return pins.sort((left, right) => `${left.host}:${left.port}`.localeCompare(`${right.host}:${right.port}`, "en"));
  }
}
