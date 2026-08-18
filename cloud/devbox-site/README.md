# DevBox product site v0.1.19

Vercel Root Directory: `cloud/devbox-site`

Bu site yalnız gerçek ürün özelliklerini tanıtır ve DevAPI'nin sanitize edilmiş public endpoint'ini okur:

`https://devapi-virid.vercel.app/api/v1/public-state`

Endpoint kullanılamıyorsa sayaç veya READY değeri uydurulmaz. Polling sekme görünmezken durur, istek 5 saniye timeout ile sınırlıdır ve reduced-motion desteklenir.

Site statiktir; admin/desktop token istemez ve taşımaz.
