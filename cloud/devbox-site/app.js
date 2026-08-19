const ENDPOINT = "/api/public-state";
const $ = (id) => document.getElementById(id);
const fields = {
  level: $("level"), stage: $("stage"), score: $("score"), findings: $("findings"), blocking: $("blocking"),
  gate: $("gate"), freshness: $("freshness"), core: $("core"), coreDetail: $("coreDetail"), pill: $("livePill"), error: $("liveError")
};
let timer = null;

function setUnavailable(message, state = "UNAVAILABLE") {
  fields.level.textContent = "—";
  fields.stage.textContent = "public state yok";
  fields.score.textContent = "—";
  fields.findings.textContent = "—";
  fields.blocking.textContent = "blocking: —";
  fields.gate.textContent = "—";
  fields.freshness.textContent = "snapshot doğrulanamadı";
  fields.core.textContent = "—";
  fields.coreDetail.textContent = "22 faz / 3362 görev";
  fields.pill.textContent = state;
  fields.pill.className = "state-pill error";
  fields.error.textContent = message;
  fields.error.classList.remove("hidden");
}

function render(data) {
  const evolution = data?.evolution ?? {};
  const findings = data?.findings ?? {};
  const gate = data?.releaseGate;
  const freshness = data?.freshness ?? {};
  const spec = evolution.spec ?? {};
  fields.level.textContent = Number.isFinite(Number(evolution.lifetimeLevel)) ? String(evolution.lifetimeLevel) : "—";
  fields.stage.textContent = evolution.stage || (evolution.isRunning ? "RUNNING" : "IDLE");
  fields.score.textContent = Number.isFinite(Number(evolution.score)) ? `${evolution.score}/100` : "—";
  fields.findings.textContent = Number.isFinite(Number(findings.open)) ? String(findings.open) : "—";
  fields.blocking.textContent = `blocking: ${Number.isFinite(Number(findings.blocking)) ? findings.blocking : "—"}`;
  fields.gate.textContent = gate?.state || "Çalıştırılmadı";
  fields.freshness.textContent = freshness.ageSeconds == null ? "snapshot zamanı yok" : freshness.stale ? `${freshness.ageSeconds}s · STALE` : `${freshness.ageSeconds}s · canlı`;
  fields.core.textContent = Number.isFinite(Number(spec.passCount)) && Number.isFinite(Number(spec.totalTaskCount)) ? `${spec.passCount}/${spec.totalTaskCount}` : "—";
  fields.coreDetail.textContent = Number(spec.remainingCount) === 0 ? "çekirdek tamam · adaptif bakım" : `${Number(spec.remainingCount || 0)} görev kaldı`;
  fields.pill.textContent = freshness.stale ? "STALE" : "READY";
  fields.pill.className = freshness.stale ? "state-pill pending" : "state-pill ready";
  fields.error.classList.add("hidden");
}

async function hydrateDevApiLinks() {
  try {
    const response = await fetch("/api/product-links", { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.devapi !== "string") return;
    const url = new URL(body.devapi);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return;
    document.querySelectorAll("a").forEach((anchor) => {
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const label = (anchor.textContent ?? "").toLocaleLowerCase("tr-TR");
      if (anchor.id === "devapiLink" || label.includes("devapi") || label.includes("control plane")) anchor.href = url.origin;
    });
  } catch {
    // Canonical fallback links remain usable; live metrics still fail closed through the same-origin proxy.
  }
}

async function refresh() {
  try {
    const response = await fetch(ENDPOINT, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP_${response.status}`);
    }
    if (response.headers.get("x-devbox-public-state") !== "sanitized-proxy") throw new Error("PUBLIC_STATE_PROXY_UNTRUSTED");
    render(await response.json());
  } catch (error) {
    setUnavailable(error instanceof Error ? error.message : String(error));
  }
}

function schedule() {
  if (timer !== null || document.hidden) return;
  void refresh();
  timer = window.setInterval(() => void refresh(), 15000);
}
function stop() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}

document.addEventListener("visibilitychange", () => document.hidden ? stop() : schedule());
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add("visible");
    observer.unobserve(entry.target);
  }
}, { rootMargin: "0px 0px -8%", threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
void hydrateDevApiLinks();
schedule();