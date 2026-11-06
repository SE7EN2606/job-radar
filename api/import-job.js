/* JobRadar URL importer.
   Node/Vercel serverless function; GitHub Pages cannot execute this endpoint.
   Only extracts public job metadata; never performs automated applications. */
import dns from "node:dns/promises";
import net from "node:net";

const MAX_BYTES=1_500_000;
const TIMEOUT_MS=10000;
const MAX_REDIRECTS=3;

function clean(s){return String(s??"").replace(/\s+/g," ").trim()}
function decode(s=""){
 return String(s).replace(/&#x([0-9a-f]+);/gi,(_,x)=>String.fromCodePoint(parseInt(x,16)))
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/gi,x=>({"&nbsp;":" ","&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'","&#39;":"'"}[x.toLowerCase()]||x));
}
function textHtml(s=""){
 return clean(decode(String(s)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
  .replace(/<br\b[^>]*\/?>/gi,"\n")
  .replace(/<\/(?:p|li|div|section|h[1-6])>/gi,"\n")
  .replace(/<[^>]*>/g," ")));
}
function deepJob(data){
 if(!data||typeof data!=="object")return null;
 if(Array.isArray(data)){for(const x of data){const found=deepJob(x);if(found)return found}return null}
 const types=Array.isArray(data["@type"])?data["@type"]:[data["@type"]];
 if(types.some(x=>/^(https?:\/\/schema.org\/)?JobPosting$/i.test(String(x||""))))return data;
 for(const key of ["@graph","mainEntity","itemListElement"]){if(data[key]){const found=deepJob(data[key]);if(found)return found}}
 return null;
}
function jsonLdJob(html){
 for(const [,body] of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const found=deepJob(JSON.parse(body));if(found)return found}catch{}
 }
 return null;
}
function metas(html){
 const result={};
 for(const [,attrs] of html.matchAll(/<meta\b([^>]+)>/gi)){
  const fields={};
  for(const [,key,,value] of attrs.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))fields[key.toLowerCase()]=decode(value);
  const name=fields.property||fields.name||fields.itemprop;
  if(name&&fields.content)result[name.toLowerCase()]=fields.content;
 }
 return result;
}
function first(x){return Array.isArray(x)?x[0]:x}
function locationFromLd(ld){
 const loc=first(ld?.jobLocation);
 const address=loc?.address||loc||{};
 if(typeof address==="string")return clean(address);
 const parts=[address.addressLocality,address.addressRegion,address.addressCountry].map(x=>typeof x==="string"?x:(x?.name||"")).filter(Boolean);
 return [...new Set(parts)].join(", ");
}
function companyFromLd(ld){
 const company=ld?.hiringOrganization||ld?.hiringOrganizationName;
 return clean(typeof company==="string"?company:company?.name);
}
function money(n,c){
 const amount=Number(n);
 if(!Number.isFinite(amount)||amount<=0)return "";
 const symbol={EUR:"€",GBP:"£",USD:"$",CAD:"CA$",AUD:"A$"}[c]||c+" ";
 return symbol+Math.round(amount).toLocaleString("en-US");
}
function salaryLd(ld){
 const base=ld?.baseSalary;if(!base)return "";
 const v=base.value||base;
 if(typeof v!=="object")return "";
 const currency=base.currency||v.currency||"";
 const low=money(v.minValue||v.value,currency),high=money(v.maxValue,currency);
 return low&&high?low+"–"+high:low||high;
}
function safeText(value,max=12000){return clean(textHtml(value)).slice(0,max)}
function sanitizeUrl(value){
 const url=new URL(String(value||""));
 if(url.protocol!=="https:")throw Error("Only HTTPS job links are supported.");
 if(url.username||url.password||url.port)throw Error("URLs with credentials or custom ports are not allowed.");
 const host=url.hostname.toLowerCase().replace(/\.$/,"");
 if(!host.includes(".")||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.endsWith(".test")||net.isIP(host))throw Error("A public job-page hostname is required.");
 if(url.href.length>2048)throw Error("Job URL is too long.");
 return url;
}
function blockedIp(address){
 if(net.isIP(address)===4){
  const [a,b]=address.split(".").map(Number);
  return a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a>=224||a===192&&b===0||a===198&&b>=18&&b<=19;
 }
 if(net.isIP(address)===6){
  const ip=address.toLowerCase();
  return ip==="::"||ip==="::1"||ip.startsWith("fe80:")||ip.startsWith("fc")||ip.startsWith("fd")||ip.startsWith("ff")||ip.startsWith("2001:db8")||ip.startsWith("::ffff:");
 }
 return true;
}
async function requirePublic(url){
 const records=await dns.lookup(url.hostname,{all:true,verbatim:true});
 if(!records.length||records.some(r=>blockedIp(r.address)))throw Error("This domain cannot be accessed by the importer.");
}
async function fetchPage(url){
 let current=sanitizeUrl(url);
 for(let attempt=0;attempt<=MAX_REDIRECTS;attempt++){
  await requirePublic(current);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  let r;
  try{
   r=await fetch(current.toString(),{redirect:"manual",signal:controller.signal,
    headers:{"User-Agent":"JobRadar metadata importer/1.0 (+https://se7en2606.github.io/job-radar/)",
      Accept:"text/html,application/xhtml+xml,application/json"}});
   if([301,302,303,307,308].includes(r.status)){
    if(attempt===MAX_REDIRECTS)throw Error("Too many redirects.");
    const redirect=r.headers.get("location");
    if(!redirect)throw Error("The job website returned an incomplete redirect.");
    current=sanitizeUrl(new URL(redirect,current));
    await r.body?.cancel();
    continue;
   }
   if(r.status===401||r.status===403||r.status===429)throw Error("The website blocks automated access (HTTP "+r.status+").");
   if(!r.ok)throw Error("Job website returned HTTP "+r.status+".");
   const kind=r.headers.get("content-type")||"";
   if(!/(text\/html|application\/xhtml\+xml|application\/json)/i.test(kind))throw Error("The URL does not return a supported job page.");
   const indicated=Number(r.headers.get("content-length")||0);
   if(indicated>MAX_BYTES)throw Error("This page is too large for automatic import.");
   const reader=r.body.getReader();
   const chunks=[];let count=0;
   while(true){
    const {done,value}=await reader.read();if(done)break;
    count+=value.byteLength;
    if(count>MAX_BYTES){await reader.cancel();throw Error("Job page exceeds the import size limit.");}
    chunks.push(value);
   }
   const bytes=new Uint8Array(count);
   let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length}
   return {body:new TextDecoder().decode(bytes),url:current.toString(),kind};
  }finally{clearTimeout(timeout)}
 }
 throw Error("Unable to read the job page.");
}
function extractFromHtml(html,sourceUrl){
 const ld=jsonLdJob(html)||{};
 const meta=metas(html);
 const h1=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"";
 const title=clean(decode(ld.title||meta["og:title"]||meta["twitter:title"]||textHtml(h1)||"")).replace(/\s+[|–-]\s+.*$/,"").slice(0,180);
 const company=companyFromLd(ld)||clean(meta["og:site_name"]||meta["application-name"]||"").slice(0,150);
 const description=safeText(ld.description||meta.description||meta["og:description"]||"",12000);
 const location=locationFromLd(ld);
 const industry=clean(ld.industry||"").slice(0,120);
 const salary=salaryLd(ld);
 const datePosted=String(ld.datePosted||"").slice(0,40);
 const found={title,company,location,industry,salary,description,datePosted};
 const fields=Object.entries(found).filter(([key,value])=>key!=="datePosted"&&value).map(([key])=>key);
 return {url:sourceUrl,...found,fields,method:Object.keys(ld).length?"JobPosting structured data":"Public page metadata",complete:Boolean(title&&company),needsReview:!title||!company};
}
function greenhouseRef(url){
 const u=new URL(url);
 if(!["job-boards.greenhouse.io","boards.greenhouse.io"].includes(u.hostname))return null;
 const p=u.pathname.split("/").filter(Boolean);
 const index=p.indexOf("jobs");
 if(index<1||!/^\d+$/.test(p[index+1]||""))return null;
 return {board:p[index-1],id:p[index+1]};
}
async function greenhouseData(url){
 const ref=greenhouseRef(url);if(!ref)return null;
 const api="https://boards-api.greenhouse.io/v1/boards/"+encodeURIComponent(ref.board)+"/jobs/"+ref.id;
 const page=await fetchPage(api);
 const item=JSON.parse(page.body);
 const boardLabel=ref.board.replace(/[-_]+/g," ").replace(/\b\w/g,c=>c.toUpperCase());
 const result={url:item.absolute_url||url,title:clean(item.title),company:clean(item.company?.name||item.company_name||boardLabel),location:clean(item.location?.name),industry:"",
  salary:"",description:safeText(item.content),datePosted:String(item.updated_at||"").slice(0,40)};
 result.fields=Object.entries(result).filter(([k,v])=>v&&k!=="url"&&k!=="datePosted").map(([k])=>k);
 return {...result,method:"Greenhouse public job API",complete:!!result.title,needsReview:true};
}
export {extractFromHtml,sanitizeUrl,greenhouseRef};
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("Vary","Origin");
 const origin=req.headers?.origin||"";
 const permittedOrigins=new Set(["https://se7en2606.github.io", "https://job-radar-murex-eight.vercel.app"]);
 const sameOrigin=req.headers?.host&&(origin==="https://"+req.headers.host||origin==="http://"+req.headers.host);
 if(origin&&(!permittedOrigins.has(origin)&&!sameOrigin))return res.status(403).json({error:"Origin not allowed."});
 if(origin){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type");}
 if(req.method==="OPTIONS")return res.status(204).end();
 if(req.method!=="POST")return res.status(405).json({error:"POST required."});
 try{
  const url=sanitizeUrl(req.body?.url);
  let result;
  try{result=await greenhouseData(url.toString())}catch(e){if(greenhouseRef(url.toString()))throw e}
  if(!result){
   const page=await fetchPage(url.toString());
   result=page.kind.includes("application/json")?extractFromHtml(page.body,page.url):extractFromHtml(page.body,page.url);
  }
  if(!result.title&&!result.company&&!result.description) return res.status(422).json({error:"No readable job details found. The site may require login or JavaScript rendering."});
  return res.status(200).json({ok:true,...result,verificationStatus:"unverified"});
 }catch(e){
  const message=String(e.message||"Unable to import job.");
  return res.status(/Only HTTPS|hostname|credentials|custom ports|too long/.test(message)?400:422).json({error:message.slice(0,250)});
 }
}
