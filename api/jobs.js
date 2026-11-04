// Public, read-only Job Goblin search proxy. No credentials or user profiles.
const allowedOrigin='https://emtizzleai.github.io';
export default async function handler(req,res){
 res.setHeader('Access-Control-Allow-Origin',allowedOrigin);
 res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
 res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const q=String(req.query.q||'').trim().slice(0,100),location=String(req.query.location||'').trim().slice(0,100);
 if(!q)return res.status(400).json({error:'Missing job keywords'});
 const params=new URLSearchParams({q,location,limit:'50'});
 const endpoints=[
 ['Active Vacancies','https://activevacancies.com/api/v1/jobs?'+params],
 ['The Muse','https://www.themuse.com/api/public/jobs?'+new URLSearchParams({page:'1',location:location||'United States'})]
 ];
 const diagnostics=[];
 const batches=await Promise.all(endpoints.map(async([source,url])=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9500);
  try{
   const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();
   const items=Array.isArray(data)?data:Array.isArray(data.data)?data.data:Array.isArray(data.jobs)?data.jobs:Array.isArray(data.results)?data.results:null;
   if(!items)throw Error('Unexpected data format');
   diagnostics.push({source,ok:true,count:items.length});
   return items.map(j=>({title:j.title||j.name||j.position||'',company:typeof j.company==='string'?j.company:j.company?.name||j.company_name||'',location:typeof j.location==='string'?j.location:j.location?.name||j.city||(j.locations||[]).map(x=>x.name).join(', '),url:j.applyUrl||j.apply_url||j.url||j.refs?.landing_page||'',salary:j.salary||null,source,remote:j.remoteStatus==='remote'||(j.locations||[]).some(x=>/remote/i.test(x.name))}));
  }catch(e){diagnostics.push({source,ok:false,error:String(e.message).slice(0,100)});return []}
  finally{clearTimeout(timer)}
 }));
 const jobs=batches.flat().filter(j=>j.title&&/^https:\/\//.test(j.url)).slice(0,100);
 return res.status(200).json({jobs,diagnostics});
}
