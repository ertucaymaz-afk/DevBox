import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const HASH = /^[a-f0-9]{64}$/u;
const AuditEventSchema = z.object({
  schemaVersion: z.literal(1),
  sequence: z.number().int().positive(),
  auditId: z.uuid(),
  actorId: z.string().min(1).max(160),
  actorRole: z.string().min(1).max(80),
  action: z.string().min(1).max(160),
  targetType: z.string().min(1).max(80),
  targetId: z.string().min(1).max(240),
  beforeHash: z.string().regex(HASH).nullable(),
  afterHash: z.string().regex(HASH).nullable(),
  artifactSha256: z.string().regex(HASH).nullable(),
  correlationId: z.uuid(),
  occurredAt: z.iso.datetime(),
  previousEventHash: z.string().regex(HASH).nullable(),
  eventHash: z.string().regex(HASH)
}).strict();

export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditAppendInput = Omit<AuditEvent, "schemaVersion" | "sequence" | "auditId" | "occurredAt" | "previousEventHash" | "eventHash">;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right, "en")).map(([key, nested]) => [key, canonical(nested)]));
}

function digest(value: Omit<AuditEvent, "eventHash">): string {
  return createHash("sha256").update(JSON.stringify(canonical(value)), "utf8").digest("hex");
}

export class AuditLogService {
  readonly #filePath: string;
  #queue: Promise<void> = Promise.resolve();

  public constructor(filePath: string) {
    this.#filePath = path.resolve(filePath);
  }

  public async listAndVerify(): Promise<AuditEvent[]> {
    await this.#queue;
    if (!existsSync(this.#filePath)) return [];
    const content = await readFile(this.#filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const events: AuditEvent[] = [];
    for (const [index, line] of lines.entries()) {
      const event = AuditEventSchema.parse(JSON.parse(line) as unknown);
      const { eventHash, ...unsigned } = event;
      if (event.sequence !== index + 1) throw new Error("AUDIT_SEQUENCE_INVALID");
      if (event.previousEventHash !== (events.at(-1)?.eventHash ?? null)) throw new Error("AUDIT_CHAIN_BROKEN");
      if (eventHash !== digest(unsigned)) throw new Error("AUDIT_EVENT_HASH_INVALID");
      events.push(event);
    }
    return events;
  }

  public async append(input: AuditAppendInput): Promise<AuditEvent> {
    let result: AuditEvent | null = null;
    const operation = this.#queue.then(async () => {
      const events = await this.listAndVerifyUnlocked();
      const unsigned = {
        schemaVersion: 1 as const,
        sequence: events.length + 1,
        auditId: randomUUID(),
        ...input,
        occurredAt: new Date().toISOString(),
        previousEventHash: events.at(-1)?.eventHash ?? null
      };
      result = AuditEventSchema.parse({ ...unsigned, eventHash: digest(unsigned) });
      await mkdir(path.dirname(this.#filePath), { recursive: true });
      const handle = await open(this.#filePath, "a", 0o600);
      try {
        await handle.write(`${JSON.stringify(result)}\n`, null, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    });
    this.#queue = operation.catch(() => undefined);
    await operation;
    if (!result) throw new Error("AUDIT_APPEND_FAILED");
    return result;
  }

  async listAndVerifyUnlocked(): Promise<AuditEvent[]> {
    if (!existsSync(this.#filePath)) return [];
    const content = await readFile(this.#filePath, "utf8");
    const events: AuditEvent[] = [];
    for (const line of content.split("\n").filter(Boolean)) {
      const event = AuditEventSchema.parse(JSON.parse(line) as unknown);
      const { eventHash, ...unsigned } = event;
      if (event.sequence !== events.length + 1 || event.previousEventHash !== (events.at(-1)?.eventHash ?? null) || eventHash !== digest(unsigned)) throw new Error("AUDIT_CHAIN_INVALID");
      events.push(event);
    }
    return events;
  }
}
