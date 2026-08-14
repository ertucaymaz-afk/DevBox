import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLogService } from "./audit-log-service.js";

const roots: string[] = [];
afterEach(async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))));

describe("tamper evident audit log", () => {
  it("persists a verified hash chain and detects modification", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-audit-"));
    roots.push(root);
    const file = path.join(root, "audit.jsonl");
    const audit = new AuditLogService(file);
    await audit.append({ actorId: "local-user", actorRole: "OWNER", action: "publisher.enroll", targetType: "publisher", targetId: "publisher.test", beforeHash: null, afterHash: null, artifactSha256: null, correlationId: crypto.randomUUID() });
    await audit.append({ actorId: "local-user", actorRole: "OWNER", action: "package.install", targetType: "plugin", targetId: "plugin.test/1.0.0", beforeHash: null, afterHash: null, artifactSha256: "a".repeat(64), correlationId: crypto.randomUUID() });
    await expect(audit.listAndVerify()).resolves.toHaveLength(2);
    const tampered = (await readFile(file, "utf8")).replace("package.install", "package.remove!");
    await writeFile(file, tampered, "utf8");
    await expect(audit.listAndVerify()).rejects.toThrow(/AUDIT_/u);
  });
});
