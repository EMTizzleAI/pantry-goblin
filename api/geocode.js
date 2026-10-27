// Server-side geocoding avoids browser/CORS restrictions in mobile in-app browsers.
// No API key or location history. Cache results to respect public geocoder limits.
const CITY_CENTERS = new Map([
  ["fremont ca",{lat:37.5485,lon:-121.9886,label:"Fremont, California (approximate city center)"}],
  ["newark ca",{lat:37.5297,lon:-122.0402,label:"Newark, California (approximate city center)"}],
  ["union city ca",{lat:37.5934,lon:-122.0438,label:"Union City, California (approximate city center)"}],
  ["hayward ca",{lat:37.6688,lon:-122.0808,label:"Hayward, California (approximate city center)"}],
  ["san jose ca",{lat:37.3382,lon:-121.8863,label:"San Jose, California (approximate city center)"}]
]);
function canonical(value) {
  return value.toLowerCase().replace(/\bcalifornia\b/g,"ca")
    .replace(/\bunited states of america\b|\busa\b|\bunited states\b/g,"")
    .replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}
async function jsonFetch(url,timeoutMs=5000) {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetch(url,{
      signal:controller.signal,
      headers:{
        "Accept":"application/json",
        "User-Agent":"PantryGoblin/1.3 (https://pantry-goblin.vercel.app; community-food-finder)"
      }
    });
    if(!response.ok)throw Error("Geocoding service HTTP "+response.status);
    return await response.json();
  } finally {clearTimeout(timeout)}
}
function valid(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180}
export default async function handler(req,res) {
  res.setHeader("Cache-Control","public, s-maxage=3600, stale-while-revalidate=86400");
  if(req.method!=="GET")return res.status(405).json({error:"Use GET."});
  const query=String(req.query.q||"").trim().slice(0,160);
  if(query.length<2)return res.status(400).json({error:"Enter a city and state, ZIP or address."});
  // Known Bay Area city centers are intentionally a resilient fallback when public geocoders are down.
  const city=CITY_CENTERS.get(canonical(query));
  if(city)return res.status(200).json({...city,approximate:true,source:"city center"});
  // U.S. postal codes through a public postal database. This is the ZIP area, not an address.
  if(/^\d{5}(?:-\d{4})?$/.test(query)){
    try{
      const zip=query.slice(0,5);
      const result=await jsonFetch("https://api.zippopotam.us/us/"+zip);
      const place=result.places&&result.places[0];
      if(place){
        const p={lat:Number(place.latitude),lon:Number(place.longitude),
          label:zip+" · "+place["place name"]+", "+place["state abbreviation"]+" (ZIP area)",
          approximate:true,source:"ZIP code"};
        if(valid(p))return res.status(200).json(p);
      }
    }catch(_){/* Try general geocoding below. */}
  }
  try{
    const list=await jsonFetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q="+encodeURIComponent(query),7000);
    if(Array.isArray(list)&&list.length){
      const p={lat:Number(list[0].lat),lon:Number(list[0].lon),
        label:list[0].display_name||query,approximate:false,source:"OpenStreetMap Nominatim"};
      if(valid(p))return res.status(200).json(p);
    }
  }catch(_){/* Try second map geocoder below. */}
  try{
    const data=await jsonFetch("https://photon.komoot.io/api/?limit=1&q="+encodeURIComponent(query),6500);
    if(Array.isArray(data.features)&&data.features.length){
      const item=data.features[0],values=item.geometry&&item.geometry.coordinates;
      const prop=item.properties||{};
      if(values&&values.length===2){
        const p={lat:Number(values[1]),lon:Number(values[0]),
          label:[prop.name,prop.city,prop.state,prop.country].filter(Boolean).join(", ")||query,
          approximate:false,source:"Photon / OpenStreetMap"};
        if(valid(p))return res.status(200).json(p);
      }
    }
  }catch(_){/* Report honest service failure below. */}
  return res.status(503).json({
    error:"Location lookup is unavailable right now. Try another city/ZIP, use GPS in Chrome, or open the food directories below."
  });
}
