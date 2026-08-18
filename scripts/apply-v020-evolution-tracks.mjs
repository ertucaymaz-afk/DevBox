import { readFile, writeFile } from "node:fs/promises";

const contractPath = "src/shared/contracts.ts";
const servicePath = "src/main/services/api-evolution-service.ts";

function replaceOnce(source, before, after, id) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`V020_PATCH_ANCHOR_MISSING:${id}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`V020_PATCH_ANCHOR_AMBIGUOUS:${id}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let contracts = await readFile(contractPath, "utf8");
const oldEnum = 'export const EvolutionTrackSchema = z.enum(["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain"]);';
const newEnum = 'export const EvolutionTrackSchema = z.enum(["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain", "cloud-continuity", "deployment-safety", "public-api-contract", "command-delivery", "disaster-recovery", "database-performance", "site-performance", "protocol-compatibility", "secret-rotation", "dependency-provenance"]);';
contracts = replaceOnce(contracts, oldEnum, newEnum, "evolution-track-enum");
await writeFile(contractPath, contracts, "utf8");

let service = await readFile(servicePath, "utf8");
const oldTracks = 'const TRACKS: readonly EvolutionTrack[] = ["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain"];';
const newTracks = 'const TRACKS: readonly EvolutionTrack[] = ["research", "architecture", "api", "coding", "design", "quality", "security", "release", "performance", "observability", "accessibility", "integrations", "documentation", "supply-chain", "cloud-continuity", "deployment-safety", "public-api-contract", "command-delivery", "disaster-recovery", "database-performance", "site-performance", "protocol-compatibility", "secret-rotation", "dependency-provenance"];';
service = replaceOnce(service, oldTracks, newTracks, "track-score-list");

const marker = '  { track: "documentation", title: "Gerçeklik ve işletilebilirlik", objective: "kullanıcıya yanlış güven verebilecek güncelliğini yitirmiş bir ürün sözleşmesi/diagnostic açıklaması bul ve gerçek runtime davranışıyla eşleştir" }\n];';
const expanded = `  { track: "documentation", title: "Gerçeklik ve işletilebilirlik", objective: "kullanıcıya yanlış güven verebilecek güncelliğini yitirmiş bir ürün sözleşmesi/diagnostic açıklaması bul ve gerçek runtime davranışıyla eşleştir" },
  { track: "cloud-continuity", title: "Cloud continuity", objective: "desktop restart veya bağlantı kopması sonrasında snapshot cursor, command ACK ve history sürekliliğinde gerçek bir kayıp/duplicate riski bul ve idempotent düzelt" },
  { track: "deployment-safety", title: "Deployment safety", objective: "staged deploy, canonical promotion, rollback candidate veya source/deployment eşlemesinde false-PASS ihtimali bul ve fail-closed kanıt ekle" },
  { track: "public-api-contract", title: "Public API contract", objective: "public-state sanitize schema, cache/etag, stale semantiği veya backward compatibility tarafında gerçek bir sözleşme kusuru bul ve negatif testle kapat" },
  { track: "command-delivery", title: "Command delivery", objective: "cloud command sequence, retry, ACK, idempotency veya poison-command yaşam döngüsünde gerçek duplicate/reorder riski bul ve deterministik düzelt" },
  { track: "observability", title: "Production observability", objective: "runtime error, function latency, DB failure, HMAC reject veya ACK timeout kök nedenini görünmez bırakan telemetry boşluğu bul ve secret sızdırmadan kanıt ekle" },
  { track: "disaster-recovery", title: "Disaster recovery", objective: "cloud/desktop state kaybı, rollback, backup veya known-good dönüşünde gerçek recovery boşluğu bul ve fail-closed tatbikat/test ekle" },
  { track: "database-performance", title: "Database performance", objective: "snapshot/history/command sorgularında retention, index veya query pattern kaynaklı ölçülebilir darboğaz bul ve gerçek plan/read-back ile iyileştir" },
  { track: "site-performance", title: "Site performance", objective: "DevBox veya DevAPI web yüzeyinde payload, render, polling veya animasyon kaynaklı gerçek performans/erişilebilirlik sorunu bul ve ölçülebilir biçimde düzelt" },
  { track: "accessibility", title: "Site accessibility", objective: "web ve desktop yüzeylerinde keyboard/focus/reduced-motion/semantic landmark açısından gerçek erişilebilirlik kusuru bul ve regresyonla kapat" },
  { track: "protocol-compatibility", title: "Protocol compatibility", objective: "desktop ve cloud schema/version/capability sözleşmesinde ileri-geri uyumluluğu bozan gerçek drift bul ve fail-closed compatibility testi ekle" },
  { track: "secret-rotation", title: "Secret rotation", objective: "desktop/admin/cloud token yaşam döngüsü, eşit-secret yasağı veya rotation sırasında kesinti/sızıntı riski bul ve doğrulanabilir düzelt" },
  { track: "dependency-provenance", title: "Dependency provenance", objective: "açık kaynak/toolkit/binary kaynağı, lisans, lockfile veya checksum zincirinde doğrulanamayan bir güven sınırı bul ve provenance kanıtı ekle" }
];`;
service = replaceOnce(service, marker, expanded, "adaptive-focus-expansion");
await writeFile(servicePath, service, "utf8");
console.log("V020_EVOLUTION_TRACKS_PATCH_PASS tracks=24 adaptiveFocus=expanded");
