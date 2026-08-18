const DEVAPI_ORIGIN = "https://devapi-virid.vercel.app";
const ENDPOINT = `${DEVAPI_ORIGIN}/api/v1/public-state`;
const $ = (id) => document.getElementById(id);
const fields = { level: $("level"), stage: $("stage"), score: $("score"), findings: $("findings"), blocking: $("blocking"), gate: $("gate"), freshness: $("freshness"), pill: $("livePill"), error: $("liveError") };
let timer = null;
function setUnavailable(message, state = "UNAVAILABLE") {
  fields.level.textContent = "—"; fields.stage.textContent = "public state yok"; fields.score.textContent = "—"; fields.findings.textContent = "—"; fields.blocking.textContent = "blocking: —"; fields.gate.textContent = "—"; fields.freshness.textContent = "snapshot doğrulanamadı";
  fields.pill.textContent = state; fields.pill.className = "pill error"; fields.error.textContent = message; fields.error.classList.remove("hidden");
}
function render(data) {
  const evolution = data?.evolution ?? {}; const findings = data?.findings ?? {}; const gate = data?.releaseGate; const freshness = data?.freshness ?? {};
  fields.level.textContent = Number.isFinite(Number(evolution.lifetimeLevel)) ? String(evolution.lifetimeLevel) : "—";
  fields.stage.textContent = evolution.stage || (evolution.isRunning ? "RUNNING" : "IDLE");
  fields.score.textContent = Number.isFinite(Number(evolution.score)) ? `${evolution.score}/100` : "—";
  fields.findings.textContent = Number.isFinite(Number(findings.open)) ? String(findings.open) : "—";
  fields.blocking.textContent = `blocking: ${Number.isFinite(Number(findings.blocking)) ? findings.blocking : "—"}`;
  fields.gate.textContent = gate?.state || "Çalıştırılmadı";
  fields.freshness.textContent = freshness.ageSeconds == null ? "snapshot zamanı yok" : freshness.stale ? `${freshness.ageSeconds}s · STALE` : `${freshness.ageSeconds}s · canlı`;
  fields.pill.textContent = freshness.stale ? "STALE" : "READY"; fields.pill.className = freshness.stale ? "pill pending" : "pill ready"; fields.error.classList.add("hidden");
}
async function refresh() {
  try {
    const response = await fetch(ENDPOINT, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || `HTTP_${response.status}`); }
    render(await response.json());
  } catch (error) { setUnavailable(error instanceof Error ? error.message : String(error)); }
}
function schedule() { if (timer !== null || document.hidden) return; void refresh(); timer = window.setInterval(() => void refresh(), 15000); }
function stop() { if (timer !== null) window.clearInterval(timer); timer = null; }
document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else schedule(); });
const observer = new IntersectionObserver((entries) => { for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); } }, { rootMargin: "0px 0px -8%", threshold: .12 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
schedule();
