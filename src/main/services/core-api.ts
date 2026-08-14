import { randomUUID, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { AgentService } from "./agent-service.js";
import type { ApiEvolutionService } from "./api-evolution-service.js";
import type { AttachmentService } from "./attachment-service.js";
import type { CapabilityService } from "./capability-service.js";
import type { StateDatabase } from "./database.js";
import type { GitService } from "./git-service.js";
import type { ProjectService } from "./project-service.js";
import type { SettingsService } from "./settings-service.js";

type CoreApiOptions = {
  apiKey: string;
  database: StateDatabase;
  projects: ProjectService;
  capabilities: CapabilityService;
  agent: AgentService;
  evolution: ApiEvolutionService;
  attachments: AttachmentService;
  git: GitService;
  settings: SettingsService;
  probeCwd: string;
  appVersion: string;
};

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

const IdParamsSchema = z.object({ id: z.string().min(8).max(128) }).strict();
const ItemParamsSchema = z.object({ id: z.string().min(8).max(128), itemId: z.string().min(8).max(128) }).strict();
const ThreadCreateBodySchema = z.object({ projectId: z.string().min(8).max(128), title: z.string().trim().min(1).max(160).default("Yeni görev") }).strict();
const ThreadRenameBodySchema = z.object({ title: z.string().trim().min(1).max(160) }).strict();
const ThreadMessageBodySchema = z.object({
  content: z.string().trim().max(64_000).default(""),
  attachmentIds: z.array(z.string().min(8).max(128)).max(20).default([])
}).strict().refine((input) => input.content.length > 0 || input.attachmentIds.length > 0, { message: "MESSAGE_OR_ATTACHMENT_REQUIRED" });
const ThreadItemUpdateBodySchema = z.object({ content: z.string().trim().min(1).max(64_000) }).strict();
const EvolutionPatchBodySchema = z.object({
  enabled: z.boolean().optional(),
  directive: z.string().trim().min(80).max(64_000).optional()
}).strict().refine((value) => value.enabled !== undefined || value.directive !== undefined, { message: "EVOLUTION_PATCH_REQUIRED" });

export class CoreApi {
  readonly #options: CoreApiOptions;
  readonly #server: FastifyInstance;
  readonly #instanceId = randomUUID();
  #origin: string | null = null;

  public constructor(options: CoreApiOptions) {
    this.#options = options;
    this.#server = Fastify({
      logger: false,
      bodyLimit: 1_048_576,
      requestTimeout: 30_000,
      trustProxy: false
    });
  }

  public get origin(): string {
    if (!this.#origin) throw new Error("CORE_API_NOT_STARTED");
    return this.#origin;
  }

  public async start(): Promise<string> {
    await this.#server.register(rateLimit, {
      global: true,
      max: 180,
      timeWindow: "1 minute",
      errorResponseBuilder: () => ({ code: "RATE_LIMITED", message: "Core API request rate exceeded." })
    });

    this.#server.addHook("onRequest", async (request, reply) => {
      const requestPath = request.url.split("?", 1)[0] ?? request.url;
      if (requestPath !== "/v1" && !requestPath.startsWith("/v1/")) return;
      const authorization = request.headers.authorization ?? "";
      const prefix = "Bearer ";
      if (!authorization.startsWith(prefix) || !constantTimeEqual(authorization.slice(prefix.length), this.#options.apiKey)) {
        return await reply.code(401).send({ code: "UNAUTHORIZED", message: "A valid DevBox API key is required." });
      }
    });
    this.#server.addHook("onSend", async (request, reply, payload) => {
      reply.header("x-devbox-request-id", request.id);
      reply.header("x-devbox-api-version", "v1");
      reply.header("cache-control", "no-store");
      return payload;
    });
    this.#server.setErrorHandler(async (error, request, reply) => {
      if (error instanceof z.ZodError) {
        return await reply.code(400).send({ code: "INVALID_REQUEST", message: "Request validation failed.", requestId: request.id });
      }
      const known = error instanceof Error && /^[A-Z][A-Z0-9_]+$/u.test(error.message) ? error.message : "INTERNAL_ERROR";
      const status = known.endsWith("_NOT_FOUND") ? 404 : known === "INTERNAL_ERROR" ? 500 : 409;
      return await reply.code(status).send({ code: known, message: known === "INTERNAL_ERROR" ? "The request could not be completed." : known, requestId: request.id });
    });

    this.#server.get("/health/live", async () => ({ status: "live", checkedAt: new Date().toISOString() }));
    this.#server.get("/health/ready", async (_request, reply) => {
      const integrity = this.#options.database.integrityCheck();
      if (!integrity.ok) return await reply.code(503).send({ status: "not-ready", integrity });
      return { status: "ready", integrity, checkedAt: new Date().toISOString() };
    });
    this.#server.get("/v1", async () => ({
      product: "DevBox",
      apiVersion: "v1",
      protocol: "HTTP/JSON",
      transport: "loopback",
      authentication: "Bearer DEVBOX_API_KEY",
      resources: ["runtime", "capabilities", "providers", "models", "projects", "threads", "evolution", "approvals", "git", "toolkits", "skills", "plugins", "mcp", "vercel", "github", "diagnostics"]
    }));
    this.#server.get("/v1/runtime", async () => ({
      product: "DevBox",
      version: this.#options.appVersion,
      apiVersion: "v1",
      platform: process.platform,
      architecture: process.arch,
      pid: process.pid,
      state: "READY"
    }));
    this.#server.get("/v1/capabilities", async () => ({
      items: await this.#options.capabilities.inspect(this.#options.probeCwd)
    }));
    this.#server.get("/v1/providers", async () => {
      const capabilities = await this.#options.capabilities.inspect(this.#options.probeCwd);
      const nvidia = capabilities.find((item) => item.id === "nvidia-nim");
      return { items: [{ id: "nvidia", displayName: "NVIDIA NIM", state: nvidia?.state ?? "UNAVAILABLE", credentialExposed: false, evidence: nvidia?.evidence ?? [] }] };
    });
    this.#server.get("/v1/models", async () => {
      const capabilities = await this.#options.capabilities.inspect(this.#options.probeCwd);
      const nvidia = capabilities.find((item) => item.id === "nvidia-nim");
      return { items: [{ id: "nvidia/nemotron-3-super-120b-a12b", provider: "nvidia", state: nvidia?.state ?? "UNAVAILABLE", liveVerified: nvidia?.state === "READY" }] };
    });
    this.#server.get("/v1/projects", async () => ({ items: this.#options.projects.list() }));
    this.#server.get("/v1/projects/:id", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      return { item: this.#options.projects.get(params.id) };
    });
    this.#server.get("/v1/projects/:id/threads", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      this.#options.projects.get(params.id);
      return { items: this.#options.database.listThreads(params.id) };
    });
    this.#server.get("/v1/projects/:id/git/status", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      return { item: await this.#options.git.status(this.#options.projects.get(params.id).rootPath) };
    });
    this.#server.get("/v1/projects/:id/evolution", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      return { item: this.#options.evolution.get(params.id), scoreMeaning: "Kanıtlanmış başarılı iz kapsamı; model eğitimi veya otonom kod kalitesi puanı değildir." };
    });
    this.#server.patch("/v1/projects/:id/evolution", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      const body = EvolutionPatchBodySchema.parse(request.body);
      let item = this.#options.evolution.get(params.id);
      if (body.directive !== undefined) item = this.#options.evolution.setDirective(params.id, body.directive);
      if (body.enabled !== undefined) item = this.#options.evolution.setEnabled(params.id, body.enabled);
      return { item };
    });
    this.#server.post("/v1/projects/:id/evolution/runs", async (request, reply) => {
      const params = IdParamsSchema.parse(request.params);
      if (this.#options.settings.get().approvalPolicy === "always") throw new Error("API_INTERACTIVE_APPROVAL_REQUIRED");
      return await reply.code(202).send({ item: await this.#options.evolution.runNow(params.id) });
    });
    this.#server.get("/v1/threads", async () => ({ items: this.#options.database.listThreads() }));
    this.#server.get("/v1/threads/:id", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      return this.#options.database.getThread(params.id);
    });
    this.#server.get("/v1/threads/:id/items", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      return { items: this.#options.database.getThread(params.id).items };
    });
    this.#server.post("/v1/threads", async (request, reply) => {
      const body = ThreadCreateBodySchema.parse(request.body);
      return await reply.code(201).send(this.#options.database.createThread(body.projectId, body.title));
    });
    this.#server.patch("/v1/threads/:id", async (request) => {
      const params = IdParamsSchema.parse(request.params);
      const body = ThreadRenameBodySchema.parse(request.body);
      return { item: this.#options.database.renameThread(params.id, body.title) };
    });
    this.#server.post("/v1/threads/:id/messages", async (request, reply) => {
      const params = IdParamsSchema.parse(request.params);
      const body = ThreadMessageBodySchema.parse(request.body);
      const current = this.#options.database.getThread(params.id);
      const policy = this.#options.settings.get();
      if (!policy.networkAccess || policy.approvalPolicy === "always") throw new Error("API_INTERACTIVE_APPROVAL_REQUIRED");
      const attachmentContext = await this.#options.attachments.buildAgentContext(params.id, body.attachmentIds);
      const prompt = `${body.content || "Ekli dosyaları incele."}${attachmentContext}`;
      const assistantContent = await this.#options.agent.respond(prompt, this.#options.projects.get(current.thread.projectId).rootPath, current.items)
        .then((response) => response.content)
        .catch((error: unknown) => {
          const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/u.test(error.message) ? error.message : "AGENT_EXECUTION_FAILED";
          return `Ajan yanıtı üretilemedi (**${code}**). Sağlayıcı ve Hermes durumunu /v1/capabilities üzerinden denetleyin.`;
        });
      return await reply.code(201).send(this.#options.database.appendMessage(params.id, body.content, assistantContent, body.attachmentIds));
    });
    this.#server.patch("/v1/threads/:id/items/:itemId", async (request) => {
      const params = ItemParamsSchema.parse(request.params);
      const body = ThreadItemUpdateBodySchema.parse(request.body);
      return this.#options.database.updateUserMessage(params.id, params.itemId, body.content);
    });
    this.#server.post("/v1/threads/:id/items/:itemId/regenerate", async (request) => {
      const params = ItemParamsSchema.parse(request.params);
      const current = this.#options.database.getThread(params.id);
      const policy = this.#options.settings.get();
      if (!policy.networkAccess || policy.approvalPolicy === "always") throw new Error("API_INTERACTIVE_APPROVAL_REQUIRED");
      const targetIndex = current.items.findIndex((item) => item.id === params.itemId && item.role === "assistant");
      if (targetIndex < 0) throw new Error("ASSISTANT_MESSAGE_NOT_FOUND");
      const target = current.items[targetIndex];
      const userItem = current.items.slice(0, targetIndex).reverse().find((item) => item.turnId === target?.turnId && item.role === "user");
      if (!userItem) throw new Error("SOURCE_USER_MESSAGE_NOT_FOUND");
      const attachmentContext = await this.#options.attachments.buildAgentContext(params.id, userItem.attachments.map((item) => item.id), false);
      const prompt = `${userItem.content || "Ekli dosyaları incele."}${attachmentContext}`;
      const replacement = await this.#options.agent.respond(prompt, this.#options.projects.get(current.thread.projectId).rootPath, current.items.slice(0, targetIndex)).then((response) => response.content);
      return this.#options.database.replaceAssistantMessage(params.id, params.itemId, replacement);
    });
    this.#server.delete("/v1/threads/:id", async (request, reply) => {
      const params = IdParamsSchema.parse(request.params);
      this.#options.database.deleteThread(params.id);
      await this.#options.attachments.purgeThreadFiles(params.id);
      return await reply.code(204).send();
    });
    this.#server.get("/v1/approvals", async () => {
      const settings = this.#options.settings.get();
      return { state: "CONFIGURED", profile: settings.permissionProfile, approvalPolicy: settings.approvalPolicy, sandboxPolicy: settings.sandboxPolicy, networkAccess: settings.networkAccess, items: [] };
    });
    this.#server.get("/v1/git", async () => ({ state: "READY", projectScopedStatusRoute: "/v1/projects/{projectId}/git/status", mutationSupported: false }));
    this.#server.get("/v1/toolkits", async () => {
      const capabilities = await this.#options.capabilities.inspect(this.#options.probeCwd);
      return { items: capabilities.filter((item) => ["git", "node", "pnpm", "pwsh", "dotnet", "hermes", "vercel-cli"].includes(item.id)) };
    });
    this.#server.get("/v1/skills", async () => ({ state: "UNAVAILABLE", source: "no-installed-runtime-inventory", items: [], mutationSupported: false }));
    this.#server.get("/v1/plugins", async () => ({ state: "UNAVAILABLE", source: "no-installed-runtime-inventory", items: [], mutationSupported: false }));
    this.#server.get("/v1/mcp", async () => ({ state: "UNAVAILABLE", transports: [], servers: [], mutationSupported: false }));
    this.#server.get("/v1/vercel", async () => {
      const capabilities = await this.#options.capabilities.inspect(this.#options.probeCwd);
      return { cli: capabilities.find((item) => item.id === "vercel-cli") ?? null, account: capabilities.find((item) => item.id === "vercel-account") ?? null, remoteMutationPerformed: false };
    });
    this.#server.get("/v1/github", async () => ({ state: "UNVERIFIED", gitTransportReady: Boolean(this.#options.projects.list().some((project) => project.isGitRepository)), remoteMutationPerformed: false }));
    this.#server.get("/v1/diagnostics", async () => ({
      database: this.#options.database.integrityCheck(),
      listeningHost: "127.0.0.1",
      apiVersion: "v1",
      requestIdFormat: "Fastify request id",
      processInstanceId: this.#instanceId
    }));

    await this.#server.listen({ host: "127.0.0.1", port: 0 });
    const readiness = await this.#server.inject({ method: "GET", url: "/health/ready" });
    if (readiness.statusCode !== 200) {
      await this.#server.close();
      throw new Error("CORE_API_READINESS_CHECK_FAILED");
    }
    const address = this.#server.server.address() as AddressInfo;
    this.#origin = `http://127.0.0.1:${address.port}`;
    return this.#origin;
  }

  public async close(): Promise<void> {
    if (this.#origin) {
      await this.#server.close();
      this.#origin = null;
    }
  }
}
