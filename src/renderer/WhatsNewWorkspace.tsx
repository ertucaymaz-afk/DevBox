import {
  ArrowUpRight,
  CheckCircle2,
  Code2,
  GitBranch,
  Network,
  ShieldCheck,
  SquareTerminal,
  Sparkles,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

const RELEASE_URL = "https://github.com/ertucaymaz-afk/DevBox/releases/latest";
const ALL_RELEASES_URL = "https://github.com/ertucaymaz-afk/DevBox/releases";
const REPOSITORY_URL = "https://github.com/ertucaymaz-afk/DevBox";
const INSTAGRAM_URL = "https://www.instagram.com/yaaertu/";

const CHANGES: ReadonlyArray<{
  icon: ReactNode;
  title: string;
  detail: string;
  evidence: string;
}> = [
  {
    icon: <Code2 size={18} />,
    title: "Gerçek LSP ve DAP çalışma yüzeyi",
    detail: "TypeScript ve JavaScript tanıları gerçek dil sunucusu sürecinden gelir. Hata ayıklayıcı; seçilen gerçek adaptör üzerinden iş parçacığı, çağrı yığını, kapsam, değişken, kesme noktası ve yürütme kontrollerini yönetir.",
    evidence: "Adaptör veya dil sunucusu yoksa özellik hazır görünmez."
  },
  {
    icon: <Network size={18} />,
    title: "Dayanıklı uzak çalışan yaşam döngüsü",
    detail: "Tek kullanımlık eşleştirme kodu, iptal edilebilir kimlik, sağlık sinyali, süreli görev kiralaması ve kesintiden sonra yeniden kuyruğa alma davranışı kalıcı veritabanıyla birlikte çalışır.",
    evidence: "Komut izin listesi ve çalışma kökü sınırı gerçek API sözleşmesiyle uygulanır."
  },
  {
    icon: <SquareTerminal size={18} />,
    title: "Windows dayanıklılık kapısı",
    detail: "Temiz Windows sanal makinesinde işlemci, bellek ve giriş/çıkış yükü; süreç zaman aşımı, iptal, çıktı baskısı ve görev kiralaması çökmesi için gerçek GitHub Actions işi eklendi.",
    evidence: "Çalıştırılmayan bir dayanıklılık işi başarılı sayılmaz; kanıt dosyası yayımlanır."
  },
  {
    icon: <GitBranch size={18} />,
    title: "Daha temiz açık kaynak depo",
    detail: "GitHub kökü sadeleştirildi; topluluk, güvenlik, gizlilik, imzalama ve sürüm belgeleri Türkçe bir belge dizininde toplandı.",
    evidence: "Kaynak arşivi derleme çıktısı, yerel veri, anahtar ve önbellek içermez."
  }
];

export function WhatsNewWorkspace(): ReactNode {
  return (
    <section className="whats-new-page" aria-labelledby="whats-new-title">
      <div className="release-hero">
        <div className="release-visual" aria-hidden="true">
          <span className="release-orbit orbit-one"><i /></span>
          <span className="release-orbit orbit-two"><i /></span>
          <span className="release-core"><Sparkles size={27} /></span>
        </div>
        <div className="release-hero-copy">
          <p className="eyebrow">DEVBOX {__DEVBOX_VERSION__} · 14 AĞUSTOS 2026</p>
          <h1 id="whats-new-title">DevBox’ta neler değişti?</h1>
          <p>Bu ekran çevrim içi bir duyuruyu taklit etmez. Doğrudan kurduğunuz <strong>{__DEVBOX_VERSION__}</strong> sürümüyle birlikte gelen, kaynak kodu ve testleri bu depoda bulunan değişiklikleri özetler.</p>
          <div className="release-links">
            <a href={RELEASE_URL} target="_blank" rel="noreferrer"><GitBranch size={15} /> Son sürümü aç <ArrowUpRight size={14} /></a>
            <a href={ALL_RELEASES_URL} target="_blank" rel="noreferrer">Tüm sürüm notları <ArrowUpRight size={14} /></a>
          </div>
        </div>
      </div>

      <div className="release-grid">
        {CHANGES.map((change, index) => (
          <article className="release-card" key={change.title} style={{ "--release-order": index } as CSSProperties}>
            <span className="release-card-icon">{change.icon}</span>
            <div>
              <h2>{change.title}</h2>
              <p>{change.detail}</p>
              <small><CheckCircle2 size={13} /> {change.evidence}</small>
            </div>
          </article>
        ))}
      </div>

      <section className="release-trust">
        <ShieldCheck size={20} />
        <div>
          <strong>İmza durumu açıkça gösterilir</strong>
          <p>SignPath Foundation başvurusu dış incelemededir. Gerçek güven kökü sağlanana kadar Windows paketleri <code>İMZASIZ (NOT_SIGNED)</code> olarak yayımlanır; kendinden imzalı bir kimlik gerçek yayın sertifikası gibi sunulmaz.</p>
        </div>
      </section>

      <footer className="release-community">
        <div><strong>Gelişimi yakından izleyin</strong><span>Kaynak kod, sürümler ve doğrulanabilir değişiklik geçmişi herkese açıktır.</span></div>
        <nav aria-label="DevBox topluluk bağlantıları">
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">GitHub deposu <ArrowUpRight size={13} /></a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">@yaaertu <ArrowUpRight size={13} /></a>
        </nav>
      </footer>
    </section>
  );
}
