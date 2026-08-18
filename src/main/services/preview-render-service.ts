import { BrowserWindow } from "electron";
import type { ProjectService } from "./project-service.js";
import { scorePreviewBitmap, type PreviewPixelScore } from "./preview-render-score.js";

const RENDER_WIDTH = 1_200;
const RENDER_HEIGHT = 800;
const SETTLE_MS = 550;
const MAX_CONSOLE_ERRORS = 20;

export type PreviewRenderReport = {
  ok: boolean;
  detail: string;
  visibleElements: number;
  textLength: number;
  visualElements: number;
  externalDependencies: number;
  consoleErrors: number;
  pixel: PreviewPixelScore;
  evidence: string[];
};

type DomMetrics = {
  visibleElements: number;
  textLength: number;
  visualElements: number;
  externalDependencies: number;
  bodyWidth: number;
  bodyHeight: number;
};

function previewUrl(projectId: string, relativePath: string): string {
  const encoded = relativePath.replace(/\\/gu, "/").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `devbox-preview://preview/${encodeURIComponent(projectId)}/${encoded}?renderGate=${Date.now()}`;
}

function domProbeScript(): string {
  return `(() => {
    const body = document.body;
    const ignored = new Set(['SCRIPT','STYLE','META','LINK','TITLE','NOSCRIPT','HEAD','BR']);
    const visible = body ? [...body.querySelectorAll('*')].filter((element) => {
      if (ignored.has(element.tagName)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const opacity = Number.parseFloat(style.opacity || '1');
      return style.display !== 'none' && style.visibility !== 'hidden' && opacity > 0.03 && rect.width > 1 && rect.height > 1 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
    }) : [];
    const visualTags = new Set(['IMG','SVG','CANVAS','VIDEO','PICTURE','IFRAME']);
    const visualElements = visible.filter((element) => visualTags.has(element.tagName) || getComputedStyle(element).backgroundImage !== 'none').length;
    const external = [...document.querySelectorAll('script[src],link[href],img[src],video[src],audio[src],source[src],iframe[src]')]
      .map((element) => element.getAttribute('src') || element.getAttribute('href') || '')
      .filter((value) => /^https?:\\/\\//i.test(value));
    const rect = body?.getBoundingClientRect();
    return {
      visibleElements: visible.length,
      textLength: (body?.innerText || '').replace(/\\s+/g, ' ').trim().length,
      visualElements,
      externalDependencies: new Set(external).size,
      bodyWidth: Math.round(rect?.width || 0),
      bodyHeight: Math.round(rect?.height || 0)
    };
  })()`;
}

export class PreviewRenderService {
  readonly #projects: ProjectService;

  public constructor(projects: ProjectService) {
    this.#projects = projects;
  }

  public async verify(projectId: string, relativePath: string): Promise<PreviewRenderReport> {
    this.#projects.get(projectId);
    const targetUrl = previewUrl(projectId, relativePath);
    const consoleErrors: string[] = [];
    const loadErrors: string[] = [];
    const window = new BrowserWindow({
      show: false,
      width: RENDER_WIDTH,
      height: RENDER_HEIGHT,
      backgroundColor: "#ffffff",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        devTools: false,
        spellcheck: false
      }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith("devbox-preview://preview/")) event.preventDefault();
    });
    window.webContents.on("console-message", (_event, level, message) => {
      if (level >= 3 && consoleErrors.length < MAX_CONSOLE_ERRORS) consoleErrors.push(message.slice(0, 500));
    });
    window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
      if (isMainFrame !== false) loadErrors.push(`${errorCode}:${errorDescription}`.slice(0, 500));
    });

    let metrics: DomMetrics = { visibleElements: 0, textLength: 0, visualElements: 0, externalDependencies: 0, bodyWidth: 0, bodyHeight: 0 };
    let pixel: PreviewPixelScore = { sampledPixels: 0, uniqueBuckets: 0, lumaMin: 0, lumaMax: 0, lumaSpread: 0 };
    try {
      await window.loadURL(targetUrl);
      await new Promise<void>((resolve) => setTimeout(resolve, SETTLE_MS));
      metrics = await window.webContents.executeJavaScript(domProbeScript(), true) as DomMetrics;
      const image = await window.webContents.capturePage();
      const size = image.getSize();
      pixel = scorePreviewBitmap(image.toBitmap(), size.width, size.height);
    } catch (error) {
      loadErrors.push(error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500));
    } finally {
      if (!window.isDestroyed()) window.destroy();
    }

    const bodyVisible = metrics.bodyWidth > 1 && metrics.bodyHeight > 1;
    const meaningfulDom = metrics.visibleElements > 0 && (metrics.textLength > 0 || metrics.visualElements > 0);
    const nonBlankPixels = pixel.sampledPixels > 0 && (pixel.uniqueBuckets >= 3 || pixel.lumaSpread >= 10);
    const noRemoteRuntime = metrics.externalDependencies === 0;
    const noErrors = loadErrors.length === 0 && consoleErrors.length === 0;
    const ok = bodyVisible && meaningfulDom && nonBlankPixels && noRemoteRuntime && noErrors;
    const failures = [
      !bodyVisible ? "body görünür ölçü üretmedi" : null,
      !meaningfulDom ? "görünür anlamlı DOM bulunamadı" : null,
      !nonBlankPixels ? "yakalanan frame tekdüze/boş" : null,
      !noRemoteRuntime ? `${metrics.externalDependencies} uzak runtime bağımlılığı bulundu` : null,
      loadErrors.length ? `yükleme hatası: ${loadErrors[0]}` : null,
      consoleErrors.length ? `console/CSP hatası: ${consoleErrors[0]}` : null
    ].filter((value): value is string => Boolean(value));
    const detail = ok ? "Gerçek offscreen Electron render, görünür DOM ve piksel kapısı geçti." : failures.join(" · ").slice(0, 1_000);
    const evidence = [
      `preview-render:${ok ? "PASS" : "FAIL"}`,
      `preview-visible-elements:${metrics.visibleElements}`,
      `preview-text-length:${metrics.textLength}`,
      `preview-visual-elements:${metrics.visualElements}`,
      `preview-external-dependencies:${metrics.externalDependencies}`,
      `preview-console-errors:${consoleErrors.length}`,
      `preview-pixel-samples:${pixel.sampledPixels}`,
      `preview-pixel-buckets:${pixel.uniqueBuckets}`,
      `preview-luma-spread:${pixel.lumaSpread}`
    ];
    return { ok, detail, visibleElements: metrics.visibleElements, textLength: metrics.textLength, visualElements: metrics.visualElements, externalDependencies: metrics.externalDependencies, consoleErrors: consoleErrors.length, pixel, evidence };
  }
}
