# DevBox v0.1.20 Production Status

Bu dosya fail-closed deployment evidence özetidir. Secret içermez.

## Doğrulanan

- GitHub source baseline: DevBox v0.1.19 tree `f7ae85d2f33fb8dc5bfe2baca056207c46fd0a6e`.
- Vercel team: `team_PNUxk74M7XR8MFlKl676ZHlv`.
- Existing DevAPI project: `prj_mJCrN5G6w4R32axSWYSLSuuAdmBz`.
- Existing DevAPI production deployment: `dpl_G136cKsQQ3W4b7UneNJu7osR1n7x`.
- Rollback candidate: `dpl_AuUDtYcyZJdY5dYACxKJgs43LsjC`.
- Existing canonical DevAPI URL halen eski `devapi v0.4.1` sunuyor; READY değildir.
- Neon production project: `delicate-heart-48380148`, branch `br-broad-frog-aua7edwl`, database `neondb`.
- Canonical state/history/command tabloları gerçek DB üzerinde oluşturuldu ve read-back ile doğrulandı.

## BLOCKED_EXTERNAL

Mevcut Vercel connector yeni `devbox` project oluşturma, project root değiştirme ve production environment secret yazma aksiyonlarını sunmuyor. Ortamda doğrulanmış Vercel CLI oturumu da yok. Bu nedenle staged production deploy, desktop↔cloud command canary ve production promotion henüz PASS değildir.

`evidence/v020-production.json` bu durumu `BLOCKED_EXTERNAL` olarak taşır; `pnpm production:verify` durum PASS olmadan release'i bilinçli olarak düşürür.
