window.GAME = window.GAME || {};

// ID(닉네임)만으로 들어오는 로그인. 비밀번호는 없다 — 보안이 중요한 단계가 아니라는 전제.
//
// ⚠️ 저장은 이 브라우저의 localStorage 에만 남는다. 따라서 지금은
//    "같은 브라우저에서 쓰는 여러 ID" 까지만 구분된다. 전역 랭킹·전역 닉네임 감시는
//    서버(예: Cloudflare Worker + KV)가 붙어야 성립한다. GAME.Store 를 그 교체 지점으로 둔다.
GAME.Account = {
  KEY_CUR: 'asymgame.account.current',
  KEY_REG: 'asymgame.account.registry',

  MIN_LEN: 2,
  MAX_LEN: 12,

  // 비속어·혐오 표현 필터. 완벽할 수 없으므로 '차단 + 관리자 검토' 두 겹으로 간다.
  BANNED: [
    '씨발', '시발', '씨빨', '氏발', '병신', '병싄', '지랄', '개새', '새끼', '좆', '존나',
    '느금', '니미', '애미', '애비', '엠창', '창녀', '보지', '자지', '섹스', '강간',
    '한녀', '한남', '김치녀', '똥꼬', '틀딱', '급식충', '맘충', '페미', '일베',
    '장애인', '정신병', '미친년', '미친놈', '죽어라', '자살',
    'fuck', 'fuk', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy',
    'nigg', 'faggot', 'rape', 'nazi', 'hitler', 'sex', 'porn',
    '관리자', 'admin', 'administrator', 'moderator', '운영자', '운영팀'
  ],

  // 숫자·특수문자를 끼워 필터를 피하는 걸 막는다.
  // 한 가지 방식으로만 정규화하면 우회가 생긴다(예: '시1발' → 숫자를 i로 바꾸면 안 걸림).
  // 그래서 여러 변형을 만들어 전부 검사한다.
  _variants: function (s) {
    var base = String(s).toLowerCase().replace(/[\s_\-.·*!?~^]/g, '');
    var leet = base
      .replace(/[0０]/g, 'o').replace(/[1１l|]/g, 'i').replace(/[3３]/g, 'e')
      .replace(/[4４@]/g, 'a').replace(/[5５$]/g, 's').replace(/[7７]/g, 't');
    var noDigit = base.replace(/[0-9０-９]/g, '');          // 숫자를 통째로 제거
    var squash = base.replace(/(.)\1+/g, '$1');             // 반복 문자 축약
    var noDigitSquash = noDigit.replace(/(.)\1+/g, '$1');
    return [base, leet, noDigit, squash, noDigitSquash];
  },

  _norm: function (s) {
    return this._variants(s)[1];
  },

  // 반환: { ok:true, id } 또는 { ok:false, reason }
  validate: function (raw) {
    var id = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!id) return { ok: false, reason: '닉네임을 입력해 주세요.' };
    if (id.length < this.MIN_LEN) return { ok: false, reason: '2자 이상 입력해 주세요.' };
    if (id.length > this.MAX_LEN) return { ok: false, reason: '12자 이하로 입력해 주세요.' };
    // 한글(자모 포함)·영문·숫자만 — 'ㅋㅋ' 같은 닉네임은 흔하므로 자모도 허용한다
    if (!/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 ]+$/.test(id)) {
      return { ok: false, reason: '한글·영문·숫자만 쓸 수 있습니다.' };
    }
    var vars = this._variants(id);
    for (var i = 0; i < this.BANNED.length; i++) {
      var bad = this._variants(this.BANNED[i]);
      for (var v = 0; v < vars.length; v++) {
        // 금칙어도 같은 방식으로 정규화해 비교한다
        if (vars[v].indexOf(bad[0]) !== -1 || vars[v].indexOf(bad[2]) !== -1) {
          return { ok: false, reason: '사용할 수 없는 표현이 포함돼 있습니다.' };
        }
      }
    }
    if (this.isBlocked(id)) {
      return { ok: false, reason: '차단된 닉네임입니다.' };
    }
    return { ok: true, id: id };
  },

  registry: function () {
    return GAME.Store.get(this.KEY_REG, {});
  },

  // 닉네임 생성 로그 — 관리자가 한눈에 보도록 남긴다
  _touch: function (id) {
    var reg = this.registry();
    var now = Date.now();
    if (!reg[id]) {
      reg[id] = { id: id, createdAt: now, lastSeen: now, logins: 1, blocked: false, reported: false };
    } else {
      reg[id].lastSeen = now;
      reg[id].logins = (reg[id].logins || 0) + 1;
    }
    GAME.Store.set(this.KEY_REG, reg);
  },

  login: function (raw) {
    var v = this.validate(raw);
    if (!v.ok) return v;
    this._touch(v.id);
    GAME.Store.set(this.KEY_CUR, v.id);
    return v;
  },

  current: function () {
    return GAME.Store.get(this.KEY_CUR, null);
  },

  logout: function () {
    GAME.Store.set(this.KEY_CUR, null);
  },

  isBlocked: function (id) {
    var r = this.registry()[id];
    return !!(r && r.blocked);
  },

  setBlocked: function (id, blocked) {
    var reg = this.registry();
    if (!reg[id]) return false;
    reg[id].blocked = !!blocked;
    GAME.Store.set(this.KEY_REG, reg);
    if (blocked && this.current() === id) this.logout();
    return true;
  },

  setReported: function (id, reported) {
    var reg = this.registry();
    if (!reg[id]) return false;
    reg[id].reported = !!reported;
    reg[id].reportedAt = reported ? Date.now() : null;
    GAME.Store.set(this.KEY_REG, reg);
    return true;
  },

  // 관리자 화면용 목록 (최근 생성 순)
  list: function () {
    var reg = this.registry();
    return Object.keys(reg).map(function (k) { return reg[k]; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  },

  // 신고용 텍스트 — 외부(호스팅·수사기관 등)에 제출할 때 복사해 쓸 수 있게
  reportText: function (id) {
    var r = this.registry()[id];
    if (!r) return '';
    return [
      '[전략 vs 컨트롤 — 닉네임 신고]',
      '닉네임: ' + r.id,
      '생성: ' + new Date(r.createdAt).toLocaleString('ko-KR'),
      '최근 접속: ' + new Date(r.lastSeen).toLocaleString('ko-KR'),
      '접속 횟수: ' + (r.logins || 1),
      '차단 여부: ' + (r.blocked ? '차단됨' : '미차단'),
      'URL: https://joeltool.com/arena/'
    ].join('\n');
  }
};
