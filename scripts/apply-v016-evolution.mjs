import { readFile, writeFile } from "node:fs/promises";
async function load(file){return (await readFile(file,"utf8")).replace(/\r\n/gu,"\n");}
async function save(file,text){await writeFile(file,text,"utf8");}
function once(source,before,after,label){if(source.includes(after)) return source; const at=source.indexOf(before); if(at<0||source.indexOf(before,at+1)>=0) throw new Error(`V016_EVOLUTION_ANCHOR_INVALID:${label}`); return source.slice(0,at)+after+source.slice(at+before.length);}
function block(source,start,end,replacement,label){if(source.includes(replacement)) return source; const a=source.indexOf(start); const b=source.indexOf(end,a+start.length); if(a<0||b<0) throw new Error(`V016_EVOLUTION_BLOCK_INVALID:${label}`); return source.slice(0,a)+replacement+source.slice(b);}

{
  const file="src/main/services/api-evolution-service.ts"; let source=await load(file);
  const focus=`const ADAPTIVE_FOCUS: ReadonlyArray<{ track: EvolutionTrack; title: string; objective: string }> = [
  { track: "quality", title: "Regresyon avı", objective: "mevcut testler ve hata yollarında henüz kapsanmayan somut bir regresyon riski bul ve kalıcı düzelt" },
  { track: "performance", title: "Kaynak ve gecikme bütçesi", objective: "RAM/CPU/disk polling/provider latency açısından ölçülebilir bir darboğaz bul, davranışı koruyarak azalt ve regresyon kapısı ekle" },
  { track: "design", title: "Akış ve etkileşim", objective: "ChatGPT/Gemini/Claude sınıfı akıcı masaüstü UX açısından gerçek bir etkileşim sürtünmesi bul ve erişilebilir biçimde düzelt" },
  { track: "security", title: "Fail-closed güvenlik", objective: "izin, path sınırı, secret, supply-chain veya provider doğrulamasında somut bir bypass/fail-open ihtimali bul ve negatif testle kapat" },
  { track: "architecture", title: "Eşzamanlılık ve dayanıklılık", objective: "queue, crash/restart, durable job, worktree veya state geçişlerinde yarış/iyileşme kusuru bul ve deterministik olarak düzelt" },
  { track: "api", title: "API sözleşmesi", objective: "Core API hata semantiği, idempotency, doğrulama veya kaynak modelinde gerçek bir eksik bul ve uyumluluk testiyle düzelt" },
  { track: "observability", title: "Gözlemlenebilirlik", objective: "başarısız veya yavaş bir akışın kök nedenini gizleyen telemetry/evidence boşluğu bul; gizli değer sızdırmadan ölçülebilir kanıt ekle" },
  { track: "quality", title: "Hata yaşam döngüsü", objective: "OPEN/RESOLVED/REJECTED finding yaşam döngüsünde false-PASS, stale finding veya sahiplik kusuru bul ve regresyonla kapat" },
  { track: "performance", title: "Hafıza ve bağlam bütçesi", objective: "kalıcı hafıza, FTS, konuşma bağlamı veya cache katmanında hız/isabet/RAM dengesini bozan somut bir darboğaz bul ve ölçülebilir biçimde düzelt" },
  { track: "architecture", title: "FIFO ve IPC yarışları", objective: "aynı thread sıralaması, cross-thread paralellik, IPC lifecycle veya re-entrancy tarafında gerçek bir yarış/leak bul ve deterministik testle kapat" },
  { track: "release", title: "Release ve rollback", objective: "build, installer, update, repair, rollback veya release gate zincirinde yanlış PASS/yanlış SKIP ihtimali bul ve fail-closed kanıt ekle" },
  { track: "integrations", title: "Cloud continuity", objective: "masaüstü kapanması/restart sonrasında DevAPI cloud snapshot, komut ACK veya cursor sürekliliğinde gerçek bir eksik bul ve idempotent şekilde düzelt" },
  { track: "integrations", title: "Companion ve eklenti yaşam döngüsü", objective: "yerel companion/MCP/toolkit discovery, capability handshake, disconnect/reconnect veya izin sınırında somut entegrasyon kusuru bul ve düzelt" },
  { track: "accessibility", title: "Erişilebilirlik", objective: "klavye, focus, reduced-motion, aria veya okunabilirlikte gerçek bir sorun bul ve doğrulanabilir biçimde düzelt" },
  { track: "design", title: "Tema eşdeğerliği", objective: "koyu ve gündüz modları arasında kontrast, yüzey, focus, editor, terminal veya DevAPI anlamını bozan gerçek bir tutarsızlık bul ve iki temada doğrula" },
  { track: "integrations", title: "Araç entegrasyonu", objective: "mevcut açık kaynak/izinli araç zincirinde doğrulanabilir bir entegrasyon veya health-check eksikliği bul ve sahte READY üretmeden tamamla" },
  { track: "supply-chain", title: "Bağımlılık güveni", objective: "kilit dosyası, kaynak kimliği, binary/tool doğrulaması veya güncelleme zincirinde somut bir güven açığı bul ve fail-closed kapat" },
  { track: "documentation", title: "Gerçeklik ve işletilebilirlik", objective: "kullanıcıya yanlış güven verebilecek güncelliğini yitirmiş bir ürün sözleşmesi/diagnostic açıklaması bul ve gerçek runtime davranışıyla eşleştir" }
];

`;
  source=block(source,'const ADAPTIVE_FOCUS: ReadonlyArray<{ track: EvolutionTrack; title: string; objective: string }> = [','export function shouldContinueEvolution',focus+'export function shouldContinueEvolution',"adaptive-focus");
  source=once(source,
`      const before = this.get(project.id);
      const recovered = this.#spec.recoverRunning(project.id);
      if (recovered > 0) {
        const now = new Date().toISOString();
        const detail = \`${'${recovered}'} yarım kalmış atomik görev RECOVERY_REQUIRED durumuna alındı. Kör tekrar yapılmadı; Şimdi çalıştır ile açık recovery yeniden denemesi gerekir.\`;`,
`      const before = this.get(project.id);
      const recovered = this.#spec.recoverRunning(project.id);
      const adaptive = this.#adaptiveState(project.id);
      const interruptedAdaptive = adaptive.current?.state === "RUNNING" ? adaptive.current : null;
      if (interruptedAdaptive) {
        this.#saveAdaptive(project.id, { ...adaptive, current: { ...interruptedAdaptive, state: "RECOVERY_REQUIRED", lastError: "Uygulama önceki adaptif görev çalışırken kapandı; stale RUNNING durumu güvenli recovery gerektiriyor.", retryAfterAt: null, updatedAt: new Date().toISOString() } });
      }
      if (recovered > 0 || interruptedAdaptive) {
        const now = new Date().toISOString();
        const detail = interruptedAdaptive
          ? \`${'${interruptedAdaptive.task.taskId}'} yarım kalmış adaptif görev RECOVERY_REQUIRED durumuna alındı; stale RUNNING_COMMAND/PLANNING durumu korunmadı. Şimdi çalıştır açık recovery yeniden denemesidir.\`
          : \`${'${recovered}'} yarım kalmış atomik görev RECOVERY_REQUIRED durumuna alındı. Kör tekrar yapılmadı; Şimdi çalıştır ile açık recovery yeniden denemesi gerekir.\`;`,"startup-recovery");
  await save(file,source);
}

{
  const file="src/main/services/api-evolution-service.test.ts"; let source=await load(file);
  source=once(source,
'    const eleventh = createAdaptiveEvolutionTask(11);\n    expect(first.taskId).toBe("ADAPT-000001");\n    expect(second.track).not.toBe(first.track);\n    expect(eleventh.track).toBe(first.track);',
'    const nineteenth = createAdaptiveEvolutionTask(19);\n    expect(first.taskId).toBe("ADAPT-000001");\n    expect(second.track).not.toBe(first.track);\n    expect(nineteenth.track).toBe(first.track);',"focus-rotation-test");
  source=once(source,
'  it("rotates real maintenance domains after the fixed core graph", () => {',
'  it("recovers an interrupted adaptive RUNNING mission instead of leaving stale runtime state", async () => {\n    const directory = await mkdtemp(path.join(os.tmpdir(), "devbox-evolution-adaptive-recovery-"));\n    temporaryDirectories.push(directory);\n    const database = new StateDatabase(path.join(directory, "state.sqlite"));\n    openDatabases.push(database);\n    const projectId = "project-adaptive-recovery";\n    const now = new Date().toISOString();\n    database.upsertProject({ id: projectId, name: "adaptive-recovery", rootPath: directory, isGitRepository: false, createdAt: now, updatedAt: now });\n    const task = createAdaptiveEvolutionTask(1);\n    database.setSetting(`api-evolution:adaptive:${projectId}`, { schemaVersion: 1, sequence: 1, completed: 0, failed: 0, current: { task, state: "RUNNING", attempts: 1, retryAfterAt: null, lastError: null, updatedAt: now }, recent: [] });\n    const service = createService(database);\n    service.start();\n    try {\n      const recovered = database.getSetting<{ current?: { state?: string; lastError?: string | null } }>(`api-evolution:adaptive:${projectId}`);\n      expect(recovered?.current?.state).toBe("RECOVERY_REQUIRED");\n      expect(recovered?.current?.lastError).toMatch(/stale RUNNING|recovery/iu);\n      expect(service.get(projectId).runtime.stage).toBe("RECOVERY_REQUIRED");\n    } finally { service.stop(); }\n  });\n\n  it("rotates real maintenance domains after the fixed core graph", () => {',"adaptive-recovery-test");
  await save(file,source);
}

console.log("DEVBOX_V016_EVOLUTION_APPLIED");
