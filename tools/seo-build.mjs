/*
 * SEO / AEO / GEO 정적 산출물 생성기
 *
 * 이 쇼핑몰은 상품·가격을 브라우저에서 JS로 그려서, 검색 로봇과 AI 크롤러(대부분 JS를 실행하지 않음)는
 * 빈 화면만 보게 된다. 이 스크립트가 Supabase 공개 데이터(products / product_sizes / product_stats / reviews)를 읽어서
 * 아래를 "정적 HTML"로 미리 만들어 둔다. 브라우저에서는 기존 JS가 그대로 덮어써서 화면은 변하지 않는다.
 *
 *  - 각 페이지 <head>: title, description, canonical, robots, Open Graph, Twitter, JSON-LD(구조화 데이터)
 *  - 카테고리 페이지: 상품 목록 링크, 가이드, FAQ  (FAQPage / ItemList / CollectionPage JSON-LD)
 *  - 상품 상세 정적 페이지 product-{id}.html (Product / Offer / BreadcrumbList / FAQPage JSON-LD)
 *  - about.html, faq.html (브랜드·정책 설명)
 *  - sitemap.xml, robots.txt, llms.txt, llms-full.txt, products.json
 *
 * 실행:  node tools/seo-build.mjs          (상품·가격·후기가 바뀔 때마다 다시 실행하고 커밋)
 * 환경변수: SITE_URL  (기본값은 아래 DEFAULT_SITE)
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SITE = "https://testtosspaymentsshop-xi.vercel.app";
const SITE = (process.env.SITE_URL || DEFAULT_SITE).replace(/\/+$/, "");
const BRAND = "WEARHOUSE";
/* 네이버 서치어드바이저 소유확인 메타태그 값 (content 값만). 예: NAVER_VERIFICATION=abc123 node tools/seo-build.mjs */
const NAVER_VERIFICATION = process.env.NAVER_VERIFICATION || "";
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
const write = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);

/* ---------- 공용 상수 (js/products.js 를 그대로 읽어 재사용) ---------- */
const ctx = vm.createContext({});
vm.runInContext(read("js/products.js") + "\n;this.__d = { CATEGORIES, DETAILS, SIZE_TABLES };", ctx);
const { CATEGORIES, DETAILS, SIZE_TABLES } = ctx.__d;

const supa = read("js/supabase.js");
const SUPABASE_URL = supa.match(/SUPABASE_URL = "([^"]+)"/)[1];
const SUPABASE_KEY = supa.match(/SUPABASE_KEY = "([^"]+)"/)[1];

async function rest(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: { apikey: SUPABASE_KEY } });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

/* ---------- 헬퍼 ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
const rate = (p) => Math.round((1 - p.sale / p.price) * 100);
const url = (p = "") => `${SITE}/${p}`.replace(/\/$/, p ? "" : "/");
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const join = (arr) => arr.join(", ");
const plus1y = new Date(NOW.getTime() + 365 * 864e5).toISOString().slice(0, 10);
const ROBOTS_INDEX = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const ROBOTS_NO = "noindex, nofollow";

function inject(html, name, content) {
  const re = new RegExp(`<!--SEO:${name}-->[\\s\\S]*?<!--/SEO:${name}-->`);
  if (!re.test(html)) throw new Error(`마커 없음: SEO:${name}`);
  return html.replace(re, () => `<!--SEO:${name}-->\n${content}\n<!--/SEO:${name}-->`);
}

/* ---------- 데이터 ---------- */
const [prodRows, statRows, reviewRows] = await Promise.all([
  rest("products", "select=*,product_sizes(size,stock)&order=id"),
  rest("product_stats", "select=*"),
  rest("reviews", "select=product_id,rating,content,author_name,created_at&order=created_at.desc&limit=1000"),
]);
const stats = new Map(statRows.map((s) => [s.product_id, s]));
const PRODUCTS = prodRows.map((r) => {
  const s = stats.get(r.id) || {};
  const sizeOrder = CATEGORIES[r.cat].sizes;
  return {
    id: r.id, cat: r.cat, sub: r.sub, brand: r.brand, name: r.name, price: r.price, sale: r.sale,
    image: r.image_path, badge: r.badge, created: r.created_at,
    rating: Number(s.rating || 0), reviews: s.review_count || 0, likes: s.like_count || r.like_count || 0,
    stock: Object.fromEntries(r.product_sizes.map((z) => [z.size, z.stock])),
    sizes: sizeOrder,
    inStock: r.product_sizes.some((z) => z.stock > 0),
  };
});
const byCat = (cat) => PRODUCTS.filter((p) => p.cat === cat);
const reviewsOf = (id) => reviewRows.filter((r) => r.product_id === id);
const productUrl = (p) => url(`product-${p.id}.html`);
const brands = [...new Set(PRODUCTS.map((p) => p.brand))].sort();

/* ---------- 사이트 공통 정책 문구 (사이트에 실제로 구현된 규칙만 적는다) ---------- */
const SHIP = "무료배송이며, 오후 2시 이전에 결제하면 당일 출발합니다.";
const PAY = "토스페이·카드·계좌이체·간편결제(토스페이먼츠 결제위젯)";
const CANCEL =
  "결제완료·상품준비중 상태에서는 마이페이지 주문 상세에서 바로 취소할 수 있고 결제 금액이 취소되며 재고가 복원됩니다. " +
  "배송중에는 취소할 수 없고, 배송완료 후 7일 이내에는 환불을 요청할 수 있습니다.";
const DEMO =
  `${BRAND}는 실제 상품을 판매하지 않는 퍼블리싱·결제 연동 데모 쇼핑몰입니다. 결제는 토스페이먼츠 테스트 환경에서 이뤄져 실제 금액이 청구되지 않고, 상품과 브랜드는 모두 가상입니다.`;

/* ---------- 공통 <head> ---------- */
const ORG = {
  "@type": "Organization",
  "@id": url("#organization"),
  name: BRAND,
  url: url(),
  logo: { "@type": "ImageObject", url: url("favicon.svg") },
  description: `${BRAND}는 상의·신발·바지를 모은 온라인 패션 스토어 데모입니다. 토스페이먼츠 결제위젯 v2와 Supabase로 회원·장바구니·결제·주문 취소/환불·후기까지 구현했습니다.`,
  knowsAbout: ["온라인 패션 쇼핑몰", "상의", "신발", "바지", "토스페이먼츠 결제 연동"],
};
const WEBSITE = { "@type": "WebSite", "@id": url("#website"), url: url(), name: BRAND, inLanguage: "ko-KR", publisher: { "@id": url("#organization") } };

function breadcrumb(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, item: href })),
  };
}
function faqLd(faqs) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

function head({ title, desc, file, image, imageAlt, robots = ROBOTS_INDEX, ogType = "website", graph = [], extra = [] }) {
  const canonical = file === "index.html" ? url() : url(file);
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="robots" content="${robots}">`,
    `<meta name="theme-color" content="#000000">`,
    `<meta name="format-detection" content="telephone=no">`,
    `<link rel="canonical" href="${canonical}">`,
    `<link rel="icon" href="favicon.svg" type="image/svg+xml">`,
    `<link rel="alternate" type="text/plain" href="${url("llms.txt")}" title="LLM 안내 (llms.txt)">`,
    `<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>`,
    `<link rel="preconnect" href="${SUPABASE_URL}" crossorigin>`,
    `<meta property="og:site_name" content="${BRAND}">`,
    `<meta property="og:locale" content="ko_KR">`,
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${canonical}">`,
  ];
  if (image) {
    lines.push(
      `<meta property="og:image" content="${esc(image)}">`,
      `<meta property="og:image:width" content="800">`,
      `<meta property="og:image:height" content="960">`,
      `<meta property="og:image:alt" content="${esc(imageAlt || title)}">`,
    );
  }
  lines.push(
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
  );
  if (image) lines.push(`<meta name="twitter:image" content="${esc(image)}">`);
  lines.push(...extra);
  if (NAVER_VERIFICATION && file === "index.html") lines.push(`<meta name="naver-site-verification" content="${esc(NAVER_VERIFICATION)}">`);
  if (graph.length) lines.push(ld({ "@context": "https://schema.org", "@graph": graph }));
  return lines.map((l) => "  " + l).join("\n");
}

/* ---------- 정적 내비게이션 / 푸터 (JS가 없어도 내부 링크가 보이도록) ---------- */
const NAV = `<nav class="static-nav" aria-label="주요 메뉴"><a href="index.html">${BRAND}</a> ${Object.values(CATEGORIES)
  .map((c) => `<a href="${c.page}">${c.label}</a>`).join(" ")} <a href="about.html">브랜드 소개</a> <a href="faq.html">자주 묻는 질문</a></nav>`;
const FOOT = `<footer class="footer"><div class="inner"><strong>${BRAND}</strong> ${esc(DEMO)}
<nav class="footer-links" aria-label="안내"><a href="about.html">브랜드 소개</a><a href="faq.html">자주 묻는 질문</a><a href="llms.txt">llms.txt</a><a href="sitemap.xml">사이트맵</a></nav></div></footer>`;

function chrome(html) {
  html = inject(html, "NAV", NAV);
  return inject(html, "FOOT", FOOT);
}

/* ---------- FAQ 블록 (화면에 보이는 문구와 JSON-LD가 같은 텍스트) ---------- */
function faqHtml(faqs, heading = "자주 묻는 질문") {
  return `<h2>${esc(heading)}</h2>
<div class="faq-list">
${faqs.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
</div>`;
}

/* =====================================================================
 * 카테고리 페이지
 * ===================================================================== */
const CAT_GUIDE = {
  tops: {
    keywords: "반팔 티셔츠·후드 티셔츠·셔츠·니트",
    lead: "반소매·긴소매 티셔츠부터 후드, 셔츠, 니트·스웨터까지 데일리로 입기 좋은 상의를 랭킹순으로 모았습니다.",
    guide: [
      ["핏으로 고르기", "오버핏은 어깨선이 내려오고 품이 넉넉해 레이어드에 좋고, 정사이즈는 단정해 셔츠나 니트와 잘 맞습니다. 상세 페이지의 사이즈표(총장·어깨너비·가슴단면·소매길이)를 평소 입는 옷과 비교해 보세요."],
      ["소재와 계절", "면 100%는 땀 흡수가 좋아 반팔·롱슬리브에 적합하고, 램스울·기모 소재는 가을·겨울 니트와 후드에 어울립니다. 린넨 블렌드 셔츠는 여름에 시원합니다."],
      ["관리 방법", "니트와 면 티셔츠는 30℃ 이하 단독 세탁을 권장합니다. 상품마다 세탁 정보가 상세 페이지에 있습니다."],
    ],
  },
  shoes: {
    keywords: "스니커즈·러닝화·로퍼·부츠·샌들",
    lead: "스니커즈, 러닝화, 로퍼, 부츠, 샌들까지 데일리 슈즈를 랭킹순으로 모았습니다.",
    guide: [
      ["사이즈 고르기", "사이즈는 발길이(mm) 기준이며 230부터 280까지 10mm 간격입니다. 평소 신는 신발의 안쪽 길이를 재서 상세 페이지의 사이즈표와 비교하세요."],
      ["용도로 고르기", "러닝화·트레이닝화는 쿠셔닝이 필요한 운동용, 스니커즈와 로퍼는 데일리·출근용, 부츠는 가을·겨울 스타일링에 어울립니다."],
      ["관리 방법", "가죽·스웨이드 신발은 전용 클리너를 쓰고 직사광선을 피해 보관하세요."],
    ],
  },
  pants: {
    keywords: "데님·슬랙스·코튼 팬츠·트레이닝 팬츠·숏 팬츠",
    lead: "데님, 슬랙스, 코튼 팬츠, 트레이닝 팬츠, 숏 팬츠를 랭킹순으로 모았습니다.",
    guide: [
      ["핏으로 고르기", "와이드 스트레이트는 다리선을 가리고 편안하며, 테이퍼드는 발목으로 갈수록 좁아져 단정합니다. 사이즈표의 허리·허벅지·밑단 단면을 확인하세요."],
      ["상황으로 고르기", "슬랙스는 출근·모임, 데님과 치노는 데일리, 조거·트랙 팬츠는 운동과 편한 일상, 버뮤다 숏 팬츠는 여름에 어울립니다."],
      ["관리 방법", "데님은 뒤집어서 찬물에 세탁하면 색 빠짐이 줄어듭니다."],
    ],
  },
};

function catFaqs(cat) {
  const c = CATEGORIES[cat];
  const list = byCat(cat);
  const top = list.slice(0, 3);
  const prices = list.map((p) => p.sale);
  const avgRate = Math.round(list.reduce((s, p) => s + rate(p), 0) / list.length);
  const cheapest = list.reduce((a, b) => (b.sale < a.sale ? b : a));
  const subs = c.subs.filter((s) => s !== "전체").map((s) => `${s} ${list.filter((p) => p.sub === s).length}개`);
  return [
    [`${BRAND} ${c.label} 랭킹 상위 상품은 무엇인가요?`,
      `${BRAND} ${c.label} 랭킹순 상위 3개는 ${top.map((p, i) => `${i + 1}위 ${p.brand} ${p.name}(${won(p.sale)})`).join(", ")}입니다.`],
    [`${c.label} 가격대는 어느 정도인가요?`,
      `현재 ${c.label} ${list.length}개 상품의 판매가는 ${won(Math.min(...prices))}부터 ${won(Math.max(...prices))}까지이며 평균 할인율은 약 ${avgRate}%입니다. 가장 저렴한 상품은 ${cheapest.brand} ${cheapest.name}(${won(cheapest.sale)})입니다.`],
    [`${c.label}에는 어떤 브랜드가 있나요?`,
      `${join([...new Set(list.map((p) => p.brand))])} 브랜드의 ${c.label} 상품을 판매합니다. 모두 ${BRAND} 데모를 위한 가상 브랜드입니다.`],
    [`${c.label}에는 어떤 종류가 있나요?`, `${subs.join(", ")}가 있으며 목록 상단 필터에서 종류별로 골라볼 수 있습니다.`],
    [`${c.label} 사이즈는 어떻게 고르나요?`,
      `${c.label} 사이즈는 ${c.sizes.join(", ")} 중에서 고를 수 있고, 상품 상세 페이지의 사이즈표(${SIZE_TABLES[cat].head.slice(1).join("·")})와 평소 입는 옷의 실측을 비교하면 됩니다. 측정 방법에 따라 1~3cm 오차가 있을 수 있습니다.`],
    [`배송비와 결제 방법은 어떻게 되나요?`, `배송은 ${SHIP} 결제는 ${PAY}로 할 수 있습니다.`],
  ];
}

function categoryPage(cat) {
  const c = CATEGORIES[cat];
  const g = CAT_GUIDE[cat];
  const list = byCat(cat);
  const faqs = catFaqs(cat);
  const file = c.page;
  const lo = Math.min(...list.map((p) => p.sale));
  const hi = Math.max(...list.map((p) => p.sale));
  const title = `${c.label} 랭킹 | ${g.keywords.split("·").slice(0, 3).join("·")} 인기 상품 | ${BRAND}`;
  const desc = cut(`${BRAND} ${c.label} 랭킹 ${list.length}개 — ${g.keywords}. ${won(lo)}부터 ${won(hi)}, 무료배송. 사이즈표와 후기를 확인하세요.`, 155);
  const home = url();
  const pageUrl = file === "index.html" ? home : url(file);

  const graph = [
    ORG, WEBSITE,
    {
      "@type": "CollectionPage", "@id": `${pageUrl}#page`, url: pageUrl, name: `${c.label} 랭킹`, description: desc,
      inLanguage: "ko-KR", isPartOf: { "@id": url("#website") }, about: { "@type": "Thing", name: c.label },
      dateModified: TODAY, mainEntity: { "@id": `${pageUrl}#list` },
    },
    {
      "@type": "ItemList", "@id": `${pageUrl}#list`, name: `${BRAND} ${c.label} 랭킹`, numberOfItems: list.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: list.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: productUrl(p), name: `${p.brand} ${p.name}`, image: p.image })),
    },
    breadcrumb([["홈", home], [c.label, pageUrl]]),
    faqLd(faqs),
  ];

  const gridFallback = list.map((p, i) =>
    `<a class="card" href="product-${p.id}.html"><div class="card-thumb"><img src="${esc(p.image)}" alt="${esc(p.brand)} ${esc(p.name)}" loading="lazy"><span class="rank">${i + 1}</span></div>` +
    `<div class="card-info"><p class="card-brand">${esc(p.brand)}</p><p class="card-name">${esc(p.name)}</p><p class="card-price"><span class="discount">${rate(p)}%</span>${won(p.sale)}</p></div></a>`).join("\n");

  const content = `<section class="seo-content">
<div class="inner">
<h2>${esc(c.label)} 랭킹 가이드</h2>
<p class="seo-answer">${esc(`${BRAND} ${c.label} 랭킹에는 ${join([...new Set(list.map((p) => p.brand))])} 등 ${list.length}개 상품이 있으며 판매가는 ${won(lo)}~${won(hi)}입니다. ${g.lead}`)}</p>
${g.guide.map(([h, t]) => `<h3>${esc(h)}</h3><p>${esc(t)}</p>`).join("\n")}
<h3>${esc(c.label)} 랭킹 TOP ${Math.min(5, list.length)}</h3>
<ol class="seo-top">${list.slice(0, 5).map((p) => `<li><a href="product-${p.id}.html">${esc(p.brand)} ${esc(p.name)}</a> — ${won(p.sale)} (${rate(p)}% 할인)</li>`).join("")}</ol>
${faqHtml(faqs, `${c.label} 자주 묻는 질문`)}
<p class="seo-note">${esc(DEMO)} <a href="about.html">브랜드 소개</a> · <a href="faq.html">전체 FAQ</a></p>
</div>
</section>`;

  let html = read(file);
  html = inject(html, "HEAD", head({ title, desc, file, image: list[0].image, imageAlt: `${list[0].brand} ${list[0].name}`, graph }));
  html = inject(html, "GRID", gridFallback);
  html = inject(html, "CONTENT", content);
  write(file, chrome(html));
}

/* =====================================================================
 * 상품 상세 정적 페이지
 * ===================================================================== */
function productFaqs(p) {
  const c = CATEGORIES[p.cat];
  const d = DETAILS[p.cat];
  const t = SIZE_TABLES[p.cat];
  const sizeNote = p.sizes.map((s) => (p.stock[s] > 0 ? s : `${s}(품절)`)).join(", ");
  return [
    [`${p.name}의 가격은 얼마인가요?`,
      `${p.brand} ${p.name}의 정가는 ${won(p.price)}이고 ${rate(p)}% 할인된 ${won(p.sale)}에 판매합니다. 구매확정 시 최대 ${won(Math.floor(p.sale * 0.03))}이 적립됩니다.`],
    [`${p.name}은(는) 어떤 사이즈가 있나요?`,
      `사이즈는 ${sizeNote}입니다. 상세 페이지 사이즈표 기준(${t.head.slice(1).join("·")})으로 평소 입는 옷과 비교해 고르세요.`],
    [`${p.name}의 소재와 핏, 세탁 방법은 무엇인가요?`,
      `소재는 ${d.material}, 핏은 ${d.fit}, 시즌은 ${d.season}입니다. 세탁은 ${d.wash}.`],
    [`배송비와 배송 기간은 어떻게 되나요?`, `${SHIP}`],
    [`교환·환불·취소는 어떻게 하나요?`, `${CANCEL}`],
    [`어떤 결제 방법을 쓸 수 있나요?`, `${PAY}로 결제할 수 있습니다. 결제 전에 로그인이 필요합니다.`],
  ];
}

function productPage(p, template) {
  const c = CATEGORIES[p.cat];
  const d = DETAILS[p.cat];
  const t = SIZE_TABLES[p.cat];
  const file = `product-${p.id}.html`;
  const pageUrl = productUrl(p);
  const catUrl = url(c.page);
  const faqs = productFaqs(p);
  const revs = reviewsOf(p.id);
  const rc = revs.length;
  const avg = rc ? Math.round((revs.reduce((s, r) => s + r.rating, 0) / rc) * 10) / 10 : 0;
  const title = cut(`${p.brand} ${p.name} | ${BRAND}`, 62);
  const desc = cut(`${p.brand} ${p.name} ${rate(p)}% 할인 ${won(p.sale)} (정가 ${won(p.price)}). ${d.material}, ${d.fit}, 사이즈 ${p.sizes.join("·")}. 무료배송, 사이즈표·후기 확인.`, 155);

  const product = {
    "@type": "Product", "@id": `${pageUrl}#product`, name: `${p.brand} ${p.name}`, url: pageUrl,
    description: `${p.brand}의 ${c.label}(${p.sub}) 「${p.name}」. 소재 ${d.material}, 핏 ${d.fit}, ${d.season}. 세탁: ${d.wash}.`,
    sku: p.id, image: [p.image], brand: { "@type": "Brand", name: p.brand },
    category: `의류 > ${c.label} > ${p.sub}`, material: d.material,
    offers: {
      "@type": "Offer", url: pageUrl, priceCurrency: "KRW", price: p.sale, priceValidUntil: plus1y,
      availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": url("#organization") },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "KRW" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "KR" },
        deliveryTime: { "@type": "ShippingDeliveryTime", handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" } },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy", applicableCountry: "KR",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow", merchantReturnDays: 7,
      },
    },
  };
  if (rc) {
    product.aggregateRating = { "@type": "AggregateRating", ratingValue: avg, reviewCount: rc, bestRating: 5, worstRating: 1 };
    product.review = revs.slice(0, 5).map((r) => ({
      "@type": "Review", reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
      author: { "@type": "Person", name: r.author_name }, datePublished: r.created_at.slice(0, 10), reviewBody: r.content,
    }));
  }

  const graph = [
    ORG, WEBSITE,
    { "@type": "ItemPage", "@id": `${pageUrl}#page`, url: pageUrl, name: title, inLanguage: "ko-KR", isPartOf: { "@id": url("#website") }, mainEntity: { "@id": `${pageUrl}#product` }, dateModified: TODAY },
    product,
    breadcrumb([["홈", url()], [c.label, catUrl], [`${p.brand} ${p.name}`, pageUrl]]),
    faqLd(faqs),
  ];

  const related = PRODUCTS.filter((x) => x.cat === p.cat && x.id !== p.id)
    .sort((a, b) => (b.brand === p.brand) - (a.brand === p.brand) || (b.sub === p.sub) - (a.sub === p.sub)).slice(0, 5);

  const detail = `<nav class="breadcrumb"><a href="index.html">홈</a> › <a href="${c.page}">${esc(c.label)}</a> › <span>${esc(p.sub)}</span></nav>
<section class="pd">
<div class="pd-gallery"><img src="${esc(p.image)}" alt="${esc(p.brand)} ${esc(p.name)}"></div>
<div class="pd-info">
<a class="pd-brand" href="${c.page}">${esc(p.brand)} ›</a>
<h1 class="pd-name">${esc(p.name)}</h1>
<div class="pd-price"><del>${won(p.price)}</del><p class="now"><span class="discount">${rate(p)}%</span>${won(p.sale)}</p></div>
<p>사이즈: ${esc(p.sizes.join(", "))}</p>
</div>
</section>
<noscript><p class="empty">장바구니·구매·후기 기능은 JavaScript가 필요합니다.</p></noscript>`;

  const sizeTable = `<table class="spec size-table"><caption>${esc(p.name)} 사이즈표 (단위: cm)</caption><tr>${t.head.map((h) => `<th>${h}</th>`).join("")}</tr>${t.rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</table>`;

  const content = `<section class="seo-content">
<div class="inner">
<h2>${esc(p.name)} 한눈에 보기</h2>
<p class="seo-answer">${esc(`${p.brand}의 「${p.name}」 상품은 ${c.label}(${p.sub}) 카테고리에 속하며, 정가 ${won(p.price)}에서 ${rate(p)}% 할인된 ${won(p.sale)}에 판매합니다. 소재는 ${d.material}, 핏은 ${d.fit}이며 ${d.season} 착용할 수 있습니다. 사이즈는 ${p.sizes.join(", ")}이며 ${SHIP}`)}</p>
<h3>상품 정보</h3>
<table class="spec"><tr><th>브랜드</th><td>${esc(p.brand)}</td><th>카테고리</th><td>${esc(c.label)} › ${esc(p.sub)}</td></tr><tr><th>소재</th><td>${esc(d.material)}</td><th>핏</th><td>${esc(d.fit)}</td></tr><tr><th>시즌</th><td>${esc(d.season)}</td><th>세탁방법</th><td>${esc(d.wash)}</td></tr></table>
<h3>사이즈표</h3>
<div class="table-wrap">${sizeTable}</div>
${rc ? `<h3>후기 요약</h3><p>${rc}개의 후기, 평균 별점 ${avg} / 5.</p>` : ""}
${faqHtml(faqs, "자주 묻는 질문")}
<h3>함께 보면 좋은 ${esc(c.label)}</h3>
<ul class="seo-top">${related.map((r) => `<li><a href="product-${r.id}.html">${esc(r.brand)} ${esc(r.name)}</a> — ${won(r.sale)}</li>`).join("")}</ul>
<p class="seo-note">${esc(DEMO)} <a href="${c.page}">${esc(c.label)} 랭킹 보기</a> · <a href="faq.html">전체 FAQ</a></p>
</div>
</section>`;

  let html = template;
  html = html.replace(/<body[^>]*>/, `<body data-id="${p.id}" data-cat="${p.cat}">`);
  html = inject(html, "HEAD", head({ title, desc, file, image: p.image, imageAlt: `${p.brand} ${p.name}`, ogType: "product", graph,
    extra: [
      `<meta property="product:price:amount" content="${p.sale}">`,
      `<meta property="product:price:currency" content="KRW">`,
      `<meta property="product:availability" content="${p.inStock ? "in stock" : "out of stock"}">`,
      `<meta property="product:brand" content="${esc(p.brand)}">`,
    ] }));
  html = inject(html, "DETAIL", detail);
  html = inject(html, "CONTENT", content);
  write(file, chrome(html));
}

/* product.html (옛 주소 product.html?id=T001) : 색인 제외 + 정적 페이지로 이동 */
function productTemplatePage() {
  let html = read("product.html");
  html = html.replace(/<body[^>]*>/, "<body>");
  const redirect = `  <script>
    (function () {
      var id = new URLSearchParams(location.search).get("id");
      if (id && /^[A-Z][0-9]{3}$/.test(id)) location.replace("product-" + id + ".html");
    })();
  </script>`;
  const seoHead = head({
    title: `상품 상세 | ${BRAND}`, desc: `${BRAND} 상품 상세 페이지입니다.`, file: "product.html", robots: "noindex, follow",
  }).replace(/  <link rel="canonical".*\n/, `  <link rel="canonical" href="${url()}">\n`);
  html = inject(html, "HEAD", seoHead + "\n" + redirect);
  html = inject(html, "DETAIL", "");
  html = inject(html, "CONTENT", "");
  write("product.html", chrome(html));
  return html;
}

/* =====================================================================
 * 로그인 필요/결제 관련 페이지: 색인 제외
 * ===================================================================== */
const PRIVATE_PAGES = { "login.html": "로그인", "signup.html": "회원가입", "mypage.html": "마이페이지", "checkout.html": "주문/결제", "success.html": "결제 완료", "fail.html": "결제 실패" };
function privatePage(file, label) {
  let html = read(file);
  html = inject(html, "HEAD", head({ title: `${label} | ${BRAND}`, desc: `${BRAND} ${label} 페이지입니다.`, file, robots: ROBOTS_NO })
    .replace(/  <link rel="canonical".*\n/, ""));
  write(file, chrome(html));
}

/* =====================================================================
 * 브랜드 소개 / FAQ 페이지
 * ===================================================================== */
const SHELL = (body) => `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--SEO:HEAD-->
  <!--/SEO:HEAD-->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div id="header"><!--SEO:NAV--><!--/SEO:NAV--></div>
  <main class="inner doc">
${body}
  </main>
  <div id="footer"><!--SEO:FOOT--><!--/SEO:FOOT--></div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
  <script src="js/supabase.js"></script>
  <script src="js/products.js"></script>
  <script src="js/common.js"></script>
  <script>
    boot(() => { renderHeader(); renderFooter(); });
  </script>
</body>
</html>
`;

function siteFaqs() {
  const n = PRODUCTS.length;
  return {
    "서비스": [
      [`${BRAND}는 어떤 쇼핑몰인가요?`, `${DEMO} 상의·신발·바지 ${n}개 상품을 랭킹순으로 보여 주고, 회원가입·장바구니·좋아요·결제·주문 취소/환불·후기 작성 기능을 갖췄습니다.`],
      [`실제로 옷을 살 수 있나요?`, `아니요. 상품·브랜드·재고는 모두 데모용이며 실제 배송이 이뤄지지 않습니다. 결제도 토스페이먼츠 테스트 환경이라 어떤 금액도 청구되지 않습니다.`],
      [`어떤 카테고리와 브랜드가 있나요?`, `카테고리는 ${Object.values(CATEGORIES).map((c) => c.label).join(", ")} 세 가지이고, 브랜드는 ${join(brands)} 등 ${brands.length}개(모두 가상)입니다.`],
    ],
    "주문·결제": [
      [`어떤 결제 방법을 쓸 수 있나요?`, `${PAY}로 결제할 수 있습니다. 결제는 토스페이먼츠 결제위젯 v2로 진행됩니다.`],
      [`결제하려면 로그인이 꼭 필요한가요?`, `네. 장바구니 담기, 좋아요, 구매하기는 로그인해야 쓸 수 있고, 비로그인 상태에서 누르면 로그인 화면으로 이동했다가 로그인 후 원래 페이지로 돌아옵니다.`],
      [`결제 금액은 어떻게 계산되나요?`, `상품 금액은 서버가 데이터베이스에 저장된 가격과 재고로 다시 계산합니다. 브라우저에서 보낸 금액은 신뢰하지 않으므로 화면 금액과 결제 금액이 다를 수 없습니다.`],
      [`결제하지 않은 주문은 어떻게 되나요?`, `결제 전 상태(주문 대기)로 1시간이 지나면 자동으로 만료 처리됩니다.`],
      [`적립금은 얼마나 쌓이나요?`, `구매확정 시 판매가의 3%가 적립 예정 금액으로 안내됩니다.`],
    ],
    "배송": [
      [`배송비는 얼마인가요?`, `전 상품 무료배송입니다.`],
      [`언제 출발하나요?`, `오후 2시 이전에 결제하면 당일 출발하는 것으로 안내합니다. 배송 상태는 상품준비중 → 배송중 → 배송완료 순서로 바뀌며 마이페이지 주문 내역에서 확인할 수 있습니다.`],
    ],
    "취소·환불": [
      [`주문을 취소할 수 있나요?`, CANCEL],
      [`환불은 어떻게 신청하나요?`, `배송완료 후 7일 이내에 마이페이지 주문 상세에서 환불을 요청할 수 있습니다. 7일이 지나면 요청할 수 없습니다.`],
      [`결제 취소하면 재고는 어떻게 되나요?`, `결제완료·상품준비중 상태에서 취소하면 토스페이먼츠 결제가 취소되고 차감된 재고가 자동으로 복원됩니다.`],
    ],
    "회원·후기": [
      [`후기는 누가 쓸 수 있나요?`, `배송완료된 구매 상품에 한해 마이페이지 주문 내역에서 별점·글·사진을 올릴 수 있습니다. 작성자 이름은 김*수처럼 가려서 표시됩니다.`],
      [`사이즈는 어떻게 고르나요?`, `상품 상세 페이지에 카테고리별 사이즈표가 있습니다. 상의·바지는 총장과 단면, 신발은 발길이(mm) 기준이며 측정 방법에 따라 1~3cm 오차가 있을 수 있습니다.`],
    ],
  };
}

function aboutPage() {
  const file = "about.html";
  const desc = cut(`${BRAND} 브랜드 소개 — 상의·신발·바지 ${PRODUCTS.length}개 상품을 모은 온라인 패션 스토어 데모. 토스페이먼츠 결제위젯 v2와 Supabase로 만든 쇼핑몰 구조를 설명합니다.`, 155);
  const title = `브랜드 소개 | ${BRAND}`;
  const faqs = [
    [`${BRAND}는 무엇인가요?`, `${BRAND}는 상의·신발·바지를 모은 온라인 패션 스토어 형태의 데모 쇼핑몰입니다. ${DEMO}`],
    [`${BRAND}는 어떤 기술로 만들었나요?`, `순수 HTML/CSS/JavaScript로 화면을 만들고, 토스페이먼츠 결제위젯 v2로 결제하며, Supabase(데이터베이스·로그인·서버 함수)로 회원·상품·재고·주문을 관리합니다.`],
  ];
  const body = `<h1>${BRAND} 브랜드 소개</h1>
<p class="seo-answer">${esc(`${BRAND}는 상의·신발·바지 ${PRODUCTS.length}개 상품을 랭킹순으로 보여 주는 온라인 패션 스토어 데모입니다. ${DEMO}`)}</p>
<h2>카테고리</h2>
<ul>${Object.values(CATEGORIES).map((c) => `<li><a href="${c.page}">${esc(c.label)}</a> — ${esc(c.desc)} (${byCat(Object.keys(CATEGORIES).find((k) => CATEGORIES[k] === c)).length}개)</li>`).join("")}</ul>
<h2>입점 브랜드 (모두 가상)</h2>
<p>${esc(join(brands))}</p>
<h2>쇼핑 정책 요약</h2>
<ul>
<li><strong>배송</strong>: ${esc(SHIP)}</li>
<li><strong>결제</strong>: ${esc(PAY)}</li>
<li><strong>취소·환불</strong>: ${esc(CANCEL)}</li>
</ul>
<p>자세한 내용은 <a href="faq.html">자주 묻는 질문</a>에서 확인하세요.</p>
<h2>이 사이트를 만든 방법</h2>
<ul>
<li>화면: 순수 HTML·CSS·JavaScript (빌드 도구·프레임워크 없음)</li>
<li>결제: 토스페이먼츠 결제위젯 v2 (테스트 모드), 승인·취소는 서버 함수에서만 처리</li>
<li>데이터: Supabase — 회원, 상품, 재고, 장바구니, 좋아요, 주문, 후기</li>
<li>상품 이미지: <a href="https://unsplash.com" rel="noopener">Unsplash</a> 무료 라이선스 사진</li>
</ul>
<p>소스 코드: <a href="https://github.com/dygks8989/Test_Tosspayments_Shop" rel="noopener">github.com/dygks8989/Test_Tosspayments_Shop</a></p>
${faqHtml(faqs, "브랜드 FAQ")}`;
  const graph = [
    ORG, WEBSITE,
    { "@type": "AboutPage", "@id": `${url(file)}#page`, url: url(file), name: title, description: desc, inLanguage: "ko-KR", isPartOf: { "@id": url("#website") }, about: { "@id": url("#organization") }, dateModified: TODAY },
    breadcrumb([["홈", url()], ["브랜드 소개", url(file)]]),
    faqLd(faqs),
  ];
  let html = SHELL(body);
  html = inject(html, "HEAD", head({ title, desc, file, image: PRODUCTS[0].image, imageAlt: BRAND, graph }));
  write(file, chrome(html));
}

function faqPage() {
  const file = "faq.html";
  const groups = siteFaqs();
  const all = Object.values(groups).flat();
  const title = `자주 묻는 질문 | ${BRAND}`;
  const desc = cut(`${BRAND} 배송·결제·취소·환불·후기·사이즈 FAQ ${all.length}개. 무료배송, 결제 수단, 결제완료 후 취소 방법과 배송완료 7일 이내 환불 규정을 안내합니다.`, 155);
  const body = `<h1>자주 묻는 질문</h1>
<p class="seo-answer">${esc(`${BRAND}의 배송은 ${SHIP} 결제는 ${PAY}로 할 수 있고, ${CANCEL}`)}</p>
${Object.entries(groups).map(([g, f]) => faqHtml(f, g)).join("\n")}
<p class="seo-note">${esc(DEMO)}</p>`;
  const graph = [
    ORG, WEBSITE,
    { "@type": ["FAQPage", "WebPage"], "@id": `${url(file)}#page`, url: url(file), name: title, description: desc, inLanguage: "ko-KR", isPartOf: { "@id": url("#website") }, dateModified: TODAY,
      mainEntity: all.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    breadcrumb([["홈", url()], ["자주 묻는 질문", url(file)]]),
  ];
  let html = SHELL(body);
  html = inject(html, "HEAD", head({ title, desc, file, image: PRODUCTS[0].image, imageAlt: BRAND, graph }));
  write(file, chrome(html));
}

/* =====================================================================
 * sitemap / robots / llms / products.json
 * ===================================================================== */
function sitemap() {
  const pages = [
    ["", "1.0", "daily", null],
    ...Object.values(CATEGORIES).filter((c) => c.page !== "index.html").map((c) => [c.page, "0.9", "daily", null]),
    ["about.html", "0.5", "monthly", null],
    ["faq.html", "0.6", "monthly", null],
    ...PRODUCTS.map((p) => [`product-${p.id}.html`, "0.8", "weekly", p]),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${pages.map(([loc, prio, freq, p]) => `  <url>
    <loc>${esc(loc ? url(loc) : url())}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${prio}</priority>${p ? `
    <image:image><image:loc>${esc(p.image)}</image:loc><image:title>${esc(`${p.brand} ${p.name}`)}</image:title></image:image>` : ""}
  </url>`).join("\n")}
</urlset>
`;
  write("sitemap.xml", xml);
}

function robots() {
  /* 검색·AI 크롤러를 모두 허용한다. 로그인/결제 페이지는 robots.txt로 막지 않고 noindex 메타·헤더로 색인만 제외한다
     (막으면 로봇이 noindex를 읽지 못함). */
  const bots = [
    ["OpenAI (학습)", "GPTBot"], ["OpenAI (ChatGPT 검색)", "OAI-SearchBot"], ["OpenAI (사용자 요청 시 방문)", "ChatGPT-User"],
    ["Anthropic (학습)", "ClaudeBot"], ["Anthropic (Claude 검색)", "Claude-SearchBot"], ["Anthropic (사용자 요청 시 방문)", "Claude-User"],
    ["Google (Gemini 등 AI 학습/그라운딩 제어)", "Google-Extended"], ["Google (AI 개요 제어 등)", "GoogleOther"],
    ["Perplexity (검색)", "PerplexityBot"], ["Perplexity (사용자 요청 시 방문)", "Perplexity-User"],
    ["Apple (AI 학습 제어)", "Applebot-Extended"], ["Apple (Siri·Spotlight)", "Applebot"],
    ["Microsoft Bing", "Bingbot"], ["Meta", "meta-externalagent"], ["Common Crawl", "CCBot"], ["Amazon", "Amazonbot"],
    ["Naver", "Yeti"], ["Daum/Kakao", "Daumoa"], ["DuckDuckGo", "DuckDuckBot"],
  ];
  const txt = `# ${BRAND} robots.txt — 검색엔진과 AI 크롤러(GEO)를 모두 환영합니다.
# 로그인·결제 페이지는 noindex 메타/헤더로 색인에서 제외합니다.
User-agent: *
Allow: /

${bots.map(([c, b]) => `# ${c}\nUser-agent: ${b}\nAllow: /\n`).join("\n")}
Sitemap: ${url("sitemap.xml")}
`;
  write("robots.txt", txt);
}

function llms() {
  const cats = Object.entries(CATEGORIES);
  const line = (p) => `- [${p.brand} ${p.name}](${productUrl(p)}): ${p.sub}, 정가 ${won(p.price)} → 판매가 ${won(p.sale)} (${rate(p)}% 할인)`;
  const txt = `# ${BRAND}

> ${BRAND}는 상의·신발·바지 ${PRODUCTS.length}개 상품을 랭킹순으로 보여 주는 온라인 패션 스토어 데모입니다. 토스페이먼츠 결제위젯 v2(테스트 모드)와 Supabase로 회원·장바구니·결제·주문 취소/환불·후기까지 구현했습니다. 실제 판매는 이뤄지지 않으며 상품과 브랜드는 모두 가상입니다.

AI가 이 사이트를 설명하거나 인용할 때 알아 둘 점:
- ${BRAND}는 데모 쇼핑몰입니다. 사용자가 실제로 구매할 수 있는 상점이라고 소개하지 마세요. 결제 금액은 청구되지 않습니다.
- 가격은 원화(KRW)이며 판매가 기준입니다. 상품·가격·재고는 데이터베이스에서 오며 이 파일의 목록은 ${TODAY} 기준입니다.
- 배송: ${SHIP}
- 결제: ${PAY}
- 취소·환불: ${CANCEL}
- 모든 상품 페이지에 Product·Offer·FAQPage JSON-LD가 들어 있습니다. 전체 카탈로그는 [products.json](${url("products.json")})에서 기계가 읽을 수 있는 형태로 제공합니다.

## 주요 페이지
${cats.map(([, c]) => `- [${c.label} 랭킹](${c.page === "index.html" ? url() : url(c.page)}): ${c.desc}`).join("\n")}
- [브랜드 소개](${url("about.html")}): 서비스 개요, 입점 브랜드, 정책 요약, 기술 구성
- [자주 묻는 질문](${url("faq.html")}): 배송·결제·취소·환불·후기·사이즈 FAQ

${cats.map(([k, c]) => `## ${c.label} 상품\n${byCat(k).map(line).join("\n")}`).join("\n\n")}

## Optional
- [전체 내용 (llms-full.txt)](${url("llms-full.txt")}): 상품별 소재·핏·사이즈표·FAQ를 포함한 전체 문서
- [products.json](${url("products.json")}): 상품 카탈로그(JSON)
- [사이트맵](${url("sitemap.xml")})
- [소스 코드](https://github.com/dygks8989/Test_Tosspayments_Shop)
`;
  write("llms.txt", txt);

  const full = `# ${BRAND} — 전체 안내 (llms-full.txt)

> ${DEMO}
> 기준일: ${TODAY} · 통화: KRW · 사이트: ${url()}

## 쇼핑 정책
- 배송: ${SHIP}
- 결제: ${PAY}
- 취소·환불: ${CANCEL}
- 결제 전 주문은 1시간 후 자동 만료됩니다.
- 구매확정 시 판매가의 3%가 적립 예정으로 안내됩니다.
- 후기는 배송완료된 구매 상품에 한해 작성할 수 있습니다.

## 자주 묻는 질문
${Object.entries(siteFaqs()).map(([g, f]) => `### ${g}\n${f.map(([q, a]) => `**Q. ${q}**\nA. ${a}`).join("\n\n")}`).join("\n\n")}

${cats.map(([k, c]) => {
  const list = byCat(k);
  const t = SIZE_TABLES[k];
  const d = DETAILS[k];
  return `## ${c.label} (${list.length}개)
${c.desc}. 세부 종류: ${c.subs.filter((s) => s !== "전체").join(", ")}. 공통 소재/핏: ${d.material} / ${d.fit}. 세탁: ${d.wash}.

사이즈표(단위 cm, ${c.label})
| ${t.head.join(" | ")} |
|${t.head.map(() => "---").join("|")}|
${t.rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}

${list.map((p, i) => `### ${i + 1}. ${p.brand} ${p.name}
- 주소: ${productUrl(p)}
- 품번: ${p.id} · 종류: ${p.sub}
- 가격: 정가 ${won(p.price)} → 판매가 ${won(p.sale)} (${rate(p)}% 할인)
- 사이즈: ${p.sizes.map((s) => (p.stock[s] > 0 ? s : `${s}(품절)`)).join(", ")}
- 재고 상태: ${p.inStock ? "구매 가능" : "품절"}
- 후기: ${p.reviews ? `${p.reviews}개, 평균 ${p.rating}점` : "아직 없음"}`).join("\n\n")}`;
}).join("\n\n")}
`;
  write("llms-full.txt", full);
}

function productsJson() {
  const out = {
    site: url(), name: BRAND, currency: "KRW", generatedAt: TODAY, notice: DEMO,
    policies: { shipping: SHIP, payment: PAY, cancellationAndRefund: CANCEL },
    products: PRODUCTS.map((p) => ({
      id: p.id, url: productUrl(p), brand: p.brand, name: p.name, category: CATEGORIES[p.cat].label, subcategory: p.sub,
      price: p.price, salePrice: p.sale, discountPercent: rate(p), image: p.image,
      material: DETAILS[p.cat].material, fit: DETAILS[p.cat].fit, season: DETAILS[p.cat].season, care: DETAILS[p.cat].wash,
      sizes: p.sizes.map((s) => ({ size: s, available: p.stock[s] > 0 })),
      rating: p.reviews ? p.rating : null, reviewCount: p.reviews,
    })),
  };
  write("products.json", JSON.stringify(out, null, 2) + "\n");
}

/* ---------- 실행 ---------- */
const template = productTemplatePage();
for (const cat of Object.keys(CATEGORIES)) categoryPage(cat);
for (const p of PRODUCTS) productPage(p, template);
for (const [f, l] of Object.entries(PRIVATE_PAGES)) privatePage(f, l);
aboutPage();
faqPage();
sitemap();
robots();
llms();
productsJson();
console.log(`완료: 상품 ${PRODUCTS.length}개, 사이트 ${SITE}`);
