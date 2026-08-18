import { readFile, writeFile } from "node:fs/promises";
const file = "src/main/services/api-evolution-service.ts";
const before = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
const oldText = "global pnpm shim, corepack enable ve Program Files yazımı kullanılmıyor.";
const newText = "global pnpm shim veya Program Files yazımı kullanılmıyor.";
if (!before.includes(oldText) && !before.includes(newText)) throw new Error("V019_COREPACK_MESSAGE_PATTERN_MISSING");
const after = before.replace(oldText, newText);
if (after !== before) await writeFile(file, after, "utf8");
process.stdout.write(`V019_COREPACK_MESSAGE_FIXED changed=${after !== before}\n`);
