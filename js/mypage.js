/* 마이페이지 — 로그인 필요. 주문 내역/상세, 취소·환불, 후기, 좋아요, 내 정보 */
const STATUS = {
  pending: "결제대기", paid: "결제완료", preparing: "상품준비중", shipping: "배송중", delivered: "배송완료",
  cancelled: "취소완료", refund_requested: "환불요청", refunded: "환불완료", failed: "결제실패", expired: "기간만료",
};
const FILTERS = [
  { key: "all", label: "전체", statuses: ["paid", "preparing", "shipping", "delivered", "cancelled", "refund_requested", "refunded"] },
  { key: "paid", label: "결제완료", statuses: ["paid", "preparing"] },
  { key: "shipping", label: "배송중", statuses: ["shipping"] },
  { key: "delivered", label: "배송완료", statuses: ["delivered"] },
  { key: "cancel", label: "취소·환불", statuses: ["cancelled", "refund_requested", "refunded"] },
  { key: "etc", label: "결제 미완료", statuses: ["pending", "failed", "expired"] },
];
const CANCEL_REASONS = ["단순 변심", "사이즈가 맞지 않음", "상품에 문제가 있음", "배송 지연", "기타"];
const PAGE_SIZE = 10;
const REFUND_DAYS = 7;

const my = { filter: "all", page: 1, stats: { orders: 0, points: 0, reviews: 0 }, cancelOpen: false, reviewItem: null, editReview: null };
const body = document.getElementById("myBody");
const nav = document.getElementById("myNav");
let renderToken = 0;

const fmtDate = (s) => new Date(s).toLocaleDateString("ko-KR");
const fmtTime = (s) => new Date(s).toLocaleString("ko-KR");
const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

boot(async () => {
  if (!Auth.current()) { location.replace("login.html?next=mypage.html"); return; }
  renderHeader();
  renderFooter();

  document.getElementById("logout").addEventListener("click", async (e) => {
    e.preventDefault();
    await Auth.logout();
    location.href = "index.html";
  });
  nav.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='#']");
    if (!a || a.id === "logout") return;
    e.preventDefault();
    location.hash = a.getAttribute("href");
  });
  window.addEventListener("hashchange", () => { my.cancelOpen = false; my.reviewItem = null; my.editReview = null; render(); });
  body.addEventListener("click", onClick);
  body.addEventListener("submit", onSubmit);

  await render();
  if (new URLSearchParams(location.search).has("welcome")) {
    toast(`${Auth.current().name}님, 가입을 환영합니다!`);
    history.replaceState(null, "", "mypage.html");
  }
});

/* ---------- 화면 ---------- */
async function loadStats() {
  const [orders, reviews] = await Promise.all([
    sb.from("orders").select("status, total_amount").in("status", FILTERS[0].statuses),
    sb.from("reviews").select("id", { count: "exact", head: true }),
  ]);
  const list = orders.data || [];
  my.stats = {
    orders: list.length,
    points: list.filter((o) => o.status === "delivered").reduce((s, o) => s + Math.floor(o.total_amount * 0.03), 0),
    reviews: reviews.count || 0,
  };
}

async function render() {
  const token = ++renderToken;
  const user = Auth.current();
  const hash = (location.hash || "#orders").slice(1);
  const [route, arg] = hash.split("/");
  const tab = ["orders", "order", "likes", "reviews", "profile"].includes(route) ? route : "orders";
  nav.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + (tab === "order" ? "orders" : tab)));

  try {
    await loadStats();
    const panel = await ({ orders: ordersPanel, order: () => orderDetailPanel(arg), likes: likesPanel, reviews: reviewsPanel, profile: profilePanel }[tab])();
    if (token !== renderToken) return; // 더 최근 렌더가 있으면 버린다
    body.innerHTML = `
      <section class="my-profile">
        <div>
          <p class="name">${esc(user.name)}님</p>
          <p class="email">${esc(user.email)}</p>
        </div>
        <div class="my-stats">
          <div><b>${my.stats.orders}</b><span>주문</span></div>
          <div><b>${Likes.get().size}</b><span>좋아요</span></div>
          <div><b>${my.stats.reviews}</b><span>후기</span></div>
          <div><b>${my.stats.points.toLocaleString()}</b><span>적립금</span></div>
        </div>
      </section>
      <section class="my-panel">${panel}</section>`;
  } catch (err) {
    console.error(err);
    body.innerHTML = `<p class="empty">정보를 불러오지 못했습니다.<br>잠시 후 다시 시도해주세요.</p>`;
  }
}

/* ---- 주문 목록 ---- */
async function ordersPanel() {
  const f = FILTERS.find((x) => x.key === my.filter) || FILTERS[0];
  const from = (my.page - 1) * PAGE_SIZE;
  const { data, count, error } = await sb.from("orders")
    .select("*, order_items(*)", { count: "exact" })
    .in("status", f.statuses)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  const pages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  return `
    <h2>주문 내역</h2>
    <div class="chips my-filters">
      ${FILTERS.map((x) => `<button type="button" class="chip ${x.key === f.key ? "active" : ""}" data-filter="${x.key}">${x.label}</button>`).join("")}
    </div>
    ${data.length ? data.map(orderRow).join("") : `<p class="empty">주문 내역이 없습니다.<br><br><a href="index.html" style="text-decoration:underline">쇼핑하러 가기</a></p>`}
    ${pages > 1 ? `
    <div class="pager">
      <button type="button" data-page="${my.page - 1}" ${my.page <= 1 ? "disabled" : ""}>‹</button>
      <span>${my.page} / ${pages}</span>
      <button type="button" data-page="${my.page + 1}" ${my.page >= pages ? "disabled" : ""}>›</button>
    </div>` : ""}`;
}

function orderRow(o) {
  const it = o.order_items[0];
  return `
    <div class="order">
      <p class="order-head">
        <span><b>${fmtDate(o.created_at)}</b> · 주문번호 ${esc(o.order_id)}</span>
        <span class="status ${["cancelled", "refunded", "failed", "expired"].includes(o.status) ? "off" : ""}">${STATUS[o.status]}</span>
      </p>
      <a class="cart-item" href="#order/${esc(o.order_id)}">
        <div class="thumb">${it ? productImg({ id: it.product_id, brand: it.brand, name: it.product_name, image: it.image_path }) : ""}</div>
        <div>
          <p class="brand">${it ? esc(it.brand) : ""}</p>
          <p class="name">${esc(o.order_name)}</p>
          <p class="opt">상세 보기 ›</p>
        </div>
        <p class="price" style="margin-top:0">${won(o.total_amount)}</p>
      </a>
    </div>`;
}

/* ---- 주문 상세 ---- */
function refundable(o) {
  return o.status === "delivered" && o.delivered_at && Date.now() - new Date(o.delivered_at) <= REFUND_DAYS * 86400000;
}

async function orderDetailPanel(orderId) {
  const { data: o, error } = await sb.from("orders").select("*, order_items(*), order_events(*)").eq("order_id", orderId).maybeSingle();
  if (error) throw error;
  if (!o) return `<p class="empty">주문을 찾을 수 없습니다.<br><br><a href="#orders" style="text-decoration:underline">주문 내역으로</a></p>`;

  const { data: revs } = await sb.from("reviews").select("*").in("order_item_id", o.order_items.map((i) => i.id));
  const reviewed = new Map((revs || []).map((r) => [r.order_item_id, r]));
  const events = [...o.order_events].sort((a, b) => a.id - b.id);

  let action = "";
  if (o.status === "paid" || o.status === "preparing") {
    action = `<button type="button" class="btn btn-line" data-act="open-cancel">주문 취소</button>`;
  } else if (o.status === "shipping") {
    action = `<p class="hint">배송 중에는 취소할 수 없어요.</p>`;
  } else if (o.status === "delivered") {
    action = refundable(o)
      ? `<button type="button" class="btn btn-line" data-act="open-cancel">환불 요청</button>`
      : `<p class="hint">배송완료 후 ${REFUND_DAYS}일이 지나 환불할 수 없어요.</p>`;
  } else if (o.status === "refund_requested") {
    action = `<p class="hint">환불 요청이 접수되었습니다. 운영자 확인 후 처리됩니다.</p>`;
  }
  const isRefund = o.status === "delivered";

  return `
    <p class="back"><a href="#orders">‹ 주문 내역</a></p>
    <h2>주문 상세 <small>${STATUS[o.status]}</small></h2>
    <dl class="od-meta">
      <div><dt>주문번호</dt><dd>${esc(o.order_id)}</dd></div>
      <div><dt>주문일시</dt><dd>${fmtTime(o.created_at)}</dd></div>
      ${o.paid_at ? `<div><dt>결제일시</dt><dd>${fmtTime(o.paid_at)}</dd></div>` : ""}
      ${o.cancelled_at ? `<div><dt>취소일시</dt><dd>${fmtTime(o.cancelled_at)}</dd></div>` : ""}
      ${o.cancel_reason ? `<div><dt>사유</dt><dd>${esc(o.cancel_reason)}</dd></div>` : ""}
    </dl>

    <h3 class="od-title">주문 상품</h3>
    ${o.order_items.map((i) => {
      const rv = reviewed.get(i.id);
      const canReview = o.status === "delivered" && !rv;
      return `
      <div class="order">
        <a class="cart-item" href="product.html?id=${esc(i.product_id)}">
          <div class="thumb">${productImg({ id: i.product_id, brand: i.brand, name: i.product_name, image: i.image_path })}</div>
          <div>
            <p class="brand">${esc(i.brand)}</p>
            <p class="name">${esc(i.product_name)}</p>
            <p class="opt">옵션: ${esc(i.size)} / ${i.qty}개</p>
          </div>
          <p class="price" style="margin-top:0">${won(i.unit_price * i.qty)}</p>
        </a>
        ${canReview ? `<button type="button" class="btn btn-line btn-sm" data-act="open-review" data-item="${i.id}">후기 쓰기</button>` : ""}
        ${canReview && my.reviewItem === i.id ? reviewForm({ itemId: i.id, productId: i.product_id }) : ""}
        ${rv ? `<p class="hint">내 후기 <span class="star">${stars(rv.rating)}</span> — ${esc(rv.content)}</p>` : ""}
      </div>`;
    }).join("")}

    <h3 class="od-title">결제 정보</h3>
    <table class="spec info-table">
      <tr><th>결제수단</th><td>${esc(o.method || "-")}</td></tr>
      <tr><th>결제금액</th><td><b>${won(o.total_amount)}</b></td></tr>
    </table>

    <h3 class="od-title">배송지</h3>
    <table class="spec info-table">
      <tr><th>받는 분</th><td>${esc(o.receiver || "-")}</td></tr>
      <tr><th>연락처</th><td>${esc(o.phone || "-")}</td></tr>
      <tr><th>주소</th><td>${esc(o.address || "-")}</td></tr>
    </table>

    <h3 class="od-title">진행 기록</h3>
    <ul class="od-events">
      ${events.map((ev) => `<li><span>${fmtTime(ev.created_at)}</span><b>${STATUS[ev.status] || esc(ev.status)}</b>${ev.note ? ` <em>${esc(ev.note)}</em>` : ""}</li>`).join("")}
    </ul>

    <div class="od-actions">
      ${action}
      ${my.cancelOpen ? `
      <form class="cancel-form" id="cancelForm" data-order="${esc(o.order_id)}">
        <label>${isRefund ? "환불" : "취소"} 사유</label>
        <select id="cancelReason">${CANCEL_REASONS.map((r) => `<option>${r}</option>`).join("")}</select>
        <textarea id="cancelDetail" maxlength="150" placeholder="상세 사유 (선택)"></textarea>
        <button type="submit" class="btn btn-black">${isRefund ? "환불 요청하기" : "주문 취소하기"}</button>
      </form>` : ""}
    </div>`;
}

/* ---- 후기 작성/수정 폼 ---- */
function reviewForm({ itemId, productId, review }) {
  const r = review?.rating || 5;
  return `
    <form class="review-form" data-item="${itemId || ""}" data-product="${productId || ""}" data-review="${review?.id || ""}">
      <label>별점
        <select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${n === r ? "selected" : ""}>${stars(n)} (${n}점)</option>`).join("")}</select>
      </label>
      <textarea name="content" maxlength="1000" placeholder="상품에 대한 후기를 남겨주세요." required>${esc(review?.content || "")}</textarea>
      ${review ? "" : `<label>사진 (선택, 최대 3장) <input type="file" name="photos" accept="image/*" multiple></label>`}
      <button type="submit" class="btn btn-black btn-sm">${review ? "수정 완료" : "후기 등록"}</button>
    </form>`;
}

/* ---- 좋아요 ---- */
async function likesPanel() {
  const likes = [...Likes.get()].map(findProduct).filter(Boolean);
  return `
    <h2>좋아요 ${likes.length}</h2>
    ${likes.length ? `<div class="grid" id="likeGrid">${likes.map((p) => productCard(p)).join("")}</div>` : `<p class="empty">좋아요한 상품이 없습니다.</p>`}`;
}

/* ---- 내 후기 ---- */
async function reviewsPanel() {
  const { data, error } = await sb.from("reviews").select("*").eq("user_id", Auth.current().id).order("created_at", { ascending: false });
  if (error) throw error;
  return `
    <h2>내 후기 ${data.length}</h2>
    ${data.length ? `<ul class="reviews">${data.map((r) => {
      const p = findProduct(r.product_id);
      return `
      <li>
        <p class="r-head"><a href="product.html?id=${esc(r.product_id)}"><b>${p ? esc(p.name) : esc(r.product_id)}</b></a> · ${fmtDate(r.created_at)}</p>
        <p><span class="star">${stars(r.rating)}</span></p>
        ${my.editReview === r.id ? reviewForm({ review: r }) : `<p>${esc(r.content)}</p>`}
        ${r.photos.length ? `<div class="rv-photos">${r.photos.map((ph) => `<img src="${esc(sb.storage.from("review-photos").getPublicUrl(ph).data.publicUrl)}" alt="후기 사진" loading="lazy">`).join("")}</div>` : ""}
        <p class="rv-actions"><button type="button" data-act="edit-review" data-id="${r.id}">수정</button> · <button type="button" data-act="delete-review" data-id="${r.id}">삭제</button></p>
      </li>`;
    }).join("")}</ul>` : `<p class="empty">작성한 후기가 없습니다.<br>배송완료된 주문 상세에서 후기를 쓸 수 있어요.</p>`}`;
}

/* ---- 내 정보 ---- */
async function profilePanel() {
  const u = Auth.current();
  return `
    <h2>회원 정보</h2>
    <form class="profile-form" id="profileForm">
      <label for="pfName">이름</label><input id="pfName" value="${esc(u.name)}" required>
      <label>이메일</label><input value="${esc(u.email)}" disabled>
      <label for="pfPhone">휴대폰</label><input id="pfPhone" inputmode="numeric" value="${esc(u.phone)}">
      <label for="pfAddress">기본 배송지</label><input id="pfAddress" value="${esc(u.address)}">
      <p class="hint">가입일 ${fmtDate(u.joined)} · 회원등급 ${my.stats.orders >= 3 ? "GOLD" : "MEMBER"}</p>
      <button type="submit" class="btn btn-black">저장</button>
    </form>`;
}

/* ---------- 이벤트 ---------- */
async function onClick(e) {
  const t = e.target;
  const filter = t.closest("[data-filter]");
  if (filter) { my.filter = filter.dataset.filter; my.page = 1; return render(); }
  const page = t.closest("[data-page]");
  if (page && !page.disabled) { my.page = Number(page.dataset.page); return render(); }

  const like = t.closest("[data-like]");
  if (like) {
    e.preventDefault();
    await attempt(() => Likes.toggle(like.dataset.like));
    return render();
  }

  const act = t.closest("[data-act]");
  if (!act) return;
  const a = act.dataset.act;
  if (a === "open-cancel") { my.cancelOpen = !my.cancelOpen; return render(); }
  if (a === "open-review") { my.reviewItem = my.reviewItem === act.dataset.item ? null : act.dataset.item; return render(); }
  if (a === "edit-review") { my.editReview = my.editReview === act.dataset.id ? null : act.dataset.id; return render(); }
  if (a === "delete-review") {
    if (!confirm("후기를 삭제할까요?")) return;
    const { error } = await sb.from("reviews").delete().eq("id", act.dataset.id);
    toast(error ? "삭제하지 못했습니다." : "후기를 삭제했습니다.");
    return render();
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    if (form.id === "cancelForm") await submitCancel(form);
    else if (form.classList.contains("review-form")) await submitReview(form);
    else if (form.id === "profileForm") await submitProfile();
  } catch (err) {
    toast(err.message || "처리 중 오류가 발생했습니다.");
  } finally {
    btn.disabled = false;
  }
}

async function submitCancel(form) {
  const reason = [document.getElementById("cancelReason").value, document.getElementById("cancelDetail").value.trim()].filter(Boolean).join(" - ");
  if (!confirm("정말 진행할까요?")) return;
  const res = await callOrders({ action: "cancel", orderId: form.dataset.order, reason });
  if (!res.ok) throw new Error(res.message);
  toast(res.status === "refund_requested" ? "환불 요청이 접수되었습니다." : "주문이 취소되었습니다. 결제가 취소되었어요.");
  my.cancelOpen = false;
  await render();
}

async function submitReview(form) {
  const rating = Number(form.rating.value);
  const content = form.content.value.trim();
  if (!content) throw new Error("후기 내용을 입력해주세요.");

  if (form.dataset.review) { // 수정
    const { error } = await sb.from("reviews").update({ rating, content }).eq("id", form.dataset.review);
    if (error) throw error;
    toast("후기를 수정했습니다.");
    my.editReview = null;
    return render();
  }

  const files = [...(form.photos?.files || [])];
  if (files.length > 3) throw new Error("사진은 최대 3장까지 올릴 수 있어요.");
  const photos = [];
  for (const f of files) {
    if (!f.type.startsWith("image/") || f.size > 5 * 1024 * 1024) throw new Error("5MB 이하의 이미지 파일만 올릴 수 있어요.");
    const ext = { "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[f.type] || "jpg";
    const path = `${Auth.current().id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("review-photos").upload(path, f, { contentType: f.type });
    if (error) throw new Error("사진 업로드에 실패했습니다.");
    photos.push(path);
  }
  const { error } = await sb.from("reviews").insert({ order_item_id: form.dataset.item, product_id: form.dataset.product, rating, content, photos });
  if (error) {
    if (photos.length) await sb.storage.from("review-photos").remove(photos);
    throw new Error(error.code === "23505" ? "이미 후기를 작성한 상품입니다." : "후기를 등록하지 못했습니다. 배송완료된 구매 상품만 작성할 수 있어요.");
  }
  toast("후기를 등록했습니다.");
  my.reviewItem = null;
  await render();
}

async function submitProfile() {
  const name = document.getElementById("pfName").value.trim();
  const phone = document.getElementById("pfPhone").value.replace(/\D/g, "");
  if (!name) throw new Error("이름을 입력해주세요.");
  if (phone && !/^01\d{8,9}$/.test(phone)) throw new Error("올바른 휴대폰 번호를 입력해주세요.");
  await Auth.updateProfile({ name, phone, address: document.getElementById("pfAddress").value.trim() });
  renderHeader();
  toast("저장했습니다.");
  await render();
}
