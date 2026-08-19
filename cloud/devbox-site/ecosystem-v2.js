const STYLE_ID="devbox-ecosystem-v2-style";
const architecture=[
 ["U","Kullanıcı","Görev hedefi ve başarı kriteri","source"],
 ["D","DevBox","Project, thread ve Windows host sınırı","source"],
 ["A","Task / Agent","İzole görev ve yürütme bağlamı","source"],
 ["WT","Worktree","Paralel repo çalışma alanı","source"],
 ["TL","Tool / Command","Dosya, terminal, Git, LSP ve DAP","source"],
 ["V","Verification","Typecheck, test, build ve truth gate","source"],
 ["API","DevAPI","Sanitized state + bounded control plane","source"],
 ["DB","Postgres / Neon","Kalıcı state ve history sözleşmesi","source"],
 ["EV","Evidence","Kaynak, CI, runtime ve release kanıtı","source"],
 ["RG","Release Gate","Kanıt eksikse promotion BLOCKED","gate"]
];
const capabilities=[
 ["CH","Chat","Provider cevabı ve kullanıcı mesajı ayrımı"],
 ["PJ","Project","Proje bağlamı ve kaynak sınırı"],
 ["TH","Agent thread","Görev/thread durum modeli"],
 ["WT","Worktree","İzole Git çalışma ağacı"],
 ["GT","Git","Status, diff ve branch akışları"],
 ["PTY","Terminal / ConPTY","Gerçek Windows terminal süreci"],
 ["TS","TypeScript LSP","Dil servisi ve diagnostics"],
 ["DAP","Debugger","Debug Adapter Protocol yüzeyi"],
 ["DF","Diff / review","Değişiklik inceleme ve kanıt"],
 ["MEM","Memory","SQLite + FTS5 proje hafızası"],
 ["DX","Diagnostics","Source truth ve kalite kapıları"],
 ["EV","Evolution","Finding → verify → evidence döngüsü"]
];
const tracks=[
 ["01","Cloud continuity","Kalıcı snapshot/history sınırı"],
 ["02","Deployment safety","Stage, probe, promote, rollback"],
 ["03","Command delivery","Bounded command + ACK lifecycle"],
 ["04","Protocol compatibility","Desktop ↔ cloud sürüm sözleşmesi"],
 ["05","Secret rotation","Credential lifecycle ve redaction"],
 ["06","Dependency provenance","Lockfile + supply-chain doğrulaması"],
 ["07","Release evidence","Promotion öncesi kanıt zinciri"],
 ["08","Runtime diagnostics","Failure ve stale-state ayrımı"],
 ["09","Memory persistence","Kalıcı bağlam ve retrieval"],
 ["10","Source truth","SOURCE / CI / RUNTIME ayrımı"]
];
function ensureStyle(){if(document.getElementById(STYLE_ID))return;const link=document.createElement("link");link.id=STYLE_ID;link.rel="stylesheet";link.href="/ecosystem-v2.css";document.head.append(link)}
function section(title,caption,description,body){return `<section class="eco-v2-section eco-reveal"><div class="eco-v2-head"><div><span class="eco-v2-caption">${caption}</span><h3>${title}</h3></div><p>${description}</p></div>${body}</section>`}
function install(){const wrap=document.querySelector("#ecosystem .eco-wrap");if(!wrap||document.getElementById("ecoArchitectureExplorer"))return;
 const architectureHtml=`<div class="eco-architecture" id="ecoArchitectureExplorer">${architecture.map(([code,title,text,state])=>`<article class="eco-arch-node ${state}"><span class="dot">${code}</span><strong>${title}</strong><span>${text}</span></article>`).join("")}</div><p class="eco-capability-note">Bu şema ürünün kaynak mimarisini gösterir; bir kutunun görünmesi o bileşenin production runtime’da canlı olduğu anlamına gelmez. Production state yalnız gerçek probe/evidence ile yükseltilir.</p>`;
 wrap.insertAdjacentHTML("beforeend",section("Architecture Explorer","SOURCE ARCHITECTURE","DevBox’tan release gate’e giden mühendislik zincirini pazarlama sisinden arındırarak gösterir. Her adım kendi güven ve kanıt sınırına sahiptir.",architectureHtml));
 const capabilityHtml=`<div class="eco-capability-matrix" id="ecoSourceCapabilityMatrix">${capabilities.map(([code,title,text])=>`<article class="eco-capability-tile"><header><span class="symbol">${code}</span><b>SOURCE VERIFIED</b></header><h4>${title}</h4><p>${text}</p></article>`).join("")}</div><p class="eco-capability-note">SOURCE VERIFIED etiketi yalnız kaynak sözleşmesini ifade eder. Canlı Windows host, provider, cloud veya production kanıtı gerektiren yetenekler ayrıca runtime gate’inden geçer.</p>`;
 wrap.insertAdjacentHTML("beforeend",section("DevBox ne yapabiliyor?","CAPABILITY MAP","Mevcut source ağacında bulunan mühendislik yeteneklerini tek bakışta gruplar. Runtime kanıtı olmayan hiçbir karta LIVE etiketi verilmez.",capabilityHtml));
 const evolutionHtml=`<div class="eco-evolution-track" id="ecoEvolutionTracks">${tracks.map(([n,title,text])=>`<article><small>TRACK ${n}</small><strong>${title}</strong><span>${text}</span></article>`).join("")}</div><p class="eco-capability-note">Evolution ilerlemesi yüzde uydurmaz. Canlı sanitized snapshot varsa level/score ana truth panelinde görünür; yoksa burada yalnız kaynak track’leri listelenir.</p>`;
 wrap.insertAdjacentHTML("beforeend",section("DevAPI ne öğrendi?","EVOLUTION TRACKS","Cloud continuity’den source truth’a kadar öğrenilmiş/uygulanmış kaynak track’lerini görünür hale getirir; canlı seviye ayrı public-state sözleşmesinden gelir.",evolutionHtml));
 document.querySelectorAll("#ecosystem .eco-reveal:not(.visible)").forEach(el=>{if(matchMedia("(prefers-reduced-motion: reduce)").matches){el.classList.add("visible");return}requestAnimationFrame(()=>el.classList.add("visible"))});
}
ensureStyle();install();
