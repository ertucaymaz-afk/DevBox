import { readFile, writeFile } from "node:fs/promises";

async function patch(file, before, after, label) {
  let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
  if (!source.includes(before)) {
    if (source.includes(after)) return;
    throw new Error(`V020_PATCH_ANCHOR_MISSING:${label}`);
  }
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`V020_PATCH_ANCHOR_NOT_UNIQUE:${label}:${count}`);
  source = source.replace(before, after);
  await writeFile(file, source, "utf8");
}

async function replaceAllExact(file, pairs) {
  let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
  for (const [before, after, label] of pairs) {
    if (!source.includes(before)) {
      if (source.includes(after)) continue;
      throw new Error(`V020_PATCH_ANCHOR_MISSING:${label}`);
    }
    source = source.split(before).join(after);
  }
  await writeFile(file, source, "utf8");
}

await patch("package.json", '"version": "0.1.19"', '"version": "0.1.20"', "package-version");
await patch("package.json",
  '"verify": "pnpm spec:verify && pnpm evolution:verify && pnpm cloud:verify && pnpm typecheck && pnpm test && pnpm build",',
  '"verify": "pnpm spec:verify && pnpm evolution:verify && pnpm cloud:verify && pnpm production:verify && pnpm typecheck && pnpm test && pnpm build",',
  "main-verify-production");
await patch("package.json",
  '"evolution:verify": "node scripts/verify-api-evolution-v12.mjs"',
  '"evolution:verify": "node scripts/verify-api-evolution-v13.mjs",\n    "production:verify": "node scripts/verify-production-promotion-v020.mjs"',
  "evolution-v13");

await replaceAllExact("cloud/devapi-control/package.json", [["0.1.19","0.1.20","devapi-package-version"]]);
await replaceAllExact("cloud/devbox-site/package.json", [["0.1.19","0.1.20","devbox-site-package-version"]]);
await replaceAllExact("cloud/devapi-control/api/v1/health.mjs", [["0.1.19","0.1.20","devapi-health-version"]]);
await replaceAllExact("cloud/devapi-control/index.html", [["v0.1.19","v0.1.20","devapi-index-version"]]);
await replaceAllExact("cloud/devbox-site/index.html", [["v0.1.19","v0.1.20","devbox-index-version"]]);

await replaceAllExact("cloud/devapi-control/lib/db.mjs", [
  ["devbox_projects", "devbox_project_state", "db-current-state-table"],
  ["devbox_snapshot_history", "devbox_project_state_history", "db-history-table"],
  ["devbox_commands", "devbox_control_commands", "db-command-table"]
]);

await patch("scripts/verify-api-evolution-v12.mjs",
  'need(readme, "DevBox v0.1.19", "readme-current-version");',
  'need(readme, "DevBox v0.1.", "readme-current-version-family");',
  "v12-readme-forward");
await patch("scripts/verify-api-evolution-v12.mjs",
  'need(devapiIndex, "v0.1.19", "devapi-site-version");',
  'need(devapiIndex, "v0.1.", "devapi-site-version-family");',
  "v12-devapi-forward");

await patch("scripts/verify-cloud-ecosystem.mjs",
  'if (devapiPackage.version !== "0.1.19") throw new Error("CLOUD_VERIFY_FAIL:devapi-version");',
  'const versionParts = String(devapiPackage.version ?? "").split(".").map(Number);\nif (versionParts.length !== 3 || versionParts.some((value) => !Number.isInteger(value) || value < 0) || versionParts[0] !== 0 || versionParts[1] !== 1 || versionParts[2] < 19) throw new Error("CLOUD_VERIFY_FAIL:devapi-version-minimum");',
  "cloud-version-forward");
await patch("scripts/verify-cloud-ecosystem.mjs",
  'requireText("devapiHealth", \'version: "0.1.19"\', "health-version");',
  'requireText("devapiHealth", \'version: "0.1.\', "health-version-family");',
  "cloud-health-forward");
await patch("scripts/verify-cloud-ecosystem.mjs",
  'console.log("DEVBOX_CLOUD_ECOSYSTEM_VERIFY_PASS version=0.1.19 publicState=sanitized sites=2 syntax=pass securityHeaders=pass");',
  'requireText("devapiApp", "https://devbox.vercel.app/", "devapi-cross-link");\nrequireText("devboxApp", "https://devapi-virid.vercel.app", "devbox-cross-link");\nconsole.log(`DEVBOX_CLOUD_ECOSYSTEM_VERIFY_PASS version=${devapiPackage.version} publicState=sanitized sites=2 syntax=pass securityHeaders=pass crossLinks=pass`);',
  "cloud-cross-links");

const oldTrack = 'export const EvolutionTrackSchema = z.enum(["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain"]);';
const newTrack = 'export const EvolutionTrackSchema = z.enum(["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain", "cloud-continuity", "deployment-safety", "public-api-contract", "command-delivery", "disaster-recovery", "database-performance", "site-performance", "protocol-compatibility", "secret-rotation", "dependency-provenance"]);';
await patch("src/shared/contracts.ts", oldTrack, newTrack, "evolution-tracks");

const oldTracks = 'const TRACKS: readonly EvolutionTrack[] = ["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain"];';
const newTracks = 'const TRACKS: readonly EvolutionTrack[] = ["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain", "cloud-continuity", "deployment-safety", "public-api-contract", "command-delivery", "disaster-recovery", "database-performance", "site-performance", "protocol-compatibility", "secret-rotation", "dependency-provenance"];';
await patch("src/main/services/api-evolution-service.ts", oldTracks, newTracks, "track-list");

const focusAnchor = '  { track: "documentation", title: "Gerçeklik ve işletilebilirlik", objective: "kullanıcıya yanlış güven verebilecek güncelliğini yitirmiş bir ürün sözleşmesi/diagnostic açıklaması bul ve gerçek runtime davranışıyla eşleştir" }\n];';
const focusReplacement = `  { track: "documentation", title: "Gerçeklik ve işletilebilirlik", objective: "kullanıcıya yanlış güven verebilecek güncelliğini yitirmiş bir ürün sözleşmesi/diagnostic açıklaması bul ve gerçek runtime davranışıyla eşleştir" },
  { track: "cloud-continuity", title: "Cloud continuity", objective: "desktop restart, snapshot freshness, cloud cursor veya ACK devamlılığında gerçek bir kayıp senaryosu bul ve idempotent onarım ekle" },
  { track: "deployment-safety", title: "Deployment safety", objective: "preview/staged/promote/rollback zincirinde yanlış production terfisi veya rollback kanıtı eksikliği bul ve fail-closed kapat" },
  { track: "public-api-contract", title: "Public API contract", objective: "sanitize public-state, cache/etag, stale semantiği veya backwards compatibility tarafında gerçek sözleşme kusuru bul ve negatif testle kapat" },
  { track: "command-delivery", title: "Command delivery", objective: "sequence, ACK, retry veya idempotency akışında duplicate/skip/out-of-order riski bul ve deterministik testle kapat" },
  { track: "disaster-recovery", title: "Disaster recovery", objective: "cloud/database/desktop kaybı veya rollback senaryosunda recovery kanıtını güçlendir ve veri kaybını fail-closed sınırla" },
  { track: "database-performance", title: "Database performance", objective: "snapshot/history/command sorgularında ölçülebilir indeks, retention veya sorgu maliyeti darboğazı bul ve kanıtla" },
  { track: "site-performance", title: "Site performance", objective: "DevBox/DevAPI web yüzeylerinde payload, layout, animation veya polling maliyetini ölç ve davranışı bozmadan azalt" },
  { track: "protocol-compatibility", title: "Protocol compatibility", objective: "desktop-cloud schema/version geçişinde eski/yeni istemci uyumsuzluğu bul ve forward-compatible sözleşme ekle" },
  { track: "secret-rotation", title: "Secret rotation", objective: "desktop/admin token rotasyonu, ayrık yetki veya secret redaction akışında gerçek risk bul ve doğrulanabilir rotasyon yolu ekle" },
  { track: "dependency-provenance", title: "Dependency provenance", objective: "izinli açık kaynak bağımlılıkların sürüm, lisans, kilit veya binary provenance kanıtında eksik bul ve release gate'e bağla" }
];`;
await patch("src/main/services/api-evolution-service.ts", focusAnchor, focusReplacement, "adaptive-focus");

await patch("README.md", "# DevBox v0.1.19", "# DevBox v0.1.20", "readme-version");
await patch("README.md",
  '> Ürün sözleşmesi: **Simülasyon, sahte entegrasyon sonucu, uydurma PASS/READY, demo telemetrisi ve çalışmayan buton başarı kabul edilmez.** Bir yol kanıt üretemiyorsa açık hata/finding durumuna geçer.',
  `> Ürün sözleşmesi: **Simülasyon, sahte entegrasyon sonucu, uydurma PASS/READY, demo telemetrisi ve çalışmayan buton başarı kabul edilmez.** Bir yol kanıt üretemiyorsa açık hata/finding durumuna geçer.

## Görseller

### DevBox ürün sitesi
![DevBox v0.1.20 ürün sitesi](docs/media/devbox-control-plane-v020.svg)

### DevAPI Cloud Control
![DevAPI v0.1.20 Cloud Control](docs/media/devapi-evolution-v020.svg)

> Production notu: görseller gerçek v0.1.20 ürün mimarisini ve kontrol düzlemi sözleşmesini gösterir; canlı metrik içermez. Canonical Vercel promotion ancak production gate PASS olduğunda README'de READY olarak işaretlenir.`,
  "readme-visuals");
await patch("README.md", "evolution:verify (v12, önceki verifier'ları miras alır)", "evolution:verify (v13, önceki verifier'ları miras alır)", "readme-v13");

console.log("V020_SOURCE_PATCH_PASS");
