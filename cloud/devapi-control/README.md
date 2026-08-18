# DevBox DevAPI Cloud Control v0.1.19

Bu dizin DevBox masaüstünden bağımsız çalışan kalıcı DevAPI kontrol düzlemidir. Statik dashboard ve Vercel Functions aynı root altında dağıtılır. Kalıcı state için Postgres uyumlu `DATABASE_URL` zorunludur.

## Vercel root

`cloud/devapi-control`

Node.js 24.x.

## Production env

- `DATABASE_URL`
- `DEVBOX_CONTROL_PLANE_TOKEN`: desktop bearer + HMAC, minimum 32 karakter
- `DEVBOX_CONTROL_ADMIN_TOKEN`: web admin için ayrı minimum 32 karakter

Desktop:

- `DEVBOX_CONTROL_PLANE_URL=https://<devapi-production-domain>`
- `DEVBOX_CONTROL_PLANE_TOKEN=<aynı desktop token>`

Admin token desktop'a verilmez; desktop token tarayıcıya verilmez.

## Endpointler

- `GET /api/v1/health`: secret detaylarını ifşa etmeyen READY/UNCONFIGURED health.
- `GET /api/v1/public-state`: kimliksiz fakat sanitize edilmiş ürün/evolution özeti. Tam snapshot, finding item/evidence, komut payload, path veya prompt dönmez.
- `GET /api/v1/projects`: admin inventory.
- `GET /api/v1/state`: admin tam state/history/audit.
- `GET/PATCH /api/v1/commands`: desktop HMAC poll/ACK.
- `POST /api/v1/commands`: admin allowlist komut üretimi.
- `POST /api/v1/snapshot`: desktop HMAC snapshot.

## Komut lifecycle

`PENDING → RETRYING → APPLIED / FAILED`

İzinli komutlar yalnız `evolution.setEnabled`, `evolution.run`, `evolution.cancel`. Arbitrary shell/file payload yoktur. Desktop idempotency marker, ACK ağı koptuğunda aynı command'ın yeniden uygulanmasını engeller.

## Kalıcılık

Snapshot history proje başına son 500 kayıtla, terminal command history ise 90 gün veya 2000 kayıtla sınırlandırılır. Desktop çevrimdışıyken daha önce yazılmış state Postgres'te kalır ve komutlar desktop geri gelene kadar pending kalabilir.

## Production kabul

Deployment yalnız aşağıdaki üç kontrol gerçek cevap verirse DevBox ekosisteminde bağlı kabul edilir:

1. `/` HTTP 200 ve dashboard sürümü v0.1.19,
2. `/api/v1/health` 200 READY veya yapılandırma eksikse açık 503 UNCONFIGURED,
3. `/api/v1/public-state` gerçek snapshot varsa 200 ve sanitize schema; DB/state yoksa açık 503/404.
