# DevBox Cloud v0.1.20

İki ayrı deployment unit vardır:

- `cloud/devapi-control`: durable DevAPI control plane.
- `cloud/devbox-site`: public DevBox product site.

`cloud/product-links.json` canonical link sözleşmesini, `cloud/production-evidence.json` ise fail-closed production kanıtını taşır. Production promotion tamamlanmadan `PASS`, `READY` veya canonical DevBox URL uydurulmaz.

DevAPI production için `DATABASE_URL`, `DEVBOX_CONTROL_PLANE_TOKEN`, `DEVBOX_CONTROL_ADMIN_TOKEN` gerekir. Secret içerikleri repository, browser bundle veya audit loguna yazılmaz.
