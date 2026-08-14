import { describe, expect, it } from "vitest";
import { isTrustedExternalUrl } from "./external-url";

describe("isTrustedExternalUrl", () => {
  it("DevBox deposunun ve geliştirici profilinin güvenli HTTPS bağlantılarını kabul eder", () => {
    expect(isTrustedExternalUrl("https://github.com/ertucaymaz-afk/DevBox")).toBe(true);
    expect(isTrustedExternalUrl("https://github.com/ertucaymaz-afk/DevBox/releases/latest")).toBe(true);
    expect(isTrustedExternalUrl("https://www.instagram.com/yaaertu/")).toBe(true);
  });

  it("benzer görünen fakat izin verilmeyen hedefleri reddeder", () => {
    expect(isTrustedExternalUrl("http://github.com/ertucaymaz-afk/DevBox")).toBe(false);
    expect(isTrustedExternalUrl("https://github.com/ertucaymaz-afk/DevBox-evil")).toBe(false);
    expect(isTrustedExternalUrl("https://github.com.evil.example/ertucaymaz-afk/DevBox")).toBe(false);
    expect(isTrustedExternalUrl("https://github.com/other/repository")).toBe(false);
    expect(isTrustedExternalUrl("javascript:alert(1)")).toBe(false);
  });
});
