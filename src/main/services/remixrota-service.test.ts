import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { StateDatabase } from "./database.js";
import { RemixRotaService } from "./remixrota-service.js";

const temporaryDirectories: string[] = [];
const databases: StateDatabase[] = [];
const servers: net.Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const database of databases.splice(0)) database.close();
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

function playerSnapshot(isPlaying = false) {
  return {
    serviceId: "com.remixrota.player",
    serviceVersion: "1.1.0",
    protocol: { major: 1, minor: 0 },
    current: { videoId: "track-1", title: "Gerçek Parça", artist: "Sanatçı", thumbnailUrl: "https://example.invalid/a.jpg", source: "YouTube Music", durationText: "3:20" },
    isPlaying,
    playerReady: true,
    isFavorite: false,
    repeat: false,
    volume: 74,
    progress: 21,
    duration: 200,
    queueCount: 3,
    activeView: "home",
    windowVisible: true
  };
}

const library = { activeView: "home", activeGenreId: null, title: "Ana Sayfa", subtitle: "Canlı", busy: false, currentVideoId: "track-1", tracks: [playerSnapshot().current], favoriteIds: [] };

const windowsIt = process.platform === "win32" ? it : it.skip;

describe("RemixRotaService", () => {
  windowsIt("discovers the real companion contract, handshakes over the current-user named pipe and invokes allowlisted commands", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-remixrota-"));
    temporaryDirectories.push(root);
    const discoveryDirectory = path.join(root, "Integration");
    await mkdir(discoveryDirectory, { recursive: true });
    const executable = path.join(root, "RemixRota.exe");
    await writeFile(executable, Buffer.from([0x4d, 0x5a, 0, 0]));
    const pipeName = `devbox-remixrota-test-${randomUUID()}`;
    let connectedSocket: net.Socket | null = null;
    const server = net.createServer((socket) => {
      connectedSocket = socket;
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += String(chunk);
        for (;;) {
          const newline = buffer.indexOf("\n");
          if (newline < 0) break;
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const message = JSON.parse(line) as Record<string, unknown>;
          if (message.type === "hello") {
            socket.write(`${JSON.stringify({ type: "helloAck", protocol: { major: 1, minor: 0 }, service: { id: "com.remixrota.player", version: "1.1.0", processId: process.pid }, sessionId: randomUUID(), grantedCapabilities: ["player.read", "player.control", "library.read", "library.search", "app.visibility"], heartbeatSeconds: 15, nonce: message.nonce, connectedAt: new Date().toISOString() })}\n`);
          } else if (message.type === "request") {
            const command = String(message.command ?? "");
            const payload = command === "library.getView" || command === "library.search" ? library : playerSnapshot(command === "player.play");
            socket.write(`${JSON.stringify({ type: "response", requestId: message.requestId, ok: true, payload })}\n`);
          } else if (message.type === "ping") socket.write(`${JSON.stringify({ type: "pong", sentAt: new Date().toISOString() })}\n`);
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => server.listen(`\\\\.\\pipe\\${pipeName}`, () => resolve()).once("error", reject));
    const discoveryPath = path.join(discoveryDirectory, "companion.json");
    await writeFile(discoveryPath, JSON.stringify({ schemaVersion: 1, serviceId: "com.remixrota.player", serviceVersion: "1.1.0", protocol: { major: 1, minor: 0 }, transport: "windows-named-pipe", pipeName, currentUserOnly: true, processId: process.pid, executablePath: executable, integrationAssetDirectory: discoveryDirectory, startedAt: new Date().toISOString() }), "utf8");
    const database = new StateDatabase(path.join(root, "state.sqlite"));
    databases.push(database);
    const service = new RemixRotaService(database, { discoveryPath, appVersion: "0.1.16" });
    try {
      await service.configureExecutable(executable);
      const status = await service.connect();
      expect(status.state).toBe("READY");
      expect(status.grantedCapabilities).toContain("player.control");
      expect(status.player?.current?.title).toBe("Gerçek Parça");
      expect(status.library?.tracks).toHaveLength(1);
      const played = await service.invoke({ command: "player.play", arguments: {} });
      expect((played.result as { isPlaying?: boolean }).isPlaying).toBe(true);
      expect(RemixRotaService.isSafeAutomaticRetry("player.getSnapshot")).toBe(true);
      expect(RemixRotaService.isSafeAutomaticRetry("player.next")).toBe(false);
      connectedSocket?.write(`${JSON.stringify({ type: "event", eventName: "x".repeat(161), payload: null })}\n`);
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect((await service.inspect()).lastError).toBe("REMIXROTA_INVALID_EVENT");
    } finally { service.close(); }
  }, 30_000);

  windowsIt("rejects a stale discovery record whose advertised process is no longer running", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-remixrota-stale-"));
    temporaryDirectories.push(root);
    const executable = path.join(root, "RemixRota.exe");
    await writeFile(executable, Buffer.from([0x4d, 0x5a, 0, 0]));
    const discoveryPath = path.join(root, "companion.json");
    await writeFile(discoveryPath, JSON.stringify({ schemaVersion: 1, serviceId: "com.remixrota.player", serviceVersion: "1.1.0", protocol: { major: 1, minor: 0 }, transport: "windows-named-pipe", pipeName: "stale-remixrota", currentUserOnly: true, processId: 2147483000, executablePath: executable, integrationAssetDirectory: root, startedAt: new Date().toISOString() }), "utf8");
    const database = new StateDatabase(path.join(root, "state.sqlite"));
    databases.push(database);
    const service = new RemixRotaService(database, { discoveryPath, appVersion: "0.1.17" });
    await service.configureExecutable(executable);
    const status = await service.inspect();
    expect(status.discovery).toBeNull();
    expect(status.lastError).toBe("REMIXROTA_DISCOVERY_PROCESS_NOT_RUNNING");
    service.close();
  });

  it("rejects non-RemixRota executables before storing a companion path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devbox-remixrota-invalid-"));
    temporaryDirectories.push(root);
    const database = new StateDatabase(path.join(root, "state.sqlite"));
    databases.push(database);
    const service = new RemixRotaService(database, { discoveryPath: path.join(root, "companion.json"), appVersion: "0.1.16" });
    await expect(service.configureExecutable(path.join(root, "not-remixrota.exe"))).rejects.toThrow("REMIXROTA_EXECUTABLE_NAME_INVALID");
    expect(service.configuredExecutable()).toBeNull();
  });
});
