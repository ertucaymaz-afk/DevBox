import { readFile, writeFile } from "node:fs/promises";

async function load(file) { return (await readFile(file, "utf8")).replace(/\r\n/gu, "\n"); }
async function save(file, text) { await writeFile(file, text, "utf8"); }
function once(source, before, after, label) {
  if (source.includes(after)) return source;
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + 1) >= 0) throw new Error(`V017_ANCHOR_INVALID:${label}`);
  return source.slice(0, at) + after + source.slice(at + before.length);
}

// Persisted finding records must never be able to crash DevAPI summary parsing.
{
  const file = "src/main/services/evolution-finding-service.ts";
  let source = await load(file);
  source = once(source,
`export function emptyOwnerCounts(): Record<FindingOwner, number> { return { core: 0, agent: 0, api: 0, release: 0, typescript: 0, evolution: 0, workspace: 0, cloud: 0, ui: 0, security: 0, project: 0, integration: 0 }; }

export class EvolutionFindingService {`,
`export function emptyOwnerCounts(): Record<FindingOwner, number> { return { core: 0, agent: 0, api: 0, release: 0, typescript: 0, evolution: 0, workspace: 0, cloud: 0, ui: 0, security: 0, project: 0, integration: 0 }; }

const FINDING_SEVERITIES = new Set<FindingSeverity>(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);
const FINDING_STATUSES = new Set<FindingStatus>(["OPEN", "RESOLVED", "REJECTED"]);
const FINDING_OWNER_SET = new Set<FindingOwner>(FINDING_OWNERS);
const FINDING_TRACKS = new Set<EvolutionTrack>(["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
function storedRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function storedIso(value: unknown, fallback: string): string { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback; }
function storedNullableString(value: unknown, max: number): string | null { return typeof value === "string" ? bounded(value, max) || null : null; }
function normalizeStoredFinding(projectId: string, value: unknown, fallbackUpdatedAt: string): EvolutionFinding | null {
  const item = storedRecord(value);
  if (!item || item.projectId !== projectId) return null;
  const source = typeof item.source === "string" ? bounded(item.source, 120) || "legacy" : "legacy";
  const title = typeof item.title === "string" ? bounded(item.title, 500) || "Eski bulgu" : "Eski bulgu";
  const detail = typeof item.detail === "string" ? bounded(item.detail, 4_000) : "Eski finding kaydı v0.1.17 tarafından güvenli biçimde normalize edildi.";
  const track = typeof item.track === "string" && FINDING_TRACKS.has(item.track as EvolutionTrack) ? item.track as EvolutionTrack : null;
  const severity = typeof item.severity === "string" && FINDING_SEVERITIES.has(item.severity as FindingSeverity) ? item.severity as FindingSeverity : "MEDIUM";
  const status = typeof item.status === "string" && FINDING_STATUSES.has(item.status as FindingStatus) ? item.status as FindingStatus : "OPEN";
  const owner = typeof item.owner === "string" && FINDING_OWNER_SET.has(item.owner as FindingOwner) ? item.owner as FindingOwner : ownerForTrack(track);
  const id = typeof item.id === "string" && UUID_PATTERN.test(item.id) ? item.id : randomUUID();
  const fingerprintValue = typeof item.fingerprint === "string" ? item.fingerprint.toLocaleLowerCase("en-US") : "";
  const findingFingerprint = SHA256_PATTERN.test(fingerprintValue)
    ? fingerprintValue
    : createHash("sha256").update(`${projectId}\u0000${source}\u0000${title}\u0000${String(item.id ?? "legacy")}`).digest("hex");
  const evidence = Array.isArray(item.evidence) ? uniqueEvidence(item.evidence.filter((entry): entry is string => typeof entry === "string")) : [];
  const occurrences = typeof item.occurrences === "number" && Number.isFinite(item.occurrences) ? Math.max(1, Math.trunc(item.occurrences)) : 1;
  const firstSeenAt = storedIso(item.firstSeenAt, fallbackUpdatedAt);
  const lastSeenAt = storedIso(item.lastSeenAt, firstSeenAt);
  return {
    id,
    fingerprint: findingFingerprint,
    projectId,
    title,
    detail,
    source,
    track,
    specTaskId: storedNullableString(item.specTaskId, 160),
    taskId: storedNullableString(item.taskId, 160),
    severity,
    status,
    owner,
    evidence,
    occurrences,
    firstSeenAt,
    lastSeenAt,
    resolvedAt: status === "RESOLVED" ? storedIso(item.resolvedAt, lastSeenAt) : null,
    rejectedAt: status === "REJECTED" ? storedIso(item.rejectedAt, lastSeenAt) : null,
    resolution: storedNullableString(item.resolution, 2_000)
  };
}

export class EvolutionFindingService {`, "finding-normalizer");
  source = once(source,
`    const candidate = raw as Partial<FindingStore>;
    if (candidate.schemaVersion !== STORE_VERSION || !Array.isArray(candidate.items)) return { schemaVersion: STORE_VERSION, items: [], updatedAt: new Date(0).toISOString() };
    const items = candidate.items.filter((item): item is EvolutionFinding => Boolean(item && typeof item === "object" && typeof (item as EvolutionFinding).id === "string" && typeof (item as EvolutionFinding).fingerprint === "string" && (item as EvolutionFinding).projectId === projectId));
    return { schemaVersion: STORE_VERSION, items: items.slice(-MAX_FINDINGS), updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString() };`,
`    const candidate = raw as Partial<FindingStore>;
    if (candidate.schemaVersion !== STORE_VERSION || !Array.isArray(candidate.items)) return { schemaVersion: STORE_VERSION, items: [], updatedAt: new Date(0).toISOString() };
    const updatedAt = storedIso(candidate.updatedAt, new Date(0).toISOString());
    const items = candidate.items.flatMap((item): EvolutionFinding[] => {
      const normalized = normalizeStoredFinding(projectId, item, updatedAt);
      return normalized ? [normalized] : [];
    });
    return { schemaVersion: STORE_VERSION, items: items.slice(-MAX_FINDINGS), updatedAt };`, "finding-load");
  await save(file, source);
}

{
  const file = "src/main/services/evolution-finding-service.test.ts";
  let source = await load(file);
  source = once(source,
`  it("deduplicates by fingerprint and preserves occurrence history", async () => {`,
`  it("normalizes legacy or malformed persisted findings instead of breaking strict DevAPI owner counts", async () => {
    const { database, service, projectId } = await fixture();
    database.setSetting(`evolution:findings:v1:${projectId}`, {
      schemaVersion: 1,
      updatedAt: "not-a-date",
      items: [{ id: "legacy-id", fingerprint: "broken", projectId, title: "Legacy finding", detail: 17, source: "legacy-import", track: "unknown-track", severity: "URGENT", status: "UNKNOWN", owner: "old-owner", evidence: null, occurrences: 0, firstSeenAt: "bad", lastSeenAt: "bad" }]
    });
    const summary = FindingSummarySchema.parse(service.summary(projectId));
    expect(summary.total).toBe(1);
    expect(summary.open).toBe(1);
    expect(summary.bySeverity.MEDIUM).toBe(1);
    expect(summary.byOwner.evolution).toBe(1);
    expect(summary.items[0]?.id).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(summary.items[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("deduplicates by fingerprint and preserves occurrence history", async () => {`, "finding-test");
  await save(file, source);
}

// Resolve system theme in renderer and keep native Electron chrome synchronized with Windows.
{
  const file = "src/main/main.ts";
  let source = await load(file);
  source = once(source,
`let remixRotaService: RemixRotaService | null = null;
`,
`let remixRotaService: RemixRotaService | null = null;
let nativeThemeUpdatedListener: (() => void) | null = null;
`, "main-theme-global");
  source = once(source,
`function optionalCatalogRoot(name: "DEVBOX_SKILL_ROOT" | "DEVBOX_PLUGIN_ROOT"): string | null {
  const value = process.env[name]?.trim();
  return value ? path.resolve(value) : null;
}
`,
`function optionalCatalogRoot(name: "DEVBOX_SKILL_ROOT" | "DEVBOX_PLUGIN_ROOT"): string | null {
  const value = process.env[name]?.trim();
  return value ? path.resolve(value) : null;
}

function nativeThemeIsLight(themeBase: "light" | "dark" | "system"): boolean {
  return themeBase === "light" || (themeBase === "system" && !nativeTheme.shouldUseDarkColors);
}
function applyNativeWindowTheme(window: BrowserWindow, themeBase: "light" | "dark" | "system"): void {
  const light = nativeThemeIsLight(themeBase);
  window.setBackgroundColor(light ? "#F6F3EF" : "#0B0D0E");
  window.setTitleBarOverlay({ color: light ? "#FFFDFA" : "#191B1D", symbolColor: light ? "#342A25" : "#F3F5F6", height: 40 });
}
`, "main-theme-helper");
  source = once(source,
`          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src devbox-preview:; base-uri 'none'; form-action 'none'"`,
`          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://i.ytimg.com https://*.googleusercontent.com https://*.ggpht.com; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src devbox-preview:; base-uri 'none'; form-action 'none'"`, "thumbnail-csp");
  source = once(source,
`function createWindow(themeBase: "light" | "dark" | "system"): BrowserWindow {
  const light = themeBase === "light" || (themeBase === "system" && !nativeTheme.shouldUseDarkColors);`,
`function createWindow(themeBase: "light" | "dark" | "system"): BrowserWindow {
  const light = nativeThemeIsLight(themeBase);`, "main-theme-create");
  source = once(source,
`  mainWindow = createWindow(settings.get().theme.base);
  terminals = new TerminalService((event) => {`,
`  mainWindow = createWindow(settings.get().theme.base);
  nativeThemeUpdatedListener = (): void => {
    if (!mainWindow || mainWindow.isDestroyed() || settings.get().theme.base !== "system") return;
    applyNativeWindowTheme(mainWindow, "system");
  };
  nativeTheme.on("updated", nativeThemeUpdatedListener);
  terminals = new TerminalService((event) => {`, "main-theme-listener");
  source = once(source,
`  event.preventDefault();
  const api = coreApi;`,
`  event.preventDefault();
  if (nativeThemeUpdatedListener) {
    nativeTheme.off("updated", nativeThemeUpdatedListener);
    nativeThemeUpdatedListener = null;
  }
  const api = coreApi;`, "main-theme-cleanup");
  await save(file, source);
}

{
  const file = "src/renderer/App.tsx";
  let source = await load(file);
  source = once(source,
`  const [settingsResolved, setSettingsResolved] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);`,
`  const [settingsResolved, setSettingsResolved] = useState(false);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [introVisible, setIntroVisible] = useState(false);`, "renderer-system-state");
  source = once(source,
`  const dismissIntro = useCallback(async (neverAgain = false): Promise<void> => {`,
`  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = (): void => setSystemDark(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const dismissIntro = useCallback(async (neverAgain = false): Promise<void> => {`, "renderer-system-effect");
  source = once(source,
`  const activePendingTurns = thread ? pendingTurns[thread.thread.id] ?? 0 : 0;
  const capabilities = bootstrap?.capabilities ?? [];`,
`  const activePendingTurns = thread ? pendingTurns[thread.thread.id] ?? 0 : 0;
  const resolvedThemeBase: "light" | "dark" = appSettings?.theme.base === "system" ? (systemDark ? "dark" : "light") : appSettings?.theme.base ?? "dark";
  const capabilities = bootstrap?.capabilities ?? [];`, "renderer-resolved-theme");
  source = once(source,
`    <div data-theme-base={appSettings?.theme.base ?? "dark"} style={themeStyle(appSettings)} className={`,
`    <div data-theme-base={resolvedThemeBase} style={themeStyle(appSettings)} className={` , "renderer-theme-attribute");
  source = once(source,
`<div className="system-theme"><button onClick={() => { if (!appSettings) return; void window.devbox.patchSettings({ theme: appSettings.theme.base === "light" ? DEVBOX_OBSIDIAN_THEME : DEVBOX_DAY_THEME }).then((nextSettings) => { setAppSettings(nextSettings); setPermission(nextSettings.permissionProfile); }); }} title={appSettings?.theme.base === "light" ? "Koyu moda geç" : "Gündüz moduna geç"} aria-label="Tema modunu değiştir">{appSettings?.theme.base === "light" ? <Moon size={15} /> : <Sun size={15} />}</button></div>`,
`<div className="system-theme"><button onClick={() => { if (!appSettings) return; void window.devbox.patchSettings({ theme: resolvedThemeBase === "light" ? DEVBOX_OBSIDIAN_THEME : DEVBOX_DAY_THEME }).then((nextSettings) => { setAppSettings(nextSettings); setPermission(nextSettings.permissionProfile); }); }} title={resolvedThemeBase === "light" ? "Koyu moda geç" : "Gündüz moduna geç"} aria-label="Tema modunu değiştir">{resolvedThemeBase === "light" ? <Moon size={15} /> : <Sun size={15} />}</button></div>`, "renderer-theme-toggle");
  await save(file, source);
}

// Harden companion discovery, socket failure cleanup and event parsing.
{
  const file = "src/main/services/remixrota-service.ts";
  let source = await load(file);
  source = once(source,
`function failure(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, " ").trim().slice(0, 2_000); }
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
`,
`function failure(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, " ").trim().slice(0, 2_000); }
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function processAlive(processId: number): boolean {
  if (processId === process.pid) return true;
  try { process.kill(processId, 0); return true; } catch { return false; }
}
function sameWindowsPath(left: string, right: string): boolean {
  return path.resolve(left).replace(/\\/gu, "/").toLocaleLowerCase("en-US") === path.resolve(right).replace(/\\/gu, "/").toLocaleLowerCase("en-US");
}
`, "remix-helper");
  source = once(source,
`  async #readDiscovery(): Promise<RemixRotaDiscovery | null> {
    try {
      const raw = await readFile(this.#options.discoveryPath, "utf8");
      return RemixRotaDiscoverySchema.parse(JSON.parse(raw));
    } catch { return null; }
  }`,
`  async #readDiscovery(): Promise<RemixRotaDiscovery | null> {
    try {
      const raw = await readFile(this.#options.discoveryPath, "utf8");
      const discovery = RemixRotaDiscoverySchema.parse(JSON.parse(raw));
      if (path.basename(discovery.executablePath).toLocaleLowerCase("en-US") !== "remixrota.exe") {
        this.#lastError = "REMIXROTA_DISCOVERY_EXECUTABLE_NAME_INVALID";
        return null;
      }
      if (process.platform === "win32" && !processAlive(discovery.processId)) {
        this.#lastError = "REMIXROTA_DISCOVERY_PROCESS_NOT_RUNNING";
        return null;
      }
      const configured = this.configuredExecutable();
      if (configured && !sameWindowsPath(configured, discovery.executablePath)) {
        this.#lastError = "REMIXROTA_DISCOVERY_EXECUTABLE_MISMATCH";
        return null;
      }
      return discovery;
    } catch { return null; }
  }`, "remix-discovery");
  source = once(source,
`      this.#pending.set(requestId, { command, resolve, reject, timer });
      this.#write({ type: "request", requestId, command, payload });`,
`      this.#pending.set(requestId, { command, resolve, reject, timer });
      try {
        this.#write({ type: "request", requestId, command, payload });
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }`, "remix-pending-write");
  source = once(source,
`      if (message.type === "event" && typeof message.eventName === "string") {
        const event = RemixRotaEventSchema.parse({ type: message.eventName, payload: message.payload ?? null, receivedAt: new Date().toISOString() });
        this.#lastEventAt = event.receivedAt;
        this.#applyEvent(event);
        for (const listener of this.#listeners) listener(event);
        continue;
      }`,
`      if (message.type === "event" && typeof message.eventName === "string") {
        const parsedEvent = RemixRotaEventSchema.safeParse({ type: message.eventName, payload: message.payload ?? null, receivedAt: new Date().toISOString() });
        if (!parsedEvent.success) {
          this.#lastError = "REMIXROTA_INVALID_EVENT";
          continue;
        }
        const event = parsedEvent.data;
        this.#lastEventAt = event.receivedAt;
        this.#applyEvent(event);
        for (const listener of this.#listeners) listener(event);
        continue;
      }`, "remix-safe-event");
  await save(file, source);
}

{
  const file = "src/main/services/remixrota-service.test.ts";
  let source = await load(file);
  source = once(source,
`    const server = net.createServer((socket) => {`,
`    let connectedSocket: net.Socket | null = null;
    const server = net.createServer((socket) => {
      connectedSocket = socket;`, "remix-test-socket");
  source = once(source,
`      expect(RemixRotaService.isSafeAutomaticRetry("player.getSnapshot")).toBe(true);
      expect(RemixRotaService.isSafeAutomaticRetry("player.next")).toBe(false);`,
`      expect(RemixRotaService.isSafeAutomaticRetry("player.getSnapshot")).toBe(true);
      expect(RemixRotaService.isSafeAutomaticRetry("player.next")).toBe(false);
      connectedSocket?.write(`${JSON.stringify({ type: "event", eventName: "x".repeat(161), payload: null })}\n`);
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect((await service.inspect()).lastError).toBe("REMIXROTA_INVALID_EVENT");`, "remix-invalid-event-test");
  source = once(source,
`  it("rejects non-RemixRota executables before storing a companion path", async () => {`,
`  windowsIt("rejects a stale discovery record whose advertised process is no longer running", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-remixrota-stale-"));
    temporaryDirectories.push(root);
    const executable = path.join(root, "RemixRota.exe");
    await writeFile(executable, Buffer.from([0x4d, 0x5a, 0, 0]));
    const discoveryPath = path.join(root, "companion.json");
    await writeFile(discoveryPath, JSON.stringify({ schemaVersion: 1, serviceId: "com.remixrota.player", serviceVersion: "1.1.0", protocol: { major: 1, minor: 0 }, transport: "windows-named-pipe", pipeName: "stale-remixrota", currentUserOnly: true, processId: 2147483000, executablePath: executable, integrationAssetDirectory: root, startedAt: new Date().toISOString() }), "utf8");
    const database = new StateDatabase(path.join(root, "state.sqlite"));
    databases.push(database);
    const service = new RemixRotaService(database, { discoveryPath, appVersion: "0.1.17" });
    await service.configureExecutable(executable);
    const status = await service.inspect();
    expect(status.discovery).toBeNull();
    expect(status.lastError).toBe("REMIXROTA_DISCOVERY_PROCESS_NOT_RUNNING");
    service.close();
  });

  it("rejects non-RemixRota executables before storing a companion path", async () => {`, "remix-stale-test");
  await save(file, source);
}

// Only render thumbnails from a narrow passive-image allowlist; unknown URLs fall back to the music glyph.
{
  const file = "src/renderer/RemixRotaWorkspace.tsx";
  let source = await load(file);
  source = once(source,
`function stateLabel(state: RemixRotaStatus["state"]): string {
  return ({ UNCONFIGURED: "YAPILANDIRILMADI", DISCOVERED: "KEŞFEDİLDİ", CONNECTING: "BAĞLANIYOR", READY: "BAĞLI", DEGRADED: "BAĞLANTI KOPTU", FAILED: "BAŞARISIZ" } as const)[state];
}

function TrackRow`,
`function stateLabel(state: RemixRotaStatus["state"]): string {
  return ({ UNCONFIGURED: "YAPILANDIRILMADI", DISCOVERED: "KEŞFEDİLDİ", CONNECTING: "BAĞLANIYOR", READY: "BAĞLI", DEGRADED: "BAĞLANTI KOPTU", FAILED: "BAŞARISIZ" } as const)[state];
}
function trustedThumbnailUrl(value: string): string | null {
  if (value.startsWith("data:image/")) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLocaleLowerCase("en-US");
    return host === "i.ytimg.com" || host.endsWith(".googleusercontent.com") || host.endsWith(".ggpht.com") ? url.toString() : null;
  } catch { return null; }
}

function TrackRow`, "remix-thumbnail-helper");
  source = once(source,
`function TrackRow({ track, current, onPlay }: { track: RemixRotaTrack; current: boolean; onPlay: (track: RemixRotaTrack) => void }): ReactNode {
  return <button className={`music-track-row ${current ? "current" : ""}`} onClick={() => onPlay(track)}>
    <span className="music-cover-mini">{track.thumbnailUrl ? <img src={track.thumbnailUrl} alt="" referrerPolicy="no-referrer" /> : <Music2 size={16} />}</span>`,
`function TrackRow({ track, current, onPlay }: { track: RemixRotaTrack; current: boolean; onPlay: (track: RemixRotaTrack) => void }): ReactNode {
  const thumbnail = trustedThumbnailUrl(track.thumbnailUrl);
  return <button className={`music-track-row ${current ? "current" : ""}`} onClick={() => onPlay(track)}>
    <span className="music-cover-mini">{thumbnail ? <img src={thumbnail} alt="" referrerPolicy="no-referrer" /> : <Music2 size={16} />}</span>`, "remix-track-thumbnail");
  source = once(source,
`  const currentArtist = player?.current?.artist ?? "DevBox müzik motorunu kopyalamaz; gerçek companion durumunu gösterir.";
  const tracks = useMemo(() => view?.tracks ?? [], [view]);`,
`  const currentArtist = player?.current?.artist ?? "DevBox müzik motorunu kopyalamaz; gerçek companion durumunu gösterir.";
  const currentThumbnail = trustedThumbnailUrl(player?.current?.thumbnailUrl ?? "");
  const tracks = useMemo(() => view?.tracks ?? [], [view]);`, "remix-current-thumbnail");
  source = once(source,
`<div className="music-artwork">{player?.current?.thumbnailUrl ? <img src={player.current.thumbnailUrl} alt={`${currentTitle} kapağı`} referrerPolicy="no-referrer" /> : <Music2 size={38} />}</div>`,
`<div className="music-artwork">{currentThumbnail ? <img src={currentThumbnail} alt={`${currentTitle} kapağı`} referrerPolicy="no-referrer" /> : <Music2 size={38} />}</div>`, "remix-artwork-thumbnail");
  await save(file, source);
}

console.log("DEVBOX_V017_HARDENING_APPLIED");
