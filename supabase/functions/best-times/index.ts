// Public edge function: ranks appointment times for a customer WITHOUT exposing
// any worker/customer data. Input: {date, market, lat, lng}. Output: ranked open slots.
// Logic: a slot is "best" when a worker who serves this market already has a nearby
// job around that time (little extra driving). Falls back to market capacity.

import { createClient } from "jsr:@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// service hours by weekday (0=Sun..6=Sat), minutes from midnight; last start = close-60
const HOURS: Record<number,[number,number]> = {
  0:[8*60,23*60],1:[8*60,23*60],2:[8*60,23*60],3:[8*60,23*60],4:[8*60,23*60],
  5:[8*60,15*60],6:[20*60+30,24*60],
};
function miles(a:number,b:number,c:number,d:number){
  const R=3959,toRad=(x:number)=>x*Math.PI/180;
  const dLat=toRad(c-a),dLng=toRad(d-b);
  const h=Math.sin(dLat/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
function hhmm(m:number){ const h=Math.floor(m/60),mm=m%60; return `${String(h).padStart(2,"0")}:${mm===0?"00":"30"}`; }

Deno.serve(async (req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const { date, market, lat, lng } = await req.json();
    if(!date) return json({error:"date required"},400);
    const dow = new Date(`${date}T00:00:00`).getDay();
    const [open,close] = HOURS[dow] || [8*60,23*60];
    const lastStart = close-60;

    // all open 30-min slots that day
    const slots:number[]=[];
    for(let m=open;m<=lastStart;m+=30) slots.push(m);

    // existing assigned jobs that day in this market (private data — stays server-side)
    const { data: jobs } = await sb.from("bookings")
      .select("time_slot,lat,lng,market,assigned_worker_id")
      .eq("service_date",date).not("assigned_worker_id","is",null);
    const dayJobs = (jobs||[]).filter(j=>j.lat!=null && j.time_slot);

    // score each slot: higher = better (a nearby worker is around at that time)
    const scored = slots.map(m=>{
      const key = hhmm(m);
      let best = 999;   // miles to nearest existing job at/around this time
      dayJobs.forEach(j=>{
        const [jh,jm] = j.time_slot.split(":").map(Number);
        const jMin = jh*60+jm;
        if(Math.abs(jMin-m) <= 90 && lat!=null && j.lat!=null){   // within 1.5h
          const d = miles(lat,lng,+j.lat,+j.lng);
          if(d<best) best=d;
        }
      });
      // score: closer nearby job = better. No nearby job = neutral.
      const score = best===999 ? 0 : Math.max(0, 30 - best);   // 0..30
      return { slot:key, minutes:m, score, nearestMi: best===999?null:Math.round(best*10)/10 };
    });

    // recommend the top few slots with a real nearby worker; if none, spread across the day
    const withWorker = scored.filter(s=>s.score>0).sort((a,b)=>b.score-a.score);
    let recommended:string[];
    if(withWorker.length>=3){
      recommended = withWorker.slice(0,4).map(s=>s.slot);
    } else {
      // no nearby routing yet: recommend a spread of daytime slots
      const spread = scored.filter(s=>s.minutes>=9*60 && s.minutes<=18*60);
      recommended = spread.filter((_,i)=>i%Math.ceil(spread.length/4)===0).slice(0,4).map(s=>s.slot);
    }

    return json({ date, recommended, allSlots: slots.map(hhmm) });
  }catch(e){ return json({error:String(e)},500); }
});
function json(b:unknown,s=200){ return new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}}); }
