/* 상품 목록 페이지 (상의 / 신발 / 바지) */
const CAT = document.body.dataset.cat;
const conf = CATEGORIES[CAT];
const state = { sub: "전체", sort: "rank" };

renderHeader(CAT);
renderFooter();

document.getElementById("bannerTitle").textContent = conf.title;
document.getElementById("bannerDesc").textContent = conf.desc;

/* ---------- 필터 / 정렬 ---------- */
const chips = document.getElementById("chips");
chips.innerHTML = conf.subs
  .map((s) => `<button type="button" class="chip ${s === state.sub ? "active" : ""}" data-sub="${s}">${s}</button>`)
  .join("");
chips.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  state.sub = btn.dataset.sub;
  chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
  renderGrid();
});
document.getElementById("sort").addEventListener("change", (e) => {
  state.sort = e.target.value;
  renderGrid();
});

function listProducts() {
  const ranked = PRODUCTS.filter((p) => p.cat === CAT).map((p, i) => ({ ...p, rank: i + 1 }));
  const list = ranked.filter((p) => state.sub === "전체" || p.sub === state.sub);
  const sorters = {
    rank: (a, b) => a.rank - b.rank,
    low: (a, b) => a.sale - b.sale,
    high: (a, b) => b.sale - a.sale,
    discount: (a, b) => discountRate(b) - discountRate(a),
    review: (a, b) => b.reviews - a.reviews,
  };
  return list.sort(sorters[state.sort]);
}

/* ---------- 그리드 ---------- */
const grid = document.getElementById("grid");

function renderGrid() {
  const list = listProducts();
  document.getElementById("count").textContent = `총 ${list.length}개 상품`;
  if (!list.length) {
    grid.innerHTML = `<p class="empty" style="grid-column:1/-1">해당 카테고리의 상품이 없습니다.</p>`;
    return;
  }
  grid.innerHTML = list.map((p) => productCard(p, state.sort === "rank" ? p.rank : null)).join("");
}

grid.addEventListener("click", (e) => {
  const likeBtn = e.target.closest("[data-like]");
  if (likeBtn) {
    e.preventDefault();
    Likes.toggle(likeBtn.dataset.like);
    renderGrid();
  }
});

renderGrid();
