# v0.1.20 Cloud Canary Contract

Production canary ancak gerçek staged deployment üstünde çalışır.

- Desktop snapshot HMAC ile gönderilir ve DB read-back ile doğrulanır.
- `evolution.setEnabled(true)` → `APPLIED`.
- `evolution.run` → `APPLIED`.
- `evolution.cancel` → `APPLIED`.
- Retry senaryosunda aynı command ikinci kez uygulanmaz.
- Sequence monoton artar ve atlanmaz.
- 5 başarısız deneme sonrası terminal state `FAILED` olur.
- Public state hassas finding/evidence/prompt/path/command payload/instance/token/DB URL içermez.
- Snapshot 120 saniyeden eskiyse `stale=true` ve siteler READY metriği göstermez.
