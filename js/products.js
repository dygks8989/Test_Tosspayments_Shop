/* 상품 데이터 (퍼블리싱용 더미 데이터) */
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

const PRODUCTS = [
  // ---- 상의 ----
  { id: "T001", cat: "tops", sub: "반소매 티셔츠", brand: "OVERFIT LAB", name: "오버핏 헤비웨이트 반팔 티셔츠 블랙", price: 39000, sale: 29000, color: "#1d1d1d", rating: 4.9, reviews: 12840, likes: 38211, badge: "무료배송" },
  { id: "T002", cat: "tops", sub: "후드 티셔츠", brand: "NORTH ROW", name: "에센셜 기모 후드 집업 멜란지 그레이", price: 69000, sale: 48300, color: "#9a9a9a", rating: 4.8, reviews: 8421, likes: 21004, badge: "단독" },
  { id: "T003", cat: "tops", sub: "셔츠/블라우스", brand: "MONDAY OFFICE", name: "옥스포드 오버 셔츠 스카이 블루", price: 59000, sale: 41300, color: "#8fb7e0", rating: 4.8, reviews: 5120, likes: 15020 },
  { id: "T004", cat: "tops", sub: "니트/스웨터", brand: "WOOLEN DAYS", name: "램스울 크루넥 니트 오트밀", price: 89000, sale: 62300, color: "#d8c8ac", rating: 4.9, reviews: 3092, likes: 18240, badge: "무료배송" },
  { id: "T005", cat: "tops", sub: "긴소매 티셔츠", brand: "OVERFIT LAB", name: "베이직 롱슬리브 티셔츠 화이트", price: 32000, sale: 25600, color: "#f5f5f0", rating: 4.7, reviews: 9811, likes: 11930 },
  { id: "T006", cat: "tops", sub: "반소매 티셔츠", brand: "SUNDAY CLUB", name: "빈티지 피그먼트 그래픽 티셔츠 차콜", price: 45000, sale: 31500, color: "#4a4a4a", rating: 4.8, reviews: 4210, likes: 9822 },
  { id: "T007", cat: "tops", sub: "후드 티셔츠", brand: "STREET NOTE", name: "로고 자수 후드 티셔츠 네이비", price: 79000, sale: 55300, color: "#23304d", rating: 4.7, reviews: 2311, likes: 7754, badge: "단독" },
  { id: "T008", cat: "tops", sub: "니트/스웨터", brand: "WOOLEN DAYS", name: "케이블 브이넥 가디건 포레스트 그린", price: 99000, sale: 79200, color: "#3e5a44", rating: 4.9, reviews: 1820, likes: 9120 },
  { id: "T009", cat: "tops", sub: "셔츠/블라우스", brand: "MONDAY OFFICE", name: "린넨 블렌드 반팔 셔츠 아이보리", price: 49000, sale: 39200, color: "#efe8d8", rating: 4.6, reviews: 1504, likes: 5402 },
  { id: "T010", cat: "tops", sub: "긴소매 티셔츠", brand: "SUNDAY CLUB", name: "코튼 크루넥 니트 롱슬리브 레드", price: 42000, sale: 29400, color: "#b33a3a", rating: 4.7, reviews: 2087, likes: 6630 },

  // ---- 신발 ----
  { id: "S001", cat: "shoes", sub: "스니커즈", brand: "RUNWAY BASIC", name: "클래식 로우탑 레더 스니커즈 화이트", price: 129000, sale: 99000, color: "#f2f2f2", rating: 4.9, reviews: 21450, likes: 58201, badge: "무료배송" },
  { id: "S002", cat: "shoes", sub: "러닝화", brand: "PACE ONE", name: "에어 쿠셔닝 데일리 러닝화 블랙", price: 159000, sale: 119000, color: "#202020", rating: 4.8, reviews: 9841, likes: 30112 },
  { id: "S003", cat: "shoes", sub: "로퍼", brand: "GENTLE STEP", name: "홀스빗 로퍼 브라운 카프 레더", price: 189000, sale: 132300, color: "#6b4126", rating: 4.8, reviews: 3120, likes: 14021, badge: "단독" },
  { id: "S004", cat: "shoes", sub: "스니커즈", brand: "CANVAS CO.", name: "캔버스 하이탑 스니커즈 내추럴", price: 69000, sale: 55200, color: "#e9dfc8", rating: 4.7, reviews: 12010, likes: 22044 },
  { id: "S005", cat: "shoes", sub: "부츠", brand: "GENTLE STEP", name: "첼시 부츠 스웨이드 다크 브라운", price: 219000, sale: 175200, color: "#4b3424", rating: 4.9, reviews: 1890, likes: 8822 },
  { id: "S006", cat: "shoes", sub: "러닝화", brand: "PACE ONE", name: "경량 메쉬 트레이닝화 그레이 오렌지", price: 139000, sale: 97300, color: "#8a8f96", rating: 4.7, reviews: 4021, likes: 9840 },
  { id: "S007", cat: "shoes", sub: "샌들", brand: "BEACH WALK", name: "스트랩 스포츠 샌들 블랙", price: 59000, sale: 41300, color: "#2b2b2b", rating: 4.6, reviews: 5210, likes: 7011, badge: "무료배송" },
  { id: "S008", cat: "shoes", sub: "스니커즈", brand: "RUNWAY BASIC", name: "레트로 스웨이드 스니커즈 버건디", price: 119000, sale: 89000, color: "#6b1f2a", rating: 4.8, reviews: 6210, likes: 16630 },
  { id: "S009", cat: "shoes", sub: "부츠", brand: "WORK FORCE", name: "6인치 워커 부츠 위트", price: 239000, sale: 191200, color: "#c08a4a", rating: 4.8, reviews: 2210, likes: 10441 },
  { id: "S010", cat: "shoes", sub: "로퍼", brand: "CANVAS CO.", name: "스웨이드 드라이빙 로퍼 탄", price: 89000, sale: 71200, color: "#c9a27a", rating: 4.6, reviews: 3304, likes: 4902 },

  // ---- 바지 ----
  { id: "P001", cat: "pants", sub: "데님 팬츠", brand: "DENIM HOUSE", name: "와이드 스트레이트 데님 팬츠 미드 블루", price: 69000, sale: 48300, color: "#4f6e9a", rating: 4.9, reviews: 18201, likes: 44102, badge: "무료배송" },
  { id: "P002", cat: "pants", sub: "슬랙스", brand: "MONDAY OFFICE", name: "세미 와이드 히든밴딩 슬랙스 블랙", price: 49000, sale: 34300, color: "#1e1e1e", rating: 4.9, reviews: 25021, likes: 61204, badge: "단독" },
  { id: "P003", cat: "pants", sub: "코튼 팬츠", brand: "CHINO WORKS", name: "투턱 와이드 치노 팬츠 베이지", price: 59000, sale: 41300, color: "#cbb48e", rating: 4.8, reviews: 7210, likes: 19021 },
  { id: "P004", cat: "pants", sub: "트레이닝 팬츠", brand: "STREET NOTE", name: "나일론 트랙 팬츠 블랙 화이트 라인", price: 79000, sale: 55300, color: "#262626", rating: 4.7, reviews: 3811, likes: 12044 },
  { id: "P005", cat: "pants", sub: "데님 팬츠", brand: "DENIM HOUSE", name: "생지 셀비지 레귤러 데님 인디고", price: 129000, sale: 103200, color: "#25314f", rating: 4.8, reviews: 2910, likes: 13921 },
  { id: "P006", cat: "pants", sub: "숏 팬츠", brand: "BEACH WALK", name: "나일론 버뮤다 숏 팬츠 올리브", price: 45000, sale: 31500, color: "#6b6f45", rating: 4.6, reviews: 2410, likes: 5320, badge: "무료배송" },
  { id: "P007", cat: "pants", sub: "슬랙스", brand: "MONDAY OFFICE", name: "울 블렌드 테이퍼드 슬랙스 차콜", price: 89000, sale: 62300, color: "#454545", rating: 4.8, reviews: 4120, likes: 11840 },
  { id: "P008", cat: "pants", sub: "코튼 팬츠", brand: "CHINO WORKS", name: "카펜터 워크 팬츠 브라운", price: 79000, sale: 59200, color: "#7a5636", rating: 4.7, reviews: 1820, likes: 7402 },
  { id: "P009", cat: "pants", sub: "트레이닝 팬츠", brand: "NORTH ROW", name: "기모 스웨트 조거 팬츠 멜란지", price: 49000, sale: 39200, color: "#a8a8a8", rating: 4.7, reviews: 6210, likes: 9930 },
  { id: "P010", cat: "pants", sub: "데님 팬츠", brand: "DENIM HOUSE", name: "라이트 워싱 루즈핏 데님 아이스 블루", price: 79000, sale: 55300, color: "#a9c2dc", rating: 4.8, reviews: 3410, likes: 10220 },
];

/* 상품 이미지 (Unsplash 무료 라이선스 사진, images/{id}.jpg) */
function productImg(p, cls = "") {
  return `<img src="images/${p.id}.jpg" alt="${p.brand} ${p.name}" class="${cls}" loading="lazy">`;
}

/* 상세 페이지용 설명 (카테고리 공통 + 상품별) */
const DETAILS = {
  tops:  { material: "면 100%", fit: "오버핏", season: "사계절", wash: "30℃ 이하 단독 손세탁 권장" },
  shoes: { material: "천연가죽 / 합성고무", fit: "정사이즈", season: "사계절", wash: "전용 클리너 사용, 직사광선 피해 보관" },
  pants: { material: "면 98% / 폴리우레탄 2%", fit: "와이드 스트레이트", season: "사계절", wash: "뒤집어서 찬물 세탁" },
};

function findProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}
