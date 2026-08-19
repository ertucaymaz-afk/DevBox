import { readFile, writeFile } from "node:fs/promises";

const file = "src/renderer/CatalogWorkspaceV2.tsx";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");

const oldRuntimeLabel = `function runtimeLabel(item: CatalogItem): string {
  if (item.runtimeState === "RUNNING") return "Çalışıyor";
  if (item.runtimeState === "INSTALLED") return "Kurulu";
  if (item.runtimeState === "FAILED") return "Çalışma hatası";
  if (item.runtimeState === "SOURCE_ONLY") return "Kaynak hazır";
  return "Kurulu değil";
}`;
const newRuntimeLabel = `function runtimeLabel(item: CatalogItem): string {
  if (item.sourceState === "HASH_FAILED") return "Bütünlük hatası";
  if (item.doctorState === "FAILED") return "Doktor başarısız";
  if (item.runtimeState === "FAILED") return "Çalışma hatası";
  if (item.runtimeState === "RUNNING") return "Çalışıyor";
  if (item.runtimeState === "INSTALLED") return "Kurulu";
  if (item.runtimeState === "SOURCE_ONLY" && ["HASH_VERIFIED", "BUNDLE_VERIFIED"].includes(item.sourceState)) return "Kaynak doğrulandı";
  if (item.runtimeState === "SOURCE_ONLY") return "Kaynak bekliyor";
  return "Kurulu değil";
}`;

const oldReload = `  const reload = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setCatalog(await window.devbox.inspectCatalog());
    } catch (caught) {
      setError(failure(caught));
    }
  }, []);`;
const newReload = `  const reload = useCallback(async (): Promise<void> => {
    setBusy("reload");
    setError(null);
    try {
      setCatalog(await window.devbox.inspectCatalog());
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setBusy(null);
    }
  }, []);`;

function replaceExact(oldValue, newValue, name) {
  const count = source.split(oldValue).length - 1;
  if (count === 1) {
    source = source.replace(oldValue, newValue);
    return;
  }
  if (source.includes(newValue)) return;
  throw new Error(`${name}_ANCHOR_MISMATCH:${count}`);
}

replaceExact(oldRuntimeLabel, newRuntimeLabel, "CATALOG_RUNTIME_LABEL");
replaceExact(oldReload, newReload, "CATALOG_RELOAD_BUSY");

for (const required of [
  'if (item.sourceState === "HASH_FAILED") return "Bütünlük hatası";',
  'if (item.doctorState === "FAILED") return "Doktor başarısız";',
  'return "Kaynak doğrulandı";',
  'return "Kaynak bekliyor";',
  'setBusy("reload");',
  'finally {\n      setBusy(null);\n    }'
]) {
  if (!source.includes(required)) throw new Error(`CATALOG_TRUTH_POSTCONDITION_MISSING:${required}`);
}

await writeFile(file, source, "utf8");
console.log("V020_CATALOG_TRUTH_PATCH_PASS");
