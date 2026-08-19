import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../shared/contracts";
import {
  catalogCanRunTools,
  catalogRuntimeClass,
  catalogRuntimeLabel,
  catalogTrustClass
} from "./catalog-view-state";

function item(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    kind: "plugin",
    id: "plugin.test",
    name: "Test Plugin",
    productName: "Test Plugin",
    version: "1.0.0",
    publisher: "DevBox",
    license: "MIT",
    redistributionAllowed: true,
    trustClass: "LOCAL_HASH_VERIFIED",
    sourceState: "HASH_VERIFIED",
    runtimeState: "INSTALLED",
    doctorState: "PASSED",
    toolCount: 0,
    tools: [],
    requestedPermissions: [],
    grantedPermissions: [],
    health: null,
    detail: "test",
    evidence: [],
    ...overrides
  };
}

describe("catalog view truth state", () => {
  it("makes integrity failure outrank installed/running state", () => {
    const broken = item({ sourceState: "HASH_FAILED", runtimeState: "RUNNING", doctorState: "PASSED" });
    expect(catalogRuntimeClass(broken)).toBe("failed");
    expect(catalogRuntimeLabel(broken)).toBe("Bütünlük hatası");
    expect(catalogTrustClass(broken)).toBe("blocked");
    expect(catalogCanRunTools(broken)).toBe(false);
  });

  it("makes doctor failure outrank installed state", () => {
    const broken = item({ runtimeState: "INSTALLED", doctorState: "FAILED" });
    expect(catalogRuntimeClass(broken)).toBe("failed");
    expect(catalogRuntimeLabel(broken)).toBe("Doğrulama hatası");
    expect(catalogTrustClass(broken)).toBe("blocked");
  });

  it("does not mark a missing signed source as verified", () => {
    const missing = item({ trustClass: "MANAGED_SIGNED_CATALOG", sourceState: "MISSING", runtimeState: "NOT_INSTALLED", doctorState: "NOT_RUN" });
    expect(catalogTrustClass(missing)).toBe("source");
  });

  it("allows tools only for verified healthy running plugins", () => {
    expect(catalogCanRunTools(item({ runtimeState: "RUNNING", toolCount: 1, tools: [{ name: "ping", description: null, inputSchema: {} }] }))).toBe(true);
    expect(catalogCanRunTools(item({ runtimeState: "RUNNING", sourceState: "MISSING", toolCount: 1, tools: [{ name: "ping", description: null, inputSchema: {} }] }))).toBe(false);
  });
});
