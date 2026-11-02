const OWNER="SE7EN2606";
const REPO="job-radar";

function stripHtml(s=""){
  return s
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/p>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&#39;/g,"'")
    .replace(/&quot;/g,'"')
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

async function loadKnownJob(id){
  const url=`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/data/careerops-jobs.json?ts=${Date.now()}`;
  const r=await fetch(url,{headers:{"User-Agent":"job-radar-vercel"}});
  if(!r.ok) return null;
  const data=await r.json();
  return (data.jobs||[]).find(j=>j.id===id)||null;
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

    const description=ld?.description ? stripHtml(String(ld.description)) : stripHtml(html).slice(0,18000);
    const datePosted=ld?.datePosted||job.datePosted||"";
    const validThrough=ld?.validThrough||"";

    return res.status(200).json({
      id,
      url:response.url||url,
      title:ld?.title||job.title,
      datePosted,
      validThrough,
      description:description.slice(0,18000)
    });
  }catch(error){
    return res.status(500).json({error:"Unable to read job posting",details:String(error?.message||error)});
  }
}
