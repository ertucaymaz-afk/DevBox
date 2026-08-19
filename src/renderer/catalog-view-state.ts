import type { CatalogItem } from "../shared/contracts";

export type CatalogVisualState = "failed" | "ready" | "installed" | "source";

export function catalogHasFailure(item: CatalogItem): boolean {
  return item.runtimeState === "FAILED" || item.sourceState === "HASH_FAILED" || item.doctorState === "FAILED";
}

export function catalogSourceVerified(item: CatalogItem): boolean {
  return item.sourceState === "HASH_VERIFIED" || item.sourceState === "BUNDLE_VERIFIED";
}

export function catalogRuntimeClass(item: CatalogItem): CatalogVisualState {
  if (catalogHasFailure(item)) return "failed";
  if (item.runtimeState === "RUNNING") return "ready";
  if (item.runtimeState === "INSTALLED") return "installed";
  return "source";
}

export function catalogRuntimeLabel(item: CatalogItem): string {
  if (item.sourceState === "HASH_FAILED") return "Bütünlük hatası";
  if (item.doctorState === "FAILED") return "Doğrulama hatası";
  if (item.runtimeState === "FAILED") return "Çalışma hatası";
  if (item.runtimeState === "RUNNING") return "Çalışıyor";
  if (item.runtimeState === "INSTALLED") return "Kurulu";
  if (item.runtimeState === "SOURCE_ONLY") return "Kaynak hazır";
  return "Kurulu değil";
}

export function catalogTrustClass(item: CatalogItem): "blocked" | "verified" | "source" {
  if (catalogHasFailure(item)) return "blocked";
  if (
    catalogSourceVerified(item)
    && (item.trustClass === "MANAGED_SIGNED_CATALOG" || item.trustClass === "LOCAL_HASH_VERIFIED")
  ) return "verified";
  return "source";
}

export function catalogCanRunTools(item: CatalogItem): boolean {
  return item.runtimeState === "RUNNING" && catalogSourceVerified(item) && !catalogHasFailure(item);
}
