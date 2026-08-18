# DevAPI Production v0.1.20

Bu belge secret içermez. Production promotion fail-closed yürütülür.

- Canonical DevAPI: `https://devapi-virid.vercel.app/`
- Hedef DevBox site: `https://devbox.vercel.app/`
- Neon project: `delicate-heart-48380148`
- Neon branch: `br-broad-frog-aua7edwl`
- Database: `neondb`
- Canonical tables: `devbox_project_state`, `devbox_project_state_history`, `devbox_control_commands`
- Required Vercel secrets: `DATABASE_URL`, `DEVBOX_CONTROL_PLANE_TOKEN`, `DEVBOX_CONTROL_ADMIN_TOKEN`
- Desktop/admin token aynı olamaz ve en az 32 karakter olmalıdır.
- Strict control FIFO Vercel Queues'a taşınmaz; sequence + ACK + idempotency korunur.
- Production state yalnız `evidence/v020-production.json` state=`PASS` ve `pnpm production:verify` PASS olduğunda READY sayılır.
