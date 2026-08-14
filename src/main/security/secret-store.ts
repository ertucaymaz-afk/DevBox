import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeStorage } from "electron";

type StoredSecret = {
  version: 1;
  keyId: string;
  encrypted: string;
  createdAt: string;
};

export class SecretStore {
  readonly #directory: string;

  public constructor(directory: string) {
    this.#directory = directory;
  }

  public async getOrCreateApiKey(): Promise<{ keyId: string; value: string }> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Windows protected storage is unavailable; refusing to persist the DevBox API key in plaintext.");
    }

    await mkdir(this.#directory, { recursive: true });
    const target = path.join(this.#directory, "core-api-key.json");
    try {
      const parsed = JSON.parse(await readFile(target, "utf8")) as StoredSecret;
      if (parsed.version !== 1 || !parsed.keyId || !parsed.encrypted) {
        throw new Error("Stored API key envelope is invalid.");
      }
      return {
        keyId: parsed.keyId,
        value: safeStorage.decryptString(Buffer.from(parsed.encrypted, "base64"))
      };
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }

    const value = randomBytes(32).toString("base64url");
    const keyId = randomBytes(12).toString("hex");
    const envelope: StoredSecret = {
      version: 1,
      keyId,
      encrypted: safeStorage.encryptString(value).toString("base64"),
      createdAt: new Date().toISOString()
    };
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, target);
    return { keyId, value };
  }
}

