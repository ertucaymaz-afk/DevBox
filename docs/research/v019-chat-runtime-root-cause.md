# v0.1.9 sohbet runtime kök neden kaydı

Gerçek kullanıcı GIF kaydında sohbet akışı Zod `unrecognized_keys` hatasıyla durdu. Hata alanları `stage`, `provider`, `model` idi.

Kaynak denetiminde `AgentProgressEvent` bu alanları gerçek runtime eventinde taşıyor; `src/main/ipc.ts` event nesnesini `ThreadActivityEventSchema` ile strict parse ediyor; fakat v0.1.8 `ThreadActivityEventSchema` yalnız `threadId`, `kind`, `message`, `createdAt` alanlarını kabul ediyor ve `waiting` kind'ını da tanımıyordu.

v0.1.9 onarımı event şemasını gerçek producer sözleşmesiyle hizalar ve `stage/provider/model` metadata'sını renderer'a taşır. Regresyon testi aynı gerçek payload şeklinin strict parse aşamasından geçmesini zorunlu kılar.
