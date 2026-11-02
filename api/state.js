const OWNER="SE7EN2606";
const REPO="job-radar";
const PATH="data/user-state.json";

function headers(token){
  return {
    Accept:"application/vnd.github+json",
    Authorization:`Bearer ${token}`,
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"job-radar-vercel"
  };
}

async function readState(token){
  const r=await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}?ref=main`,{headers:headers(token)});
  if(!r.ok) throw new Error("Unable to read state");
  const data=await r.json();
  const content=Buffer.from(data.content,"base64").toString("utf8");
  return {state:JSON.parse(content),sha:data.sha};
}

export default async function handler(req,res){
  const token=process.env.GITHUB_TOKEN;
  if(!token) return res.status(500).json({error:"GITHUB_TOKEN is not configured in Vercel."});

  try{
    if(req.method==="GET"){
      const {state}=await readState(token);
      return res.status(200).json(state);
    }

    if(req.method!=="POST"){
      res.setHeader("Allow","GET, POST");
      return res.status(405).json({error:"Method not allowed"});
    }

    const {action,id}=req.body||{};
    if(!["hide","unhide","applied","unapply"].includes(action)||!id){
      return res.status(400).json({error:"Invalid state action"});
    }

    const {state,sha}=await readState(token);
    state.hidden=Array.isArray(state.hidden)?state.hidden:[];
    state.applied=Array.isArray(state.applied)?state.applied:[];

    const add=(arr,v)=>{if(!arr.includes(v)) arr.push(v)};
    const remove=(arr,v)=>arr.filter(x=>x!==v);

    if(action==="hide"){
      add(state.hidden,id);
      state.applied=remove(state.applied,id);
    }else if(action==="unhide"){
      state.hidden=remove(state.hidden,id);
    }else if(action==="applied"){
      add(state.applied,id);
      state.hidden=remove(state.hidden,id);
    }else if(action==="unapply"){
      state.applied=remove(state.applied,id);
    }

    state.updatedAt=new Date().toISOString();
    const encoded=Buffer.from(JSON.stringify(state,null,2)+"\n","utf8").toString("base64");
    const put=await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`,{
      method:"PUT",
      headers:{...headers(token),"Content-Type":"application/json"},
      body:JSON.stringify({
        message:`Update job state: ${action} ${id}`,
        content:encoded,
        sha,
        branch:"main"
      })
    });

    if(!put.ok){
      const body=await put.text();
      const needsContentsWrite = put.status===403 || put.status===404;
      return res.status(put.status).json({
        error: needsContentsWrite
          ? "GitHub token cannot write Job Radar state. Add Contents: Read and write permission to the fine-grained token used by Vercel."
          : "Unable to persist state",
        details: body.slice(0,800)
      });
    }
    return res.status(200).json(state);
  }catch(error){
    return res.status(500).json({error:"State update failed",details:String(error?.message||error)});
  }
}
