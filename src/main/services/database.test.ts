import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deriveThreadTitle, StateDatabase } from "./database.js";

const temporaryDirectories: string[] = [];
const databases: StateDatabase[] = [];

afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe("state database", () => {
  it("derives concise, deterministic conversation titles without inventing content", () => {
    expect(deriveThreadTitle("İş akışını bozma üzerine ekle devam et: ayarlar ekranını sadeleştir ve çıkış düğmesi ekle."))
      .toBe("ayarlar ekranını sadeleştir ve çıkış düğmesi ekle");
    expect(deriveThreadTitle("https://example.com", true)).toBe("Dosya inceleme görevi");
    expect(deriveThreadTitle("Bu çok uzun bir görev başlığıdır ve kullanıcıya yakın zamanlar alanında taşmadan anlamlı bir özet göstermelidir"))
      .toMatch(/…$/u);
  });

  it("migrates, checks integrity, and persists canonical project records", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-db-test-"));
    temporaryDirectories.push(directory);
    const database = new StateDatabase(path.join(directory, "state.sqlite"));
    databases.push(database);
    const now = new Date().toISOString();

    database.upsertProject({ id: "project-12345678", name: "sample", rootPath: directory, isGitRepository: true, createdAt: now, updatedAt: now });

    expect(database.integrityCheck()).toEqual({ ok: true, detail: "ok", schemaVersion: 7 });
    expect(database.listProjects()).toHaveLength(1);
    expect(database.getProject("project-12345678")).toMatchObject({ name: "sample", rootPath: directory, isGitRepository: true });
    expect(database.listThreads()).toEqual([]);

    const thread = database.createThread("project-12345678", "Yeni görev");
    expect(thread.items).toEqual([]);
    const pending = database.beginMessage(thread.thread.id, "Sağlayıcı bitmeden beni göster", []);
    expect(pending.detail.items.map((item) => item.role)).toEqual(["user"]);
    expect(pending.detail.thread.state).toBe("RUNNING");
    expect(pending.detail.items[0]?.turnId).toBe(pending.turnId);
    database.appendTurnActivity(thread.thread.id, pending.turnId, "Codex sağlayıcısı doğrulanıyor");
    expect(database.getThread(thread.thread.id).items.map((item) => [item.role, item.content])).toContainEqual(["activity", "Codex sağlayıcısı doğrulanıyor"]);
    database.completeMessage(thread.thread.id, pending.turnId, "Kalıcı yanıt");
    expect(database.getThread(thread.thread.id).items.map((item) => item.role)).toEqual(["user", "activity", "assistant"]);
    database.deleteThread(thread.thread.id);

    const completedThread = database.createThread("project-12345678", "Yeni görev");
    const updated = database.appendMessage(completedThread.thread.id, "Projeyi test et", "Model sağlayıcısı READY değil.");
    expect(updated.thread.title).toBe("Projeyi test et");
    expect(updated.items.map((item) => item.role)).toEqual(["user", "assistant"]);
    expect(updated.items.every((item) => Array.isArray(item.attachments))).toBe(true);
    const edited = database.updateUserMessage(completedThread.thread.id, updated.items[0]!.id, "Projeyi ayrıntılı test et");
    expect(edited.items[0]?.content).toBe("Projeyi ayrıntılı test et");
    const regenerated = database.replaceAssistantMessage(completedThread.thread.id, updated.items[1]!.id, "Yeni doğrulanmış yanıt");
    expect(regenerated.items[1]?.content).toBe("Yeni doğrulanmış yanıt");
    expect(database.listThreads("project-12345678")).toHaveLength(1);
    expect(database.renameThread(completedThread.thread.id, "Kalıcı görev").title).toBe("Kalıcı görev");
    expect(database.setThreadFlag(completedThread.thread.id, "pinned", true)).toMatchObject({ pinned: true, archived: false, unread: false });
    expect(database.setThreadFlag(completedThread.thread.id, "unread", true)).toMatchObject({ pinned: true, archived: false, unread: true });
    expect(database.setThreadFlag(completedThread.thread.id, "archived", true)).toMatchObject({ pinned: true, archived: true, unread: true });
    expect(database.listThreads("project-12345678")[0]).toMatchObject({ pinned: true, archived: true, unread: true });
    const automation = database.createAutomation({
      projectId: "project-12345678",
      name: "Sabah kontrolü",
      prompt: "Testleri çalıştır",
      schedule: { rrule: "FREQ=DAILY;BYHOUR=9", timezone: "Europe/Istanbul" }
    });
    expect(database.listAutomations("project-12345678")).toHaveLength(1);
    expect(database.toggleAutomation(automation.id).enabled).toBe(false);
    database.deleteAutomation(automation.id);
    expect(database.listAutomations()).toEqual([]);
    database.deleteThread(completedThread.thread.id);
    expect(database.listThreads()).toEqual([]);
  }, 15_000);

  it("leases, cancels, settles, and recovers durable jobs without losing payloads", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-durable-job-test-"));
    temporaryDirectories.push(directory);
    const database = new StateDatabase(path.join(directory, "state.sqlite"));
    databases.push(database);

    const first = database.enqueueDurableJob("agent-turn", { prompt: "test et" }, "thread-1");
    expect(first).toMatchObject({ state: "QUEUED", attempt: 0, payload: { prompt: "test et" } });
    const leased = database.leaseNextDurableJob("worker-a", 1_000);
    expect(leased).toMatchObject({ id: first.id, state: "LEASED", attempt: 1, leaseOwner: "worker-a" });
    expect(database.startDurableJob(first.id, "worker-a", 1_000).state).toBe("RUNNING");
    expect(database.requestDurableJobCancellation(first.id).state).toBe("CANCEL_REQUESTED");
    expect(database.settleDurableJob(first.id, "worker-a", "CANCELLED", { reason: "USER_REQUEST" })).toMatchObject({
      state: "CANCELLED",
      result: { reason: "USER_REQUEST" },
      leaseOwner: null
    });

    const second = database.enqueueDurableJob("automation", { automationId: "automation-1" });
    expect(database.leaseNextDurableJob("worker-b", 1_000)?.id).toBe(second.id);
    expect(database.recoverExpiredDurableJobs(new Date(Date.now() + 2_000))).toBe(1);
    expect(database.getDurableJob(second.id)).toMatchObject({ state: "QUEUED", leaseOwner: null, attempt: 1 });
    expect(database.leaseNextDurableJob("worker-c", 1_000)?.attempt).toBe(2);
    expect(database.settleDurableJob(second.id, "worker-c", "SUCCEEDED", { ok: true }).state).toBe("SUCCEEDED");
  });

  it("keeps remote jobs isolated from local jobs and persists worker revocation", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-remote-job-test-"));
    temporaryDirectories.push(directory);
    const database = new StateDatabase(path.join(directory, "state.sqlite"));
    databases.push(database);
    database.createWorkerPairing("pairing-hash", new Date(Date.now() + 60_000).toISOString());
    const worker = database.consumePairingAndCreateWorker({
      codeHash: "pairing-hash", workerId: "worker-12345678", name: "worker", tokenHash: "token-hash", capabilities: ["node"]
    });
    database.enqueueDurableJob("agent-turn", { local: true });
    const remote = database.enqueueDurableJob("remote:command", { command: "node", args: ["--version"] });
    expect(database.leaseNextRemoteJob(worker.id)?.id).toBe(remote.id);
    expect(database.listRemoteWorkers()[0]).toMatchObject({ id: worker.id, status: "ONLINE", capabilities: ["node"] });
    expect(database.revokeRemoteWorker(worker.id)).toMatchObject({ status: "REVOKED" });
  });
  it("persists ordered activity events and can read newest records first", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-events-test-"));
    temporaryDirectories.push(directory);
    const database = new StateDatabase(path.join(directory, "state.sqlite"));
    databases.push(database);

    const first = database.appendEvent("api-evolution.activity", "project-12345678", { message: "first" }, true);
    const second = database.appendEvent("api-evolution.activity", "project-12345678", { message: "second" }, true);
    database.appendEvent("other", "project-12345678", { message: "ignored" }, false);

    expect(database.listEvents({ type: "api-evolution.activity", aggregateId: "project-12345678", order: "asc" }).map((item) => item.sequence)).toEqual([first.sequence, second.sequence]);
    expect(database.listEvents({ type: "api-evolution.activity", aggregateId: "project-12345678", order: "desc" }).map((item) => item.payload)).toEqual([{ message: "second" }, { message: "first" }]);
    expect(database.listEvents({ afterSequence: first.sequence, order: "asc" }).every((item) => item.sequence > first.sequence)).toBe(true);
    expect(database.integrityCheck()).toMatchObject({ ok: true, schemaVersion: 7 });
  });

});
