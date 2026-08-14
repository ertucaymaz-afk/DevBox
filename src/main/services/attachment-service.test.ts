import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AttachmentService } from "./attachment-service.js";
import { StateDatabase } from "./database.js";

const temporaryDirectories: string[] = [];
const databases: StateDatabase[] = [];

afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe("attachment service", () => {
  it("accepts arbitrary regular files, hashes them, binds drafts, and never expands archives", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-attachment-test-"));
    temporaryDirectories.push(root);
    const database = new StateDatabase(path.join(root, "state.sqlite"));
    databases.push(database);
    const now = new Date().toISOString();
    database.upsertProject({ id: "project-12345678", name: "sample", rootPath: root, isGitRepository: false, createdAt: now, updatedAt: now });
    const thread = database.createThread("project-12345678", "Ek testi");
    const textPath = path.join(root, "notlar.md");
    const archivePath = path.join(root, "kaynak.rar");
    await writeFile(textPath, "güvenli metin", "utf8");
    await writeFile(archivePath, Buffer.from([0x52, 0x61, 0x72, 0x21]));

    const service = new AttachmentService(database, path.join(root, "attachments"));
    const imported = await service.importPaths(thread.thread.id, [textPath, archivePath]);

    expect(imported.rejected).toEqual([]);
    expect(imported.attachments.map((item) => item.kind)).toEqual(["text", "archive"]);
    expect(imported.attachments.every((item) => /^[a-f0-9]{64}$/u.test(item.sha256))).toBe(true);
    expect(await service.buildAgentContext(thread.thread.id, imported.attachments.map((item) => item.id))).toContain("güvenli metin");

    const detail = database.appendMessage(thread.thread.id, "Ekleri incele", "İncelendi", imported.attachments.map((item) => item.id));
    expect(detail.items[0]?.attachments).toHaveLength(2);
    expect(detail.items[0]?.attachments[1]?.name).toBe("kaynak.rar");
  });

  it("rejects files above 300 MiB and non-file paths without reading their content", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-attachment-limit-test-"));
    temporaryDirectories.push(root);
    const database = new StateDatabase(path.join(root, "state.sqlite"));
    databases.push(database);
    const now = new Date().toISOString();
    database.upsertProject({ id: "project-87654321", name: "limits", rootPath: root, isGitRepository: false, createdAt: now, updatedAt: now });
    const thread = database.createThread("project-87654321", "Ek sınırı");
    const oversized = path.join(root, "oversized.any-extension");
    const handle = await open(oversized, "w");
    await handle.truncate(300 * 1024 * 1024 + 1);
    await handle.close();
    const directory = path.join(root, "not-a-file");
    await mkdir(directory);

    const service = new AttachmentService(database, path.join(root, "attachments"));
    const imported = await service.importPaths(thread.thread.id, [oversized, directory]);

    expect(imported.attachments).toEqual([]);
    expect(imported.rejected).toEqual([
      { name: "oversized.any-extension", code: "ATTACHMENT_TOO_LARGE" },
      { name: "not-a-file", code: "ATTACHMENT_NOT_REGULAR_FILE" }
    ]);
  });
});
