const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const revealItems = [...document.querySelectorAll('[data-reveal]')];
if (reducedMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((node) => node.classList.add('in'));
} else {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.13, rootMargin: '0px 0px -5% 0px' });
  revealItems.forEach((node) => revealObserver.observe(node));
}

const nav = document.querySelector('[data-nav-links]');
const toggle = document.querySelector('[data-menu-toggle]');
if (nav && toggle) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLAnchorElement)) return;
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  });
}

const navLinks = [...document.querySelectorAll('[data-nav-links] a[href^="#"]')];
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);
if ('IntersectionObserver' in window && sections.length) {
  const navObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => {
      const active = link.getAttribute('href') === `#${visible.target.id}`;
      link.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }, { threshold: [0.25, 0.5, 0.75], rootMargin: '-20% 0px -58% 0px' });
  sections.forEach((section) => navObserver.observe(section));
}

const evidenceBox = document.querySelector('[data-evidence-box]');
if (evidenceBox && !reducedMotion && typeof evidenceBox.animate === 'function') {
  const evidenceObserver = new IntersectionObserver((entries, observer) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    evidenceBox.animate([
      { boxShadow: '0 22px 50px rgba(23,25,29,.18)' },
      { boxShadow: '0 28px 70px rgba(255,106,0,.18)' },
      { boxShadow: '0 22px 50px rgba(23,25,29,.18)' }
    ], { duration: 1600, easing: 'cubic-bezier(.2,.8,.2,1)' });
    observer.disconnect();
  }, { threshold: 0.35 });
  evidenceObserver.observe(evidenceBox);
}

for (const detail of document.querySelectorAll('.faq details')) {
  detail.addEventListener('toggle', () => {
    if (!detail.open) return;
    for (const other of document.querySelectorAll('.faq details')) {
      if (other !== detail) other.open = false;
    }
  });
}

const truthNotice = document.querySelector('[data-truth-notice]');
if (truthNotice) {
  const text = 'Bu sayfadaki VERIFIED etiketleri yalnız ilgili evidence scope\'unu ifade eder. Model, veritabanı ve production state birbirinden ayrı doğrulanır.';
  truthNotice.setAttribute('title', text);
}
