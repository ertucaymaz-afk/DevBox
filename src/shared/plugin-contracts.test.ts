import { describe, expect, it } from "vitest";
import { PluginCommandEnvelopeSchema, PluginManifestV2Schema, PluginRegistryRecordSchema } from "./plugin-contracts.js";

const manifest = {
  schemaVersion: 2 as const,
  kind: "plugin" as const,
  id: "devbox.example",
  name: "DevBox Example",
  version: "1.2.3",
  publisher: { id: "yaaertu", name: "yaaertu", homepage: "https://github.com/yaaertu" },
  publicKeyId: "yaaertu.release",
  createdAt: "2026-08-14T00:00:00.000Z",
  compatibility: { pluginApi: "1.0.0", devbox: ">=0.1.3" },
  permissions: ["workspace:read" as const],
  entrypoints: { worker: "dist/worker.mjs" },
  contributes: { commands: [{ id: "devbox.example.run", title: "Çalıştır" }], views: [], statusItems: [] },
  files: [{ path: "dist/worker.mjs", sha256: "a".repeat(64), size: 12 }],
  signature: "a".repeat(64)
};

describe("plugin contract v2", () => {
  it("accepts a strict signed manifest with explicit compatibility and permissions", () => {
    expect(PluginManifestV2Schema.parse(manifest)).toMatchObject({ id: "devbox.example", schemaVersion: 2 });
  });

  it("rejects path traversal, unknown permissions and undeclared properties", () => {
    expect(() => PluginManifestV2Schema.parse({ ...manifest, entrypoints: { worker: "../outside.mjs" } })).toThrow();
    expect(() => PluginManifestV2Schema.parse({ ...manifest, permissions: ["filesystem:everything"] })).toThrow();
    expect(() => PluginManifestV2Schema.parse({ ...manifest, injectIntoElectronMain: true })).toThrow();
  });

  it("requires command capabilities to be carried in the authenticated envelope", () => {
    const envelope = {
      protocolVersion: 1 as const,
      requestId: "3f1dc6e2-b277-4e90-8b27-2103134778c6",
      pluginId: "devbox.example",
      command: "devbox.example.run",
      issuedAt: "2026-08-14T00:00:00.000Z",
      payload: {},
      grantedPermissions: ["workspace:read" as const]
    };
    expect(PluginCommandEnvelopeSchema.parse(envelope)).toMatchObject({ pluginId: "devbox.example" });
    expect(() => PluginCommandEnvelopeSchema.parse({ ...envelope, grantedPermissions: ["secrets:all"] })).toThrow();
  });

  it("keeps install, permission and runtime state separate in registry records", () => {
    expect(PluginRegistryRecordSchema.parse({
      pluginId: "devbox.example",
      version: "1.2.3",
      installRoot: "C:\\DevBox\\plugins\\devbox.example",
      state: "GRANT_PENDING",
      requestedPermissions: ["workspace:read"],
      grantedPermissions: [],
      health: { checkedAt: null, consecutiveFailures: 0, lastError: null },
      installedAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z"
    })).toMatchObject({ state: "GRANT_PENDING", grantedPermissions: [] });
  });
});
