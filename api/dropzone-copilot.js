/* Drop Zone's Co-Pilot API, served alongside Pantry Goblin.
 * Public endpoint for the GitHub Pages Drop Zone frontend.
 * Only the explicitly FREE Vercel AI Gateway model is used; no paid fallback.
 * Model/provider may handle submitted text, so UI must disclose that.
 * No transcript or API keys are stored here.
 */
const ALLOWED_ORIGIN="https://emtizzleai.github.io";
const MODEL="nvidia/nemotron-3.5-lightning-free";
const counters=new Map();
const WINDOW=60*60*1000;
const MAX_PER_WINDOW=35;
const CRISIS=/(?:\b(?:suicid\w*|kill myself|end my life|self[ -]?harm|hurt myself|want to die|take my life|overdos\w*|i'm going to kill|i will kill myself|not safe right now)\b)/i;
const MEDICAL=/(?:\b(?:diagnos\w*|medication dosage|medicine dose|prescription dose|what (?:drug|medication) should i take|chest pain|can't breathe|medical advice|treat my illness)\b)/i;
const CRISIS_REPLY="I hear you, operator. I'm glad you told me. This deserves real human support, not just a pep talk. If you're in immediate danger, call local emergency services (911 in the U.S.). In the U.S., you can call or text 988 for immediate crisis support. If possible, get near someone you trust. You don't have to handle this with a chatbot.";
const MEDICAL_REPLY="Your health matters, operator. I'm a motivational co-pilot, not a clinician, so I can't assess symptoms, diagnose conditions, or advise on medication. A qualified medical professional can help with those questions. For urgent danger, contact emergency services.";
const SYSTEM=`You are the Onboard Co-Pilot in Drop Zone, a playful motivational support feature created by EMTizzle AI. You are a separate AI system, NOT the real EMTizzle and NOT her recorded voice. Your vibe: warm, witty, a little cyberpunk, supportive and direct. Address the user as "operator" sparingly and use "mission" or "next objective" naturally, not in every sentence.

Your mission: Have a genuine, free-flowing, *ongoing* conversation. Respond to the actual details of the user's most recent message and the previous conversational turns. Ask thoughtful follow-up questions. Celebrate genuine wins, validate feelings without empty slogans, and suggest one doable optional next step when appropriate. You can talk about daily life, creativity, motivation, goals, and music or gentle movement for enjoyment.

MUSIC: When asked for music, suggest one or two real artists/songs or a genre/mood and ask what sound they enjoy. Never invent live playlists or claim to control music players. Don't quote song lyrics.
MOVEMENT: When asked for exercise, offer general optional gentle activities (a short walk, dancing to a song, stretching or shoulder rolls, at the person's comfort level). Don't prescribe an exercise plan, make fitness/medical claims, or push someone who reports pain, injury, dizziness or other concerning symptoms. If an activity feels wrong, tell them to stop. Avoid making assumptions about their physical ability.
BOUNDARIES: You are encouragement, not medical/mental-health care, legal or financial advice, an emergency service, or a real human. No diagnoses, treatment, medications, dosage advice or medical assessments. If they report immediate danger or suicidal intent, recommend local emergency services and human crisis support (in US 988) promptly and compassionately. Don't invent resource availability or claim to have performed actions. Never request sensitive identifying details, passwords, or medical records. Do not pretend you are always available or promise unlimited access.
STYLE: Keep typical replies at 60-125 words, vary length naturally; no excessive hashtags. Be witty without making jokes about someone's suffering. The conversation can continue across many turns, but only recent turns are supplied. Follow the user's interests in a grounded way.`;
function reply(res,code,obj){res.setHeader("Cache-Control","no-store");return res.status(code).json(obj)}
function clientAllowed(req,res){
  const origin=String(req.headers.origin||"");
  if(origin===ALLOWED_ORIGIN){
    res.setHeader("Access-Control-Allow-Origin",ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type");
    res.setHeader("Vary","Origin");
    return true;
  }
  // Same-site requests carry no cross-site browser Origin. Never reflect arbitrary origins.
  if(!origin)return true;
  return false;
}
export default async function handler(req,res){
  if(!clientAllowed(req,res))return reply(res,403,{error:"Origin not permitted."});
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method==="GET")return reply(res,200,{
    service:"Drop Zone Co-Pilot",
    mode:"free-model",
    enabled:true,
    model:MODEL,
    description:"Public beta. No stored transcript. Nearby short-term context only."
  });
  if(req.method!=="POST")return reply(res,405,{error:"POST only."});
  const auth=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||req.headers["x-vercel-oidc-token"];
  if(!auth)return reply(res,503,{error:"Co-Pilot's AI connection isn't authorized yet. Offline encouragement remains available."});
  const body=req.body||{};
  if(typeof body!=="object"||Array.isArray(body))return reply(res,400,{error:"Invalid request."});
  const raw=String(body.message||"").trim();
  if(!raw||raw.length>700)return reply(res,400,{error:"Message must be between 1 and 700 characters."});
  if(CRISIS.test(raw))return reply(res,200,{reply:CRISIS_REPLY,mode:"safety"});
  if(MEDICAL.test(raw))return reply(res,200,{reply:MEDICAL_REPLY,mode:"safety"});
  const ip=String(req.headers["x-forwarded-for"]||"unknown").split(",")[0].slice(0,96);
  const now=Date.now();
  const item=counters.get(ip);
  const count=item&&now-item.start<WINDOW?item:{start:now,n:0};
  count.n++;
  counters.set(ip,count);
  if(counters.size>2000)counters.clear(); // Per-instance only; not durable abuse prevention.
  if(count.n>MAX_PER_WINDOW)return reply(res,429,{error:"Too many live requests right now. Offline encouragement remains available."});
  const history=Array.isArray(body.history)?body.history.slice(-12):[];
  const turns=history.filter(x=>x&&["user","assistant"].includes(x.role)&&typeof x.content==="string")
    .map(x=>({role:x.role,content:x.content.slice(0,700)}));
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),18000);
  try{
    const response=await fetch("https://ai-gateway.vercel.sh/v1/chat/completions",{
      method:"POST",signal:controller.signal,
      headers:{"Authorization":"Bearer "+auth,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:MODEL,
        messages:[{role:"system",content:SYSTEM},...turns,{role:"user",content:raw}],
        max_tokens:440,temperature:0.85
      })
    });
    if(!response.ok)return reply(res,503,{error:"The language model couldn't respond right now ("+response.status+"). Offline support is still available."});
    const data=await response.json();
    let generated=data?.choices?.[0]?.message?.content;
    if(Array.isArray(generated))generated=generated.filter(x=>x.type==="text").map(x=>x.text).join("\n");
    if(typeof generated!=="string"||!generated.trim())
      return reply(res,503,{error:"No generated reply was returned; offline support is available."});
    return reply(res,200,{reply:generated.slice(0,2400).trim(),mode:"live",model:MODEL});
  }catch(_){
    return reply(res,503,{error:"The AI service timed out or is offline. Your Co-Pilot can still offer prewritten encouragement."});
  }finally{clearTimeout(timer)}
}
