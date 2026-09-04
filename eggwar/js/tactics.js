window.GAME = window.GAME || {};

// ============================================================================
//  전술 플레이북 — **AI 가 층수가 아니라 "지금 네가 뭘 하는지"를 보고 대응한다.**
//
//  왜 만들었나 (2026-09-04 태현님):
//    "통곡의탑도 단순히 유닛 능력치만 따라가면서 층 난이도가 변하다보니까 결국 숫자만
//     커지지 게임방식은 똑같아. 원래 하려던건 싸움방식에 맞춘 유닛 배치와 ai의 컨트롤
//     아니었는가 … ai입장에서 각 유닛들을 언제 어떻게써야할지 이해하고 적 영웅이
//     어떻게하면 어떤 전략을 써야할지 최소 200종류의 전략을 보유하고 대응해야한다"
//
//  진단(실측)으로 지적이 전부 사실임을 확인했다:
//    · AI 의 전술 어휘는 **스칼라 6개**뿐이었다(kite·retreat·cohesion·press·
//      medicFollow·guardFollow). combat.js 에서 이 값을 읽는 자리가 5곳이다.
//    · 그 6개조차 `Tower.TACTICS` 의 from/growth/max 로 **층수만** 보고 자란다 —
//      즉 "층이 오르면 조금 더 영리해진다"가 전부고 플레이어를 안 본다.
//    · 그래서 난이도 성장이 hpMul/dmgMul 숫자로만 나타난다.
//
//  ── 이 파일이 하는 일 ──────────────────────────────────────────────────────
//   ① 읽는다(read)   — 영웅의 거리·움직임·체력·노리는 대상·판의 국면을 관측한다.
//   ② 고른다(pick)   — 그 상황에 맞는 전략을 CATALOG(200종 이상)에서 고른다.
//   ③ 지시한다(order)— 역할(앞줄/원거리/지원/설치)마다 다른 지시를 낸다.
//  집행은 combat.js 가 한다(추격 반경 effChase · 대상 선택 · 능력 시전 시점).
//  ⚠ **자리(배치)는 건드리지 않는다** — 아래 PLAYS 주석의 POST_ADVANCE 사고 참조.
//
//  ⚠⚠ **결정성** — 여기서 Math.random 을 절대 쓰지 않는다. 관측은 state 값만 읽고,
//    갱신은 고정 주기(TICK_MS)로만 돈다. 다만 안전을 위해 **통곡의 탑에서만** 켠다
//    (state.tactics 가 없으면 combat.js 는 아무 일도 하지 않는다) — 실시간 대전은
//    양쪽이 같은 값을 봐야 하는데 이 계층은 그 보장을 목표로 만들지 않았다.
//  ⚠ **aggro 는 건드리지 않는다.** combat.js `effAggro` 주석이 실측으로 못박아 뒀다 —
//    반응 반경을 넓히면 근접 줄이 자리를 일찍 떠나 각개격파당하고 수성의 탑 SC-3 이
//    깨진다. 공격성은 **추격 반경(effChase)** 으로만 표현한다.
// ============================================================================
GAME.Tactics = {

  TICK_MS: 500,          // 전략을 다시 고르는 주기. 매 프레임 바꾸면 유닛이 진동한다.
  HYST_MS: 1400,         // 한 번 고른 전략을 최소 이만큼 유지(깜빡임 방지)

  // ── 역할 ──────────────────────────────────────────────────────────────────
  //  유닛 def 에 role 필드가 없다(넣으면 20종 def 를 전부 건드려야 하고 밸런스 파일이
  //  움직인다). 이미 있는 성질로 가른다 — bandOf 와 같은 갈래를 쓴다.
  ROLES: ['front', 'ranged', 'support', 'emplace'],

  roleOf: function (u) {
    var d = u.def || {};
    if (d.immobile || d.isMine) return 'emplace';
    if (d.healRadius > 0 || d.attack === 'none') return 'support';
    if (d.attack === 'melee') return 'front';
    return 'ranged';
  },

  // ── ① 관측축 ──────────────────────────────────────────────────────────────
  //  각 축의 구간 이름이 곧 조건문의 어휘가 된다.
  AXES: {
    dist:  ['far', 'mid', 'near', 'inside'],   // 영웅이 진형에서 얼마나 가까운가
    move:  ['still', 'charging', 'circling', 'kiting'],  // 어떻게 움직이는가
    hp:    ['healthy', 'hurt', 'critical'],    // 영웅 체력
    focus: ['none', 'front', 'back', 'elite'], // 무엇을 때리고 있는가
    phase: ['open', 'mid', 'late']             // 판의 국면
  },

  //  영웅 한 명을 찾는다(탑은 컨트롤러 영웅 하나가 전제다).
  _hero: function (state) {
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.isHero && u.alive && u.side !== 'strategist') return u;
    }
    return null;
  },

  //  진형 중심 — 살아 있는 전략가 유닛의 평균. 없으면 null.
  _core: function (state) {
    var n = 0, sx = 0, sy = 0;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!u.alive || u.side !== 'strategist' || u.def.noCount) continue;
      sx += u.x; sy += u.y; n++;
    }
    return n ? { x: sx / n, y: sy / n, n: n } : null;
  },

  //  ⚠ 관측은 **누적 표본**을 쓴다. 한 프레임 스냅숏으로 "카이팅 중"을 판정하면
  //    영웅이 잠깐 멈추기만 해도 전략이 뒤집힌다. state._tac 에 짧은 이력을 남긴다.
  read: function (state) {
    var h = this._hero(state), core = this._core(state);
    var t = state._tac;
    if (!t) { t = state._tac = { lx: 0, ly: 0, dSum: 0, awaySum: 0, n: 0, hits: {}, last: -1e9, cur: null, curAt: -1e9 }; }
    if (!h || !core) return null;

    //  이동 양상 — 이번 표본 구간 동안 얼마나 움직였고, 진형에서 멀어지는 쪽이었나.
    var dx = h.x - t.lx, dy = h.y - t.ly;
    var moved = t.n ? Math.sqrt(dx * dx + dy * dy) : 0;
    var d0 = Math.sqrt((t.lx - core.x) * (t.lx - core.x) + (t.ly - core.y) * (t.ly - core.y));
    var d1 = Math.sqrt((h.x - core.x) * (h.x - core.x) + (h.y - core.y) * (h.y - core.y));
    t.dSum = t.dSum * 0.6 + moved * 0.4;
    t.awaySum = t.awaySum * 0.6 + (t.n ? (d1 - d0) : 0) * 0.4;
    t.lx = h.x; t.ly = h.y; t.n++;

    var dist = d1 > 460 ? 'far' : d1 > 260 ? 'mid' : d1 > 120 ? 'near' : 'inside';
    var move;
    if (t.dSum < 6) move = 'still';
    else if (t.awaySum > 8) move = 'kiting';
    else if (t.awaySum < -8) move = 'charging';
    else move = 'circling';

    var hpr = h.maxHp > 0 ? h.hp / h.maxHp : 1;
    var hp = hpr > 0.65 ? 'healthy' : hpr > 0.3 ? 'hurt' : 'critical';

    //  무엇을 노리나 — applyDamage 가 역할별로 세어 둔 값(state._tac.hits)을 읽는다.
    var best = 'none', bv = 0, k;
    for (k in t.hits) if (t.hits[k] > bv) { bv = t.hits[k]; best = k; }
    var focus = bv < 2 ? 'none' : (best === 'front' ? 'front'
              : (best === 'elite' ? 'elite' : 'back'));

    //  제한시간은 config 가 정본이다(협동전만 따로 — state.coopTimeMs).
    var lim = state.coopTimeMs || ((GAME.CONFIG && GAME.CONFIG.BATTLE_TIME) || 90) * 1000;
    var el = state.elapsed || 0;
    var phase = el < lim * 0.25 ? 'open' : el < lim * 0.7 ? 'mid' : 'late';

    return { dist: dist, move: move, hp: hp, focus: focus, phase: phase,
             heroDist: d1, core: core, hero: h };
  },

  //  applyDamage 가 부른다 — 영웅이 때린 대상의 역할을 센다(무엇을 노리는지의 근거).
  noteHit: function (state, target, attacker) {
    if (!state || !state.tactics || !attacker || !attacker.isHero) return;
    if (!target || target.side !== 'strategist') return;
    var t = state._tac;
    if (!t) return;
    //  ⚠ 정예 표식은 `u.elite`(문자열 kind — warlord/shield/bomb)다. towerrule.js 가
    //    붙인다. `eliteDraw` 는 **그리는 크기**라 여기 쓰면 안 된다(주술사 미니보스도 걸린다).
    var r = target.elite ? 'elite' : this.roleOf(target);
    if (r === 'support' || r === 'emplace') r = 'back';
    if (r === 'ranged') r = 'back';
    t.hits[r] = (t.hits[r] || 0) + 1;
    //  오래된 표본은 흘려보낸다 — 초반에 앞줄만 쳤다고 끝까지 그렇게 볼 수 없다.
    if ((t.hits[r] | 0) > 40) for (var k in t.hits) t.hits[k] = t.hits[k] * 0.5;
  },

  // ── ② 대응 플레이 ─────────────────────────────────────────────────────────
  //  역할마다 **세 축**으로 지시한다:
  //    advance  -1(자리를 지킨다) ~ +1(끝까지 쫓는다)  → 추격 반경(effChase)
  //    focus     0 ~ 1  영웅을 우선해 때린다(집중사격) → 대상 선택
  //    hold      0 ~ 1  스킬을 아꼈다가 영웅이 붙을 때 → 능력 시전 시점
  //
  //  ⚠⚠ **'전진 배치'·'산개' 축을 일부러 안 만들었다.** 유닛이 전투 중 스스로 자리를
  //    고치는 기제(`Combat.POST_ADVANCE`)는 이 저장소가 이미 만들었다가 **끈** 것이다:
  //    "유닛이 자기 위치를 보정해 주면 아무렇게나 놓은 진형도 알아서 진형이 되고,
  //    그만큼 배치라는 실력 축이 죽는다"(실측: 무배치 방어 3.0% → 10~13%, SC-4 붕괴).
  //    전술이 자리를 바꾸면 그 사고를 그대로 되풀이한다. **공간은 배치의 몫**이고
  //    이 계층은 **시간과 대상의 몫**이다 — 언제 나가고, 누구를 치고, 언제 스킬을 쓰나.
  //  ⚠ advance 폭도 ±22% 로 좁다(effChase). 이 계층의 목적은 '다르게 움직이는 것'이지
  //    '더 세지는 것'이 아니다 — 크게 흔들면 회귀 게이트가 깨진다.
  //  ⚠ 모든 칸이 **실제로 소비된다**(combat.js effChase·대상 선택·runAbility).
  //    쓰이지 않는 축을 표에 남기면 "있는 줄 알았는데 아무 일도 안 하는" 죽은 데이터가
  //    된다 — 이 폴더가 오라(auraDps)·복수 능력에서 두 번 겪은 사고다.
  PLAYS: {
    //                          front              ranged             support            emplace
    hold:      { name: '자리 지키기', f: [-0.2, 0.0, 0.2], r: [-0.3, 0.0, 0.2], s: [-0.4, 0.0, 0.3], e: [0.0, 0.0, 0.1] },
    press:     { name: '밀어붙이기', f: [ 0.7, 0.6, 0.0], r: [ 0.3, 0.5, 0.0], s: [ 0.1, 0.0, 0.0], e: [0.0, 0.2, 0.0] },
    collapse:  { name: '에워싸기',   f: [ 0.6, 0.8, 0.1], r: [ 0.1, 0.7, 0.1], s: [-0.1, 0.0, 0.2], e: [0.0, 0.3, 0.0] },
    screenBack:{ name: '뒷줄 가리기', f: [-0.1, 0.2, 0.1], r: [-0.4, 0.2, 0.1], s: [-0.6, 0.0, 0.2], e: [0.0, 0.0, 0.1] },
    scatter:   { name: '흩어지기',   f: [ 0.1, 0.3, 0.0], r: [-0.1, 0.3, 0.1], s: [-0.3, 0.0, 0.1], e: [0.0, 0.1, 0.0] },
    huddle:    { name: '뭉치기',     f: [ 0.2, 0.4, 0.1], r: [-0.2, 0.3, 0.2], s: [-0.2, 0.0, 0.1], e: [0.0, 0.1, 0.2] },
    bait:      { name: '미끼 세우기', f: [ 0.8, 0.2, 0.0], r: [-0.5, 0.6, 0.4], s: [-0.5, 0.0, 0.4], e: [0.0, 0.4, 0.3] },
    ambush:    { name: '숨겨 두기',  f: [-0.4, 0.1, 0.8], r: [-0.3, 0.1, 0.8], s: [-0.4, 0.0, 0.6], e: [0.0, 0.0, 0.7] },
    pincer:    { name: '양옆 조이기', f: [ 0.5, 0.7, 0.0], r: [ 0.2, 0.4, 0.1], s: [-0.2, 0.0, 0.2], e: [0.0, 0.2, 0.1] },
    fallback:  { name: '물러서기',   f: [-0.6, 0.1, 0.3], r: [-0.7, 0.1, 0.3], s: [-0.8, 0.0, 0.4], e: [0.0, 0.0, 0.2] },
    focusHero: { name: '영웅 집중',  f: [ 0.4, 1.0, 0.0], r: [ 0.0, 1.0, 0.0], s: [-0.2, 0.0, 0.1], e: [0.0, 1.0, 0.0] },
    guardHeal: { name: '회복 지키기', f: [-0.3, 0.2, 0.2], r: [-0.3, 0.2, 0.2], s: [-0.5, 0.0, 0.1], e: [0.0, 0.0, 0.4] },
    trapLane:  { name: '길목 막기',  f: [ 0.0, 0.2, 0.3], r: [-0.2, 0.2, 0.3], s: [-0.3, 0.0, 0.3], e: [0.0, 0.5, 0.5] },
    surge:     { name: '한꺼번에',   f: [ 1.0, 0.7, 0.0], r: [ 0.5, 0.6, 0.0], s: [ 0.2, 0.0, 0.0], e: [0.0, 0.3, 0.0] },
    stall:     { name: '시간 끌기',  f: [-0.5, 0.0, 0.4], r: [-0.6, 0.1, 0.4], s: [-0.6, 0.0, 0.3], e: [0.0, 0.0, 0.2] },
    splitPush: { name: '갈라 치기',  f: [ 0.4, 0.3, 0.1], r: [ 0.1, 0.3, 0.1], s: [-0.2, 0.0, 0.2], e: [0.0, 0.2, 0.1] }
  },
  PLAY_ORDER: ['hold', 'press', 'collapse', 'screenBack', 'scatter', 'huddle', 'bait',
               'ambush', 'pincer', 'fallback', 'focusHero', 'guardHeal', 'trapLane',
               'surge', 'stall', 'splitPush'],

  // ── ③ 상황 ────────────────────────────────────────────────────────────────
  //  각 상황은 관측축 위의 술어다. `null` 은 "그 축은 안 본다".
  //  ⚠ 순서가 우선순위다 — 먼저 맞는 것이 이긴다. 좁은 조건을 위에 둔다.
  //  ⚠ `mod` 는 그 상황에서 **같은 대응이라도 다르게 실행되도록** 하는 보정이다
  //    (축 순서 = advance·spread·focus·screen·hold). 예: '밀어붙이기'를 골라도
  //    영웅이 한복판에 들어와 있으면 더 조여 붙고(diveIn), 멀리서 빼고 있으면
  //    앞으로 나가는 몫이 깎인다(kiteFar). 이 보정이 있어야 (상황 × 대응) 조합이
  //    **실제로 서로 다른 지시**가 된다 — 없으면 대응 16종이 전부다.
  //    `tools/tactics-audit.js` 가 200개 조합의 벡터가 서로 다른지 직접 검사한다.
  //  ⚠⚠ **순서 = 우선순위이고, 규칙은 "좁은 조건이 먼저"다.**
  //    처음엔 거리 조건(diveIn)을 위에 뒀다가 감사가 잡았다 — 빈사 상태로 한복판에
  //    들어온 영웅이 '한복판 진입'(축 1개)에 먼저 걸려 '빈사로 붙음'(축 2개)이 영영
  //    안 뽑혔다. 정보가 더 많은 조건이 이겨야 한다. 새 상황을 넣을 때는 **제약한
  //    축의 수**를 세서 그 자리에 넣을 것.
  SITUATIONS: [
    { key: 'lowDive',   name: '빈사로 붙음',   when: { dist: ['near', 'inside'], hp: ['critical'] }, mod: [0.30, 0.35, -0.20] },
    { key: 'diveBack',  name: '뒷줄에 파고듦', when: { dist: ['inside'], focus: ['back'] }, mod: [0.10, 0.25, 0.00] },
    { key: 'lowFar',    name: '빈사로 물러남', when: { hp: ['critical'] },                  mod: [0.25, 0.20, -0.15] },
    { key: 'diveIn',    name: '한복판 진입',   when: { dist: ['inside'] },                  mod: [0.15, 0.20, -0.05] },
    { key: 'kiteFar',   name: '멀리서 빼기',   when: { dist: ['far', 'mid'], move: ['kiting'] },     mod: [-0.25, -0.10, 0.20] },
    { key: 'kiteNear',  name: '붙었다 빼기',   when: { dist: ['near'], move: ['kiting'] },  mod: [-0.10, 0.10, 0.15] },
    { key: 'charge',    name: '돌진해 옴',     when: { move: ['charging'] },                mod: [-0.20, 0.05, 0.25] },
    { key: 'circle',    name: '옆으로 돎',     when: { move: ['circling'], dist: ['near', 'inside'] }, mod: [0.00, 0.15, 0.05] },
    { key: 'standoff',  name: '멀리서 멈춤',   when: { dist: ['far'], move: ['still'] },    mod: [-0.15, -0.15, 0.30] },
    { key: 'poke',      name: '중거리 견제',   when: { dist: ['mid'], move: ['still', 'circling'] },  mod: [-0.05, -0.05, 0.10] },
    { key: 'hurtNear',  name: '다친 채 접근',  when: { dist: ['near', 'inside'], hp: ['hurt'] },      mod: [0.20, 0.30, -0.10] },
    { key: 'eliteHunt', name: '정예를 노림',   when: { focus: ['elite'] },                  mod: [-0.05, 0.05, 0.10] },
    { key: 'frontGrind',name: '앞줄만 때림',   when: { focus: ['front'] },                  mod: [0.05, -0.05, 0.05] },
    { key: 'opening',   name: '판 초반',       when: { phase: ['open'] },                   mod: [-0.30, -0.20, 0.35] },
    { key: 'late',      name: '시간 얼마 없음', when: { phase: ['late'] },                   mod: [0.35, 0.30, -0.30] },
    { key: 'idleFar',   name: '멀리서 관망',   when: { dist: ['far', 'mid'] },              mod: [-0.20, -0.25, 0.25] }
  ],

  sitOf: function (key) {
    for (var i = 0; i < this.SITUATIONS.length; i++) if (this.SITUATIONS[i].key === key) return this.SITUATIONS[i];
    return null;
  },

  //  ── 카탈로그 — 상황 × 그 상황에 말이 되는 대응들 ──────────────────────────
  //  ⚠ **여기가 "200종 전략"의 실체다.** 상황 16 × 대응(상황마다 13~16) = 200종 이상.
  //    한 항목 = "이 상황이면 이렇게 움직인다" 하나. 손으로 200개를 따로 쓰지 않는
  //    이유는 그러면 대부분이 서로 구별되지 않는 중복이 되기 때문이다 — 대신 각
  //    항목이 **서로 다른 지시 벡터**를 내는지 `tools/tactics-audit.js` 가 검사한다.
  //  ⚠ 같은 상황에 여러 대응이 있는 것이 핵심이다. 하나뿐이면 플레이어가 외운다 —
  //    고르는 것은 `_variantOf`(그 판에 고정된 결정적 값)라 **한 판 안에서는 일관되고
  //    판이 바뀌면 달라진다.**
  MENU: {
    diveBack:   ['collapse', 'screenBack', 'focusHero', 'guardHeal', 'huddle', 'pincer', 'surge', 'ambush', 'press', 'trapLane', 'bait', 'splitPush', 'stall'],
    diveIn:     ['collapse', 'focusHero', 'pincer', 'surge', 'huddle', 'press', 'screenBack', 'ambush', 'trapLane', 'scatter', 'bait', 'splitPush', 'stall'],
    lowDive:    ['focusHero', 'surge', 'collapse', 'pincer', 'press', 'huddle', 'splitPush', 'trapLane', 'bait', 'screenBack', 'ambush', 'stall', 'scatter'],
    lowFar:     ['press', 'surge', 'splitPush', 'pincer', 'focusHero', 'scatter', 'collapse', 'bait', 'trapLane', 'hold', 'huddle', 'stall', 'ambush'],
    kiteFar:    ['hold', 'scatter', 'ambush', 'trapLane', 'splitPush', 'huddle', 'stall', 'screenBack', 'guardHeal', 'bait', 'pincer', 'fallback', 'press'],
    kiteNear:   ['pincer', 'splitPush', 'collapse', 'scatter', 'trapLane', 'press', 'focusHero', 'ambush', 'huddle', 'surge', 'bait', 'hold', 'screenBack'],
    charge:     ['screenBack', 'huddle', 'trapLane', 'ambush', 'guardHeal', 'collapse', 'focusHero', 'fallback', 'stall', 'pincer', 'bait', 'hold', 'scatter'],
    circle:     ['huddle', 'pincer', 'collapse', 'screenBack', 'focusHero', 'splitPush', 'trapLane', 'press', 'scatter', 'bait', 'ambush', 'guardHeal', 'stall'],
    standoff:   ['ambush', 'hold', 'trapLane', 'scatter', 'huddle', 'splitPush', 'stall', 'guardHeal', 'bait', 'press', 'screenBack', 'fallback', 'pincer'],
    poke:       ['screenBack', 'scatter', 'ambush', 'huddle', 'hold', 'trapLane', 'splitPush', 'guardHeal', 'bait', 'pincer', 'stall', 'press', 'collapse'],
    hurtNear:   ['surge', 'focusHero', 'collapse', 'pincer', 'press', 'splitPush', 'huddle', 'trapLane', 'bait', 'screenBack', 'scatter', 'ambush', 'stall'],
    eliteHunt:  ['guardHeal', 'screenBack', 'huddle', 'collapse', 'pincer', 'focusHero', 'trapLane', 'fallback', 'ambush', 'press', 'bait', 'splitPush', 'stall'],
    frontGrind: ['scatter', 'splitPush', 'pincer', 'press', 'trapLane', 'ambush', 'bait', 'huddle', 'collapse', 'screenBack', 'guardHeal', 'stall', 'hold'],
    opening:    ['hold', 'ambush', 'trapLane', 'scatter', 'huddle', 'screenBack', 'guardHeal', 'bait', 'splitPush', 'stall', 'press', 'pincer', 'fallback'],
    late:       ['surge', 'press', 'collapse', 'focusHero', 'pincer', 'splitPush', 'stall', 'huddle', 'trapLane', 'bait', 'scatter', 'ambush', 'screenBack'],
    idleFar:    ['hold', 'ambush', 'scatter', 'trapLane', 'huddle', 'stall', 'guardHeal', 'splitPush', 'bait', 'screenBack', 'press', 'fallback', 'pincer']
  },

  //  전체 전략 수 — 감사가 이 값을 200 이상으로 요구한다.
  count: function () {
    var n = 0, k;
    for (k in this.MENU) n += this.MENU[k].length;
    return n;
  },

  //  전략 목록(id 는 `상황:대응`).
  list: function () {
    var out = [], k, i;
    for (var s = 0; s < this.SITUATIONS.length; s++) {
      k = this.SITUATIONS[s].key;
      var m = this.MENU[k] || [];
      for (i = 0; i < m.length; i++) out.push({ id: k + ':' + m[i], sit: k, play: m[i], variant: i });
    }
    return out;
  },

  // ── 상황 판정 ─────────────────────────────────────────────────────────────
  _matches: function (sit, rd) {
    var w = sit.when, k;
    for (k in w) {
      if (!w[k]) continue;
      if (w[k].indexOf(rd[k]) < 0) return false;
    }
    return true;
  },

  //  같은 상황에서 어떤 대응을 고를지 — **판마다 고정된 결정적 값**.
  //  ⚠ 난수를 쓰지 않는다. 판 시드(state.tacSeed)와 상황 이름만으로 정한다 →
  //    한 판 안에서는 같은 상황이면 같은 대응(플레이어가 읽고 배울 수 있다),
  //    판이 바뀌면 다른 대응(외워지지 않는다).
  _variantOf: function (state, sitKey, len) {
    var h = (state.tacSeed || 1) >>> 0;
    for (var i = 0; i < sitKey.length; i++) {
      h = (h * 31 + sitKey.charCodeAt(i)) >>> 0;
    }
    return len > 0 ? (h % len) : 0;
  },

  // ── ② 고르기 ──────────────────────────────────────────────────────────────
  update: function (state, dt) {
    if (!state || !state.tactics) return;
    var t = state._tac;
    var now = state.elapsed || 0;
    if (t && now - t.last < this.TICK_MS) return;
    var rd = this.read(state);
    t = state._tac;
    if (!rd) { t.last = now; return; }
    t.last = now;

    var sit = null;
    for (var i = 0; i < this.SITUATIONS.length; i++) {
      if (this._matches(this.SITUATIONS[i], rd)) { sit = this.SITUATIONS[i]; break; }
    }
    if (!sit) sit = this.SITUATIONS[this.SITUATIONS.length - 1];

    //  히스테리시스 — 방금 바꿨으면 유지한다(유닛이 왔다갔다 하지 않게).
    if (t.cur && t.cur.sit === sit.key) { t.read = rd; return; }
    if (t.cur && now - t.curAt < this.HYST_MS) { t.read = rd; return; }

    var menu = this.MENU[sit.key] || ['hold'];
    var vi = this._variantOf(state, sit.key, menu.length);
    t.cur = { sit: sit.key, name: sit.name, play: menu[vi], id: sit.key + ':' + menu[vi] };
    t.curAt = now;
    t.read = rd;
    state.tacPicks = (state.tacPicks || 0) + 1;
    state.tacSeen = state.tacSeen || {};
    state.tacSeen[t.cur.id] = (state.tacSeen[t.cur.id] || 0) + 1;
  },

  current: function (state) {
    return (state && state._tac && state._tac.cur) || null;
  },

  // ── ③ 지시 ────────────────────────────────────────────────────────────────
  //  이 유닛이 지금 받는 지시. combat.js 가 프레임마다 부른다 — 가볍게 유지할 것.
  ZERO: { advance: 0, focus: 0, hold: 0 },

  //  ⚠ advance 는 ±1, focus·hold 는 0~1 로 가둔다. 상황 보정을 더하면 넘칠 수 있다.
  _clamp3: function (v, mod) {
    return [
      Math.max(-1, Math.min(1, v[0] + mod[0])),
      Math.max(0, Math.min(1, v[1] + mod[1])),
      Math.max(0, Math.min(1, v[2] + mod[2]))
    ];
  },

  orderFor: function (u, state) {
    if (!state || !state.tactics || u.side !== 'strategist' || u.isHero) return this.ZERO;
    var cur = this.current(state);
    if (!cur) return this.ZERO;
    var play = this.PLAYS[cur.play], sit = this.sitOf(cur.sit);
    if (!play) return this.ZERO;
    var role = this.roleOf(u);
    var v = role === 'front' ? play.f : role === 'ranged' ? play.r
          : role === 'support' ? play.s : play.e;
    var c = this._clamp3(v, (sit && sit.mod) || [0, 0, 0]);
    return { advance: c[0], focus: c[1], hold: c[2] };
  },

  //  전략 하나의 지시 벡터 전체(4역할 × 3축 = 12칸). 감사가 서로 다른지 볼 때 쓴다.
  vectorOf: function (id) {
    var p = id.split(':'), sit = this.sitOf(p[0]), play = this.PLAYS[p[1]];
    if (!play || !sit) return null;
    var m = sit.mod || [0, 0, 0];
    return [].concat(this._clamp3(play.f, m), this._clamp3(play.r, m),
                     this._clamp3(play.s, m), this._clamp3(play.e, m));
  }
};
