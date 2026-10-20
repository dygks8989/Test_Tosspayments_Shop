/* 상품 상세 페이지 — product-T001.html (SEO 정적 페이지, tools/seo-build.mjs 가 생성) / product.html?id=T001 은 정적 페이지로 이동 */
const root = document.getElementById("detail");
const sel = { size: null, qty: 1 };
let product = null;
let reviews = [];
let reviewSort = "latest";

boot(async () => {
  product = findProduct(document.body.dataset.id || new URLSearchParams(location.search).get("id"));
  renderHeader(product?.cat);
  renderFooter();

  if (!product) {
    root.innerHTML = `<p class="empty">존재하지 않는 상품입니다.<br><br><a href="index.html" style="text-decoration:underline">홈으로</a></p>`;
    return;
  }
  document.title = `${product.brand} ${product.name} | WEARHOUSE`;
  await loadReviews();
  render();
});

async function loadReviews() {
  const { data, error } = await sb.from("reviews").select("*").eq("product_id", product.id).limit(200);
  if (error) throw error;
  reviews = data;
}

function sortedReviews() {
  const list = [...reviews];
  list.sort(reviewSort === "rating"
    ? (a, b) => b.rating - a.rating || b.created_at.localeCompare(a.created_at)
    : (a, b) => b.created_at.localeCompare(a.created_at));
  return list;
}

function reviewPhotoUrl(path) {
  return sb.storage.from("review-photos").getPublicUrl(path).data.publicUrl;
}

function reviewSection() {
  const p = product;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: reviews.filter((r) => r.rating === n).length }));
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "-";
  return `
    <h2>후기 <small>★ ${avg} / 5 · ${reviews.length.toLocaleString()}개</small></h2>
    ${reviews.length ? `
    <div class="rv-summary">
      ${dist.map((d) => `<div class="rv-bar"><span>${d.n}점</span><i><b style="width:${(d.c / reviews.length) * 100}%"></b></i><span>${d.c}</span></div>`).join("")}
    </div>
    <div class="rv-sort">
      <button type="button" data-rsort="latest" class="${reviewSort === "latest" ? "active" : ""}">최신순</button>
      <button type="button" data-rsort="rating" class="${reviewSort === "rating" ? "active" : ""}">별점순</button>
    </div>
    <ul class="reviews">
      ${sortedReviews().map((r) => `
        <li>
          <p class="r-head"><span class="star">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span> <b>${esc(r.author_name)}</b> · ${new Date(r.created_at).toLocaleDateString("ko-KR")}</p>
          <p>${esc(r.content)}</p>
          ${r.photos.length ? `<div class="rv-photos">${r.photos.map((ph) => `<img src="${esc(reviewPhotoUrl(ph))}" alt="후기 사진" loading="lazy">`).join("")}</div>` : ""}
        </li>`).join("")}
    </ul>` : `<p class="empty">아직 작성된 후기가 없습니다.<br>배송완료된 구매 상품은 마이페이지 주문 내역에서 후기를 쓸 수 있어요.</p>`}`;
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
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "-";

  root.innerHTML = `
    <nav class="breadcrumb"><a href="index.html">홈</a> › <a href="${cat.page}">${cat.label}</a> › <span>${esc(p.sub)}</span></nav>

    <section class="pd">
      <div class="pd-gallery">${productImg(p)}</div>

      <div class="pd-info">
        <a class="pd-brand" href="${cat.page}">${esc(p.brand)} ›</a>
        <h1 class="pd-name">${esc(p.name)}</h1>
        <p class="pd-meta"><span class="star">★</span> ${avg} · 후기 ${reviews.length.toLocaleString()}개 · ♥ ${p.likes.toLocaleString()}</p>

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
          ${cat.sizes.map((s) => {
            const left = p.stock[s] ?? 0;
            return `<button type="button" class="size ${s === sel.size ? "active" : ""}" data-size="${s}" ${left ? "" : "disabled"}>${s}${left ? "" : " (품절)"}</button>`;
          }).join("")}
        </div>

        ${sel.size ? `
        <div class="pd-selected">
          <span>${esc(p.name)} / ${esc(sel.size)}</span>
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
      <a href="#review">후기 ${reviews.length.toLocaleString()}</a>
      <a href="#related">추천</a>
    </div>

    <section class="pd-section" id="info">
      <h2>상품정보</h2>
      <img class="pd-detail-img" src="${esc(p.image)}" alt="" loading="lazy">
      <table class="spec">
        <tr><th>품번</th><td>${p.id}-${esc(p.brand.replace(/\W+/g, "").slice(0, 4))}</td><th>브랜드</th><td>${esc(p.brand)}</td></tr>
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

    <section class="pd-section" id="review">${reviewSection()}</section>

    <section class="pd-section" id="related">
      <h2>함께 보면 좋은 상품</h2>
      <div class="grid">${related.map((r) => productCard(r)).join("")}</div>
    </section>`;
}

/* ---------- 이벤트 ---------- */
root.addEventListener("click", async (e) => {
  if (!product) return;
  const t = e.target;
  if (t.closest("[data-size]")) { sel.size = t.closest("[data-size]").dataset.size; sel.qty = 1; return render(); }
  if (t.closest("[data-qty]")) {
    const max = Math.min(10, product.stock[sel.size] ?? 1);
    const next = sel.qty + Number(t.closest("[data-qty]").dataset.qty);
    if (next > max) toast(`재고가 부족합니다. (남은 수량 ${product.stock[sel.size]}개)`);
    sel.qty = Math.max(1, Math.min(max, next));
    return render();
  }
  if (t.closest("[data-rsort]")) { reviewSort = t.closest("[data-rsort]").dataset.rsort; document.getElementById("review").innerHTML = reviewSection(); return; }
  if (t.closest("[data-like]")) {
    e.preventDefault();
    await attempt(() => Likes.toggle(t.closest("[data-like]").dataset.like));
    return render();
  }
  if (t.id === "likeBtn") {
    const on = await attempt(() => Likes.toggle(product.id));
    if (on !== undefined && on !== null) toast(on ? "좋아요에 추가했습니다." : "좋아요를 취소했습니다.");
    return render();
  }
  if (t.id === "cartBtn" || t.id === "buyBtn") {
    if (!requireLogin()) return;
    if (!sel.size) return toast("사이즈를 선택해주세요.");
    if (t.id === "cartBtn") {
      const ok = await attempt(() => Cart.add(product.id, sel.size, sel.qty));
      if (ok) toast("장바구니에 담았습니다.");
    } else {
      goCheckout([{ id: product.id, size: sel.size, qty: sel.qty }], false);
    }
  }
  const tab = t.closest("#tabs a");
  if (tab) {
    document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("active", a === tab));
  }
});
