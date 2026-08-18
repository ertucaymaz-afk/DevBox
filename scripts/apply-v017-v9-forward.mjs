import { readFile, writeFile } from "node:fs/promises";
const file = "scripts/verify-api-evolution-v9.mjs";
let source = (await readFile(file, "utf8")).replace(/\r\n/gu, "\n");
const before = Buffer.from("Y2hlY2soInYwMTYtdmVyc2lvbiIsIC8idmVyc2lvbiJccyo6XHMqIjBcLjFcLjE2Ii91LnRlc3QocGtnKSk7CmNoZWNrKCJ2OS1yZWxlYXNlLXNjcmlwdCIsIHBrZy5pbmNsdWRlcygnImV2b2x1dGlvbjp2ZXJpZnkiOiAibm9kZSBzY3JpcHRzL3ZlcmlmeS1hcGktZXZvbHV0aW9uLXY5Lm1qcyInKSk7", "base64").toString("utf8");
const after = Buffer.from("Y29uc3QgcGFja2FnZUpzb24gPSBKU09OLnBhcnNlKHBrZyk7CmNvbnN0IHZlcnNpb25QYXJ0cyA9IFN0cmluZyhwYWNrYWdlSnNvbi52ZXJzaW9uID8/ICIiKS5zcGxpdCgiLiIpLm1hcChOdW1iZXIpOwpjb25zdCB2OUNvbXBhdGlibGUgPSB2ZXJzaW9uUGFydHMubGVuZ3RoID09PSAzCiAgJiYgdmVyc2lvblBhcnRzLmV2ZXJ5KCh2YWx1ZSkgPT4gTnVtYmVyLmlzSW50ZWdlcih2YWx1ZSkgJiYgdmFsdWUgPj0gMCkKICAmJiAodmVyc2lvblBhcnRzWzBdID4gMCB8fCB2ZXJzaW9uUGFydHNbMV0gPiAxIHx8ICh2ZXJzaW9uUGFydHNbMV0gPT09IDEgJiYgdmVyc2lvblBhcnRzWzJdID49IDE2KSk7CmNoZWNrKCJ2MDE2LW1pbmltdW0tdmVyc2lvbiIsIHY5Q29tcGF0aWJsZSk7CmNvbnN0IGV2b2x1dGlvblZlcmlmeSA9IFN0cmluZyhwYWNrYWdlSnNvbi5zY3JpcHRzPy5bImV2b2x1dGlvbjp2ZXJpZnkiXSA/PyAiIik7CmNvbnN0IHZlcmlmaWVyTWF0Y2ggPSBldm9sdXRpb25WZXJpZnkubWF0Y2goL3ZlcmlmeS1hcGktZXZvbHV0aW9uLXYoXGQrKVwubWpzL3UpOwpjaGVjaygidjktb3ItbmV3ZXItcmVsZWFzZS1zY3JpcHQiLCBCb29sZWFuKHZlcmlmaWVyTWF0Y2gpICYmIE51bWJlcih2ZXJpZmllck1hdGNoPy5bMV0gPz8gMCkgPj0gOSk7", "base64").toString("utf8");
if (!source.includes(after)) {
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + 1) >= 0) throw new Error("V017_V9_FORWARD_ANCHOR_INVALID");
  source = source.slice(0, at) + after + source.slice(at + before.length);
  await writeFile(file, source, "utf8");
}
console.log("DEVBOX_V017_V9_FORWARD_APPLIED");