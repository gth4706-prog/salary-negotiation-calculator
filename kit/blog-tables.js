/* 블로그용 표 이미지 생성 — 캔버스로 그려서 PNG 로 내려받는다. 2026-08-19
 *
 * 왜: 네이버 블로그는 표를 그대로 붙이면 서식이 깨진다. 이미지로 올리면 깔끔하고
 *     스크랩·체류시간에도 유리하다. 계산기 스크린샷(실제 화면)과 역할이 다르다 —
 *     이건 **정보를 정리한 그림**이다.
 * ⚠️ 숫자는 계산기·법령과 같은 값만 쓴다. 여기서 새로 지어내지 않는다.
 */
window.BLOG_TABLES = {

'table-severance': {
  label: '퇴직금 계산 예시 표',
  title: '퇴직금 계산 예시',
  sub: '월 300만 원 · 2023.03.02 입사 · 2026.03.02 퇴사',
  rows: [
    ['재직일수', '1,096일 (약 3.00년)'],
    ['퇴직 전 3개월 총일수', '90일'],
    ['임금총액', '900만 원'],
    ['1일 평균임금', '900만 ÷ 90 = 100,000원'],
    ['퇴직금', '9,008,219원'],
  ],
  hi: 4,
  foot: '퇴직금 = 1일 평균임금 × 30일 × (재직일수 ÷ 365)',
},

'table-offer': {
  label: '오퍼 비교 표',
  title: '총액이 같아도 갈리는 것',
  sub: 'A사 · B사 모두 연봉 5,200만 원',
  cols: ['', 'A사', 'B사'],
  rows: [
    ['기본급', '4,800만', '4,200만'],
    ['성과급', '400만', '1,000만'],
    ['성과급 0인 해', '4,800만', '4,200만'],
    ['다음 협상 기준선', '4,800만', '4,200만'],
  ],
  hi: 2,
  foot: '기본급은 퇴직금·통상임금·다음 협상 기준선을 함께 정한다',
},

'table-repairfund': {
  label: '수선유지비 vs 장기수선충당금',
  title: '헷갈리기 쉬운 두 항목',
  sub: '관리비 고지서에서 따로 확인하세요',
  cols: ['', '수선유지비', '장기수선충당금'],
  rows: [
    ['무엇', '전구 교체 등 일상 유지', '배관·승강기 등 장기 수선'],
    ['누가 부담', '사용자 (세입자)', '소유자 (집주인)'],
    ['이사 시 반환', '안 됨', '반환 대상'],
  ],
  hi: 2,
  foot: '소멸시효 10년 — 이사한 지 몇 해 지났어도 청구할 수 있다',
},

'table-unemployment': {
  label: '소정급여일수 표',
  title: '실업급여 소정급여일수',
  sub: '2026년 기준 · 퇴사일 기준 만 나이',
  cols: ['고용보험 가입기간', '50세 미만', '50세 이상·장애인'],
  rows: [
    ['1년 미만', '120일', '120일'],
    ['1년 ~ 3년', '150일', '180일'],
    ['3년 ~ 5년', '180일', '210일'],
    ['5년 ~ 10년', '210일', '240일'],
    ['10년 이상', '240일', '270일'],
  ],
  hi: 4,
  foot: '1일 상한 68,100원 · 하한 66,048원 — 차이는 2,052원뿐',
},

};

/* 캔버스에 그려서 dataURL 을 돌려준다 */
window.drawBlogTable = function (key) {
  var t = window.BLOG_TABLES[key];
  if (!t) return null;
  var W = 1000, PAD = 46;
  var cols = t.cols || ['', ''];
  var nCol = cols.length;
  var rowH = 74, headH = t.cols ? 60 : 0;
  var titleH = 132, footH = t.foot ? 78 : 30;
  var H = titleH + headH + t.rows.length * rowH + footH + PAD;

  var c = document.createElement('canvas');
  c.width = W; c.height = H;
  var x = c.getContext('2d');
  var F = function (px, w) { return (w || 600) + ' ' + px + 'px "Pretendard Variable", Pretendard, -apple-system, sans-serif'; };

  // 배경
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#0E7C5A'; x.fillRect(0, 0, W, 8);

  // 제목
  x.fillStyle = '#1E1B18'; x.font = F(38, 800);
  x.fillText(t.title, PAD, 74);
  x.fillStyle = '#6B645C'; x.font = F(21, 500);
  x.fillText(t.sub, PAD, 110);

  var y = titleH;
  var colW = [], usable = W - PAD * 2;
  if (nCol === 2) colW = [usable * 0.44, usable * 0.56];
  else colW = [usable * 0.36, usable * 0.32, usable * 0.32];

  // 헤더
  if (t.cols) {
    x.fillStyle = '#F1EEE9'; x.fillRect(PAD, y, usable, headH);
    x.fillStyle = '#6B645C'; x.font = F(21, 700);
    var cx = PAD;
    for (var i = 0; i < nCol; i++) {
      x.fillText(cols[i], cx + 18, y + 39);
      cx += colW[i];
    }
    y += headH;
  }

  // 행
  t.rows.forEach(function (r, ri) {
    var on = ri === t.hi;
    if (on) { x.fillStyle = 'rgba(14,124,90,.09)'; x.fillRect(PAD, y, usable, rowH); }
    x.strokeStyle = '#E2DCD4'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(PAD, y + rowH); x.lineTo(PAD + usable, y + rowH); x.stroke();
    var cx2 = PAD;
    for (var i = 0; i < nCol; i++) {
      var v = r[i] == null ? '' : r[i];
      if (i === 0) { x.fillStyle = on ? '#0A5C43' : '#6B645C'; x.font = F(22, on ? 800 : 600); }
      else { x.fillStyle = on ? '#0A5C43' : '#1E1B18'; x.font = F(on ? 26 : 23, on ? 800 : 600); }
      x.fillText(v, cx2 + 18, y + rowH / 2 + 9);
      cx2 += colW[i];
    }
    y += rowH;
  });

  // 꼬리말
  if (t.foot) {
    y += 30;
    x.fillStyle = '#6B645C'; x.font = F(20, 500);
    x.fillText('※ ' + t.foot, PAD, y);
  }
  // 출처 표시 — 블로그에 올라가는 이미지라 어디서 왔는지 남긴다
  x.fillStyle = '#A79E92'; x.font = F(18, 600);
  var m = x.measureText('joeltool.com');
  x.fillText('joeltool.com', W - PAD - m.width, H - 20);

  return c.toDataURL('image/png');
};
