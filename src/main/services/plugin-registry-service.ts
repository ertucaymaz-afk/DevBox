import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  PluginPermissionSchema,
  PluginRegistryRecordSchema,
  PluginRuntimeStateSchema,
  type PluginPermission,
  type PluginRegistryRecord,
  type PluginRuntimeState
} from "../../shared/plugin-contracts.js";

const RegistryFileSchema = z.object({
  schemaVersion: z.literal(1),
  records: z.array(PluginRegistryRecordSchema)
}).strict();

const ALLOWED_TRANSITIONS: Readonly<Record<PluginRuntimeState, readonly PluginRuntimeState[]>> = {
  DISCOVERED: ["VERIFIED", "QUARANTINED"],
  VERIFIED: ["INSTALLED", "QUARANTINED"],
  INSTALLED: ["GRANT_PENDING", "ENABLED", "DISABLED", "UPDATE_PENDING", "QUARANTINED"],
  GRANT_PENDING: ["ENABLED", "DISABLED", "QUARANTINED"],
  ENABLED: ["STARTING", "DISABLED", "UPDATE_PENDING", "QUARANTINED"],
  STARTING: ["RUNNING", "CRASHED", "DEGRADED", "DISABLED"],
  RUNNING: ["DEGRADED", "CRASHED", "DISABLED", "UPDATE_PENDING", "QUARANTINED"],
  DEGRADED: ["RUNNING", "CRASHED", "DISABLED", "UPDATE_PENDING", "QUARANTINED"],
  CRASHED: ["STARTING", "DISABLED", "ROLLBACK_REQUIRED", "QUARANTINED"],
  DISABLED: ["ENABLED", "UPDATE_PENDING", "QUARANTINED"],
  QUARANTINED: ["DISABLED"],
  UPDATE_PENDING: ["INSTALLED", "ROLLBACK_REQUIRED", "DISABLED"],
  ROLLBACK_REQUIRED: ["INSTALLED", "DISABLED", "QUARANTINED"]
};

type InstalledPluginInput = {
  pluginId: string;
  version: string;
  installRoot: string;
  requestedPermissions?: readonly PluginPermission[];
};

export class PluginRegistryService {
  readonly #filePath: string;
  #writeQueue: Promise<void> = Promise.resolve();

  public constructor(filePath: string) {
    this.#filePath = path.resolve(filePath);
  }

  async #read(): Promise<PluginRegistryRecord[]> {
    if (!existsSync(this.#filePath)) return [];
    const parsed = RegistryFileSchema.parse(JSON.parse(await readFile(this.#filePath, "utf8")) as unknown);
    return parsed.records;
  }

  async #write(records: PluginRegistryRecord[]): Promise<void> {
    const operation = this.#writeQueue.then(async () => {
      await mkdir(path.dirname(this.#filePath), { recursive: true });
      const temporary = `${this.#filePath}.tmp-${process.pid}-${Date.now()}`;
      const backup = `${this.#filePath}.bak-${process.pid}-${Date.now()}`;
      await writeFile(temporary, `${JSON.stringify(RegistryFileSchema.parse({ schemaVersion: 1, records }), null, 2)}\n`, "utf8");
      const hadPrevious = existsSync(this.#filePath);
      try {
        if (hadPrevious) await rename(this.#filePath, backup);
        await rename(temporary, this.#filePath);
      } catch (error) {
        await rm(this.#filePath, { force: true }).catch(() => undefined);
        if (hadPrevious && existsSync(backup)) await rename(backup, this.#filePath);
        throw error;
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined);
        await rm(backup, { force: true }).catch(() => undefined);
      }
    });
    this.#writeQueue = operation.catch(() => undefined);
    await operation;
  }

  public async list(): Promise<PluginRegistryRecord[]> {
    await this.#writeQueue;
    return await this.#read();
  }

  public async recordInstalled(input: InstalledPluginInput): Promise<PluginRegistryRecord> {
    const records = await this.recordInstalledBatch([input]);
    const record = records.find((item) => item.pluginId === input.pluginId);
    if (!record) throw new Error("PLUGIN_REGISTRY_WRITE_FAILED");
    return record;
  }

  public async recordInstalledBatch(inputs: readonly InstalledPluginInput[]): Promise<PluginRegistryRecord[]> {
    const records = await this.list();
    const now = new Date().toISOString();
    const unique = new Map<string, InstalledPluginInput>();
    for (const input of inputs) {
      if (unique.has(input.pluginId)) throw new Error(`PLUGIN_REGISTRY_DUPLICATE:${input.pluginId}`);
      unique.set(input.pluginId, input);
    }
    const installed = [...unique.values()].map((input) => {
      const requestedPermissions = z.array(PluginPermissionSchema).parse(input.requestedPermissions ?? []);
      const previous = records.find((record) => record.pluginId === input.pluginId);
      return PluginRegistryRecordSchema.parse({
        pluginId: input.pluginId,
        version: input.version,
        installRoot: path.resolve(input.installRoot),
        state: "INSTALLED",
        requestedPermissions,
        grantedPermissions: previous?.version === input.version ? previous.grantedPermissions.filter((permission) => requestedPermissions.includes(permission)) : [],
        health: { checkedAt: now, consecutiveFailures: 0, lastError: null },
        installedAt: previous?.installedAt ?? now,
        updatedAt: now
      });
    });
    const installedIds = new Set(installed.map((record) => record.pluginId));
    const next = [...records.filter((record) => !installedIds.has(record.pluginId)), ...installed]
      .sort((left, right) => left.pluginId.localeCompare(right.pluginId, "en"));
    await this.#write(next);
    return installed;
  }

  public async setPermissions(pluginId: string, permissions: readonly PluginPermission[]): Promise<PluginRegistryRecord> {
    const records = await this.list();
    const current = records.find((record) => record.pluginId === pluginId);
    if (!current) throw new Error("PLUGIN_REGISTRY_NOT_FOUND");
    const grantedPermissions = z.array(PluginPermissionSchema).parse(permissions);
    if (grantedPermissions.some((permission) => !current.requestedPermissions.includes(permission))) throw new Error("PLUGIN_PERMISSION_NOT_REQUESTED");
    const next = PluginRegistryRecordSchema.parse({ ...current, grantedPermissions, state: "ENABLED", updatedAt: new Date().toISOString() });
    await this.#write(records.map((record) => record.pluginId === pluginId ? next : record));
    return next;
  }

  public async transition(pluginId: string, requestedState: PluginRuntimeState, lastError: string | null = null): Promise<PluginRegistryRecord> {
    const targetState = PluginRuntimeStateSchema.parse(requestedState);
    const records = await this.list();
    const current = records.find((record) => record.pluginId === pluginId);
    if (!current) throw new Error("PLUGIN_REGISTRY_NOT_FOUND");
    if (targetState !== current.state && !ALLOWED_TRANSITIONS[current.state].includes(targetState)) throw new Error(`PLUGIN_STATE_TRANSITION_FORBIDDEN:${current.state}:${targetState}`);
    const failed = ["DEGRADED", "CRASHED", "QUARANTINED", "ROLLBACK_REQUIRED"].includes(targetState);
    const next = PluginRegistryRecordSchema.parse({
      ...current,
      state: targetState,
      health: {
        checkedAt: new Date().toISOString(),
        consecutiveFailures: failed ? current.health.consecutiveFailures + 1 : 0,
        lastError: failed ? lastError ?? "PLUGIN_RUNTIME_FAILURE" : null
      },
      updatedAt: new Date().toISOString()
    });
    await this.#write(records.map((record) => record.pluginId === pluginId ? next : record));
    return next;
  }
}
