// 주문/결제 서버 로직: 주문 생성, 결제 승인, 실패 기록, 취소/환불
// 토스 시크릿 키와 service role 키는 이 함수 안에서만 사용한다.
// (Supabase에 배포된 함수 `orders`의 소스 사본. 수정하면 다시 배포해야 반영된다.)
import { createClient } from "npm:@supabase/supabase-js@2";

// TOSS_SECRET_KEY 를 함수 시크릿으로 설정하면 그 값을 쓴다. 없으면 토스 문서용 공개 테스트 시크릿 키(결제위젯 문서 키 쌍)를 쓴다.
const TOSS_SECRET = Deno.env.get("TOSS_SECRET_KEY") ?? "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6";
const TOSS_API = "https://api.tosspayments.com/v1/payments";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });
const fail = (message: string, code = "BAD_REQUEST") => json({ ok: false, code, message });

const tossHeaders = (idem?: string) => ({
  Authorization: "Basic " + btoa(TOSS_SECRET + ":"),
  "Content-Type": "application/json",
  ...(idem ? { "Idempotency-Key": idem } : {}),
});

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: auth } = await admin.auth.getUser(token);
    const user = auth?.user;
    if (!user) return fail("로그인이 필요한 서비스입니다.", "UNAUTHORIZED");

    const body = await req.json();
    switch (body.action) {
      case "create": return await createOrder(user.id, body);
      case "confirm": return await confirmPayment(user.id, body);
      case "fail": return await failOrder(user.id, body);
      case "cancel": return await cancelOrder(user.id, body);
      default: return fail("알 수 없는 요청입니다.");
    }
  } catch (e) {
    console.error(e);
    return fail("서버 오류가 발생했습니다.", "SERVER_ERROR");
  }
});

/* 1) 주문서 생성: 금액은 DB 가격으로 서버가 다시 계산한다 */
async function createOrder(userId: string, body: any) {
  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length || raw.length > 20) return fail("주문할 상품이 올바르지 않습니다.");

  const merged = new Map<string, { id: string; size: string; qty: number }>();
  for (const it of raw) {
    const id = str(it.id, 20), size = str(it.size, 10), qty = Number(it.qty);
    if (!id || !size || !Number.isInteger(qty) || qty < 1 || qty > 99) return fail("주문할 상품이 올바르지 않습니다.");
    const k = id + "|" + size;
    const cur = merged.get(k);
    if (cur) cur.qty += qty; else merged.set(k, { id, size, qty });
  }
  const lines = [...merged.values()];

  const { data: products } = await admin.from("products").select("*, product_sizes(size, stock)").in("id", lines.map((l) => l.id));
  const byId = new Map((products ?? []).map((p: any) => [p.id, p]));

  let total = 0;
  const rows = [];
  for (const l of lines) {
    const p: any = byId.get(l.id);
    const sz = p?.product_sizes.find((s: any) => s.size === l.size);
    if (!p || !sz) return fail("존재하지 않는 상품 또는 사이즈입니다.");
    if (sz.stock < l.qty) return fail(`재고가 부족합니다. (${p.name} / ${l.size}, 남은 수량 ${sz.stock}개)`, "OUT_OF_STOCK");
    total += p.sale * l.qty;
    rows.push({ product_id: p.id, size: l.size, qty: l.qty, unit_price: p.sale, product_name: p.name, brand: p.brand, image_path: p.image_path });
  }

  const first = rows[0].product_name;
  const orderName = rows.length > 1 ? `${first} 외 ${rows.length - 1}건` : first;
  const orderId = "WH-" + Date.now() + "-" + crypto.randomUUID().slice(0, 8);

  const { data: order, error } = await admin.from("orders").insert({
    order_id: orderId, user_id: userId, total_amount: total, order_name: orderName,
    from_cart: !!body.fromCart,
    receiver: str(body.receiver, 50), phone: str(body.phone, 20), address: str(body.address, 200),
  }).select("id").single();
  if (error) throw error;

  const { error: e2 } = await admin.from("order_items").insert(rows.map((r) => ({ ...r, order_id: order.id })));
  if (e2) { await admin.from("orders").delete().eq("id", order.id); throw e2; }

  return json({ ok: true, orderId, amount: total, orderName });
}

/* 2) 결제 승인: 토스 승인 API 호출 후 주문을 결제완료로 바꾼다 */
async function confirmPayment(userId: string, body: any) {
  const paymentKey = str(body.paymentKey, 200), orderId = str(body.orderId, 64), amount = Number(body.amount);
  if (!paymentKey || !orderId) return fail("결제 정보가 올바르지 않습니다.");

  const { data: order } = await admin.from("orders").select("*").eq("order_id", orderId).eq("user_id", userId).maybeSingle();
  if (!order) return fail("주문을 찾을 수 없습니다.", "NOT_FOUND");

  // 새로고침 등으로 다시 호출된 경우: 이미 처리된 주문은 그대로 성공으로 돌려준다 (중복 주문 방지)
  if (order.status !== "pending") {
    if (order.payment_key === paymentKey) return json({ ok: true, orderId, orderName: order.order_name, amount: order.total_amount, method: order.method, status: order.status, repeated: true });
    return fail("이미 처리된 주문입니다.", "ALREADY_PROCESSED");
  }
  if (order.total_amount !== amount) return fail("결제 금액이 주문 금액과 다릅니다.", "AMOUNT_MISMATCH");

  const res = await fetch(TOSS_API + "/confirm", {
    method: "POST", headers: tossHeaders(orderId),
    body: JSON.stringify({ paymentKey, orderId, amount: order.total_amount }),
  });
  const pay = await res.json();
  if (!res.ok) {
    await admin.from("orders").update({ status: "failed", cancel_reason: str(pay.message, 200) }).eq("id", order.id).eq("status", "pending");
    return fail(pay.message ?? "결제 승인에 실패했습니다.", pay.code ?? "CONFIRM_FAILED");
  }

  const { error } = await admin.rpc("finalize_order", {
    p_order: order.id, p_payment_key: paymentKey, p_method: pay.method ?? null, p_paid_at: pay.approvedAt ?? new Date().toISOString(),
  });
  if (error) {
    // 승인 직후 재고가 부족해진 경우: 결제를 되돌린다
    await fetch(`${TOSS_API}/${encodeURIComponent(paymentKey)}/cancel`, {
      method: "POST", headers: tossHeaders(), body: JSON.stringify({ cancelReason: "재고 부족으로 자동 취소" }),
    });
    await admin.from("orders").update({ status: "failed", cancel_reason: "재고 부족", payment_key: paymentKey }).eq("id", order.id).eq("status", "pending");
    return fail("재고가 부족해 결제가 취소되었습니다.", "OUT_OF_STOCK");
  }
  return json({ ok: true, orderId, orderName: order.order_name, amount: order.total_amount, method: pay.method ?? null, status: "paid" });
}

/* 3) 결제 실패 기록 */
async function failOrder(userId: string, body: any) {
  const orderId = str(body.orderId, 64);
  if (!orderId) return json({ ok: true });
  await admin.from("orders").update({ status: "failed", cancel_reason: str(body.message, 200) || str(body.code, 50) })
    .eq("order_id", orderId).eq("user_id", userId).eq("status", "pending");
  return json({ ok: true });
}

/* 4) 취소 / 환불 요청 */
async function cancelOrder(userId: string, body: any) {
  const orderId = str(body.orderId, 64), reason = str(body.reason, 200);
  if (!reason) return fail("사유를 입력해주세요.");
  const { data: order } = await admin.from("orders").select("*").eq("order_id", orderId).eq("user_id", userId).maybeSingle();
  if (!order) return fail("주문을 찾을 수 없습니다.", "NOT_FOUND");

  if (order.status === "paid" || order.status === "preparing") {
    if (!order.payment_key) return fail("결제 정보가 없어 취소할 수 없습니다.");
    const res = await fetch(`${TOSS_API}/${encodeURIComponent(order.payment_key)}/cancel`, {
      method: "POST", headers: tossHeaders("cancel-" + order.order_id), body: JSON.stringify({ cancelReason: reason }),
    });
    const pay = await res.json();
    if (!res.ok && pay.code !== "ALREADY_CANCELED_PAYMENT") return fail(pay.message ?? "결제 취소에 실패했습니다.", pay.code ?? "CANCEL_FAILED");
    const { error } = await admin.rpc("cancel_order_db", { p_order: order.id, p_reason: reason });
    if (error) throw error;
    return json({ ok: true, status: "cancelled" });
  }
  if (order.status === "shipping") return fail("배송 중에는 취소할 수 없어요.", "SHIPPING");
  if (order.status === "delivered") {
    const { error } = await admin.rpc("request_refund_db", { p_order: order.id, p_reason: reason });
    if (error) return fail(error.message.includes("refund_period_over") ? "배송완료 후 7일이 지나 환불할 수 없어요." : "환불을 요청할 수 없는 상태입니다.");
    return json({ ok: true, status: "refund_requested" });
  }
  return fail("취소할 수 없는 주문 상태입니다.");
}
