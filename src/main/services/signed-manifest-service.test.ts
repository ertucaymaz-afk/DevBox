import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SignedManifestService, signedManifestPayload, type SignedManifest } from "./signed-manifest-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

async function fixture(): Promise<{ directory: string; service: SignedManifestService; manifest: SignedManifest }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-signed-package-"));
  temporaryDirectories.push(directory);
  await mkdir(path.join(directory, "dist"));
  const content = Buffer.from("export const verified = true;\n", "utf8");
  await writeFile(path.join(directory, "dist", "index.js"), content);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const unsigned = {
    schemaVersion: 1 as const,
    kind: "plugin" as const,
    id: "verified.plugin",
    version: "1.0.0",
    publicKeyId: "publisher.test",
    createdAt: "2026-08-14T00:00:00.000Z",
    entrypoint: "dist/index.js",
    permissions: ["workspace:read"],
    files: [{ path: "dist/index.js", sha256: createHash("sha256").update(content).digest("hex"), size: content.length }]
  };
  const manifest: SignedManifest = { ...unsigned, signature: sign(null, signedManifestPayload(unsigned), privateKey).toString("base64") };
  await writeFile(path.join(directory, "manifest.devbox.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const publicPem = publicKey.export({ format: "pem", type: "spki" });
  return { directory, service: new SignedManifestService(new Map([["publisher.test", publicPem]])), manifest };
}

describe("signed manifest service", () => {
  it("verifies Ed25519 signature, declared paths, size and SHA-256", async () => {
    const { directory, service } = await fixture();
    await expect(service.verifyDirectory(directory)).resolves.toMatchObject({ verifiedFiles: 1, totalBytes: 30 });
  });

  it("fails closed when a declared artifact is modified", async () => {
    const { directory, service } = await fixture();
    await writeFile(path.join(directory, "dist", "index.js"), "tampered");
    await expect(service.verifyDirectory(directory)).rejects.toThrow(/SIGNED_PACKAGE_SIZE_MISMATCH|SIGNED_PACKAGE_HASH_MISMATCH/u);
  });

  it("rejects undeclared files instead of leaving an executable smuggling gap", async () => {
    const { directory, service } = await fixture();
    await writeFile(path.join(directory, "undeclared.ps1"), "Write-Output unsafe\n");
    await expect(service.verifyDirectory(directory)).rejects.toThrow("SIGNED_PACKAGE_UNDECLARED_FILE");
  });

  it("verifies a strict v2 plugin manifest without weakening v1", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-signed-plugin-v2-"));
    temporaryDirectories.push(directory);
    await mkdir(path.join(directory, "dist"));
    const content = Buffer.from("export const worker = true;\n", "utf8");
    await writeFile(path.join(directory, "dist", "worker.mjs"), content);
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const unsigned = {
      schemaVersion: 2 as const,
      kind: "plugin" as const,
      id: "verified.plugin.v2",
      name: "Verified Plugin v2",
      version: "2.0.0",
      publisher: { id: "publisher.test", name: "Publisher Test" },
      publicKeyId: "publisher.test",
      createdAt: "2026-08-14T00:00:00.000Z",
      compatibility: { pluginApi: "1.0.0", devbox: ">=0.1.3" },
      permissions: ["workspace:read" as const],
      entrypoints: { worker: "dist/worker.mjs" },
      contributes: { commands: [], views: [], statusItems: [] },
      files: [{ path: "dist/worker.mjs", sha256: createHash("sha256").update(content).digest("hex"), size: content.length }]
    };
    const signature = sign(null, signedManifestPayload(unsigned), privateKey).toString("base64");
    await writeFile(path.join(directory, "manifest.devbox.json"), `${JSON.stringify({ ...unsigned, signature }, null, 2)}\n`);
    const service = new SignedManifestService(new Map([["publisher.test", publicKey.export({ format: "pem", type: "spki" })]]));
    await expect(service.verifyDirectory(directory)).resolves.toMatchObject({ manifest: { schemaVersion: 2, id: "verified.plugin.v2" }, verifiedFiles: 1 });
  });
});
