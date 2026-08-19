import "./settings-v2.css";
import { Copy, Monitor, Moon, ShieldCheck, SquareTerminal, Sun, Upload, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { DEVBOX_DAY_THEME, DEVBOX_OBSIDIAN_THEME } from "../shared/theme-presets";
import type { AppSettings } from "../shared/contracts";

type Section = "appearance" | "behavior" | "permissions" | "terminal" | "advanced";

type Props = {
  settings: AppSettings | null;
  onSettings: (settings: AppSettings) => void;
  onClose: () => void;
};

function message(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^Error invoking remote method '[^']+':\s*/iu, "");
  return String(error);
}

export function SettingsWorkspaceV2({ settings, onSettings, onClose }: Props): ReactNode {
  const [section, setSection] = useState<Section>("appearance");
  const [portable, setPortable] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const patch = async (value: Parameters<typeof window.devbox.patchSettings>[0], busyKey = "save"): Promise<void> => {
    setBusy(busyKey);
    setNotice(null);
    try {
      const next = await window.devbox.patchSettings(value);
      onSettings(next);
      setNotice("Değişiklik yerel ayarlara kaydedildi ve çalışma yüzeyine uygulandı.");
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(null);
    }
  };

  if (!settings) {
    return <section className="advanced-page settings-v2"><div className="advanced-empty">Ayarlar yükleniyor…</div></section>;
  }

  const base = settings.theme.base;
  const permissionExplanation = settings.permissionProfile === "Tam erişim"
    ? "Seçili hedeflerde politika diyaloğu olmadan dosya, süreç ve ağ erişimi."
    : settings.permissionProfile === "Onaylı"
      ? "Workspace yazma açıktır; riskli ve uzak mutasyonlar ayrıca onay ister."
      : "Proje yazma, süreç ve ağ işlemlerinde kullanıcı onayı gerekir.";

  return <section className="advanced-page settings-v2">
    <div className="advanced-heading settings-v2-heading">
      <div><span className="advanced-eyebrow">DEVBOX DESIGN SYSTEM v2 · YEREL POLİTİKA</span><h1>Ayarlar</h1><p>Görünüm, davranış, izin ve terminal seçenekleri yalnız gerçekten desteklenen AppSettings sözleşmesinden gelir. Çalışmayan kontrol gösterilmez.</p></div>
      <div className="settings-heading-actions"><span className="settings-saved-state"><ShieldCheck size={13} /> Yerelde kayıtlı</span><button onClick={onClose} aria-label="Ayarları kapat"><X size={16} /></button></div>
    </div>

    <div className="settings-v2-layout">
      <nav className="settings-v2-nav" aria-label="Ayar kategorileri">
        <button className={section === "appearance" ? "active" : ""} onClick={() => setSection("appearance")}><Sun size={15} /><span>Görünüm</span></button>
        <button className={section === "behavior" ? "active" : ""} onClick={() => setSection("behavior")}><Monitor size={15} /><span>Davranış</span></button>
        <button className={section === "permissions" ? "active" : ""} onClick={() => setSection("permissions")}><ShieldCheck size={15} /><span>İzinler</span></button>
        <button className={section === "terminal" ? "active" : ""} onClick={() => setSection("terminal")}><SquareTerminal size={15} /><span>Terminal</span></button>
        <button className={section === "advanced" ? "active" : ""} onClick={() => setSection("advanced")}><Upload size={15} /><span>Gelişmiş</span></button>
      </nav>

      <div className="settings-v2-content">
        {section === "appearance" && <section className="settings-v2-panel">
          <header><div><span>GÖRÜNÜM</span><h2>Gece, gündüz veya sistem</h2></div><small>Tema değişimi yeniden başlatma istemez.</small></header>
          <div className="theme-presets theme-presets-v2" aria-label="Tema seçimi">
            <button className={base === "dark" ? "active" : ""} onClick={() => void patch({ theme: DEVBOX_OBSIDIAN_THEME }, "theme-dark")}><i className="theme-thumb dark"><Moon size={18} /></i><strong>Obsidian Flame</strong><span>Koyu teknik yüzey · alev kırmızısı</span></button>
            <button className={base === "light" ? "active" : ""} onClick={() => void patch({ theme: DEVBOX_DAY_THEME }, "theme-light")}><i className="theme-thumb light"><Sun size={18} /></i><strong>Porcelain Flame</strong><span>Sıcak porselen yüzey · krem nötrler</span></button>
            <button className={base === "system" ? "active" : ""} onClick={() => void patch({ theme: { base: "system", name: "Sistem" } }, "theme-system")}><i className="theme-thumb system"><Monitor size={18} /></i><strong>Sistem</strong><span>Windows açık/koyu tercihini canlı izler</span></button>
          </div>

          <div className="settings-v2-grid">
            <label><span>Vurgu rengi<small>Buton, seçim, focus ve aktif durumları etkiler.</small></span><div className="color-field"><input type="color" value={settings.theme.accent} onChange={(event) => void patch({ theme: { accent: event.target.value } }, "accent")} /><code>{settings.theme.accent.toUpperCase()}</code></div></label>
            <label><span>Kontrast<small>Yüksek kontrast erişilebilirlik katmanını etkinleştirir.</small></span><select value={settings.theme.contrast} onChange={(event) => void patch({ theme: { contrast: event.target.value as AppSettings["theme"]["contrast"] } }, "contrast")}><option value="normal">Normal</option><option value="high">Yüksek</option></select></label>
            <label><span>Arayüz yazı tipi</span><input value={settings.theme.uiFont} onChange={(event) => void patch({ theme: { uiFont: event.target.value || "Segoe UI Variable Text" } }, "ui-font")} /></label>
            <label><span>Kod yazı tipi</span><input value={settings.theme.codeFont} onChange={(event) => void patch({ theme: { codeFont: event.target.value || "Cascadia Code" } }, "code-font")} /></label>
            <div className="settings-switch-row"><span><strong>Hareketi azalt</strong><small>Animasyon ve dönüşümleri sistem genelinde sınırlar.</small></span><button className={`automation-toggle ${settings.reduceMotion ? "on" : ""}`} onClick={() => void patch({ reduceMotion: !settings.reduceMotion }, "motion")} aria-label="Hareketi azalt"><i /></button></div>
          </div>
        </section>}

        {section === "behavior" && <section className="settings-v2-panel">
          <header><div><span>DAVRANIŞ</span><h2>Başlangıç deneyimi</h2></div></header>
          <div className="settings-v2-grid single">
            <label><span>Başlangıç tanıtımı<small>Seçim SQLite ayar deposunda kalıcıdır.</small></span><select value={settings.launchIntroMode} onChange={(event) => { const mode = event.target.value as AppSettings["launchIntroMode"]; void patch({ launchIntroMode: mode, launchIntroSeen: mode === "once" ? false : settings.launchIntroSeen }, "intro"); }}><option value="once">Yalnız ilk açılışta</option><option value="always">Her açılışta</option><option value="never">Gösterme</option></select></label>
          </div>
        </section>}

        {section === "permissions" && <section className="settings-v2-panel">
          <header><div><span>İZİN VE SANDBOX</span><h2>Çalışma sınırları</h2></div><small>Profil, approval + sandbox + network politikasını atomik uygular.</small></header>
          <div className="settings-v2-grid single">
            <label><span>İzin profili</span><select value={settings.permissionProfile} onChange={(event) => void patch({ permissionProfile: event.target.value as AppSettings["permissionProfile"] }, "permission")}><option value="Salt okunur">Onay iste</option><option value="Onaylı">Benim için onayla</option><option value="Tam erişim">Tam erişim</option></select></label>
          </div>
          <div className="policy-summary"><p>{permissionExplanation}</p><dl><div><dt>Onay</dt><dd>{settings.approvalPolicy}</dd></div><div><dt>Sandbox</dt><dd>{settings.sandboxPolicy}</dd></div><div><dt>Ağ</dt><dd>{settings.networkAccess ? "Açık" : "Kapalı"}</dd></div></dl></div>
        </section>}

        {section === "terminal" && <section className="settings-v2-panel">
          <header><div><span>TERMINAL</span><h2>Windows ConPTY</h2></div><small>Yeni terminal oturumlarına uygulanır.</small></header>
          <div className="settings-v2-grid single"><label><span>Varsayılan kabuk</span><select value={settings.terminalShell} onChange={(event) => void patch({ terminalShell: event.target.value as AppSettings["terminalShell"] }, "terminal-shell")}><option value="pwsh">PowerShell 7 (pwsh)</option><option value="powershell">Windows PowerShell</option><option value="cmd">Komut İstemi</option></select></label></div>
        </section>}

        {section === "advanced" && <section className="settings-v2-panel">
          <header><div><span>GELİŞMİŞ</span><h2>Portable tema manifesti</h2></div><small>İçe aktarma DevBox theme şemasıyla doğrulanır.</small></header>
          <div className="portable-theme-v2"><textarea value={portable} onChange={(event) => setPortable(event.target.value)} placeholder="devbox-theme-v1:… veya güvenli codex-theme-v1:… manifesti" /><div><button onClick={() => void window.devbox.importTheme(portable).then((next) => { onSettings(next); setNotice("Tema doğrulandı ve içe aktarıldı."); }).catch((error) => setNotice(message(error)))} disabled={!portable.trim() || Boolean(busy)}><Upload size={14} /> İçe aktar</button><button onClick={() => void window.devbox.exportTheme().then((value) => { setPortable(value); void window.devbox.copyText(value); setNotice("Tema manifesti panoya kopyalandı."); }).catch((error) => setNotice(message(error)))} disabled={Boolean(busy)}><Copy size={14} /> Dışa aktar</button></div></div>
        </section>}

        {notice && <div className={/hata|failed|geçersiz|başarısız/iu.test(notice) ? "inline-error" : "inline-success"}>{notice}</div>}
      </div>
    </div>
  </section>;
}
