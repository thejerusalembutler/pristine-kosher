/* Shared staff login gate for Pristine Kosher admin pages.
   Usage: include this script, then call PKAuth.protect(onReady).
   - If a valid session exists, onReady() runs and the page shows.
   - Otherwise a login overlay is shown; on success, onReady() runs.
   Booking + application pages do NOT include this (they stay public). */
(function(){
  const SUPABASE_URL = 'https://qkgdobpazyoxesyiznus.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_cjaMPpEPhe-HxUd616SSRg_ShraAso2';
  const AUTH = `${SUPABASE_URL}/auth/v1`;
  const TOKEN_KEY = 'pk_staff_token';

  function token(){ return localStorage.getItem(TOKEN_KEY); }

  async function validSession(){
    const t = token();
    if(!t) return false;
    try{
      const res = await fetch(`${AUTH}/user`, { headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${t}` } });
      return res.ok;
    }catch(e){ return false; }
  }

  async function login(email, password){
    const res = await fetch(`${AUTH}/token?grant_type=password`, {
      method:'POST',
      headers:{ apikey:SUPABASE_KEY, 'Content-Type':'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if(res.ok && data.access_token){ localStorage.setItem(TOKEN_KEY, data.access_token); return true; }
    throw new Error(data.error_description || data.msg || 'Wrong email or password.');
  }

  function logout(){ localStorage.removeItem(TOKEN_KEY); location.reload(); }

  function showGate(onReady){
    const gate = document.createElement('div');
    gate.id = 'pkLoginGate';
    gate.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0A0A0A;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Poppins,-apple-system,sans-serif';
    gate.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:32px;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4)">
        <svg width="44" height="44" viewBox="0 0 100 100" style="display:block;margin:0 auto 16px">
          <rect x="8" y="14" width="40" height="72" fill="#0A0A0A"/>
          <path d="M20 30 h14 a13 13 0 0 1 0 26 h-14 z" fill="#fff"/>
          <rect x="20" y="30" width="6" height="26" fill="#fff"/>
          <path d="M50 14 h22 L46 50 L72 86 H50 L28 52 z" fill="#20A59F"/>
        </svg>
        <h2 style="text-align:center;margin:0 0 4px;font-size:19px;color:#0A0A0A">Staff sign-in</h2>
        <p style="text-align:center;color:#5C6663;font-size:13px;margin:0 0 20px">Pristine Kosher operations</p>
        <input id="pkEmail" type="email" placeholder="Email" autocomplete="username" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #E4E8E7;border-radius:10px;font-size:15px;margin-bottom:10px;color:#0A0A0A">
        <input id="pkPass" type="password" placeholder="Password" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #E4E8E7;border-radius:10px;font-size:15px;margin-bottom:14px;color:#0A0A0A">
        <button id="pkBtn" style="width:100%;padding:13px;background:#20A59F;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Sign in</button>
        <div id="pkErr" style="color:#D64545;font-size:13px;text-align:center;margin-top:12px;min-height:18px"></div>
      </div>`;
    document.body.appendChild(gate);
    const err = gate.querySelector('#pkErr');
    async function attempt(){
      err.textContent='';
      const e=gate.querySelector('#pkEmail').value.trim(), p=gate.querySelector('#pkPass').value;
      if(!e||!p){ err.textContent='Enter your email and password.'; return; }
      try{ await login(e,p); gate.remove(); onReady(); }
      catch(ex){ err.textContent=ex.message; }
    }
    gate.querySelector('#pkBtn').addEventListener('click',attempt);
    gate.querySelector('#pkPass').addEventListener('keydown',ev=>{ if(ev.key==='Enter') attempt(); });
    setTimeout(()=>gate.querySelector('#pkEmail').focus(),100);
  }

  // Auth headers for data requests: use the logged-in user's token so RLS
  // can recognize a signed-in staff member. Falls back to the publishable key.
  function authHeaders(extra){
    const t = token();
    return Object.assign({
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${t || SUPABASE_KEY}`
    }, extra||{});
  }

  // public API
  window.PKAuth = {
    async protect(onReady){
      if(await validSession()){ onReady(); }
      else { showGate(onReady); }
    },
    logout,
    token,
    headers: authHeaders,
    SUPABASE_URL, SUPABASE_KEY
  };
})();
