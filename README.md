# DevBox v0.1.19

**DevBox**, Windows üzerinde çalışan; sohbet, gerçek dosya/kod değişikliği, terminal, Git, LSP/DAP, kalıcı hafıza, izole API gelişimi, release gate ve cloud DevAPI kontrol düzlemini tek masaüstünde birleştiren açık kaynak mühendislik uygulamasıdır.

> Ürün sözleşmesi: **Simülasyon, sahte entegrasyon sonucu, uydurma PASS/READY, demo telemetrisi ve çalışmayan buton başarı kabul edilmez.** Bir yol kanıt üretemiyorsa açık hata/finding durumuna geçer.

## ✨ Neler var?

- Sohbet odaklı, **koyu / gündüz / sistem** temalı akıcı Windows arayüzü; gündüz modu bağımsız yüzey/kontrast tokenları ve alev-kırmızısı vurgu sistemi kullanır.
- Mesaj gönderme, düzenleme, kopyalama, yapıştırma, alıntılama ve yeniden oluşturma kontrolleri; provider beklerken yeni sohbet açılabilir ve aynı thread mesajları gerçek **FIFO** koordinatöründen geçer.
- Kes / Kopyala / Yapıştır içeren yerel sağ tık menüleri.
- Her dosya için en fazla **300 MiB** sürükle-bırak eki ve SHA-256 içerik kimliği; boyut limiti içerik belleğe alınmadan fail-closed denetlenir.
- Gerçek `node-pty` / Windows **ConPTY** terminal oturumları.
- Gerçek Git durum, diff ve dosya bazlı ekleme/silme sayacı; API gelişimi için izole worktree yaşam döngüsü.
- Sabit konuşmalar, arşiv, okunma durumu, otomatik başlıklar ve kalıcı **SQLite + FTS5** geçmiş/hafıza sistemi; preference, constraint, decision ve context katmanları, dedup/pruning ve secret filtreleme.
- GitHub PR / issue / check / CI / release ve Vercel komut yolları.
- Worktree yaşam döngüsü, dayanıklı görevler, lease ve yeniden başlatma kurtarması.
- Gerçek TypeScript/JavaScript LSP tanıları; proje başına yeniden kullanılan sınırlı LSP havuzu, belge LRU bütçesi ve Windows canonical URI eşleştirmesi.
- Yerleşik Microsoft `vscode-js-debug` ile thread, stack, scope, variable, stepping ve breakpoint içeren gerçek DAP kontrol yüzeyi.
- Tek kullanımlık eşleştirme, iptal edilebilir kimlik, sağlık sinyali ve çökme kurtarması kullanan uzak çalışan protokolü.
- Yerel geri döngü adresinde erişim anahtarıyla kimlik doğrulayan **DevBox v1 API**.
- Sohbet için hızlı Hermes one-shot yolu; sonuç üretmezse redacted-session güvenli fallback. Workspace kodlama görevleri file/terminal araç döngüsünde gerçek disk mutasyonu ve read-back doğrulaması ister.
- **Canvas canlı kod akışı**: açık dosya görevi önce kod sekmesinde gerçek disk içeriğini gösterir, sonra hash/read-back ve gerçek Electron offscreen render kapısından geçince Preview'a terfi eder.
- Preview kapısı DOM görünürlüğü, console/CSP hatası, load failure ve gerçek frame piksel dağılımını denetler; beyaz/boş render PASS değildir.
- **DevAPI / API Geliştirme**: 22 faz ve 3362 çekirdek görevden sonra adaptif `ADAPT-*` görevleri üretir; Durdur komutuna veya gerçek blocker/recovery durumuna kadar yeni kalite, performans, güvenlik, UX, API, concurrency ve entegrasyon bulguları üzerinde çalışır.
- Evolution findings için fingerprint, severity, owner, `OPEN / RESOLVED / REJECTED` yaşam döngüsü ve kalıcı evidence.
- **Release Gate**: PREFLIGHT/FULL modları, TypeScript, test, build, truth audit, Git fingerprint ve blocking finding kontrolleri; yayın sırasında HEAD/workspace değişirse kapı düşer.
- Windows release CI: yapısal PE/SHA doğrulamasının yanında gerçek silent install → kurulu EXE hash → Desktop/Start Menu shortcut → uygulamayı başlat → gerçek uninstaller → cleanup kabul testi.
- **DevAPI Cloud Control**: HMAC doğrulamalı masaüstü snapshot/command ACK, ayrı admin token, Postgres kalıcı history, `PENDING → RETRYING → APPLIED / FAILED` komut yaşam döngüsü ve cloud project inventory.
- Public ürün sitesi için hassas veri içermeyen `/api/v1/public-state`; finding detaylarını, evidence/prompt/path ve komut payloadlarını dışarı vermez.
- **RemixRota** müzik companion entegrasyonu: current-user Windows named pipe, capability handshake, dar komut allowlist, malformed-event koruması ve stale-process doğrulaması.

## DevAPI ve API gelişimi

DevAPI masaüstündeki sayaçlardan ibaret değildir. `ApiEvolutionService`, development spec, finding registry, release gate, workspace/Git evidence ve cloud state birlikte çalışır.

Gerçek kaynak değişikliği gerektiren görevler izole worktree içinde uygulanır. Başarı için gerçek diff, doğrulama/test ve kalıcı commit gerekir. No-op veya yalnız açıklama üretmek gelişim sayılmaz. Çekirdek 3362 görev bittiğinde adaptif görev üretimi başlar; blocker durumları fail-closed durur.

DevAPI ekranındaki sohbet de normal DevBox AgentService/ThreadTurnCoordinator hattını kullanır. Böylece “burayı düzelt”, “aynı dosyada devam et” gibi sonraki mesajlar önceki workspace bağlamını korur.

## DevAPI Cloud Control

Kaynak: `cloud/devapi-control`

Production gereksinimleri:

- `DATABASE_URL`
- `DEVBOX_CONTROL_PLANE_TOKEN` (desktop HMAC/bearer, en az 32 karakter)
- `DEVBOX_CONTROL_ADMIN_TOKEN` (ayrı web-admin token, en az 32 karakter)
- masaüstünde `DEVBOX_CONTROL_PLANE_URL=https://...`

Public sağlık: `/api/v1/health`

Sanitize edilmiş ürün telemetrisi: `/api/v1/public-state`

Admin state/command uçları token olmadan açılmaz. Public endpoint yalnız proje adı/ref hash'i, evolution sayıları, finding sayaçları, son release gate ve freshness bilgisini döndürür.

## DevBox ürün sitesi

Kaynak: `cloud/devbox-site`

Sıfır harici runtime bağımlılığıyla hazırlanmıştır. Görsel hareketler native CSS/Web Animations/IntersectionObserver üstünden çalışır; `prefers-reduced-motion` desteklenir. Site `https://devapi-virid.vercel.app/api/v1/public-state` üzerinden gerçek DevAPI public state okumayı dener. Endpoint yoksa veya cloud yapılandırılmamışsa sahte metrik üretmez.

## Release / gerçeklik kapıları

Ana zincir:

```text
spec:verify
→ evolution:verify (v12, önceki verifier'ları miras alır)
→ cloud:verify
→ TypeScript
→ regresyon testleri
→ production build
→ truth audit
→ Windows NSIS
→ installer PE/SHA
→ gerçek install/launch/uninstall acceptance
```

`cloud:verify`, iki Vercel kaynak ağacındaki JavaScript syntax'ını, CSP başlıklarını, public-state sanitizasyonunu ve client bundle içinde desktop/admin secret isimlerinin bulunmamasını denetler.

## Güvenlik ve doğruluk

DevBox’ta demo yanıt, sahte entegrasyon sonucu, simüle edilmiş ilerleme ya da uydurma “hazır” durumu bulunmaz. Çalışmayan yol kanıt üretmek yerine hata/finding durumuna geçer.

Cloud tarafında arbitrary shell veya serbest dosya komutu kabul edilmez. İzinli command türleri `evolution.setEnabled`, `evolution.run`, `evolution.cancel` ile sınırlıdır. Masaüstü komutları idempotent marker ve ACK ile uygulanır.

## Lisans

DevBox kaynak kodu Apache-2.0 lisanslıdır. Üçüncü taraf bileşen ve lisans notları `THIRD_PARTY_NOTICES.md` altında tutulur.
