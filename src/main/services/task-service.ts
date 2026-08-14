import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { CommandResult, TaskPreset } from "../../shared/contracts.js";
import type { CommandRunner } from "./command-runner.js";

export class TaskService {
  readonly #runner: CommandRunner;

  public constructor(runner: CommandRunner) {
    this.#runner = runner;
  }

  public async runPreset(rootPath: string, preset: TaskPreset): Promise<CommandResult> {
    if (preset === "git-status") {
      return await this.#runner.run({ executable: "git", args: ["-C", rootPath, "status", "--short", "--branch"], cwd: rootPath, timeoutMs: 15_000 });
    }

    const packageFile = path.join(rootPath, "package.json");
    let packageJson: { scripts?: Record<string, string>; packageManager?: string };
    try {
      packageJson = JSON.parse(await readFile(packageFile, "utf8")) as typeof packageJson;
    } catch {
      throw new Error("PACKAGE_MANIFEST_REQUIRED_FOR_PRESET");
    }
    if (!packageJson.scripts?.[preset]) throw new Error(`TASK_PRESET_NOT_DECLARED:${preset}`);

    const manager = await this.#detectPackageManager(rootPath, packageJson.packageManager);
    const args = manager === "npm" ? ["run", preset, "--"] : ["run", preset];
    const invocation = await this.#resolveManagerInvocation(manager, args);
    return await this.#runner.run({ executable: invocation.executable, args: invocation.args, cwd: rootPath, timeoutMs: preset === "test" ? 120_000 : 180_000, maxOutputBytes: 4 * 1024 * 1024 });
  }

  async #detectPackageManager(rootPath: string, declared: string | undefined): Promise<"pnpm" | "npm"> {
    if (declared?.startsWith("pnpm@")) return "pnpm";
    try {
      await access(path.join(rootPath, "pnpm-lock.yaml"));
      return "pnpm";
    } catch {
      return "npm";
    }
  }

  async #resolveManagerInvocation(manager: "pnpm" | "npm", args: readonly string[]): Promise<{ executable: string; args: string[] }> {
    if (process.platform !== "win32") return { executable: manager, args: [...args] };

    for (const rawEntry of (process.env.PATH ?? "").split(path.delimiter)) {
      const entry = rawEntry.replace(/^"|"$/g, "").trim();
      if (!entry) continue;
      const nodeExecutable = path.join(entry, "node.exe");
      const npmCli = path.join(entry, "node_modules", "npm", "bin", "npm-cli.js");
      const corepackCli = path.join(entry, "node_modules", "corepack", "dist", "corepack.js");
      try {
        await access(nodeExecutable);
        if (manager === "npm") {
          await access(npmCli);
          return { executable: nodeExecutable, args: [npmCli, ...args] };
        }
        await access(corepackCli);
        return { executable: nodeExecutable, args: [corepackCli, "pnpm", ...args] };
      } catch {
        // Continue to the next PATH entry; no shell or command-script fallback is allowed.
      }
    }
    throw new Error(`PACKAGE_MANAGER_RUNTIME_NOT_FOUND:${manager}`);
  }
}
