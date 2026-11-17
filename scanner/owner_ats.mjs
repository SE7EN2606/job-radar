#!/usr/bin/env node
/**
 * Owner-only fresh SaaS / IT sales discovery from public employer job-board APIs.
 *
 * NO JobSpy, LinkedIn scraping, credentials, search-result scraping, or
 * fabricated vacancy dates. Source boards are checked on every run.
 * Clément and profile-specific scans are not touched.
 *
 * Source board APIs are intended for displaying those employers' public posts.
 * Before commercial resale or large-scale redistribution, review board terms.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const BOARDS = [
  {provider:'greenhouse',board:'grafanalabs',company:'Grafana Labs',industry:'Observability / Developer tools'},
  {provider:'greenhouse',board:'gitlab',company:'GitLab',industry:'DevSecOps / Developer tools'},
  {provider:'greenhouse',board:'algolia',company:'Algolia',industry:'Search / AI SaaS'},
  {provider:'greenhouse',board:'vercel',company:'Vercel',industry:'Cloud / Developer platform'},
  {provider:'greenhouse',board:'staffbase',company:'Staffbase',industry:'Employee communications SaaS'},
  {provider:'greenhouse',board:'boomilp',company:'Boomi',industry:'Integration / iPaaS'},
  {provider:'greenhouse',board:'conga',company:'Conga',industry:'Revenue operations SaaS'},
  {provider:'greenhouse',board:'zscaler',company:'Zscaler',industry:'Cybersecurity / Cloud'},
  {provider:'ashby',board:'ashby',company:'Ashby',industry:'HR SaaS'},
  {provider:'ashby',board:'deel',company:'Deel',industry:'HR / IT / Global payroll SaaS'},
  {provider:'ashby',board:'n8n',company:'n8n',industry:'Automation / Developer tools'},
  {provider:'ashby',board:'sardine',company:'Sardine',industry:'Fraud / Fintech SaaS'},
  {provider:'ashby',board:'sphere',company:'Sphere',industry:'Payments / Fintech SaaS'},
  {provider:'ashby',board:'chatbase',company:'Chatbase',industry:'AI / Customer service SaaS'},
  {provider:'ashby',board:'opsmill',company:'OpsMill',industry:'IT automation / Network infrastructure'},
  {provider:'ashby',board:'fullenrich',company:'FullEnrich',industry:'Sales intelligence SaaS'},
  {provider:'ashby',board:'gitbook',company:'GitBook',industry:'Developer documentation SaaS'},
  {provider:'ashby',board:'hightouch-inc',company:'Hightouch',industry:'Data / Marketing SaaS'},
  {provider:'ashby',board:'elicit',company:'Elicit',industry:'AI / Research software'},
  {provider:'ashby',board:'omnea',company:'Omnea',industry:'Procurement SaaS'},
  {provider:'ashby',board:'synthesia',company:'Synthesia',industry:'AI / Video SaaS'},
  {provider:'ashby',board:'molecule-software',company:'Molecule Software',industry:'Energy trading software'},
  {provider:'greenhouse',board:'chainguard',company:'Chainguard',industry:'Software supply-chain security'},
  {provider:'greenhouse',board:'tenon',company:'Tenon',industry:'Enterprise SaaS'},
  {provider:'greenhouse',board:'amplemarket',company:'Amplemarket',industry:'B2B sales SaaS'},
  {provider:'greenhouse',board:'pulumicorporation',company:'Pulumi',industry:'Cloud infrastructure / DevOps'}
];

/** Avoid BDR, SDR, junior and marketing / engineering roles. */
export function titleMatch(raw) {
 const title=String(raw||'').toLowerCase();
 if(/(?:\b(?:bdr|sdr)\b|sales development rep|business development representative|internship|intern\b|working student|junior\b|graduate|apprentice|trainee|talent community|join our talent)/i.test(title))return false;
 return /\b(?:account executive|account manager|account director|account management|key accounts?|strategic accounts?|sales executive|enterprise sales|commercial sales|sales director|sales manager|commercial director|commercial manager|sales lead|sales specialist|sales engineer|solutions? sales|business solutions manager|business development manager|business development director|regional sales|territory sales|customer success manager|customer success director|customer success lead|client partner|partner manager|partnerships manager|channel account|channel sales|alliances manager|revenue director|head of sales|sales leader|renewals? manager|customer growth|account growth|responsable grands comptes|directeur commercial|directeur de clientèle|directeur des ventes|ingénieur commercial|ing[eé]nieur d'affaires|commercial grands comptes)\b/i.test(title);
}
const ELIGIBLE_LOCAL=/\b(france|paris|lyon|bordeaux|toulouse|nantes|lille|rennes|montpellier|estonia|tallinn|tartu|sweden|stockholm|gothenburg|göteborg|malmo|malmö|switzerland|z[uü]rich|geneva|lausanne|milan|milano|turin|torino|bologna|verona|venice|venezia|prague|praha|czechia|czech republic|slovenia|ljubljana|warsaw|warszawa|portugal|lisbon|lisboa|porto|luxembourg|monaco)\b/i;
const EUROPE=/\b(europe|european|eu(?:[- /,]|$)|emea|eea|western europe|northern europe|central europe|pan.european|anywhere in europe|europe-wide)\b/i;
const FOREIGN_REGION=/\b(united states|usa\b|u\.s\.\b|united kingdom|uk\b|london|india|japan|canada|brazil|australia|singapore|mexico|argentina|philippines|south africa|united arab emirates|dubai|uae\b|south korea|egypt)\b/i;
const EUROPE_COUNTRY=/\b(germany|deutschland|austria|spain|netherlands|belgium|ireland|italy|poland|denmark|norway|finland|slovakia|romania|hungary|croatia|latvia|lithuania|bulgaria|greece|czechia|cyprus|malta)\b/i;
const REMOTE=/\b(remote|fully remote|work from home|home.?office|anywhere|distributed|t[eé]l[eé]travail)\b/i;
/** Prefer Europe-wide and eligible-local roles. Germany-only remote is discoverable but not assumed eligible from Estonia. */
export function locationClass(location, title='', isRemote=false){
 const loc=String(location||'');
 const remote=Boolean(isRemote)||REMOTE.test(loc)||REMOTE.test(String(title||''));
 const panEurope=EUROPE.test(loc);
 if(remote&&panEurope)return {include:true,code:'europe-remote',bonus:15,warning:'Verify eligible employment countries; Europe/EMEA wording is not a guarantee.'};
 if(ELIGIBLE_LOCAL.test(loc))return {include:true,code:remote?'eligible-country-remote':'eligible-office',bonus:remote?13:8,warning:remote?'Remote work may still be restricted to the named country.':''};
 if(remote&&EUROPE_COUNTRY.test(loc))return {include:true,code:'country-limited-remote',bonus:3,warning:'Country-specific remote role; eligibility from Estonia/France is unconfirmed.'};
 if(remote&&!FOREIGN_REGION.test(loc))return {include:true,code:'remote-location-unclear',bonus:1,warning:'Remote hiring territory is unclear. Verify countries and right to work.'};
 return {include:false,code:'out-of-area',bonus:0,warning:''};
}
const stripHtml=html=>String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')
 .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
function validDate(value){
 if(!value)return '';
 const d=new Date(value);
 return Number.isFinite(d.getTime())?d.toISOString():'';
}
function uniqueId(url){return 'ownerats-'+crypto.createHash('sha1').update(url).digest('hex').slice(0,20)}
function score(title,place){
 let n=60;
 const t=title.toLowerCase();
 if(/enterprise|strategic|global|key account|major account/.test(t))n+=17;
 if(/account manager|account director|renewal|expansion|customer growth/.test(t))n+=12;
 if(/account executive|sales executive|sales director|sales manager/.test(t))n+=9;
 if(/customer success|partner|alliances|channel/.test(t))n+=4;
 if(/smb|small business|entry level/.test(t))n-=14;
 if(/dach|german speaking|german-speaking|dutch speaking|spanish speaking/.test(t))n-=12; // Languages need review.
 return Math.max(40,Math.min(94,n+place.bonus));
}
export function normalizeJob(raw,source,previous,now){
 const title=String(raw.title||'').trim();
 const url=String(raw.url||'').trim();
 if(!titleMatch(title)||!/^https:\/\//i.test(url))return null;
 const place=locationClass(raw.location,title,raw.isRemote);
 if(!place.include)return null;
 const firstSeen=previous?.firstSeenAt||now;
 const datePosted=validDate(raw.publishedAt);
 const updatedAt=validDate(raw.updatedAt);
 const fit=score(title,place);
 const flags=[place.warning];
 if(/\bdach\b|german[- ]speaking|deutsch/.test(title.toLowerCase()))flags.push('German-language/DACH requirement may apply.');
 if(/\b(dutch|spanish|italian|polish)[- ]speaking\b/i.test(title))flags.push('Check language requirement.');
 const industry=source.industry||'Technology / SaaS';
 const company=source.company;
 return {
  id:uniqueId(url),company,title,location:String(raw.location||'Remote — hiring countries unspecified'),
  industry,fit,domainFit:fit,scoreBasis:'Title, sector and approximate location; NOT CV verification',
  hunter:'Unknown',salary:raw.salary||'Undisclosed',rating:'—',
  status:'Public job board listing · eligibility unverified',statusTone:'warn',
  verificationStatus:'listed-at-source',type:'scanned ae it-sales'+(place.code.includes('remote')?' remote':''),
  rec:'REVIEW',pros:['Published on employer job board','IT / SaaS employer'],
  cons:flags.filter(Boolean),diff:'Confirm hard requirements and permitted countries before tailoring CV.',
  cover:'Not generated.',source:'owner-public-ats',provider:source.provider,sourceDisplay:'Employer ATS · '+source.provider,
  foundVia:source.company+' careers',sourceUrl:url,applyUrl:url,
  companyUrl:source.provider==='greenhouse'?'https://job-boards.greenhouse.io/'+source.board:'https://jobs.ashbyhq.com/'+source.board,
  description:String(raw.description||'').slice(0,9500),
  datePosted,updatedAt,firstSeenAt:firstSeen,lastSeenAt:now,
  addedAt:firstSeen,sourceBoard:source.board,locationCategory:place.code,
  locationEligibility:place.warning,verifiedLive:false
 };
}
function endpoint(s){
 return s.provider==='greenhouse'?'https://boards-api.greenhouse.io/v1/boards/'+encodeURIComponent(s.board)+'/jobs?content=true':
 'https://api.ashbyhq.com/posting-api/job-board/'+encodeURIComponent(s.board)+'?includeCompensation=true';
}
async function getJSON(url){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),12500);
 try{
  const r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'JobRadar/1.0 (public employer careers feed)','Accept':'application/json'}});
  if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();
  if(!data||typeof data!=='object')throw Error('Invalid JSON response');
  return data;
 }finally{clearTimeout(timer)}
}
export function parseBoardPayload(source,data){
 if(source.provider==='greenhouse'){
  if(!Array.isArray(data.jobs))throw Error('No jobs array');
  return data.jobs.map(j=>({
   title:j.title,location:j.location?.name||'',url:j.absolute_url,
   description:stripHtml(j.content),
   // Greenhouse updated_at is NOT a first-posted date, so do not assign as posted.
   publishedAt:j.first_published||j.first_published_at||'',
   updatedAt:j.updated_at||'',isRemote:/remote/i.test(j.location?.name||'')
  }));
 }
 if(!Array.isArray(data.jobs))throw Error('No jobs array');
 return data.jobs.filter(j=>j.isListed!==false).map(j=>({
  title:j.title,location:j.location||j.primaryLocation?.name||'',
  url:j.jobUrl||j.applyUrl||'',description:stripHtml(j.descriptionHtml||j.descriptionPlain||''),
  publishedAt:j.publishedDate||j.publishedAt||'',updatedAt:j.updatedAt||'',
  isRemote:j.isRemote===true||j.workplaceType==='Remote',
  salary:(j.compensation?.compensationTierSummary||j.compensation?.scrapeableCompensationSalarySummary||'')
 }));
}
function previousByUrl(content){
 const map=new Map();
 for(const j of content?.jobs||[])if(j.applyUrl)map.set(j.applyUrl,j);
 return map;
}
export async function scanOwner({sources=BOARDS,fetcher=getJSON,now=new Date().toISOString(),previous={jobs:[]}}={}){
 const prev=previousByUrl(previous),found=new Map(),errors=[],sourcesSucceeded=[];
 let cursor=0;const workers=Array.from({length:4},async()=>{
  while(cursor<sources.length){
   const source=sources[cursor++];
   try{
    const rows=parseBoardPayload(source,await fetcher(endpoint(source)));
    sourcesSucceeded.push({company:source.company,provider:source.provider,total:rows.length});
    for(const raw of rows){
     const p=normalizeJob(raw,source,prev.get(raw.url),now);
     if(p)found.set(p.applyUrl,p);
    }
   }catch(err){errors.push({company:source.company,provider:source.provider,error:String(err.message||err).slice(0,120)})}
  }
 });
 await Promise.all(workers);
 if(sourcesSucceeded.length===0)throw Error('All employer job-board sources failed; previous snapshot preserved');
 // Do not silently drop jobs when their source has an API outage; preserve them
 // temporarily but never mark these as currently open.
 const succeeded=new Set(sourcesSucceeded.map(x=>x.company));
 for(const old of previous.jobs||[]){
  if(succeeded.has(old.company)||found.has(old.applyUrl))continue;
  if(!old.lastSeenAt||Date.parse(now)-Date.parse(old.lastSeenAt)>7*86400000)continue;
  found.set(old.applyUrl,{...old,verificationStatus:'not-rechecked',status:'Source temporarily unavailable · recheck required',statusTone:'warn'});
 }
 const jobs=[...found.values()].sort((a,b)=>
  Date.parse(b.firstSeenAt||0)-Date.parse(a.firstSeenAt||0)||b.fit-a.fit);
 const previousIds=new Set((previous.jobs||[]).map(x=>x.id));
 return {
  generatedAt:now,source:'owner-public-ats',strategy:'owner-ats-fresh-v1',
  count:jobs.length,newCount:jobs.filter(x=>!previousIds.has(x.id)).length,
  sourcesChecked:sources.length,sourcesSucceeded:sourcesSucceeded.length,
  sourceStats:sourcesSucceeded,errors,jobs
 };
}
async function main(){
 const target='data/owner-ats-jobs.json';
 let previous={jobs:[]};try{previous=JSON.parse(fs.readFileSync(target,'utf-8'))}catch{}
 const output=await scanOwner({previous});
 if(output.count===0&&Array.isArray(previous.jobs)&&previous.jobs.length)throw Error('Scan produced zero jobs unexpectedly; existing snapshot preserved');
 fs.mkdirSync('data',{recursive:true});
 fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n','utf-8');
 console.log('Owner IT sales: '+output.count+' listed roles, '+output.newCount+' newly discovered; '+output.sourcesSucceeded+'/'+output.sourcesChecked+' sources responded. Errors: '+output.errors.length);
 for(const x of output.errors)console.warn('SOURCE ERROR',x.company,x.error);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(e=>{console.error(e);process.exitCode=1});
}
