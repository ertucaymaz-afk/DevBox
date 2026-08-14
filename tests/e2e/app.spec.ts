import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const expectedBridgeMethods = [
  "bootstrap",
  "copyPath",
  "copyText",
  "createPath",
  "createThread",
  "createWorktree",
  "deleteThread",
  "duplicatePath",
  "exportTheme",
  "getEvolution",
  "getGitDiff",
  "getGitStatus",
  "getSettings",
  "getThread",
  "importDroppedAttachments",
  "importTheme",
  "inspectCapabilities",
  "inspectIntegrations",
  "killTerminal",
  "listDraftAttachments",
  "listTerminals",
  "listThreads",
  "listWorktrees",
  "onTerminalEvent",
  "onThreadActivity",
  "openProject",
  "patchSettings",
  "readFile",
  "readProjectTree",
  "regenerateMessage",
  "removeAttachment",
  "removeWorktree",
  "renamePath",
  "renameThread",
  "resizeTerminal",
  "revealProject",
  "revealPath",
  "runEvolutionCycle",
  "runGitHubAction",
  "runPlatformAction",
  "runTaskPreset",
  "runVercelAction",
  "selectAttachments",
  "sendMessage",
  "setEvolutionEnabled",
  "setEvolutionDirective",
  "setThreadArchived",
  "setThreadPinned",
  "setThreadUnread",
  "showAppMenu",
  "showContextMenu",
  "startTerminal",
  "trashPath",
  "updateMessage",
  "writeFile",
  "writeTerminal"
].sort();

test("DevBox boots its real secure shell without a runtime test mode", async () => {
  test.setTimeout(60_000);
  const userData = await mkdtemp(path.join(os.tmpdir(), "devbox-e2e-user-data-"));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "devbox-e2e-project-"));
  const outputDirectory = path.resolve("outputs");
  await mkdir(outputDirectory, { recursive: true });
  const electronApp = await electron.launch({
    args: [".", `--user-data-dir=${userData}`]
  });

  try {
    const window = await electronApp.firstWindow();
    window.on("console", (message) => process.stderr.write(`[renderer:${message.type()}] ${message.text()}\n`));
    window.on("pageerror", (error) => process.stderr.write(`[renderer:pageerror] ${error.message}\n`));
    await expect(window).toHaveTitle("DevBox");
    await expect(window.getByRole("heading", { name: "Ne oluşturalım?" })).toBeVisible({ timeout: 35_000 });
    await expect(window.getByRole("button", { name: "Proje seç" })).toBeVisible();
    await expect(window.getByRole("button", { name: "DevBox ayarlarını aç" })).toBeVisible();

    const rendererIsolation = await window.evaluate(async () => ({
      nodeProcessExposed: "process" in window,
      commonJsRequireExposed: "require" in window,
      bridgeMethods: Object.keys(window.devbox).sort(),
      bootstrap: await window.devbox.bootstrap()
    }));
    expect(rendererIsolation.nodeProcessExposed).toBe(false);
    expect(rendererIsolation.commonJsRequireExposed).toBe(false);
    expect(rendererIsolation.bootstrap.core.state).toBe("READY");
    expect(rendererIsolation.bootstrap.app).not.toHaveProperty("testMode");
    expect(rendererIsolation.bridgeMethods).toEqual(expectedBridgeMethods);

    const settingsBefore = await window.evaluate(async () => await window.devbox.getSettings());
    const approved = await window.evaluate(async () => await window.devbox.patchSettings({ permissionProfile: "Onaylı" }));
    expect(approved).toMatchObject({
      permissionProfile: "Onaylı",
      approvalPolicy: "on-request",
      sandboxPolicy: "workspace-write",
      networkAccess: true
    });
    await window.evaluate(async (profile) => await window.devbox.patchSettings({ permissionProfile: profile }), settingsBefore.permissionProfile);

    await window.evaluate(async () => await window.devbox.copyText("devbox-real-bridge-clipboard-ok"));
    expect(await electronApp.evaluate(({ clipboard }) => clipboard.readText())).toBe("devbox-real-bridge-clipboard-ok");
    await window.evaluate(() => { void window.devbox.showContextMenu("editable", true, true); });
    await window.waitForTimeout(200);
    await window.keyboard.press("Escape");

    await electronApp.evaluate(({ dialog }, rootPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [rootPath] });
    }, projectRoot);
    await window.getByRole("button", { name: "Proje seç" }).click();
    await expect(window.getByRole("button", { name: path.basename(projectRoot) })).toBeVisible();
    await window.getByRole("button", { name: /Yeni sohbet/u }).click();
    const createdThread = (await window.evaluate(async () => await window.devbox.listThreads()))[0];
    expect(createdThread).toBeDefined();
    const deleteButton = window.getByRole("button", { name: `${createdThread!.title} görevini sil` });
    await expect(deleteButton).toBeAttached();

    await deleteButton.click();
    await expect(window.getByRole("alertdialog", { name: "Sohbeti kalıcı olarak sil" })).toBeVisible();
    await window.getByRole("button", { name: "Vazgeç" }).click();
    await expect(deleteButton).toBeAttached();

    const threadRow = window.locator("button.thread-row").filter({ hasText: createdThread!.title });
    await threadRow.click({ button: "right" });
    await expect(window.getByRole("menu", { name: `${createdThread!.title} sohbet eylemleri` })).toBeVisible();
    await window.getByRole("menuitem", { name: "Sohbeti kalıcı olarak sil" }).click();
    await expect(window.getByRole("alertdialog", { name: "Sohbeti kalıcı olarak sil" })).toBeVisible();
    await window.getByRole("button", { name: "Vazgeç" }).click();
    await expect(deleteButton).toBeAttached();

    await deleteButton.click();
    await expect(window.getByRole("alertdialog", { name: "Sohbeti kalıcı olarak sil" })).toBeVisible();
    await window.getByRole("button", { name: "Kalıcı olarak sil" }).click();
    await expect(deleteButton).toHaveCount(0);
    expect(await window.evaluate(async () => await window.devbox.listThreads())).toEqual([]);

    await window.getByRole("button", { name: "DevBox ayarlarını aç" }).click();
    await expect(window.getByRole("button", { name: "Ayarları kapat" })).toBeVisible();
    await window.getByRole("button", { name: "Ayarları kapat" }).click();

    await window.screenshot({ path: path.join(outputDirectory, "devbox-initial-ui.png"), fullPage: true });
  } finally {
    await electronApp.close();
    await rm(userData, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});
