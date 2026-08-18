export type PreviewPixelScore = {
  sampledPixels: number;
  uniqueBuckets: number;
  lumaMin: number;
  lumaMax: number;
  lumaSpread: number;
};

export function scorePreviewBitmap(bitmap: Buffer, width: number, height: number): PreviewPixelScore {
  if (width <= 0 || height <= 0 || bitmap.length < width * height * 4) {
    return { sampledPixels: 0, uniqueBuckets: 0, lumaMin: 0, lumaMax: 0, lumaSpread: 0 };
  }
  const total = width * height;
  const stridePixels = Math.max(1, Math.floor(Math.sqrt(total / 50_000)));
  const buckets = new Set<number>();
  let sampledPixels = 0;
  let lumaMin = 255;
  let lumaMax = 0;
  for (let y = 0; y < height; y += stridePixels) {
    for (let x = 0; x < width; x += stridePixels) {
      const offset = (y * width + x) * 4;
      const blue = bitmap[offset] ?? 0;
      const green = bitmap[offset + 1] ?? 0;
      const red = bitmap[offset + 2] ?? 0;
      const alpha = bitmap[offset + 3] ?? 255;
      const effectiveRed = Math.round((red * alpha + 255 * (255 - alpha)) / 255);
      const effectiveGreen = Math.round((green * alpha + 255 * (255 - alpha)) / 255);
      const effectiveBlue = Math.round((blue * alpha + 255 * (255 - alpha)) / 255);
      const luma = Math.round((effectiveRed + effectiveGreen + effectiveBlue) / 3);
      lumaMin = Math.min(lumaMin, luma);
      lumaMax = Math.max(lumaMax, luma);
      buckets.add(((effectiveRed >> 4) << 8) | ((effectiveGreen >> 4) << 4) | (effectiveBlue >> 4));
      sampledPixels += 1;
    }
  }
  return {
    sampledPixels,
    uniqueBuckets: buckets.size,
    lumaMin: sampledPixels ? lumaMin : 0,
    lumaMax: sampledPixels ? lumaMax : 0,
    lumaSpread: sampledPixels ? lumaMax - lumaMin : 0
  };
}
