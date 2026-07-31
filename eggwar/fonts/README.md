# 폰트 (자체 호스팅)

- `jua-subset.woff2` — 게임이 쓰는 폰트. **Jua 를 서브셋한 것**이고 런타임이 이 파일만 받는다.
- `OFL.txt` — SIL Open Font License 1.1. **함께 배포해야 한다**(라이선스 요건).

## 왜 자체 호스팅인가
구글 폰트 `text=` 정확 서브셋은 고유 **800자까지만 파일 하나**로 준다. 문구가 늘어
상한을 넘기자 넘친 글자만 폴백 폰트로 그려져 한 낱말 안에서 글꼴이 갈렸다
(신고: "레벨업"의 '벨업'이 다른 폰트). 자체 호스팅하면 그 상한이 없다.

## 다시 만들기
원본 ttf 는 저장소에 두지 않는다(2MB). 필요할 때 받아서 만든다:

```
curl -sL -o fonts/Jua-Regular.ttf \
  https://raw.githubusercontent.com/google/fonts/main/ofl/jua/Jua-Regular.ttf
python -m pip install fonttools brotli      # 한 번만
node tools/font-build.js                    # → fonts/jua-subset.woff2
node tools/font-audit.js                    # 빠진 글자 0 인지 확인
```

만든 뒤 `js/config.js` 의 `fonts/jua-subset.woff2?v=` 를 올려야 캐시가 갈린다.

⚠ Jua 는 **상용 한글만** 가진다(완성형 11,172자를 다 갖지 않는다). 지금 파일에 든
2,516자가 Jua 가 그릴 수 있는 한글 전부다 — 드문 음절은 어떤 방법으로도 폴백이 된다.
