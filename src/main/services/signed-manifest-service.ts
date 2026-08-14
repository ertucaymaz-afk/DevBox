import { createHash, verify as verifySignature } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PluginManifestV2Schema, type PluginManifestV2 } from "../../shared/plugin-contracts.js";

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/u;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_FILE_BYTES = 300 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 1_024 * 1024 * 1024;

export const SignedManifestV1Schema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(["plugin", "mcp", "toolkit", "update"]),
  id: z.string().regex(SAFE_ID_PATTERN),
  version: z.string().min(1).max(64),
  publicKeyId: z.string().regex(SAFE_ID_PATTERN),
  createdAt: z.iso.datetime(),
  entrypoint: z.string().min(1).max(512).optional(),
  permissions: z.array(z.string().min(1).max(128)).max(128),
  files: z.array(z.object({
    path: z.string().min(1).max(512),
    sha256: z.string().regex(HASH_PATTERN),
    size: z.number().int().min(0).max(MAX_FILE_BYTES)
  }).strict()).min(1).max(10_000),
  signature: z.string().min(40).max(1024)
}).strict();

export const SignedManifestSchema = z.discriminatedUnion("schemaVersion", [SignedManifestV1Schema, PluginManifestV2Schema]);
export type SignedManifestV1 = z.infer<typeof SignedManifestV1Schema>;
export type SignedManifest = SignedManifestV1 | PluginManifestV2;
export type VerifiedPackage = {
  manifest: SignedManifest;
  manifestPath: string;
  rootPath: string;
  totalBytes: number;
  verifiedFiles: number;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([key, nested]) => [key, canonicalize(nested)]));
}

export function signedManifestPayload(manifest: Omit<SignedManifestV1, "signature"> | Omit<PluginManifestV2, "signature"> | SignedManifest): Buffer {
  const { signature: _signature, ...payload } = manifest as SignedManifest;
  return Buffer.from(JSON.stringify(canonicalize(payload)), "utf8");
}

function resolveContained(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath) || relativePath.includes("\0")) throw new Error("SIGNED_PACKAGE_PATH_INVALID");
  const normalized = relativePath.replaceAll("/", path.sep);
  const target = path.resolve(root, normalized);
  const relation = path.relative(root, target);
  if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) throw new Error("SIGNED_PACKAGE_PATH_OUTSIDE_ROOT");
  return target;
}

async function inventoryPackage(rootPath: string, currentPath = rootPath): Promise<string[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink()) throw new Error("SIGNED_PACKAGE_SYMLINK_FORBIDDEN");
    if (stat.isDirectory()) files.push(...await inventoryPackage(rootPath, absolutePath));
    else if (stat.isFile()) files.push(path.relative(rootPath, absolutePath).replaceAll(path.sep, "/"));
    else throw new Error("SIGNED_PACKAGE_ENTRY_TYPE_FORBIDDEN");
    if (files.length > 10_001) throw new Error("SIGNED_PACKAGE_FILE_COUNT_EXCEEDED");
  }
  return files;
}

export class SignedManifestService {
  readonly #trustedKeys: ReadonlyMap<string, string | Buffer>;

  public constructor(trustedKeys: ReadonlyMap<string, string | Buffer>) {
    this.#trustedKeys = trustedKeys;
  }

  public async verifyDirectory(rootDirectory: string, manifestName = "manifest.devbox.json"): Promise<VerifiedPackage> {
    const rootPath = await realpath(rootDirectory);
    const manifestPath = resolveContained(rootPath, manifestName);
    const manifestStat = await lstat(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > MAX_MANIFEST_BYTES) throw new Error("SIGNED_MANIFEST_FILE_INVALID");
    const manifest = SignedManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
    const trustedKey = this.#trustedKeys.get(manifest.publicKeyId);
    if (!trustedKey) throw new Error("SIGNED_MANIFEST_KEY_UNTRUSTED");
    const signature = Buffer.from(manifest.signature, "base64");
    if (!verifySignature(null, signedManifestPayload(manifest), trustedKey, signature)) throw new Error("SIGNED_MANIFEST_SIGNATURE_INVALID");

    const seen = new Set<string>();
    let totalBytes = 0;
    for (const file of manifest.files) {
      const comparisonKey = file.path.replaceAll("\\", "/").toLocaleLowerCase("en-US");
      if (seen.has(comparisonKey)) throw new Error("SIGNED_PACKAGE_PATH_DUPLICATE");
      seen.add(comparisonKey);
      const requestedPath = resolveContained(rootPath, file.path);
      const stat = await lstat(requestedPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("SIGNED_PACKAGE_FILE_INVALID");
      const canonicalPath = await realpath(requestedPath);
      const relation = path.relative(rootPath, canonicalPath);
      if (relation.startsWith("..") || path.isAbsolute(relation)) throw new Error("SIGNED_PACKAGE_SYMLINK_ESCAPE");
      if (stat.size !== file.size || stat.size > MAX_FILE_BYTES) throw new Error("SIGNED_PACKAGE_SIZE_MISMATCH");
      totalBytes += stat.size;
      if (totalBytes > MAX_PACKAGE_BYTES) throw new Error("SIGNED_PACKAGE_TOTAL_SIZE_EXCEEDED");
      const digest = createHash("sha256").update(await readFile(canonicalPath)).digest("hex");
      if (digest !== file.sha256) throw new Error("SIGNED_PACKAGE_HASH_MISMATCH");
    }

    const entrypoints = manifest.schemaVersion === 1
      ? [manifest.entrypoint].filter((value): value is string => Boolean(value))
      : Object.values(manifest.entrypoints).filter((value): value is string => Boolean(value));
    for (const entrypoint of entrypoints) {
      if (!seen.has(entrypoint.replaceAll("\\", "/").toLocaleLowerCase("en-US"))) throw new Error("SIGNED_PACKAGE_ENTRYPOINT_UNDECLARED");
    }
    const inventory = await inventoryPackage(rootPath);
    const unexpected = inventory.find((relativePath) => relativePath.toLocaleLowerCase("en-US") !== manifestName.toLocaleLowerCase("en-US")
      && !seen.has(relativePath.toLocaleLowerCase("en-US")));
    if (unexpected) throw new Error(`SIGNED_PACKAGE_UNDECLARED_FILE:${unexpected}`);
    if (inventory.length !== manifest.files.length + 1) throw new Error("SIGNED_PACKAGE_INVENTORY_MISMATCH");
    return { manifest, manifestPath, rootPath, totalBytes, verifiedFiles: manifest.files.length };
  }
}
