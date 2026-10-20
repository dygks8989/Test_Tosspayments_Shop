/* 상품 상세 페이지 — product.html?id=T001 */
const product = findProduct(new URLSearchParams(location.search).get("id"));
const root = document.getElementById("detail");
const sel = { size: null, qty: 1 };

renderHeader(product?.cat);
renderFooter();

/* 카테고리별 사이즈표 */
const SIZE_TABLES = {
  tops:  { head: ["사이즈", "총장", "어깨너비", "가슴단면", "소매길이"],
           rows: [["S", 68, 50, 54, 21], ["M", 70, 52, 56, 22], ["L", 72, 54, 58, 23], ["XL", 74, 56, 60, 24], ["2XL", 76, 58, 62, 25]] },
  shoes: { head: ["사이즈", "발길이(mm)", "발볼", "굽높이(cm)"],
           rows: [["230", 230, "보통", 3], ["240", 240, "보통", 3], ["250", 250, "보통", 3], ["260", 260, "보통", 3.2], ["270", 270, "보통", 3.2], ["280", 280, "보통", 3.2]] },
  pants: { head: ["사이즈", "총장", "허리단면", "허벅지단면", "밑단단면"],
           rows: [["S", 100, 37, 32, 24], ["M", 102, 39, 33, 25], ["L", 104, 41, 34, 26], ["XL", 106, 43, 35, 27]] },
};

/* 후기 더미 데이터 */
const REVIEW_TEXTS = [
  "사이즈 정사이즈로 잘 맞아요. 재질도 생각보다 탄탄하고 마감이 깔끔합니다.",
  "색감이 사진이랑 거의 똑같아요. 데일리로 입기 좋아서 하나 더 살 생각입니다.",
  "배송 빨랐고 포장도 꼼꼼했어요. 가격 대비 만족도 높습니다.",
  "핏이 예쁘게 떨어져요. 한 치수 크게 살까 고민했는데 정사이즈가 맞았네요.",
  "세탁 후에도 변형이 거의 없어요. 재구매 의사 있습니다.",
];
const REVIEWERS = ["패션러버", "데일리룩", "옷잘알", "주말쇼핑", "미니멀리스트"];

if (!product) {
  root.innerHTML = `<p class="empty">존재하지 않는 상품입니다.<br><br><a href="index.html" style="text-decoration:underline">홈으로</a></p>`;
} else {
  document.title = `${product.name} | WEARHOUSE`;
  render();
}

function render() {
  const p = product;
  const cat = CATEGORIES[p.cat];
  const d = DETAILS[p.cat];
  const liked = Likes.has(p.id);
  const table = SIZE_TABLES[p.cat];
  const related = PRODUCTS.filter((x) => x.cat === p.cat && x.id !== p.id)
    .sort((a, b) => (b.brand === p.brand) - (a.brand === p.brand))
    .slice(0, 5);
  const points = Math.floor(p.sale * 0.03);

  root.innerHTML = `
    <nav class="breadcrumb"><a href="index.html">홈</a> › <a href="${cat.page}">${cat.label}</a> › <span>${p.sub}</span></nav>

    <section class="pd">
      <div class="pd-gallery">${productImg(p)}</div>

      <div class="pd-info">
        <a class="pd-brand" href="${cat.page}">${p.brand} ›</a>
        <h1 class="pd-name">${p.name}</h1>
        <p class="pd-meta"><span class="star">★</span> ${p.rating} · 후기 ${p.reviews.toLocaleString()}개 · ♥ ${(p.likes + (liked ? 1 : 0)).toLocaleString()}</p>

        <div class="pd-price">
          <del>${won(p.price)}</del>
          <p class="now"><span class="discount">${discountRate(p)}%</span>${won(p.sale)}</p>
        </div>

        <dl class="pd-benefit">
          <div><dt>적립</dt><dd>최대 ${won(points)} 적립 (구매확정 시)</dd></div>
          <div><dt>배송</dt><dd>무료배송 · 오늘 출발 (오후 2시 이전 결제 시)</dd></div>
          <div><dt>결제</dt><dd>토스페이 · 카드 · 계좌이체 · 간편결제</dd></div>
        </dl>

        <p class="opt-label">사이즈</p>
        <div class="sizes">
          ${cat.sizes.map((s) => `<button type="button" class="size ${s === sel.size ? "active" : ""}" data-size="${s}">${s}</button>`).join("")}
        </div>

        ${sel.size ? `
        <div class="pd-selected">
          <span>${p.name} / ${sel.size}</span>
          <div class="qty">
            <button type="button" data-qty="-1" aria-label="수량 감소">−</button>
            <span>${sel.qty}</span>
            <button type="button" data-qty="1" aria-label="수량 증가">+</button>
          </div>
        </div>` : ""}

        <div class="modal-total"><span>총 상품 금액</span><strong>${won(sel.size ? p.sale * sel.qty : 0)}</strong></div>

        <div class="pd-actions">
          <button type="button" class="pd-like ${liked ? "on" : ""}" id="likeBtn" aria-label="좋아요">♥</button>
          <button type="button" class="btn btn-line" id="cartBtn">장바구니</button>
          <button type="button" class="btn btn-black" id="buyBtn">구매하기</button>
        </div>
      </div>
    </section>

    <div class="tabs" id="tabs">
      <a href="#info" class="active">상품정보</a>
      <a href="#size">사이즈</a>
      <a href="#review">후기 ${p.reviews.toLocaleString()}</a>
      <a href="#related">추천</a>
    </div>

    <section class="pd-section" id="info">
      <h2>상품정보</h2>
      <img class="pd-detail-img" src="images/${p.id}.jpg" alt="" loading="lazy">
      <table class="spec">
        <tr><th>품번</th><td>${p.id}-${p.brand.replace(/\W+/g, "").slice(0, 4)}</td><th>브랜드</th><td>${p.brand}</td></tr>
        <tr><th>소재</th><td>${d.material}</td><th>핏</th><td>${d.fit}</td></tr>
        <tr><th>시즌</th><td>${d.season}</td><th>세탁방법</th><td>${d.wash}</td></tr>
      </table>
    </section>

    <section class="pd-section" id="size">
      <h2>사이즈 <small>(단위: cm)</small></h2>
      <div class="table-wrap">
        <table class="spec size-table">
          <tr>${table.head.map((h) => `<th>${h}</th>`).join("")}</tr>
          ${table.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}
        </table>
      </div>
      <p class="hint">측정 방법에 따라 1~3cm 오차가 있을 수 있습니다.</p>
    </section>

    <section class="pd-section" id="review">
      <h2>후기 <small>★ ${p.rating} / 5</small></h2>
      <ul class="reviews">
        ${REVIEW_TEXTS.map((t, i) => `
          <li>
            <p class="r-head"><span class="star">${"★".repeat(5 - (i === 2 ? 1 : 0))}</span> <b>${REVIEWERS[i]}</b> · ${cat.sizes[i % cat.sizes.length]} 구매</p>
            <p>${t}</p>
          </li>`).join("")}
      </ul>
    </section>

    <section class="pd-section" id="related">
      <h2>함께 보면 좋은 상품</h2>
      <div class="grid">${related.map((r) => productCard(r)).join("")}</div>
    </section>`;
}

/* ---------- 이벤트 ---------- */
root.addEventListener("click", (e) => {
  const t = e.target;
  if (t.closest("[data-size]")) { sel.size = t.closest("[data-size]").dataset.size; sel.qty = 1; return render(); }
  if (t.closest("[data-qty]")) { sel.qty = Math.max(1, Math.min(10, sel.qty + Number(t.closest("[data-qty]").dataset.qty))); return render(); }
  if (t.closest("[data-like]")) { e.preventDefault(); Likes.toggle(t.closest("[data-like]").dataset.like); return render(); }
  if (t.id === "likeBtn") { toast(Likes.toggle(product.id) ? "좋아요에 추가했습니다." : "좋아요를 취소했습니다."); return render(); }
  if (t.id === "cartBtn" || t.id === "buyBtn") {
    if (!sel.size) return toast("사이즈를 선택해주세요.");
    if (t.id === "cartBtn") {
      Cart.add(product.id, sel.size, sel.qty);
      toast("장바구니에 담았습니다.");
    } else {
      goCheckout([{ id: product.id, size: sel.size, qty: sel.qty }], false);
    }
  }
  const tab = t.closest("#tabs a");
  if (tab) {
    document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("active", a === tab));
  }
});
