import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  MAX_ATTACHMENTS_PER_IMPORT,
  MAX_ATTACHMENT_BYTES,
  type Attachment,
  type AttachmentImportResult
} from "../../shared/contracts.js";
import type { StateDatabase, StoredAttachment } from "./database.js";

const TEXT_PREVIEW_BYTES = 1024 * 1024;
const AGENT_TEXT_BYTES = 256 * 1024;
const AGENT_CONTEXT_CHARACTERS = 64_000;

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "mdx", "json", "jsonl", "yaml", "yml", "toml", "xml", "csv", "tsv", "log", "ini", "conf", "env",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "css", "scss", "sass", "less", "html", "htm", "svg",
  "py", "pyi", "rb", "php", "java", "kt", "kts", "go", "rs", "c", "h", "cpp", "hpp", "cs", "fs", "fsx",
  "sh", "bash", "zsh", "fish", "ps1", "psm1", "bat", "cmd", "sql", "graphql", "gql", "proto", "dockerfile"
]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "cab", "iso"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tif", "tiff", "avif", "heic", "svg"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a", "opus", "wma"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "webm", "mov", "avi", "mpeg", "mpg", "m4v", "wmv"]);

function safeFileName(filePath: string): string {
  const base = path.basename(filePath).replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "_").replace(/[. ]+$/u, "").slice(0, 220);
  return base || "dosya";
}

function classify(name: string): { extension: string; mimeType: string; kind: Attachment["kind"] } {
  const rawExtension = path.extname(name).slice(1).toLocaleLowerCase("en-US");
  const extension = rawExtension.slice(0, 32);
  if (extension === "pdf") return { extension, mimeType: "application/pdf", kind: "pdf" };
  if (TEXT_EXTENSIONS.has(extension) || name.toLocaleLowerCase("en-US").startsWith("dockerfile")) {
    const mimeType = extension === "json" || extension === "jsonl" ? "application/json" : extension === "svg" ? "image/svg+xml" : "text/plain";
    return { extension, mimeType, kind: "text" };
  }
  if (ARCHIVE_EXTENSIONS.has(extension)) return { extension, mimeType: "application/octet-stream", kind: "archive" };
  if (IMAGE_EXTENSIONS.has(extension)) return { extension, mimeType: `image/${extension === "jpg" ? "jpeg" : extension}`, kind: "image" };
  if (AUDIO_EXTENSIONS.has(extension)) return { extension, mimeType: `audio/${extension}`, kind: "audio" };
  if (VIDEO_EXTENSIONS.has(extension)) return { extension, mimeType: `video/${extension}`, kind: "video" };
  return { extension, mimeType: "application/octet-stream", kind: "binary" };
}

function importErrorCode(error: unknown): AttachmentImportResult["rejected"][number]["code"] {
  if (error instanceof Error && [
    "ATTACHMENT_TOO_LARGE",
    "ATTACHMENT_NOT_REGULAR_FILE",
    "ATTACHMENT_LIMIT_EXCEEDED",
    "ATTACHMENT_CHANGED_DURING_IMPORT"
  ].includes(error.message)) return error.message as AttachmentImportResult["rejected"][number]["code"];
  return "ATTACHMENT_IMPORT_FAILED";
}

export class AttachmentService {
  readonly #database: StateDatabase;
  readonly #root: string;

  public constructor(database: StateDatabase, root: string) {
    this.#database = database;
    this.#root = path.resolve(root);
  }

  public async importPaths(threadId: string, filePaths: readonly string[]): Promise<AttachmentImportResult> {
    const attachments: Attachment[] = [];
    const rejected: AttachmentImportResult["rejected"] = [];
    const available = Math.max(0, MAX_ATTACHMENTS_PER_IMPORT - this.#database.listDraftAttachments(threadId).length);
    for (const [index, filePath] of filePaths.entries()) {
      const name = safeFileName(filePath);
      if (index >= available) {
        rejected.push({ name, code: "ATTACHMENT_LIMIT_EXCEEDED" });
        continue;
      }
      try {
        attachments.push(await this.#importOne(threadId, filePath));
      } catch (error) {
        rejected.push({ name, code: importErrorCode(error) });
      }
    }
    return { attachments, rejected };
  }

  public async removeDraft(threadId: string, attachmentId: string): Promise<void> {
    const attachment = this.#database.removeDraftAttachment(threadId, attachmentId);
    await this.#removeStoredFile(attachment);
  }

  public async purgeThreadFiles(threadId: string): Promise<void> {
    const directory = path.resolve(this.#root, threadId);
    this.#assertManagedPath(directory);
    await rm(directory, { recursive: true, force: true });
  }

  public async buildAgentContext(threadId: string, attachmentIds: readonly string[], draftOnly = true): Promise<string> {
    const attachments = this.#database.getStoredAttachments(threadId, attachmentIds, draftOnly);
    if (attachments.length === 0) return "";
    const sections: string[] = ["\n\nKullanıcı bu göreve aşağıdaki yerel ekleri bağladı. Arşivleri/ikili dosyaları çalıştırma veya açma; yalnızca metadata ve güvenle eklenen metin önizlemelerini kullan:"];
    let remaining = AGENT_CONTEXT_CHARACTERS;
    for (const attachment of attachments) {
      const header = `\n- ${attachment.name} | ${attachment.kind} | ${attachment.size} bayt | sha256:${attachment.sha256}`;
      sections.push(header);
      remaining -= header.length;
      if (attachment.kind !== "text" || attachment.size > AGENT_TEXT_BYTES || remaining <= 0) continue;
      try {
        const buffer = await readFile(attachment.storedPath);
        if (buffer.includes(0)) continue;
        const text = buffer.toString("utf8").slice(0, Math.max(0, remaining));
        sections.push(`\n\n<devbox-attachment name="${attachment.name.replace(/["<>]/gu, "_")}">\n${text}\n</devbox-attachment>`);
        remaining -= text.length;
      } catch {
        sections.push("\n  Metin önizlemesi okunamadı; yalnızca metadata kullanılabilir.");
      }
    }
    return sections.join("");
  }

  async #importOne(threadId: string, filePath: string): Promise<Attachment> {
    const source = path.resolve(filePath);
    const before = await lstat(source);
    if (!before.isFile() || before.isSymbolicLink()) throw new Error("ATTACHMENT_NOT_REGULAR_FILE");
    if (before.size > MAX_ATTACHMENT_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");

    const name = safeFileName(source);
    const classification = classify(name);
    const directory = path.resolve(this.#root, threadId, randomUUID());
    const destination = path.join(directory, name);
    this.#assertManagedPath(destination);
    await mkdir(directory, { recursive: true });

    const hash = createHash("sha256");
    const hasher = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      }
    });
    try {
      await pipeline(createReadStream(source), hasher, createWriteStream(destination, { flags: "wx", mode: 0o600 }));
      const [after, copied] = await Promise.all([stat(source), stat(destination)]);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || copied.size !== before.size) throw new Error("ATTACHMENT_CHANGED_DURING_IMPORT");
      return this.#database.insertAttachment({
        threadId,
        storedPath: destination,
        name,
        extension: classification.extension,
        mimeType: classification.mimeType,
        kind: classification.kind,
        size: copied.size,
        sha256: hash.digest("hex"),
        canPreview: classification.kind === "text" && copied.size <= TEXT_PREVIEW_BYTES
      });
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async #removeStoredFile(attachment: StoredAttachment): Promise<void> {
    this.#assertManagedPath(attachment.storedPath);
    await rm(path.dirname(attachment.storedPath), { recursive: true, force: true });
  }

  #assertManagedPath(target: string): void {
    const relative = path.relative(this.#root, path.resolve(target));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("ATTACHMENT_PATH_BOUNDARY_VIOLATION");
  }
}
