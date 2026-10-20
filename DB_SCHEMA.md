# DB 스키마 명세서

Supabase 프로젝트 `wearhouse` (ref `hgtuzlcknccfuycewpia`, 서울 `ap-northeast-2`) 기준. 요구사항은 [PRD.md](PRD.md), 코드 구조는 [CLAUDE.md](CLAUDE.md)를 본다.

- 모든 `public` 테이블에 **RLS가 켜져 있다.** 브라우저(publishable 키)는 아래 "접근 권한"에 적힌 것만 할 수 있다.
- 주문·재고·결제 관련 쓰기는 Edge Function `orders`(service role)와 DB 함수만 한다.
- 시간 컬럼은 모두 `timestamptz`.

## 1. ER 개요

```
auth.users ─1:1─ profiles
    │
    ├─< cart_items >─ product_sizes >─ products
    ├─< likes ───────────────────────── products
    ├─< orders ─< order_items ──────── products
    │      └─< order_events
    └─< reviews ──(1:1)── order_items ─ products

product_sizes: PK (product_id, size) — 재고는 여기서만 관리
```

## 2. 테이블

### profiles — 회원 정보
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK, FK → auth.users(id) ON DELETE CASCADE | 회원 ID |
| name | text | NOT NULL | 이름 |
| phone | text | | 휴대폰(숫자만) |
| address | text | | 기본 배송지 |
| created_at | timestamptz | NOT NULL, default now() | |

가입 시 트리거 `on_auth_user_created`가 `raw_user_meta_data`의 name/phone으로 자동 생성한다.

### products — 상품
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | text | PK | `T###`(상의) / `S###`(신발) / `P###`(바지) |
| cat | text | NOT NULL, CHECK in (tops, shoes, pants) | 카테고리 |
| sub | text | NOT NULL | 세부 분류(예: 반소매 티셔츠) |
| brand | text | NOT NULL | |
| name | text | NOT NULL | |
| price | int | NOT NULL, CHECK > 0 | 정가 |
| sale | int | NOT NULL, CHECK > 0 | 판매가(결제 기준) |
| color | text | | 대표 색상 |
| badge | text | | 무료배송 / 단독 등 |
| image_path | text | NOT NULL | Storage 공개 URL (`product-images/{id}.jpg`) |
| like_count | int | NOT NULL, default 0 | 좋아요 수(트리거 동기화) |
| created_at | timestamptz | NOT NULL, default now() | |

### product_sizes — 사이즈별 재고
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| product_id | text | PK, FK → products(id) ON DELETE CASCADE | |
| size | text | PK | S/M/L/XL/2XL, 230~280 등 |
| stock | int | NOT NULL, default 0, CHECK >= 0 | 남은 수량 |

사이즈 목록: 상의 S·M·L·XL·2XL / 신발 230~280(10 단위) / 바지 S·M·L·XL. 시드 재고는 사이즈당 30.

### cart_items — 장바구니
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| user_id | uuid | PK, default auth.uid(), FK → auth.users ON DELETE CASCADE | |
| product_id | text | PK | |
| size | text | PK | |
| qty | int | NOT NULL, CHECK 1~99 | |
| created_at | timestamptz | NOT NULL, default now() | |

FK `(product_id, size)` → `product_sizes`. 없는 사이즈는 담을 수 없다. 인덱스: `(product_id, size)`.

### likes — 좋아요
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| user_id | uuid | PK, default auth.uid(), FK → auth.users ON DELETE CASCADE | |
| product_id | text | PK, FK → products ON DELETE CASCADE | |
| created_at | timestamptz | NOT NULL, default now() | |

인덱스: `(product_id)`. insert/delete 시 트리거가 `products.like_count`를 증감한다.

### orders — 주문
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | 내부 ID |
| order_id | text | NOT NULL, UNIQUE | 토스에 넘기는 주문번호(`WH-{ms}-{8자}`) |
| user_id | uuid | NOT NULL, FK → auth.users | |
| status | text | NOT NULL, default 'pending', CHECK (아래 참고) | 주문 상태 |
| total_amount | int | NOT NULL | 서버가 DB 가격으로 계산한 결제 금액 |
| order_name | text | NOT NULL | 예: "OO 외 2건" |
| from_cart | boolean | NOT NULL, default false | 장바구니 결제 여부 |
| receiver / phone / address | text | | 배송 정보 |
| payment_key | text | | 토스 paymentKey |
| method | text | | 결제 수단(카드 등) |
| paid_at / cancelled_at / delivered_at | timestamptz | | 결제·취소·배송완료 시각 |
| cancel_reason | text | | 취소·환불·실패 사유 |
| created_at | timestamptz | NOT NULL, default now() | |

인덱스: `(user_id, created_at desc)`.

**status 값과 흐름**

```
pending ─ 승인 ─> paid ─> preparing ─> shipping ─> delivered ─ 환불요청 ─> refund_requested ─> refunded
   │                │         │                                       (7일 이내)
   │                └─────────┴── 취소 ─> cancelled
   ├─ 결제 실패/승인 실패 ─> failed
   └─ 1시간 경과 ─> expired
```

| 값 | 뜻 | 바꾸는 주체 |
|---|---|---|
| pending | 결제 대기 | 주문 생성(서버) |
| paid | 결제완료 | `finalize_order` |
| preparing / shipping / delivered | 준비중 / 배송중 / 배송완료 | **운영자가 Supabase 화면에서 직접** |
| cancelled | 취소완료 | `cancel_order_db` |
| refund_requested | 환불 요청 | `request_refund_db` |
| refunded | 환불완료 | 운영자가 `cancel_order_db` 처리(또는 직접 변경) |
| failed | 결제 실패 | 서버(`fail`/`confirm`) |
| expired | 기간 만료 | `expire_pending_orders` |

### order_items — 주문 상품 (주문 당시 스냅샷)
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| order_id | uuid | NOT NULL, FK → orders(id) ON DELETE CASCADE | |
| product_id | text | NOT NULL, FK → products | |
| size | text | NOT NULL | |
| qty | int | NOT NULL, CHECK > 0 | |
| unit_price | int | NOT NULL | 주문 당시 판매가 |
| product_name / brand / image_path | text | NOT NULL | 주문 당시 이름·브랜드·이미지 |

인덱스: `(order_id)`, `(product_id)`. 상품 정보가 나중에 바뀌어도 과거 주문 표시는 그대로다.

### order_events — 주문 상태 기록
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | bigint | PK, identity | |
| order_id | uuid | NOT NULL, FK → orders(id) ON DELETE CASCADE | |
| status | text | NOT NULL | 바뀐 상태 |
| note | text | | 사유 등 |
| created_at | timestamptz | NOT NULL, default now() | |

트리거가 주문 생성 시와 `status` 변경 시마다 자동으로 쌓는다. 인덱스: `(order_id)`.

### reviews — 후기
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, default auth.uid(), FK → auth.users ON DELETE CASCADE | |
| order_item_id | uuid | NOT NULL, **UNIQUE**, FK → order_items ON DELETE CASCADE | 구매 1건당 후기 1개 |
| product_id | text | NOT NULL, FK → products | |
| rating | int | NOT NULL, CHECK 1~5 | 별점 |
| content | text | NOT NULL, CHECK 길이 1~1000 | |
| photos | text[] | NOT NULL, default '{}', CHECK 최대 3개 | Storage 경로 |
| author_name | text | NOT NULL | 마스킹 이름(김*수). 트리거가 서버에서 채운다 |
| created_at | timestamptz | NOT NULL, default now() | |

인덱스: `(product_id, created_at desc)`, `(user_id)`.

## 3. 뷰

### product_stats (`security_invoker = true`)
| 컬럼 | 설명 |
|---|---|
| product_id | 상품 ID |
| like_count | `products.like_count` |
| review_count | 후기 개수 |
| rating | 평균 별점(소수 1자리, 후기 없으면 0) |

`anon`, `authenticated`에 SELECT 허용.

## 4. 함수와 트리거

모두 `security definer`, `search_path=''`. **`finalize_order`, `cancel_order_db`, `request_refund_db`, `expire_pending_orders`는 service role 전용**(anon·authenticated의 EXECUTE 회수). 트리거 함수도 외부 호출 불가.

| 이름 | 종류 | 동작 |
|---|---|---|
| `handle_new_user` | 트리거(auth.users INSERT) | profiles 행 생성 |
| `finalize_order(order, payment_key, method, paid_at)` | RPC | 주문 행 잠금 → pending일 때만: 재고 차감(부족하면 `out_of_stock` 예외) → paid 처리 → `from_cart`면 해당 장바구니 행 삭제. 이미 처리됐으면 현재 상태만 반환(중복 호출 안전) |
| `cancel_order_db(order, reason)` | RPC | paid/preparing/refund_requested일 때: 재고 복원 → cancelled(환불요청이었다면 refunded), `cancelled_at` 기록 |
| `request_refund_db(order, reason)` | RPC | delivered이고 `delivered_at` 7일 이내일 때만 refund_requested. 아니면 `not_delivered` / `refund_period_over` 예외 |
| `expire_pending_orders()` | RPC | 1시간 지난 pending → expired. **pg_cron `expire-pending-orders`가 10분마다 실행** |
| `log_order_status` | 트리거(orders INSERT / UPDATE OF status) | order_events 기록 |
| `orders_before_update` | 트리거(orders BEFORE UPDATE) | status가 delivered로 바뀌면 `delivered_at` = now() |
| `set_review_author` | 트리거(reviews BEFORE INSERT) | profiles 이름으로 `author_name` 마스킹 설정(클라이언트가 보낸 값은 무시) |
| `sync_like_count` | 트리거(likes INSERT/DELETE) | `products.like_count` 증감 |

## 5. 접근 권한 (RLS)

`auth.uid()`는 성능을 위해 `(select auth.uid())`로 감싸 쓴다.

| 테이블 | anon | authenticated(본인 행만) |
|---|---|---|
| profiles | – | SELECT, UPDATE |
| products | SELECT | SELECT |
| product_sizes | SELECT | SELECT |
| cart_items | – | SELECT, INSERT, UPDATE, DELETE |
| likes | – | SELECT, INSERT, DELETE |
| orders | – | SELECT |
| order_items | – | SELECT (본인 주문 것만) |
| order_events | – | SELECT (본인 주문 것만) |
| reviews | SELECT | SELECT(전체), INSERT(아래 조건), UPDATE·DELETE(본인) |

- **reviews INSERT 조건**: `user_id`가 본인 + 해당 `order_item`이 본인 주문이고 주문 상태가 `delivered` + `product_id`가 그 주문 상품과 일치.
- orders / order_items / order_events / product_sizes 의 쓰기, products 수정은 정책이 없으므로 브라우저에서 불가능하다.

## 6. Storage

| 버킷 | 공개 | 용도 | 정책 |
|---|---|---|---|
| `product-images` | 공개 읽기 | 상품 이미지 `{id}.jpg` | 업로드 정책 없음(관리 작업은 service role) |
| `review-photos` | 공개 읽기 | 후기 사진 `{user_id}/{uuid}.{ext}` | authenticated는 **자기 user_id 폴더에만** INSERT·DELETE |

## 7. Edge Function

`orders` (소스: `supabase/functions/orders/index.ts`, `verify_jwt = true`). 로그인 사용자의 JWT로 본인을 확인한 뒤 service role로 DB를 다룬다.

| action | 하는 일 |
|---|---|
| `create` | DB 가격·재고로 금액 계산 → pending 주문 + 주문 상품 생성. 반환: orderId, amount, orderName |
| `confirm` | 금액 대조 → 토스 승인 API → `finalize_order`. 재고 부족 시 토스 결제를 자동 취소하고 failed 처리. 같은 paymentKey로 재호출하면 그대로 성공 응답 |
| `fail` | 본인의 pending 주문을 failed로 |
| `cancel` | paid/preparing → 토스 취소 + `cancel_order_db`, delivered(7일 이내) → `request_refund_db`, shipping → 거부 |

시크릿 `TOSS_SECRET_KEY`가 없으면 토스 문서용 공개 테스트 시크릿 키로 동작한다.

## 8. 운영 메모

- 배송 상태 변경: Table Editor에서 `orders.status`를 `preparing` → `shipping` → `delivered`로 바꾼다. 환불 요청(`refund_requested`) 건의 실제 카드 환불은 토스페이먼츠 상점 관리자에서 처리한 뒤 `cancel_order_db`로 재고를 복원한다.
- 마이그레이션 이력: `init_schema` → `seed_products` → `order_functions` → `like_count_column` → `fk_indexes` → `product_images_bucket`.
- 보안 점검(`get_advisors`) 결과: 남은 경고는 "유출 비밀번호 보호 비활성" 1건(대시보드 설정).
