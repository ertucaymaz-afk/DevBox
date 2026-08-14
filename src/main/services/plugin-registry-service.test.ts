import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginRegistryService } from "./plugin-registry-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe("plugin registry", () => {
  it("persists installation, explicit grants and guarded lifecycle transitions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-plugin-registry-"));
    temporaryDirectories.push(root);
    const file = path.join(root, "registry.json");
    const registry = new PluginRegistryService(file);
    await registry.recordInstalled({ pluginId: "devbox.example", version: "1.0.0", installRoot: path.join(root, "plugin"), requestedPermissions: ["workspace:read"] });
    await registry.setPermissions("devbox.example", ["workspace:read"]);
    await registry.transition("devbox.example", "STARTING");
    await registry.transition("devbox.example", "RUNNING");
    const reloaded = new PluginRegistryService(file);
    await expect(reloaded.list()).resolves.toMatchObject([{ pluginId: "devbox.example", state: "RUNNING", grantedPermissions: ["workspace:read"] }]);
  });

  it("rejects undeclared grants and impossible state jumps", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-plugin-registry-"));
    temporaryDirectories.push(root);
    const registry = new PluginRegistryService(path.join(root, "registry.json"));
    await registry.recordInstalled({ pluginId: "devbox.example", version: "1.0.0", installRoot: path.join(root, "plugin"), requestedPermissions: ["workspace:read"] });
    await expect(registry.setPermissions("devbox.example", ["network:connect"])).rejects.toThrow("PLUGIN_PERMISSION_NOT_REQUESTED");
    await expect(registry.transition("devbox.example", "RUNNING")).rejects.toThrow("PLUGIN_STATE_TRANSITION_FORBIDDEN");
  });
});
