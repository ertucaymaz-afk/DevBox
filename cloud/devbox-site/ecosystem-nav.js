const STYLE_ID = "devbox-ecosystem-style";
const ROUTES = [
  { slug: "devapi-home", code: "H", title: "DevAPI Home", desc: "Ekosistem özeti, ürün kabiliyetleri ve gerçek durum sınırları." },
  { slug: "devapi-api", code: "A", title: "API Merkezi", desc: "Endpoint aileleri, auth, contract ve servis topolojisi." },
  { slug: "devapi-docs", code: "D", title: "Dokümantasyon", desc: "Kurulum, kullanım, örnek akışlar ve gerçek kontratlar." },
  { slug: "devapi-console", code: "C", title: "Developer Console", desc: "Control plane, yetki sınırları, komutlar ve audit görünümü." },
  { slug: "devapi-status", code: "S", title: "Status", desc: "Health, freshness, release gate ve production gerçekliği." },
  { slug: "devapi-studio", code: "ST", title: "API Studio", desc: "Servis tasarımı, akış planı ve doğrulama merkezli üretim." },
  { slug: "devapi-evolution", code: "E", title: "Evolution", desc: "Öğrenilen beceriler, seviye, finding ve gelişim izleri." },
  { slug: "devapi-workbench", code: "W", title: "Workbench", desc: "Task, reasoning özeti, diff, stream ve review çalışma alanı." },
  { slug: "devapi-memory", code: "M", title: "Memory", desc: "Kalıcı proje bağlamı, kararlar, kısıtlar ve retrieval yapısı." },
  { slug: "devapi-diagnostics", code: "DX", title: "Diagnostics", desc: "TypeScript, test, build, source truth ve release kanıtları." }
];

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = "/ecosystem.css";
  document.head.append(link);
}

function routeCards() {
  return ROUTES.map((item, index) => `
    <a class="eco-route" href="/${item.slug}">
      <div class="eco-route-icon">${item.code}</div>
      <i>${String(index + 1).padStart(2, "0")}</i>
      <small>DEVAPI SURFACE</small>
      <strong>${item.title}</strong>
      <span>${item.desc}</span>
    </a>`).join("");
}

function commandMarkup() {
  return `<div class="eco-command" id="ecoCommand" aria-hidden="true">
    <div class="eco-command-panel" role="dialog" aria-modal="true" aria-label="Ekosistem hızlı geçiş">
      <div class="eco-command-head"><span>⌘</span><input id="ecoCommandInput" type="search" placeholder="DevAPI yüzeyi ara..." autocomplete="off" /></div>
      <div class="eco-command-list" id="ecoCommandList">
        ${ROUTES.map((item) => `<a href="/${item.slug}" data-search="${item.title.toLocaleLowerCase("tr-TR")} ${item.desc.toLocaleLowerCase("tr-TR")}"><span class="eco-route-icon">${item.code}</span><div><b>${item.title}</b><span>${item.desc}</span></div><kbd>↵</kbd></a>`).join("")}
      </div>
    </div>
  </div>`;
}

function portalMarkup() {
  return `<section class="ecosystem-portal eco-reveal" id="ecosystem" aria-labelledby="ecosystem-title">
    <div class="eco-wrap">
      <span class="eco-kicker">11 yüzey · tek gerçeklik sözleşmesi</span>
      <div class="eco-heading">
        <h2 id="ecosystem-title">DevBox, DevAPI ve HotAPI.<br><em>Tek ekosistem, ayrı güven sınırları.</em></h2>
        <div><p>Bu portal çalışan kaynak ile canlı production durumunu birbirine karıştırmaz. DevAPI ve DevBox kabiliyetleri kaynak/CI kanıtıyla, production ise yalnız gerçek probe ile gösterilir. HotAPI ayrı ürün hattı olarak bağlanır.</p><button class="eco-command-button" id="ecoCommandButton" type="button">Hızlı geçiş · Ctrl/⌘ K</button></div>
      </div>

      <div class="eco-products">
        <article class="eco-product">
          <div class="eco-product-top"><span class="eco-logo">D/</span><span class="eco-badge source">SOURCE VERIFIED</span></div>
          <h3>DevBox</h3><p>Windows üzerinde sohbet, görev, gerçek dosya mutasyonu, Git/worktree, ConPTY, TypeScript LSP/DAP, hafıza, diff ve fail-closed release gate’i tek mühendislik yüzeyinde toplar.</p>
          <a href="https://github.com/ertucaymaz-afk/DevBox" target="_blank" rel="noreferrer">Kaynak kodu aç ↗</a>
        </article>
        <article class="eco-product">
          <div class="eco-product-top"><span class="eco-logo">A/</span><span class="eco-badge blocked" id="ecoDevApiStatus">PRODUCTION CHECK</span></div>
          <h3>DevAPI</h3><p>Desktop state/history, sanitized public-state, evolution bulguları, release gate ve sınırlı control-plane komutlarını kalıcı cloud sözleşmesine taşır.</p>
          <a href="https://devapi-virid.vercel.app" target="_blank" rel="noreferrer">Canlı DevAPI ↗</a>
        </article>
        <article class="eco-product">
          <div class="eco-product-top"><span class="eco-logo">H/</span><span class="eco-badge">AYRI ÜRÜN HATTI</span></div>
          <h3>HotAPI</h3><p>API üretimi, servis akışları, deployment hazırlığı ve ürünleştirme katmanı. Bu portal HotAPI için doğrulanmamış canlı seviye veya sahte READY değeri üretmez.</p>
          <a href="https://hotapi-six-gamma.vercel.app" target="_blank" rel="noreferrer">HotAPI yüzeyini aç ↗</a>
        </article>
      </div>

      <div class="eco-route-grid">${routeCards()}</div>

      <div class="eco-truth">
        <article class="eco-truth-card"><h3>DevAPI ne öğrendi, ne aşamada?</h3><p>Kaynak hattı API Evolution v7→v13, cloud continuity, deployment safety, command delivery, protocol compatibility, secret rotation ve dependency provenance gibi gelişim track’lerini kanıt kapılarıyla izler. Canlı değer varsa aşağıdaki özet public-state üzerinden güncellenir.</p>
          <div class="eco-meter"><div><span>Level</span><strong id="ecoLevel">—</strong></div><div><span>Score</span><strong id="ecoScore">—</strong></div><div><span>Findings</span><strong id="ecoFindings">—</strong></div><div><span>Release</span><strong id="ecoRelease">—</strong></div></div>
        </article>
        <article class="eco-truth-card"><h3>Araştırma / tasarım kaynakları</h3><p>Premium etkileşim dili için açık kaynak desenler incelenir; production’a kontrolsüz bağımlılık alınmaz. Mevcut statik site CSP ve performans sınırı korunur.</p><div class="eco-source-note"><span>Magic UI · MIT</span><span>shadcn/ui · MIT</span><span>Lucide · ISC</span><span>Motion · MIT</span><span>Kibo UI · MIT</span><span>native browser API</span></div></article>
      </div>
    </div>
  </section>`;
}

function installPortal() {
  const main = document.querySelector("main");
  if (!main || document.getElementById("ecosystem")) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = portalMarkup();
  const section = wrapper.firstElementChild;
  if (section) main.append(section);
  document.body.insertAdjacentHTML("beforeend", commandMarkup());
  bindCommand();
  observeReveals();
  void hydratePortalTruth();
}

function bindCommand() {
  const modal = document.getElementById("ecoCommand");
  const button = document.getElementById("ecoCommandButton");
  const input = document.getElementById("ecoCommandInput");
  const list = document.getElementById("ecoCommandList");
  if (!(modal instanceof HTMLElement) || !(input instanceof HTMLInputElement) || !(list instanceof HTMLElement)) return;
  const open = () => { modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); input.value = ""; filter(); setTimeout(() => input.focus(), 0); };
  const close = () => { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); };
  const filter = () => {
    const query = input.value.trim().toLocaleLowerCase("tr-TR");
    list.querySelectorAll("a").forEach((anchor) => { anchor.hidden = query.length > 0 && !String(anchor.getAttribute("data-search") || "").includes(query); });
  };
  button?.addEventListener("click", open);
  input.addEventListener("input", filter);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("tr-TR") === "k") { event.preventDefault(); modal.classList.contains("open") ? close() : open(); }
    if (event.key === "Escape" && modal.classList.contains("open")) close();
  });
}

function observeReveals() {
  const items = document.querySelectorAll(".eco-reveal:not(.visible)");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { items.forEach((item) => item.classList.add("visible")); return; }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); } });
  }, { rootMargin: "0px 0px -8%", threshold: .08 });
  items.forEach((item) => observer.observe(item));
}

async function hydratePortalTruth() {
  const status = document.getElementById("ecoDevApiStatus");
  try {
    const response = await fetch("/api/public-state", { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok || response.headers.get("x-devbox-public-state") !== "sanitized-proxy") throw new Error(`HTTP_${response.status}`);
    const data = await response.json();
    const freshness = data?.freshness ?? {};
    const evolution = data?.evolution ?? {};
    const findings = data?.findings ?? {};
    const gate = data?.releaseGate ?? {};
    const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
    set("ecoLevel", Number.isFinite(Number(evolution.lifetimeLevel)) ? String(evolution.lifetimeLevel) : "—");
    set("ecoScore", Number.isFinite(Number(evolution.score)) ? `${evolution.score}/100` : "—");
    set("ecoFindings", Number.isFinite(Number(findings.open)) ? String(findings.open) : "—");
    set("ecoRelease", String(gate.state || "Çalıştırılmadı"));
    if (status) { status.textContent = freshness.stale ? "PUBLIC STATE · STALE" : "PUBLIC STATE · LIVE"; status.className = freshness.stale ? "eco-badge blocked" : "eco-badge source"; }
  } catch {
    if (status) { status.textContent = "PRODUCTION · BLOCKED/UNAVAILABLE"; status.className = "eco-badge blocked"; }
  }
}

ensureStyle();
installPortal();
