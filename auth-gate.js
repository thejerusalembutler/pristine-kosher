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
        <img src="logo/pk-logo.jpg" alt="Pristine Kosher" style="display:block;margin:0 auto 18px;width:150px;height:auto">
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

  // Floating universal customer search — appears on every staff page.
  // Type name/email/phone + Enter → jumps to the customer page with the query.
  function addSearchBar(){
    if(document.getElementById('pkSearchBar')) return;
    // don't add it on the customer page itself (it has its own search)
    if(location.pathname.endsWith('customers.html')) return;
    const bar = document.createElement('div');
    bar.id = 'pkSearchBar';
    bar.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9998;display:flex;align-items:center;gap:0;background:rgba(255,255,255,.96);border:1.5px solid #E4E8E7;border-radius:11px;box-shadow:0 6px 24px rgba(0,0,0,.12);overflow:hidden';
    bar.innerHTML = `
      <span style="padding:0 4px 0 12px;color:#5C6663;font-size:14px">🔍</span>
      <input id="pkSearchInput" placeholder="Find customer…" style="border:none;outline:none;padding:10px 12px 10px 6px;font-size:14px;font-family:inherit;width:180px;background:transparent;color:#0A0A0A">`;
    document.body.appendChild(bar);
    const inp = bar.querySelector('#pkSearchInput');
    inp.addEventListener('keydown', e=>{
      if(e.key==='Enter' && inp.value.trim()){
        location.href = `customers.html?q=${encodeURIComponent(inp.value.trim())}`;
      }
    });
  }

  // public API
  window.PKAuth = {
    async protect(onReady){
      if(await validSession()){ addSearchBar(); onReady(); }
      else { showGate(()=>{ addSearchBar(); onReady(); }); }
    },
    logout,
    token,
    headers: authHeaders,
    SUPABASE_URL, SUPABASE_KEY
  };
})();
