/*
 * 챗봇 검색 문서 생성기: llms-full.txt를 정책 / FAQ / 카테고리 / 상품 단위로 잘라
 * supabase/chat-docs.sql(chat_documents 갱신 SQL)을 만든다.
 *
 *   node tools/seo-build.mjs      # llms-full.txt 최신화 (상품·문구가 바뀌었을 때)
 *   node tools/chat-docs.mjs      # supabase/chat-docs.sql 생성
 *   → SQL을 Supabase SQL 편집기(또는 MCP execute_sql)로 실행
 *
 * 내용이 바뀐 문서만 embedding이 비워지고, Edge Function chat이 다음 질문 때 Upstage로 다시 계산한다.
 * 가격·재고·평점은 문서에서 빼고 답변할 때 DB에서 실시간으로 붙인다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "llms-full.txt");
const OUT = path.join(ROOT, "supabase", "chat-docs.sql");

const text = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");
const lines = text.split("\n");

// 실시간 정보로 대신하는 줄 (오래된 값이 답변에 섞이지 않게)
const LIVE_LINE = /^- (가격|재고 상태|후기):/;

const docs = [];
const add = (d) => docs.push({ url: null, product_id: null, ...d, content: d.content.trim() });

/* ## 단위로 나누기 */
const sections = [];
let cur = null;
for (const line of lines) {
  if (line.startsWith("## ")) sections.push((cur = { head: line.slice(3).trim(), body: [] }));
  else if (cur) cur.body.push(line);
}
const intro = lines.slice(0, lines.findIndex((l) => l.startsWith("## "))).filter((l) => l.startsWith("> ") && !l.includes("기준일")).map((l) => l.slice(2)); // 날짜 줄은 매번 바뀌어 재임베딩을 부르므로 뺀다

for (const sec of sections) {
  if (sec.head === "쇼핑 정책") {
    add({ id: "policy:shop", kind: "policy", title: "쇼핑 정책", url: "faq.html", content: [...intro, "", ...sec.body].join("\n") });
    continue;
  }
  if (sec.head === "자주 묻는 질문") {
    let group = "";
    let q = null;
    let n = 0;
    const flush = () => {
      if (q) add({ id: `faq:${++n}`, kind: "faq", title: q.q, url: "faq.html", content: `[${group}] Q. ${q.q}\nA. ${q.a.join(" ").trim()}` });
      q = null;
    };
    for (const l of sec.body) {
      if (l.startsWith("### ")) { flush(); group = l.slice(4).trim(); }
      else if (/^\*\*Q\. /.test(l)) { flush(); q = { q: l.replace(/^\*\*Q\. |\*\*$/g, "").trim(), a: [] }; }
      else if (q && l.trim()) q.a.push(l.replace(/^A\. /, ""));
    }
    flush();
    continue;
  }
  const m = sec.head.match(/^(\S+) \(\d+개\)$/);
  if (!m) continue;
  // 카테고리: ### 이전은 카테고리 안내(소재·사이즈표), ### 부터는 상품
  const label = m[1];
  const first = sec.body.findIndex((l) => l.startsWith("### "));
  const catBody = (first < 0 ? sec.body : sec.body.slice(0, first)).join("\n");
  const catSummary = catBody.split("\n").find((l) => l.trim()) || "";
  add({ id: `category:${label}`, kind: "category", title: `${label} 카테고리 안내·사이즈표`, content: `${label} 카테고리\n${catBody}` });

  let p = null;
  const flush = () => {
    if (!p) return;
    const id = p.body.join("\n").match(/품번: ([A-Z]\d{3})/)?.[1];
    if (id) add({
      id: `product:${id}`, kind: "product", title: p.title, product_id: id, url: `product-${id}.html`,
      content: [`[${label}] ${p.title}`, ...p.body.filter((l) => l.trim() && !LIVE_LINE.test(l) && !l.startsWith("- 주소:")), `카테고리 공통: ${catSummary}`].join("\n"),
    });
    p = null;
  };
  for (const l of first < 0 ? [] : sec.body.slice(first)) {
    if (l.startsWith("### ")) { flush(); p = { title: l.slice(4).replace(/^\d+\.\s*/, "").trim(), body: [] }; }
    else if (p) p.body.push(l);
  }
  flush();
}

const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const values = docs.map((d) => `  (${[d.id, d.kind, d.title, d.content, d.url, d.product_id].map(q).join(", ")})`).join(",\n");
const sql = `-- tools/chat-docs.mjs가 llms-full.txt에서 생성. 직접 고치지 말 것.
-- 내용이 바뀐 문서는 embedding을 비워 두고, Edge Function chat이 다음 요청 때 다시 계산한다.
begin;
insert into public.chat_documents (id, kind, title, content, url, product_id) values
${values}
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, content = excluded.content, url = excluded.url, product_id = excluded.product_id,
  embedding = case when chat_documents.content is distinct from excluded.content or chat_documents.title is distinct from excluded.title
                   then null else chat_documents.embedding end,
  updated_at = case when chat_documents.content is distinct from excluded.content or chat_documents.title is distinct from excluded.title
                    then now() else chat_documents.updated_at end;
delete from public.chat_documents where id not in (${docs.map((d) => q(d.id)).join(", ")});
commit;
`;
fs.writeFileSync(OUT, sql);
const count = (k) => docs.filter((d) => d.kind === k).length;
console.log(`${path.relative(ROOT, OUT)}: 문서 ${docs.length}개 (정책 ${count("policy")}, FAQ ${count("faq")}, 카테고리 ${count("category")}, 상품 ${count("product")})`);
