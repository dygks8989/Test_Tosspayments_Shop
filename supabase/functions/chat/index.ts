// 쇼핑 도우미 챗봇 서버 함수. 답변 로직은 core.js(로컬 서버 tools/dev-server.mjs와 공용)에 있다.
//  - { messages }        : 질문 → Upstage 임베딩 검색 → OpenAI 답변 (OPENAI_API_KEY 시크릿이 있어야 동작)
//  - { action: "sync" }  : embedding이 빈 chat_documents를 Upstage로 채운다 (UPSTAGE_API_KEY만 필요)
// (Supabase에 배포된 함수 `chat`의 소스 사본. core.js와 함께 배포해야 반영된다. 로그인 없이 호출하므로 verify_jwt=false)
import { createClient } from "npm:@supabase/supabase-js@2";
import { answerChat, cleanMessages, DEFAULT_MODEL, embedPending } from "./core.js";

// 시크릿 이름은 .env와 맞춘 별칭(OPENAI_API, UPSTAGE_API)도 받는다
const env = (...names: string[]) => names.map((n) => Deno.env.get(n)?.trim()).find(Boolean) ?? "";
const OPENAI_KEY = env("OPENAI_API_KEY", "OPENAI_API");
const OPENAI_MODEL = env("OPENAI_MODEL") || DEFAULT_MODEL;
const UPSTAGE_KEY = env("UPSTAGE_API_KEY", "UPSTAGE_API");
const db = { url: Deno.env.get("SUPABASE_URL")!, key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! };
const admin = createClient(db.url, db.key);

const RATE_LIMIT = 20; // 같은 접속자 10분당 최대 요청 수

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });
const fail = (message: string, code = "BAD_REQUEST") => json({ ok: false, code, message });
const NOT_CONFIGURED = "챗봇 설정이 아직 끝나지 않았어요. 잠시 후 다시 이용해 주세요.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (!UPSTAGE_KEY) return fail(NOT_CONFIGURED, "NOT_CONFIGURED");
    if (!(await allow(req))) return fail("요청이 너무 많아요. 잠시 후 다시 시도해 주세요.", "RATE_LIMITED");

    if (body.action === "sync") return json({ ok: true, embedded: await embedPending(db, UPSTAGE_KEY) });

    if (!OPENAI_KEY) return fail(NOT_CONFIGURED, "NOT_CONFIGURED");
    const { history, error } = cleanMessages(body.messages);
    if (error) return fail(error);
    await embedPending(db, UPSTAGE_KEY);
    return json({ ok: true, ...(await answerChat({ history, db, upstageKey: UPSTAGE_KEY, openaiKey: OPENAI_KEY, model: OPENAI_MODEL })) });
  } catch (e) {
    console.error(e);
    return fail("답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", "SERVER_ERROR");
  }
});

/* 접속자(IP 해시)별 10분당 요청 수 제한 */
async function allow(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("wearhouse-chat:" + ip));
  const client = [...new Uint8Array(hash)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin.from("chat_requests").select("id", { count: "exact", head: true }).eq("client", client).gte("created_at", since);
  if ((count ?? 0) >= RATE_LIMIT) return false;
  await admin.from("chat_requests").insert({ client });
  return true;
}
