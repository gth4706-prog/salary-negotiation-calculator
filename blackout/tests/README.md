> v0.2 추가 검사: `node blackout/tests/rooms.test.js`, `node blackout/tests/match.test.js`. 브라우저/서버 테스트 의존성은 `playwright`와 `ws`이며 배포 게임에는 포함하지 않습니다. Windows Edge와 `BROWSER_PATH` 환경변수를 지원합니다. 실제 서버는 joeltool.com만 허용하므로 로컬에서는 아래 대역을 사용합니다.

# 블랙아웃 검증

빌드 도구가 없는 정적 사이트라, 확인은 전부 여기서 한다.
눈으로 보고 넘어가면 놓치는 것들만 모아 두었다 —
어둠 게임이라 **화면을 봐서는 규칙이 맞는지 알 수가 없다.**

## 1. 규칙 (의존성 없음)

```
node blackout/tests/core.test.js
```

발자국(한 칸/두 칸/안 움직임), 페인트 5턴 만료, 충돌, 총성의 결정성,
「마지막 한 발로 이긴 턴」 회귀, 화면에 상대 좌표가 안 새는지까지 확인한다.

## 2. 밸런스 (의존성 없음)

```
node blackout/tests/balance.js 2000
RANGE=0 SENSE=0 NOISE=0 node blackout/tests/balance.js 2000   # 처음 규칙 그대로
```

봇끼리 N판 두고 격추율·명중률·무승부·발자국 발생 횟수를 센다.
규칙을 만지면 **먼저 여기서 재고** 옮긴다. 눈금은 환경변수로 돌린다
(`RANGE` `SENSE` `BLUR` `NOISE` `MAXT`).

`js/core.js` 의 규칙 주석에 적힌 숫자들이 전부 이 도구로 나온 것이다.

## 3. 화면·대전 (playwright 필요)

```
npm i playwright                      # 브라우저는 이미 깔려 있다고 가정
python3 -m http.server 8765           # 저장소 루트에서
node blackout/tests/roomserver.js     # 방 서버 대역 (:8767)

node blackout/tests/layout.js         # 여섯 기종에서 화면이 안 넘치는지
node blackout/tests/pvp.js            # 브라우저 둘을 붙여 한 판
node blackout/tests/safety.js         # 어긋남 감지·복구 · 재접속 따라잡기
node blackout/tests/invite.test.js    # 초대 링크 복사 → ?room= 으로 바로 입장 → 시작
node blackout/tests/endgame.test.js   # 판 종료 → 결과 → 한 판 더 · 턴 시간 초과 자동 넘김
node blackout/tests/leave.test.js     # 대전 중 상대가 앱을 닫으면 30초 뒤 기권승
```

`assets-manifest.js` 는 테스트가 아니라 도구다 — 그림을 넣거나 뺀 뒤 한 번 돌려
`assets/manifest.json` 을 다시 만든다.

## 배포할 때

`index.html` 의 `?v=` 꼬리표를 올릴 것. GitHub Pages 가 파일을 캐시하므로 꼬리표가
같으면 되돌아온 방문자가 최대 10분 옛 코드를 본다.

`roomserver.js` 는 **실제 방 서버가 아니다.** 실제 서버는 Cloudflare Durable
Object(`arena-room`)이고 그 소스는 이 저장소에 없다. 규약(입장·준비→시작·릴레이)만
같게 흉내 내서, 서버 없이도 넷코드를 끝까지 밟아 볼 수 있게 한 대역이다.
`localStorage['blackout.rtbase']` 로 갈아끼운다.

`safety.js` 에서 배운 것 하나: **소켓만 끊으면 대전이 안 끊긴다.** P2P 직결이
살아 있어서 턴이 그대로 온다. 실전에서는 그게 장점이지만, 재접속 경로를 재려면
두 경로를 다 끊어야 한다.
