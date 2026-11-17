import { chromium } from 'playwright';
const now=new Date(),days=d=>new Date(now.getTime()-d*86400000).toISOString();
const jobs=[
 {id:'ownerats-testgermany',company:'Mock IT Germany',title:'Enterprise Account Executive',location:'Remote - Germany',industry:'Cloud SaaS',
  fit:85,type:'scanned ae it-sales remote',source:'owner-public-ats',sourceDisplay:'Employer ATS · greenhouse',
  verificationStatus:'listed-at-source',datePosted:'',firstSeenAt:days(0),lastSeenAt:days(0),locationCategory:'country-limited-remote',
  sourceUrl:'https://job-boards.greenhouse.io/mock/jobs/101',applyUrl:'https://job-boards.greenhouse.io/mock/jobs/101'},
 {id:'ownerats-testfrance',company:'Mock IT France',title:'Strategic Account Manager',location:'Paris, France',industry:'Cloud SaaS',
  fit:89,type:'scanned growth it-sales',source:'owner-public-ats',sourceDisplay:'Employer ATS · greenhouse',
  verificationStatus:'listed-at-source',datePosted:days(0),firstSeenAt:days(9),lastSeenAt:days(0),locationCategory:'eligible-office',
  sourceUrl:'https://job-boards.greenhouse.io/mock/jobs/102',applyUrl:'https://job-boards.greenhouse.io/mock/jobs/102'},
 {id:'ownerats-testeu',company:'Mock IT Europe',title:'Enterprise Account Director',location:'Remote Europe',industry:'Cloud SaaS',
  fit:90,type:'scanned growth it-sales remote',source:'owner-public-ats',sourceDisplay:'Employer ATS · ashby',
  verificationStatus:'listed-at-source',datePosted:days(1),firstSeenAt:days(2),lastSeenAt:days(0),locationCategory:'europe-remote',
  sourceUrl:'https://jobs.ashbyhq.com/mock/103',applyUrl:'https://jobs.ashbyhq.com/mock/103'}
];
const payload=(entries)=>({source:'owner-public-ats',generatedAt:new Date().toISOString(),count:entries.length,newCount:2,sourcesChecked:3,sourcesSucceeded:3,jobs:entries,errors:[]});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.route('**/data/careerops-jobs.json*',route=>route.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({source:'career-ops',generatedAt:days(1),count:1,jobs:[{
    id:'careerops-duplicate',title:'Enterprise Account Executive',company:'Mock IT Germany',
    location:'Remote - Germany',fit:40,type:'scanned ae',source:'career-ops',
    sourceUrl:'https://job-boards.greenhouse.io/mock/jobs/101',applyUrl:'https://job-boards.greenhouse.io/mock/jobs/101',datePosted:''}]})}));
 let currentJobs=jobs;
 await page.route('**/data/owner-ats-jobs.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload(currentJobs))}));
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#scanMeta')?.textContent.includes('IT/SaaS ATS:'));
 const facts=await page.evaluate(()=>({
  active:activeProfileId,mode:sortBy.value,roles:profile().roles,
  matches:allProfileJobs().filter(j=>j.company.startsWith('Mock IT')).map(j=>({id:j.id,company:j.company,fit:practicalFit(j)})),
  meta:scanMeta.textContent
 }));
 if(facts.active!=='owner')throw Error('owner profile not active');
 if(!facts.roles.includes('Enterprise Account Executive')||!facts.roles.includes('IT Sales Executive'))throw Error('Owner roles not expanded');
 if(facts.mode!=='newest')throw Error('Default sort not recently discovered');
 if(facts.matches.length!==3)throw Error('Expected 3 jobs with deduplicated original '+JSON.stringify(facts.matches));
 if(facts.matches.find(x=>x.company==='Mock IT Germany')?.fit>66)throw Error('Germany remote eligibility cap missing');
 await page.locator('#jobSearch').fill('Mock IT');
 await page.waitForFunction(()=>document.querySelectorAll('#jobs .row.data').length===3);
 const first=async()=>page.locator('#jobs .row.data').first().textContent();
 if(!(await first()).includes('Mock IT Germany'))throw Error('Discovery sort newest should be Germany');
 await page.locator('#sortBy').selectOption('posted-newest');
 if(!(await first()).includes('Mock IT France'))throw Error('Posting sort should prefer actual recent posted date');
 const label=await page.locator('#jobs .row.data').filter({hasText:'Mock IT Germany'}).textContent();
 if(!label.includes('Seen'))throw Error('Unknown posting date must display first seen as seen, not posted');
 await page.locator('#sortBy').selectOption('newest');
 await page.locator('#newThisWeek').check();
 await page.waitForFunction(()=>document.querySelectorAll('#jobs .row.data').length===2);
 await page.locator('#newThisWeek').uncheck();
 // In-memory owner listing refresh must accept newly published jobs.
 currentJobs=[...jobs,{...jobs[2],id:'ownerats-testnew',company:'Mock IT New',title:'Commercial Account Executive',
  applyUrl:'https://jobs.ashbyhq.com/mock/104',sourceUrl:'https://jobs.ashbyhq.com/mock/104',firstSeenAt:new Date().toISOString()}];
 await page.evaluate(async()=>{await loadScannedJobs();updateStats();renderCurrent()});
 await page.waitForFunction(()=>[...document.querySelectorAll('#jobs .row.data')].some(x=>x.textContent.includes('Mock IT New')));
 // Existing profile's data remains isolated.
 await page.locator('#topProfileSelect').selectOption('local-mw24lfrk-mu765');
 await page.waitForFunction(()=>document.querySelector('#topProfileSelect')?.value==='local-mw24lfrk-mu765');
 const other=await page.evaluate(()=>allProfileJobs().some(j=>j.company.startsWith('Mock IT')));
 if(other)throw Error('Owner ATS jobs leaked into Clément profile');
 if(errs.length)throw Error('Page JS errors: '+errs.join(' | '));
 console.log('PASS owner IT roles, ATS ingestion, cross-feed dedup, Germany remote, new/posted sorting, refresh, profile isolation');
}finally{await browser.close()}
