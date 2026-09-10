window.GAME = window.GAME || {};

// ============================================================================
//  실시간 대전 **판 기록** (2026-09-10 태현님 ②)
//  > "실시간대전 진행된 판을 매번 적재해서 밸런스패치에 활용하도록하자"
//
//  ⚠⚠ 왜 필요한가: 지금 밸런스 근거는 **하네스 숫자**뿐이다. 그리고 이 저장소는
//    «가상 컨트롤러로 합격 판정하지 않는다» 를 이미 규칙으로 정해 두었다
//    (자동조종은 그 영웅을 제대로 놀 줄 모른다). 즉 **진짜 판만이 판정할 수 있는데**
//    그 판이 끝나면 아무 기록도 안 남고 사라졌다. 이 파일이 그걸 멈춘다.
//
//  설계:
//  · 한 판 = 한 줄. **링 버퍼 300판** (localStorage 는 보통 5MB — 판당 ~180B 라 여유)
//  · 값은 전부 한 글자~두 글자 키다. 이건 사람이 읽는 파일이 아니라 쌓이는 표다.
//  · **망 상태를 같이 적는다**(delay/route/stall). 렉걸린 판을 밸런스 근거로 쓰면
//    «사용자가 조작을 못 한 것» 을 «영웅이 약한 것» 으로 읽게 된다 — 걸러낼 수 있어야 한다.
//  · 버전을 적는다. 밸런스를 고치면 그 전 판과 섞여 읽히면 안 된다.
//
//  ⚠ 이름·상대 식별자는 안 적는다. 밸런스에 필요 없고, 남기면 그것만으로
//    «누가 누구와 언제 붙었는가» 가 된다. 영웅·빌드·결과면 충분하다.
// ============================================================================
GAME.RtLog = {
  KEY: 'eggwar.rtlog.v1',
  CAP: 300,

  load: function () {
    try {
      var raw = window.localStorage.getItem(this.KEY);
      var o = raw ? JSON.parse(raw) : null;
      return (o && o.rows && o.rows.length !== undefined) ? o : { rows: [] };
    } catch (e) { return { rows: [] }; }
  },

  save: function (o) {
    try { window.localStorage.setItem(this.KEY, JSON.stringify(o)); } catch (e) { /* 꿉 차면 버린다 */ }
  },

  //  한 판 쌓기. 부를 수 있는 곳은 한 군데다(js/scenes/battle.js 종료 블록).
  //  ⚠ **절대 던지지 않는다.** 기록이 전투 종료를 죽이면 그건 기록이 아니라 사고다.
  push: function (rec) {
    try {
      if (!rec) return null;
      var o = this.load();
      var row = {
        t: Date.now(),
        v: (GAME.VERSION || ''),
        m: rec.mode || 'rt',           //  rt | coop | practice
        map: rec.map || '',
        r: rec.role || '',             //  controller | strategist
        h: rec.hero || '',             //  내 영웅
        oh: rec.foeHero || '',         //  상대 영웅(전략가면 '')
        sk: rec.skills || '',          //  이번 판 굴린 스킬(쉬표 나열)
        w: rec.won ? 1 : 0,
        iv: rec.invalid ? 1 : 0,       //  데싱크·무효
        s: Math.round(rec.sec || 0),
        hp: Math.round((rec.myHpPct || 0) * 100),
        ohp: Math.round((rec.foeHpPct || 0) * 100),
        //  망 — 이 네 개가 «이 판을 밸런스 근거로 써도 되나» 를 정한다.
        d: rec.delay || 0,
        rt: rec.rttMs || 0,
        ro: rec.route || '',
        st: rec.stalls || 0
      };
      o.rows.push(row);
      if (o.rows.length > this.CAP) o.rows = o.rows.slice(o.rows.length - this.CAP);
      this.save(o);
      return row;
    } catch (e) { return null; }
  },

  //  밸런스용 요약 — 영웅별 승률·판 길이·잔여 체력.
  //  ⚠ 렉걸린 판은 **기본으로 제외**한다(delay > 12 틱 ≈ 400ms). 세기는 쉬운데
  //    그렇게 모은 숫자는 영웅이 아니라 망을 재는 것이다.
  summary: function (opts) {
    opts = opts || {};
    var maxDelay = opts.maxDelay === undefined ? 12 : opts.maxDelay;
    var rows = this.load().rows, by = {}, used = 0, skipped = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.iv) { skipped++; continue; }
      if (r.m !== 'rt') { skipped++; continue; }
      if (opts.version && r.v !== opts.version) { skipped++; continue; }
      if (maxDelay && r.d > maxDelay) { skipped++; continue; }
      var k = r.h || '?';
      if (!by[k]) by[k] = { n: 0, w: 0, sec: 0, hp: 0 };
      by[k].n++; by[k].w += r.w; by[k].sec += r.s; by[k].hp += r.hp;
      used++;
    }
    var out = [];
    for (var h in by) if (by[h].n) out.push({
      hero: h, n: by[h].n, rate: by[h].w / by[h].n,
      sec: by[h].sec / by[h].n, hp: by[h].hp / by[h].n
    });
    out.sort(function (a, b) { return b.rate - a.rate; });
    return { rows: out, used: used, skipped: skipped, total: rows.length };
  },

  //  진단줄 한 줄(?diag=1) — «쌓이고 있는가» 를 폰에서 눈으로 확인한다.
  //  ⚠ 기제를 넣으면 먼저 발동 횟수를 세라 — 이 저장소의 반복 규율.
  diagLine: function () {
    var o = this.load(), s = this.summary();
    if (!o.rows.length) return 'rtlog  기록 없음';
    var top = s.rows.slice(0, 3).map(function (r) {
      return r.hero + ' ' + Math.round(r.rate * 100) + '%(' + r.n + ')';
    }).join(' · ');
    return 'rtlog  판 ' + o.rows.length + ' · 쓸 만한 ' + s.used + ' · ' + (top || '-');
  },

  //  배열 그대로 — 분석할 때 콘솔에서 복사해 간다.
  dump: function () { return JSON.stringify(this.load()); }
};
