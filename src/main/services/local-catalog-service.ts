import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogItem, CatalogSnapshot } from "../../shared/contracts.js";
import type { CommandRunner } from "./command-runner.js";
import { PluginRegistryService } from "./plugin-registry-service.js";
import { McpHostService } from "./mcp-host-service.js";

type CatalogConfig = { skillRoot: string | null; pluginRoot: string | null };
type ReleaseProduct = { id: string; name: string; archive: string; toolkitEntries?: number };
type PluginManifest = {
  name: string;
  version: string;
  description?: string;
  license?: string;
  author?: { name?: string } | string;
  interface?: { displayName?: string; developerName?: string; capabilities?: string[] };
};

const EMPTY_CONFIG: CatalogConfig = { skillRoot: null, pluginRoot: null };

async function jsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex").toUpperCase();
}

async function checksumMap(root: string): Promise<Map<string, string>> {
  const text = await readFile(path.join(root, "SHA256SUMS.txt"), "utf8");
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^([A-Fa-f0-9]{64})\s{2}(.+)$/u.exec(line.trim());
    if (match) values.set(match[2]!, match[1]!.toUpperCase());
  }
  return values;
}

function publisher(manifest: PluginManifest): string {
  return typeof manifest.author === "string"
    ? manifest.author
    : manifest.interface?.developerName ?? manifest.author?.name ?? "Belirtilmemiş";
}

export class LocalCatalogService {
  readonly #configPath: string;
  readonly #runtimeRoot: string;
  readonly #runner: CommandRunner;
  readonly #defaults: CatalogConfig;
  readonly #registry: PluginRegistryService;
  readonly #host: McpHostService;

  public constructor(stateRoot: string, runner: CommandRunner, defaults: CatalogConfig = EMPTY_CONFIG, clientVersion = process.env.npm_package_version?.trim() || "unknown") {
    this.#configPath = path.join(stateRoot, "catalog-sources.json");
    this.#runtimeRoot = path.join(stateRoot, "catalog-runtime");
    this.#runner = runner;
    this.#defaults = defaults;
    this.#registry = new PluginRegistryService(path.join(stateRoot, "plugin-registry.json"));
    this.#host = new McpHostService(this.#registry, clientVersion);
  }

  async #config(): Promise<CatalogConfig> {
    try {
      const parsed = await jsonFile<Partial<CatalogConfig>>(this.#configPath);
      return {
        skillRoot: typeof parsed.skillRoot === "string" ? parsed.skillRoot : this.#defaults.skillRoot,
        pluginRoot: typeof parsed.pluginRoot === "string" ? parsed.pluginRoot : this.#defaults.pluginRoot
      };
    } catch {
      return this.#defaults;
    }
  }

  public async setSource(kind: "skill" | "plugin", root: string): Promise<CatalogSnapshot> {
    const info = await stat(root);
    if (!info.isDirectory()) throw new Error("CATALOG_SOURCE_MUST_BE_DIRECTORY");
    const current = await this.#config();
    const next: CatalogConfig = { ...current, [kind === "skill" ? "skillRoot" : "pluginRoot"]: path.resolve(root) };
    await mkdir(path.dirname(this.#configPath), { recursive: true });
    await writeFile(this.#configPath, JSON.stringify(next, null, 2), "utf8");
    return await this.inspect();
  }

  async #skills(root: string | null): Promise<{ items: CatalogItem[]; issues: string[] }> {
    if (!root || !existsSync(root)) return { items: [], issues: ["Geliştirici becerileri kaynak klasörü seçilmedi veya artık erişilemiyor."] };
    try {
      const report = await jsonFile<{ version: string; products: ReleaseProduct[]; limitations?: string[] }>(path.join(root, "RELEASE-REPORT.json"));
      const sums = await checksumMap(root);
      const items: CatalogItem[] = [];
      for (const product of report.products) {
        const archivePath = path.join(root, product.archive);
        const expected = sums.get(product.archive) ?? null;
        const actual = existsSync(archivePath) ? await sha256(archivePath) : null;
        const verified = expected !== null && actual === expected;
        items.push({
          kind: "skill",
          id: product.id,
          name: product.name,
          productName: `DevBox · ${product.name}`,
          version: report.version,
          publisher: "yaacodeR",
          license: "yaacodeR PROPRIETARY SOFTWARE LICENSE 1.0 — DRAFT",
          redistributionAllowed: false,
          trustClass: "PROPRIETARY_SOURCE",
          sourceState: verified ? "HASH_VERIFIED" : actual ? "HASH_FAILED" : "MISSING",
          runtimeState: "SOURCE_ONLY",
          doctorState: "NOT_APPLICABLE",
          toolCount: product.toolkitEntries ?? 0,
          tools: [],
          requestedPermissions: [],
          grantedPermissions: [],
          health: null,
          detail: verified
            ? "Yerel arşiv SHA-256 ile doğrulandı. Taslak özel lisans nedeniyle public DevBox dağıtımına gömülmez ve geliştirici kimliği değiştirilmez."
            : "Yerel arşivin bütünlüğü doğrulanamadı; etkinleştirilmedi.",
          evidence: [expected ? `Beklenen SHA-256: ${expected}` : "SHA-256 kaydı yok", actual ? `Gerçek SHA-256: ${actual}` : "Arşiv bulunamadı"]
        });
      }
      return { items, issues: report.limitations ?? [] };
    } catch (error) {
      return { items: [], issues: [`Beceri kataloğu okunamadı: ${error instanceof Error ? error.message : String(error)}`] };
    }
  }

  async #installedPlugins(): Promise<CatalogItem[]> {
    const pluginsRoot = path.join(this.#runtimeRoot, "portable-ai-plugins", "plugins");
    if (!existsSync(pluginsRoot)) return [];
    const items: CatalogItem[] = [];
    const registry = await this.#registry.list();
    for (const entry of await readdir(pluginsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pluginRoot = path.join(pluginsRoot, entry.name);
      try {
        const manifest = await jsonFile<PluginManifest>(path.join(pluginRoot, ".codex-plugin", "plugin.json"));
        const record = registry.find((item) => item.pluginId === manifest.name && item.version === manifest.version);
        const running = this.#host.isRunning(manifest.name);
        const tools = this.#host.tools(manifest.name);
        const unhealthy = ["CRASHED", "DEGRADED", "QUARANTINED", "ROLLBACK_REQUIRED"].includes(record?.state ?? "");
        items.push({
          kind: "plugin",
          id: manifest.name,
          name: manifest.interface?.displayName ?? manifest.name,
          productName: `DevBox · ${manifest.interface?.displayName ?? manifest.name}`,
          version: manifest.version,
          publisher: publisher(manifest),
          license: manifest.license ?? "Belirtilmemiş",
          redistributionAllowed: manifest.license === "MIT",
          trustClass: "LOCAL_SIDELOAD",
          sourceState: "BUNDLE_VERIFIED",
          runtimeState: running && !unhealthy ? "RUNNING" : unhealthy ? "FAILED" : "INSTALLED",
          doctorState: "PASSED",
          toolCount: running ? tools.length : 0,
          tools,
          requestedPermissions: record?.requestedPermissions ?? [],
          grantedPermissions: record?.grantedPermissions ?? [],
          health: record?.health ?? null,
          detail: running
            ? `${manifest.description ?? "Doğrulanmış yerel MCP eklentisi."} Paket kurulu, doktor testi geçti ve canlı MCP initialize/tools/list görüşmesi tamamlandı.`
            : `${manifest.description ?? "Doğrulanmış yerel MCP eklentisi."} Paket kurulu ve doktor testi geçti; canlı MCP oturumu başlatılmadığı için çalışıyor olarak gösterilmez.`,
          evidence: ["Toplu arşiv SHA-256 doğrulandı", "Güvenli yol denetimi geçti", "MCP doktoru: PASS", running ? `Canlı MCP araç listesi: ${this.#host.toolCount(manifest.name)}` : "Canlı MCP bağlantısı: BAŞLATILMADI"]
        });
      } catch (error) {
        items.push({
          kind: "plugin", id: entry.name, name: entry.name, productName: `DevBox · ${entry.name}`, version: "bilinmiyor", publisher: "Belirtilmemiş", license: "Belirtilmemiş", redistributionAllowed: false,
          trustClass: "LOCAL_SIDELOAD", sourceState: "BUNDLE_VERIFIED", runtimeState: "FAILED", doctorState: "FAILED", toolCount: 0,
          tools: [], requestedPermissions: [], grantedPermissions: [], health: null,
          detail: "Kurulu eklentinin manifesti okunamadı.", evidence: [error instanceof Error ? error.message : String(error)]
        });
      }
    }
    return items;
  }

  async #pluginSource(root: string | null, installed: CatalogItem[]): Promise<{ items: CatalogItem[]; issues: string[] }> {
    if (!root || !existsSync(root)) return { items: installed, issues: ["Taşınabilir eklenti kaynak klasörü seçilmedi veya artık erişilemiyor."] };
    try {
      const report = await jsonFile<{ version: string; packageReports?: Array<{ id: string; displayName?: string; totalTools?: number }>; counts?: { plugins?: number; totalTools?: number }; limitations?: string[] }>(path.join(root, "VALIDATION_REPORT.json"));
      const sums = await checksumMap(root);
      const bundle = `12-Portable-AI-Plugins-v${report.version}.zip`;
      const bundlePath = path.join(root, bundle);
      const expected = sums.get(bundle) ?? null;
      const actual = existsSync(bundlePath) ? await sha256(bundlePath) : null;
      const verified = expected !== null && actual === expected;
      if (installed.length > 0) return { items: installed, issues: report.limitations ?? [] };
      const ids = (report.packageReports ?? []).map((item) => ({ id: item.id, name: item.displayName, toolCount: item.totalTools }));
      const sourceItems: CatalogItem[] = ids.map((plugin, index) => ({
        kind: "plugin",
        id: plugin.id ?? `plugin-${index + 1}`,
        name: plugin.name ?? plugin.id ?? `Eklenti ${index + 1}`,
        productName: `DevBox · ${plugin.name ?? plugin.id ?? `Eklenti ${index + 1}`}`,
        version: report.version,
        publisher: "yaaertu",
        license: "MIT",
        redistributionAllowed: true,
        trustClass: "LOCAL_HASH_VERIFIED",
        sourceState: verified ? "HASH_VERIFIED" : actual ? "HASH_FAILED" : "MISSING",
        runtimeState: "NOT_INSTALLED",
        doctorState: "NOT_RUN",
        toolCount: plugin.toolCount ?? 0,
        tools: [],
        requestedPermissions: [],
        grantedPermissions: [],
        health: null,
        detail: verified ? "Toplu kaynak arşivi doğrulandı; etkinleşmesi için güvenli kurulum ve canlı MCP doktoru gerekir." : "Toplu kaynak arşivi doğrulanamadı; kurulum engellendi.",
        evidence: [expected ? `Beklenen toplu SHA-256: ${expected}` : "Toplu SHA kaydı yok", actual ? `Gerçek toplu SHA-256: ${actual}` : "Toplu arşiv bulunamadı"]
      }));
      if (sourceItems.length === 0 && (report.counts?.plugins ?? 0) > 0) {
        sourceItems.push({ kind: "plugin", id: "portable-ai-plugins", name: "Portable AI Plugins", productName: "DevBox · Portable AI Plugins", version: report.version, publisher: "yaaertu", license: "MIT", redistributionAllowed: true, trustClass: "LOCAL_HASH_VERIFIED", sourceState: verified ? "HASH_VERIFIED" : "HASH_FAILED", runtimeState: "NOT_INSTALLED", doctorState: "NOT_RUN", toolCount: report.counts?.totalTools ?? 0, tools: [], requestedPermissions: [], grantedPermissions: [], health: null, detail: "Doğrulanmış toplu eklenti kaynağı.", evidence: [`Raporlanan eklenti: ${report.counts?.plugins ?? 0}`] });
      }
      return { items: sourceItems, issues: report.limitations ?? [] };
    } catch (error) {
      return { items: installed, issues: [`Eklenti kataloğu okunamadı: ${error instanceof Error ? error.message : String(error)}`] };
    }
  }

  public async inspect(): Promise<CatalogSnapshot> {
    const config = await this.#config();
    const installed = await this.#installedPlugins();
    const [skills, plugins] = await Promise.all([this.#skills(config.skillRoot), this.#pluginSource(config.pluginRoot, installed)]);
    const items = [...skills.items, ...plugins.items];
    return {
      inspectedAt: new Date().toISOString(),
      skillRoot: config.skillRoot,
      pluginRoot: config.pluginRoot,
      counts: {
        total: items.length,
        skills: items.filter((item) => item.kind === "skill").length,
        plugins: items.filter((item) => item.kind === "plugin").length,
        installed: items.filter((item) => item.runtimeState === "INSTALLED" || item.runtimeState === "RUNNING").length,
        running: items.filter((item) => item.runtimeState === "RUNNING").length,
        blocked: items.filter((item) => item.sourceState === "HASH_FAILED" || item.runtimeState === "FAILED").length
      },
      items,
      issues: [...skills.issues, ...plugins.issues]
    };
  }

  public async installPortablePlugins(): Promise<CatalogSnapshot> {
    const config = await this.#config();
    if (!config.pluginRoot) throw new Error("PLUGIN_SOURCE_NOT_CONFIGURED");
    const report = await jsonFile<{ version: string }>(path.join(config.pluginRoot, "VALIDATION_REPORT.json"));
    const archiveName = `12-Portable-AI-Plugins-v${report.version}.zip`;
    const archivePath = path.join(config.pluginRoot, archiveName);
    const sums = await checksumMap(config.pluginRoot);
    if (!existsSync(archivePath) || await sha256(archivePath) !== sums.get(archiveName)) throw new Error("PLUGIN_BUNDLE_HASH_MISMATCH");

    const listing = await this.#runner.run({ executable: "tar.exe", args: ["-tf", archivePath], cwd: config.pluginRoot, timeoutMs: 30_000, maxOutputBytes: 4_194_304 });
    if (listing.exitCode !== 0) throw new Error("PLUGIN_BUNDLE_LIST_FAILED");
    const entries = listing.stdout.split(/\r?\n/u).filter(Boolean);
    if (entries.length === 0 || entries.some((entry) => path.isAbsolute(entry) || entry.split(/[\\/]/u).includes(".."))) throw new Error("PLUGIN_BUNDLE_UNSAFE_PATH");

    const staging = path.join(this.#runtimeRoot, `.staging-${Date.now()}`);
    const destination = path.join(this.#runtimeRoot, "portable-ai-plugins");
    await mkdir(staging, { recursive: true });
    try {
      const extraction = await this.#runner.run({ executable: "tar.exe", args: ["-xf", archivePath, "-C", staging], cwd: config.pluginRoot, timeoutMs: 120_000, maxOutputBytes: 1_048_576 });
      if (extraction.exitCode !== 0) throw new Error("PLUGIN_BUNDLE_EXTRACT_FAILED");
      const suite = (await readdir(staging, { withFileTypes: true })).find((entry) => entry.isDirectory());
      if (!suite) throw new Error("PLUGIN_SUITE_ROOT_MISSING");
      const suiteRoot = path.join(staging, suite.name);
      const pluginsRoot = path.join(suiteRoot, "plugins");
      const pluginEntries = (await readdir(pluginsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
      if (pluginEntries.length !== 12) throw new Error("PLUGIN_SUITE_COUNT_MISMATCH");
      const installations: Array<{ pluginId: string; version: string; installRoot: string }> = [];
      for (const plugin of pluginEntries) {
        const server = path.join(pluginsRoot, plugin.name, "mcp", "server.mjs");
        const result = await this.#runner.run({ executable: process.execPath, args: [server, "--doctor"], cwd: path.dirname(server), timeoutMs: 30_000, maxOutputBytes: 1_048_576, environment: { ELECTRON_RUN_AS_NODE: "1" } });
        if (result.exitCode !== 0 || !/"decision"\s*:\s*"PASS"/u.test(result.stdout)) throw new Error(`PLUGIN_DOCTOR_FAILED_${plugin.name.toUpperCase().replace(/[^A-Z0-9]+/gu, "_")}`);
        const manifest = await jsonFile<PluginManifest>(path.join(pluginsRoot, plugin.name, ".codex-plugin", "plugin.json"));
        installations.push({ pluginId: manifest.name, version: manifest.version, installRoot: path.join(destination, "plugins", plugin.name) });
      }
      await mkdir(this.#runtimeRoot, { recursive: true });
      const backup = path.join(this.#runtimeRoot, `.rollback-${Date.now()}`);
      const hadPreviousRuntime = existsSync(destination);
      if (hadPreviousRuntime) await rename(destination, backup);
      try {
        await rename(suiteRoot, destination);
        await this.#registry.recordInstalledBatch(installations);
      } catch (error) {
        await rm(destination, { recursive: true, force: true }).catch(() => undefined);
        if (hadPreviousRuntime && existsSync(backup)) await rename(backup, destination);
        throw error;
      }
      if (hadPreviousRuntime) await rm(backup, { recursive: true, force: true });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return await this.inspect();
  }

  public async connectPortablePlugins(): Promise<CatalogSnapshot> {
    const pluginsRoot = path.join(this.#runtimeRoot, "portable-ai-plugins", "plugins");
    if (!existsSync(pluginsRoot)) throw new Error("PORTABLE_PLUGINS_NOT_INSTALLED");
    const failures: string[] = [];
    for (const entry of await readdir(pluginsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pluginRoot = path.join(pluginsRoot, entry.name);
      try {
        const manifest = await jsonFile<PluginManifest>(path.join(pluginRoot, ".codex-plugin", "plugin.json"));
        await this.#host.start(manifest.name, path.join(pluginRoot, "mcp", "server.mjs"));
      } catch (error) {
        failures.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length > 0) throw new Error(`MCP_CONNECT_FAILED:${failures.join(" | ")}`);
    return await this.inspect();
  }

  public async disconnectPortablePlugins(): Promise<CatalogSnapshot> {
    await this.#host.close();
    return await this.inspect();
  }

  public async callPortablePluginTool(pluginId: string, toolName: string, args: Record<string, unknown>): Promise<{ pluginId: string; toolName: string; completedAt: string; durationMs: number; result: unknown }> {
    const output = await this.#host.callTool(pluginId, toolName, args);
    return { pluginId, toolName, completedAt: new Date().toISOString(), ...output };
  }

  public async close(): Promise<void> {
    await this.#host.close();
  }
}
