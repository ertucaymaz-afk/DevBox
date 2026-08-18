import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectService } from "./project-service.js";
import { createPreviewProtocolHandler } from "./preview-protocol-service.js";

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(tmpdir(), "devbox-preview-test-"));
  roots.push(value);
  return value;
}

function projects(rootPath: string): ProjectService {
  return { get: () => ({ id: "project-12345678", rootPath }) } as unknown as ProjectService;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("devbox preview protocol", () => {
  it("serves an HTML file only from the selected project root and injects the console bridge", async () => {
    const rootPath = await root();
    await mkdir(path.join(rootPath, "site"), { recursive: true });
    await writeFile(path.join(rootPath, "site", "index.html"), "<!doctype html><html><head><title>Test</title></head><body><script>console.log('ok')</script></body></html>", "utf8");
    const handler = createPreviewProtocolHandler(projects(rootPath));

    const response = await handler(new Request("devbox-preview://preview/project-12345678/site/index.html"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'none'");
    expect(html).toContain("data-devbox-preview-bridge");
    expect(html).toContain("devbox-preview");
    expect(html).toContain("<title>Test</title>");
  });

  it("rejects path traversal outside the project root", async () => {
    const rootPath = await root();
    const handler = createPreviewProtocolHandler(projects(rootPath));

    const response = await handler(new Request("devbox-preview://preview/project-12345678/..%2F..%2Fsecret.txt"));

    expect(response.status).toBe(404);
  });

  it("does not instrument non-HTML assets as executable markup", async () => {
    const rootPath = await root();
    await writeFile(path.join(rootPath, "app.css"), "body { color: red; }", "utf8");
    const handler = createPreviewProtocolHandler(projects(rootPath));

    const response = await handler(new Request("devbox-preview://preview/project-12345678/app.css"));
    const css = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
    expect(css).toBe("body { color: red; }");
    expect(css).not.toContain("devbox-preview-bridge");
  });
});
