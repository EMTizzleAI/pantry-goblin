const SOURCES=["https://overpass.kumi.systems/api/interpreter","https://overpass-api.de/api/interpreter"];
export default async function handler(req,res){
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  const lat=Number(req.query.lat), lon=Number(req.query.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)) return res.status(400).json({error:"Goblin needs valid coordinates."});
  const q='[out:json][timeout:8];(node["amenity"="food_bank"](around:16093,'+lat+','+lon+');way["amenity"="food_bank"](around:16093,'+lat+','+lon+');node["social_facility"="food_bank"](around:16093,'+lat+','+lon+');way["social_facility"="food_bank"](around:16093,'+lat+','+lon+'););out center tags;';
  const errors=[];
  for(const url of SOURCES){
    const c=new AbortController(); const timer=setTimeout(()=>c.abort(),9000);
    try{
      const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8","User-Agent":"PantryGoblin/1.0"},body:"data="+encodeURIComponent(q),signal:c.signal});
      clearTimeout(timer);
      if(!r.ok) throw new Error("HTTP "+r.status);
      const d=await r.json();
      return res.status(200).json({elements:d.elements||[],source:url,retrievedAt:new Date().toISOString()});
    }catch(e){clearTimeout(timer);errors.push(e.name==="AbortError"?"timeout":String(e.message||e));}
  }
  return res.status(503).json({error:"Pantry sources unavailable",details:errors});
}