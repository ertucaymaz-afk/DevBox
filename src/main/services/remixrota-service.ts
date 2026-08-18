import { randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  RemixRotaCapabilitySchema,
  RemixRotaCommandResultSchema,
  RemixRotaDiscoverySchema,
  RemixRotaEventSchema,
  RemixRotaInvokeInputSchema,
  RemixRotaLibraryViewSchema,
  RemixRotaPlayerSnapshotSchema,
  RemixRotaStatusSchema,
  type RemixRotaCapability,
  type RemixRotaCommand,
  type RemixRotaCommandResult,
  type RemixRotaDiscovery,
  type RemixRotaEvent,
  type RemixRotaStatus
} from "../../shared/remixrota-contracts.js";
import type { StateDatabase } from "./database.js";

const SETTING_KEY = "integration:remixrota:executable:v1";
const REQUEST_TIMEOUT_MS = 15_000;
const HANDSHAKE_TIMEOUT_MS = 5_000;
const DISCOVERY_WAIT_MS = 10_000;
const MAX_BUFFER_CHARS = 1_000_000;
const MAX_PENDING_REQUESTS = 64;
const REQUESTED_CAPABILITIES: readonly RemixRotaCapability[] = ["player.read", "player.control", "library.read", "library.search", "app.visibility"];
const READ_COMMANDS = new Set<RemixRotaCommand>(["service.getInfo", "player.getSnapshot", "library.getQueue", "library.getView", "library.search"]);

type Pending = { command: RemixRotaCommand; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
type Listener = (event: RemixRotaEvent) => void;
type LaunchFunction = (executable: string) => ChildProcess;

type ServiceOptions = {
  discoveryPath: string;
  appVersion: string;
  launch?: LaunchFunction;
};

function failure(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, " ").trim().slice(0, 2_000); }
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }

export class RemixRotaService {
  readonly #database: StateDatabase;
  readonly #options: ServiceOptions;
  readonly #listeners = new Set<Listener>();
  readonly #pending = new Map<string, Pending>();
  #socket: net.Socket | null = null;
  #buffer = "";
  #connecting: Promise<RemixRotaStatus> | null = null;
  #heartbeat: NodeJS.Timeout | null = null;
  #spawnedProcess: ChildProcess | null = null;
  #grantedCapabilities: RemixRotaCapability[] = [];
  #discovery: RemixRotaDiscovery | null = null;
  #player: RemixRotaStatus["player"] = null;
  #library: RemixRotaStatus["library"] = null;
  #lastConnectedAt: string | null = null;
  #lastEventAt: string | null = null;
  #lastError: string | null = null;
  #state: RemixRotaStatus["state"] = "UNCONFIGURED";

  public constructor(database: StateDatabase, options: ServiceOptions) {
    this.#database = database;
    this.#options = options;
  }

  public subscribe(listener: Listener): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }

  public configuredExecutable(): string | null {
    const value = this.#database.getSetting<unknown>(SETTING_KEY);
    return typeof value === "string" && value.trim() ? path.resolve(value) : null;
  }

  public async configureExecutable(executablePath: string): Promise<RemixRotaStatus> {
    const resolved = path.resolve(executablePath);
    if (path.basename(resolved).toLocaleLowerCase("en-US") !== "remixrota.exe") throw new Error("REMIXROTA_EXECUTABLE_NAME_INVALID");
    await access(resolved);
    const handle = await import("node:fs/promises").then(({ open }) => open(resolved, "r"));
    try {
      const signature = Buffer.alloc(2);
      const { bytesRead } = await handle.read(signature, 0, 2, 0);
      if (bytesRead !== 2 || signature[0] !== 0x4d || signature[1] !== 0x5a) throw new Error("REMIXROTA_EXECUTABLE_NOT_PE_MZ");
    } finally { await handle.close(); }
    this.#database.setSetting(SETTING_KEY, resolved);
    this.#state = "DISCOVERED";
    this.#lastError = null;
    return await this.inspect();
  }

  async #readDiscovery(): Promise<RemixRotaDiscovery | null> {
    try {
      const raw = await readFile(this.#options.discoveryPath, "utf8");
      return RemixRotaDiscoverySchema.parse(JSON.parse(raw));
    } catch { return null; }
  }

  public async inspect(): Promise<RemixRotaStatus> {
    const discovery = await this.#readDiscovery();
    if (discovery) {
      this.#discovery = discovery;
      if (!this.#socket && this.#state !== "CONNECTING") this.#state = "DISCOVERED";
    }
    const configured = this.configuredExecutable();
    if (!discovery && !configured && !this.#socket) this.#state = "UNCONFIGURED";
    return RemixRotaStatusSchema.parse({
      state: this.#state,
      detail: this.#detail(discovery, configured),
      configuredExecutable: configured,
      discovery: discovery ?? this.#discovery,
      grantedCapabilities: this.#grantedCapabilities,
      player: this.#player,
      library: this.#library,
      lastConnectedAt: this.#lastConnectedAt,
      lastEventAt: this.#lastEventAt,
      lastError: this.#lastError
    });
  }

  #detail(discovery: RemixRotaDiscovery | null, configured: string | null): string {
    if (this.#state === "READY") return `RemixRota ${discovery?.serviceVersion ?? this.#discovery?.serviceVersion ?? "1.x"} companion bağlı; müzik durumu tek sahibi olan RemixRota'dan okunuyor.`;
    if (this.#state === "CONNECTING") return "RemixRota companion named pipe el sıkışması sürüyor.";
    if (this.#state === "DEGRADED") return "RemixRota companion bağlantısı koptu; son doğrulanmış durum korunuyor ve yeniden bağlantı bekleniyor.";
    if (this.#state === "FAILED") return this.#lastError ?? "RemixRota companion bağlantısı başarısız.";
    if (discovery) return `RemixRota companion keşfedildi: ${discovery.pipeName}.`;
    if (configured) return "RemixRota yolu doğrulandı; companion henüz çalışmıyor.";
    return "RemixRota seçilmedi. DevBox müzik motorunu kopyalamaz; companion protokolüne bağlanır.";
  }

  public async connect(): Promise<RemixRotaStatus> {
    if (this.#socket && this.#state === "READY") return await this.inspect();
    if (this.#connecting) return await this.#connecting;
    this.#connecting = this.#connectInternal().finally(() => { this.#connecting = null; });
    return await this.#connecting;
  }

  async #connectInternal(): Promise<RemixRotaStatus> {
    if (process.platform !== "win32") throw new Error("REMIXROTA_WINDOWS_REQUIRED");
    this.#state = "CONNECTING";
    this.#lastError = null;
    let discovery = await this.#readDiscovery();
    if (!discovery) {
      const executable = this.configuredExecutable();
      if (!executable) { this.#state = "UNCONFIGURED"; throw new Error("REMIXROTA_EXECUTABLE_NOT_CONFIGURED"); }
      const launch = this.#options.launch ?? ((target: string) => spawn(target, ["--companion"], { detached: true, stdio: "ignore", windowsHide: true, shell: false }));
      this.#spawnedProcess = launch(executable);
      this.#spawnedProcess.unref?.();
      const deadline = Date.now() + DISCOVERY_WAIT_MS;
      while (!discovery && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        discovery = await this.#readDiscovery();
      }
      if (!discovery) { this.#state = "FAILED"; this.#lastError = "REMIXROTA_DISCOVERY_TIMEOUT"; throw new Error(this.#lastError); }
    }
    this.#discovery = discovery;
    const socket = net.createConnection(`\\\\.\\pipe\\${discovery.pipeName}`);
    this.#socket = socket;
    socket.setEncoding("utf8");
    socket.setNoDelay(true);
    socket.on("data", (chunk) => this.#onData(String(chunk)));
    socket.on("close", () => this.#onClosed(new Error("REMIXROTA_CONNECTION_CLOSED")));
    socket.on("error", (error) => this.#onClosed(error));
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("REMIXROTA_CONNECT_TIMEOUT")), HANDSHAKE_TIMEOUT_MS);
        timeout.unref();
        const connected = (): void => { clearTimeout(timeout); socket.off("error", failed); resolve(); };
        const failed = (error: Error): void => { clearTimeout(timeout); socket.off("connect", connected); reject(error); };
        socket.once("connect", connected);
        socket.once("error", failed);
      });
      const nonce = randomUUID();
      const ack = await this.#waitFor((message) => message.type === "helloAck" && message.nonce === nonce, HANDSHAKE_TIMEOUT_MS, () => {
        this.#write({
          type: "hello",
          protocol: { major: 1, minor: 0 },
          host: { id: "com.devbox.desktop", version: this.#options.appVersion.slice(0, 64), instanceId: randomUUID() },
          requestedCapabilities: REQUESTED_CAPABILITIES,
          nonce
        });
      });
      const protocol = record(ack.protocol);
      if (protocol?.major !== 1) throw new Error("REMIXROTA_PROTOCOL_MAJOR_UNSUPPORTED");
      const capabilities = Array.isArray(ack.grantedCapabilities) ? ack.grantedCapabilities.flatMap((value): RemixRotaCapability[] => {
        const parsed = RemixRotaCapabilitySchema.safeParse(value); return parsed.success ? [parsed.data] : [];
      }) : [];
      this.#grantedCapabilities = [...new Set(capabilities)];
      if (!this.#grantedCapabilities.includes("player.read")) throw new Error("REMIXROTA_PLAYER_READ_CAPABILITY_REQUIRED");
      this.#state = "READY";
      this.#lastConnectedAt = new Date().toISOString();
      this.#lastError = null;
      this.#startHeartbeat();
      await this.refresh();
      return await this.inspect();
    } catch (error) {
      this.#state = "FAILED";
      this.#lastError = failure(error);
      socket.destroy();
      throw error;
    }
  }

  public async refresh(): Promise<RemixRotaStatus> {
    if (!this.#socket || this.#state !== "READY") return await this.inspect();
    const player = await this.#invokeRaw("player.getSnapshot", {});
    this.#player = RemixRotaPlayerSnapshotSchema.parse(player);
    if (this.#grantedCapabilities.includes("library.read")) {
      try { this.#library = RemixRotaLibraryViewSchema.parse(await this.#invokeRaw("library.getView", {})); }
      catch (error) { this.#lastError = failure(error); }
    }
    return await this.inspect();
  }

  public async invoke(rawInput: unknown): Promise<RemixRotaCommandResult> {
    const input = RemixRotaInvokeInputSchema.parse(rawInput);
    if (!this.#socket || this.#state !== "READY") await this.connect();
    const started = performance.now();
    const result = await this.#invokeRaw(input.command, input.arguments);
    if (input.command.startsWith("player.")) {
      const parsed = RemixRotaPlayerSnapshotSchema.safeParse(result);
      if (parsed.success) this.#player = parsed.data;
    }
    if (input.command === "library.getView" || input.command === "library.search") {
      const parsed = RemixRotaLibraryViewSchema.safeParse(result);
      if (parsed.success) this.#library = parsed.data;
    }
    return RemixRotaCommandResultSchema.parse({ command: input.command, result, durationMs: Math.max(0, Math.round(performance.now() - started)) });
  }

  async #invokeRaw(command: RemixRotaCommand, payload: Record<string, unknown>): Promise<unknown> {
    if (!this.#socket || this.#socket.destroyed || this.#state !== "READY") throw new Error("REMIXROTA_NOT_CONNECTED");
    if (this.#pending.size >= MAX_PENDING_REQUESTS) throw new Error("REMIXROTA_PENDING_REQUEST_LIMIT");
    const requestId = randomUUID();
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new Error(`REMIXROTA_REQUEST_TIMEOUT:${command}`));
      }, REQUEST_TIMEOUT_MS);
      timer.unref();
      this.#pending.set(requestId, { command, resolve, reject, timer });
      this.#write({ type: "request", requestId, command, payload });
    });
  }

  #write(message: unknown): void {
    const line = JSON.stringify(message);
    if (line.length > 65_536) throw new Error("REMIXROTA_OUTBOUND_MESSAGE_TOO_LARGE");
    if (!this.#socket || this.#socket.destroyed || !this.#socket.writable) throw new Error("REMIXROTA_SOCKET_NOT_WRITABLE");
    this.#socket.write(`${line}\n`, "utf8");
  }

  #onData(chunk: string): void {
    this.#buffer += chunk;
    if (this.#buffer.length > MAX_BUFFER_CHARS) { this.#socket?.destroy(new Error("REMIXROTA_RECEIVE_BUFFER_EXCEEDED")); return; }
    for (;;) {
      const newline = this.#buffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.#buffer.slice(0, newline).trim();
      this.#buffer = this.#buffer.slice(newline + 1);
      if (!line) continue;
      let message: Record<string, unknown>;
      try { const parsed = JSON.parse(line); const object = record(parsed); if (!object) continue; message = object; } catch { continue; }
      if (message.type === "response" && typeof message.requestId === "string") {
        const pending = this.#pending.get(message.requestId);
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.#pending.delete(message.requestId);
        if (message.ok === true) pending.resolve(message.payload ?? null);
        else {
          const error = record(message.error);
          const code = typeof error?.code === "string" ? error.code : "request_failed";
          const detail = typeof error?.message === "string" ? error.message : "RemixRota isteği başarısız.";
          pending.reject(new Error(`REMIXROTA_${code.toLocaleUpperCase("en-US")}:${detail}`));
        }
        continue;
      }
      if (message.type === "event" && typeof message.eventName === "string") {
        const event = RemixRotaEventSchema.parse({ type: message.eventName, payload: message.payload ?? null, receivedAt: new Date().toISOString() });
        this.#lastEventAt = event.receivedAt;
        this.#applyEvent(event);
        for (const listener of this.#listeners) listener(event);
        continue;
      }
      for (const listener of this.#listeners) {
        const event = RemixRotaEventSchema.safeParse({ type: String(message.type ?? "protocol"), payload: message, receivedAt: new Date().toISOString() });
        if (event.success) listener(event.data);
      }
    }
  }

  #applyEvent(event: RemixRotaEvent): void {
    if (event.type === "player.state") {
      const parsed = RemixRotaPlayerSnapshotSchema.safeParse(event.payload);
      if (parsed.success) this.#player = parsed.data;
    } else if (event.type === "library.viewChanged") {
      const parsed = RemixRotaLibraryViewSchema.safeParse(event.payload);
      if (parsed.success) this.#library = parsed.data;
    }
  }

  #waitFor(predicate: (message: Record<string, unknown>) => boolean, timeoutMs: number, begin: () => void): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const listener = (event: RemixRotaEvent): void => {
        const payload = record(event.payload);
        if (!payload || !predicate(payload)) return;
        finish(); resolve(payload);
      };
      const finish = (): void => { if (settled) return; settled = true; clearTimeout(timer); this.#listeners.delete(listener); };
      const timer = setTimeout(() => { finish(); reject(new Error("REMIXROTA_HANDSHAKE_TIMEOUT")); }, timeoutMs);
      timer.unref();
      this.#listeners.add(listener);
      try { begin(); } catch (error) { finish(); reject(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  #startHeartbeat(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = setInterval(() => {
      try { if (this.#socket && this.#state === "READY") this.#write({ type: "ping" }); } catch { /* close handler is authoritative */ }
    }, 12_000);
    this.#heartbeat.unref();
  }

  #onClosed(error: Error): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    const socket = this.#socket;
    this.#socket = null;
    this.#buffer = "";
    if (this.#state === "READY" || this.#state === "CONNECTING") this.#state = "DEGRADED";
    this.#lastError = failure(error);
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.#pending.clear();
    if (socket && !socket.destroyed) socket.destroy();
  }

  public disconnect(): void {
    this.#state = this.#discovery ? "DISCOVERED" : this.configuredExecutable() ? "DISCOVERED" : "UNCONFIGURED";
    this.#lastError = null;
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    const socket = this.#socket;
    this.#socket = null;
    this.#buffer = "";
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("REMIXROTA_DISCONNECTED")); }
    this.#pending.clear();
    socket?.destroy();
  }

  public close(): void { this.disconnect(); this.#listeners.clear(); }

  public static isSafeAutomaticRetry(command: RemixRotaCommand): boolean { return READ_COMMANDS.has(command); }
}
