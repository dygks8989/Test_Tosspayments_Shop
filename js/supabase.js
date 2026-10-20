/*
 * Supabase 연결 (브라우저용)
 * publishable 키는 공개해도 되는 키입니다. 데이터 접근은 DB의 행 단위 보안 규칙(RLS)이 막아줍니다.
 * 토스 시크릿 키 / service role 키는 절대 이 파일에 넣지 마세요 (서버 함수 orders 안에서만 사용).
 */
const SUPABASE_URL = "https://hgtuzlcknccfuycewpia.supabase.co";
const SUPABASE_KEY = "sb_publishable_O9v1ULSxu7i-6tnC-B9oPw_FG8EIKS5";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* 주문/결제 서버 함수 호출: { ok, ... } 형태로 응답을 돌려받는다 */
async function callOrders(body) {
  const { data, error } = await sb.functions.invoke("orders", { body });
  if (error) throw new Error("서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.");
  return data;
}
