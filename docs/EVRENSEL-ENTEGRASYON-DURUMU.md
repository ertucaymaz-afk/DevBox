# DevBox evrensel entegrasyon uygulama durumu

Bu belge, `DevBox-Evrensel-Eklenti-ve-Uygulama-Entegrasyon-Mimarisi.md` içindeki 59 ana bölümün DevBox kaynak ağacındaki gerçek karşılığını kaydeder. Bir sözleşmenin veya ekranın bulunması, özelliğin çalıştığı anlamına gelmez. Bu nedenle yalnız aşağıdaki dört durum kullanılır:

- **UYGULANDI:** Üretim kodu vardır ve otomatik ya da gerçek çalışma zamanı kanıtı alınmıştır.
- **KISMİ:** Güvenli bir alt küme uygulanmıştır; kalan sınır açıkça yazılmıştır.
- **DIŞ ALTYAPI GEREKİYOR:** Kimlik, sunucu, sertifika, ikinci makine veya bağımsız güven kökü olmadan yerelde tamamlanamaz.
- **ÇALIŞTIRILMADI:** Kod veya test düzeneği olabilir ancak istenen gerçek ortam kanıtı bu sürümde alınmamıştır.

## Uygulanan çekirdek

| MD kapsamı | Durum | DevBox karşılığı ve kanıt |
|---|---|---|
| Manifest v2, sürüm ve uyumluluk | **UYGULANDI** | Katı Zod sözleşmesi, bilinmeyen alan reddi, güvenli göreli giriş yolları, semver ve DevBox uyumluluğu: `src/shared/plugin-contracts.ts`; sözleşme testleri: `src/shared/plugin-contracts.test.ts`. |
| İzin modeli ve yasak genel yetkiler | **UYGULANDI** | İzinler sonlu enumdur; istenmeyen izin verilemez; sürüm değişince eski izinler taşınmaz: `src/main/services/plugin-registry-service.ts`. |
| Kurulum / izin / çalışma durumu ayrımı | **UYGULANDI** | Registry kayıtları kurulum, istenen/verilen izin ve runtime durumunu ayrı tutar; geçersiz durum geçişleri reddedilir. |
| İmzalı paket doğrulama | **UYGULANDI** | Ed25519 imza, manifest, dosya SHA-256, boyut ve yol sınırı doğrulaması: `src/main/services/signed-manifest-service.ts`. |
| Yayıncı güven sınıfları | **UYGULANDI** | `LOCAL_SIDELOAD` ile `MANAGED_SIGNED_CATALOG` birbirinden ayrıdır; yerel anahtar kaydı genel mağaza güveni gibi gösterilmez: `src/main/services/package-lifecycle-service.ts`. |
| Atomik kurulum, onarım ve geri alma | **UYGULANDI** | Sürüm deposu, aktif işaretçi, imza/hash yeniden doğrulaması, onarım ve önceki doğrulanmış sürüme rollback bulunur. |
| İptal listesi | **UYGULANDI** | Sıralı, süreli ve Ed25519 imzalı iptal listesi; paket, sürüm ve yayıncı anahtarı düzeyinde engelleme: `src/main/services/revocation-list-service.ts`. |
| Denetlenebilir audit | **UYGULANDI** | Önceki hash’e bağlı JSONL olay zinciri ve bütünlük doğrulaması: `src/main/services/audit-log-service.ts`. |
| İzole arka plan çalışanı | **KISMİ** | Her MCP sunucusu ayrı alt süreçte; stdio JSON-RPC boyut/zaman aşımı sınırları, daraltılmış ortam ve açık kullanıcı onayı vardır: `src/main/services/mcp-host-service.ts`. Bu, Windows AppContainer veya düşük bütünlük belirteci değildir. |
| MCP komut/olay hattı | **UYGULANDI** | Gerçek `initialize`, `tools/list` ve `tools/call`; sahte araç sonucu yoktur. Yerel katalog testi gerçek alt süreç ve gerçek çağrı kullanır. |
| Beceriler ve taşınabilir eklentiler | **UYGULANDI** | Kaynak klasörü seçme, manifest/checksum envanteri, kurulabilir eklenti ayırımı, bağlanma, araç listeleme ve çağırma ekranı: `src/main/services/local-catalog-service.ts` ve `src/renderer/AdvancedViews.tsx`. |
| DAP hata ayıklama | **UYGULANDI** | SHA-256 ile sabitlenmiş Microsoft `vscode-js-debug` 1.117.0; launch/attach, threads, stack, scopes, variables, stepping ve breakpoint. Gerçek Node süreci kullanan test: `src/main/services/language-debug-service.test.ts`. |
| LSP tanılama | **KISMİ** | Gerçek `typescript-language-server` ile TypeScript/JavaScript diagnostics ve editör tanılama tepsisi vardır. Python, Rust, C#, Go ve başka diller için otomatik sunucu yönetimi henüz yoktur. |
| Uzak worker | **UYGULANDI (tek makine E2E)** | Tek kullanımlık eşleştirme, token ACL, lease/heartbeat, iptal, süreç ağacı sonlandırma, süre/çıktı sınırı ve kalıcı iş geçmişi: `scripts/remote-worker.mjs`, `src/main/services/remote-worker-service.ts`. Gerçek süreçli E2E aynı makinede çalışır. |
| Preload ve IPC doğrulaması | **UYGULANDI** | Renderer doğrudan Node/Electron almaz; şemalı ve isimlendirilmiş bridge metotları kullanır. Electron izin istekleri varsayılan reddedilir. |
| Yerel katalog kullanıcı yüzeyi | **UYGULANDI** | Kaynak doğrulaması, gerçek durum, izin/araç bilgisi, bağlan/ayır ve gerçek araç çağrısı görünürdür. |
| DAP kullanıcı yüzeyi | **UYGULANDI** | İş parçacığı → stack → scope → variable gezintisi, launch/attach, stepping, breakpoint ve ham DAP kanıtı açılır ayrıntıda gösterilir. |

## Kısmi veya yerel ürün sınırının dışında kalan kapsam

| MD kapsamı | Durum | Eksik gerçek kanıt / gereken altyapı |
|---|---|---|
| Sandboxed `WebContentsView` eklenti arayüzü | **KISMİ** | Ana pencere `contextIsolation` + `sandbox` kullanır; üçüncü taraf eklenti WebContentsView host’u üretimde açılmamıştır. UI katkısı isteyen üçüncü taraf paketler etkinleştirilmez. |
| OS düzeyi worker sandbox | **DIŞ ALTYAPI GEREKİYOR** | AppContainer profili, Job Object kaynak bütçesi, düşük bütünlük tokenı ve ağ broker’ı gerekir. Mevcut MCP alt süreç izolasyonu bunların yerine geçmez. |
| Dış uygulama companion protokolü | **KISMİ** | Kimlikli Core API ve worker eşleştirmesi vardır; MD’deki genel adlandırılmış pipe/Unix socket companion SDK ve servis keşfi tamamlanmamıştır. |
| UI contribution slot’ları | **KISMİ** | DevBox’ın kendi bileşen slotları vardır; doğrulanmamış üçüncü taraf React/HTML kodu ana renderer’a yüklenmez. Güvenli bildirimsel UI şeması ayrıca uygulanmalıdır. |
| Sağlık/performance bütçeleri | **KISMİ** | Süre, ileti ve çıktı limitleri vardır. Eklenti başına kalıcı CPU/RAM telemetrisi ve otomatik karantina eşiği yoktur. |
| Genel marketplace API’si ve geliştirici portalı | **DIŞ ALTYAPI GEREKİYOR** | Hesap, MFA, RBAC, nesne deposu, değişmez artifact, tarama kuyruğu, yönetici konsolu, bildirim ve itiraz servisi gerekir. Yerel sözleşmeler `src/shared/marketplace-contracts.ts` içindedir fakat internette çalışan bir mağaza değildir. |
| Otomatik karantina/malware tarama çiftliği | **DIŞ ALTYAPI GEREKİYOR** | Ayrı güvenlik hesabı, izole VM/container havuzu, AV/YARA/SBOM/license scanner ve imzalı tarama kanıtı gerekir. |
| Katalog imzalama ve aşamalı dağıtım | **DIŞ ALTYAPI GEREKİYOR** | DevBox’tan bağımsız çevrimdışı katalog anahtarı, yayın servisi ve CDN gerekir. Yerel sideload paketleri katalog yayını sayılmaz. |
| Authenticode ve imzalı updater | **DIŞ ALTYAPI GEREKİYOR** | SignPath başvurusu gönderildi ancak gerçek sertifika/organizasyon onayı henüz verilmedi. Mevcut EXE ve kurucu `NotSigned` olarak raporlanmalıdır. |
| Fiziksel ikinci makine ve ağ bölünmesi | **ÇALIŞTIRILMADI** | Uzak worker aynı makinede gerçek E2E’den geçti. İkinci Windows makinesi, bağlantı kaybı, yeniden bağlanma ve iş sahipliği kanıtı ayrıca çalıştırılmalıdır. |
| Uzun temiz-VM soak/failure matrisi | **ÇALIŞTIRILMADI** | Disk-full, reboot, sürücü arızası, fiziksel güç kesintisi ve saatler süren CPU/RAM/I/O soak bu teslimde çalıştırılmadı. |

## Güven sınırları

1. Üçüncü taraf JavaScript hiçbir zaman Electron ana sürecine `import` edilmez.
2. İmzası, hash’i, uyumluluğu veya güven kökü doğrulanmayan paket etkinleştirilmez.
3. Bir yerel yayıncı anahtarı “yönetilen katalog” veya “DevBox tarafından onaylandı” biçiminde etiketlenmez.
4. Harici eklentinin geliştirici/yayıncı kimliği DevBox veya Yaaertu olarak yeniden yazılmaz; kaynak sahipliği korunur.
5. Gizli ortam değişkenleri alt sürece topluca aktarılmaz.
6. Seçili proje dışındaki program, çalışma dizini ve breakpoint kaynakları yerleşik debugger için reddedilir.
7. Sunucu tarafı bulunmayan topluluk özellikleri arayüzde hazır veya çalışıyor gösterilmez.

## Doğrulama komutları

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm truth:audit
pnpm vitest run --config config/vitest.config.ts src/main/services/language-debug-service.test.ts
pnpm vitest run --config config/vitest.config.ts src/main/services/remote-worker-e2e.test.ts
```

Yayın kararı yalnız bu komutların sonucu, paket doğrulaması, imza durumu ve çalıştırılmayan dış ortam testleri birlikte değerlendirilerek verilir.
