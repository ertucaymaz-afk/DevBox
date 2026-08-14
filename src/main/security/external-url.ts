const DEVBOX_REPOSITORY_PATH = "/ertucaymaz-afk/DevBox";

export function isTrustedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password) return false;

    if (url.hostname === "github.com") {
      const normalized = url.pathname.replace(/\/+$/, "");
      return normalized === DEVBOX_REPOSITORY_PATH || normalized.startsWith(`${DEVBOX_REPOSITORY_PATH}/`);
    }

    if (url.hostname === "www.instagram.com" || url.hostname === "instagram.com") {
      return url.pathname.replace(/\/+$/, "") === "/yaaertu";
    }

    return false;
  } catch {
    return false;
  }
}
