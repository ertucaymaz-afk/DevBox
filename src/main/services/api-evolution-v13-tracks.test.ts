import { describe, expect, it } from "vitest";
import { createAdaptiveEvolutionTask } from "./api-evolution-service.js";

describe("API Evolution v13 adaptif track kapsamı", () => {
  it("cloud ve production odaklarını deterministik görev döngüsüne dahil eder", () => {
    const tracks = new Set<string>(Array.from({ length: 80 }, (_, index) => createAdaptiveEvolutionTask(index + 1).track));
    for (const expected of [
      "cloud-continuity",
      "deployment-safety",
      "public-api-contract",
      "command-delivery",
      "observability",
      "disaster-recovery",
      "database-performance",
      "site-performance",
      "accessibility",
      "protocol-compatibility",
      "secret-rotation",
      "dependency-provenance"
    ]) {
      expect(tracks.has(expected)).toBe(true);
    }
  });
});
