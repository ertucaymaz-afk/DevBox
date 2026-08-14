import { z } from "zod";

const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const SAFE_RELATIVE_PATH_PATTERN = /^(?![A-Za-z]:)(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))(?!.*\0).{1,512}$/u;

export const PluginPermissionSchema = z.enum([
  "workspace:read",
  "workspace:write",
  "network:connect",
  "process:spawn",
  "clipboard:read",
  "clipboard:write",
  "notifications:show",
  "secrets:read",
  "git:read",
  "git:write"
]);
export type PluginPermission = z.infer<typeof PluginPermissionSchema>;

export const PluginRuntimeStateSchema = z.enum([
  "DISCOVERED",
  "VERIFIED",
  "INSTALLED",
  "GRANT_PENDING",
  "ENABLED",
  "STARTING",
  "RUNNING",
  "DEGRADED",
  "CRASHED",
  "DISABLED",
  "QUARANTINED",
  "UPDATE_PENDING",
  "ROLLBACK_REQUIRED"
]);
export type PluginRuntimeState = z.infer<typeof PluginRuntimeStateSchema>;

export const PluginFileIntegritySchema = z.object({
  path: z.string().regex(SAFE_RELATIVE_PATH_PATTERN),
  sha256: z.string().regex(HASH_PATTERN),
  size: z.number().int().min(0).max(300 * 1024 * 1024)
}).strict();

export const PluginManifestV2Schema = z.object({
  schemaVersion: z.literal(2),
  kind: z.literal("plugin"),
  id: z.string().regex(SAFE_ID_PATTERN),
  name: z.string().min(1).max(160),
  version: z.string().regex(SEMVER_PATTERN),
  publisher: z.object({
    id: z.string().regex(SAFE_ID_PATTERN),
    name: z.string().min(1).max(160),
    homepage: z.url().optional()
  }).strict(),
  publicKeyId: z.string().regex(SAFE_ID_PATTERN),
  createdAt: z.iso.datetime(),
  compatibility: z.object({
    pluginApi: z.string().regex(SEMVER_PATTERN),
    devbox: z.string().min(1).max(80)
  }).strict(),
  permissions: z.array(PluginPermissionSchema).max(64).superRefine((items, context) => {
    if (new Set(items).size !== items.length) context.addIssue({ code: "custom", message: "PLUGIN_PERMISSION_DUPLICATE" });
  }),
  entrypoints: z.object({
    worker: z.string().regex(SAFE_RELATIVE_PATH_PATTERN).optional(),
    ui: z.string().regex(SAFE_RELATIVE_PATH_PATTERN).optional(),
    companion: z.string().regex(SAFE_RELATIVE_PATH_PATTERN).optional()
  }).strict().refine((value) => Boolean(value.worker || value.ui || value.companion), "PLUGIN_ENTRYPOINT_REQUIRED"),
  contributes: z.object({
    commands: z.array(z.object({ id: z.string().regex(SAFE_ID_PATTERN), title: z.string().min(1).max(120) }).strict()).max(128).default([]),
    views: z.array(z.object({ id: z.string().regex(SAFE_ID_PATTERN), title: z.string().min(1).max(120), slot: z.enum(["sidebar", "editor", "inspector", "status"]) }).strict()).max(32).default([]),
    statusItems: z.array(z.object({ id: z.string().regex(SAFE_ID_PATTERN), title: z.string().min(1).max(120) }).strict()).max(32).default([])
  }).strict(),
  files: z.array(PluginFileIntegritySchema).min(1).max(10_000),
  signature: z.string().min(40).max(1024)
}).strict();
export type PluginManifestV2 = z.infer<typeof PluginManifestV2Schema>;

export const PluginCommandEnvelopeSchema = z.object({
  protocolVersion: z.literal(1),
  requestId: z.uuid(),
  pluginId: z.string().regex(SAFE_ID_PATTERN),
  command: z.string().regex(SAFE_ID_PATTERN),
  issuedAt: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()),
  grantedPermissions: z.array(PluginPermissionSchema)
}).strict();

export const PluginEventEnvelopeSchema = z.object({
  protocolVersion: z.literal(1),
  eventId: z.uuid(),
  pluginId: z.string().regex(SAFE_ID_PATTERN),
  event: z.string().regex(SAFE_ID_PATTERN),
  occurredAt: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown())
}).strict();

export const PluginRegistryRecordSchema = z.object({
  pluginId: z.string().regex(SAFE_ID_PATTERN),
  version: z.string().regex(SEMVER_PATTERN),
  installRoot: z.string().min(1),
  state: PluginRuntimeStateSchema,
  requestedPermissions: z.array(PluginPermissionSchema),
  grantedPermissions: z.array(PluginPermissionSchema),
  health: z.object({
    checkedAt: z.iso.datetime().nullable(),
    consecutiveFailures: z.number().int().nonnegative(),
    lastError: z.string().nullable()
  }).strict(),
  installedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
}).strict();
export type PluginRegistryRecord = z.infer<typeof PluginRegistryRecordSchema>;
