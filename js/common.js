/* 공통: 헤더/푸터, 장바구니, 토스트 */
const CART_KEY = "ws_cart";
const CHECKOUT_KEY = "ws_checkout";

const won = (n) => n.toLocaleString("ko-KR") + "원";
const discountRate = (p) => Math.round((1 - p.sale / p.price) * 100);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------- storage (차단된 환경에서도 동작하도록 try/catch) ---------- */
function load(store, key, fallback) {
  try { return JSON.parse(store.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(store, key, value) {
  try { store.setItem(key, JSON.stringify(value)); } catch {}
}

/* ---------- cart ---------- */
const Cart = {
  get: () => load(localStorage, CART_KEY, []),
  set(items) { save(localStorage, CART_KEY, items); renderCartCount(); },
  add(id, size, qty) {
    const items = Cart.get();
    const found = items.find((i) => i.id === id && i.size === size);
    if (found) found.qty += qty; else items.push({ id, size, qty });
    Cart.set(items);
  },
  update(index, qty) {
    const items = Cart.get();
    if (qty < 1) items.splice(index, 1); else items[index].qty = qty;
    Cart.set(items);
  },
  count: () => Cart.get().reduce((s, i) => s + i.qty, 0),
};

/* ---------- likes ---------- */
const Likes = {
  get: () => new Set(load(localStorage, "ws_likes", [])),
  has: (id) => Likes.get().has(id),
  toggle(id) {
    const set = Likes.get();
    set.has(id) ? set.delete(id) : set.add(id);
    save(localStorage, "ws_likes", [...set]);
    return set.has(id);
  },
};

/*
 * ---------- auth (퍼블리싱용 목업) ----------
 * 회원 정보는 브라우저 localStorage 에만 저장됩니다. 비밀번호는 SHA-256 해시로만 보관합니다.
 * 실서비스에서는 반드시 서버 인증(세션/토큰)으로 교체하세요.
 */
const Auth = {
  users: () => load(localStorage, "ws_users", []),
  current() {
    const email = load(localStorage, "ws_session", null);
    return Auth.users().find((u) => u.email === email) || null;
  },
  async hash(pw) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  },
  async signup({ name, email, phone, password }) {
    const users = Auth.users();
    if (users.some((u) => u.email === email)) throw new Error("이미 가입된 이메일입니다.");
    users.push({ name, email, phone, pw: await Auth.hash(password), joined: new Date().toISOString() });
    save(localStorage, "ws_users", users);
    save(localStorage, "ws_session", email);
  },
  async login(email, password) {
    const user = Auth.users().find((u) => u.email === email);
    if (!user || user.pw !== (await Auth.hash(password))) throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
    save(localStorage, "ws_session", email);
  },
  logout() {
    try { localStorage.removeItem("ws_session"); } catch {}
  },
};

/* ---------- orders (결제 성공 시 기록) ---------- */
const Orders = {
  all: () => load(localStorage, "ws_orders", []),
  add(order) {
    const list = Orders.all().filter((o) => o.orderId !== order.orderId);
    list.unshift(order);
    save(localStorage, "ws_orders", list);
  },
  mine() {
    const user = Auth.current();
    return Orders.all().filter((o) => (user ? o.email === user.email : !o.email));
  },
};

/* 결제할 상품 목록 → checkout.html 로 이동 */
function goCheckout(items, fromCart) {
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
    <a class="card" href="product.html?id=${p.id}">
      <div class="card-thumb">
        ${productImg(p)}
        ${rank ? `<span class="rank">${rank}</span>` : ""}
        <button type="button" class="like ${liked ? "on" : ""}" data-like="${p.id}" aria-label="좋아요">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" fill="rgba(0,0,0,.25)"/></svg>
        </button>
      </div>
      <div class="card-info">
        <p class="card-brand">${p.brand}</p>
        <p class="card-name">${p.name}</p>
        <p class="card-price"><span class="discount">${discountRate(p)}%</span>${won(p.sale)}</p>
        <p class="card-meta"><span><span class="star">★</span> ${p.rating}</span><span>리뷰 ${p.reviews.toLocaleString()}</span><span>♥ ${(p.likes + (liked ? 1 : 0)).toLocaleString()}</span></p>
        ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
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
       <a href="#" class="hide-m" onclick="Auth.logout(); location.reload(); return false;">로그아웃</a>`
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
        <p class="brand">${i.product.brand}</p>
        <p class="name">${i.product.name}</p>
        <p class="opt">옵션: ${i.size}</p>
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

function changeQty(idx, qty) {
  Cart.update(idx, qty);
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
