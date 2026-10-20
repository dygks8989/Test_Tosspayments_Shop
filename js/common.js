/* 공통: 로그인, 장바구니, 좋아요, 헤더/푸터, 토스트 (데이터는 Supabase에 저장) */
const CHECKOUT_KEY = "ws_checkout";

const won = (n) => n.toLocaleString("ko-KR") + "원";
const discountRate = (p) => Math.round((1 - p.sale / p.price) * 100);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------- storage (결제 직전 임시 데이터용, 차단된 환경에서도 동작하도록 try/catch) ---------- */
function load(store, key, fallback) {
  try { return JSON.parse(store.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(store, key, value) {
  try { store.setItem(key, JSON.stringify(value)); } catch {}
}

/* ---------- auth (Supabase Auth) ---------- */
const AUTH_ERRORS = {
  "Invalid login credentials": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "User already registered": "이미 가입된 이메일입니다.",
  "Email not confirmed": "이메일 인증이 완료되지 않았습니다.",
};
const authMsg = (e) => AUTH_ERRORS[e.message] || e.message;

const Auth = {
  user: null, // { id, email, name, phone, address, joined }
  async init() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { Auth.user = null; return; }
    const { data: prof } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    Auth.user = {
      id: session.user.id, email: session.user.email, joined: session.user.created_at,
      name: prof?.name || session.user.email.split("@")[0], phone: prof?.phone || "", address: prof?.address || "",
    };
  },
  current: () => Auth.user,
  async signup({ name, email, phone, password }) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name, phone } } });
    if (error) throw new Error(authMsg(error));
    if (!data.session) throw new Error("가입은 완료되었지만 이메일 인증이 필요합니다. 메일함을 확인해주세요.");
  },
  async login(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(authMsg(error));
  },
  async logout() {
    await sb.auth.signOut();
  },
  async updateProfile({ name, phone, address }) {
    const { error } = await sb.from("profiles").update({ name, phone, address }).eq("id", Auth.user.id);
    if (error) throw error;
    Object.assign(Auth.user, { name, phone, address });
  },
};

/* 로그인이 필요한 기능: 안내 후 로그인 화면으로 보내고, 로그인하면 지금 페이지로 돌아온다 */
function requireLogin() {
  if (Auth.user) return true;
  alert("로그인이 필요한 서비스입니다.");
  const here = (location.pathname.split("/").pop() || "index.html") + location.search + location.hash;
  location.href = "login.html?next=" + encodeURIComponent(here);
  return false;
}

/* 로그인 후 돌아갈 주소 (같은 사이트의 .html 만 허용) */
function nextTarget() {
  const next = new URLSearchParams(location.search).get("next") || "";
  return /^[a-z]+\.html(\?[\w=&%.\-]*)?(#[\w=\-]*)?$/.test(next) ? next : "index.html";
}

/* ---------- cart (로그인한 회원만, Supabase cart_items) ---------- */
const Cart = {
  items: [], // [{ id, size, qty }]
  async load() {
    const { data, error } = await sb.from("cart_items").select("product_id, size, qty").order("created_at");
    if (error) throw error;
    Cart.items = data.map((r) => ({ id: r.product_id, size: r.size, qty: r.qty }));
    renderCartCount();
  },
  get: () => Cart.items,
  count: () => Cart.items.reduce((s, i) => s + i.qty, 0),
  maxQty(id, size) {
    return Math.min(99, findProduct(id)?.stock?.[size] ?? 0);
  },
  async add(id, size, qty) {
    if (!requireLogin()) return false;
    const found = Cart.items.find((i) => i.id === id && i.size === size);
    const next = (found?.qty || 0) + qty;
    const max = Cart.maxQty(id, size);
    if (next > max) throw new Error(max ? `재고가 부족합니다. (남은 수량 ${max}개)` : "품절된 사이즈입니다.");
    const { error } = await sb.from("cart_items").upsert({ user_id: Auth.user.id, product_id: id, size, qty: next }, { onConflict: "user_id,product_id,size" });
    if (error) throw error;
    if (found) found.qty = next; else Cart.items.push({ id, size, qty: next });
    renderCartCount();
    return true;
  },
  async update(index, qty) {
    const it = Cart.items[index];
    if (!it) return;
    if (qty < 1) {
      const { error } = await sb.from("cart_items").delete().eq("product_id", it.id).eq("size", it.size);
      if (error) throw error;
      Cart.items.splice(index, 1);
    } else {
      const max = Cart.maxQty(it.id, it.size);
      if (qty > max) throw new Error(`재고가 부족합니다. (남은 수량 ${max}개)`);
      const { error } = await sb.from("cart_items").update({ qty }).eq("product_id", it.id).eq("size", it.size);
      if (error) throw error;
      it.qty = qty;
    }
    renderCartCount();
  },
};

/* ---------- likes (로그인한 회원만, Supabase likes) ---------- */
const Likes = {
  ids: new Set(),
  async load() {
    const { data, error } = await sb.from("likes").select("product_id");
    if (error) throw error;
    Likes.ids = new Set(data.map((r) => r.product_id));
  },
  get: () => Likes.ids,
  has: (id) => Likes.ids.has(id),
  /* 좋아요 상태를 반대로 바꾸고, 바뀐 상태(true=좋아요)를 돌려준다. 로그인 안 했으면 null */
  async toggle(id) {
    if (!requireLogin()) return null;
    const p = findProduct(id);
    if (Likes.ids.has(id)) {
      const { error } = await sb.from("likes").delete().eq("product_id", id);
      if (error) throw error;
      Likes.ids.delete(id);
      if (p) p.likes = Math.max(0, p.likes - 1);
    } else {
      const { error } = await sb.from("likes").insert({ product_id: id });
      if (error) throw error;
      Likes.ids.add(id);
      if (p) p.likes += 1;
    }
    return Likes.ids.has(id);
  },
};

/* 페이지 시작 전에 로그인 상태 / 상품 / 장바구니 / 좋아요를 준비한다 */
const App = {
  ready: (async () => {
    await Auth.init();
    await Promise.all([loadProducts(), Auth.user ? Cart.load() : null, Auth.user ? Likes.load() : null]);
  })(),
};

/* 페이지 스크립트 진입점: 준비가 끝나면 main 실행, 실패하면 안내문 표시 */
function boot(main) {
  App.ready.then(main).catch((err) => {
    console.error(err);
    const el = document.querySelector("main") || document.body;
    el.innerHTML = `<p class="empty">데이터를 불러오지 못했습니다.<br>잠시 후 새로고침 해주세요.</p>`;
  });
}

/* 서버 작업 중 오류가 나면 토스트로 보여준다 */
async function attempt(fn) {
  try { return await fn(); } catch (err) { toast(err.message || "처리 중 오류가 발생했습니다."); return undefined; }
}

/* 결제할 상품 목록 → checkout.html 로 이동 */
function goCheckout(items, fromCart) {
  if (!requireLogin()) return;
  save(sessionStorage, CHECKOUT_KEY, { items, fromCart });
  location.href = "checkout.html";
}

function lineItems(items) {
  return items
    .map((i) => ({ ...i, product: findProduct(i.id) }))
    .filter((i) => i.product);
}

/* ---------- 상품 카드 (목록 / 연관상품 / 좋아요 목록 공통) ---------- */
function productCard(p, rank) {
  const liked = Likes.has(p.id);
  return `
    <a class="card" href="product-${p.id}.html">
      <div class="card-thumb">
        ${productImg(p)}
        ${rank ? `<span class="rank">${rank}</span>` : ""}
        <button type="button" class="like ${liked ? "on" : ""}" data-like="${p.id}" aria-label="좋아요">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" fill="rgba(0,0,0,.25)"/></svg>
        </button>
      </div>
      <div class="card-info">
        <p class="card-brand">${esc(p.brand)}</p>
        <p class="card-name">${esc(p.name)}</p>
        <p class="card-price"><span class="discount">${discountRate(p)}%</span>${won(p.sale)}</p>
        <p class="card-meta"><span><span class="star">★</span> ${p.reviews ? p.rating : "-"}</span><span>리뷰 ${p.reviews.toLocaleString()}</span><span>♥ ${p.likes.toLocaleString()}</span></p>
        ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}
      </div>
    </a>`;
}

/* ---------- layout ---------- */
function renderHeader(activeCat) {
  const nav = Object.entries(CATEGORIES)
    .map(([key, c]) => `<li><a href="${c.page}" class="${key === activeCat ? "active" : ""}">${c.label}</a></li>`)
    .join("");
  const user = Auth.current();
  const authLinks = user
    ? `<a href="mypage.html" class="hide-m"><b>${esc(user.name)}</b>님</a>
       <a href="#" class="hide-m" id="logoutLink">로그아웃</a>`
    : `<a href="login.html" class="hide-m">로그인</a>
       <a href="signup.html" class="hide-m">회원가입</a>`;
  document.getElementById("header").innerHTML = `
    <header class="header">
      <div class="inner header-top">
        <a href="index.html" class="logo">WEARHOUSE</a>
        <form class="search" onsubmit="return false">
          <input type="search" placeholder="브랜드, 상품, 프로필, 태그 등" aria-label="검색">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        </form>
        <div class="header-util">
          ${authLinks}
          <a href="mypage.html" class="icon-btn" aria-label="마이페이지">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>
          </a>
          <button class="cart-btn" type="button" onclick="openDrawer()" aria-label="장바구니">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M5 8h14l-1.2 12H6.2L5 8z"/><path d="M9 8V6a3 3 0 016 0v2"/></svg>
            <span class="cart-count" id="cartCount">0</span>
          </button>
        </div>
      </div>
      <nav class="gnb"><ul class="inner">${nav}</ul></nav>
    </header>`;
  document.getElementById("logoutLink")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await Auth.logout();
    location.href = "index.html";
  });
  renderCartCount();
}

function renderFooter() {
  const el = document.getElementById("footer");
  if (!el) return;
  el.innerHTML = `
    <footer class="footer">
      <div class="inner">
        <strong>WEARHOUSE</strong>
        퍼블리싱 데모 페이지입니다. 실제 상품 판매가 이루어지지 않습니다.<br>
        결제는 토스페이먼츠 테스트 환경으로 동작하며 실제 금액이 청구되지 않습니다.
        <nav class="footer-links" aria-label="안내"><a href="about.html">브랜드 소개</a><a href="faq.html">자주 묻는 질문</a><a href="llms.txt">llms.txt</a><a href="sitemap.xml">사이트맵</a></nav>
      </div>
    </footer>
    <div class="toast" id="toast"></div>`;
}

function renderCartCount() {
  const el = document.getElementById("cartCount");
  if (el) {
    const n = Cart.count();
    el.textContent = n;
    el.style.display = n ? "" : "none";
  }
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

/* ---------- cart drawer ---------- */
function ensureDrawer() {
  if (document.getElementById("drawer")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="dim" id="drawerDim" onclick="closeDrawer()"></div>
    <aside class="drawer" id="drawer" aria-label="장바구니">
      <div class="drawer-head"><h2>장바구니</h2><button type="button" onclick="closeDrawer()" aria-label="닫기">×</button></div>
      <div class="drawer-list" id="drawerList"></div>
      <div class="drawer-foot" id="drawerFoot"></div>
    </aside>`);
}

function openDrawer() {
  if (!requireLogin()) return;
  ensureDrawer();
  renderDrawer();
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawerDim").classList.add("open");
}

function closeDrawer() {
  document.getElementById("drawer")?.classList.remove("open");
  document.getElementById("drawerDim")?.classList.remove("open");
}

function renderDrawer() {
  const items = lineItems(Cart.get());
  const list = document.getElementById("drawerList");
  const foot = document.getElementById("drawerFoot");
  if (!items.length) {
    list.innerHTML = `<p class="empty">장바구니에 담긴 상품이 없습니다.</p>`;
    foot.innerHTML = "";
    return;
  }
  list.innerHTML = items.map((i, idx) => `
    <div class="cart-item">
      <div class="thumb">${productImg(i.product)}</div>
      <div>
        <p class="brand">${esc(i.product.brand)}</p>
        <p class="name">${esc(i.product.name)}</p>
        <p class="opt">옵션: ${esc(i.size)}</p>
        <div class="qty">
          <button type="button" onclick="changeQty(${idx}, ${i.qty - 1})" aria-label="수량 감소">−</button>
          <span>${i.qty}</span>
          <button type="button" onclick="changeQty(${idx}, ${i.qty + 1})" aria-label="수량 증가">+</button>
        </div>
        <p class="price">${won(i.product.sale * i.qty)}</p>
      </div>
      <button type="button" class="remove" onclick="changeQty(${idx}, 0)">삭제</button>
    </div>`).join("");

  const origin = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  const total = items.reduce((s, i) => s + i.product.sale * i.qty, 0);
  foot.innerHTML = `
    <div class="row"><span>상품 금액</span><span>${won(origin)}</span></div>
    <div class="row"><span>할인 금액</span><span>-${won(origin - total)}</span></div>
    <div class="row"><span>배송비</span><span>무료</span></div>
    <div class="row total"><span>결제 예정 금액</span><span>${won(total)}</span></div>
    <button type="button" class="btn btn-black" onclick="checkoutCart()">${won(total)} 구매하기</button>`;
}

async function changeQty(idx, qty) {
  await attempt(() => Cart.update(idx, qty));
  renderDrawer();
}

function checkoutCart() {
  const items = Cart.get();
  if (!items.length) return;
  goCheckout(items, true);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeDrawer(); typeof closeModal === "function" && closeModal(); }
});
