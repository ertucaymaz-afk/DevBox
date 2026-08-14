import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StateDatabase } from "./database.js";
import { DEFAULT_THEME, SettingsService, settingsForPermissionProfile } from "./settings-service.js";

const cleanup: Array<{ directory: string; database: StateDatabase }> = [];

afterEach(async () => {
  for (const item of cleanup.splice(0)) {
    item.database.close();
    await rm(item.directory, { recursive: true, force: true });
  }
});

async function createService(): Promise<SettingsService> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-settings-"));
  const database = new StateDatabase(path.join(directory, "state.sqlite"));
  cleanup.push({ directory, database });
  return new SettingsService(database);
}

describe("settings and portable themes", () => {
  it("persists policy changes and round-trips a data-only theme manifest", async () => {
    const service = await createService();
    expect(service.get()).toMatchObject(settingsForPermissionProfile("Onaylı"));
    expect(service.patch({ networkAccess: false, theme: { accent: "#abcdef" } })).toMatchObject({
      ...settingsForPermissionProfile("Onaylı"),
      theme: { accent: "#abcdef" }
    });
    const portable = service.exportTheme();
    expect(portable.startsWith("devbox-theme-v1:")).toBe(true);
    service.patch({ theme: { accent: "#111111" } });
    expect(service.importTheme(portable).theme.accent).toBe("#abcdef");
  });

  it("maps each permission label to one atomic, truthful policy tuple", async () => {
    const service = await createService();
    expect(service.patch({ permissionProfile: "Salt okunur" })).toMatchObject({
      permissionProfile: "Salt okunur",
      approvalPolicy: "always",
      sandboxPolicy: "workspace-write",
      networkAccess: true
    });
    expect(service.patch({ permissionProfile: "Onaylı" })).toMatchObject({
      permissionProfile: "Onaylı",
      approvalPolicy: "on-request",
      sandboxPolicy: "workspace-write",
      networkAccess: true
    });
    expect(service.patch({ permissionProfile: "Tam erişim" })).toMatchObject({
      permissionProfile: "Tam erişim",
      approvalPolicy: "never",
      sandboxPolicy: "full-access",
      networkAccess: true
    });
  });

  it("accepts catalog-compatible data but rejects code and invalid colors", async () => {
    const service = await createService();
    const compatible = `codex-theme-v1:${Buffer.from(JSON.stringify({ name: "Catalog", theme: { accent: "#aabbcc" }, codeThemeId: "safe" })).toString("base64url")}`;
    expect(service.importTheme(compatible).theme).toMatchObject({ name: "Catalog", accent: "#aabbcc", codeThemeId: "safe" });
    expect(() => service.importTheme("codex-theme-v1:javascript:alert(1)")).toThrow("THEME_PAYLOAD_INVALID");
    const invalid = `devbox-theme-v1:${Buffer.from(JSON.stringify({ ...DEFAULT_THEME, accent: "url(javascript:evil)" })).toString("base64url")}`;
    expect(() => service.importTheme(invalid)).toThrow();
  });
});
