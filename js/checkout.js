/* 주문/결제 페이지 — 토스페이먼츠 결제위젯 v2 연동 */

/*
 * 결제위젯 연동 키(클라이언트 키).
 * 아래 값은 토스페이먼츠 문서용 공개 테스트 키입니다.
 * 내 상점으로 바꿀 때는 개발자센터 > API 키 > "결제위젯 연동 키"의 클라이언트 키(test_gck_...)로 교체하세요.
 * (시크릿 키는 절대 프론트엔드 코드에 넣지 마세요.)
 */
const TOSS_CLIENT_KEY = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";
const ORDER_KEY = "ws_order";

renderHeader();
renderFooter();

// 로그인한 회원이면 주문자 정보 자동 입력
const member = Auth.current();
if (member) {
  document.getElementById("name").value = member.name;
  document.getElementById("phone").value = member.phone;
  document.getElementById("email").value = member.email;
}

const checkout = load(sessionStorage, CHECKOUT_KEY, null);
const items = checkout ? lineItems(checkout.items) : [];
const payBtn = document.getElementById("payBtn");

if (!items.length) {
  document.querySelector(".checkout").innerHTML =
    `<p class="empty" style="grid-column:1/-1">주문할 상품이 없습니다.<br><br><a href="index.html" style="text-decoration:underline">쇼핑 계속하기</a></p>`;
} else {
  renderOrder();
  initPayment().catch((err) => {
    console.error(err);
    payBtn.textContent = "결제 수단을 불러오지 못했습니다";
    toast(err.message || "결제위젯 초기화에 실패했습니다.");
  });
}

/* ---------- 주문 상품 / 금액 ---------- */
function totals() {
  const origin = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  const total = items.reduce((s, i) => s + i.product.sale * i.qty, 0);
  return { origin, total, discount: origin - total };
}

function renderOrder() {
  document.getElementById("orderItems").innerHTML = items.map((i) => `
    <div class="cart-item">
      <div class="thumb">${productImg(i.product)}</div>
      <div>
        <p class="brand">${i.product.brand}</p>
        <p class="name">${i.product.name}</p>
        <p class="opt">옵션: ${i.size} / ${i.qty}개</p>
      </div>
      <p class="price" style="margin-top:0">${won(i.product.sale * i.qty)}</p>
    </div>`).join("");

  const t = totals();
  document.getElementById("sumOrigin").textContent = won(t.origin);
  document.getElementById("sumDiscount").textContent = "-" + won(t.discount);
  document.getElementById("sumTotal").textContent = won(t.total);
}

function orderName() {
  const first = items[0].product.name;
  const rest = items.length - 1;
  return rest > 0 ? `${first} 외 ${rest}건` : first;
}

function createOrderId() {
  // 6~64자, 영문/숫자/-/_ 만 허용
  return "WH-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

/* ---------- 토스페이먼츠 결제위젯 ---------- */
async function initPayment() {
  if (location.protocol === "file:") {
    throw new Error("결제위젯은 http(s) 서버에서 열어야 동작합니다. README의 로컬 서버 실행 방법을 확인하세요.");
  }
  if (typeof TossPayments !== "function") {
    throw new Error("토스페이먼츠 SDK를 불러오지 못했습니다. 네트워크를 확인하세요.");
  }

  const tossPayments = TossPayments(TOSS_CLIENT_KEY);
  // 비회원 결제: ANONYMOUS / 회원 결제라면 회원 고유 ID(UUID 등)를 넣으세요.
  const widgets = tossPayments.widgets({ customerKey: TossPayments.ANONYMOUS });

  const amount = { currency: "KRW", value: totals().total };
  await widgets.setAmount(amount);

  await Promise.all([
    widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
    widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
  ]);

  payBtn.disabled = false;
  payBtn.textContent = `${won(amount.value)} 결제하기`;

  payBtn.addEventListener("click", async () => {
    const name = document.getElementById("name").value.trim();
    const phone = document.getElementById("phone").value.replace(/\D/g, "");
    const email = document.getElementById("email").value.trim();
    if (!name || !phone) return toast("주문자 이름과 휴대폰 번호를 입력해주세요.");

    const orderId = createOrderId();
    // 결제 성공 후 금액 검증을 위해 주문 정보를 저장 (실서비스에서는 서버 DB에 저장)
    save(sessionStorage, ORDER_KEY, {
      orderId,
      amount: amount.value,
      orderName: orderName(),
      fromCart: checkout.fromCart,
      items: checkout.items,
    });

    try {
      await widgets.requestPayment({
        orderId,
        orderName: orderName(),
        successUrl: new URL("success.html", location.href).href,
        failUrl: new URL("fail.html", location.href).href,
        customerName: name,
        customerEmail: email || undefined,
        customerMobilePhone: phone,
      });
    } catch (err) {
      // 사용자가 결제창을 닫은 경우 등
      toast(err.message || "결제가 취소되었습니다.");
    }
  });
}
