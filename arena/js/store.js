window.GAME = window.GAME || {};

// 저장 계층. **서버를 붙일 때 여기만 바꾸면 되도록** 모든 영속 데이터가 이 문을 지난다.
//
// 지금은 localStorage 전용이라 데이터가 브라우저 안에만 있다. 그래서:
//   - 랭킹은 "이 브라우저에서 플레이한 ID들" 사이의 순위다
//   - 닉네임 감시 로그도 이 브라우저에서 만들어진 것만 보인다
// 전역 랭킹이 필요하면 Cloudflare Worker + KV 를 붙이고 아래 remote 훅을 채우면 된다.
GAME.Store = {
  _mem: {},

  get: function (key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return this._mem[key] !== undefined ? this._mem[key] : fallback;
    }
  },

  set: function (key, value) {
    this._mem[key] = value;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 프라이빗 모드 등 — 메모리에만 유지 */ }
    // 서버 연동 지점: 나중에 여기서 원격 저장을 호출한다
    if (this.remote && this.remote.push) {
      try { this.remote.push(key, value); } catch (e2) { /* 실패해도 로컬은 유지 */ }
    }
  },

  remove: function (key) {
    delete this._mem[key];
    try { window.localStorage.removeItem(key); } catch (e) { }
  },

  // 서버가 붙었는지 — 화면에 '로컬 기록'인지 '전역 기록'인지 정확히 표시하기 위해
  isRemote: function () { return !!(this.remote && this.remote.push); },

  remote: null
};
