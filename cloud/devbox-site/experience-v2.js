const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine)");

function ensureStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}
ensureStylesheet("/experience-v2.css");

const progress = document.createElement("div");
progress.className = "page-progress";
progress.setAttribute("aria-hidden", "true");
document.body.prepend(progress);

let raf = 0;
function updateScroll() {
  raf = 0;
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  document.documentElement.style.setProperty("--page-progress", String(Math.min(1, Math.max(0, scrollY / max))));
  document.documentElement.style.setProperty("--page-y", `${Math.min(scrollY, 1800)}px`);
}
addEventListener("scroll", () => {
  if (raf || document.hidden) return;
  raf = requestAnimationFrame(updateScroll);
}, { passive: true });
updateScroll();

const heroVisual = document.querySelector(".hero-visual");
if (heroVisual instanceof HTMLElement && finePointer.matches && !reducedMotion.matches) {
  heroVisual.addEventListener("pointermove", (event) => {
    const rect = heroVisual.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    heroVisual.style.setProperty("--pointer-x", x.toFixed(3));
    heroVisual.style.setProperty("--pointer-y", y.toFixed(3));
  }, { passive: true });
  heroVisual.addEventListener("pointerleave", () => {
    heroVisual.style.setProperty("--pointer-x", "0");
    heroVisual.style.setProperty("--pointer-y", "0");
  });
}

document.querySelectorAll(".bento > article,.release-rail > article,.evo-tracks > div").forEach((element, index) => {
  if (element instanceof HTMLElement) element.style.setProperty("--stagger", String(index));
});

const liveFields = ["level", "score", "findings", "gate", "core"].map((id) => document.getElementById(id)).filter(Boolean);
const metricObserver = new MutationObserver((records) => {
  if (reducedMotion.matches) return;
  for (const record of records) {
    const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
    target?.animate([
      { opacity: .42, transform: "translateY(4px)" },
      { opacity: 1, transform: "translateY(0)" }
    ], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
});
liveFields.forEach((element) => metricObserver.observe(element, { childList: true, characterData: true, subtree: true }));

const sections = [...document.querySelectorAll("main > section[id]")];
const navLinks = [...document.querySelectorAll('.nav-shell nav a[href^="#"]')];
if (sections.length && navLinks.length) {
  const sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible?.target.id) return;
    navLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
  }, { rootMargin: "-20% 0px -66%", threshold: [0, .15, .4] });
  sections.forEach((section) => sectionObserver.observe(section));
}

document.addEventListener("visibilitychange", () => {
  document.documentElement.classList.toggle("page-hidden", document.hidden);
  if (!document.hidden) updateScroll();
});
