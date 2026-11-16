// Public, read-only Job Goblin search proxy. No credentials, applicant profiles, or resumes.
// Himalayas results must retain applicationLink and receive visible source credit in the UI.
const allowedOrigin='https://emtizzleai.github.io';
const clean=s=>String(s==null?'':s).trim();
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:''}catch{return ''}};
function remoteSearchTerm(query){
 const q=query.toLowerCase();
 if(/annotat|label|tagging/.test(q))return 'annotation';
 if(/red.team|llm|model eval|ai evaluat|ai train|artificial intelligence/.test(q))return 'AI';
 if(/quality assurance|\bqa\b|software test|game test/.test(q))return 'QA';
 if(/technical support|help ?desk|customer support/.test(q))return 'support';
 return query.slice(0,60);
}
async function getFeed(source,url,mapper,diagnostics){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),10500);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  const jobs=mapper(data).filter(j=>j.title&&safeUrl(j.url));
  diagnostics.push({source,ok:true,count:jobs.length});
  return jobs;
 }catch(e){
  diagnostics.push({source,ok:false,error:clean(e.message).slice(0,100)});
  return [];
 }finally{clearTimeout(timer)}
}
export default async function handler(req,res){
 res.setHeader('Access-Control-Allow-Origin',allowedOrigin);
 res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
 res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const q=clean(req.query.q).slice(0,100),location=clean(req.query.location).slice(0,100);
 if(!q)return res.status(400).json({error:'Missing job keywords'});
 const avParams=new URLSearchParams({q,location,limit:'50'});
 const himParams=new URLSearchParams({q:remoteSearchTerm(q),sort:'recent',page:'1'});
 const diagnostics=[];
 const batch=await Promise.all([
  getFeed('Active Vacancies','https://activevacancies.com/api/v1/jobs?'+avParams,data=>{
   const rows=Array.isArray(data)?data:Array.isArray(data.data)?data.data:Array.isArray(data.jobs)?data.jobs:[];
   return rows.map(j=>({title:clean(j.title||j.name||j.position),
    company:clean(typeof j.company==='string'?j.company:j.company?.name||j.company_name),
    location:clean(typeof j.location==='string'?j.location:j.location?.name||j.city),
    url:safeUrl(j.applyUrl||j.apply_url||j.url),
    salary:j.salary||null,source:'Active Vacancies',
    remote:j.remote===true||/remote/i.test(clean(j.remoteStatus))||/remote|work from home/i.test(clean(j.location))}));
  },diagnostics),
  getFeed('Himalayas','https://himalayas.app/jobs/api/search?'+himParams,data=>{
   if(!Array.isArray(data.jobs))throw Error('Unexpected Himalayas response');
   const now=Date.now()/1000;
   return data.jobs.filter(j=>!j.expiryDate||Number(j.expiryDate)>now).map(j=>{
    const regions=Array.isArray(j.locationRestrictions)?j.locationRestrictions:[];
    return {title:clean(j.title),company:clean(j.companyName),
      location:regions.length?regions.map(r=>clean(r.name||r.alpha2)).filter(Boolean).join(', '):'Worldwide (remote)',
      url:safeUrl(j.applicationLink),remote:true,source:'Himalayas',
      salary:j.minSalary!=null||j.maxSalary!=null?
       {min:j.minSalary,max:j.maxSalary,currency:j.currency||'',interval:j.salaryPeriod||'annual'}:null,
      employmentType:clean(j.employmentType)};
   });
  },diagnostics)
 ]);
 const jobs=batch.flat().slice(0,100);
 return res.status(200).json({jobs,diagnostics});
}
