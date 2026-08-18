# v0.1.20 Release Gate

Sıra:

1. `spec:verify` — 22 faz / 3362 çekirdek görev.
2. `evolution:verify` — v7 → v13 miras zinciri.
3. `cloud:verify` — DevAPI / DevBox web kaynakları, CSP, sanitize public-state, cross-links.
4. `production:verify` — yalnız gerçek Vercel/Neon/canary evidence PASS ise geçer.
5. TypeScript.
6. Regresyon testleri.
7. Production build + truth audit.
8. Staged DevAPI deploy + canary.
9. Staged DevBox deploy + smoke.
10. Vercel runtime error scan.
11. NSIS + PE/SHA.
12. Windows silent install + installed EXE hash + launch + uninstall + cleanup.

Production evidence `BLOCKED_EXTERNAL` ise PR merge ve production promotion yasaktır.
