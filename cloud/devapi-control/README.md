# DevBox DevAPI Cloud Control

Bu dizin DevBox masaüstü uygulamasından bağımsız çalışan kalıcı DevAPI kontrol düzlemidir. Statik dashboard ile Vercel Functions aynı root directory altında dağıtılır. Kalıcı state için Postgres uyumlu `DATABASE_URL` zorunludur.

## Production sözleşmesi

Vercel projesinin **Root Directory** değeri `cloud/devapi-control` olmalıdır. Runtime Node.js 24.x kullanır.

Production ortam değişkenleri:

- `DATABASE_URL`: Neon/Postgres bağlantı dizesi. Snapshot history, project state ve command audit burada kalır.
- `DEVBOX_CONTROL_PLANE_TOKEN`: en az 32 karakter. Masaüstü bearer + HMAC imzasında kullanılır. DevBox Windows ortamındaki aynı isimli değerle birebir aynı olmalıdır.
- `DEVBOX_CONTROL_ADMIN_TOKEN`: en az 32 karakter ve desktop token'dan ayrı olmalıdır. Web dashboard state okuma ve komut üretme yetkisidir.

DevBox masaüstünde ayrıca:

- `DEVBOX_CONTROL_PLANE_URL=https://<control-plane-domain>`
- `DEVBOX_CONTROL_PLANE_TOKEN=<Vercel ile aynı desktop token>`

Admin token masaüstüne verilmez. Desktop token tarayıcı dashboard'una verilmez.

## Fail-closed davranış

`GET /api/v1/health` yalnız kaba `READY` / `UNCONFIGURED` durumu ve sürümü döndürür; hangi secret veya altyapı bileşeninin eksik olduğunu public olarak açıklamaz. Üç production gereksiniminden biri eksikse HTTP 503 döner.

Desktop snapshot akışı HMAC timestamp doğrulamasından geçmeden yazılamaz. Cloud komutları yalnız şu allowlist ile sınırlıdır:

- `evolution.setEnabled`
- `evolution.run`
- `evolution.cancel`

Arbitrary shell, dosya yolu veya serbest komut payload'ı cloud command API üzerinden çalıştırılmaz.

## Komut lifecycle

Komutlar `PENDING` olarak yaratılır. DevBox komutu gerçek yerel servise uyguladıktan sonra HMAC ile `APPLIED` ACK gönderir. Geçici uygulama hataları `RETRYING` olarak kaydedilir. Aynı komut beş başarısız uygulama denemesinden sonra `FAILED` olur ve FIFO kuyruğunun geri kalanını sonsuza kadar bloke etmez.

Yerel idempotency marker, uygulama başarılı olduktan sonra ACK ağı kesilirse komutun tekrar uygulanmasını önler. Bir sonraki poll yalnız ACK'i tekrarlar.

Terminal (`APPLIED` / `FAILED`) komut kayıtları 90 gün veya proje başına son 2000 kayıt sınırından eski olduklarında temizlenir. Snapshot history proje başına son 500 kayıtla sınırlandırılır.

## Cloud sürekliliği

`/api/v1/projects` admin kimliğiyle cloud'a en az bir kez snapshot göndermiş projeleri listeler. Dashboard project ID ezberletmez; envanterden seçim yapılabilir. `/api/v1/state` son snapshot, history ve command audit verisini döndürür.

Masaüstü uygulaması silinse veya çalışmasa bile daha önce yazılmış snapshot/history verisi Postgres'te kalır. Masaüstü çevrimdışıyken yeni cloud komutları `PENDING` kalır ve desktop yeniden bağlandığında FIFO ile tüketilir.
