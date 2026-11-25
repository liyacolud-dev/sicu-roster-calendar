import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type{TextItem,Entry}from"../types";
pdfjsLib.GlobalWorkerOptions.workerSrc=workerUrl;
const KNOWN=["產檢","共識","體側","D新","E新","N新","D","E","N","C","息","例","國","補","特","公","病","喪"];
export async function extract(file:File){const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;const out:TextItem[]=[];for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const c=await page.getTextContent();for(const i of c.items as any[]){const text=(i.str||"").trim();if(text)out.push({text,x:i.transform[4],y:i.transform[5],width:i.width||0,page:p});}}return out;}
export function names(items:TextItem[]){const blocked=new Set([...KNOWN,"姓名","職稱","日期","星期","小計","總計"]);const xs=items.filter(i=>i.x<180&&i.text.length>=2&&i.text.length<=8&&!blocked.has(i.text)&&!/^[0-9/一二三四五六日]+$/.test(i.text)).map(i=>i.text);return [...new Set(xs)];}
function normalize(raw:string){const s=raw.replace(/\s/g,"");let main=KNOWN.find(k=>s.startsWith(k))||"";if(main==="D新"||main==="E新"||main==="N新")return{main:main[0],note:"新"};if(!main){const m=s.match(/[DENC]/);main=m?.[0]||s;}const note=s.replace(main,"").replace(/^[/#]+/,m=>m);return{main,note};}
export function rowFor(items:TextItem[],name:string,month:number){const n=items.find(i=>i.text===name);if(!n)return[];const same=items.filter(i=>i.page===n.page&&Math.abs(i.y-n.y)<4&&i.x>n.x+15).sort((a,b)=>a.x-b.x);const tokens=same.filter(i=>KNOWN.some(k=>i.text.includes(k))||/[DENC#]/.test(i.text));const entries:Entry[]=[];tokens.slice(0,31).forEach((t,idx)=>{const v=normalize(t.text);entries.push({day:idx+1,raw:t.text,main:v.main,note:v.note,enabled:["D","E","N","C"].includes(v.main)});});return entries;}
