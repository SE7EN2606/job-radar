import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const cols=['url','first_seen','portal','title','company','status','location','fingerprint','posted_at','trust_score','trust_flags','normalized_company','requisition_id','language','listing_key'];
function row(data){return cols.map(k=>data[k]||'').join('\t')}
test('Career Ops export includes Germany remote, rejects Berlin office and differentiates first seen from posting date',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'job-radar-export-'));
 try{
  fs.mkdirSync(path.join(tmp,'data'),{recursive:true});
  const rows=[
   {url:'https://example.com/remote-de',first_seen:'2026-11-17',portal:'ats',
    title:'Enterprise Account Executive',company:'Example Tech',status:'added',location:'Germany (Remote)',posted_at:''},
   {url:'https://example.com/office-de',first_seen:'2026-11-17',portal:'ats',
    title:'Enterprise Account Executive',company:'Example Tech',status:'added',location:'Berlin, Germany',posted_at:''},
   {url:'https://example.com/eu',first_seen:'2026-11-17',portal:'ats',
    title:'Strategic Account Manager',company:'Example Tech',status:'added',location:'Remote Europe',posted_at:'2026-11-16'}
  ];
  fs.writeFileSync(path.join(tmp,'data','scan-history.tsv'),cols.join('\t')+'\n'+rows.map(row).join('\n')+'\n');
  const output=path.join(tmp,'output.json');
  const res=spawnSync(process.execPath,['careerops/export.mjs',tmp,output],{encoding:'utf-8'});
  assert.equal(res.status,0,res.stderr);
  const d=JSON.parse(fs.readFileSync(output,'utf-8'));
  assert.equal(d.count,2);
  const de=d.jobs.find(x=>x.location==='Germany (Remote)');
  assert.ok(de);
  assert.equal(de.verificationStatus,'unverified');
  assert.equal(de.datePosted,'');
  assert.equal(de.firstSeenAt,'2026-11-17');
  assert.ok(de.fit>=40);
  const eu=d.jobs.find(x=>x.location==='Remote Europe');
  assert.equal(eu.datePosted,'2026-11-16');
  assert.equal(eu.firstSeenAt,'2026-11-17');
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
