import { monitorEventLoopDelay } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CommandRunner } from "../dist/main/main/services/command-runner.js";

const workspace = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, (match) => match.slice(1)));
const requestedSeconds = Number(process.env.DEVBOX_SOAK_SECONDS ?? "20");
const durationSeconds = Number.isFinite(requestedSeconds) ? Math.max(5, Math.min(3_600, Math.trunc(requestedSeconds))) : 20;
const deadline = performance.now() + durationSeconds * 1_000;
const runner = new CommandRunner();
const lag = monitorEventLoopDelay({ resolution: 20 });
const samples = [];
let iterations = 0;
let failures = 0;
let peakRss = process.memoryUsage().rss;
let peakHeap = process.memoryUsage().heapUsed;

lag.enable();
while (performance.now() < deadline) {
  const batch = await Promise.all(Array.from({ length: 4 }, (_, index) => runner.run({
    executable: process.execPath,
    args: ["-e", `const b=Buffer.alloc(262144,${index});process.stdout.write(String(b.length))`],
    cwd: workspace,
    timeoutMs: 5_000,
    maxOutputBytes: 4_096
  })));
  iterations += batch.length;
  failures += batch.filter((result) => result.exitCode !== 0 || result.exitReason !== "EXITED").length;
  const memory = process.memoryUsage();
  peakRss = Math.max(peakRss, memory.rss);
  peakHeap = Math.max(peakHeap, memory.heapUsed);
  samples.push({ atMs: Math.round(performance.now()), rss: memory.rss, heapUsed: memory.heapUsed });
}
lag.disable();

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  verdict: failures === 0 ? "PASS" : "FAIL",
  scope: "short-local-command-runner-soak",
  durationSeconds,
  iterations,
  failures,
  peakRssBytes: peakRss,
  peakHeapBytes: peakHeap,
  eventLoopDelayMs: {
    mean: Number.isFinite(lag.mean) ? Number((lag.mean / 1e6).toFixed(3)) : null,
    p95: Number((lag.percentile(95) / 1e6).toFixed(3)),
    max: Number((lag.max / 1e6).toFixed(3))
  },
  startRssBytes: samples[0]?.rss ?? null,
  endRssBytes: samples.at(-1)?.rss ?? null,
  limitations: ["This 20-second default smoke does not replace the requested multi-hour CPU/RAM/I/O soak on clean Windows VMs."],
  sampleCount: samples.length
};

const outputDirectory = path.join(workspace, "outputs");
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, "soak-smoke.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures !== 0) process.exitCode = 1;
