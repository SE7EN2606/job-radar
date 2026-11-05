import { chromium } from 'playwright';

const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const candidate = {
  id:'local-test-candidate-001',
  name:'Example Candidate',
  roles:'Directeur commercial; Directeur général',
  locations:'Bretagne; France',
  experience:'PRIVATE WORK EXPERIENCE MUST NEVER APPEAR IN SHARE LINKS',
  homeCity:'Rennes, France',
  distanceRadius:150,
};
const jobs=[
 {id:'profile-example-one',company:'Example Software',title:'Directeur commercial',location:'Rennes, France',
  fit:93,domainFit:95,industry:'Software',type:'scanned',salary:'Undisclosed',source:'indeed',
  status:'Unverified vacancy',verificationStatus:'unverified',datePosted:'2026-10-30',
  applyUrl:'https://example.com/first',hunter:'Unknown'},
 {id:'profile-example-two',company:'Example Foods',title:'Directeur général',location:'Nantes, France',
  fit:85,domainFit:92,industry:'Food manufacturing',type:'scanned',salary:'Undisclosed',source:'linkedin',
  status:'Unverified vacancy',verificationStatus:'unverified',datePosted:'2026-10-29',
  applyUrl:'https://example.com/second',hunter:'Unknown'},
];
function routeMocks(page){
 return Promise.all([
  page.route('**/data/profile-scans/local-test-candidate-001.json*', route=>route.fulfill({
   status:200,contentType:'application/json',
   body:JSON.stringify({profileId:candidate.id,strategy:'title-and-location-first-v2',count:2,
     generatedAt:'2026-11-05T10:00:00Z',highRelevanceCount:2,jobs})})),
  page.route('https://geocoding-api.open-meteo.com/v1/search?**', route=>{
   const city=new URL(route.request().url()).searchParams.get('name');
   const loc=city==='Rennes'?{name:'Rennes',latitude:48.1147,longitude:-1.6794,country:'France'}
                        :city==='Nantes'?{name:'Nantes',latitude:47.2184,longitude:-1.5536,country:'France'}:null;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:loc?[loc]:[]})});
  })
 ]);
}

try{
 const page=await browser.newPage({permissions:['clipboard-read','clipboard-write']});
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await routeMocks(page);
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.locator('#settingsNav').click();
 await page.locator('#profileImportFile').setInputFiles({
  name:'candidate.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(candidate))
 });
 await page.waitForTimeout(1200);
 console.log('IMPORT FEEDBACK:',await page.locator('#profileImportFeedback').textContent());
 console.log('PAGE ERRORS:',pageErrors);
 await page.waitForFunction(() => document.querySelector('#profileImportFeedback')?.textContent.includes('Imported and saved'));
 await page.waitForFunction(() => document.querySelector('#topProfileSelect')?.value === 'local-test-candidate-001');
 await page.locator('#pHomeCity').fill('Rennes, France');
 await page.getByRole('button',{name:'Save preferences'}).click();
 await page.locator('#settingsView button',{hasText:'Back to jobs'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#jobs .row.data').length===2);
 if(!await page.locator('#jobs').getByText('Food manufacturing').count())throw Error('industry absent');
 if(await page.locator('#jobs').getByText('Not verified').count()!==2)throw Error('vacancy status missing');
 await page.locator('#calculateDistances').click();
 await page.waitForFunction(()=>document.querySelector('#distanceStatus')?.textContent.includes('2 / 2'));
 const distances=await page.locator('#jobs .row.data').allTextContents();
 if(!distances.some(x=>x.includes('0 km'))||!distances.some(x=>x.includes(' km')))throw Error('distances missing');
 await page.locator('#sortBy').selectOption('nearest');
 if(!String(await page.locator('#jobs .row.data').first().textContent()).includes('Example Software'))throw Error('nearest sort failed');
 await page.locator('#withinRadius').check();
 if(await page.locator('#jobs .row.data').count()!==2)throw Error('radius filter unexpectedly removed jobs');

 const encoded=await page.evaluate(()=>shareEncode(publicSearchProfile()));
 const shareDecoded=await page.evaluate(value=>shareDecode(value),encoded);
 if(JSON.stringify(shareDecoded).includes('PRIVATE WORK EXPERIENCE'))throw Error('private text leaked in share link');


 // Fresh isolated browser: no prior localStorage, no shared URL, no cookies.
 const incognito=await browser.newPage();
 const incogErrors=[];incognito.on('pageerror',err=>incogErrors.push(err.message));
 await incognito.route('**/data/profiles-public.json*',route=>route.fulfill({
  status:200,contentType:'application/json',
  body:JSON.stringify({version:1,profiles:[{
   id:'local-mw24lfrk-mu765',name:'Clément Le Ricousse',
   roles:'Directeur commercial; Directeur général',locations:'Bretagne; France',
   homeCity:'Rennes, France',distanceRadius:150
  }]})
 }));
 await incognito.route('**/data/profile-scans/local-mw24lfrk-mu765.json*',route=>route.fulfill({
  status:200,contentType:'application/json',
  body:JSON.stringify({profileId:'local-mw24lfrk-mu765',strategy:'title-and-location-first-v2',
    count:1,generatedAt:'2026-11-05T10:00:00Z',
    jobs:[{...jobs[0],id:'profile-clem-test'}]})
 }));
 await incognito.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await incognito.waitForFunction(()=>[...document.querySelectorAll('#topProfileSelect option')].some(x=>x.textContent.includes('Clément Le Ricousse')));
 if(await incognito.locator('#topProfileSelect option').count()!==2)throw Error('Expected default owner and one public candidate in private browser');
 await incognito.locator('#topProfileSelect').selectOption('local-mw24lfrk-mu765');
 await incognito.waitForFunction(()=>document.querySelectorAll('#jobs .row.data').length===1);
 if(incogErrors.length)throw Error('Private browser errors: '+incogErrors.join(' | '));
 console.log('PASS: clean browser auto-loads public profile directory and profile scan');

 const other=await browser.newPage();const otherErrors=[];other.on('pageerror',err=>otherErrors.push(err.message));
 await routeMocks(other);
 other.on('dialog',dialog=>dialog.accept());
 await other.goto('http://127.0.0.1:8765/#share='+encoded,{waitUntil:'domcontentloaded'});
 await other.waitForFunction(()=>document.querySelector('#topProfileSelect')?.value==='local-test-candidate-001');
 await other.waitForFunction(()=>document.querySelectorAll('#jobs .row.data').length===2);
 if(otherErrors.length)throw Error('Recipient page errors: '+otherErrors.join(' | '));
 if(pageErrors.length)throw Error('Main page errors: '+pageErrors.join(' | '));
 console.log('PASS: JSON import, save, top profile selector, industry, vacancy, distance, radius, sorting, private-safe sharing and recipient import');
}finally{await browser.close()}
