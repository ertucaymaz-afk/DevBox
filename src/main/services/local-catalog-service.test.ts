import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CommandRunner } from "./command-runner.js";
import { LocalCatalogService } from "./local-catalog-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

function digest(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex").toUpperCase();
}

describe("local catalog", () => {
  it("separates verified source inventory from installed and running state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-catalog-"));
    temporaryDirectories.push(root);
    const skills = path.join(root, "skills");
    const plugins = path.join(root, "plugins");
    await Promise.all([mkdir(skills), mkdir(plugins)]);

    const skillArchive = Buffer.from("skill-archive", "utf8");
    await writeFile(path.join(skills, "dev-tool.zip"), skillArchive);
    await writeFile(path.join(skills, "RELEASE-REPORT.json"), JSON.stringify({ version: "1.2.0", products: [{ id: "dev-tool", name: "Developer Tool", archive: "dev-tool.zip", toolkitEntries: 2 }] }));
    await writeFile(path.join(skills, "SHA256SUMS.txt"), `${digest(skillArchive)}  dev-tool.zip\n`);

    const pluginArchive = Buffer.from("plugin-archive", "utf8");
    await writeFile(path.join(plugins, "12-Portable-AI-Plugins-v2.3.0.zip"), pluginArchive);
    await writeFile(path.join(plugins, "VALIDATION_REPORT.json"), JSON.stringify({ version: "2.3.0", packageReports: [{ id: "portable.one", displayName: "Portable One", totalTools: 4 }], counts: { plugins: 1, totalTools: 4 } }));
    await writeFile(path.join(plugins, "SHA256SUMS.txt"), `${digest(pluginArchive)}  12-Portable-AI-Plugins-v2.3.0.zip\n`);

    const service = new LocalCatalogService(path.join(root, "state"), new CommandRunner(), { skillRoot: skills, pluginRoot: plugins });
    const snapshot = await service.inspect();
    expect(snapshot.counts).toMatchObject({ skills: 1, plugins: 1, installed: 0, running: 0, blocked: 0 });
    expect(snapshot.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "skill", sourceState: "HASH_VERIFIED", runtimeState: "SOURCE_ONLY", redistributionAllowed: false }),
      expect.objectContaining({ kind: "plugin", sourceState: "HASH_VERIFIED", runtimeState: "NOT_INSTALLED", doctorState: "NOT_RUN" })
    ]));
  });
});
