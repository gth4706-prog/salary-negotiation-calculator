# 이직 연봉 협상 계산기 — 배포용 정적 사이트

순수 정적(HTML/CSS/JS) 사이트라 빌드 도구 없이 어떤 무료 호스팅에도 올릴 수 있습니다.

## 구조
```
site/
├── index.html                  # 메인 툴
├── about.html / privacy.html / contact.html   # 필수 3페이지(애드센스 요건)
├── guide/salary-negotiation-guide.html        # 오리지널 콘텐츠
├── css/style.css               # 공유 디자인 시스템
├── js/site.js (테마) / app.js (계산 로직)
├── ads.txt / robots.txt / sitemap.xml
└── .gitignore
```

## 배포 전 치환할 플레이스홀더
| 플레이스홀더 | 위치 | 바꿀 값 |
|---|---|---|
| `YOUR-DOMAIN` | 모든 html, robots.txt, sitemap.xml | 실제 도메인 (예: myraise.co.kr) |
| `CONTACT@YOUR-DOMAIN` | contact.html | 실제 문의 이메일 |
| `ca-pub-XXXXXXXXXXXXXXXX` | index.html `<head>` 주석 | 애드센스 publisher ID |
| `pub-XXXXXXXXXXXXXXXX` | ads.txt | 애드센스 publisher ID(pub-부분) |

> 도메인이 정해지면 위 치환은 Claude가 일괄로 처리합니다.

## 애드센스 켜는 순서 (승인 후)
1. index.html `<head>`의 애드센스 `<script>` 주석 해제 + publisher ID 교체
2. ads.txt의 publisher ID 교체
3. 광고 슬롯(`.ad-slot`) 위치에 실제 광고 단위 코드 삽입 (또는 Auto Ads)

## 배포 방법 (택1, 둘 다 무료)
- **Cloudflare Pages**: 대시보드 → Pages → 이 폴더 연결/업로드 → 커스텀 도메인 지정
- **GitHub Pages**: 공개 저장소에 push → Settings → Pages → 브랜치 지정

## 로컬 미리보기
정적 파일이라 `index.html`을 브라우저로 바로 열어도 동작합니다.
(간이 서버가 필요하면 도구 설치 후 `npx serve` 등 사용)

## 사람이 해야 하는 것 (계정/결제/심사)
1. 도메인 구매(연 ~1.5만원)  2. GitHub/Cloudflare 로그인 1회  3. 애드센스 계정 생성·신청 → 승인 대기

## 주의
- 실수령액은 2026 요율 **근사치**(1인·식대20만). 정식은 국세청 간이세액표로 교체 예정.
- 평균/포지션은 **예시 데이터**. 정식은 고용노동부 공공데이터로 교체 예정.
- 애드센스 정책상 광고 강제 노출/오클릭 유도 금지 → 광고는 콘텐츠 사이 자연 배치.
