import test from 'node:test';
import assert from 'node:assert/strict';
import {titleMatch,locationClass,normalizeJob,scanOwner,parseBoardPayload} from '../scanner/owner_ats.mjs';
const src={company:'Grafana Labs',board:'grafanalabs',provider:'greenhouse',industry:'IT / SaaS'};
test('broader IT/sales titles and exclusions',()=>{
 for(const t of ['Enterprise Account Executive','Senior Technical Account Manager','Strategic Account Director','Solutions Sales Specialist','Business Development Manager','Partner Manager','Customer Success Director','Sales Director']){
  assert.equal(titleMatch(t),true,t);
 }
 for(const t of ['Junior SDR','Business Development Representative','Senior Software Engineer','Marketing Manager','Join Our Talent Community: Enterprise Account Executive'])
  assert.equal(titleMatch(t),false,t);
});
test('Germany remote is discoverable but not assumed eligible',()=>{
 assert.equal(locationClass('Remote - Germany').include,true);
 assert.equal(locationClass('Remote - Germany').code,'country-limited-remote');
 assert.match(locationClass('Remote - Germany').warning,/ineligible|unconfirmed/i);
 assert.equal(locationClass('Berlin, Germany').include,false);
 assert.equal(locationClass('Remote — Europe').code,'europe-remote');
 assert.equal(locationClass('Remote, United States').include,false);
 assert.equal(locationClass('Tallinn, Estonia').include,true);
 assert.equal(locationClass('Paris, France').include,true);
 // Overseas-only and ambiguously remote jobs must be excluded even if
 // the title contains "Remote" or the listing mentions Europe too.
 for(const loc of ['Remote - United States','Remote - US','Remote - US only','Remote - India','Remote - Singapore','Remote - APAC','Remote - Japan','Remote - Asia','Remote - Global','Remote - Anywhere','Remote','Europe / United States','France / India','Germany / Asia','Remote - Canada','Remote - Hong Kong'])
  assert.equal(locationClass(loc,'Enterprise Account Executive',true).include,false,loc);
 assert.equal(locationClass('Remote - Switzerland').include,true);
 assert.equal(locationClass('Zurich, Switzerland').include,true);
 assert.equal(locationClass('Remote - EMEA').include,true);
 assert.equal(locationClass('Berlin, Germany').include,false);
});
test('GH update does not become fabricated posting date',()=>{
 const raw=parseBoardPayload(src,{jobs:[{title:'Enterprise Account Executive',absolute_url:'https://job-boards.greenhouse.io/grafanalabs/jobs/1001',updated_at:'2026-11-17T06:00:00Z',location:{name:'Remote - Germany'}}]});
 assert.equal(raw[0].publishedAt,'');
 assert.equal(raw[0].updatedAt,'2026-11-17T06:00:00Z');
 const j=normalizeJob(raw[0],src,null,'2026-11-17T10:00:00.000Z');
 assert.equal(j.datePosted,'');
 assert.equal(j.firstSeenAt,'2026-11-17T10:00:00.000Z');
 assert.equal(j.locationCategory,'country-limited-remote');
 assert.equal(j.verificationStatus,'listed-at-source');
});
test('scanner preserves first seen and does not add duplicates on repeat',async()=>{
 const url='https://job-boards.greenhouse.io/grafanalabs/jobs/1001';
 const fetcher=async()=>({jobs:[{title:'Major Account Executive',absolute_url:url,updated_at:'2026-11-16T09:00:00Z',location:{name:'Remote - Germany'}}]});
 const first=await scanOwner({sources:[src],fetcher,now:'2026-11-17T10:00:00.000Z'});
 assert.equal(first.count,1);
 assert.equal(first.newCount,1);
 const second=await scanOwner({sources:[src],fetcher,previous:first,now:'2026-11-17T11:00:00.000Z'});
 assert.equal(second.newCount,0);
 assert.equal(second.jobs[0].firstSeenAt,'2026-11-17T10:00:00.000Z');
 assert.equal(second.jobs[0].lastSeenAt,'2026-11-17T11:00:00.000Z');
});
test('failed sources retain old jobs as unverified, and all failures abort',async()=>{
 const fetcher=async()=>{throw Error('HTTP 503')};
 const prev=await scanOwner({sources:[src],fetcher:async()=>({jobs:[{title:'Major Account Executive',absolute_url:'https://job-boards.greenhouse.io/grafanalabs/jobs/1001',location:{name:'Remote - Germany'}}]}),now:'2026-11-17T10:00:00.000Z'});
 await assert.rejects(scanOwner({sources:[src],fetcher,previous:prev}),/All employer/);
 const other={provider:'greenhouse',board:'vercel',company:'Vercel',industry:'Cloud'};
 const mixed=await scanOwner({sources:[src,other],fetcher:async url=>url.includes('grafana')?Promise.reject(Error('HTTP 503')):({jobs:[]}),previous:prev,now:'2026-11-18T09:00:00.000Z'});
 assert.equal(mixed.count,1);
 assert.equal(mixed.jobs[0].verificationStatus,'not-rechecked');
});
