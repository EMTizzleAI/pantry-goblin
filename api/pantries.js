const OVERPASS=["https://overpass.kumi.systems/api/interpreter","https://overpass-api.de/api/interpreter"];
const SEEDS=[
{name:"Hayward Seventh Day Adventist",address:"26400 Gading Road, Hayward, CA",hours:"Sunday",source:"City of Hayward",sourceUrl:"https://www.hayward-ca.gov/services/city-services/food-access-pantries",confidence:"official"},
{name:"5 Sikh Seva: Food Truck @ Eden Greenway Park",address:"25625 Cypress Avenue, Hayward, CA",hours:"Monday",source:"City of Hayward",sourceUrl:"https://www.hayward-ca.gov/services/city-services/food-access-pantries",confidence:"official"},
{name:"United Smith Memorial CME Church",address:"28105 Mission Boulevard, Hayward, CA",hours:"2nd & 4th Saturday",source:"City of Hayward",sourceUrl:"https://www.hayward-ca.gov/services/city-services/food-access-pantries",confidence:"official"},
{name:"The Peace Haven Freedom Store",address:"1063 A Street, Hayward, CA",hours:"Tuesday & Friday",source:"City of Hayward",sourceUrl:"https://www.hayward-ca.gov/services/city-services/food-access-pantries",confidence:"official"},
{name:"Salvation Army - Hayward",address:"430 A Street, Hayward, CA",phone:"510-581-6444",hours:"Food pantry Tuesday & Thursday",source:"City of Hayward / 211 Alameda",sourceUrl:"https://211alamedacounty.org/resources/food-programs-and-usda-commodity-38904914/",confidence:"official"},
{name:"4C's of Alameda County - Hayward",address:"22351 City Center Drive, Hayward, CA",phone:"510-736-0024",hours:"1st Thursday, 1pm–3pm",source:"Alameda County",sourceUrl:"https://acgov.org/cda/get-help.htm",confidence:"official"},
{name:"Church of the Cross",address:"355 A Street, Hayward, CA",phone:"510-581-5522",hours:"Tuesday, 10am–12pm",source:"Alameda County",sourceUrl:"https://acgov.org/cda/get-help.htm",confidence:"official"},
{name:"Comida Para Cherryland",address:"21455 Birch Street, Hayward, CA",phone:"510-582-9533",hours:"2nd & 4th Wednesday, 1:30pm",source:"Alameda County",sourceUrl:"https://acgov.org/cda/get-help.htm",confidence:"official"},
{name:"Community of Grace Church",address:"380 Elmhurst Street, Hayward, CA",phone:"510-783-8062",hours:"Wednesday, 11am–12pm; call for appointment; bring ID",source:"Alameda County",sourceUrl:"https://acgov.org/cda/get-help.htm",confidence:"official"},
{name:"Alameda County Community Food Bank",address:"Alameda County, CA",phone:"510-635-3663",hours:"Referral line Mon–Fri, 9am–4pm",source:"211 Alameda County",sourceUrl:"https://211alamedacounty.org/resources/food-bank-services-38905455/",confidence:"directory"}
];
function timeoutFetch(url,opt={},ms=6500){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);return fetch(url,{...opt,signal:c.signal}).finally(()=>clearTimeout(t))}
export default async function handler(req,res){
 res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=900");
 const lat=Number(req.query.lat),lon=Number(req.query.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return res.status(400).json({error:"Goblin needs valid coordinates."});
 const q='[out:json][timeout:5];(node["amenity"="food_bank"](around:12000,'+lat+','+lon+');node["social_facility"="food_bank"](around:12000,'+lat+','+lon+'););out tags center;';
 const jobs=OVERPASS.map(async url=>{try{const r=await timeoutFetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8","User-Agent":"PantryGoblin/1.1"},body:"data="+encodeURIComponent(q)});if(!r.ok)throw Error("HTTP "+r.status);return (await r.json()).elements||[]}catch(e){return []}});
 const settled=await Promise.all(jobs);const elements=settled.flat();
 return res.status(200).json({elements,seeds:SEEDS,retrievedAt:new Date().toISOString(),note:"Official Hayward/Alameda sources plus best-effort mapped resources. Verify schedules before travel."});
}