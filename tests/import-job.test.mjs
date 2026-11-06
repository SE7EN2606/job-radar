import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFromHtml, sanitizeUrl, greenhouseRef } from '../api/import-job.js';

test('extract real JobPosting structured metadata without inventing salary',()=>{
 const html='<html><head><script type="application/ld+json">'+JSON.stringify({
 "@context":"https://schema.org","@type":"JobPosting",
 title:"Senior Mechanical Engineer",hiringOrganization:{"@type":"Organization",name:"Example Engineering"},
 jobLocation:{address:{addressLocality:"Bristol",addressCountry:"GB"}},
 description:"<p>Design and lead manufacturing systems.</p>",
 datePosted:"2026-11-06"
 })+'</script></head></html>';
 const job=extractFromHtml(html,"https://jobs.example.org/123");
 assert.equal(job.title,"Senior Mechanical Engineer");
 assert.equal(job.company,"Example Engineering");
 assert.equal(job.location,"Bristol, GB");
 assert.match(job.description,/manufacturing systems/);
 assert.equal(job.salary,"");
 assert.equal(job.complete,true);
});

test('metadata-only pages return partial details and ask for review',()=>{
 const html='<html><head><meta property="og:title" content="Electrician - Manchester"><meta property="og:site_name" content="Regional Contractor"></head></html>';
 const job=extractFromHtml(html,"https://example.com/job");
 assert.equal(job.title,"Electrician");
 assert.equal(job.company,"Regional Contractor");
 assert.equal(job.complete,true);
 assert.equal(job.method,"Public page metadata");
});

test('block sensitive endpoints and non-public hostnames',()=>{
 for(const url of ["http://example.com/job","https://localhost/job","https://127.0.0.1","https://169.254.169.254/latest","https://user:pass@example.com/job","https://example.com:8080/jobs"])
 assert.throws(()=>sanitizeUrl(url),undefined,url);
 assert.equal(sanitizeUrl("https://jobs.example.com/role").hostname,"jobs.example.com");
});

test('recognize supported greenhouse job URLs',()=>{
 assert.deepEqual(greenhouseRef("https://job-boards.greenhouse.io/acmecorp/jobs/12345"),{board:"acmecorp",id:"12345"});
 assert.equal(greenhouseRef("https://example.com/jobs/12345"),null);
});
