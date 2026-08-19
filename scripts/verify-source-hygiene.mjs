import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = process.cwd();
const banned = [];

async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    const repoPath = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      await walk(absolute);
      continue;
    }
    if (/^\.bootstrap\/v020\.part\d+$/u.test(repoPath)) banned.push(repoPath);
  }
}

await walk(resolve(root, ".bootstrap"));

if (banned.length > 0) {
  throw new Error(`SOURCE_HYGIENE_FAIL:obsolete-v020-materializer:${banned.sort().join(",")}`);
}

console.log("SOURCE_HYGIENE_PASS obsoleteMaterializer=absent trackedSource=canonical");
