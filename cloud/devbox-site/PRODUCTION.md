# DevBox Site Production v0.1.20

- Canonical hedef: `https://devbox.vercel.app/`
- Vercel root: `cloud/devbox-site`
- DevAPI public state: `https://devapi-virid.vercel.app/api/v1/public-state`
- Public-state 5 saniyede yanıt vermezse veya stale ise canlı metrikler `—` / `UNAVAILABLE` gösterilir.
- Sahte level, score, finding veya gate değeri yasaktır.
- DevAPI ve GitHub linkleri canonical URL olmalıdır.
- Production promotion yalnız staged deploy smoke, cross-link ve observability kontrolleri PASS olduğunda yapılır.
