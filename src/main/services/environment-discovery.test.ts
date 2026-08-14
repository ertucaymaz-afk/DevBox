import { describe, expect, it } from "vitest";
import { discoverNvidiaCredential } from "./environment-discovery.js";

describe("discoverNvidiaCredential", () => {
  it("prefers the standard variable without exposing other environment values", () => {
    expect(discoverNvidiaCredential({ NVIDIA_API_KEY: "standard", NVİDİA_API_KEY: "legacy" })).toEqual({
      value: "standard",
      variableName: "NVIDIA_API_KEY",
      source: "process-environment"
    });
  });

  it("maps the legacy Unicode alias when required", () => {
    expect(discoverNvidiaCredential({ NVİDİA_API_KEY: "legacy" })).toEqual({
      value: "legacy",
      variableName: "NVİDİA_API_KEY",
      source: "process-environment"
    });
  });
});
