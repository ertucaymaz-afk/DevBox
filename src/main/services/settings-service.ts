import { AppSettingsSchema, DevBoxThemeSchema, type AppSettings, type DevBoxTheme, type PermissionProfile } from "../../shared/contracts.js";
import type { StateDatabase } from "./database.js";

const SETTINGS_KEY = "app.settings.v1";

type SettingsPatch = {
  [K in Exclude<keyof AppSettings, "theme">]?: AppSettings[K] | undefined;
} & { theme?: { [K in keyof DevBoxTheme]?: DevBoxTheme[K] | undefined } | undefined };

export const DEFAULT_THEME: DevBoxTheme = {
  version: 1,
  name: "DevBox Obsidyen",
  base: "dark",
  accent: "#d7d7d7",
  surface: "#101111",
  ink: "#f2f2f2",
  sidebar: "#171817",
  panel: "#191a19",
  border: "#353635",
  muted: "#8f8f8f",
  success: "#63c174",
  warning: "#d7a45d",
  danger: "#e16d72",
  uiFont: "Segoe UI Variable Text",
  codeFont: "Cascadia Code",
  codeThemeId: "devbox-obsidian",
  contrast: "normal"
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: DEFAULT_THEME,
  permissionProfile: "Onaylı",
  approvalPolicy: "on-request",
  sandboxPolicy: "workspace-write",
  networkAccess: true,
  reduceMotion: false,
  terminalShell: "pwsh"
};

export function settingsForPermissionProfile(profile: PermissionProfile): Pick<AppSettings, "permissionProfile" | "approvalPolicy" | "sandboxPolicy" | "networkAccess"> {
  if (profile === "Tam erişim") {
    return { permissionProfile: profile, approvalPolicy: "never", sandboxPolicy: "full-access", networkAccess: true };
  }
  if (profile === "Salt okunur") {
    // The user-facing profile is "Onay iste": a write/network/process action is
    // permitted only after its native confirmation dialog succeeds. Keeping the
    // workspace policy writable is intentional; a read-only sandbox would make
    // the approval button misleading because the approved action could never run.
    return { permissionProfile: profile, approvalPolicy: "always", sandboxPolicy: "workspace-write", networkAccess: true };
  }
  return { permissionProfile: profile, approvalPolicy: "on-request", sandboxPolicy: "workspace-write", networkAccess: true };
}

function normalizePolicy(settings: AppSettings): AppSettings {
  return AppSettingsSchema.parse({ ...settings, ...settingsForPermissionProfile(settings.permissionProfile) });
}

function decodePortablePayload(portable: string): unknown {
  const prefixes = ["devbox-theme-v1:", "codex-theme-v1:"];
  const prefix = prefixes.find((candidate) => portable.startsWith(candidate));
  if (!prefix) throw new Error("THEME_PREFIX_UNSUPPORTED");
  const payload = portable.slice(prefix.length).trim();
  if (!payload) throw new Error("THEME_PAYLOAD_EMPTY");
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    try {
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    } catch {
      throw new Error("THEME_PAYLOAD_INVALID");
    }
  }
}

function normalizeImportedTheme(raw: unknown): DevBoxTheme {
  const direct = DevBoxThemeSchema.safeParse(raw);
  if (direct.success) return direct.data;
  if (!raw || typeof raw !== "object") throw new Error("THEME_SCHEMA_INVALID");
  const source = raw as Record<string, unknown>;
  const nested = source.theme && typeof source.theme === "object" ? source.theme as Record<string, unknown> : source;
  return DevBoxThemeSchema.parse({
    ...DEFAULT_THEME,
    name: typeof source.name === "string" ? source.name : DEFAULT_THEME.name,
    accent: nested.accent ?? DEFAULT_THEME.accent,
    surface: nested.surface ?? DEFAULT_THEME.surface,
    ink: nested.ink ?? DEFAULT_THEME.ink,
    sidebar: nested.sidebar ?? DEFAULT_THEME.sidebar,
    panel: nested.panel ?? DEFAULT_THEME.panel,
    border: nested.border ?? DEFAULT_THEME.border,
    muted: nested.muted ?? DEFAULT_THEME.muted,
    success: nested.success ?? DEFAULT_THEME.success,
    warning: nested.warning ?? DEFAULT_THEME.warning,
    danger: nested.danger ?? DEFAULT_THEME.danger,
    uiFont: source.uiFont ?? nested.uiFont ?? DEFAULT_THEME.uiFont,
    codeFont: source.codeFont ?? nested.codeFont ?? DEFAULT_THEME.codeFont,
    codeThemeId: source.codeThemeId ?? DEFAULT_THEME.codeThemeId,
    contrast: source.contrast ?? DEFAULT_THEME.contrast
  });
}

export class SettingsService {
  readonly #database: StateDatabase;

  public constructor(database: StateDatabase) {
    this.#database = database;
  }

  public get(): AppSettings {
    const stored = this.#database.getSetting<unknown>(SETTINGS_KEY);
    if (!stored) {
      this.#database.setSetting(SETTINGS_KEY, DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    const parsed = AppSettingsSchema.safeParse(stored);
    if (parsed.success) {
      const current = normalizePolicy(parsed.data);
      const isLegacyBuiltIn = current.theme.name === "DevBox Obsidyen"
        && current.theme.surface.toLowerCase() === "#171717"
        && current.theme.sidebar.toLowerCase() === "#090909"
        && current.theme.panel.toLowerCase() === "#202020";
      if (!isLegacyBuiltIn) {
        if (JSON.stringify(current) !== JSON.stringify(parsed.data)) this.#database.setSetting(SETTINGS_KEY, current);
        return current;
      }
      const migrated = AppSettingsSchema.parse({
        ...current,
        theme: {
          ...current.theme,
          surface: DEFAULT_THEME.surface,
          sidebar: DEFAULT_THEME.sidebar,
          panel: DEFAULT_THEME.panel,
          border: DEFAULT_THEME.border
        }
      });
      this.#database.setSetting(SETTINGS_KEY, migrated);
      return migrated;
    }
    const source = stored && typeof stored === "object" ? stored as Record<string, unknown> : {};
    const repairedCandidate = AppSettingsSchema.safeParse({
      theme: normalizeImportedTheme(source.theme ?? DEFAULT_THEME),
      permissionProfile: source.permissionProfile ?? DEFAULT_SETTINGS.permissionProfile,
      approvalPolicy: source.approvalPolicy ?? DEFAULT_SETTINGS.approvalPolicy,
      sandboxPolicy: source.sandboxPolicy ?? DEFAULT_SETTINGS.sandboxPolicy,
      networkAccess: source.networkAccess ?? DEFAULT_SETTINGS.networkAccess,
      reduceMotion: source.reduceMotion ?? DEFAULT_SETTINGS.reduceMotion,
      terminalShell: source.terminalShell ?? DEFAULT_SETTINGS.terminalShell
    });
    const repaired = normalizePolicy(repairedCandidate.success ? repairedCandidate.data : DEFAULT_SETTINGS);
    this.#database.setSetting(SETTINGS_KEY, repaired);
    return repaired;
  }

  public patch(patch: SettingsPatch): AppSettings {
    const current = this.get();
    const candidate = AppSettingsSchema.parse({
      ...current,
      ...patch,
      theme: patch.theme ? { ...current.theme, ...patch.theme, version: 1 } : current.theme
    });
    const next = normalizePolicy(candidate);
    this.#database.setSetting(SETTINGS_KEY, next);
    return next;
  }

  public importTheme(portable: string): AppSettings {
    const theme = normalizeImportedTheme(decodePortablePayload(portable));
    return this.patch({ theme });
  }

  public exportTheme(): string {
    const payload = Buffer.from(JSON.stringify(this.get().theme), "utf8").toString("base64url");
    return `devbox-theme-v1:${payload}`;
  }
}
