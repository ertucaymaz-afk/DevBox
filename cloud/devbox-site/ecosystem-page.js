const ROUTES = [
  { slug: "devapi-home", code: "H", short: "Home", title: "DevAPI Home" },
  { slug: "devapi-api", code: "A", short: "API", title: "API Merkezi" },
  { slug: "devapi-docs", code: "D", short: "Docs", title: "Dokümantasyon" },
  { slug: "devapi-console", code: "C", short: "Console", title: "Developer Console" },
  { slug: "devapi-status", code: "S", short: "Status", title: "Status" },
  { slug: "devapi-studio", code: "ST", short: "Studio", title: "API Studio" },
  { slug: "devapi-evolution", code: "E", short: "Evolution", title: "Evolution" },
  { slug: "devapi-workbench", code: "W", short: "Workbench", title: "Workbench" },
  { slug: "devapi-memory", code: "M", short: "Memory", title: "Memory" },
  { slug: "devapi-diagnostics", code: "DX", short: "Diagnostics", title: "Diagnostics" }
];

const PAGE = {
  "devapi-home": {
    kicker: "DEVAPI · EKOSİSTEM MERKEZİ", title: "Cloud kontrol düzlemini\n<em>ürün gerçeğiyle</em> oku.",
    lead: "DevAPI; DevBox masaüstünün snapshot, finding, release gate ve sınırlı control-plane komutlarını kalıcı cloud sözleşmesine taşır. Bu yüzey canlı production ile source doğrulamasını ayrı gösterir; Vercel READY etiketi tek başına yayın kanıtı sayılmaz.",
    center: "A/", centerLabel: "control plane",
    mini: [["Source", "v0.1.20"], ["Production", "fail-closed"], ["Protocol", "HMAC + ACK"]],
    cards: [
      ["01", "Gerçek durum sınırı", "Public-state yalnız sanitize edilmiş same-origin proxy sözleşmesi üzerinden ürün yüzeyine taşınır."],
      ["02", "Desktop continuity", "Snapshot ve history masaüstü kapansa bile kalıcı store üzerinde korunacak şekilde tasarlanır."],
      ["03", "Release evidence", "Deploy, canary, runtime scan ve rollback kanıtı eksikse READY yerine BLOCKED/UNAVAILABLE gösterilir."],
      ["04", "Ekosistem bağlantısı", "DevBox, DevAPI ve HotAPI aynı portalda görünür; ancak güven ve release sınırları ürün bazında ayrıdır."],
      ["05", "Türkçe ürün yüzeyi", "Teknik stage kodları gerektiğinde insan diline çevrilir; ham telemetry ana kullanıcı deneyimini işgal etmez."],
      ["06", "Kademeli gelişim", "Evolution track’leri bulgu → patch → test → verify → evidence zinciriyle ilerler."]
    ],
    capabilities: [
      ["PS", "Sanitized public-state", "Kimlik/sır sızdırmayan görünüm", "SOURCE CONTRACT"],
      ["ACK", "Command ACK", "PENDING → RETRYING → APPLIED / FAILED", "SOURCE CONTRACT"],
      ["RG", "Release gate", "Kanıtsız promotion reddi", "SOURCE VERIFIED"],
      ["DB", "Durable history", "Postgres state/history kontratı", "SOURCE CONTRACT"]
    ],
    timeline: [["v7", "Çekirdek graph", "3362 atomik görev ve çalışma fazları"], ["v8-v10", "Runtime sertleştirme", "recovery, finding ve provider sınırları"], ["v11-v12", "Cloud ekosistemi", "public-state, history ve ürün linkleri"], ["v13", "Production truth", "canonical URL ve evidence-driven release"]]
  },
  "devapi-api": {
    kicker: "DEVAPI · API MERKEZİ", title: "Endpoint saymak değil.\n<em>Sözleşme yönetmek.</em>",
    lead: "API Merkezi; health, product-links, sanitized public-state, admin komutları ve desktop ACK akışlarını aynı güven modelinde açıklar. Endpoint varlığı ile production doğruluğu ayrı ölçülür.",
    center: "API", centerLabel: "contract surface",
    mini: [["Auth", "scoped"], ["Public", "sanitized"], ["Admin", "bounded"]],
    cards: [
      ["01", "Health", "Servisin cevap verip vermediğini ve yapılandırma durumunu ayrı state’lerle açıklar."],
      ["02", "Public state", "Kullanıcı yüzeyinin ihtiyaç duyduğu minimum veriyi sanitize ederek sunar."],
      ["03", "Product links", "DevBox ve DevAPI canonical origin bağını runtime-configured sözleşme üzerinden taşır."],
      ["04", "Admin command", "Arbitrary shell yerine izinli evolution komutlarını açık bir schema ile sınırlar."],
      ["05", "Desktop ACK", "APPLIED sonucu yalnız gerçek desktop instance geri bildirimiyle kabul edilir."],
      ["06", "Compatibility", "Desktop ↔ cloud protokol sürümü ve backward/forward compatibility doğrulaması release gate’e bağlanır."]
    ],
    capabilities: [["GET", "Read surfaces", "health / product-links / public-state", "SOURCE CONTRACT"], ["POST", "Admin actions", "izinli command create", "GUARDED"], ["PATCH", "Desktop ACK", "HMAC-auth state transition", "GUARDED"], ["SC", "Schema", "sanitize + version compatibility", "SOURCE VERIFIED"]],
    timeline: [["Request", "Girdi doğrulama", "schema + auth + boundary"], ["Route", "Yetki ayrımı", "public / admin / desktop"], ["Store", "Kalıcı işlem", "state/history/command"], ["Evidence", "Kanıt", "status, audit ve release gate"]]
  },
  "devapi-docs": {
    kicker: "DEVAPI · DOKÜMANTASYON", title: "Kurulumdan release’e\n<em>tek teknik harita.</em>",
    lead: "Dokümantasyon yüzeyi pazarlama metni yerine davranış sözleşmesini öne çıkarır: hangi endpoint ne ister, hangi state ne anlama gelir, hangi durumda sistem bilinçli olarak BLOCKED kalır ve hangi kanıt release’i açar.",
    center: "DOC", centerLabel: "knowledge map",
    mini: [["Dil", "Türkçe"], ["Örnek", "contract"], ["Truth", "fail-closed"]],
    cards: [["01", "Quick start", "Desktop, DevAPI ve Vercel/Neon sınırlarını adım adım açıklar."], ["02", "Authentication", "Control-plane ve admin token sorumluluklarını, saklama sınırlarını ve rotation beklentisini tanımlar."], ["03", "API reference", "Request/response schema, hata state’leri ve idempotency kurallarını belgeler."], ["04", "Release runbook", "Staged deploy, promote, canary, runtime scan, rollback ve evidence sync sırasını gösterir."], ["05", "Troubleshooting", "READY, STALE, BLOCKED_EXTERNAL ve UNAVAILABLE gibi durumları neden/eylem eşlemesiyle açıklar."], ["06", "Security notes", "Secret sızıntısı, public-state sanitization ve cross-origin sınırlarını belgelendirir."]],
    capabilities: [["QS", "Quick Start", "ilk bağlantı ve doğrulama", "DOC SURFACE"], ["RF", "Reference", "endpoint + schema", "DOC SURFACE"], ["RB", "Runbooks", "production ve rollback", "DOC SURFACE"], ["SEC", "Security", "secret ve boundary", "DOC SURFACE"]],
    timeline: [["Başla", "Kurulum", "source + environment"], ["Bağlan", "Control plane", "auth + health"], ["Doğrula", "Contract", "public-state + ACK"], ["Yayınla", "Release", "evidence + rollback"]]
  },
  "devapi-console": {
    kicker: "DEVAPI · DEVELOPER CONSOLE", title: "Kontrol var.\n<em>Sınırsız yetki yok.</em>",
    lead: "Console, DevAPI control-plane üzerinde yalnız izinli yönetim aksiyonlarını görünür kılar. Token tarayıcı storage’ında kalıcı tutulmaz; state değişiklikleri gerçek backend cevabı olmadan başarılı gösterilmez.",
    center: "CTL", centerLabel: "bounded control",
    mini: [["Token", "ephemeral"], ["Actions", "allowlist"], ["Audit", "evidence"]],
    cards: [["01", "Project discovery", "Erişilebilir proje/state bağlamını backend üzerinden okur."], ["02", "Evolution controls", "setEnabled, run ve cancel gibi dar komut sözleşmelerini kullanır."], ["03", "Credential boundary", "Admin token session/local storage’a kalıcı yazılmadan kullanıcı girdisi olarak tutulur."], ["04", "Race protection", "Geç gelen refresh cevabının yeni state’i ezmesini engelleyen stale-response sınırı uygulanır."], ["05", "Command lifecycle", "İstek gönderildi demek APPLIED demek değildir; ACK ayrı state’tir."], ["06", "Audit visibility", "Kullanıcıya gizli token değil, güvenli işlem sonucu ve zaman bilgisi gösterilir."]],
    capabilities: [["ID", "Project context", "kimlik seçimi", "SOURCE CONTRACT"], ["RUN", "Evolution run", "izinli command", "GUARDED"], ["CAN", "Cancel", "bounded cancellation", "GUARDED"], ["ACK", "Result", "desktop-confirmed transition", "FAIL-CLOSED"]],
    timeline: [["Input", "Kimlik + token", "ephemeral credential"], ["Validate", "Yetki", "server-side auth"], ["Command", "Queue", "durable command row"], ["ACK", "Desktop", "APPLIED / FAILED"]]
  },
  "devapi-status": {
    kicker: "DEVAPI · STATUS", title: "Yeşil nokta değil.\n<em>Kanıtlı sağlık.</em>",
    lead: "Status yüzeyi Vercel deployment READY, gerçek API health, public-state freshness, release gate ve runtime kanıtını ayrı ayrı gösterir. Birinin yeşil olması diğerlerinin otomatik PASS olduğu anlamına gelmez.",
    center: "S", centerLabel: "truth status",
    mini: [["Deploy", "provider"], ["Runtime", "probe"], ["Gate", "evidence"]],
    cards: [["01", "Provider state", "Vercel deployment durumunu platform sağlayıcısı açısından raporlar."], ["02", "Canonical probe", "Gerçek canonical origin üzerinden beklenen ürün sürümü ve endpoint zincirini doğrular."], ["03", "Freshness", "Snapshot yaşını ölçer; eski veri READY yerine STALE görünür."], ["04", "Runtime scan", "Yeni deployment ID’lerine bağlı error/fatal/5xx kanıtını kontrol eder."], ["05", "Rollback", "Promotion öncesi doğrulanmış baseline deployment’ı geri dönüş adayı olarak tutar."], ["06", "Release verdict", "Tüm kanıtlar tamamlanmadan production-ready sonucu üretmez."]],
    capabilities: [["DEP", "Deployment", "provider readiness", "INDEPENDENT"], ["HTTP", "Canonical probe", "real HTTP contract", "REQUIRED"], ["LOG", "Runtime scan", "error/fatal/5xx", "REQUIRED"], ["RG", "Release gate", "combined evidence", "FAIL-CLOSED"]],
    timeline: [["Stage", "Preview deploy", "isolated candidate"], ["Probe", "Smoke", "health + contract"], ["Promote", "Production", "canonical mapping"], ["Verify", "Runtime", "logs + evidence"]]
  },
  "devapi-studio": {
    kicker: "DEVAPI · API STUDIO", title: "Servisi çiz.\n<em>Kanıtı da tasarla.</em>",
    lead: "API Studio, yeni servis ve endpoint fikirlerini schema, auth, idempotency, observability ve release gereksinimleriyle birlikte tasarlayan ürün yüzeyidir. Bu sayfa çalışan backend capability olmayan aksiyonu ‘çalışıyor’ diye sunmaz.",
    center: "ST", centerLabel: "service design",
    mini: [["Input", "schema"], ["Flow", "bounded"], ["Ship", "gated"]],
    cards: [["01", "Contract designer", "Girdi/çıktı schema ve hata durumlarını endpoint’ten önce tanımlar."], ["02", "Auth profile", "Public, user, admin ve machine-to-machine sınırlarını seçilebilir profile dönüştürür."], ["03", "Flow map", "Store, queue, worker, callback ve ACK adımlarını görsel akışa taşır."], ["04", "Test plan", "Unit, contract, failure-injection ve e2e gereksinimlerini servis tanımıyla eşler."], ["05", "Observability", "Log, metric ve release evidence gereksinimini ilk tasarımın parçası yapar."], ["06", "Deployment readiness", "Secret, migration, rollback ve canary eksikse publish eylemini kilitli gösterir."]],
    capabilities: [["SC", "Schema", "request/response", "DESIGN"], ["AU", "Auth", "permission profile", "DESIGN"], ["TP", "Test plan", "failure + contract", "DESIGN"], ["DR", "Deploy readiness", "evidence checklist", "FAIL-CLOSED"]],
    timeline: [["Define", "Contract", "schema + auth"], ["Compose", "Flow", "service graph"], ["Verify", "Tests", "contract + failure"], ["Promote", "Release", "canary + evidence"]]
  },
  "devapi-evolution": {
    kicker: "DEVAPI · EVOLUTION", title: "Seviye yalnız sayı değil.\n<em>Kanıt zinciri.</em>",
    lead: "Evolution yüzeyi sistemin hangi track’lerde geliştiğini, hangi finding’lerin açık kaldığını ve hangi ilerlemenin gerçek doğrulamayla kabul edildiğini gösterir. Lifetime level veya score yalnız canlı sanitized snapshot mevcutsa dinamik gösterilir.",
    center: "∞", centerLabel: "adaptive loop",
    mini: [["Graph", "3362"], ["Tracks", "evidence"], ["Loop", "adaptive"]],
    cards: [["01", "Finding discovery", "Repository ve runtime kanıtından somut geliştirme bulguları çıkarır."], ["02", "Risk selection", "Öncelik, risk ve doğrulanabilir etki üzerinden sıradaki işi seçer."], ["03", "Isolated mutation", "Worktree/branch sınırı ile değişiklikleri kullanıcı işinden ayırır."], ["04", "Verification", "TypeScript, test, build, cloud ve release verifier zincirini çalıştırır."], ["05", "Evidence promotion", "Sadece kanıtlı iyileştirme lifetime ilerlemeye eklenir."], ["06", "Recovery", "Stale RUNNING veya yarım görev state’i başarı sayılmaz; recovery durumuna alınır."]],
    capabilities: [["CC", "Cloud continuity", "snapshot + restart", "TRACK"], ["DS", "Deployment safety", "staged + rollback", "TRACK"], ["PC", "Protocol compatibility", "desktop ↔ cloud", "TRACK"], ["DP", "Dependency provenance", "source/binary trust", "TRACK"]],
    timeline: [["Find", "Bulgu", "source/runtime evidence"], ["Patch", "Mutasyon", "isolated worktree"], ["Test", "Doğrulama", "targeted + regression"], ["Learn", "Terfi", "evidence-backed level"]]
  },
  "devapi-workbench": {
    kicker: "DEVAPI · WORKBENCH", title: "Görev, diff, karar.\n<em>Aynı çalışma izi.</em>",
    lead: "Workbench; DevBox’un agent/thread/worktree yaklaşımını cloud durumu ve kanıt görünürlüğüyle birleştiren çalışma yüzeyidir. Hedef, Codex tarzı paralel görev denetimini kopyalamak değil; DevBox’un gerçek Windows mühendislik altyapısıyla aynı sınıf iş akışını kurmaktır.",
    center: "W", centerLabel: "agent workbench",
    mini: [["Threads", "isolated"], ["Diff", "review"], ["Tasks", "parallel"]],
    cards: [["01", "Task queue", "Projeye bağlı uzun görevleri thread ve durum bilgisiyle düzenler."], ["02", "Parallel agents", "Farklı görevlerin izole worktree/branch üzerinde birbirini ezmeden ilerlemesini hedefler."], ["03", "Diff review", "Agent değişikliklerini dosya/diff ve doğrulama sonucu ile birlikte inceler."], ["04", "Decision summary", "Gizli chain-of-thought yerine kullanıcıya güvenli plan, karar özeti ve kanıt gösterir."], ["05", "Terminal evidence", "Komut çıktısı, exit code ve iptal state’ini görev kanıtına bağlar."], ["06", "Handoff", "Yarım kalan görevi source SHA, branch, test ve blokaj bilgisiyle sürdürülebilir hale getirir."]],
    capabilities: [["TH", "Thread isolation", "project/task context", "DEVBOX SOURCE"], ["WT", "Worktree", "parallel repo state", "DEVBOX SOURCE"], ["DF", "Diff review", "change evidence", "PRODUCT DIRECTION"], ["TA", "Task audit", "state + command evidence", "PRODUCT DIRECTION"]],
    timeline: [["Assign", "Görev", "project + thread"], ["Execute", "Agent", "worktree + tools"], ["Review", "Diff", "tests + evidence"], ["Accept", "Merge", "human/release gate"]]
  },
  "devapi-memory": {
    kicker: "DEVAPI · MEMORY", title: "Hatırlamak değil.\n<em>Doğru bağlamı geri çağırmak.</em>",
    lead: "Memory yüzeyi DevBox’un SQLite + FTS5 tabanlı yerel hafızası ile DevAPI’nin kalıcı cloud state/history katmanını kavramsal olarak ayırır. Secret veya hassas credential ‘hafıza’ bahanesiyle kullanıcı yüzeyine taşınmaz.",
    center: "M", centerLabel: "context memory",
    mini: [["Local", "SQLite"], ["Search", "FTS5"], ["Cloud", "history"]],
    cards: [["01", "Constraint", "Proje ve kullanıcı kısıtlarını tekrar kullanılabilir bağlama dönüştürür."], ["02", "Preference", "Arayüz/iş akışı tercihlerini kontrollü kapsamda saklar."], ["03", "Decision", "Teknik kararların neden/sonuç özetini sonraki görevler için erişilebilir tutar."], ["04", "Context", "Gerekli proje bilgisini semantic/FTS retrieval ile görev anında toplar."], ["05", "Cloud history", "Desktop snapshot geçmişini Postgres üzerinde ayrı lifecycle ile tutar."], ["06", "Secret filter", "Credential, token ve hassas değerlerin memory/public-state içine sızmasını engeller."]],
    capabilities: [["FTS", "Search", "bounded retrieval", "DEVBOX SOURCE"], ["DD", "Dedup", "duplicate memory control", "DEVBOX SOURCE"], ["PR", "Pruning", "retention boundary", "DEVBOX SOURCE"], ["SF", "Secret filter", "sensitive-data guard", "FAIL-CLOSED"]],
    timeline: [["Capture", "Aday bilgi", "scope + sensitivity"], ["Normalize", "Hafıza", "type + dedup"], ["Index", "Search", "SQLite/FTS"], ["Retrieve", "Görev", "minimum relevant context"]]
  },
  "devapi-diagnostics": {
    kicker: "DEVAPI · DIAGNOSTICS", title: "PASS yazmak kolay.\n<em>Kanıtlamak zor.</em>",
    lead: "Diagnostics; TypeScript, test, build, source hygiene, cloud contract, promoter, desktop canary ve product truth sonuçlarını tek doğrulama haritasında toplar. Bir gate koşmadıysa PASS yerine açıkça ‘çalıştırılmadı / blocked’ gösterilmelidir.",
    center: "DX", centerLabel: "verification map",
    mini: [["TS", "typecheck"], ["Tests", "regression"], ["Build", "truth"]],
    cards: [["01", "Source hygiene", "Geçici materializer, placeholder veya yanlış kaynak artefact’larını kalıcı source’tan ayırır."], ["02", "TypeScript", "Node ve renderer typecheck’i ayrı compiler projeleriyle çalıştırır."], ["03", "Regression", "Servis, security, renderer ve contract testlerini fail-closed çalıştırır."], ["04", "Build truth", "Production Vite/Electron build ve paketlenen dosya sınırını doğrular."], ["05", "Cloud verifier", "Public-state, headers, product-links ve forward-compatible cloud sözleşmesini kontrol eder."], ["06", "Release evidence", "Production kanıtı eksikse installer/release aşamasını bloklar."]],
    capabilities: [["TS", "TypeScript", "node + renderer", "REQUIRED"], ["VT", "Vitest", "regression suite", "REQUIRED"], ["BLD", "Build", "production output", "REQUIRED"], ["TR", "Truth audit", "packaged source guard", "REQUIRED"]],
    timeline: [["Source", "Hygiene", "canonical files"], ["Compile", "Typecheck", "node + renderer"], ["Verify", "Tests", "service + security"], ["Build", "Artifact", "truth + release gate"]]
  }
};

function currentSlug() {
  const slug = location.pathname.replace(/^\/+|\/+$/g, "");
  return PAGE[slug] ? slug : "devapi-home";
}

function badgeClass(value) {
  return /BLOCK|FAIL|GUARD/i.test(value) ? "blocked" : /VERIFIED|REQUIRED|SOURCE|DEVBOX/i.test(value) ? "verified" : "";
}

function renderTopNav(slug) {
  const nav = document.getElementById("ecoTopNav");
  if (!nav) return;
  nav.innerHTML = ROUTES.map((item) => `<a class="${item.slug === slug ? "current" : ""}" href="/${item.slug}">${item.short}</a>`).join("");
}

function cards(items) {
  return items.map(([n, title, text]) => `<article class="eco-info-card eco-reveal"><span class="n">${n}</span><small>PRODUCT DETAIL</small><h3>${title}</h3><p>${text}</p></article>`).join("");
}

function capabilities(items) {
  return items.map(([code, title, text, status]) => `<article class="eco-reveal"><span class="ico">${code}</span><div><h3>${title}</h3><p>${text}</p></div><b class="${badgeClass(status)}">${status}</b></article>`).join("");
}

function timeline(items) {
  return items.map(([time, title, text]) => `<article class="eco-reveal"><time>${time}</time><div><h3>${title}</h3><p>${text}</p></div><b>→</b></article>`).join("");
}

function pageMarkup(slug, page) {
  return `
    <section class="eco-page-hero">
      <div class="eco-reveal visible">
        <div class="eco-breadcrumb"><a href="/">DevBox</a><span>/</span><a href="/devapi-home">DevAPI</a><span>/</span><strong>${ROUTES.find((item) => item.slug === slug)?.title ?? "Home"}</strong></div>
        <span class="eco-kicker">${page.kicker}</span>
        <h1>${page.title.replace("\n", "<br>")}</h1>
        <p class="lead">${page.lead}</p>
        <div class="eco-source-note"><span>NO FAKE READY</span><span>FAIL-CLOSED</span><span>CANONICAL SOURCE</span><span>TR / responsive</span></div>
      </div>
      <aside class="eco-hero-panel eco-reveal visible" aria-label="${page.centerLabel}">
        <div class="eco-orbit"></div><div class="eco-hero-center"><strong>${page.center}</strong><span>${page.centerLabel}</span></div>
        <div class="eco-hero-mini">${page.mini.map(([a,b]) => `<div><span>${a}</span><b>${b}</b></div>`).join("")}</div>
      </aside>
    </section>

    <section class="eco-section" id="live-state">
      <div class="eco-section-head eco-reveal"><h2>Canlı gerçeklik paneli</h2><p>Bu bölüm yalnız same-origin sanitize edilmiş DevAPI public-state cevabı güvenilir olduğunda değer doldurur. Endpoint yoksa veya proxy marker doğrulanmazsa UNAVAILABLE gösterilir.</p></div>
      <div class="eco-live-board eco-reveal">
        <article><span>Public state</span><strong id="ecoLiveState">CHECKING</strong><small id="ecoLiveFresh">snapshot bekleniyor</small></article>
        <article><span>Evolution level</span><strong id="ecoLiveLevel">—</strong><small id="ecoLiveStage">—</small></article>
        <article><span>Score</span><strong id="ecoLiveScore">—</strong><small>kanıtlı kapsam</small></article>
        <article><span>Findings</span><strong id="ecoLiveFindings">—</strong><small id="ecoLiveBlocking">blocking: —</small></article>
        <article><span>Release gate</span><strong id="ecoLiveGate">—</strong><small>combined evidence</small></article>
      </div>
      <p class="eco-live-note" id="ecoLiveNote">Canlı probe başlatılıyor.</p>
    </section>

    <section class="eco-section">
      <div class="eco-section-head eco-reveal"><h2>Ürün yüzeyi</h2><p>Her kart bu alt sitenin kullanıcıya açıklaması gereken gerçek ürün sınırını temsil eder. Çalışmayan buton veya uydurma telemetry yerine açık durum sözleşmesi kullanılır.</p></div>
      <div class="eco-card-grid">${cards(page.cards)}</div>
    </section>

    <section class="eco-section">
      <div class="eco-section-head eco-reveal"><h2>Kabiliyet haritası</h2><p>Durum etiketleri ‘live’ iddiası değildir. SOURCE/DEVBOX ifadeleri doğrulanmış kaynak sözleşmesini, GUARDED/FAIL-CLOSED ise güven sınırını belirtir.</p></div>
      <div class="eco-capability">${capabilities(page.capabilities)}</div>
    </section>

    <section class="eco-section">
      <div class="eco-section-head eco-reveal"><h2>Akış ve gelişim izi</h2><p>DevAPI yüzeyleri aynı tasarım diliyle bağlanır; ancak her akış kendi kaynak, runtime ve release kanıtı üzerinden değerlendirilir.</p></div>
      <div class="eco-timeline">${timeline(page.timeline)}</div>
    </section>

    <section class="eco-section">
      <div class="eco-section-head eco-reveal"><h2>Ekosistem geçişleri</h2><p>On alt yüzey tek domain altında çalışır. DevBox ana portalına, gerçek DevAPI production yüzeyine ve ayrı HotAPI hattına güvenli linklerle geçilir.</p></div>
      <div class="eco-route-grid">${ROUTES.map((item, index) => `<a class="eco-route ${item.slug === slug ? "current" : ""}" href="/${item.slug}"><div class="eco-route-icon">${item.code}</div><i>${String(index+1).padStart(2,"0")}</i><small>DEVAPI SURFACE</small><strong>${item.title}</strong><span>${item.slug === slug ? "Şu an bu yüzeydesin." : "Bağlı ürün yüzeyini aç."}</span></a>`).join("")}</div>
    </section>`;
}

function commandMarkup() {
  return `<div class="eco-command" id="ecoCommand" aria-hidden="true"><div class="eco-command-panel" role="dialog" aria-modal="true" aria-label="Ekosistem hızlı geçiş"><div class="eco-command-head"><span>⌘</span><input id="ecoCommandInput" type="search" placeholder="Alt site ara..." autocomplete="off" /></div><div class="eco-command-list" id="ecoCommandList">${ROUTES.map((item) => `<a href="/${item.slug}" data-search="${item.title.toLocaleLowerCase("tr-TR")} ${item.short.toLocaleLowerCase("tr-TR")}"><span class="eco-route-icon">${item.code}</span><div><b>${item.title}</b><span>DevBox ekosistemine bağlı DevAPI yüzeyi</span></div><kbd>↵</kbd></a>`).join("")}</div></div></div>`;
}

function bindCommand() {
  document.body.insertAdjacentHTML("beforeend", commandMarkup());
  const modal = document.getElementById("ecoCommand");
  const button = document.getElementById("ecoCommandButton");
  const input = document.getElementById("ecoCommandInput");
  const list = document.getElementById("ecoCommandList");
  if (!(modal instanceof HTMLElement) || !(input instanceof HTMLInputElement) || !(list instanceof HTMLElement)) return;
  const filter = () => { const q = input.value.trim().toLocaleLowerCase("tr-TR"); list.querySelectorAll("a").forEach((a) => { a.hidden = q.length > 0 && !String(a.getAttribute("data-search") || "").includes(q); }); };
  const open = () => { modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); input.value = ""; filter(); setTimeout(() => input.focus(), 0); };
  const close = () => { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); };
  button?.addEventListener("click", open); input.addEventListener("input", filter); modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); modal.classList.contains("open") ? close() : open(); } if (e.key === "Escape") close(); });
}

function observe() {
  const items = document.querySelectorAll(".eco-reveal:not(.visible)");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { items.forEach((item) => item.classList.add("visible")); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("visible"); io.unobserve(entry.target); } }), { threshold: .08, rootMargin: "0px 0px -7%" });
  items.forEach((item) => io.observe(item));
}

function setText(id, value) { const node = document.getElementById(id); if (node) node.textContent = value; }

async function hydrateLive() {
  const note = document.getElementById("ecoLiveNote");
  try {
    const response = await fetch("/api/public-state", { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    if (response.headers.get("x-devbox-public-state") !== "sanitized-proxy") throw new Error("PUBLIC_STATE_PROXY_UNTRUSTED");
    const data = await response.json();
    const e = data?.evolution ?? {}; const f = data?.findings ?? {}; const g = data?.releaseGate ?? {}; const fr = data?.freshness ?? {};
    setText("ecoLiveState", fr.stale ? "STALE" : "LIVE");
    setText("ecoLiveFresh", fr.ageSeconds == null ? "zaman yok" : `${fr.ageSeconds}s`);
    setText("ecoLiveLevel", Number.isFinite(Number(e.lifetimeLevel)) ? String(e.lifetimeLevel) : "—");
    setText("ecoLiveStage", String(e.stage || (e.isRunning ? "RUNNING" : "IDLE")));
    setText("ecoLiveScore", Number.isFinite(Number(e.score)) ? `${e.score}/100` : "—");
    setText("ecoLiveFindings", Number.isFinite(Number(f.open)) ? String(f.open) : "—");
    setText("ecoLiveBlocking", `blocking: ${Number.isFinite(Number(f.blocking)) ? f.blocking : "—"}`);
    setText("ecoLiveGate", String(g.state || "Çalıştırılmadı"));
    if (note) { note.textContent = fr.stale ? "Sanitized snapshot doğrulandı ancak güncelliğini yitirmiş durumda; READY kabul edilmedi." : "Sanitized same-origin public-state doğrulandı."; note.classList.toggle("error", Boolean(fr.stale)); }
  } catch (error) {
    setText("ecoLiveState", "UNAVAILABLE"); setText("ecoLiveFresh", "doğrulanamadı"); setText("ecoLiveLevel", "—"); setText("ecoLiveStage", "—"); setText("ecoLiveScore", "—"); setText("ecoLiveFindings", "—"); setText("ecoLiveBlocking", "blocking: —"); setText("ecoLiveGate", "—");
    if (note) { note.textContent = `Canlı public-state doğrulanamadı: ${error instanceof Error ? error.message : String(error)}. Sahte değer gösterilmedi.`; note.classList.add("error"); }
  }
}

const slug = currentSlug();
const page = PAGE[slug];
const root = document.getElementById("ecoPageRoot");
if (root) root.innerHTML = pageMarkup(slug, page);
document.title = `${ROUTES.find((item) => item.slug === slug)?.title ?? "DevAPI"} · DevBox Ekosistemi`;
renderTopNav(slug); bindCommand(); observe(); void hydrateLive();
