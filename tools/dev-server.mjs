/*
 * 로컬 개발 서버: 정적 파일 + 챗봇 API(/api/chat). API 키는 .env에서만 읽는다.
 *   node tools/dev-server.mjs   → http://localhost:5500 (PORT로 변경)
 * .env: OPENAI_API(또는 OPENAI_API_KEY), UPSTAGE_API_KEY, OPENAI_MODEL(선택)
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { answerChat, cleanMessages, DEFAULT_MODEL } from "../supabase/functions/chat/core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const get = (...names) => names.map((n) => process.env[n] || env[n]).find(Boolean) || "";
const OPENAI_KEY = get("OPENAI_API_KEY", "OPENAI_API");
const UPSTAGE_KEY = get("UPSTAGE_API_KEY", "UPSTAGE_API");
const MODEL = get("OPENAI_MODEL") || DEFAULT_MODEL;
const PORT = Number(get("PORT")) || 5500;

// Supabase 주소·publishable 키는 js/supabase.js 한 곳에서 관리한다
const sbjs = fs.readFileSync(path.join(ROOT, "js/supabase.js"), "utf8");
const db = { url: sbjs.match(/SUPABASE_URL = "([^"]+)"/)[1], key: sbjs.match(/SUPABASE_KEY = "([^"]+)"/)[1] };

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };
const send = (res, status, body, type = "application/json; charset=utf-8") => { res.writeHead(status, { "Content-Type": type }); res.end(body); };

async function chat(req, res) {
  let raw = "";
  for await (const c of req) { raw += c; if (raw.length > 20000) return send(res, 413, JSON.stringify({ ok: false, message: "요청이 너무 깁니다." })); }
  try {
    if (!OPENAI_KEY || !UPSTAGE_KEY) return send(res, 200, JSON.stringify({ ok: false, code: "NOT_CONFIGURED", message: ".env에 OPENAI_API, UPSTAGE_API_KEY를 넣어 주세요." }));
    const { history, error } = cleanMessages(JSON.parse(raw || "{}").messages);
    if (error) return send(res, 200, JSON.stringify({ ok: false, message: error }));
    send(res, 200, JSON.stringify({ ok: true, ...(await answerChat({ history, db, upstageKey: UPSTAGE_KEY, openaiKey: OPENAI_KEY, model: MODEL })) }));
  } catch (e) {
    console.error(e);
    send(res, 200, JSON.stringify({ ok: false, code: "SERVER_ERROR", message: "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요." }));
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/chat" && req.method === "POST") return chat(req, res);
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(ROOT, rel);
  // 저장소 밖 경로와 숨김 경로(.env, .git/, .claude/ 등)는 내주지 않는다
  if (!file.startsWith(ROOT + path.sep) || path.relative(ROOT, file).split(path.sep).some((p) => p.startsWith(".")) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, "Not found", "text/plain");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "localhost", () => console.log(`http://localhost:${PORT}  (챗봇: OpenAI ${OPENAI_KEY ? "O" : "X"}, Upstage ${UPSTAGE_KEY ? "O" : "X"}, 모델 ${MODEL})`));
