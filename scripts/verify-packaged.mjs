import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "@playwright/test";

const executablePath = path.resolve(process.argv[2] ?? path.join("release", "win-unpacked", "DevBox.exe"));
if (!existsSync(executablePath)) {
  throw new Error(`Packaged DevBox executable was not found: ${executablePath}`);
}

const userData = await mkdtemp(path.join(os.tmpdir(), "devbox-packaged-check-"));
const electronApp = await electron.launch({
  executablePath,
  args: [`--user-data-dir=${userData}`]
});

try {
  const window = await electronApp.firstWindow();
  await window.getByRole("heading", { name: "Ne oluşturalım?" }).waitFor({ state: "visible", timeout: 20_000 });
  const evidence = await window.evaluate(() => ({
    title: document.title,
    nodeProcessExposed: "process" in window,
    commonJsRequireExposed: "require" in window,
    bridgeMethodCount: Object.keys(window.devbox).length
  }));
  const bootstrap = await window.evaluate(async () => await window.devbox.bootstrap());
  const sitesButtonVisible = await window.getByRole("button", { name: "Siteler" }).isVisible();
  const runtimeTestModeExposed = Object.prototype.hasOwnProperty.call(bootstrap.app, "testMode");
  if (evidence.title !== "DevBox" || bootstrap.core.state !== "READY" || evidence.nodeProcessExposed || evidence.commonJsRequireExposed || evidence.bridgeMethodCount !== 49 || runtimeTestModeExposed || !sitesButtonVisible) {
    throw new Error(`Packaged runtime evidence did not satisfy the secure-shell contract: ${JSON.stringify(evidence)}`);
  }
  process.stdout.write(`${JSON.stringify({ executablePath, ...evidence, coreState: bootstrap.core.state, runtimeTestModeExposed, sitesButtonVisible }, null, 2)}\n`);
} finally {
  await electronApp.close();
  await rm(userData, { recursive: true, force: true });
}
