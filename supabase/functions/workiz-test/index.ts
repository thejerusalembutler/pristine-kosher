// Self-diagnosing Workiz API connection test.
// Goal: figure out (a) whether the API works on this plan, and
// (b) exactly which auth format Workiz's v2 API accepts.
// It tries several standard header/URL styles against the real /crm/api/v2/search
// endpoint and reports which one returned data. Read-only — only lists jobs.

const TOKEN = Deno.env.get("WORKIZ_API_TOKEN") ?? "";
const SECRET = Deno.env.get("WORKIZ_API_SECRET") ?? "";
const BASE = "https://api.workiz.com/crm/api/v2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Real endpoint (from the docs screenshot): GET /crm/api/v2/jobs?pageSize=3
const JOBS = `${BASE}/jobs?pageSize=3&page=1`;

// Candidate auth styles to try against the REAL /jobs endpoint. First that returns data wins.
function attempts(): { name: string; url: string; init: RequestInit }[] {
  // Docs say: Authorization: Bearer <token>. Try every plausible <token> value.
  return [
    { name: "Bearer token",
      url: JOBS, init: { method: "GET", headers: { Authorization: `Bearer ${TOKEN}` } } },
    { name: "Bearer secret",
      url: JOBS, init: { method: "GET", headers: { Authorization: `Bearer ${SECRET}` } } },
    { name: "Bearer token:secret",
      url: JOBS, init: { method: "GET", headers: { Authorization: `Bearer ${TOKEN}:${SECRET}` } } },
    { name: "Bearer secret:token",
      url: JOBS, init: { method: "GET", headers: { Authorization: `Bearer ${SECRET}:${TOKEN}` } } },
    { name: "Bearer token.secret",
      url: JOBS, init: { method: "GET", headers: { Authorization: `Bearer ${TOKEN}.${SECRET}` } } },
    { name: "Bearer base64(token:secret)",
      url: JOBS, init: { method: "GET", headers: { Authorization: `Bearer ${btoa(`${TOKEN}:${SECRET}`)}` } } },
    { name: "Bearer token+secret concatenated",
      url: JOBS, init: { method: "GET", headers: { Authorization: `Bearer ${TOKEN}${SECRET}` } } },
    { name: "Bearer token (strip api_ prefix)",
      url: JOBS, init: { method: "GET", headers: { Authorization: `Bearer ${TOKEN.replace(/^api_/, "")}` } } },
    { name: "Bearer secret (strip sec_ prefix)",
      url: JOBS, init: { method: "GET", headers: { Authorization: `Bearer ${SECRET.replace(/^sec_/, "")}` } } },
    { name: "Bearer token secret (space)",
      url: JOBS, init: { method: "GET", headers: { Authorization: `Bearer ${TOKEN} ${SECRET}` } } },
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!TOKEN || !SECRET) {
    return json({
      ok: false,
      problem: "Missing secrets",
      detail: "WORKIZ_API_TOKEN and/or WORKIZ_API_SECRET are not set in Supabase. Run: supabase secrets set WORKIZ_API_TOKEN=... and WORKIZ_API_SECRET=...",
      have_token: !!TOKEN, have_secret: !!SECRET,
    }, 400);
  }

  const results: unknown[] = [];
  for (const a of attempts()) {
    try {
      const res = await fetch(a.url, a.init);
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch (_) { /* keep raw */ }
      const looksLikeData = res.ok && typeof parsed === "object" && parsed !== null && "data" in (parsed as Record<string, unknown>);
      results.push({
        attempt: a.name,
        httpStatus: res.status,
        success: looksLikeData,
        sample: looksLikeData ? summarize(parsed) : String(text).slice(0, 200),
      });
      if (looksLikeData) {
        return json({
          ok: true,
          message: "✅ Workiz API works on this plan!",
          winningAuth: a.name,
          totalResults: (parsed as Record<string, unknown>)["totalResults"] ?? "unknown",
          triedBefore: results.length - 1,
          allAttempts: results,
        });
      }
    } catch (e) {
      results.push({ attempt: a.name, error: String(e) });
    }
  }

  return json({
    ok: false,
    message: "❌ None of the standard auth formats returned data.",
    hint: "The API may need Ultimate/Developer add-on, or a different auth style. Send me the 'allAttempts' block and I'll adjust.",
    allAttempts: results,
  });
});

function summarize(parsed: unknown): unknown {
  const p = parsed as Record<string, unknown>;
  const data = Array.isArray(p.data) ? p.data : [];
  return { totalResults: p.totalResults, returned: data.length, firstJob: data[0] ?? null };
}
function json(x: unknown, s = 200) {
  return new Response(JSON.stringify(x, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
