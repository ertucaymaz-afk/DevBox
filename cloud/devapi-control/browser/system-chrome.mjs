import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const OUTPUT_CAP = 2 * 1024 * 1024;
const SCREENSHOT_CAP = 12 * 1024 * 1024;
const CANDIDATES = process.platform === "win32"
  ? [
      `${process.env.PROGRAMFILES || "C:\\Program Files"}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)"}\\Google\\Chrome\\Application\\chrome.exe`
    ]
  : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function isPrivateV4(ip) {
  const parts = ip.split(".").map(Number);
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 169 && parts[1] === 254) || parts[0] === 0;
}
function isPrivateV6(ip) {
  const value = ip.toLowerCase();
  return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb");
}
function privateIp(ip) { return net.isIP(ip) === 4 ? isPrivateV4(ip) : net.isIP(ip) === 6 ? isPrivateV6(ip) : true; }

export async function validateBrowserTarget(raw, { allowLoopback = false } = {}) {
  const url = new URL(String(raw ?? ""));
  if (url.username || url.password) throw new Error("BROWSER_URL_CREDENTIALS_DENIED");
  if (url.protocol !== "https:" && !(allowLoopback && url.protocol === "http:")) throw new Error("BROWSER_URL_PROTOCOL_DENIED");
  if (url.hash) url.hash = "";
  const loopbackHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]";
  if (loopbackHost) {
    if (!allowLoopback) throw new Error("BROWSER_URL_LOOPBACK_DENIED");
    return url.href;
  }
  const resolved = await lookup(url.hostname, { all: true, verbatim: true });
  if (!resolved.length || resolved.some((entry) => privateIp(entry.address))) throw new Error("BROWSER_URL_PRIVATE_NETWORK_DENIED");
  return url.href;
}

export async function findSystemChrome() {
  for (const candidate of CANDIDATES) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error("BROWSER_CHROME_UNAVAILABLE");
}

async function runChrome(executable, args, { timeoutMs = 45_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5_000, Math.min(90_000, Number(timeoutMs) || 45_000)));
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let truncated = false;
  const append = (current, chunk) => {
    const next = Buffer.concat([current, chunk]);
    if (next.length <= OUTPUT_CAP) return next;
    truncated = true;
    return next.subarray(0, OUTPUT_CAP);
  };
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(executable, args, { shell: false, windowsHide: true, signal: controller.signal, env: { PATH: process.env.PATH || "", HOME: process.env.HOME || os.homedir(), CI: "1" } });
      child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
      child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
      child.on("error", reject);
      child.on("close", (code, signal) => resolve({ code: code ?? -1, signal }));
    });
    if (result.code !== 0) throw new Error(`BROWSER_CHROME_FAILED:${result.code}:${stderr.toString("utf8").slice(0, 300)}`);
    return { ...result, stdout, stderr, truncated };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("BROWSER_TIMEOUT");
    throw error;
  } finally { clearTimeout(timer); }
}

export async function runReadOnlyBrowserProbe(rawUrl, { allowLoopback = false, width = 1280, height = 720 } = {}) {
  const url = await validateBrowserTarget(rawUrl, { allowLoopback });
  const executable = await findSystemChrome();
  const temp = await mkdtemp(path.join(os.tmpdir(), "devapi-browser-"));
  const profile = path.join(temp, "profile");
  const screenshotPath = path.join(temp, "screenshot.png");
  const common = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    `--user-data-dir=${profile}`
  ];
  const started = Date.now();
  try {
    const version = await runChrome(executable, ["--version"], { timeoutMs: 15_000 });
    const dom = await runChrome(executable, [...common, "--dump-dom", url]);
    const domText = dom.stdout.toString("utf8").trim();
    if (!domText.includes("<html")) throw new Error("BROWSER_DOM_EMPTY");
    const screenshot = await runChrome(executable, [...common, `--window-size=${Math.max(320, Math.min(2560, Number(width) || 1280))},${Math.max(240, Math.min(1440, Number(height) || 720))}`, `--screenshot=${screenshotPath}`, url]);
    const image = await readFile(screenshotPath);
    if (image.length < 100 || image.length > SCREENSHOT_CAP) throw new Error("BROWSER_SCREENSHOT_INVALID");
    return {
      schemaVersion: 1,
      runtime: "system-chrome-headless",
      url,
      browserVersion: version.stdout.toString("utf8").trim(),
      durationMs: Date.now() - started,
      dom: { bytes: Buffer.byteLength(domText), sha256: sha256(domText), preview: domText.slice(0, 1_000) },
      screenshot: { bytes: image.length, sha256: sha256(image) },
      process: { domTruncated: dom.truncated, screenshotTruncated: screenshot.truncated },
      state: "RUNTIME_VERIFIED"
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
