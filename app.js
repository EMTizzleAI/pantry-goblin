const $ = selector => document.querySelector(selector);
let deviceCoords = null;
let lastSearch = null;
const lore = [
  "BEAN LORE #7: The humble bean requires no API key.",
  "BEANS ACQUIRED (potential).",
  "No beans? Suspicious.",
  "Legumes are infrastructure.",
  "Verify before you travel. The goblin believes in saving gas."
];
const kmBetween = (lat1,lon1,lat2,lon2) => {
  const r=Math.PI/180, a=(lat2-lat1)*r, b=(lon2-lon1)*r;
  const h=Math.sin(a/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(b/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
};
function say(message){
  $("#state").textContent=message;
  $("#lore").textContent=lore[Math.floor(Math.random()*lore.length)];
}
function esc(value){
  return String(value??"").replace(/[&<>"']/g,char=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
}
function webUrl(value){
  if(!value)return "";
  try {
    const url=new URL(/^https?:\/\//i.test(value)?value:"https://"+value);
    return /^https?:$/.test(url.protocol)?url.href:"";
  } catch(_) { return ""; }
}
function coordsOf(item){
  const p=item.center||item;
  return Number.isFinite(p.lat)&&Number.isFinite(p.lon)?p:null;
}
function addressOf(tags){
  return tags["addr:full"] || [
    tags["addr:housenumber"],tags["addr:street"],
    tags["addr:city"],tags["addr:state"],tags["addr:postcode"]
  ].filter(Boolean).join(" ") || "";
}
function resourceKey(item){
  const tags=item.tags||{};
  const address=addressOf(tags).toLowerCase().replace(/[^a-z0-9]/g,"");
  const name=(tags.name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  return address.length>12?address:name||String(item.id);
}
function render(items,origin,radiusKm,live){
  const unique=new Map();
  for(const item of items){
    const key=resourceKey(item);
    if(!unique.has(key)||item.featured)unique.set(key,item);
  }
  const all=[...unique.values()].map(item=>{
    const point=coordsOf(item);
    return {item,distance:point?kmBetween(origin.lat,origin.lon,point.lat,point.lon):null};
  }).filter(row=>row.distance===null||row.distance<=radiusKm+0.1)
    .sort((a,b)=>{
      if(Boolean(a.item.featured)!==Boolean(b.item.featured))return a.item.featured?-1:1;
      return (a.distance??Infinity)-(b.distance??Infinity);
    });

  const results=$("#results");
  if(!all.length){
    results.innerHTML='<div class="empty-haul">No mapped food locations in this radius. This does NOT mean there are no local food programs — try the directories below.</div>';
    return say("No locations found within "+Math.round(radiusKm/1.609)+" miles. Try expanding the radius or a food bank directory.");
  }
  $("#state").textContent=all.length+" food resource leads found within "+Math.round(radiusKm/1.609)+
    " miles. "+(live?"Mapped listings may be incomplete.":"Live maps are unavailable; only local listings are shown.")+
    " Verify hours and eligibility before traveling.";
  results.innerHTML=all.slice(0,40).map(({item,distance})=>{
    const tags=item.tags||{};
    const name=tags.name||"Food resource";
    const address=addressOf(tags);
    const hours=tags.opening_hours||"Hours not published";
    const phone=(tags.phone||tags["contact:phone"]||"").replace(/[^\d+]/g,"");
    const website=webUrl(tags.website||tags["contact:website"]);
    const p=coordsOf(item);
    // Never invent directions from a city's centroid: use a listed street address.
    const destination=p?p.lat+","+p.lon:address;
    const directions=destination?"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(destination):"";
    const badge=item.featured?"<div class='badge'>LOCAL SOURCE · CHECK HOURS</div>":
      distance!==null?"<div class='badge'>"+esc((distance/1.609).toFixed(1))+" mi straight-line distance</div>":"";
    return '<article class="card">'+badge+'<h3>'+esc(name)+'</h3>'+
      '<div class="meta">'+esc(hours)+'</div><p>'+esc(address||"See map for location")+'</p>'+
      '<div class="verify">⚠ Call or check the provider before traveling. Availability, hours and eligibility can change.</div>'+
      '<div class="actions">'+
        (phone?'<a href="tel:'+esc(phone)+'">CALL</a>':'')+
        (directions?'<a href="'+esc(directions)+'" target="_blank" rel="noopener noreferrer">DIRECTIONS</a>':'')+
        (website?'<a href="'+esc(website)+'" target="_blank" rel="noopener noreferrer">SOURCE / WEBSITE</a>':'')+
      '</div></article>';
  }).join("");
  $("#lore").textContent="BEANS ACQUIRED (potential). "+all.length+" leads. Nearest mapped places first.";
}
function normalizeSeed(seed,index){
  return {
    id:"official-"+index,
    featured:true,
    tags:{
      name:seed.name,
      "addr:full":seed.address,
      phone:seed.phone||"",
      opening_hours:seed.hours||"",
      website:seed.sourceUrl||""
    }
  };
}
async function geocode(query){
  const url="https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q="+encodeURIComponent(query);
  const response=await fetch(url,{headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error("Could not look up that place.");
  const matches=await response.json();
  if(!matches.length)throw new Error("Location not found. Try 'Fremont, CA' or a ZIP code.");
  const match=matches[0];
  return {lat:Number(match.lat),lon:Number(match.lon),label:match.display_name||query};
}
async function hunt(expanded=false){
  const query=$("#where").value.trim();
  if(!query&&!deviceCoords)return say("Enter a city, state, ZIP or use your location.");
  const button=$("#hunt"),expand=$("#expand");
  button.disabled=true;
  expand.hidden=true;
  say("Goblin is searching close to your location…");
  $("#results").innerHTML='<div class="empty-haul">🫘 Hunting for nearby beans…</div>';
  try {
    // A newly typed place always beats an older GPS fix.
    const origin=(!expanded||!lastSearch)
      ?(deviceCoords&&query==="Current location"
          ?{...deviceCoords,label:"your current location"}
          :await geocode(query))
      :lastSearch.origin;
    const radiusKm=expanded?30:12;
    lastSearch={origin,query};
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),16500);
    let response;
    try{
      response=await fetch("/api/pantries?"+new URLSearchParams({
        lat:String(origin.lat),lon:String(origin.lon),radius:String(radiusKm)
      }),{signal:controller.signal});
    }finally{clearTimeout(timer)}
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Food search service is temporarily unavailable.");
    const resources=[...(data.elements||[]),...(data.seeds||[]).map(normalizeSeed)];
    $("#location-label").textContent="Searching around: "+origin.label;
    render(resources,origin,radiusKm,Boolean(data.live));
    expand.hidden=expanded;
  }catch(error){
    say(error.name==="AbortError"?"Search timed out. Try again or use an official directory below.":error.message);
    $("#results").innerHTML='<div class="empty-haul">Live results unavailable. Try a directory below — no invented pantry listings here.</div>';
    expand.hidden=true;
  }finally{button.disabled=false}
}

$("#where").addEventListener("input",()=>{
  deviceCoords=null;
  lastSearch=null;
  $("#location-label").textContent="";
});
$("#locate").onclick=()=>{
  if(!navigator.geolocation)return say("This browser cannot read location. Enter a city or ZIP.");
  say("Asking your phone for its location…");
  navigator.geolocation.getCurrentPosition(position=>{
    deviceCoords={lat:position.coords.latitude,lon:position.coords.longitude};
    lastSearch=null;
    $("#where").value="Current location";
    $("#location-label").textContent="";
    say("GPS acquired. Tap FIND FOOD.");
  },()=>say("Location permission unavailable. Enter a ZIP, city or full address instead."),
  {enableHighAccuracy:true,timeout:12000,maximumAge:60000});
};
$("#hunt").onclick=()=>hunt(false);
$("#expand").onclick=()=>hunt(true);
$("#where").addEventListener("keydown",event=>{
  if(event.key==="Enter"){event.preventDefault();hunt(false)}
});
