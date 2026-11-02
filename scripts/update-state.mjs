import fs from 'node:fs';

const p='data/user-state.json';
let state={hidden:[],applied:[],updatedAt:null};
try { state={...state,...JSON.parse(fs.readFileSync(p,'utf8'))}; } catch {}

const action=process.env.ACTION_NAME;
const id=process.env.JOB_ID;
const add=(arr,v)=>arr.includes(v)?arr:[...arr,v];
const remove=(arr,v)=>arr.filter(x=>x!==v);

if(action==='hide'){state.hidden=add(state.hidden,id);state.applied=remove(state.applied,id);}
else if(action==='unhide'){state.hidden=remove(state.hidden,id);}
else if(action==='applied'){state.applied=add(state.applied,id);state.hidden=remove(state.hidden,id);}
else if(action==='unapply'){state.applied=remove(state.applied,id);}
else { throw new Error('Invalid action'); }

state.updatedAt=new Date().toISOString();
fs.writeFileSync(p,JSON.stringify(state,null,2)+'\n');
