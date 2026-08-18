import type { MemoryEntryRecord, StateDatabase } from "./database.js";

const MAX_CONTEXT_CHARACTERS = 4_800;
const MAX_SIGNAL_SENTENCES = 4;
const PROJECT_MEMORY_LIMIT = 1_600;

const SECRET_VALUE = /(?:bearer\s+[A-Za-z0-9._~+\/-]{16,}|(?:api[_ -]?key|secret|token|password|şifre)\s*[:=]\s*[^\s,;]{6,}|\b(?:sk|nvapi)-[A-Za-z0-9_-]{12,})/iu;
const SIGNAL = /(?:\b(?:istiyorum|tercih|kural|mutlaka|asla|yasak|olmalı|olmamalı|kullan|kullanma|koru|değiştirme|unutma|hatırla|karar|adı|ismi|sürüm|proje|dosya|tema|renk|tasarım|önce|sonra|devam|beğenmedim)\b)/iu;
const CONSTRAINT = /(?:yasak|olmamalı|asla|kullanma|değiştirme|mutlaka|zorunlu|kural)/iu;
const PREFERENCE = /(?:istiyorum|tercih|beğen|seviyorum|istemiyorum|tasarım|tema|renk)/iu;
const DECISION = /(?:karar|adı|ismi|sürüm|bundan sonra|olarak kalsın|seçtik)/iu;

function normalize(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function queryTerms(value: string): string {
  const terms = normalize(value)
    .toLocaleLowerCase("tr-TR")
    .match(/[\p{L}\p{N}_-]{3,}/gu)
    ?.filter((term) => !["bunu", "şunu", "olan", "için", "gibi", "daha", "sonra", "devam", "şimdi", "ama", "veya"].includes(term))
    .slice(0, 12) ?? [];
  return [...new Set(terms)].map((term) => `"${term.replaceAll('"', '""')}"*`).join(" OR ");
}

function classify(sentence: string): { kind: MemoryEntryRecord["kind"]; importance: number; projectScoped: boolean } {
  if (CONSTRAINT.test(sentence)) return { kind: "constraint", importance: 0.96, projectScoped: true };
  if (DECISION.test(sentence)) return { kind: "decision", importance: 0.88, projectScoped: true };
  if (PREFERENCE.test(sentence)) return { kind: "preference", importance: 0.82, projectScoped: true };
  return { kind: "context", importance: 0.62, projectScoped: false };
}

export class MemoryService {
  readonly #database: StateDatabase;

  public constructor(database: StateDatabase) {
    this.#database = database;
  }

  public captureUserSignal(projectId: string, threadId: string, content: string): MemoryEntryRecord[] {
    const text = normalize(content);
    if (text.length < 12 || SECRET_VALUE.test(text)) return [];
    const sentences = text
      .split(/(?<=[.!?])\s+|\n+/u)
      .map(normalize)
      .filter((sentence) => sentence.length >= 12 && sentence.length <= 1_500 && SIGNAL.test(sentence) && !SECRET_VALUE.test(sentence))
      .slice(0, MAX_SIGNAL_SENTENCES);
    const stored = sentences.map((sentence) => {
      const classification = classify(sentence);
      return this.#database.upsertMemoryEntry({
        projectId,
        threadId: classification.projectScoped ? null : threadId,
        kind: classification.kind,
        content: sentence,
        normalized: sentence.toLocaleLowerCase("tr-TR"),
        importance: classification.importance
      });
    });
    if (stored.length > 0) this.#database.pruneProjectMemory(projectId, PROJECT_MEMORY_LIMIT);
    return stored;
  }

  public buildContext(projectId: string, threadId: string, prompt: string): string {
    const ftsQuery = queryTerms(prompt);
    const entries = this.#database.searchMemoryEntries({ projectId, threadId, query: ftsQuery, limit: 8 });
    if (entries.length === 0) return "";
    const lines: string[] = [
      "DEVBOX YEREL KALICI HAFIZA:",
      "Aşağıdaki kayıtlar bu projede daha önce açıkça belirtilmiş tercih/kural/karar veya yakın görev bağlamıdır. Son kullanıcı mesajı her zaman önceliklidir; çelişen eski kaydı uygulama."
    ];
    for (const entry of entries) {
      const scope = entry.threadId ? "sohbet" : "proje";
      lines.push(`- [${scope}/${entry.kind}] ${entry.content}`);
      if (lines.join("\n").length >= MAX_CONTEXT_CHARACTERS) break;
    }
    return lines.join("\n").slice(0, MAX_CONTEXT_CHARACTERS);
  }

  public stats(projectId: string): { total: number; projectScoped: number; threadScoped: number; ftsEnabled: boolean } {
    return this.#database.memoryStats(projectId);
  }

  public recent(projectId: string, limit = 40): MemoryEntryRecord[] {
    return this.#database.listRecentMemory(projectId, limit);
  }

  public clear(projectId: string): number {
    return this.#database.clearProjectMemory(projectId);
  }
}
