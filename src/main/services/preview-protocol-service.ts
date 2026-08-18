import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { resolveExistingPathWithinRoot } from "../security/path-boundary.js";
import type { ProjectService } from "./project-service.js";

const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const PREVIEW_BRIDGE = `<script data-devbox-preview-bridge>(function(){
  const send=(level,args)=>{try{parent.postMessage({source:'devbox-preview',type:'console',level,message:args.map((value)=>{try{return typeof value==='string'?value:JSON.stringify(value)}catch{return String(value)}}).join(' ').slice(0,12000),createdAt:new Date().toISOString()},'*')}catch{}};
  for(const level of ['log','info','warn','error']){const original=console[level]?.bind(console);console[level]=(...args)=>{send(level,args);original?.(...args)}}
  addEventListener('error',(event)=>send('error',[event.message,event.filename,event.lineno+':'+event.colno]));
  addEventListener('unhandledrejection',(event)=>send('error',['Unhandled promise rejection',String(event.reason)]));
  addEventListener('DOMContentLoaded',()=>{try{parent.postMessage({source:'devbox-preview',type:'ready',title:document.title,createdAt:new Date().toISOString()},'*')}catch{}});
})();</script>`;

function instrumentHtml(html: string): string {
  if (html.includes("data-devbox-preview-bridge")) return html;
  const head = html.search(/<head(?:\s[^>]*)?>/iu);
  if (head >= 0) {
    const close = html.indexOf(">", head);
    if (close >= 0) return `${html.slice(0, close + 1)}${PREVIEW_BRIDGE}${html.slice(close + 1)}`;
  }
  return `${PREVIEW_BRIDGE}${html}`;
}

function responseHeaders(contentType: string): Record<string, string> {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' data: blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'"
  };
}

export function createPreviewProtocolHandler(projects: ProjectService): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "preview") return new Response("Not found", { status: 404 });
      const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
      const projectId = segments.shift();
      if (!projectId) return new Response("Project missing", { status: 400 });
      const relativePath = segments.join("/") || "index.html";
      const project = projects.get(projectId);
      const target = await resolveExistingPathWithinRoot(project.rootPath, relativePath);
      const info = await stat(target);
      if (!info.isFile()) return new Response("Not a file", { status: 404 });
      if (info.size > MAX_PREVIEW_BYTES) return new Response("Preview file too large", { status: 413 });
      const bytes = await readFile(target);
      const extension = path.extname(relativePath).toLocaleLowerCase("en-US");
      const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
      if (extension === ".html" || extension === ".htm") {
        return new Response(instrumentHtml(bytes.toString("utf8")), { status: 200, headers: responseHeaders(contentType) });
      }
      return new Response(bytes, { status: 200, headers: responseHeaders(contentType) });
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      if (/PROJECT_NOT_FOUND|PATH_|ENOENT/iu.test(code)) return new Response("Not found", { status: 404 });
      return new Response("Preview unavailable", { status: 500 });
    }
  };
}
