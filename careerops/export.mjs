#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.argv[2] || 'careerops-data';
const historyPath = path.join(root, 'data', 'scan-history.tsv');
const outputPath = process.argv[3] || 'data/careerops-jobs.json';
const statePath = 'data/user-state.json';

const COLS = [
  'url','first_seen','portal','title','company','status','location','fingerprint',
  'posted_at','trust_score','trust_flags','normalized_company','requisition_id',
  'language','listing_key'
];

function readState(){
  try { return JSON.parse(fs.readFileSync(statePath,'utf8')); }
  catch { return {hidden:[],applied:[]}; }
}
function parseLine(line){
  const cells=line.split('\t');
  return Object.fromEntries(COLS.map((c,i)=>[c,cells[i]||'']));
}
function idFor(row){
  return 'careerops-'+crypto.createHash('sha1').update(row.url || [row.company,row.title,row.location].join('|')).digest('hex').slice(0,20);
}
function domain(url){
  try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}
}
function typeFor(title,location){
  const t=(title||'').toLowerCase();
  const types=['careerops','scanned'];
  if(/account manager|customer success|expansion|account director|key account|grands comptes|clientèle|renewal|partner manager|channel account/.test(t)) types.push('growth');
  if(/account executive|sales executive|sales director|sales manager|business development manager|solutions sales/.test(t)) types.push('ae');
  if(/remote|home.?office|télétravail|teletravail/i.test(location||'')) types.push('remote');
  return types.join(' ');
}
function allowedLocation(location){
  const l=String(location||'').toLowerCase().trim();
  if(!l)return false;
  // Germany and other European countries are eligible for DISCOVERY when
  // explicitly marked remote; the right to work from Estonia is not implied.
  const remote=/remote|home.?office|t[eé]l[eé]travail/.test(l);
  const europe=/germany|deutschland|france|estonia|sweden|switzerland|italy|poland|portugal|slovenia|czechia|europe|european|emea|netherlands|belgium|spain|austria|denmark|finland|norway|luxembourg|romania|hungary|croatia|latvia|lithuania|bulgaria|greece/.test(l);
  const outside=/united states|usa|united kingdom|london|india|australia|singapore|brazil|canada|japan|south korea|mexico|uae|united arab emirates/.test(l);
  if(remote&&europe&&!outside)return true;

  // Explicitly eligible countries/cities. Italy is north-only; Czech=Prague only; Poland=Warsaw only.
  const allowed=[
    'france','paris','lyon','montpellier','toulouse','bordeaux','lille','nantes','nice',
    'estonia','tallinn',
    'sweden','stockholm','gothenburg','malmö','malmo',
    'switzerland','zurich','zürich','geneva','lausanne','romandy',
    'milan','milano','turin','torino','bologna','verona','venice','venezia',
    'prague','praha',
    'slovenia','ljubljana',
    'warsaw','warszawa',
    'portugal','lisbon','lisboa','porto',
    'luxembourg','monaco',
    'remote europe','europe remote','remote - europe','remote, europe','eu remote','remote eu','emea remote','remote emea'
  ];
  return allowed.some(x=>l.includes(x));
}

function score(title, location){
  const s=(title+' '+location).toLowerCase();
  let domainFit=60;
  if(/strategic/.test(s)) domainFit+=10;
  if(/enterprise/.test(s)) domainFit+=10;
  if(/account manager|key account|grands comptes|account director|customer success/.test(s)) domainFit+=14;
  if(/expansion|renewal|retention/.test(s)) domainFit+=8;
  if(/account executive/.test(s)) domainFit+=4;
  domainFit=Math.min(99,domainFit);

  let practical=domainFit;
  const l=String(location||'').toLowerCase();
  const remote=/remote|home.?office|t[eé]l[eé]travail/.test(l);
  const blocked=['united kingdom','london','germany','austria','spain','netherlands','belgium','ireland','malta','cyprus','denmark','norway','finland','slovakia'];
  if(!remote&&blocked.some(x=>l.includes(x)))practical=Math.min(practical,45);
  if(remote&&blocked.some(x=>l.includes(x)))practical=Math.min(practical,66); // Country-remote, eligibility unknown
  return {practical,domainFit};
}

if(!fs.existsSync(historyPath)){
  fs.mkdirSync(path.dirname(outputPath),{recursive:true});
  fs.writeFileSync(outputPath,JSON.stringify({generatedAt:new Date().toISOString(),source:'career-ops',count:0,jobs:[]},null,2)+'\n');
  process.exit(0);
}

const state=readState();
const hidden=new Set(state.hidden||[]);
const applied=new Set(state.applied||[]);
const lines=fs.readFileSync(historyPath,'utf8').split(/\r?\n/).filter(Boolean);
if(lines[0]?.startsWith('url\t')) lines.shift();

const byUrl=new Map();
for(const line of lines){
  const row=parseLine(line);
  if(!/^https?:\/\//.test(row.url)||!row.title||!row.company) continue;
  // Keep records that Career Ops accepted into its pipeline, plus previously
  // seen live records. Drop explicit filter/expired statuses.
  if(/filtered|expired|closed|blacklist/i.test(row.status||''))continue;
  const when=Date.parse(row.posted_at||row.first_seen||'');
  if(Number.isFinite(when)&&Date.now()-when>45*86400000)continue;
  byUrl.set(row.url,row);
}

const jobs=[];
for(const row of byUrl.values()){
  const id=idFor(row);
  if(hidden.has(id)) continue;
  if(!allowedLocation(row.location)) continue;
  const {practical,domainFit}=score(row.title,row.location);
  const isApplied=applied.has(id);
  jobs.push({
    id,
    company:row.company,
    title:row.title,
    fit:practical,
    domainFit,
    hunter:/account manager|customer success|renewal|retention|expansion/i.test(row.title)?'Low':'Medium',
    location:row.location||'Unspecified',
    salary:'Undisclosed',
    rating:'—',
    status:isApplied?'APPLIED':'Unverified vacancy',
    statusTone:isApplied?'info':'warn',
    type:typeFor(row.title,row.location)+(isApplied?' applied':''),
    rec:isApplied?'APPLIED':'INVESTIGATE',
    pros:['Direct ATS/company career source via Career Ops',row.portal?('Provider: '+row.portal):''],
    cons:['First-pass score; description-level evaluation follows after review'].filter(Boolean),
    diff:'Use the job description for controlled CV tailoring before applying.',
    cover:'Generate after job-description review.',
    source:'career-ops',
    sourceDisplay:row.portal ? ('Company ATS · '+row.portal) : 'Company career site',
    foundVia:row.portal ? ('Career Ops · '+row.portal) : 'Career Ops',
    provider:row.portal||'',
    sourceUrl:row.url,
    applyUrl:row.url,
    companyUrl:'https://'+domain(row.url),
    datePosted:row.posted_at||'',
    firstSeenAt:row.first_seen||'',
    description:'',
    verificationStatus:'unverified',
    locationEligibility:/remote/i.test(row.location||'')?'Check permitted countries; remote does not mean Estonia eligible':'Check work location and employment authorization',
    trustScore:row.trust_score||'',
    language:row.language||''
  });
}
jobs.sort((a,b)=>b.fit-a.fit||a.company.localeCompare(b.company));
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify({
  generatedAt:new Date().toISOString(),
  source:'career-ops',
  count:jobs.length,
  jobs
},null,2)+'\n');
console.log('Exported '+jobs.length+' Career Ops jobs to '+outputPath);
