/* 마이페이지 — 로그인 필요 */
const user = Auth.current();
if (!user) location.replace("login.html?next=mypage.html");

renderHeader();
renderFooter();

const body = document.getElementById("myBody");
const nav = document.getElementById("myNav");

document.getElementById("logout").addEventListener("click", (e) => {
  e.preventDefault();
  Auth.logout();
  location.href = "index.html";
});

nav.addEventListener("click", (e) => {
  const a = e.target.closest("a[href^='#']");
  if (!a || a.id === "logout") return;
  e.preventDefault();
  history.replaceState(null, "", a.getAttribute("href"));
  render();
});

function render() {
  if (!user) return;
  const tab = (location.hash || "#orders").slice(1);
  nav.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + tab));

  const orders = Orders.mine();
  const likes = [...Likes.get()].map(findProduct).filter(Boolean);
  const points = orders.reduce((s, o) => s + Math.floor(o.amount * 0.03), 0);

  const profile = `
    <section class="my-profile">
      <div>
        <p class="name">${esc(user.name)}님</p>
        <p class="email">${esc(user.email)}</p>
      </div>
      <div class="my-stats">
        <div><b>${orders.length}</b><span>주문</span></div>
        <div><b>${likes.length}</b><span>좋아요</span></div>
        <div><b>${points.toLocaleString()}</b><span>적립금</span></div>
      </div>
    </section>`;

  const panels = {
    orders: () => `
      <h2>주문 내역</h2>
      ${orders.length ? orders.map(orderBlock).join("") : `<p class="empty">주문 내역이 없습니다.<br><br><a href="index.html" style="text-decoration:underline">쇼핑하러 가기</a></p>`}`,
    likes: () => `
      <h2>좋아요 ${likes.length}</h2>
      ${likes.length ? `<div class="grid" id="likeGrid">${likes.map((p) => productCard(p)).join("")}</div>` : `<p class="empty">좋아요한 상품이 없습니다.</p>`}`,
    profile: () => `
      <h2>회원 정보</h2>
      <table class="spec info-table">
        <tr><th>이름</th><td>${esc(user.name)}</td></tr>
        <tr><th>이메일</th><td>${esc(user.email)}</td></tr>
        <tr><th>휴대폰</th><td>${esc(user.phone.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3"))}</td></tr>
        <tr><th>가입일</th><td>${new Date(user.joined).toLocaleDateString("ko-KR")}</td></tr>
        <tr><th>회원등급</th><td>${orders.length >= 3 ? "GOLD" : "MEMBER"}</td></tr>
      </table>`,
  };

  body.innerHTML = profile + `<section class="my-panel">${(panels[tab] || panels.orders)()}</section>`;
}

function orderBlock(o) {
  const items = lineItems(o.items);
  return `
    <div class="order">
      <p class="order-head">
        <span><b>${new Date(o.date).toLocaleDateString("ko-KR")}</b> · 주문번호 ${esc(o.orderId)}</span>
        <span class="status">결제완료</span>
      </p>
      ${items.map((i) => `
        <a class="cart-item" href="product.html?id=${i.product.id}">
          <div class="thumb">${productImg(i.product)}</div>
          <div>
            <p class="brand">${i.product.brand}</p>
            <p class="name">${i.product.name}</p>
            <p class="opt">옵션: ${i.size} / ${i.qty}개</p>
          </div>
          <p class="price" style="margin-top:0">${won(i.product.sale * i.qty)}</p>
        </a>`).join("")}
      <p class="order-total">결제금액 ${won(o.amount)}</p>
    </div>`;
}

body.addEventListener("click", (e) => {
  const like = e.target.closest("[data-like]");
  if (like) {
    e.preventDefault();
    Likes.toggle(like.dataset.like);
    render();
  }
});

window.addEventListener("hashchange", render);
render();

if (user && new URLSearchParams(location.search).has("welcome")) {
  toast(`${user.name}님, 가입을 환영합니다!`);
  history.replaceState(null, "", "mypage.html");
}
