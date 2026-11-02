const OWNER="SE7EN2606";
const REPO="job-radar";
const WORKFLOW="update-job-state.yml";

async function readState(){
  const r=await fetch(`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/data/user-state.json?ts=${Date.now()}`,{cache:"no-store"});
  if(!r.ok) return {hidden:[],applied:[],updatedAt:null};
  return r.json();
}

export default async function handler(req,res){
  if(req.method==="GET"){
    return res.status(200).json(await readState());
  }
  if(req.method!=="POST"){
    res.setHeader("Allow","GET, POST");
    return res.status(405).json({error:"Method not allowed"});
  }

  const token=process.env.GITHUB_TOKEN;
  if(!token) return res.status(500).json({error:"GITHUB_TOKEN is not configured in Vercel."});

  const {action,id}=req.body||{};
  if(!["hide","unhide","applied","unapply"].includes(action)||!id){
    return res.status(400).json({error:"Invalid state action"});
  }

  const headers={
    Accept:"application/vnd.github+json",
    Authorization:`Bearer ${token}`,
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"job-radar-vercel",
    "Content-Type":"application/json"
  };

  try{
    const response=await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method:"POST",
        headers,
        body:JSON.stringify({
          ref:"main",
          inputs:{action,id:String(id)}
        })
      }
    );

    if(!response.ok){
      const body=await response.text();
      return res.status(response.status).json({
        error:"GitHub rejected the state update workflow.",
        details:body.slice(0,1000)
      });
    }

    // Optimistic response so the UI moves immediately. The Action persists it
    // a few seconds later and future scans read the repository-backed state.
    const state=await readState();
    state.hidden=Array.isArray(state.hidden)?state.hidden:[];
    state.applied=Array.isArray(state.applied)?state.applied:[];

    const add=(arr,v)=>{if(!arr.includes(v))arr.push(v)};
    const remove=(arr,v)=>arr.filter(x=>x!==v);

    if(action==="hide"){add(state.hidden,id);state.applied=remove(state.applied,id)}
    if(action==="unhide"){state.hidden=remove(state.hidden,id)}
    if(action==="applied"){add(state.applied,id);state.hidden=remove(state.hidden,id)}
    if(action==="unapply"){state.applied=remove(state.applied,id)}

    state.updatedAt=new Date().toISOString();
    return res.status(202).json(state);
  }catch(error){
    return res.status(500).json({error:"State update failed",details:String(error?.message||error)});
  }
}
