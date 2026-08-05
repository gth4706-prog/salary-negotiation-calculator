window.GAME = window.GAME || {};

// ============================================================================
//  닉네임 + PIN(숫자 4자리) — 클라이언트 (2026-08-05 사용자 지시)
//
//  서버: `03-webtool-adsense/workers/arena-api/worker.js` 의 `/auth/*`
//
//  ⚠⚠ **서버가 아직 이 기능을 모를 수 있다.** 워커 배포는 대시보드에서 사람이
//    해야 하는데(클립보드 문제로 지연 중) 게임은 그와 무관하게 배포된다.
//    그래서 이 파일은 **서버가 없으면 예전과 똑같이 동작해야 한다** —
//    `/auth/has` 가 404 면 `supported=false` 로 기억하고 두 번 다시 안 묻는다.
//    이 규율을 어기면 워커 배포 전까지 **아무도 로그인을 못 한다.**
//
//  ⚠ PIN 은 **절대 저장하지 않는다.** 확인용으로 한 번 보내고 버린다.
//    localStorage 에 두면 기기를 뺏긴 순간 끝이고, 애초에 보관할 이유가 없다.
//  ⚠ 숫자 4자리는 경우의 수가 1만뿐이라 약하다. 서버가 5회/10분 잠금으로
//    온라인 추측을 막는다 — 화면에서도 "다른 곳 비밀번호를 쓰지 말라"고 말한다.
// ============================================================================
GAME.Auth = {
  //  null = 아직 모름 · true/false = 확인됨. 세션 안에서만 기억한다.
  supported: null,

  _post: function (path, body) {
    if (!GAME.Api || !GAME.Api.enabled()) return Promise.reject(new Error('서버 없음'));
    return GAME.Api._fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  },

  //  이 닉네임에 PIN 이 걸려 있나. 서버가 이 기능을 모르면 `supported:false`.
  //  ⚠ **실패해도 로그인을 막지 않는다.** 서버가 죽었다고 게임을 못 하게 하면 안 된다.
  status: function (id) {
    var self = this;
    if (this.supported === false) {
      return Promise.resolve({ supported: false, hasPin: false, hasRecord: false });
    }
    if (!GAME.Api || !GAME.Api.enabled()) {
      this.supported = false;
      return Promise.resolve({ supported: false, hasPin: false, hasRecord: false });
    }
    return GAME.Api._fetch('/auth/has?id=' + encodeURIComponent(id)).then(function (r) {
      self.supported = true;
      return { supported: true, hasPin: !!(r && r.hasPin), hasRecord: !!(r && r.hasRecord) };
    }, function () {
      //  경로가 없거나(404) 못 붙었다 → 이 세션에서는 PIN 을 쓰지 않는다.
      self.supported = false;
      return { supported: false, hasPin: false, hasRecord: false };
    });
  },

  //  PIN 확인. { ok } 또는 { ok:false, why, left, lockUntil }
  verify: function (id, pin) {
    return this._post('/auth/verify', { id: id, pin: pin }).then(function (r) {
      return { ok: !!(r && r.ok) };
    }, function (e) {
      return { ok: false, why: (e && e.message) || 'PIN 확인에 실패했습니다.' };
    });
  },

  //  PIN 설정/변경. 기록이 있는 닉네임은 **주인 증명**을 함께 보낸다.
  //  ⚠ 증명은 서버에 드러나지 않는 값이어야 한다 — `/me`·랭킹에 보이는 총점·최고층은
  //    누구나 조회할 수 있어 증거가 못 된다. 그래서 **최근 판 점수 나열**을 보낸다
  //    (서버가 자기 `ev:` 기록과 맞춰 본다). 그 기기에서 실제로 논 사람만 아는 값이다.
  set: function (id, pin, oldPin) {
    var body = { id: id, pin: pin };
    if (oldPin) body.oldPin = oldPin;
    var rec = GAME.Score && GAME.Score.of ? GAME.Score.of(id) : null;
    var ents = (rec && rec.entries) || [];
    if (ents.length) {
      body.proof = ents.slice(-8).map(function (e) { return e.score || 0; });
    }
    return this._post('/auth/set', body).then(function (r) {
      return { ok: !!(r && r.ok) };
    }, function (e) {
      return { ok: false, why: (e && e.message) || 'PIN 설정에 실패했습니다.' };
    });
  },

  isPin: function (v) { return /^[0-9]{4}$/.test(String(v == null ? '' : v).trim()); }
};
