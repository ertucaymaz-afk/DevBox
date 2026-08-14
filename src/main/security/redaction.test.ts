import { describe, expect, it } from "vitest";
import { redactText, redactUnknown } from "./redaction.js";

describe("secret redaction", () => {
  it("redacts bearer and common provider tokens from process output", () => {
    const output = redactText("Authorization: Bearer abc.def-123 and nvapi_exampleSecret987");
    expect(output).toBe("Authorization: Bearer [REDACTED] and [REDACTED_TOKEN]");
  });

  it("redacts secret-shaped object properties recursively", () => {
    expect(redactUnknown({ nested: { apiKey: "value", ordinary: "safe" }, password: "hidden" })).toEqual({
      nested: { apiKey: "[REDACTED]", ordinary: "safe" },
      password: "[REDACTED]"
    });
  });
});
