import { createHash, createPublicKey, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SignedManifestSchema, SignedManifestService, type VerifiedPackage } from "./signed-manifest-service.js";
import { AuditLogService } from "./audit-log-service.js";
import { RevocationListService, type RevocationStatus } from "./revocation-list-service.js";

const PackageKindSchema = z.enum(["plugin", "mcp", "toolkit", "update"]);
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/u;
const TrustKeyIdSchema = z.string().regex(SAFE_ID_PATTERN);
const MAX_MANIFEST_BYTES = 256 * 1024;
const PackageTrustClassSchema = z.enum(["LOCAL_SIDELOAD", "MANAGED_SIGNED_CATALOG"]);

const PublisherTrustRecordSchema = z.object({
  keyId: TrustKeyIdSchema,
  fingerprintSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  trustClass: PackageTrustClassSchema,
  enrolledAt: z.iso.datetime()
}).strict();

const PackagePointerSchema = z.object({
  kind: PackageKindSchema,
  id: z.string().regex(SAFE_ID_PATTERN),
  version: z.string().min(1).max(64),
  publicKeyId: TrustKeyIdSchema,
  trustClass: PackageTrustClassSchema.default("LOCAL_SIDELOAD"),
  directory: z.string().min(1).max(32_768),
  activatedAt: z.iso.datetime()
}).strict();

const ActivationStateSchema = z.object({
  schemaVersion: z.literal(1),
  active: PackagePointerSchema.nullable(),
  history: z.array(PackagePointerSchema).max(20)
}).strict();

export type PackagePointer = z.infer<typeof PackagePointerSchema>;
export type PackageTrustClass = z.infer<typeof PackageTrustClassSchema>;
export type PublisherTrustRecord = z.infer<typeof PublisherTrustRecordSchema>;
export type PackageLifecycleStatus = {
  trustedPublishers: number;
  managedCatalogPublishers: number;
  installedPackages: number;
  localSideloadPackages: number;
  managedCatalogPackages: number;
  activeUpdates: number;
  repairablePackages: number;
  auditEvents: number;
  auditIntegrity: "VERIFIED" | "FAILED";
  revocations: RevocationStatus;
};

function versionDirectory(version: string): string {
  return `v-${createHash("sha256").update(version, "utf8").digest("hex").slice(0, 20)}`;
}

function assertContained(root: string, candidate: string): string {
  const absolute = path.resolve(candidate);
  const relation = path.relative(root, absolute);
  if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) throw new Error("PACKAGE_LIFECYCLE_PATH_OUTSIDE_ROOT");
  return absolute;
}

function publisherFileName(keyId: string): string {
  return `${TrustKeyIdSchema.parse(keyId)}.pem`;
}

function publisherRecordFileName(keyId: string): string {
  return `${TrustKeyIdSchema.parse(keyId)}.trust.json`;
}

function publicKeyFingerprint(publicKeyPem: string): string {
  const key = createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("PUBLISHER_KEY_MUST_BE_ED25519");
  return createHash("sha256").update(key.export({ format: "der", type: "spki" })).digest("hex");
}

function objectHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export class PackageLifecycleService {
  readonly #root: string;
  readonly #packagesRoot: string;
  readonly #stateRoot: string;
  readonly #trustRoot: string;
  readonly #audit: AuditLogService;
  readonly #revocations: RevocationListService;

  public constructor(rootDirectory: string) {
    this.#root = path.resolve(rootDirectory);
    this.#packagesRoot = path.join(this.#root, "packages");
    this.#stateRoot = path.join(this.#root, "activation");
    this.#trustRoot = path.join(this.#root, "trust");
    this.#audit = new AuditLogService(path.join(this.#root, "audit", "package-events.jsonl"));
    this.#revocations = new RevocationListService(path.join(this.#root, "marketplace"));
  }

  public revocations(): RevocationListService {
    return this.#revocations;
  }

  public async inspectCandidate(sourceDirectory: string, publicKeyPem: string): Promise<VerifiedPackage> {
    const rootPath = await realpath(sourceDirectory);
    const manifestPath = path.join(rootPath, "manifest.devbox.json");
    const stat = await lstat(manifestPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MANIFEST_BYTES) throw new Error("SIGNED_MANIFEST_FILE_INVALID");
    const manifest = SignedManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
    return await new SignedManifestService(new Map([[manifest.publicKeyId, publicKeyPem]])).verifyDirectory(rootPath);
  }

  public publisherFingerprint(publicKeyPem: string): string {
    return publicKeyFingerprint(publicKeyPem);
  }

  public async enrollPublisher(keyId: string, publicKeyPem: string, trustClass: PackageTrustClass = "LOCAL_SIDELOAD"): Promise<PublisherTrustRecord> {
    await this.#ensureRoots();
    const parsedKeyId = TrustKeyIdSchema.parse(keyId);
    const parsedTrustClass = PackageTrustClassSchema.parse(trustClass);
    const fingerprintSha256 = publicKeyFingerprint(publicKeyPem);
    const trustPath = assertContained(this.#trustRoot, path.join(this.#trustRoot, publisherFileName(parsedKeyId)));
    const recordPath = assertContained(this.#trustRoot, path.join(this.#trustRoot, publisherRecordFileName(parsedKeyId)));
    const existing = await readFile(trustPath, "utf8").catch(() => null);
    if (existing !== null && publicKeyFingerprint(existing) !== fingerprintSha256) throw new Error("PUBLISHER_KEY_CONFLICT");
    const record = PublisherTrustRecordSchema.parse({ keyId: parsedKeyId, fingerprintSha256, trustClass: parsedTrustClass, enrolledAt: new Date().toISOString() });
    if (existing === null) await writeFile(trustPath, `${publicKeyPem.trim()}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    const priorRecord = await readFile(recordPath, "utf8").then((value) => PublisherTrustRecordSchema.parse(JSON.parse(value) as unknown)).catch(() => null);
    if (priorRecord && priorRecord.trustClass !== record.trustClass) throw new Error("PUBLISHER_TRUST_CLASS_CONFLICT");
    if (!priorRecord) await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    const enrolled = priorRecord ?? record;
    if (!priorRecord) await this.#audit.append({ actorId: "local-user", actorRole: "OWNER", action: "publisher.enroll", targetType: "publisher", targetId: parsedKeyId, beforeHash: null, afterHash: fingerprintSha256, artifactSha256: null, correlationId: randomUUID() });
    return enrolled;
  }

  public async install(sourceDirectory: string): Promise<PackagePointer> {
    await this.#ensureRoots();
    const candidate = await (await this.#verifier()).verifyDirectory(await realpath(sourceDirectory));
    const trust = await this.#publisherTrust(candidate.manifest.publicKeyId);
    if (!trust) throw new Error("PUBLISHER_KEY_NOT_ENROLLED");
    await this.#revocations.assertAllowed(candidate.manifest.id, candidate.manifest.version, candidate.manifest.publicKeyId);

    const kindRoot = path.join(this.#packagesRoot, candidate.manifest.kind, candidate.manifest.id);
    await mkdir(kindRoot, { recursive: true });
    const finalDirectory = assertContained(this.#packagesRoot, path.join(kindRoot, versionDirectory(candidate.manifest.version)));
    const stagingDirectory = assertContained(this.#packagesRoot, path.join(kindRoot, `.staging-${randomUUID()}`));
    try {
      await cp(candidate.rootPath, stagingDirectory, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
      const verifier = await this.#verifier();
      const staged = await verifier.verifyDirectory(stagingDirectory);
      if (staged.manifest.id !== candidate.manifest.id || staged.manifest.version !== candidate.manifest.version || staged.manifest.kind !== candidate.manifest.kind) {
        throw new Error("SIGNED_PACKAGE_IDENTITY_CHANGED");
      }
      try {
        await rename(stagingDirectory, finalDirectory);
      } catch (error) {
        const existing = await lstat(finalDirectory).catch(() => null);
        if (!existing?.isDirectory()) throw error;
        await verifier.verifyDirectory(finalDirectory);
      }
    } finally {
      await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    }

    const pointer: PackagePointer = PackagePointerSchema.parse({
      kind: candidate.manifest.kind,
      id: candidate.manifest.id,
      version: candidate.manifest.version,
      publicKeyId: candidate.manifest.publicKeyId,
      trustClass: trust.trustClass,
      directory: finalDirectory,
      activatedAt: new Date().toISOString()
    });
    const state = await this.#readState(pointer.kind, pointer.id);
    const history = state.active && state.active.directory !== pointer.directory
      ? [state.active, ...state.history.filter((item) => item.directory !== state.active?.directory)].slice(0, 20)
      : state.history;
    await this.#writeState(pointer.kind, pointer.id, { schemaVersion: 1, active: pointer, history });
    await this.#audit.append({
      actorId: "local-user",
      actorRole: "OWNER",
      action: "package.install",
      targetType: pointer.kind,
      targetId: `${pointer.id}/${pointer.version}`,
      beforeHash: state.active ? objectHash(state.active) : null,
      afterHash: objectHash(pointer),
      artifactSha256: createHash("sha256").update(await readFile(candidate.manifestPath)).digest("hex"),
      correlationId: randomUUID()
    });
    return pointer;
  }

  public async list(): Promise<PackagePointer[]> {
    await this.#ensureRoots();
    const pointers: PackagePointer[] = [];
    for (const kindEntry of await readdir(this.#stateRoot, { withFileTypes: true })) {
      if (!kindEntry.isDirectory() || !PackageKindSchema.safeParse(kindEntry.name).success) continue;
      const kindDirectory = path.join(this.#stateRoot, kindEntry.name);
      for (const stateEntry of await readdir(kindDirectory, { withFileTypes: true })) {
        if (!stateEntry.isFile() || !stateEntry.name.endsWith(".json")) continue;
        const id = stateEntry.name.slice(0, -5);
        if (!SAFE_ID_PATTERN.test(id)) continue;
        const state = await this.#readState(PackageKindSchema.parse(kindEntry.name), id);
        if (state.active) pointers.push(state.active);
      }
    }
    return pointers.sort((left, right) => `${left.kind}/${left.id}`.localeCompare(`${right.kind}/${right.id}`, "en"));
  }

  public async rollback(kind: z.infer<typeof PackageKindSchema>, id: string): Promise<PackagePointer> {
    const parsedKind = PackageKindSchema.parse(kind);
    const parsedId = TrustKeyIdSchema.parse(id);
    const verifier = await this.#verifier();
    const state = await this.#readState(parsedKind, parsedId);
    const previous = state.history[0];
    if (!state.active || !previous) throw new Error("PACKAGE_ROLLBACK_NOT_AVAILABLE");
    await this.#revocations.assertAllowed(previous.id, previous.version, previous.publicKeyId);
    await verifier.verifyDirectory(assertContained(this.#packagesRoot, previous.directory));
    const restored = { ...previous, activatedAt: new Date().toISOString() };
    await this.#writeState(parsedKind, parsedId, {
      schemaVersion: 1,
      active: restored,
      history: [state.active, ...state.history.slice(1).filter((item) => item.directory !== state.active?.directory)].slice(0, 20)
    });
    const parsed = PackagePointerSchema.parse(restored);
    await this.#audit.append({ actorId: "local-user", actorRole: "OWNER", action: "package.rollback", targetType: parsedKind, targetId: `${parsedId}/${parsed.version}`, beforeHash: objectHash(state.active), afterHash: objectHash(parsed), artifactSha256: null, correlationId: randomUUID() });
    return parsed;
  }

  public async repair(kind: z.infer<typeof PackageKindSchema>, id: string): Promise<PackagePointer> {
    const parsedKind = PackageKindSchema.parse(kind);
    const parsedId = TrustKeyIdSchema.parse(id);
    const state = await this.#readState(parsedKind, parsedId);
    if (!state.active) throw new Error("PACKAGE_ACTIVE_VERSION_NOT_FOUND");
    const verifier = await this.#verifier();
    try {
      await this.#revocations.assertAllowed(state.active.id, state.active.version, state.active.publicKeyId);
      await verifier.verifyDirectory(assertContained(this.#packagesRoot, state.active.directory));
      await this.#audit.append({ actorId: "local-user", actorRole: "OWNER", action: "package.repair.verify", targetType: parsedKind, targetId: `${parsedId}/${state.active.version}`, beforeHash: objectHash(state.active), afterHash: objectHash(state.active), artifactSha256: null, correlationId: randomUUID() });
      return state.active;
    } catch {
      let recoverable: PackagePointer | undefined;
      for (const pointer of state.history) {
        try {
          await this.#revocations.assertAllowed(pointer.id, pointer.version, pointer.publicKeyId);
          await verifier.verifyDirectory(assertContained(this.#packagesRoot, pointer.directory));
          recoverable = pointer;
          break;
        } catch { /* Try the next signed historical version. */ }
      }
      if (!recoverable) throw new Error("PACKAGE_REPAIR_SOURCE_NOT_AVAILABLE");
      await verifier.verifyDirectory(assertContained(this.#packagesRoot, recoverable.directory));
      const restored = { ...recoverable, activatedAt: new Date().toISOString() };
      await this.#writeState(parsedKind, parsedId, { schemaVersion: 1, active: restored, history: state.history.filter((item) => item.directory !== recoverable.directory).slice(0, 20) });
      const parsed = PackagePointerSchema.parse(restored);
      await this.#audit.append({ actorId: "local-user", actorRole: "OWNER", action: "package.repair.restore", targetType: parsedKind, targetId: `${parsedId}/${parsed.version}`, beforeHash: objectHash(state.active), afterHash: objectHash(parsed), artifactSha256: null, correlationId: randomUUID() });
      return parsed;
    }
  }

  public async status(): Promise<PackageLifecycleStatus> {
    await this.#ensureRoots();
    const [publishers, installed, revocations] = await Promise.all([
      this.#publisherTrustRecords(),
      this.list(),
      this.#revocations.status()
    ]);
    const audit = await this.#audit.listAndVerify().then((events) => ({ integrity: "VERIFIED" as const, events: events.length })).catch(() => ({ integrity: "FAILED" as const, events: 0 }));
    return {
      trustedPublishers: publishers.length,
      managedCatalogPublishers: publishers.filter((item) => item.trustClass === "MANAGED_SIGNED_CATALOG").length,
      installedPackages: installed.length,
      localSideloadPackages: installed.filter((item) => item.trustClass === "LOCAL_SIDELOAD").length,
      managedCatalogPackages: installed.filter((item) => item.trustClass === "MANAGED_SIGNED_CATALOG").length,
      activeUpdates: installed.filter((item) => item.kind === "update").length,
      repairablePackages: installed.length,
      auditEvents: audit.events,
      auditIntegrity: audit.integrity,
      revocations
    };
  }

  async #ensureRoots(): Promise<void> {
    await Promise.all([
      mkdir(this.#packagesRoot, { recursive: true }),
      mkdir(this.#stateRoot, { recursive: true }),
      mkdir(this.#trustRoot, { recursive: true })
    ]);
  }

  async #publisherTrust(keyId: string): Promise<PublisherTrustRecord | null> {
    const parsedKeyId = TrustKeyIdSchema.parse(keyId);
    const trustPath = assertContained(this.#trustRoot, path.join(this.#trustRoot, publisherFileName(parsedKeyId)));
    const publicKeyPem = await readFile(trustPath, "utf8").catch(() => null);
    if (publicKeyPem === null) return null;
    const recordPath = assertContained(this.#trustRoot, path.join(this.#trustRoot, publisherRecordFileName(parsedKeyId)));
    const recordText = await readFile(recordPath, "utf8").catch(() => null);
    if (recordText !== null) return PublisherTrustRecordSchema.parse(JSON.parse(recordText) as unknown);
    return PublisherTrustRecordSchema.parse({
      keyId: parsedKeyId,
      fingerprintSha256: publicKeyFingerprint(publicKeyPem),
      trustClass: "LOCAL_SIDELOAD",
      enrolledAt: new Date(0).toISOString()
    });
  }

  async #publisherTrustRecords(): Promise<PublisherTrustRecord[]> {
    await this.#ensureRoots();
    const records: PublisherTrustRecord[] = [];
    for (const entry of await readdir(this.#trustRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".pem")) continue;
      const keyId = entry.name.slice(0, -4);
      if (!TrustKeyIdSchema.safeParse(keyId).success) continue;
      const record = await this.#publisherTrust(keyId);
      if (record) records.push(record);
    }
    return records;
  }

  async #verifier(): Promise<SignedManifestService> {
    await this.#ensureRoots();
    const keys = new Map<string, string>();
    for (const entry of await readdir(this.#trustRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".pem")) continue;
      const keyId = entry.name.slice(0, -4);
      if (!TrustKeyIdSchema.safeParse(keyId).success) continue;
      keys.set(keyId, await readFile(path.join(this.#trustRoot, entry.name), "utf8"));
    }
    return new SignedManifestService(keys);
  }

  #statePath(kind: z.infer<typeof PackageKindSchema>, id: string): string {
    const parsedKind = PackageKindSchema.parse(kind);
    const parsedId = TrustKeyIdSchema.parse(id);
    return assertContained(this.#stateRoot, path.join(this.#stateRoot, parsedKind, `${parsedId}.json`));
  }

  async #readState(kind: z.infer<typeof PackageKindSchema>, id: string): Promise<z.infer<typeof ActivationStateSchema>> {
    const statePath = this.#statePath(kind, id);
    const backupPath = assertContained(this.#stateRoot, `${statePath}.bak`);
    let content = await readFile(statePath, "utf8").catch(() => null);
    if (content === null) {
      const backup = await readFile(backupPath, "utf8").catch(() => null);
      if (backup !== null) {
        await rename(backupPath, statePath);
        content = backup;
      }
    }
    if (content === null) return { schemaVersion: 1, active: null, history: [] };
    const parsed = ActivationStateSchema.parse(JSON.parse(content) as unknown);
    if (parsed.active) assertContained(this.#packagesRoot, parsed.active.directory);
    for (const pointer of parsed.history) assertContained(this.#packagesRoot, pointer.directory);
    return parsed;
  }

  async #writeState(kind: z.infer<typeof PackageKindSchema>, id: string, state: z.input<typeof ActivationStateSchema>): Promise<void> {
    const parsed = ActivationStateSchema.parse(state);
    const statePath = this.#statePath(kind, id);
    await mkdir(path.dirname(statePath), { recursive: true });
    const temporaryPath = assertContained(this.#stateRoot, `${statePath}.${randomUUID()}.tmp`);
    const backupPath = assertContained(this.#stateRoot, `${statePath}.bak`);
    await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    let previousStateMoved = false;
    try {
      await rm(backupPath, { force: true });
      const current = await lstat(statePath).catch(() => null);
      if (current) {
        await rename(statePath, backupPath);
        previousStateMoved = true;
      }
      await rename(temporaryPath, statePath);
      await rm(backupPath, { force: true });
    } catch (error) {
      const current = await lstat(statePath).catch(() => null);
      if (!current && previousStateMoved) await rename(backupPath, statePath).catch(() => undefined);
      throw error;
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}
