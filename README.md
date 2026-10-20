# WEARHOUSE — 의류 쇼핑몰 퍼블리싱 (HTML/CSS/JS)

## 페이지
| 파일 | 내용 |
|---|---|
| `index.html` / `shoes.html` / `pants.html` | 상의 / 신발 / 바지 상품 목록 (랭킹, 필터, 정렬, 좋아요) |
| `product.html?id=T001` | 상품 상세 (사이즈 선택, 상품정보, 사이즈표, 후기, 추천상품) |
| `login.html` / `signup.html` | 로그인 / 회원가입 |
| `mypage.html` | 마이페이지 (주문 내역, 좋아요, 회원 정보) — 로그인 필요 |
| `checkout.html` | 주문서 + 토스페이먼츠 결제위젯 (회원은 주문자 정보 자동 입력) |
| `success.html` / `fail.html` | 결제 성공 (주문 내역에 기록) / 실패 |

공통: `css/style.css`, `js/products.js`(상품 데이터), `js/common.js`(헤더·장바구니·회원·주문), 페이지별 `js/*.js`.

## 실행
결제위젯은 `file://`로는 동작하지 않으니 로컬 서버로 여세요. 아래 중 하나:

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```
```bash
python -m http.server 5500
```
```bash
npx serve -l 5500
```
→ http://localhost:5500

## 회원 기능 (목업)
- 회원 정보·주문 내역·좋아요·장바구니는 **브라우저 localStorage**에만 저장됩니다 (비밀번호는 SHA-256 해시).
- 로컬 테스트용 계정 예시: `test-account.example.json` (회원가입 화면에서 이 값으로 가입).
- 실서비스에서는 서버 인증/DB로 교체해야 합니다.

## 토스페이먼츠
- SDK: `https://js.tosspayments.com/v2/standard` (결제위젯 v2)
- `js/checkout.js`의 `TOSS_CLIENT_KEY`는 문서용 **공개 테스트 키**입니다. 내 상점의 결제위젯 클라이언트 키(`test_gck_...`)로 바꾸세요.
- 이 프로젝트는 **결제 인증(결제창)까지**입니다. 실제 결제를 확정하려면 서버에서 시크릿 키로
  `POST https://api.tosspayments.com/v1/payments/confirm` 을 호출해야 합니다 (10분 안에 호출하지 않으면 만료).

## 이미지 출처
`images/*.jpg` 는 [Unsplash](https://unsplash.com) 무료 라이선스 사진입니다 (상업적 사용 가능, 출처 표기 권장).
원본 ID는 파일명이 아닌 아래 목록 참고:

T001 photo-1583743814966-8936f5b7be1a · T002 photo-1564858775545-e2d21c3ceee0 · T003 photo-1732605559386-bc59426d1b16 ·
T004 photo-1773747310674-b42a55d72003 · T005 photo-1620799140408-edc6dcb6d633 · T006 photo-1604508230015-5a54faf1fa56 ·
T007 photo-1680292783974-a9a336c10366 · T008 photo-1580331451062-99ff652288d7 · T009 photo-1713881587420-113c1c43e28a ·
T010 photo-1608984361471-ff566593088f · S001 photo-1608229751021-ed4bd8677753 · S002 photo-1613972798457-45fc5237ae32 ·
S003 photo-1616406432452-07bc5938759d · S004 photo-1676379760823-ebf91f45de0b · S005 photo-1608629601270-a0007becead3 ·
S006 photo-1600185365926-3a2ce3cdb9eb · S007 photo-1596523027665-9da35ced2388 · S008 photo-1525966222134-fcfa99b8ae77 ·
S009 photo-1605812860427-4024433a70fd · S010 photo-1662541089338-c7d53b88be70 · P001 photo-1602293589930-45aad59ba3ab ·
P002 photo-1624378439575-d8705ad7ae80 · P003 photo-1473966968600-fa801b869a1a · P004 photo-1718252540511-e958742e4165 ·
P005 photo-1714143136372-ddaf8b606da7 · P006 photo-1598522325074-042db73aa4e6 · P007 photo-1624378441864-6eda7eac51cb ·
P008 photo-1601561446301-fecc99036f4b · P009 photo-1602573991155-21f0143bb45c · P010 photo-1637069585336-827b298fe84a
