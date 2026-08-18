import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SignedRevocationList } from "../../shared/marketplace-contracts.js";
import { RevocationListService, revocationListPayload } from "./revocation-list-service.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

describe("signed marketplace revocation list", () => {
  it("verifies Ed25519, rejects sequence rollback and blocks an affected package", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-revocations-"));
    roots.push(root);
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const service = new RevocationListService(root);
    await service.enrollCatalogAuthority("catalog.root", publicKey.export({ format: "pem", type: "spki" }).toString());
    const unsigned = {
      schemaVersion: 1 as const,
      sequence: 1,
      catalogKeyId: "catalog.root",
      issuedAt: "2026-08-14T00:00:00.000Z",
      expiresAt: "2026-08-15T00:00:00.000Z",
      entries: [{
        packageId: "dangerous.plugin",
        version: "*" as const,
        publisherKeyId: "publisher.bad",
        disposition: "REVOKED" as const,
        reasonCode: "MALWARE" as const,
        publicMessage: "Doğrulanmış zararlı davranış nedeniyle iptal edildi.",
        effectiveAt: "2026-08-14T00:00:00.000Z"
      }]
    };
    const list: SignedRevocationList = { ...unsigned, signature: sign(null, revocationListPayload(unsigned), privateKey).toString("base64") };
    await expect(service.apply(list, new Date("2026-08-14T01:00:00.000Z"))).resolves.toMatchObject({ sequence: 1 });
    await expect(service.apply(list, new Date("2026-08-14T01:00:00.000Z"))).rejects.toThrow("REVOCATION_SEQUENCE_ROLLBACK");
    await expect(service.assertAllowed("dangerous.plugin", "2.0.0", "publisher.bad", new Date("2026-08-14T02:00:00.000Z"))).rejects.toThrow("PACKAGE_REVOKED:MALWARE");
    await expect(service.assertAllowed("safe.plugin", "2.0.0", "publisher.good", new Date("2026-08-14T02:00:00.000Z"))).resolves.toBeUndefined();
    await expect(service.status(new Date("2026-08-14T02:00:00.000Z"))).resolves.toMatchObject({ state: "CURRENT", sequence: 1, entries: 1, catalogAuthorities: 1 });

    const statePath = path.join(root, "revocations.json");
    const tampered = (await readFile(statePath, "utf8")).replace("dangerous.plugin", "changed.plugin");
    await writeFile(statePath, tampered, "utf8");
    await expect(service.status(new Date("2026-08-14T02:00:00.000Z"))).resolves.toMatchObject({ state: "INVALID" });
  });
});
