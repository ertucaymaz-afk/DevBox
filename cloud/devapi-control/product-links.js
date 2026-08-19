const target = document.querySelector(".cross-state");

async function hydrateProductLink() {
  if (!(target instanceof HTMLElement)) return;
  try {
    const response = await fetch("/api/v1/product-links", { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.devbox !== "string") throw new Error("PRODUCT_LINK_UNAVAILABLE");
    const url = new URL(body.devbox);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("PRODUCT_LINK_INVALID");
    const link = document.createElement("a");
    link.className = "ghost";
    link.href = url.origin;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "DevBox ürün sitesi ↗";
    target.replaceWith(link);
  } catch {
    target.textContent = "DevBox site · production pending";
    target.title = "Doğrulanmış canonical DevBox URL olmadan canlı link açılmaz";
  }
}

void hydrateProductLink();
