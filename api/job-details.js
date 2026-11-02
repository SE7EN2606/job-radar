const OWNER="SE7EN2606";
const REPO="job-radar";

function decodeHtml(s=""){
  return String(s)
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&#39;/g,"'")
    .replace(/&quot;/g,'"')
    .replace(/&#xA0;/gi," ")
    .replace(/&#x20;/gi," ");
}

function stripHtml(s=""){
  return decodeHtml(s)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/(p|li|div|h1|h2|h3|h4|h5|h6|section|label)>/gi,"\n")
    .replace(/<li[^>]*>/gi,"• ")
    .replace(/<[^>]+>/g," ")
    .replace(/[ \t]+/g," ")
    .replace(/\n\s*\n+/g,"\n")
    .trim();
}

function parseJsonLd(html){
  const blocks=[...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for(const m of blocks){
    try{
      const raw=JSON.parse(m[1].trim());
      const items=Array.isArray(raw)?raw:(raw?.["@graph"]||[raw]);
      const job=items.find(x=>x && (x["@type"]==="JobPosting" || (Array.isArray(x["@type"])&&x["@type"].includes("JobPosting"))));
      if(job) return job;
    }catch{}
  }
  return null;
}

function greenhouseRef(url){
  try{
    const u=new URL(url);
    if(!["job-boards.greenhouse.io","boards.greenhouse.io"].includes(u.hostname)) return null;
    const parts=u.pathname.split("/").filter(Boolean);
    const jobsIndex=parts.indexOf("jobs");
    if(jobsIndex<1 || !/^\d+$/.test(parts[jobsIndex+1]||"")) return null;
    return {board:parts[jobsIndex-1],jobId:parts[jobsIndex+1]};
  }catch{return null}
}

function linesFromHtml(html){
  return stripHtml(html).split("\n").map(x=>x.trim()).filter(Boolean);
}

function extractSection(lines,startPatterns,endPatterns){
  const start=lines.findIndex(line=>startPatterns.some(r=>r.test(line)));
  if(start<0) return [];
  let end=lines.length;
  for(let i=start+1;i<lines.length;i++){
    if(endPatterns.some(r=>r.test(lines[i]))){end=i;break}
  }
  return lines.slice(start+1,end)
    .map(x=>x.replace(/^•\s*/,"").trim())
    .filter(x=>x && x.length>2);
}

function normalizeQuestion(q){
  const label=stripHtml(q?.label||q?.name||"").replace(/\*$/,"").trim();
  const fields=Array.isArray(q?.fields)?q.fields:[];
  const type=fields[0]?.type||q?.type||"text";
  const required=Boolean(q?.required || fields.some(f=>f?.required));
  return {label,type,required};
}

async function loadKnownJob(id){
  const url=`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/data/careerops-jobs.json?ts=${Date.now()}`;
  const r=await fetch(url,{headers:{"User-Agent":"job-radar-vercel"}});
  if(!r.ok) return null;
  const data=await r.json();
  return (data.jobs||[]).find(j=>j.id===id)||null;
}

async function readGreenhouse(url,job){
  const ref=greenhouseRef(url);
  if(!ref) return null;
  const api=`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ref.board)}/jobs/${encodeURIComponent(ref.jobId)}?questions=true`;
  const r=await fetch(api,{headers:{"User-Agent":"job-radar-vercel","Accept":"application/json"}});
  if(!r.ok) return null;
  const data=await r.json();
  const lines=linesFromHtml(data.content||"");
  const responsibilities=extractSection(
    lines,
    [/^what you.?ll do/i,/^what you will do/i,/^responsibilities/i,/^your mission/i],
    [/^what you.?ll bring/i,/^what you bring/i,/^requirements/i,/^qualifications/i,/^what you.?ll get/i,/^benefits/i]
  );
  const requirements=extractSection(
    lines,
    [/^what you.?ll bring/i,/^what you bring/i,/^requirements/i,/^qualifications/i,/^about you/i],
    [/^what you.?ll get/i,/^benefits/i,/^about /i,/^commitment /i,/^equal opportunity/i]
  );

  const questions=[
    ...(Array.isArray(data.questions)?data.questions.map(normalizeQuestion):[]),
    ...(Array.isArray(data.demographic_questions)?data.demographic_questions.map(normalizeQuestion):[])
  ].filter(q=>q.label);

  const salaryText=lines.find(x=>/€\s*\d|\d[\d.,]*\s*[-–]\s*€?\s*\d|hiring range/i.test(x))||"";
  return {
    id:job.id,
    url:data.absolute_url||url,
    source:"Greenhouse",
    title:data.title||job.title,
    location:data.location?.name||job.location||"",
    datePosted:data.updated_at||job.datePosted||"",
    validThrough:"",
    description:stripHtml(data.content||"").slice(0,24000),
    responsibilities,
    requirements,
    questions,
    salaryText
  };
}

export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  const id=String(req.query.id||"");
  if(!id) return res.status(400).json({error:"Missing job id"});

  try{
    const job=await loadKnownJob(id);
    if(!job) return res.status(404).json({error:"Job not found in current Career Ops results"});
    const url=job.applyUrl||job.sourceUrl;
    if(!/^https:\/\//i.test(url)) return res.status(400).json({error:"Invalid job URL"});

    const greenhouse=await readGreenhouse(url,job);
    if(greenhouse) return res.status(200).json(greenhouse);

    const response=await fetch(url,{
      redirect:"follow",
      headers:{
        "User-Agent":"Mozilla/5.0 (compatible; JobRadar/1.0; +https://job-radar-murex-eight.vercel.app/)",
        "Accept":"text/html,application/xhtml+xml"
      }
    });
    if(!response.ok) return res.status(502).json({error:`Job page returned HTTP ${response.status}`});
    const html=await response.text();
    const ld=parseJsonLd(html);
    const description=ld?.description ? stripHtml(String(ld.description)) : stripHtml(html).slice(0,24000);
    const lines=description.split("\n").map(x=>x.trim()).filter(Boolean);

    return res.status(200).json({
      id,
      url:response.url||url,
      source:job.provider||job.source||"Career site",
      title:ld?.title||job.title,
      location:ld?.jobLocation?.address?.addressLocality||job.location||"",
      datePosted:ld?.datePosted||job.datePosted||"",
      validThrough:ld?.validThrough||"",
      description:description.slice(0,24000),
      responsibilities:extractSection(lines,[/^what you.?ll do/i,/^responsibilities/i],[/^what you.?ll bring/i,/^requirements/i,/^qualifications/i]),
      requirements:extractSection(lines,[/^what you.?ll bring/i,/^requirements/i,/^qualifications/i],[/^benefits/i,/^about /i]),
      questions:[]
    });
  }catch(error){
    return res.status(500).json({error:"Unable to read job posting",details:String(error?.message||error)});
  }
}
