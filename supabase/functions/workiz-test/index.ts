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

// A short, safe search request body: ask for a few jobs.
const searchBody = { entityType: "job", limit: 3 };

// Candidate auth styles to try, in order. First one that returns real data wins.
function attempts(): { name: string; url: string; init: RequestInit }[] {
  const jsonHeaders = { "Content-Type": "application/json" };
  return [
    {
      name: "POST body + auth headers (auth-key/auth-secret)",
      url: `${BASE}/search`,
      init: { method: "POST", headers: { ...jsonHeaders, "auth-key": TOKEN, "auth-secret": SECRET }, body: JSON.stringify(searchBody) },
    },
    {
      name: "POST body + Authorization Bearer token",
      url: `${BASE}/search`,
      init: { method: "POST", headers: { ...jsonHeaders, Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(searchBody) },
    },
    {
      name: "POST body + apikey/apisecret headers",
      url: `${BASE}/search`,
      init: { method: "POST", headers: { ...jsonHeaders, apikey: TOKEN, apisecret: SECRET }, body: JSON.stringify(searchBody) },
    },
    {
      name: "GET with token+secret in query",
      url: `${BASE}/search?token=${encodeURIComponent(TOKEN)}&secret=${encodeURIComponent(SECRET)}&entityType=job&limit=3`,
      init: { method: "GET" },
    },
    {
      name: "GET with token+secret headers",
      url: `${BASE}/search?entityType=job&limit=3`,
      init: { method: "GET", headers: { "auth-key": TOKEN, "auth-secret": SECRET } },
    },
    {
      name: "v1-style: token in URL path, GET job/all",
      url: `https://api.workiz.com/api/v1/job/all/${TOKEN}/?records=3&offset=0`,
      init: { method: "GET" },
    },
    {
      name: "v2 token in path: /crm/api/v2/{token}/search",
      url: `${BASE}/${TOKEN}/search?entityType=job&limit=3`,
      init: { method: "GET", headers: { "auth-secret": SECRET } },
    },
    {
      name: "POST body includes token+secret",
      url: `${BASE}/search`,
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...searchBody, token: TOKEN, secret: SECRET }) },
    },
    {
      name: "X-API headers (X-API-Key / X-API-Secret)",
      url: `${BASE}/search`,
      init: { method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": TOKEN, "X-API-Secret": SECRET }, body: JSON.stringify(searchBody) },
    },
    {
      name: "Basic auth (token:secret)",
      url: `${BASE}/search`,
      init: { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`${TOKEN}:${SECRET}`)}` }, body: JSON.stringify(searchBody) },
    },
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
