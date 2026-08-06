window.GAME = window.GAME || {};

// ============================================================================
//  이어하기 코드 — 기기 사이로 진행을 옮긴다 (2026-08-05 사용자 지시)
//
//  왜 필요한가: 이 게임에는 계정 인증이 없다. 닉네임은 **그 기기 localStorage 에만**
//  있고, 키운 캐릭터(골드·장비·능력치·현재 층)를 서버로 보내는 코드는 아예 없었다.
//  그래서 아이폰에서 키운 캐릭터가 안드로이드에 안 나타났다(사용자 신고).
//  랭킹 기록은 서버로 가지만(js/score.js) **캐릭터는 안 간다** — 그 구멍을 메운다.
//
//  ── 설계 ─────────────────────────────────────────────────────────────────
//  · 순수 클라이언트다. 서버도 계정도 필요 없다 — 코드 한 덩어리를 옮기면 끝이다.
//  · 옮기는 것은 **한 닉네임의 진행**이다. 소리·음악 같은 기기 설정은 안 옮긴다
//    (그 기기의 취향이지 진행이 아니다).
//  · 형식: `EGGWAR1:<base64url>:<검사값>`
//    ⚠ base64**url** 을 쓴다. 보통 base64 의 `+ /` 는 메신저·메모장을 거치며
//      깨지거나 줄바꿈이 섞인다. `-` `_` 는 그런 일이 없다.
//    ⚠ 뒤에 검사값을 붙인다. 사람이 손으로 옮기다 한 글자를 흘리면 **조용히 이상한
//      캐릭터가 되는 것**이 최악이다. 어긋나면 아예 거절한다.
//    ⚠ 붙여넣기 전에 공백·줄바꿈을 전부 턴다(메신저가 자동 줄바꿈을 넣는다).
//
//  ⚠ **이건 비밀번호가 아니다.** 코드를 가진 사람은 그 진행을 그대로 가져간다.
//    남에게 보이지 말라고 화면에서 안내한다. (닉네임+PIN 은 별도 작업이다.)
// ============================================================================
GAME.Transfer = {
  TAG: 'EGGWAR1',

  //  옮길 저장소들. **진행에 해당하는 것만** 넣는다.
  //  ⚠ 전부 `Store.get(KEY)` 가 `{ 닉네임: 값 }` 모양이라, 그 닉네임 칸만 떼어 담는다.
  //    통째로 담으면 이 기기의 **다른 사람 기록까지** 상대 기기로 넘어간다.
  SLOTS: [
    { k: 'char',   key: function () { return GAME.TowerChar && GAME.TowerChar.KEY; } },
    { k: 'tower',  key: function () { return GAME.Tower && GAME.Tower.KEY; } },
    { k: 'dtower', key: function () { return GAME.DefendTower && GAME.DefendTower.KEY; },
      //  ⚠ 2026-08-07 — `key()` 는 v2 를 가리키는데, **v1 시절에 만든 코드**에는 옛
      //    규칙의 25회차가 들어 있다. 그대로 넣으면 "새 키라 옛 기록이 안 새어
      //    들어온다"는 보장에 구멍이 난다. 진행은 통째로 버리고 껍데기만 만든다 —
      //    수성의 탑은 **누구든 1회차부터**(사용자 요구)이기 때문이다.
      //  ⚠ 옛 최고 기록은 `DefendTower.legacyBest()` 가 v1 저장소에서 따로 읽는다.
      //    여기서 `best` 를 넘겨 주면 새 기록에 섞여 거짓이 된다.
      sanitize: function (rec) {
        return { floor: 1, best: 0, runs: (rec && rec.runs) || 0, kills: 0,
                 placed: null, tier: null, gold: 0, unitLv: {}, refine: {},
                 bonusBudget: 0, seed: 0 };
      } },
    { k: 'abuild', key: function () { return GAME.ArenaBuild && GAME.ArenaBuild.KEY; } },
    { k: 'tlearn', key: function () { return GAME.TowerLearn && GAME.TowerLearn.KEY; } },
    { k: 'score',  key: function () { return GAME.Score && GAME.Score.KEY; } },
    { k: 'ranks',  key: function () { return GAME.Score && GAME.Score.RKEY; } }
  ],

  //  최근 판 기록은 200개까지 쌓인다 — 코드가 쓸데없이 길어진다.
  //  재동기화(js/score.js `resync`)가 쓰는 건 '서버 이후'뿐이라 60개면 넉넉하다.
  ENTRY_KEEP: 60,

  // ── 만들기 ────────────────────────────────────────────────────────────────
  make: function (id) {
    id = id || (GAME.Account && GAME.Account.current && GAME.Account.current());
    if (!id) return null;
    var data = { v: 1, id: id, at: Date.now(), s: {} };
    for (var i = 0; i < this.SLOTS.length; i++) {
      var slot = this.SLOTS[i], key = slot.key();
      if (!key) continue;
      var all = GAME.Store.get(key, {}) || {};
      if (!all.hasOwnProperty(id)) continue;
      var val = all[id];
      //  판 기록만 잘라 담는다(위 ENTRY_KEEP 참조).
      if (slot.k === 'score' && val && val.entries && val.entries.length > this.ENTRY_KEEP) {
        val = JSON.parse(JSON.stringify(val));
        val.entries = val.entries.slice(-this.ENTRY_KEEP);
      }
      data.s[slot.k] = val;
    }
    if (!Object.keys(data.s).length) return null;   // 옮길 게 없다
    var body = this._b64(JSON.stringify(data));
    return this.TAG + ':' + body + ':' + this._sum(body);
  },

  // ── 읽기 ──────────────────────────────────────────────────────────────────
  //  { ok, data, why } 를 돌려준다. **왜 안 되는지**를 반드시 말한다 —
  //  "잘못된 코드입니다" 하나로 끝내면 사용자가 고칠 방법이 없다.
  read: function (code) {
    if (!code) return { ok: false, why: '코드를 입력해 주세요.' };
    //  메신저·메모장이 넣는 공백과 줄바꿈을 턴다.
    var s = String(code).replace(/\s+/g, '');
    var parts = s.split(':');
    if (parts.length !== 3 || parts[0].toUpperCase() !== this.TAG) {
      return { ok: false, why: 'Egg War 이어하기 코드가 아닙니다.' };
    }
    if (this._sum(parts[1]) !== parts[2]) {
      return { ok: false, why: '코드가 중간에 끊겼거나 한 글자가 빠졌습니다. 전체를 다시 복사해 주세요.' };
    }
    var data;
    try { data = JSON.parse(this._unb64(parts[1])); }
    catch (e) { return { ok: false, why: '코드를 읽지 못했습니다.' }; }
    if (!data || data.v !== 1 || !data.id) return { ok: false, why: '지원하지 않는 코드입니다.' };
    return { ok: true, data: data };
  },

  //  코드 안에 무엇이 들었는지 한 줄로. **덮어쓰기 전에 보여 준다** —
  //  무엇을 잃는지 모르고 누르게 하면 안 된다.
  summary: function (data) {
    var out = [];
    var c = data.s && data.s.char;
    var t = data.s && data.s.tower;
    if (t && (t.best || t.floor)) out.push('탑 최고 ' + (t.best || t.floor) + '층');
    if (c && c.heroKey) {
      var h = GAME.HEROES && GAME.HEROES[c.heroKey];
      out.push((h ? h.name : c.heroKey) + ' · 골드 ' + (c.gold || 0));
    }
    var d = data.s && data.s.dtower;
    if (d && d.best) out.push('수성 ' + d.best + '회차');
    return data.id + (out.length ? '  —  ' + out.join(' · ') : '  —  기록 없음');
  },

  // ── 적용 ──────────────────────────────────────────────────────────────────
  //  ⚠ **코드에 적힌 닉네임으로 들어간다.** 지금 기기의 닉네임 칸에 남의 진행을
  //    덮어쓰면, 서버 랭킹에서 두 사람이 한 이름으로 섞인다.
  //  ⚠ 이 기기에 **같은 닉네임의 진행이 이미 있으면** 그대로 날아간다. 부르는 쪽이
  //    반드시 확인을 받아야 한다(js/scenes/tower.js 의 모달).
  apply: function (data) {
    if (!data || !data.id) return false;
    for (var i = 0; i < this.SLOTS.length; i++) {
      var slot = this.SLOTS[i], key = slot.key();
      if (!key || !data.s.hasOwnProperty(slot.k)) continue;
      var all = GAME.Store.get(key, {}) || {};
      //  슬롯이 정화기를 갖고 있으면 **넣기 직전에** 통과시킨다. 옛 판 코드가
      //  새 규칙의 저장소로 들어오는 유일한 문이라, 문에서 거른다.
      var val = data.s[slot.k];
      if (slot.sanitize) { try { val = slot.sanitize(val); } catch (e) { continue; } }
      all[data.id] = val;
      GAME.Store.set(key, all);
    }
    //  옮긴 뒤에는 그 닉네임으로 로그인해야 방금 넣은 것이 보인다.
    if (GAME.Account && GAME.Account.login) GAME.Account.login(data.id);
    //  ⚠ 재동기화 플래그를 되돌린다 — 새로 들어온 기록을 서버로 올릴 기회를 준다.
    if (GAME.Score) GAME.Score._resynced = false;
    return true;
  },

  // ── 인코딩 ────────────────────────────────────────────────────────────────
  //  ⚠ `btoa` 는 **바이트만** 받는다. 한글이 들어가면 그냥 던진다 —
  //    UTF-8 로 편 뒤에 넣어야 한다(닉네임·영웅 이름이 한글이다).
  _b64: function (str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  _unb64: function (b64) {
    var s = String(b64).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  },
  //  오타 검출용. 암호가 아니라 **손으로 옮기다 흘린 글자**를 잡는 용도다.
  _sum: function (s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
};
