import { readFile, writeFile } from "node:fs/promises";
async function load(file){return (await readFile(file,"utf8")).replace(/\r\n/gu,"\n");}
async function save(file,text){await writeFile(file,text,"utf8");}
function once(source,before,after,label){if(source.includes(after)) return source; const at=source.indexOf(before); if(at<0||source.indexOf(before,at+1)>=0) throw new Error(`V016_UI_ANCHOR_INVALID:${label}`); return source.slice(0,at)+after+source.slice(at+before.length);}

{
  const file="src/renderer/App.tsx"; let source=await load(file);
  source=once(source,'  MessageSquarePlus,\n  Paperclip,','  MessageSquarePlus,\n  Music2,\n  Paperclip,',"music-icon");
  source=once(source,'import { DevApiControlWorkspace } from "./DevApiControlWorkspace";\n','import { DevApiControlWorkspace } from "./DevApiControlWorkspace";\nimport { RemixRotaWorkspace } from "./RemixRotaWorkspace";\n',"music-import");
  source=once(source,'type View = "thread" | "files" | "git" | "runs" | "sites" | "capabilities" | "settings" | "terminal" | "worktrees" | "devapi" | "automations" | "integrations" | "skills" | "pullRequests" | "whatsNew";','type View = "thread" | "files" | "git" | "runs" | "sites" | "capabilities" | "settings" | "terminal" | "worktrees" | "devapi" | "music" | "automations" | "integrations" | "skills" | "pullRequests" | "whatsNew";',"view-union");
  source=once(source,'                  : view === "devapi" ? "DevAPI komuta merkezi"\n                    : view === "automations" ? "API görev motoru"','                  : view === "devapi" ? "DevAPI komuta merkezi"\n                    : view === "music" ? "RemixRota müzik merkezi"\n                    : view === "automations" ? "API görev motoru"',"title");
  source=once(source,'            <button className={view === "devapi" ? "active" : ""} onClick={() => setView("devapi")}><ListChecks size={16} /><span>DevAPI</span></button>\n            <button className={view === "automations" ? "active" : ""} onClick={() => setView("automations")}><Activity size={16} /><span>Görev motoru</span></button>','            <button className={view === "devapi" ? "active" : ""} onClick={() => setView("devapi")}><ListChecks size={16} /><span>DevAPI</span></button>\n            <button className={view === "music" ? "active" : ""} onClick={() => setView("music")}><Music2 size={16} /><span>Müzik</span></button>\n            <button className={view === "automations" ? "active" : ""} onClick={() => setView("automations")}><Activity size={16} /><span>Görev motoru</span></button>',"nav");
  source=once(source,'            {view === "devapi" && <DevApiControlWorkspace project={selfDevelopmentProject ?? selectedProject} />}\n            {view === "automations" && <AutomationWorkspace project={selfDevelopmentProject ?? selectedProject} />}','            {view === "devapi" && <DevApiControlWorkspace project={selfDevelopmentProject ?? selectedProject} />}\n            {view === "music" && <RemixRotaWorkspace />}\n            {view === "automations" && <AutomationWorkspace project={selfDevelopmentProject ?? selectedProject} />}',"render");
  await save(file,source);
}

{
  const file="src/main/services/evolution-finding-service.test.ts"; let source=await load(file);
  source=once(source,'import { EvolutionFindingService } from "./evolution-finding-service.js";\n','import { EvolutionFindingService, FINDING_OWNERS } from "./evolution-finding-service.js";\nimport { FindingSummarySchema } from "../../shared/devapi-control-contracts.js";\n',"finding-import");
  source=once(source,'describe("EvolutionFindingService", () => {\n  it("deduplicates by fingerprint and preserves occurrence history", async () => {','describe("EvolutionFindingService", () => {\n  it("returns a strict zero count for every finding owner even when no findings exist", async () => {\n    const { service, projectId } = await fixture();\n    const summary = FindingSummarySchema.parse(service.summary(projectId));\n    expect(Object.keys(summary.byOwner).sort()).toEqual([...FINDING_OWNERS].sort());\n    for (const owner of FINDING_OWNERS) expect(summary.byOwner[owner]).toBe(0);\n  });\n\n  it("deduplicates by fingerprint and preserves occurrence history", async () => {',"finding-test");
  await save(file,source);
}

console.log("DEVBOX_V016_UI_APPLIED");
