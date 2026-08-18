import { z } from "zod";

export const RemixRotaConnectionStateSchema = z.enum(["UNCONFIGURED", "DISCOVERED", "CONNECTING", "READY", "DEGRADED", "FAILED"]);
export type RemixRotaConnectionState = z.infer<typeof RemixRotaConnectionStateSchema>;

export const RemixRotaDiscoverySchema = z.object({
  schemaVersion: z.literal(1),
  serviceId: z.literal("com.remixrota.player"),
  serviceVersion: z.string().min(1).max(64),
  protocol: z.object({ major: z.literal(1), minor: z.number().int().nonnegative().max(99) }).strict(),
  transport: z.literal("windows-named-pipe"),
  pipeName: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/u),
  currentUserOnly: z.literal(true),
  processId: z.number().int().positive(),
  executablePath: z.string().min(1).max(32_768),
  integrationAssetDirectory: z.string().min(1).max(32_768),
  startedAt: z.string().datetime()
}).strict();
export type RemixRotaDiscovery = z.infer<typeof RemixRotaDiscoverySchema>;

export const RemixRotaCapabilitySchema = z.enum(["player.read", "player.control", "library.read", "library.search", "app.visibility"]);
export type RemixRotaCapability = z.infer<typeof RemixRotaCapabilitySchema>;

export const RemixRotaCommandSchema = z.enum([
  "service.getInfo",
  "player.getSnapshot",
  "player.toggle",
  "player.play",
  "player.pause",
  "player.playTrack",
  "player.previous",
  "player.next",
  "player.setVolume",
  "player.seek",
  "player.jump",
  "player.toggleFavorite",
  "library.getQueue",
  "library.getView",
  "library.search",
  "app.show",
  "app.hide"
]);
export type RemixRotaCommand = z.infer<typeof RemixRotaCommandSchema>;

const RemixRotaJsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string().max(32_768),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(RemixRotaJsonValueSchema).max(10_000),
  z.record(z.string().max(256), RemixRotaJsonValueSchema)
]));

export const RemixRotaInvokeInputSchema = z.object({
  command: RemixRotaCommandSchema,
  arguments: z.record(z.string().max(128), RemixRotaJsonValueSchema).default({})
}).strict();
export type RemixRotaInvokeInput = z.infer<typeof RemixRotaInvokeInputSchema>;

export const RemixRotaTrackSchema = z.object({
  id: z.string().max(512).nullable(),
  title: z.string().max(1_000),
  artist: z.string().max(1_000),
  album: z.string().max(1_000).nullable(),
  durationSeconds: z.number().finite().nonnegative().nullable(),
  artworkUrl: z.string().max(8_192).nullable(),
  favorite: z.boolean().nullable()
}).strict();
export type RemixRotaTrack = z.infer<typeof RemixRotaTrackSchema>;

export const RemixRotaPlayerSnapshotSchema = z.object({
  playbackState: z.enum(["PLAYING", "PAUSED", "STOPPED", "BUFFERING", "UNKNOWN"]),
  current: RemixRotaTrackSchema.nullable(),
  positionSeconds: z.number().finite().nonnegative(),
  volume: z.number().finite().min(0).max(1),
  muted: z.boolean(),
  queueLength: z.number().int().nonnegative(),
  repeatMode: z.string().max(64).nullable(),
  shuffle: z.boolean().nullable(),
  updatedAt: z.string().datetime()
}).strict();
export type RemixRotaPlayerSnapshot = z.infer<typeof RemixRotaPlayerSnapshotSchema>;

export const RemixRotaStatusSchema = z.object({
  state: RemixRotaConnectionStateSchema,
  detail: z.string().min(1).max(2_000),
  configuredExecutable: z.string().max(32_768).nullable(),
  discovery: RemixRotaDiscoverySchema.nullable(),
  grantedCapabilities: z.array(RemixRotaCapabilitySchema).max(16),
  player: RemixRotaPlayerSnapshotSchema.nullable(),
  lastConnectedAt: z.string().datetime().nullable(),
  lastEventAt: z.string().datetime().nullable(),
  lastError: z.string().max(2_000).nullable()
}).strict();
export type RemixRotaStatus = z.infer<typeof RemixRotaStatusSchema>;

export const RemixRotaCommandResultSchema = z.object({
  command: RemixRotaCommandSchema,
  result: RemixRotaJsonValueSchema,
  durationMs: z.number().int().nonnegative()
}).strict();
export type RemixRotaCommandResult = z.infer<typeof RemixRotaCommandResultSchema>;

export const RemixRotaEventSchema = z.object({
  type: z.string().min(1).max(160),
  payload: RemixRotaJsonValueSchema,
  receivedAt: z.string().datetime()
}).strict();
export type RemixRotaEvent = z.infer<typeof RemixRotaEventSchema>;
