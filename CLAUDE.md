# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

의류 쇼핑몰 퍼블리싱(순수 HTML/CSS/JS, 빌드·번들러·프레임워크·패키지 없음)에 토스페이먼츠 결제위젯 v2와 Supabase(DB·인증·Edge Function)를 연동한 프로젝트. 디자인은 무신사 스타일(검정 헤더, 촘촘한 랭킹형 상품 그리드)을 참고하되 브랜드명은 가상의 "WEARHOUSE"와 가상 브랜드만 사용한다. 실제 무신사 로고·명칭은 쓰지 않는다.

## 실행

빌드·린트·테스트 도구는 없다. 결제위젯은 `file://`에서 동작하지 않으므로 반드시 http 서버로 연다.

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1   # http://localhost:5500 (PORT 환경변수로 변경 가능)
python -m http.server 5500
npx serve -l 5500
```

`.claude/launch.json`의 `shop` 설정이 `serve.ps1`을 실행한다. `serve.ps1`은 HEAD 요청에 본문을 쓰면 안 된다(이전에 Content-Length 오류로 서버가 죽었음).

## 아키텍처

### 스크립트 로딩 구조 (전역 스코프 공유)
모듈 시스템이 없다. 모든 페이지가 `<script>`를 다음 순서로 로드하고 전역 함수/상수를 공유한다.

1. supabase-js(CDN) → `js/supabase.js` — `sb` 클라이언트(publishable 키), `callOrders()`(주문/결제 Edge Function 호출)
2. `js/products.js` — `CATEGORIES`, `PRODUCTS`(빈 배열, `loadProducts()`가 DB에서 채움), `DETAILS`, `productImg()`, `findProduct()`
3. `js/common.js` — `Auth`(Supabase Auth), `requireLogin()`/`nextTarget()`, `Cart`/`Likes`(DB 저장 + 메모리 캐시), `App.ready`/`boot()`, `goCheckout()`, `productCard()`, `renderHeader()`/`renderFooter()`, 장바구니 드로어, `toast()`, `esc()`
4. 페이지 전용 스크립트 — `shop.js`, `product.js`, `checkout.js`, `mypage.js`. login/signup/success/fail은 인라인 스크립트.

모든 페이지 스크립트는 `boot(main)` 안에서 시작한다. `App.ready`(로그인 상태·상품·장바구니·좋아요 로딩)가 끝난 뒤 `main`이 실행되므로 그 안에서는 `PRODUCTS`/`Cart.get()`/`Likes.has()`를 동기로 써도 된다. 서버 쓰기(`Cart.add`, `Likes.toggle` 등)는 async이고 실패하면 throw하므로 `attempt()`로 감싼다.

헤더·푸터는 각 HTML의 `#header`/`#footer`에 JS로 렌더링되므로 공통 UI 수정은 `common.js`에서 한다.

### 카테고리 페이지
`index.html`(상의)·`shoes.html`·`pants.html`은 마크업이 동일하고 `<body data-cat="tops|shoes|pants">`만 다르다. `shop.js`가 `data-cat`을 읽어 `CATEGORIES`/`PRODUCTS`에서 렌더링한다. 카테고리를 추가하려면 `CATEGORIES`, `PRODUCTS`, `DETAILS`, `product.js`의 `SIZE_TABLES`를 모두 수정하고 HTML 파일을 복제한다.

### 상품 데이터와 이미지
상품 id 접두사가 카테고리를 뜻한다(T=상의, S=신발, P=바지). 이미지 원본은 `images/{id}.jpg`(800×960, Unsplash 무료 라이선스)이고, 실제 화면은 Supabase Storage 공개 버킷 `product-images/{id}.jpg`를 쓴다(`products.image_path`에 전체 URL 저장). 원본 Unsplash 사진 ID 목록은 README에 있다. 상품을 추가하면 같은 규칙으로 파일을 버킷에 올리고 `products` 행을 넣고 README 목록도 갱신한다.

### 상태 저장 (Supabase, 프로젝트 `wearhouse` / ref `hgtuzlcknccfuycewpia`, 서울)
회원·상품·재고·장바구니·좋아요·주문·리뷰는 모두 Supabase DB에 있다. 테이블은 `profiles`, `products`, `product_sizes`(재고), `cart_items`, `likes`, `orders`, `order_items`(주문 당시 가격·이름 스냅샷), `order_events`(상태 기록), `reviews`. 모든 테이블에 RLS가 켜져 있고, 주문·재고·결제 관련 쓰기는 브라우저에서 불가능하다(읽기만 본인 것에 한해 허용).

- 브라우저에 남는 것은 `ws_checkout`(sessionStorage: 결제할 상품 목록·장바구니 결제 여부)뿐이다.
- 주문 상태: pending → paid → preparing → shipping → delivered, 그 외 cancelled / refund_requested / refunded / failed / expired. 배송 상태(preparing/shipping/delivered)는 관리자 페이지가 없어 Supabase 화면에서 `orders.status`를 직접 바꾼다(delivered로 바꾸면 `delivered_at`과 상태 기록이 자동 생성).
- DB 함수 `finalize_order`(재고 차감+결제완료, 중복 호출 안전), `cancel_order_db`(재고 복원), `request_refund_db`, `expire_pending_orders`(pg_cron 10분마다, 1시간 지난 pending을 expired로)는 service role 전용이다.
- 리뷰 작성자 이름(김*수)은 트리거가 서버에서 채운다. 사진은 Storage 버킷 `review-photos`(공개 읽기, 본인 폴더만 업로드).
- 좋아요 수는 `products.like_count`(트리거 동기화), 리뷰 평균·개수는 `product_stats` 뷰(security_invoker).

### SEO / AEO / GEO (정적 산출물)
화면은 JS가 그리므로 검색·AI 크롤러용 정적 HTML을 `tools/seo-build.mjs`가 만든다: `node tools/seo-build.mjs`(Supabase 공개 데이터를 읽음, Node 필요). 상품·가격·후기를 바꾸면 다시 실행하고 결과물을 커밋한다. 사이트 주소는 `SITE_URL` 환경변수(기본값은 스크립트의 DEFAULT_SITE, 커스텀 도메인을 붙이면 바꾼다).
- 각 HTML의 `<!--SEO:HEAD|NAV|GRID|CONTENT|DETAIL|FOOT-->` 마커 사이는 생성기가 덮어쓴다. 직접 고치지 말고 생성기를 고친다. 마커를 지우지 않는다.
- 생성물: `product-{id}.html`(상품 정적 페이지, 상세는 이쪽이 정식 주소), `about.html`, `faq.html`, `sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt`, `products.json`. `product.html?id=`는 noindex이고 정적 페이지로 이동시킨다. `vercel.json`은 비공개 페이지에 X-Robots-Tag noindex를 건다.
- 정적 텍스트(FAQ·요약)와 JSON-LD는 같은 문구여야 한다. 사이트에 구현된 정책(무료배송, 7일 환불 등)만 쓰고, 데모 쇼핑몰이라는 고지를 유지한다. 리뷰가 없으면 aggregateRating을 넣지 않는다.
- `SIZE_TABLES`는 `js/products.js`에 있고 상세 페이지와 생성기가 같이 쓴다.

상품 상세는 예전에 목록 위 모달이었다가 `product.html`로 분리됐다. `css/style.css`의 `.modal*` 규칙 대부분은 그 잔재이고, 지금은 `.modal-total`만 상세 페이지에서 재사용한다.

### 결제 흐름
상세/장바구니 → `goCheckout()`(로그인 필요, `ws_checkout` 저장) → `checkout.html`에서 결제위젯 렌더링 → 결제하기 클릭 시 Edge Function `orders`의 `create`가 DB 가격·재고로 금액을 계산해 pending 주문 생성 → `requestPayment()` → `success.html?paymentKey&orderId&amount`에서 `confirm`이 금액 대조 + 토스 승인 API 호출 + `finalize_order`(재고 차감, 장바구니 비움). 실패 시 `fail.html`이 `fail`로 주문을 failed 처리. 취소/환불은 마이페이지 주문 상세에서 `cancel`을 호출한다(결제완료·준비중=토스 결제 취소+재고 복원, 배송완료 7일 이내=환불 요청, 배송중=거부).

- Edge Function `orders`(`supabase/functions/orders/index.ts`에 소스 사본)가 토스 시크릿 키와 service role 키를 쓴다. `TOSS_SECRET_KEY` 시크릿이 없으면 토스 문서용 공개 테스트 시크릿 키로 동작한다. 내 상점 키를 쓰려면 대시보드에서 `TOSS_SECRET_KEY` 시크릿을 설정한다.
- `js/checkout.js`의 `TOSS_CLIENT_KEY`는 토스 문서용 공개 테스트 키(`test_gck_docs_...`)다.
- 결제창은 팝업이라 Claude 앱 내장 브라우저에서는 열리지 않는다. 끝까지 테스트하려면 실제 Chrome을 쓴다. 승인 이후 단계는 SQL로 `finalize_order` 등을 호출해 검증할 수 있다.
- URL 파라미터·DB 값을 화면에 출력할 때는 반드시 `esc()`를 거친다.

## Supabase 연동 규칙

요구사항은 `PRD.md`가 기준이다. 남은 일(대시보드에서만 가능): "Confirm email" 끄기, 유출 비밀번호 보호 켜기.

- 비로그인 장바구니는 만들지 않는다. 담기·좋아요·결제 등은 "로그인이 필요한 서비스입니다" 알림 후 `login.html?next=`로 보내고, 로그인하면 원래 페이지로 복귀한다.
- 토스 승인/취소 API와 시크릿 키는 Supabase Edge Function에서만 쓴다. 브라우저 코드에는 publishable 키와 토스 클라이언트 키만 둔다.
- 결제 금액은 서버가 DB 가격으로 재계산한다. 클라이언트가 보낸 금액은 신뢰하지 않는다.

## 문서 작성

- 기획 문서 파일명은 `PRD.md`다(`RPD.md` 아님).
- `PRD.md`는 개발자가 아닌 사람도 이해하도록 쉬운 말로 쓴다. RLS, Edge Function 같은 용어는 풀어 쓰거나 피한다.

## 토스페이먼츠 MCP

`.mcp.json`에 `tosspayments-integration-guide` MCP 서버가 등록돼 있다(Windows라 `cmd /c npx` 형태). 토스 API·SDK 사용법이 필요하면 이 MCP의 문서 검색 도구를 먼저 사용한다.

## 이 PC 환경의 주의점 (Windows, 한글 사용자명·PC명)

- Git Bash의 PATH에는 Node/Python이 없을 수 있다. 전체 경로를 사용한다: `C:\Program Files\nodejs\node.exe`, `npx.cmd`, `%LOCALAPPDATA%\Programs\Python\Python312\python.exe` (`python`만 치면 MS Store 스텁이 잡힌다).
- Windows PowerShell 5.1은 BOM 없는 UTF-8 `.ps1`을 ANSI로 읽으므로 `.ps1` 파일에는 ASCII만 쓴다.
- PC명이 한글이라 Vercel CLI가 HTTP 헤더 오류(ByteString)로 실패한다. `.vercel-tools/vercel.ps1`(gitignore 대상)이 `C:/Users/Public/vercel-tools/ascii-host.cjs`를 `NODE_OPTIONS --require`로 주입해 `os.hostname()`을 ASCII로 바꾼 뒤 `npx vercel@latest`를 실행한다. 한글 경로나 백슬래시는 NODE_OPTIONS에서 깨지므로 hook 경로는 ASCII + 슬래시로 유지한다.
  ```bash
  powershell -ExecutionPolicy Bypass -File .\.vercel-tools\vercel.ps1 deploy --prod
  ```

## 저장소

원격: https://github.com/dygks8989/Test_Tosspayments_Shop (`main`)
