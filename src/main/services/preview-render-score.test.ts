import { describe, expect, it } from "vitest";
import { scorePreviewBitmap } from "./preview-render-score.js";

function bitmap(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [blue, green, red, alpha] = pixel(x, y);
      const offset = (y * width + x) * 4;
      output[offset] = blue;
      output[offset + 1] = green;
      output[offset + 2] = red;
      output[offset + 3] = alpha;
    }
  }
  return output;
}

describe("preview render pixel scoring", () => {
  it("detects a uniform blank white render", () => {
    const score = scorePreviewBitmap(bitmap(64, 64, () => [255, 255, 255, 255]), 64, 64);
    expect(score.sampledPixels).toBeGreaterThan(0);
    expect(score.uniqueBuckets).toBe(1);
    expect(score.lumaSpread).toBe(0);
  });

  it("detects visible contrast in a rendered interface", () => {
    const score = scorePreviewBitmap(bitmap(64, 64, (x, y) => x < 32 || y < 12 ? [18, 18, 18, 255] : [100, 245, 64, 255]), 64, 64);
    expect(score.uniqueBuckets).toBeGreaterThanOrEqual(2);
    expect(score.lumaSpread).toBeGreaterThan(40);
  });

  it("rejects malformed bitmap dimensions without inventing evidence", () => {
    expect(scorePreviewBitmap(Buffer.alloc(3), 64, 64)).toEqual({ sampledPixels: 0, uniqueBuckets: 0, lumaMin: 0, lumaMax: 0, lumaSpread: 0 });
  });
});
