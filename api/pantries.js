// Pantry Goblin: live location-based discovery + geographically gated official listings.
// Never insert a city's fallback pantries into another city's search results.
const OVERPASS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];

// These are NOT a national database. Each listing is shown only near Fremont;
// all other locations use their own map coordinates and nationwide directories.
const FREMONT_CENTER = {lat:37.5485, lon:-121.9886};
const FREMONT_RESOURCES = [
  {
    name:"Tri-City Volunteers Food Bank",
    address:"37350 Joseph Street, Fremont, CA 94536",
    phone:"510-793-4583",
    hours:"Walk-up Mon–Thu 10am–2pm; Friday drive-through 10am–11:30am. Check holiday closures.",
    source:"TCV Food Bank",
    sourceUrl:"https://tcvfoodbank.org/food/",
    confidence:"provider listing"
  },
  {
    name:"Salaam Food Pantry",
    address:"4080 Bay Street, Fremont, CA 94538",
    phone:"510-519-7250",
    hours:"Call for current food pickup times and appointment requirements.",
    source:"Salaam Food Pantry / 211 Alameda",
    sourceUrl:"https://salaamfoodpantry.org/contact",
    confidence:"provider listing"
  },
  {
    name:"Fremont Family Resource Center — TCV mobile food distribution",
    address:"39155 Liberty Street, Fremont, CA 94538",
    hours:"1st and 3rd Wednesday, around 10:30–11:30am; verify before traveling.",
    source:"City of Fremont",
    sourceUrl:"https://www.fremont.gov/government/departments/human-services/fremont-family-resource-center/food-events",
    confidence:"city listing"
  }
];

function distanceKm(a,b,c,d){
  const r=Math.PI/180, x=(c-a)*r, y=(d-b)*r;
  const z=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
}
async function timeoutFetch(url,options,ms=9500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(url,{...options,signal:controller.signal})}
  finally{clearTimeout(timer)}
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  if(req.method!=="GET")return res.status(405).json({error:"Use GET."});
  const lat=Number(req.query.lat), lon=Number(req.query.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180 ||
     req.query.lat===undefined||req.query.lon===undefined){
    return res.status(400).json({error:"Enter a valid location (latitude/longitude)."});
  }
  const requested=Number(req.query.radius);
  const radiusKm=requested===30?30:12; // Only expand when the user explicitly asks.
  const nearFremont=distanceKm(lat,lon,FREMONT_CENTER.lat,FREMONT_CENTER.lon)<=9;
  const seeds=nearFremont?FREMONT_RESOURCES:[];

  const around=`(around:${radiusKm*1000},${lat},${lon})`;
  const query=`[out:json][timeout:8];(
    nwr["amenity"="food_bank"]${around};
    nwr["social_facility"="food_bank"]${around};
    nwr["social_facility"="soup_kitchen"]${around};
    nwr["amenity"="food_sharing"]${around};
    nwr["amenity"="soup_kitchen"]${around};
  );out center tags;`;

  const results=await Promise.all(OVERPASS.map(async url=>{
    try{
      const response=await timeoutFetch(url,{
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
        body:"data="+encodeURIComponent(query)
      });
      if(!response.ok)throw new Error("Overpass HTTP "+response.status);
      const data=await response.json();
      if(!Array.isArray(data.elements))throw new Error("Invalid Overpass response");
      return {ok:true,elements:data.elements};
    }catch(_){return {ok:false,elements:[]}}
  }));

  const live=results.some(r=>r.ok);
  // Multiple Overpass mirrors can return the same map features.
  const unique=new Map();
  for(const item of results.flatMap(r=>r.elements)){
    const key=item.type+":"+item.id;
    if(!unique.has(key))unique.set(key,item);
  }
  const elements=[...unique.values()].filter(item=>{
    const p=item.center||item;
    return Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&
      distanceKm(lat,lon,p.lat,p.lon)<=radiusKm+0.1;
  });

  if(!live&&!seeds.length){
    return res.status(503).json({
      error:"Live map providers are temporarily unavailable. Try again or use the official food directories below.",
      radiusKm
    });
  }

  return res.status(200).json({
    elements,seeds,live,radiusKm,retrievedAt:new Date().toISOString(),
    note:live
      ?"Nearby mapped resources and any locally verified listings. Check hours and eligibility before traveling."
      :"Live map search is temporarily unavailable; showing locally sourced listings only."
  });
}
