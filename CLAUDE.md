# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

의류 쇼핑몰 퍼블리싱(순수 HTML/CSS/JS, 빌드·번들러·프레임워크·패키지 없음)에 토스페이먼츠 결제위젯 v2를 연동한 프로젝트. 디자인은 무신사 스타일(검정 헤더, 촘촘한 랭킹형 상품 그리드)을 참고하되 브랜드명은 가상의 "WEARHOUSE"와 가상 브랜드만 사용한다. 실제 무신사 로고·명칭은 쓰지 않는다.

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

1. `js/products.js` — `CATEGORIES`(카테고리별 라벨·페이지·세부필터·사이즈), `PRODUCTS`(상품 배열), `DETAILS`, `productImg()`, `findProduct()`
2. `js/common.js` — 저장소 헬퍼(`load`/`save`), `Cart`, `Likes`, `Auth`, `Orders`, `goCheckout()`, `productCard()`, `renderHeader()`/`renderFooter()`, 장바구니 드로어, `toast()`, `esc()`
3. 페이지 전용 스크립트 — `shop.js`(목록), `product.js`(상세), `checkout.js`(결제), `mypage.js`. login/signup/success/fail은 인라인 스크립트.

헤더·푸터는 각 HTML의 `#header`/`#footer`에 JS로 렌더링되므로 공통 UI 수정은 `common.js`에서 한다.

### 카테고리 페이지
`index.html`(상의)·`shoes.html`·`pants.html`은 마크업이 동일하고 `<body data-cat="tops|shoes|pants">`만 다르다. `shop.js`가 `data-cat`을 읽어 `CATEGORIES`/`PRODUCTS`에서 렌더링한다. 카테고리를 추가하려면 `CATEGORIES`, `PRODUCTS`, `DETAILS`, `product.js`의 `SIZE_TABLES`를 모두 수정하고 HTML 파일을 복제한다.

### 상품 데이터와 이미지
상품 id 접두사가 카테고리를 뜻한다(T=상의, S=신발, P=바지). 이미지는 `images/{id}.jpg`(800×960, Unsplash 무료 라이선스)로 고정 매핑되며, 원본 Unsplash 사진 ID 목록은 README에 있다. 상품을 추가하면 같은 규칙으로 이미지를 넣고 README 목록도 갱신한다.

### 상태 저장 (서버 없음, 전부 목업)
| 키 | 저장소 | 용도 |
|---|---|---|
| `ws_cart` | localStorage | 장바구니 `[{id,size,qty}]` |
| `ws_likes` | localStorage | 좋아요 상품 id 배열 |
| `ws_users` / `ws_session` | localStorage | 회원 목록(비밀번호는 SHA-256 해시) / 로그인한 이메일 |
| `ws_orders` | localStorage | 결제 성공 주문 내역 (회원 email로 필터) |
| `ws_checkout` | sessionStorage | 결제할 상품 + 장바구니 결제 여부 |
| `ws_order` | sessionStorage | 결제 요청 시 저장한 orderId·금액 (성공 페이지 검증용) |

`Auth.hash`는 `crypto.subtle`을 쓰므로 보안 컨텍스트(localhost 또는 https)에서만 동작한다. 로그인·마이페이지 테스트용 계정 값은 `test-account.example.json`에 있다(회원가입 화면에서 이 값으로 가입한 뒤 사용).

상품 상세는 예전에 목록 위 모달이었다가 `product.html`로 분리됐다. `css/style.css`의 `.modal*` 규칙 대부분은 그 잔재이고, 지금은 `.modal-total`만 상세 페이지에서 재사용한다.

### 결제 흐름
상세/장바구니 → `goCheckout()`이 `ws_checkout` 저장 → `checkout.html`에서 `TossPayments(clientKey).widgets()`로 결제 UI·약관 렌더링 → 결제하기 시 `ws_order` 저장 후 `requestPayment()` → 토스가 `success.html?paymentKey&orderId&amount` 또는 `fail.html?code&message&orderId`로 리다이렉트 → 성공 페이지가 `ws_order`와 대조 후 `Orders.add()`로 주문 기록, 장바구니 결제였으면 장바구니를 비움.

- `js/checkout.js`의 `TOSS_CLIENT_KEY`는 토스 문서용 공개 테스트 키(`test_gck_docs_...`)다.
- 결제 **승인 API**(`POST /v1/payments/confirm`, 시크릿 키 필요)는 서버 몫이라 구현돼 있지 않다. 현재는 결제 인증 단계까지만 동작한다.
- 결제창은 팝업이라 Claude 앱 내장 브라우저에서는 열리지 않는다. 끝까지 테스트하려면 실제 Chrome을 쓰거나, `ws_order` 값으로 `success.html` 쿼리를 직접 만들어 확인한다.
- URL 파라미터를 화면에 출력할 때는 반드시 `esc()`를 거친다.

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
