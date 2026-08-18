import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectSummary } from "../../shared/contracts.js";
import type { CommandRunner } from "./command-runner.js";
import type { ProjectService } from "./project-service.js";

export type SelfDevelopmentOptions = {
  packaged: boolean;
  appRoot: string;
  templateRoot: string;
  workspaceRoot: string;
  appVersion: string;
};

export class SelfDevelopmentService {
  readonly #projects: ProjectService;
  readonly #runner: CommandRunner;
  readonly #options: SelfDevelopmentOptions;

  public constructor(projects: ProjectService, runner: CommandRunner, options: SelfDevelopmentOptions) {
    this.#projects = projects;
    this.#runner = runner;
    this.#options = options;
  }

  public async ensure(): Promise<ProjectSummary> {
    if (!this.#options.packaged) return await this.#projects.open(this.#options.appRoot);

    const root = path.join(this.#options.workspaceRoot, "DevBox-self-development");
    const packageFile = path.join(root, "package.json");
    if (!existsSync(packageFile)) await this.#seedWorkspace(root);
    await this.#ensureMarker(root);
    await this.#ensureGitBaseline(root);
    return await this.#projects.open(root);
  }

  async #seedWorkspace(root: string): Promise<void> {
    if (!existsSync(this.#options.templateRoot)) throw new Error("SELF_DEVELOPMENT_SOURCE_TEMPLATE_MISSING");
    await mkdir(path.dirname(root), { recursive: true });
    const staging = `${root}.bootstrap-${randomUUID()}`;
    await rm(staging, { recursive: true, force: true });
    await cp(this.#options.templateRoot, staging, { recursive: true, force: true, dereference: false });
    await this.#writeMarker(staging);
    if (existsSync(root)) await rm(root, { recursive: true, force: true });
    await rename(staging, root);
  }

  async #ensureMarker(root: string): Promise<void> {
    const marker = path.join(root, ".devbox-managed-source.json");
    if (!existsSync(marker)) await this.#writeMarker(root);
  }

  async #writeMarker(root: string): Promise<void> {
    await writeFile(path.join(root, ".devbox-managed-source.json"), `${JSON.stringify({
      schemaVersion: 1,
      product: "DevBox",
      purpose: "persistent-self-development-source",
      seededFromVersion: this.#options.appVersion,
      createdAt: new Date().toISOString(),
      realityContract: "NO_FABRICATED_OR_REPRESENTATIVE_SUCCESS"
    }, null, 2)}\n`, "utf8");
  }

  async #ensureGitBaseline(root: string): Promise<void> {
    if (existsSync(path.join(root, ".git"))) return;
    const init = await this.#runner.run({ executable: "git", args: ["init"], cwd: root, timeoutMs: 60_000, maxOutputBytes: 2 * 1024 * 1024 });
    if (init.exitCode !== 0 || init.timedOut) return;
    const add = await this.#runner.run({ executable: "git", args: ["add", "-A"], cwd: root, timeoutMs: 2 * 60_000, maxOutputBytes: 2 * 1024 * 1024 });
    if (add.exitCode !== 0 || add.timedOut) return;
    await this.#runner.run({
      executable: "git",
      args: ["-c", "user.name=DevBox", "-c", "user.email=devbox@local.invalid", "commit", "--no-gpg-sign", "-m", `DevBox packaged baseline ${this.#options.appVersion}`],
      cwd: root,
      timeoutMs: 2 * 60_000,
      maxOutputBytes: 4 * 1024 * 1024
    });
  }
}
