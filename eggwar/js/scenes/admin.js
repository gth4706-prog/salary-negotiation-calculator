window.GAME = window.GAME || {};

// 관리자 화면 — 생성된 닉네임을 한 번에 보고 차단·신고 표시를 할 수 있다.
// 접근: 주소에 ?admin=1 을 붙인다 (일반 플레이어에게는 버튼이 보이지 않는다).
// ⚠️ 로컬 저장이라 **이 브라우저에서 만들어진 닉네임만** 보인다. 전역 감시는 서버가 필요하다.
GAME.AdminScene = function () {
  Phaser.Scene.call(this, { key: 'Admin' });
};
GAME.AdminScene.prototype = Object.create(Phaser.Scene.prototype);
GAME.AdminScene.prototype.constructor = GAME.AdminScene;

GAME.AdminScene.prototype.init = function (data) {
  this.page = (data && data.page) || 0;
};

GAME.AdminScene.prototype.create = function () {
  var C = GAME.CONFIG.COLORS;
  var W = GAME.CONFIG.WIDTH, H = GAME.CONFIG.HEIGHT;
  var P = GAME.CONFIG.PORTRAIT;
  var self = this;

  this.cameras.main.setBackgroundColor(C.bg);

  GAME.UI.label(this, W / 2, P ? 16 : 20, '닉네임 관리', P ? 22 : 30, C.text, 0.5).setOrigin(0.5, 0);
  // 제목·설명 모두 위 기준(origin y=0)으로 쌓아야 글자 크기가 바뀌어도 안 겹친다
  GAME.UI.label(this, W / 2, P ? 48 : 62,
    '이 브라우저에 기록된 닉네임 목록입니다. 전역 감시는 서버 연동이 필요합니다.',
    P ? 13 : 12, C.textDim, 0.5).setOrigin(0.5, 0).setWordWrapWidth(W - 40);

  var list = GAME.Account.list();
  // 세로에서는 위 설명문이 개수 표시(top-20)와 겹쳤다 — 그만큼 아래로 민다
  var top = P ? 118 : 110;
  var rowH = P ? 46 : 52;
  var perPage = Math.max(3, Math.floor((H - top - (P ? 100 : 120)) / rowH));
  var pages = Math.max(1, Math.ceil(list.length / perPage));
  if (this.page >= pages) this.page = pages - 1;
  var slice = list.slice(this.page * perPage, this.page * perPage + perPage);

  GAME.UI.label(this, W / 2, top - 20,
    '총 ' + list.length + '개' + (pages > 1 ? '  ·  ' + (this.page + 1) + '/' + pages + ' 페이지' : ''),
    P ? 13 : 12, C.textDim, 0.5);

  if (!list.length) {
    GAME.UI.label(this, W / 2, top + 40, '기록된 닉네임이 없습니다.', P ? 15 : 15, C.textDim, 0.5);
  }

  var pad = P ? 15 : 40;
  for (var i = 0; i < slice.length; i++) {
    (function (rec, idx) {
      var y = top + idx * rowH;
      var bg = rec.blocked ? 0x3a1f22 : (rec.reported ? 0x33301c : GAME.UI.COL.surfaceAlt);
      self.add.rectangle(W / 2, y + rowH / 2 - 4, W - pad * 2, rowH - 8, bg)
        .setStrokeStyle(1, rec.blocked ? 0xe24b4a : GAME.UI.COL.border);

      GAME.UI.label(self, pad + 10, y + 6, rec.id, P ? 15 : 16,
        rec.blocked ? '#ff9f9f' : C.text, 0);

      var bw = P ? 52 : 70, bh = P ? 28 : 32;
      var bx = W - pad - 10;
      // 두 버튼(차단·신고문)이 오른쪽에서 왼쪽으로 뻗는다 — 날짜 줄이 그 밑으로
      // 파고들어 세로에서 화면 밖까지 나갔다(404px / 420px). 여기서 폭을 제한한다.
      var infoMax = (bx - bw * 2 - 16) - (pad + 10);
      var d = new Date(rec.createdAt);
      // 세로는 연도를 빼고 짧은 형식으로 — 전체 형식은 물리적으로 안 들어간다
      var when = P
        ? d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit' })
        : d.toLocaleString('ko-KR');
      var info = GAME.UI.label(self, pad + 10, y + (P ? 24 : 30),
        when + '  ·  접속 ' + (rec.logins || 1) + '회' +
        (rec.blocked ? '  ·  차단됨' : '') + (rec.reported ? '  ·  신고' : ''),
        P ? 13 : 11, C.textDim, 0);
      if (infoMax > 40 && info.width > infoMax) {
        var is = info.text;
        while (is.length > 1 && info.width > infoMax) { is = is.slice(0, -1); info.setText(is + '…'); }
      }
      // 차단 토글
      GAME.UI.button(self, bx - bw / 2, y + rowH / 2 - 4, bw, bh,
        rec.blocked ? '해제' : '차단', function () {
          GAME.Account.setBlocked(rec.id, !rec.blocked);
          self.scene.start('Admin', { page: self.page });
        }, { fontSize: P ? 13 : 13, line: rec.blocked ? 0x4ade80 : 0xe24b4a,
             color: rec.blocked ? '#8ff0b0' : '#ff9f9f' });
      // 신고 표시 + 신고문 복사
      GAME.UI.button(self, bx - bw - 8 - bw / 2, y + rowH / 2 - 4, bw, bh,
        '신고문', function () {
          GAME.Account.setReported(rec.id, true);
          var txt = GAME.Account.reportText(rec.id);
          // http·비보안 컨텍스트에서는 clipboard 가 거절된다. 잡지 않으면
          // unhandledrejection 이 뜬다 — 아래 prompt 가 이미 대체 수단이다.
          GAME.Account.copy(txt);
          window.prompt('신고용 내용입니다. 복사해서 사용하세요.', txt);
          self.scene.start('Admin', { page: self.page });
        }, { fontSize: P ? 13 : 13 });
    })(slice[i], i);
  }

  var bc = GAME.Layout.cols(4, { gap: 8, width: Math.min(W - 24, 620), left: (W - Math.min(W - 24, 620)) / 2, pad: 0 });
  var by = H - (P ? 28 : 38);
  GAME.UI.button(this, bc[0].cx, by, bc[0].w, P ? 38 : 42, '◀ 이전', function () {
    if (self.page > 0) self.scene.start('Admin', { page: self.page - 1 });
  }, { fontSize: P ? 15 : 14 });
  GAME.UI.button(this, bc[1].cx, by, bc[1].w, P ? 38 : 42, '다음 ▶', function () {
    if (self.page < pages - 1) self.scene.start('Admin', { page: self.page + 1 });
  }, { fontSize: P ? 15 : 14 });
  GAME.UI.button(this, bc[2].cx, by, bc[2].w, P ? 38 : 42, '전체 복사', function () {
    var txt = GAME.Account.list().map(function (r) {
      return [r.id, new Date(r.createdAt).toLocaleString('ko-KR'), '접속' + (r.logins || 1),
              r.blocked ? '차단' : '', r.reported ? '신고' : ''].filter(Boolean).join('\t');
    }).join('\n');
    GAME.Account.copy(txt);
    window.prompt('닉네임 로그 전체입니다.', txt);
  }, { fontSize: P ? 15 : 14 });
  GAME.UI.button(this, bc[3].cx, by, bc[3].w, P ? 38 : 42, '메뉴', function () {
    self.scene.start('Menu');
  }, { fontSize: P ? 15 : 14 });
};
