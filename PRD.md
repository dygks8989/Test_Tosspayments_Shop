# PRD: WEARHOUSE Supabase 연동

현재 localStorage/sessionStorage 목업으로 동작하는 쇼핑몰을 Supabase(Auth, Postgres, Storage, Edge Functions) 기반으로 전환한다. 이 문서는 요구사항, 데이터 모델, 정책, 구현 순서를 정의한다.

## 1. 목표와 범위

### 목표
- 회원·상품·장바구니·좋아요·주문·리뷰 데이터를 DB에 저장한다.
- 결제 승인·취소를 서버(Edge Function)에서 처리해 시크릿 키 노출과 금액 위·변조를 막는다.
- 주문 내역 조회, 취소/환불, 리뷰 작성까지 구매 후 흐름을 완성한다.

### 범위 밖
- 관리자 페이지(상품·주문 관리). 상품·주문 상태 변경은 Supabase 대시보드 또는 SQL로 한다.
- 비로그인 장바구니, 비회원 주문.
- 부분 취소, 교환, 쿠폰/포인트, 배송 추적 연동.
- 소셜 로그인, 이메일 인증(후속 과제).

### 기술 제약
- 순수 HTML/CSS/JS, 빌드 도구 없음. `supabase-js`는 CDN `<script>`로 로드한다.
- 프론트에는 publishable(anon) 키만 둔다. service_role 키와 토스 시크릿 키는 Edge Function 환경변수에만 둔다.
- 토스 승인/취소 API(`api.tosspayments.com`)는 브라우저에서 직접 호출하지 않는다.

## 2. 핵심 정책

| 항목 | 정책 |
|---|---|
| 로그인 필요 기능 | 장바구니 담기, 바로구매, 좋아요, 결제, 마이페이지, 리뷰 작성 |
| 비로그인 시 동작 | "로그인이 필요한 서비스입니다" 토스트(또는 확인창) 표시 후 `login.html?next=<현재 URL>`로 이동, 로그인 후 원래 페이지로 복귀 |
| 비로그인 열람 | 상품 목록, 상품 상세, 리뷰 읽기는 허용 |
| 장바구니 | 로그인 사용자 전용. 비로그인 localStorage 장바구니는 폐기 |
| 금액 검증 | 결제 금액은 서버가 DB 가격으로 재계산해 토스가 돌려준 금액과 대조 |
| 재고 | 결제 승인 성공 시 차감, 취소/환불 완료 시 복원 |

## 3. 기능 요구사항

### F1. 기반
- F1-1. Supabase 프로젝트 생성, `js/supabase.js`에서 클라이언트 초기화(`sb` 전역).
- F1-2. 모든 페이지에서 `supabase-js` CDN → `products.js`(제거 예정) → `supabase.js` → `common.js` 순으로 로드.
- F1-3. `common.js`의 `Cart`/`Likes`/`Auth`/`Orders`를 async API로 재작성하고, 이를 호출하는 `shop.js`·`product.js`·`checkout.js`·`mypage.js`를 `await` 기반으로 수정.
- F1-4. 공통 가드 `requireLogin(next)`: 세션이 없으면 알림 후 로그인 페이지로 이동.

### F2. 인증
- F2-1. 회원가입: `auth.signUp`(이메일, 비밀번호) + 이름·연락처는 `profiles`에 저장.
- F2-2. 로그인/로그아웃: `signInWithPassword`, `signOut`. `?next=` 복귀 처리.
- F2-3. 헤더 로그인 상태 표시는 `onAuthStateChange`로 갱신.
- F2-4. `profiles` 자동 생성: `auth.users` insert 트리거.
- F2-5. 마이페이지 회원정보 조회/수정(이름, 연락처, 기본 배송지).
- F2-6. 기존 `Auth.hash`(SHA-256)와 `ws_users`/`ws_session` 제거.

### F3. 상품
- F3-1. `categories`, `products`, `product_sizes`(사이즈별 재고), `product_details` 테이블.
- F3-2. `shop.js`: `data-cat` 기준 목록 조회, 세부 필터·정렬은 쿼리로 처리.
- F3-3. `product.js`: 상품 상세, 사이즈별 재고(품절 표시), 사이즈표, 평균 별점·리뷰 수 표시.
- F3-4. 이미지는 Supabase Storage `product-images`(public 버킷)로 이전하고 `products.image_url`에 저장. 기존 `images/{id}.jpg`를 업로드.
- F3-5. 시드: 기존 `PRODUCTS`/`DETAILS`를 INSERT SQL로 변환해 `supabase/seed.sql`에 보관. 변환 후 `products.js` 삭제.

### F4. 장바구니 (로그인 전용)
- F4-1. `cart_items(user_id, product_id, size, qty)`, `(user_id, product_id, size)` 유니크.
- F4-2. 담기·수량 변경·삭제·전체 비우기, 장바구니 드로어와 헤더 뱃지 연동.
- F4-3. 비로그인으로 담기 시도 시 `requireLogin` 동작(F1-4).
- F4-4. 재고보다 많은 수량은 담기·수량 변경 시 차단.

### F5. 좋아요
- F5-1. `likes(user_id, product_id)` 복합 PK. 토글은 insert/delete.
- F5-2. 목록·상세의 하트 상태 표시, 상품별 좋아요 수(`products.like_count` 또는 집계 뷰).
- F5-3. 마이페이지 "좋아요한 상품" 목록.
- F5-4. 비로그인 시 `requireLogin`.

### F6. 주문·결제
- F6-1. 결제 시작: `create-order` Edge Function 호출
  - 입력: 상품 id·사이즈·수량 목록, 배송 정보
  - 처리: DB 가격·재고 검증 → `orders`(status=`pending`) + `order_items` 생성 → `orderId`, `amount`, `orderName` 반환
  - 프론트는 반환값으로 `widgets.setAmount()`와 `requestPayment()`를 호출(금액을 클라이언트에서 계산하지 않음).
- F6-2. 결제 승인: `success.html`이 `paymentKey/orderId/amount`로 `confirm-payment` Edge Function 호출
  - 처리: 주문·금액 대조 → 토스 `POST /v1/payments/confirm`(시크릿 키) → 성공 시 `paid` 갱신, 재고 차감, 결제 장바구니 항목 삭제
  - 멱등성: 이미 `paid`인 주문 재호출 시 기존 결과 반환(새로고침 대응).
- F6-3. 결제 실패: `fail.html`에서 주문을 `failed`로 갱신(코드·메시지 저장).
- F6-4. `pending` 상태로 일정 시간(예: 1시간) 지난 주문은 `expired` 처리(pg_cron 또는 조회 시 필터).
- F6-5. `ws_order`, `ws_orders`, `ws_checkout`은 제거. 바로구매/장바구니 결제 구분은 `checkout.html?mode=cart|direct&items=...` 또는 sessionStorage 임시값으로 유지해도 된다(금액은 어디서도 신뢰하지 않음).

### F7. 내 주문 내역 (마이페이지)
- F7-1. 주문 목록: 최신순, 주문일·주문번호·대표 상품 썸네일·상품명(외 N건)·금액·상태 뱃지.
- F7-2. 상태 필터(전체/결제완료/배송중/배송완료/취소·환불)와 페이지네이션(10건).
- F7-3. 주문 상세: 상품별 사이즈·수량·단가, 결제 수단·금액, 배송지, 결제/취소 일시, 상태 이력.
- F7-4. 상세에서 취소/환불 요청(F8), 리뷰 작성(F9), 상품 상세 이동 버튼 제공.
- F7-5. `pending`/`failed`/`expired` 주문은 기본 목록에서 숨기고, 필터에서만 노출.

### F8. 취소·환불
상태 흐름: `pending → paid → preparing → shipping → delivered`, 취소 계열은 `cancelled`, `refund_requested`, `refunded`.

| 주문 상태 | 사용자 동작 | 처리 |
|---|---|---|
| `paid`, `preparing` | 즉시 전체 취소 | `cancel-payment` Edge Function → 토스 `POST /v1/payments/{paymentKey}/cancel`(시크릿 키) → `cancelled`, 재고 복원 |
| `shipping` | 취소 불가 | 안내 문구 표시 |
| `delivered`(7일 이내) | 환불 요청 | 사유 입력 → `refund_requested`로 기록. 승인과 토스 취소 호출은 운영자가 수동 처리(관리자 기능은 범위 밖) → `refunded` |
| `delivered`(7일 초과) | 환불 불가 | 안내 문구 표시 |

- F8-1. 취소 사유 선택/입력을 `orders.cancel_reason`에 저장.
- F8-2. 취소는 본인 주문, 허용 상태에서만 가능하도록 서버에서 검증.
- F8-3. 취소 성공 시 `cancelled_at`, 환불 금액 저장. 토스 취소 실패 시 상태를 바꾸지 않고 오류를 노출.
- F8-4. 상태 변경은 `order_events`(order_id, status, memo, created_at)에 이력으로 남김.
- F8-5. 배송 상태(`preparing`/`shipping`/`delivered`) 전환은 관리자 기능이 없으므로 대시보드에서 수동 변경.

### F9. 리뷰
- F9-1. `reviews(id, user_id, product_id, order_item_id, rating 1~5, content, created_at, updated_at)`. `order_item_id` 유니크로 구매 1건당 리뷰 1개.
- F9-2. 작성 자격: 해당 `order_item`이 본인의 `delivered` 주문일 때만. 서버(RLS 또는 RPC)에서 검증.
- F9-3. 상품 상세: 리뷰 목록(최신순/별점순), 평균 별점, 별점 분포, 페이지네이션. 작성자는 이름 마스킹 표시. 비로그인도 열람 가능.
- F9-4. 본인 리뷰 수정·삭제. 마이페이지 "내 리뷰" 목록.
- F9-5. 리뷰 사진(선택): Storage `review-images`(경로 `{user_id}/...`, 최대 3장, 장당 5MB).
- F9-6. 평균 별점·리뷰 수는 `product_rating` 뷰(또는 트리거 갱신 컬럼)로 제공.
- F9-7. 리뷰 작성 진입점은 주문 상세(F7-4)와 상품 상세(구매자에게만 버튼 노출).

## 4. 데이터 모델

```
profiles        (id PK=auth.users.id, name, phone, address, created_at)
categories      (id PK, label, page, sort)
products        (id PK, category_id, brand, name, price, image_url, like_count, created_at)
product_details (product_id PK, description, material, size_table jsonb)
product_sizes   (product_id, size, stock, PK(product_id,size))
cart_items      (id PK, user_id, product_id, size, qty, UNIQUE(user_id,product_id,size))
likes           (user_id, product_id, created_at, PK(user_id,product_id))
orders          (id PK, order_id text UNIQUE, user_id, status, amount, order_name,
                 recipient, phone, address, payment_key, payment_method,
                 cancel_reason, refund_amount, paid_at, cancelled_at, created_at)
order_items     (id PK, order_id FK, product_id, name_snapshot, image_snapshot,
                 size, qty, unit_price)
order_events    (id PK, order_id FK, status, memo, created_at)
reviews         (id PK, user_id, product_id, order_item_id UNIQUE, rating, content,
                 created_at, updated_at)
review_images   (id PK, review_id FK, path)
```

- `order_items`는 주문 시점의 상품명·이미지·단가를 스냅샷으로 저장한다(상품이 바뀌어도 내역 유지).
- `orders.status`: `pending | paid | preparing | shipping | delivered | cancelled | refund_requested | refunded | failed | expired`.

## 5. 보안 (RLS)

모든 테이블 RLS 활성화.

| 테이블 | select | insert/update/delete |
|---|---|---|
| categories, products, product_details, product_sizes | 전체 공개 | 클라이언트 불가(service_role만) |
| profiles | 본인 | 본인(update) |
| cart_items, likes | 본인 | 본인 |
| orders, order_items, order_events | 본인 | 클라이언트 불가. Edge Function(service_role)만 |
| reviews, review_images | 전체 공개 | 본인. insert는 자격 검증(F9-2) 통과 시만 |

- 재고 차감·복원, 주문 상태 변경은 클라이언트 직접 쓰기를 막고 Edge Function 또는 `security definer` RPC로만 수행한다.
- Edge Function은 요청의 JWT로 사용자를 확인하고, 주문 소유자가 일치하는지 검증한다.
- 토스 시크릿 키는 Edge Function secrets(`TOSS_SECRET_KEY`)에만 저장한다.
- Storage: `product-images`는 공개 읽기·쓰기 불가, `review-images`는 공개 읽기·본인 폴더 쓰기.
- `get_advisors`로 RLS 누락과 보안 경고를 확인한다.

## 6. Edge Functions

| 함수 | 역할 |
|---|---|
| `create-order` | 가격·재고 검증, pending 주문 생성, 결제 정보 반환 |
| `confirm-payment` | 토스 승인 호출, 주문 paid 전환, 재고 차감, 장바구니 정리 |
| `cancel-payment` | 허용 상태 검증, 토스 취소 호출, cancelled 전환, 재고 복원 |
| `request-refund` | 배송완료 후 환불 요청 기록(`refund_requested`) |

## 7. 화면 변경 요약

| 파일 | 변경 |
|---|---|
| `login.html`, `signup.html` | Supabase Auth 연동, `?next=` 복귀 |
| `index/shoes/pants.html` + `shop.js` | DB 조회, 좋아요 연동 |
| `product.html` + `product.js` | DB 조회, 재고, 리뷰 섹션 |
| `checkout.html` + `checkout.js` | `create-order` 호출 후 결제 요청 |
| `success.html` / `fail.html` | `confirm-payment` 호출 / 실패 기록 |
| `mypage.html` + `mypage.js` | 주문 내역, 주문 상세, 취소/환불, 내 리뷰, 좋아요, 회원정보 |
| `common.js` | `Cart`/`Likes`/`Auth` 재작성, `requireLogin`, 헤더 상태 |

## 8. 구현 순서

1. 기반: 프로젝트 생성, 마이그레이션 파일(`supabase/migrations/`), `supabase.js`, 시드, 이미지 Storage 업로드
2. 상품 읽기: `shop.js`, `product.js` DB 전환
3. 인증 + `profiles` + `requireLogin`
4. 장바구니 + 좋아요
5. 주문·결제: `create-order`, `confirm-payment`, success/fail 연동
6. 주문 내역 + 주문 상세
7. 취소·환불: `cancel-payment`, `request-refund`
8. 리뷰 + 평점 집계
9. RLS 점검, advisors 확인, 전체 시나리오 테스트, CLAUDE.md 갱신

## 9. 테스트 시나리오

- 비로그인: 담기/좋아요/결제 시 알림 후 로그인 이동, 로그인 후 원래 페이지 복귀.
- 가입 → 로그인 → 담기 → 결제(토스 테스트 키) → 주문 내역에 `paid`로 표시, 재고 감소, 장바구니 비워짐.
- 결제 성공 페이지 새로고침 시 중복 승인·중복 주문 없음.
- 클라이언트에서 금액을 조작해도 서버 검증에서 거부.
- `paid` 주문 취소 → 토스 취소 성공, 재고 복원, 상태 `cancelled`.
- `shipping` 주문은 취소 버튼 없음, 서버에서도 거부.
- `delivered` 주문만 리뷰 작성 가능, 같은 항목 중복 작성 불가, 타인 리뷰 수정 불가.
- 다른 사용자의 주문·장바구니·좋아요 조회 불가(RLS).

## 10. 미결정/후속

- 토스 결제창은 팝업이라 앱 내장 브라우저에서 열리지 않으므로, 결제 테스트는 실제 Chrome으로 한다.
- 관리자 기능(상품·주문·환불 승인)은 후속 과제. 그 전까지는 대시보드 수동 처리.
- 이메일 인증, 비밀번호 재설정, 소셜 로그인은 후속 과제.
