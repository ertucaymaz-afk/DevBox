const STORAGE_KEY="devbox.ecoTheme";
const OPTIONS=["system","light","dark"];
const media=matchMedia("(prefers-color-scheme: dark)");
const compact=matchMedia("(max-width: 760px)");

function savedMode(){
  try{const value=localStorage.getItem(STORAGE_KEY);return OPTIONS.includes(value)?value:"system"}catch{return "system"}
}
function resolved(mode){return mode==="system"?(media.matches?"dark":"light"):mode}
function apply(mode){
  const safe=OPTIONS.includes(mode)?mode:"system";
  document.documentElement.dataset.ecoTheme=resolved(safe);
  document.documentElement.dataset.ecoThemePreference=safe;
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute("content",resolved(safe)==="dark"?"#0F1115":"#FF6A00");
  document.querySelectorAll("[data-eco-theme-option]").forEach(button=>button.setAttribute("aria-pressed",String(button.getAttribute("data-eco-theme-option")===safe)));
}
function setMode(mode){
  const safe=OPTIONS.includes(mode)?mode:"system";
  try{localStorage.setItem(STORAGE_KEY,safe)}catch{}
  apply(safe);
}
function markup(){return `<div class="eco-theme-switcher" role="group" aria-label="Görünüm"><button type="button" data-eco-theme-option="system">Sistem</button><button type="button" data-eco-theme-option="light">Açık</button><button type="button" data-eco-theme-option="dark">Koyu</button></div>`}
function install(){
  if(document.querySelector(".eco-theme-switcher"))return;
  const top=document.querySelector(".eco-topbar-inner");
  const navActions=document.querySelector(".nav-actions");
  const anchor=top||navActions;
  const floating=compact.matches&&Boolean(anchor);
  const host=floating?document.body:anchor;
  if(!host)return;
  host.insertAdjacentHTML("beforeend",markup());
  const switcher=host.querySelector(".eco-theme-switcher:last-of-type");
  if(floating&&switcher instanceof HTMLElement){
    switcher.style.position="fixed";
    switcher.style.right="12px";
    switcher.style.bottom="12px";
    switcher.style.zIndex="120";
  }
  switcher?.querySelectorAll("[data-eco-theme-option]").forEach(button=>button.addEventListener("click",()=>setMode(button.getAttribute("data-eco-theme-option")||"system")));
  apply(savedMode());
}
function ensureStyle(){
  if(document.getElementById("devbox-orange-white-style"))return;
  const link=document.createElement("link");
  link.id="devbox-orange-white-style";
  link.rel="stylesheet";
  link.href="/ecosystem-orange.css";
  document.head.append(link);
}
media.addEventListener?.("change",()=>{if(savedMode()==="system")apply("system")});
ensureStyle();
apply(savedMode());
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
