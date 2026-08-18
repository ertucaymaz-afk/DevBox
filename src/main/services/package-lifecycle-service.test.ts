import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PackageLifecycleService } from "./package-lifecycle-service.js";
import { signedManifestPayload, type SignedManifest } from "./signed-manifest-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

async function signedPackage(privateKey: KeyObject, version: string, content: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-lifecycle-package-"));
  temporaryDirectories.push(directory);
  await mkdir(path.join(directory, "dist"));
  const artifact = Buffer.from(content, "utf8");
  await writeFile(path.join(directory, "dist", "index.js"), artifact);
  const unsigned = {
    schemaVersion: 1 as const,
    kind: "plugin" as const,
    id: "lifecycle.plugin",
    version,
    publicKeyId: "publisher.lifecycle",
    createdAt: "2026-08-14T00:00:00.000Z",
    entrypoint: "dist/index.js",
    permissions: ["workspace:read"],
    files: [{ path: "dist/index.js", sha256: createHash("sha256").update(artifact).digest("hex"), size: artifact.length }]
  };
  const manifest: SignedManifest = { ...unsigned, signature: sign(null, signedManifestPayload(unsigned), privateKey).toString("base64") };
  await writeFile(path.join(directory, "manifest.devbox.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return directory;
}

describe("signed package lifecycle", () => {
  it("atomically activates, rolls back and repairs to a verified historical package", async () => {
    const lifecycleRoot = await mkdtemp(path.join(os.tmpdir(), "devbox-lifecycle-state-"));
    temporaryDirectories.push(lifecycleRoot);
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const service = new PackageLifecycleService(lifecycleRoot);
    const versionOne = await signedPackage(privateKey, "1.0.0", "export const version = 1;\n");
    const versionTwo = await signedPackage(privateKey, "2.0.0", "export const version = 2;\n");

    await expect(service.install(versionOne)).rejects.toThrow("SIGNED_MANIFEST_KEY_UNTRUSTED");
    const trust = await service.enrollPublisher("publisher.lifecycle", publicPem, "LOCAL_SIDELOAD");
    expect(trust).toMatchObject({ keyId: "publisher.lifecycle", trustClass: "LOCAL_SIDELOAD" });
    expect(trust.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/u);
    const first = await service.install(versionOne);
    const second = await service.install(versionTwo);
    expect((await service.list())[0]).toMatchObject({ version: "2.0.0", publicKeyId: "publisher.lifecycle", trustClass: "LOCAL_SIDELOAD" });

    const rolledBack = await service.rollback("plugin", "lifecycle.plugin");
    expect(rolledBack.version).toBe("1.0.0");

    await writeFile(path.join(rolledBack.directory, "dist", "index.js"), "tampered");
    const repaired = await service.repair("plugin", "lifecycle.plugin");
    expect(repaired.version).toBe("2.0.0");
    expect(repaired.directory).toBe(second.directory);
    expect(first.directory).not.toBe(second.directory);
    await expect(service.status()).resolves.toMatchObject({ trustedPublishers: 1, managedCatalogPublishers: 0, installedPackages: 1, localSideloadPackages: 1, managedCatalogPackages: 0, repairablePackages: 1, auditEvents: 5, auditIntegrity: "VERIFIED" });
  });

  it("rejects conflicting content for an already installed package version and keeps the active artifact immutable", async () => {
    const lifecycleRoot = await mkdtemp(path.join(os.tmpdir(), "devbox-lifecycle-conflict-"));
    temporaryDirectories.push(lifecycleRoot);
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const service = new PackageLifecycleService(lifecycleRoot);
    const original = await signedPackage(privateKey, "1.0.0", "export const version = 1;\n");
    const conflicting = await signedPackage(privateKey, "1.0.0", "export const version = 999;\n");

    await service.enrollPublisher("publisher.lifecycle", publicPem, "LOCAL_SIDELOAD");
    const installed = await service.install(original);
    const before = await service.status();

    await expect(service.install(conflicting)).rejects.toThrow("PACKAGE_VERSION_CONTENT_CONFLICT");
    const active = (await service.list())[0];
    expect(active?.directory).toBe(installed.directory);
    expect(await readFile(path.join(installed.directory, "dist", "index.js"), "utf8")).toBe("export const version = 1;\n");
    const after = await service.status();
    expect(after.auditEvents).toBe(before.auditEvents);
    expect(after.auditIntegrity).toBe("VERIFIED");
  });
});
