/* 카테고리 정의 + 상품 데이터 로딩 (상품은 Supabase products / product_sizes 에서 불러온다) */
const CATEGORIES = {
  tops:  { label: "상의", title: "상의 랭킹",  desc: "지금 가장 많이 팔리는 티셔츠 · 셔츠 · 니트", page: "index.html",
           subs: ["전체", "반소매 티셔츠", "긴소매 티셔츠", "후드 티셔츠", "셔츠/블라우스", "니트/스웨터"],
           sizes: ["S", "M", "L", "XL", "2XL"] },
  shoes: { label: "신발", title: "신발 랭킹",  desc: "스니커즈부터 로퍼까지, 데일리 슈즈 셀렉션", page: "shoes.html",
           subs: ["전체", "스니커즈", "러닝화", "로퍼", "부츠", "샌들"],
           sizes: ["230", "240", "250", "260", "270", "280"] },
  pants: { label: "바지", title: "바지 랭킹",  desc: "데님 · 슬랙스 · 와이드 팬츠 베스트", page: "pants.html",
           subs: ["전체", "데님 팬츠", "코튼 팬츠", "슬랙스", "트레이닝 팬츠", "숏 팬츠"],
           sizes: ["S", "M", "L", "XL"] },
};

/* loadProducts() 가 채운다. 항목: { id, cat, sub, brand, name, price, sale, color, badge, image, rating, reviews, likes, stock: {사이즈: 재고} } */
let PRODUCTS = [];

async function loadProducts() {
  const [prod, stats] = await Promise.all([
    sb.from("products").select("*, product_sizes(size, stock)").order("id"),
    sb.from("product_stats").select("*"),
  ]);
  if (prod.error) throw prod.error;
  const st = new Map((stats.data || []).map((s) => [s.product_id, s]));
  PRODUCTS = prod.data.map((r) => {
    const s = st.get(r.id) || {};
    return {
      id: r.id, cat: r.cat, sub: r.sub, brand: r.brand, name: r.name, price: r.price, sale: r.sale,
      color: r.color, badge: r.badge, image: r.image_path,
      rating: Number(s.rating || 0), reviews: s.review_count || 0, likes: s.like_count || 0,
      stock: Object.fromEntries(r.product_sizes.map((z) => [z.size, z.stock])),
    };
  });
}

/* 상품 이미지 (Unsplash 무료 라이선스 사진, images/{id}.jpg). 주문 내역 등에서는 { id, brand, name, image } 형태도 받는다 */
function productImg(p, cls = "") {
  return `<img src="${esc(p.image || `images/${p.id}.jpg`)}" alt="${esc(p.brand)} ${esc(p.name)}" class="${cls}" loading="lazy">`;
}

/* 상세 페이지용 설명 (카테고리 공통) */
const DETAILS = {
  tops:  { material: "면 100%", fit: "오버핏", season: "사계절", wash: "30℃ 이하 단독 손세탁 권장" },
  shoes: { material: "천연가죽 / 합성고무", fit: "정사이즈", season: "사계절", wash: "전용 클리너 사용, 직사광선 피해 보관" },
  pants: { material: "면 98% / 폴리우레탄 2%", fit: "와이드 스트레이트", season: "사계절", wash: "뒤집어서 찬물 세탁" },
};

function findProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}
