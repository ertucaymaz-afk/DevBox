import { describe, expect, it } from "vitest";
import { ContentLengthFramer } from "./protocol-service.js";

describe("Content-Length protocol framing", () => {
  it("parses fragmented and adjacent LSP/DAP frames", () => {
    const first = ContentLengthFramer.encode({ jsonrpc: "2.0", method: "initialized", params: {} });
    const second = ContentLengthFramer.encode({ seq: 2, type: "event", event: "stopped" });
    const combined = Buffer.concat([first, second]);
    const framer = new ContentLengthFramer();
    expect(framer.push(combined.subarray(0, 11))).toEqual([]);
    expect(framer.push(combined.subarray(11))).toEqual([
      { jsonrpc: "2.0", method: "initialized", params: {} },
      { seq: 2, type: "event", event: "stopped" }
    ]);
  });

  it("rejects missing or excessive content length", () => {
    expect(() => new ContentLengthFramer().push(Buffer.from("X: 1\r\n\r\n{}"))).toThrow("PROTOCOL_CONTENT_LENGTH_MISSING");
    expect(() => new ContentLengthFramer().push(Buffer.from("Content-Length: 9000000\r\n\r\n"))).toThrow("PROTOCOL_CONTENT_LENGTH_INVALID");
  });
});
