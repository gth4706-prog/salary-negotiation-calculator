/* 가구·가전 실루엣 아이콘 — top-down(위에서 본) 평면도 기호
   viewBox 0 0 100 100 기준, fill=currentColor 전용(그라디언트·stroke 없음).
   각 값은 <svg x y width height viewBox="0 0 100 100" preserveAspectRatio="none">
   내부에 그대로 삽입되는 마크업 문자열이며, 실제 박스 가로:세로 비율로
   비균등 스케일된다 — 그래서 모든 디테일은 중심축 대칭·두꺼운 채움 도형으로
   설계했다(얇은 stroke·한쪽으로 치우친 디테일 금지). */
window.FURN_ICONS = {

  /* 침대: 헤드보드 바 + 베개 2개(좌우 대칭) + 이불 접힘선 */
  bed: '<rect x="6" y="4" width="88" height="10" fill="currentColor" />'
     + '<ellipse cx="27" cy="26" rx="17" ry="13" fill="currentColor" />'
     + '<ellipse cx="73" cy="26" rx="17" ry="13" fill="currentColor" />'
     + '<rect x="6" y="54" width="88" height="8" fill="currentColor" />',

  /* 옷장: 중앙 문 분할선 + 좌우 손잡이 점(분할선 양옆 대칭) */
  wardrobe: '<rect x="47" y="6" width="6" height="88" fill="currentColor" />'
          + '<circle cx="41" cy="50" r="6" fill="currentColor" />'
          + '<circle cx="59" cy="50" r="6" fill="currentColor" />',

  /* 서랍장: 서랍 앞판 3단 + 각 단 중앙 손잡이 */
  drawer: '<rect x="10" y="12" width="80" height="16" rx="3" fill="currentColor" />'
        + '<rect x="45" y="18" width="10" height="4" fill="currentColor" />'
        + '<rect x="10" y="40" width="80" height="16" rx="3" fill="currentColor" />'
        + '<rect x="45" y="46" width="10" height="4" fill="currentColor" />'
        + '<rect x="10" y="68" width="80" height="16" rx="3" fill="currentColor" />'
        + '<rect x="45" y="74" width="10" height="4" fill="currentColor" />',

  /* 책장: 뒤판 + 세로 칸막이 3개(문 없는 오픈 선반, 옷장과 구분) */
  bookshelf: '<rect x="4" y="4" width="92" height="10" fill="currentColor" />'
           + '<rect x="20" y="4" width="6" height="88" fill="currentColor" />'
           + '<rect x="47" y="4" width="6" height="88" fill="currentColor" />'
           + '<rect x="74" y="4" width="6" height="88" fill="currentColor" />',

  /* 행거: 양끝 기둥(원) + 걸린 옷 실루엣(타원 4개, 봉 길이를 따라 반복) */
  hanger: '<circle cx="10" cy="50" r="8" fill="currentColor" />'
        + '<circle cx="90" cy="50" r="8" fill="currentColor" />'
        + '<ellipse cx="26" cy="50" rx="9" ry="16" fill="currentColor" />'
        + '<ellipse cx="42" cy="50" rx="9" ry="16" fill="currentColor" />'
        + '<ellipse cx="58" cy="50" rx="9" ry="16" fill="currentColor" />'
        + '<ellipse cx="74" cy="50" rx="9" ry="16" fill="currentColor" />',

  /* 책상: 뒤쪽 케이블/모니터 바 + 좌우 대칭 다리(하부 패널) 블록 */
  desk: '<rect x="6" y="6" width="88" height="9" fill="currentColor" />'
      + '<rect x="8" y="70" width="16" height="22" fill="currentColor" />'
      + '<rect x="76" y="70" width="16" height="22" fill="currentColor" />',

  /* 컴퓨터의자: 원형 좌석 + 등받이(뒤쪽 두꺼운 곡선 밴드) */
  chair: '<ellipse cx="50" cy="20" rx="32" ry="14" fill="currentColor" />'
       + '<circle cx="50" cy="54" r="30" fill="currentColor" />',

  /* 화장대: 뒤쪽 거울(타원) + 앞쪽 스툴(원) — 중앙축 대칭 */
  vanity: '<ellipse cx="50" cy="14" rx="22" ry="12" fill="currentColor" />'
        + '<circle cx="50" cy="72" r="14" fill="currentColor" />',

  /* 소파: 등받이 밴드 + 좌우 팔걸이 블록 + 시트 구획선 2개 */
  sofa: '<rect x="4" y="6" width="92" height="18" fill="currentColor" />'
      + '<rect x="2" y="6" width="14" height="86" fill="currentColor" />'
      + '<rect x="84" y="6" width="14" height="86" fill="currentColor" />'
      + '<rect x="38" y="26" width="5" height="64" fill="currentColor" />'
      + '<rect x="60" y="26" width="5" height="64" fill="currentColor" />',

  /* TV장: 뒤판 + 세로 칸막이 2개(3구획) + 중앙 배선 홀 */
  tvstand: '<rect x="6" y="6" width="88" height="10" fill="currentColor" />'
         + '<rect x="34" y="10" width="5" height="80" fill="currentColor" />'
         + '<rect x="61" y="10" width="5" height="80" fill="currentColor" />'
         + '<circle cx="50" cy="50" r="8" fill="currentColor" />',

  /* 식탁: 중앙 상판 원 + 사방(상하좌우) 의자 자국 — 회전대칭이라 2인/4인 비율 모두 안정적 */
  table: '<circle cx="50" cy="50" r="18" fill="currentColor" />'
       + '<ellipse cx="50" cy="10" rx="14" ry="8" fill="currentColor" />'
       + '<ellipse cx="50" cy="90" rx="14" ry="8" fill="currentColor" />'
       + '<ellipse cx="10" cy="50" rx="8" ry="14" fill="currentColor" />'
       + '<ellipse cx="90" cy="50" rx="8" ry="14" fill="currentColor" />',

  /* 싱크대: 개수대 2개(오목한 라운드 사각) + 수전 점 */
  sink: '<rect x="14" y="20" width="32" height="44" rx="8" fill="currentColor" />'
      + '<rect x="54" y="20" width="32" height="44" rx="8" fill="currentColor" />'
      + '<circle cx="50" cy="10" r="6" fill="currentColor" />',

  /* 냉장고: 중앙 문 분할선 + 좌우 손잡이 바 + 디스펜서(우측 상단 돌출) */
  fridge: '<rect x="47" y="6" width="6" height="88" fill="currentColor" />'
        + '<rect x="40" y="45" width="6" height="14" fill="currentColor" />'
        + '<rect x="54" y="45" width="6" height="14" fill="currentColor" />'
        + '<rect x="58" y="12" width="14" height="10" rx="2" fill="currentColor" />',

  /* 세탁기: 원형 드럼(도어) + 상단 컨트롤 패널 밴드 */
  washer: '<rect x="14" y="6" width="72" height="12" rx="4" fill="currentColor" />'
        + '<circle cx="50" cy="52" r="28" fill="currentColor" />',

  /* 신발장: 가로 선반 줄 4개(얕고 넓은 형태에 맞춤) */
  shoecabinet: '<rect x="6" y="10" width="88" height="14" rx="3" fill="currentColor" />'
             + '<rect x="6" y="34" width="88" height="14" rx="3" fill="currentColor" />'
             + '<rect x="6" y="58" width="88" height="14" rx="3" fill="currentColor" />'
             + '<rect x="6" y="82" width="88" height="14" rx="3" fill="currentColor" />',

  /* 붙박이장: 세로 분할선 2개(3구획 슬라이딩 도어, 손잡이 없이 옷장과 구분) */
  closet: '<rect x="32" y="6" width="5" height="88" fill="currentColor" />'
        + '<rect x="63" y="6" width="5" height="88" fill="currentColor" />',

  /* 보일러: 원형 게이지 + 우측 통풍 슬랫 3개 */
  boiler: '<circle cx="24" cy="50" r="15" fill="currentColor" />'
        + '<rect x="58" y="15" width="8" height="70" rx="3" fill="currentColor" />'
        + '<rect x="72" y="15" width="8" height="70" rx="3" fill="currentColor" />'
        + '<rect x="86" y="15" width="8" height="70" rx="3" fill="currentColor" />',

  /* 에어컨(벽걸이): 가로로 긴 형태에 맞춘 통풍 루버 밴드 4개 */
  aircon: '<rect x="5" y="15" width="90" height="10" rx="5" fill="currentColor" />'
        + '<rect x="5" y="35" width="90" height="10" rx="5" fill="currentColor" />'
        + '<rect x="5" y="55" width="90" height="10" rx="5" fill="currentColor" />'
        + '<rect x="5" y="75" width="90" height="10" rx="5" fill="currentColor" />',

  /* 가스레인지·인덕션: 화구 4개(2x2 원) */
  stove: '<circle cx="32" cy="32" r="14" fill="currentColor" />'
       + '<circle cx="68" cy="32" r="14" fill="currentColor" />'
       + '<circle cx="32" cy="68" r="14" fill="currentColor" />'
       + '<circle cx="68" cy="68" r="14" fill="currentColor" />',

  /* 계량기함·두꺼비집: 두꺼운 차단기 스위치 3개(가로 나열) */
  meter: '<rect x="18" y="28" width="14" height="44" rx="3" fill="currentColor" />'
       + '<rect x="43" y="28" width="14" height="44" rx="3" fill="currentColor" />'
       + '<rect x="68" y="28" width="14" height="44" rx="3" fill="currentColor" />',

  /* 배관(PS)박스: 위에서 본 배관 단면 원 3개(삼각 클러스터) */
  pipebox: '<circle cx="35" cy="35" r="15" fill="currentColor" />'
         + '<circle cx="65" cy="35" r="15" fill="currentColor" />'
         + '<circle cx="50" cy="68" r="15" fill="currentColor" />',

  /* 문(화장실/현관 공용): 문짝(닫힌 위치, 벽을 따라 눕는 두꺼운 띠) + 열림 궤적(부채꼴, 얇은 stroke 대신 채워진 파이 조각) */
  door: '<path d="M 6,94 L 94,94 L 91.0,71.23 L 82.2,50.0 L 68.2,31.8 L 50.0,17.8 L 28.77,9.0 L 6,6 Z" fill="currentColor" />'
      + '<rect x="6" y="84" width="88" height="14" rx="3" fill="currentColor" />'
};
