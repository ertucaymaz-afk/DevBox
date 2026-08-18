import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StateDatabase } from "./database.js";
import { MemoryService } from "./memory-service.js";

const roots: string[] = [];
const databases: StateDatabase[] = [];

afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ database: StateDatabase; memory: MemoryService; projectId: string; threadId: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "devbox-memory-"));
  roots.push(root);
  const database = new StateDatabase(path.join(root, "state.sqlite"));
  databases.push(database);
  const now = new Date().toISOString();
  const projectId = "project-memory-test";
  database.upsertProject({ id: projectId, name: "memory", rootPath: root, isGitRepository: false, createdAt: now, updatedAt: now });
  const threadId = database.createThread(projectId, "memory thread").thread.id;
  return { database, memory: new MemoryService(database), projectId, threadId };
}

describe("MemoryService", () => {
  it("stores high-signal preferences and retrieves them across turns", async () => {
    const { memory, projectId, threadId } = await fixture();
    memory.captureUserSignal(projectId, threadId, "Ana kural: index.html oluştururken demo ve placeholder kullanma, gerçek animasyon olmalı.");
    memory.captureUserSignal(projectId, threadId, "Tasarımda koyu modern tema istiyorum ve mevcut çalışan bölümleri değiştirme.");

    const context = memory.buildContext(projectId, threadId, "index sayfasının temasını düzelt");
    expect(context).toContain("DEVBOX YEREL KALICI HAFIZA");
    expect(context).toMatch(/demo|placeholder/iu);
    expect(context).toMatch(/koyu modern tema/iu);
    expect(memory.stats(projectId).total).toBeGreaterThanOrEqual(2);
  });

  it("does not persist obvious credentials", async () => {
    const { memory, projectId, threadId } = await fixture();
    const stored = memory.captureUserSignal(projectId, threadId, "API_KEY=sk-super-secret-value-123456789 bunu mutlaka kullan.");
    expect(stored).toEqual([]);
    expect(memory.stats(projectId).total).toBe(0);
  });

  it("keeps thread context out of unrelated threads while project rules remain shared", async () => {
    const { database, memory, projectId, threadId } = await fixture();
    const other = database.createThread(projectId, "other").thread.id;
    memory.captureUserSignal(projectId, threadId, "Bu dosyada önce hero kartını düzelt, sonra footer alanına devam et.");
    memory.captureUserSignal(projectId, threadId, "Asla sahte başarı kullanma; bu proje için zorunlu kural.");

    const otherContext = memory.buildContext(projectId, other, "footer ve başarı kuralı");
    expect(otherContext).toMatch(/sahte başarı/iu);
    expect(otherContext).not.toMatch(/hero kartını/iu);
  });
});
