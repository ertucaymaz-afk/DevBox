import {
  Activity,
  CheckCircle2,
  CircleStop,
  LoaderCircle,
  PackageCheck,
  Play,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CatalogItem, CatalogSnapshot } from "../shared/contracts";

function failure(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^Error invoking remote method '[^']+':\s*/iu, "");
  return String(error);
}

function runtimeLabel(item: CatalogItem): string {
  if (item.runtimeState === "RUNNING") return "Çalışıyor";
  if (item.runtimeState === "INSTALLED") return "Kurulu";
  if (item.runtimeState === "FAILED") return "Çalışma hatası";
  if (item.runtimeState === "SOURCE_ONLY") return "Kaynak hazır";
  return "Kurulu değil";
}

function runtimeClass(item: CatalogItem): string {
  if (item.runtimeState === "RUNNING") return "ready";
  if (item.runtimeState === "INSTALLED") return "installed";
  if (item.runtimeState === "FAILED" || item.sourceState === "HASH_FAILED" || item.doctorState === "FAILED") return "failed";
  return "source";
}

function trustLabel(item: CatalogItem): string {
  if (item.trustClass === "MANAGED_SIGNED_CATALOG") return "İmzalı yönetilen katalog";
  if (item.trustClass === "LOCAL_HASH_VERIFIED") return "SHA-256 doğrulanmış yerel kaynak";
  if (item.trustClass === "LOCAL_SIDELOAD") return "Yerel sideload";
  return "Dağıtıma kapalı özel kaynak";
}

function trustClass(item: CatalogItem): string {
  if (["MANAGED_SIGNED_CATALOG", "LOCAL_HASH_VERIFIED"].includes(item.trustClass) && item.sourceState !== "HASH_FAILED") return "verified";
  if (item.sourceState === "HASH_FAILED" || item.doctorState === "FAILED" || item.runtimeState === "FAILED") return "blocked";
  return "source";
}

function doctorLabel(item: CatalogItem): string {
  if (item.doctorState === "PASSED") return "Doktor geçti";
  if (item.doctorState === "FAILED") return "Doktor başarısız";
  if (item.doctorState === "NOT_RUN") return "Doktor bekliyor";
  return "Doktor gerekmiyor";
}

function sourceLabel(item: CatalogItem): string {
  if (item.sourceState === "HASH_VERIFIED") return "SHA-256 doğrulandı";
  if (item.sourceState === "BUNDLE_VERIFIED") return "Paket doğrulandı";
  if (item.sourceState === "HASH_FAILED") return "Bütünlük hatası";
  return "Kaynak bulunamadı";
}

export function CatalogWorkspaceV2(): ReactNode {
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [section, setSection] = useState<"skill" | "plugin">("skill");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setCatalog(await window.devbox.inspectCatalog());
    } catch (caught) {
      setError(failure(caught));
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const runCatalogAction = async (name: string, action: () => Promise<CatalogSnapshot>): Promise<void> => {
    setBusy(name);
    setError(null);
    try {
      setCatalog(await action());
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setBusy(null);
    }
  };

  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return (catalog?.items ?? []).filter((item) => {
      if (item.kind !== section) return false;
      if (!normalized) return true;
      return [item.productName, item.name, item.id, item.publisher, item.license]
        .some((value) => value.toLocaleLowerCase("tr-TR").includes(normalized));
    });
  }, [catalog?.items, query, section]);

  const verifiedPlugins = catalog?.items.some((item) => item.kind === "plugin" && ["HASH_VERIFIED", "BUNDLE_VERIFIED"].includes(item.sourceState)) ?? false;
  const installedPlugins = catalog?.items.filter((item) => item.kind === "plugin" && ["INSTALLED", "RUNNING"].includes(item.runtimeState)).length ?? 0;
  const runningPlugins = catalog?.items.filter((item) => item.kind === "plugin" && item.runtimeState === "RUNNING").length ?? 0;
  const currentRoot = section === "skill" ? catalog?.skillRoot : catalog?.pluginRoot;

  return <section className="advanced-page catalog-workspace catalog-workspace-v2">
    <div className="advanced-heading catalog-v2-heading">
      <div>
        <span className="advanced-eyebrow">BECERİLER · EKLENTİLER · MCP</span>
        <h1>Doğrulanmış araç merkezi</h1>
        <p>Kaynağı, lisansı, bütünlüğü, izinleri ve çalışma sağlığı gerçek runtime verisinden gösterir. Teknik kanıt ayrıntıda kalır; ana yüzey yalnız karar vermek için gereken bilgiyi öne çıkarır.</p>
      </div>
      <button onClick={() => void reload()} disabled={Boolean(busy)}><RefreshCw className={busy === "reload" ? "spin" : ""} size={14} /> Yeniden denetle</button>
    </div>

    <div className="catalog-v2-overview" aria-label="Katalog özeti">
      <article><Sparkles size={17} /><div><strong>{catalog?.counts.skills ?? "—"}</strong><span>Beceri</span></div></article>
      <article><PackageCheck size={17} /><div><strong>{catalog?.counts.plugins ?? "—"}</strong><span>Eklenti</span></div></article>
      <article className="positive"><CheckCircle2 size={17} /><div><strong>{catalog?.counts.installed ?? "—"}</strong><span>Kurulu</span></div></article>
      <article className="positive"><PlugZap size={17} /><div><strong>{catalog?.counts.running ?? "—"}</strong><span>Canlı MCP</span></div></article>
      <article className={(catalog?.counts.blocked ?? 0) > 0 ? "negative" : ""}><ShieldCheck size={17} /><div><strong>{catalog?.counts.blocked ?? "—"}</strong><span>Engel</span></div></article>
    </div>

    <div className="catalog-v2-toolbar">
      <nav className="catalog-tabs" aria-label="Katalog türü">
        <button className={section === "skill" ? "active" : ""} onClick={() => setSection("skill")}><Sparkles size={14} /> Beceriler</button>
        <button className={section === "plugin" ? "active" : ""} onClick={() => setSection("plugin")}><PlugZap size={14} /> Eklentiler ve MCP</button>
      </nav>
      <label className="catalog-v2-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, geliştirici veya lisans ara" /></label>
    </div>

    <section className="catalog-v2-source" aria-label="Katalog kaynağı">
      <div className="catalog-v2-source-copy"><span>{section === "skill" ? "BECERİ KAYNAĞI" : "EKLENTİ KAYNAĞI"}</span><strong title={currentRoot ?? undefined}>{currentRoot ?? "Henüz kaynak klasörü seçilmedi"}</strong><small>{section === "skill" ? "DevBox yalnız doğrulanan yerel beceri manifestlerini listeler." : "Paket bütünlüğü ve doctor geçmeden MCP süreci çalışıyor sayılmaz."}</small></div>
      <div className="catalog-v2-source-actions">
        <button onClick={() => void runCatalogAction(`source-${section}`, () => window.devbox.selectCatalogSource(section))} disabled={Boolean(busy)}>{busy === `source-${section}` ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />} Klasör seç</button>
        {section === "plugin" && installedPlugins === 0 && <button className="primary" onClick={() => void runCatalogAction("install", () => window.devbox.installPortablePlugins())} disabled={Boolean(busy) || !verifiedPlugins}>{busy === "install" ? <LoaderCircle className="spin" size={14} /> : <ShieldCheck size={14} />} Doğrula ve kur</button>}
        {section === "plugin" && installedPlugins > runningPlugins && <button className="primary" onClick={() => void runCatalogAction("connect", () => window.devbox.connectPortablePlugins())} disabled={Boolean(busy)}>{busy === "connect" ? <LoaderCircle className="spin" size={14} /> : <PlugZap size={14} />} MCP bağla</button>}
        {section === "plugin" && runningPlugins > 0 && <button onClick={() => void runCatalogAction("disconnect", () => window.devbox.disconnectPortablePlugins())} disabled={Boolean(busy)}>{busy === "disconnect" ? <LoaderCircle className="spin" size={14} /> : <CircleStop size={14} />} Bağlantıyı kes</button>}
      </div>
    </section>

    {!catalog ? <div className="advanced-empty compact"><LoaderCircle className="spin" size={22} /><strong>Katalog doğrulanıyor</strong><span>Yerel kaynaklar ve çalışma durumu okunuyor.</span></div>
      : items.length === 0 ? <div className="advanced-empty compact"><Activity size={22} /><strong>{query.trim() ? "Aramayla eşleşen kayıt yok" : "Doğrulanmış kayıt yok"}</strong><span>{query.trim() ? "Arama terimini değiştirin." : "Kaynak klasörünü seçin; DevBox bütünlük kontrolünden geçmeyen içeriği hazır göstermez."}</span></div>
      : <div className="catalog-v2-grid">{items.map((item) => <CatalogCard key={`${item.kind}:${item.id}`} item={item} />)}</div>}

    {catalog?.issues.length ? <section className="catalog-v2-issues"><header><ShieldCheck size={15} /><strong>Sınırlar ve çalışma notları</strong></header>{catalog.issues.map((issue) => <p key={issue}>{issue}</p>)}</section> : null}
    {error && <div className="inline-error">{error}</div>}
  </section>;
}

function CatalogCard({ item }: { item: CatalogItem }): ReactNode {
  return <article className={`catalog-v2-card ${runtimeClass(item)}`}>
    <header className="catalog-v2-card-head">
      <div className="catalog-v2-icon">{item.kind === "skill" ? <Sparkles size={17} /> : <PlugZap size={17} />}</div>
      <div className="catalog-v2-title"><strong>{item.productName}</strong><span>{item.publisher} · v{item.version}</span></div>
      <span className={`catalog-state ${runtimeClass(item)}`}>{runtimeLabel(item)}</span>
    </header>

    <p className="catalog-v2-description">{item.detail}</p>

    <div className="catalog-v2-badges">
      <span className={`catalog-trust ${trustClass(item)}`}><ShieldCheck size={12} /> {trustLabel(item)}</span>
      <span className={item.doctorState === "PASSED" ? "positive" : item.doctorState === "FAILED" ? "negative" : "neutral"}>{doctorLabel(item)}</span>
    </div>

    <dl className="catalog-v2-facts">
      <div><dt>Lisans</dt><dd>{item.license}</dd></div>
      <div><dt>Bütünlük</dt><dd>{sourceLabel(item)}</dd></div>
      <div><dt>Araç</dt><dd>{item.toolCount > 0 ? `${item.toolCount} canlı araç` : "Araç yok / bağlantı bekliyor"}</dd></div>
      <div><dt>İzin</dt><dd>{item.requestedPermissions.length === 0 ? "Host izni istemiyor" : `${item.grantedPermissions.length}/${item.requestedPermissions.length} izin verildi`}</dd></div>
    </dl>

    {item.health?.lastError && <div className="inline-error">Son çalışma hatası: {item.health.lastError}</div>}

    <details className="catalog-v2-details">
      <summary>Teknik ayrıntılar ve kanıt</summary>
      <dl>
        <div><dt>Kimlik</dt><dd><code>{item.id}</code></dd></div>
        <div><dt>Kaynak durumu</dt><dd><code>{item.sourceState}</code></dd></div>
        <div><dt>Runtime</dt><dd><code>{item.runtimeState}</code></dd></div>
        <div><dt>Doctor</dt><dd><code>{item.doctorState}</code></dd></div>
        <div><dt>Dağıtım</dt><dd>{item.redistributionAllowed ? "İzinli" : "Dağıtıma kapalı"}</dd></div>
      </dl>
      {item.requestedPermissions.length > 0 && <section><strong>İzinler</strong><div className="catalog-v2-permissions">{item.requestedPermissions.map((permission) => <span className={item.grantedPermissions.includes(permission) ? "granted" : "missing"} key={permission}>{item.grantedPermissions.includes(permission) ? "✓" : "×"} {permission}</span>)}</div></section>}
      {item.evidence.length > 0 && <section><strong>Kanıt</strong><div className="catalog-v2-evidence">{item.evidence.map((line) => <code key={line}>{line}</code>)}</div></section>}
    </details>

    {item.runtimeState === "RUNNING" && item.tools.length > 0 && <CatalogToolRunnerV2 pluginId={item.id} tools={item.tools} />}
  </article>;
}

function CatalogToolRunnerV2({ pluginId, tools }: { pluginId: string; tools: CatalogItem["tools"] }): ReactNode {
  const [toolName, setToolName] = useState(tools[0]?.name ?? "");
  const [argumentsText, setArgumentsText] = useState("{}");
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = tools.find((tool) => tool.name === toolName);

  const invoke = async (): Promise<void> => {
    setError(null);
    setOutput(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(argumentsText);
    } catch {
      setError("Araç girdisi geçerli JSON olmalıdır.");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setError("Araç girdisinin kökü bir JSON nesnesi olmalıdır.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.devbox.callCatalogTool({ pluginId, toolName, arguments: parsed as Record<string, unknown> });
      setOutput(JSON.stringify({ süreMs: result.durationMs, sonuç: result.result }, null, 2));
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setBusy(false);
    }
  };

  return <details className="catalog-v2-tool-runner">
    <summary><Play size={13} /> Canlı MCP aracını çalıştır</summary>
    <div className="catalog-v2-tool-body">
      <label><span>Araç</span><select value={toolName} onChange={(event) => setToolName(event.target.value)}>{tools.map((tool) => <option key={tool.name} value={tool.name}>{tool.name}</option>)}</select></label>
      {selected?.description && <p>{selected.description}</p>}
      <label><span>JSON girdisi</span><textarea value={argumentsText} onChange={(event) => setArgumentsText(event.target.value)} spellCheck={false} /></label>
      <button className="primary" onClick={() => void invoke()} disabled={busy || !toolName}>{busy ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />} Onayla ve çalıştır</button>
      {error && <div className="inline-error">{error}</div>}
      {output && <pre>{output}</pre>}
    </div>
  </details>;
}
