const EXPERIENCE_STYLE_ID = "devapi-experience-v2";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine)");

function ensureStylesheet(href) {
  if (document.getElementById(EXPERIENCE_STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = EXPERIENCE_STYLE_ID;
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

ensureStylesheet("/experience-v2.css");

document.documentElement.classList.add("devapi-experience-v2");

const progress = document.createElement("div");
progress.className = "devapi-scroll-progress";
progress.setAttribute("aria-hidden", "true");
document.body.append(progress);

const sections = [...document.querySelectorAll("main section[id]")];
const railLinks = [...document.querySelectorAll(".rail nav a[href^='#']")];
const panels = [...document.querySelectorAll("main .panel")];

function updateProgress() {
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const ratio = Math.max(0, Math.min(1, window.scrollY / max));
  progress.style.transform = `scaleX(${ratio})`;
}

function setActiveSection(id) {
  for (const link of railLinks) {
    link.classList.toggle("active", link.getAttribute("href") === `#${id}`);
  }
}

const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible?.target instanceof HTMLElement) setActiveSection(visible.target.id);
}, { rootMargin: "-18% 0px -58%", threshold: [0.1, 0.25, 0.5, 0.75] });
sections.forEach((section) => sectionObserver.observe(section));

const revealObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add("is-visible");
    revealObserver.unobserve(entry.target);
  }
}, { rootMargin: "0px 0px -6%", threshold: 0.08 });

panels.forEach((panel, index) => {
  panel.classList.add("devapi-reveal");
  panel.style.setProperty("--reveal-delay", `${Math.min(index, 8) * 32}ms`);
  revealObserver.observe(panel);
});

function animateMetric(node) {
  if (!(node instanceof HTMLElement) || reducedMotion.matches) return;
  const value = node.textContent?.trim() ?? "";
  const numeric = Number(value.replace(/[^0-9.-]/gu, ""));
  if (!Number.isFinite(numeric) || Math.abs(numeric) > 100000) return;
  node.animate(
    [{ transform: "translateY(3px)", opacity: 0.58 }, { transform: "translateY(0)", opacity: 1 }],
    { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" }
  );
}

const metricIds = ["level", "score", "coreProgress", "openFindings", "gateState", "heartbeat"];
const metricObserver = new MutationObserver((records) => {
  const touched = new Set(records.map((record) => record.target));
  for (const node of touched) animateMetric(node);
});
for (const id of metricIds) {
  const node = document.getElementById(id);
  if (node) metricObserver.observe(node, { childList: true, characterData: true, subtree: true });
}

let pointerFrame = 0;
function onPointerMove(event) {
  if (!finePointer.matches || reducedMotion.matches || document.hidden) return;
  if (pointerFrame) cancelAnimationFrame(pointerFrame);
  pointerFrame = requestAnimationFrame(() => {
    const x = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    const y = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    document.documentElement.style.setProperty("--pointer-x", x.toFixed(3));
    document.documentElement.style.setProperty("--pointer-y", y.toFixed(3));
  });
}

function syncMotionPreference() {
  document.documentElement.classList.toggle("reduce-motion", reducedMotion.matches);
  if (reducedMotion.matches) {
    document.documentElement.style.removeProperty("--pointer-x");
    document.documentElement.style.removeProperty("--pointer-y");
  }
}

window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("pointermove", onPointerMove, { passive: true });
reducedMotion.addEventListener("change", syncMotionPreference);
document.addEventListener("visibilitychange", () => {
  document.documentElement.classList.toggle("page-hidden", document.hidden);
});

syncMotionPreference();
updateProgress();
