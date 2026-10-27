// Vercel's approximate network-based location, used only if GPS permission fails.
// Location is not stored. Mobile carrier networks/VPNs may return the wrong city.
export default function handler(req,res){
  res.setHeader("Cache-Control","private, no-store");
  if(req.method!=="GET")return res.status(405).json({error:"Use GET."});
  const header=(k)=>String(req.headers[k]||"").trim();
  const decode=(v)=>{try{return decodeURIComponent(v)}catch(_){return v}};
  const city=decode(header("x-vercel-ip-city"));
  const region=decode(header("x-vercel-ip-country-region"));
  const country=header("x-vercel-ip-country");
  const lat=Number(header("x-vercel-ip-latitude"));
  const lon=Number(header("x-vercel-ip-longitude"));
  const hasCoords=Boolean(header("x-vercel-ip-latitude")&&header("x-vercel-ip-longitude")&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180);
  if(!city&&!hasCoords)return res.status(200).json({available:false});
  return res.status(200).json({
    available:true,approximate:true,
    city,region,country,
    ...(hasCoords?{lat,lon}:{}),
    label:[city,region,country].filter(Boolean).join(", ")+" (network estimate — confirm)"
  });
}
