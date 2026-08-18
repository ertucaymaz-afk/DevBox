import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  SignedRevocationListSchema,
  type MarketplaceRevocationEntry,
  type SignedRevocationList
} from "../../shared/marketplace-contracts.js";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,127}$/u;
const CatalogKeyIdSchema = z.string().regex(SAFE_ID);
const MAX_REVOCATION_LIST_BYTES = 16 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

const CatalogAuthoritySchema = z.object({
  keyId: CatalogKeyIdSchema,
  fingerprintSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  enrolledAt: z.iso.datetime()
}).strict();

const StoredRevocationStateSchema = z.object({
  schemaVersion: z.literal(1),
  list: SignedRevocationListSchema,
  appliedAt: z.iso.datetime()
}).strict();

export type RevocationStatus = {
  state: "NOT_CONFIGURED" | "CURRENT" | "EXPIRED" | "INVALID";
  sequence: number;
  entries: number;
  catalogAuthorities: number;
  expiresAt: string | null;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, nested]) => [key, canonical(nested)])
  );
}

export function revocationListPayload(list: Omit<SignedRevocationList, "signature">): Buffer {
  return Buffer.from(JSON.stringify(canonical(list)), "utf8");
}

function fingerprint(publicKeyPem: string): string {
  const key = createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("CATALOG_KEY_MUST_BE_ED25519");
  return createHash("sha256").update(key.export({ format: "der", type: "spki" })).digest("hex");
}

function keyFileName(keyId: string): string {
  return `${CatalogKeyIdSchema.parse(keyId)}.pem`;
}

function assertCurrent(list: SignedRevocationList, now: Date): void {
  const current = now.getTime();
  if (Date.parse(list.issuedAt) > current + MAX_CLOCK_SKEW_MS) throw new Error("REVOCATION_LIST_ISSUED_IN_FUTURE");
  if (Date.parse(list.expiresAt) <= current) throw new Error("REVOCATION_LIST_EXPIRED");
}

export class RevocationListService {
  readonly #root: string;
  readonly #trustRoot: string;
  readonly #statePath: string;

  public constructor(rootDirectory: string) {
    this.#root = path.resolve(rootDirectory);
    this.#trustRoot = path.join(this.#root, "catalog-authorities");
    this.#statePath = path.join(this.#root, "revocations.json");
  }

  public async enrollCatalogAuthority(keyId: string, publicKeyPem: string): Promise<{ keyId: string; fingerprintSha256: string; enrolledAt: string }> {
    const parsedKeyId = CatalogKeyIdSchema.parse(keyId);
    const fingerprintSha256 = fingerprint(publicKeyPem);
    await mkdir(this.#trustRoot, { recursive: true });
    const pemPath = path.join(this.#trustRoot, keyFileName(parsedKeyId));
    const recordPath = path.join(this.#trustRoot, `${parsedKeyId}.json`);
    const existingPem = await readFile(pemPath, "utf8").catch(() => null);
    if (existingPem !== null && fingerprint(existingPem) !== fingerprintSha256) throw new Error("CATALOG_KEY_CONFLICT");
    if (existingPem === null) await writeFile(pemPath, `${publicKeyPem.trim()}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    const existingRecord = await readFile(recordPath, "utf8")
      .then((value) => CatalogAuthoritySchema.parse(JSON.parse(value) as unknown))
      .catch(() => null);
    const record = existingRecord ?? CatalogAuthoritySchema.parse({ keyId: parsedKeyId, fingerprintSha256, enrolledAt: new Date().toISOString() });
    if (record.fingerprintSha256 !== fingerprintSha256) throw new Error("CATALOG_AUTHORITY_RECORD_CONFLICT");
    if (!existingRecord) await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return record;
  }

  public async apply(input: unknown, now = new Date()): Promise<SignedRevocationList> {
    const encoded = Buffer.from(JSON.stringify(input), "utf8");
    if (encoded.byteLength > MAX_REVOCATION_LIST_BYTES) throw new Error("REVOCATION_LIST_TOO_LARGE");
    const list = SignedRevocationListSchema.parse(input);
    assertCurrent(list, now);
    const publicKeyPem = await readFile(path.join(this.#trustRoot, keyFileName(list.catalogKeyId)), "utf8").catch(() => null);
    if (publicKeyPem === null) throw new Error("REVOCATION_CATALOG_KEY_UNTRUSTED");
    const { signature, ...unsigned } = list;
    const signatureBytes = Buffer.from(signature, "base64");
    if (signatureBytes.byteLength !== 64 || !verify(null, revocationListPayload(unsigned), publicKeyPem, signatureBytes)) {
      throw new Error("REVOCATION_SIGNATURE_INVALID");
    }
    const previous = await this.#readStored().catch((error: unknown) => {
      if (error instanceof Error && error.message === "REVOCATION_STATE_NOT_FOUND") return null;
      throw error;
    });
    if (previous && list.sequence <= previous.list.sequence) throw new Error("REVOCATION_SEQUENCE_ROLLBACK");

    await mkdir(this.#root, { recursive: true });
    const stored = StoredRevocationStateSchema.parse({ schemaVersion: 1, list, appliedAt: now.toISOString() });
    const temporaryPath = `${this.#statePath}.${process.pid}.${Date.now()}.tmp`;
    const backupPath = `${this.#statePath}.bak`;
    await writeFile(temporaryPath, `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    let moved = false;
    try {
      await rm(backupPath, { force: true });
      const current = await readFile(this.#statePath).catch(() => null);
      if (current !== null) {
        await rename(this.#statePath, backupPath);
        moved = true;
      }
      await rename(temporaryPath, this.#statePath);
      await rm(backupPath, { force: true });
    } catch (error) {
      const current = await readFile(this.#statePath).catch(() => null);
      if (current === null && moved) await rename(backupPath, this.#statePath).catch(() => undefined);
      throw error;
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
    return list;
  }

  public async assertAllowed(packageId: string, version: string, publisherKeyId: string, now = new Date()): Promise<void> {
    const state = await this.#readStored().catch((error: unknown) => {
      if (error instanceof Error && error.message === "REVOCATION_STATE_NOT_FOUND") return null;
      throw error;
    });
    if (!state) return;
    assertCurrent(state.list, now);
    const revoked = state.list.entries.find((entry) => this.#matches(entry, packageId, version, publisherKeyId));
    if (revoked) throw new Error(`PACKAGE_${revoked.disposition}:${revoked.reasonCode}`);
  }

  public async status(now = new Date()): Promise<RevocationStatus> {
    const catalogAuthorities = await this.#authorityCount();
    try {
      const stored = await this.#readStored();
      const state = Date.parse(stored.list.expiresAt) <= now.getTime() ? "EXPIRED" as const : "CURRENT" as const;
      return { state, sequence: stored.list.sequence, entries: stored.list.entries.length, catalogAuthorities, expiresAt: stored.list.expiresAt };
    } catch (error) {
      if (error instanceof Error && error.message === "REVOCATION_STATE_NOT_FOUND") {
        return { state: "NOT_CONFIGURED", sequence: 0, entries: 0, catalogAuthorities, expiresAt: null };
      }
      return { state: "INVALID", sequence: 0, entries: 0, catalogAuthorities, expiresAt: null };
    }
  }

  async #readStored(): Promise<z.infer<typeof StoredRevocationStateSchema>> {
    const text = await readFile(this.#statePath, "utf8").catch(() => null);
    if (text === null) throw new Error("REVOCATION_STATE_NOT_FOUND");
    const stored = StoredRevocationStateSchema.parse(JSON.parse(text) as unknown);
    const publicKeyPem = await readFile(path.join(this.#trustRoot, keyFileName(stored.list.catalogKeyId)), "utf8").catch(() => null);
    if (publicKeyPem === null) throw new Error("REVOCATION_CATALOG_KEY_UNTRUSTED");
    const { signature, ...unsigned } = stored.list;
    const signatureBytes = Buffer.from(signature, "base64");
    if (signatureBytes.byteLength !== 64 || !verify(null, revocationListPayload(unsigned), publicKeyPem, signatureBytes)) throw new Error("REVOCATION_SIGNATURE_INVALID");
    return stored;
  }

  async #authorityCount(): Promise<number> {
    const entries = await readdir(this.#trustRoot, { withFileTypes: true }).catch(() => []);
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".pem")).length;
  }

  #matches(entry: MarketplaceRevocationEntry, packageId: string, version: string, publisherKeyId: string): boolean {
    return entry.packageId === packageId
      && (entry.version === "*" || entry.version === version)
      && (entry.publisherKeyId === null || entry.publisherKeyId === publisherKeyId);
  }
}
