import { _electron as electron } from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const userData = await mkdtemp(path.join(os.tmpdir(), "devbox-targeted-ui-user-"));
const outputs = path.resolve("outputs");
await mkdir(outputs, { recursive: true });

const app = await electron.launch({ args: [".", `--user-data-dir=${userData}`] });
const originalClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
try {
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.getByText("Ne oluşturalım?", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });

  const metrics = await window.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing element: ${selector}`);
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      sidebar: box(".sidebar"),
      sidebarBrand: box(".sidebar-brand"),
      wordmark: box(".devbox-wordmark"),
      composer: box(".composer"),
      hasModeSwitch: document.querySelector(".mode-switch") !== null,
      exactWorkLabelCount: Array.from(document.querySelectorAll("button, [role=button]")).filter((element) => element.textContent?.trim() === "Çalış").length,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      mainBackground: getComputedStyle(document.querySelector(".main") ?? document.body).backgroundColor
    };
  });

  if (metrics.hasModeSwitch || metrics.exactWorkLabelCount !== 0) throw new Error("Separate Chat/Work mode is still visible.");
  if (metrics.viewport.width >= 1180 && Math.round(metrics.sidebar.width) !== 272) throw new Error(`Unexpected sidebar width: ${metrics.sidebar.width}`);
  if (metrics.composer.width > 740) throw new Error(`Composer is too wide: ${metrics.composer.width}`);
  if (metrics.sidebarBrand.height > 60) throw new Error(`Brand row is too tall: ${metrics.sidebarBrand.height}`);

  const composer = window.getByPlaceholder("DevBox'a bir görev verin");
  await composer.fill("Birinci satır");
  await composer.press("Shift+Enter");
  await composer.type("İkinci satır");
  const composerValue = await composer.inputValue();
  if (composerValue !== "Birinci satır\nİkinci satır") throw new Error("Shift+Enter newline behavior failed.");
  await composer.fill("");

  await window.evaluate(async () => window.devbox.copyText("devbox-targeted-clipboard-ok"));
  const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  if (clipboard !== "devbox-targeted-clipboard-ok") throw new Error("Clipboard bridge verification failed.");
  await window.evaluate(() => { void window.devbox.showContextMenu("editable", true, true); });
  await window.waitForTimeout(200);
  await window.keyboard.press("Escape");

  const screenshot = path.join(outputs, "devbox-codex-compact.png");
  await window.screenshot({ path: screenshot, fullPage: true });
  const result = {
    schemaVersion: 2,
    verdict: "PARTIAL_PASS",
    modeSwitchRemoved: true,
    shiftEnterNewline: "PASS",
    enterSend: "NOT_EXECUTED_REQUIRES_SELECTED_REAL_PROJECT_AND_LIVE_PROVIDER",
    clipboardBridge: "PASS",
    editableContextMenuInvocation: "PASS",
    metrics,
    screenshot
  };
  await writeFile(path.join(outputs, "targeted-ui-verification.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), originalClipboard).catch(() => undefined);
  await app.close().catch(() => undefined);
  await rm(userData, { recursive: true, force: true });
}
