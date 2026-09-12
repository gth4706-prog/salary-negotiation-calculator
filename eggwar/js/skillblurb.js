window.GAME = window.GAME || {};

// ============================================================================
//  스킬 한 줄 설명 (2026-09-13 태현님 ①)
//
//  > "스킬 랜덤이고 유닛 골라야 알수있으니까, 유닛고르고나면 스킬4종에대해 설명하는
//  >  카드띄워주고 그다음 상점으로 넘어가자"
//
//  ⚠⚠ **설명을 손으로 적지 않는다.** 스킬이 100종이고 값이 자주 바뀐다 — 손으로 적은
//    문장은 반드시 실제 값과 갈라지고, 그러면 «화면이 거짓말하는» 상태가 된다
//    (이 저장소가 상점 note 에서 이미 겪은 사고: 절대값을 그대로 띄워 증가분과 어긋났다).
//    그래서 **스킬 객체의 실제 수치에서 문장을 만든다.** 값이 바뀌면 문장도 같이 바뀐다.
//
//  ⚠ 거리·반경은 **이미 WORLD_SCALE 이 들어간 값**이다(`GAME.buildSkills` 가 환산한다).
//    px 를 그대로 보여 주면 프로필마다 다른 숫자가 뜨므로 «가까이/중간/멀리» 로 말한다.
//
//  ⚠ 피해 숫자도 그대로 쓰지 않는다 — 실제 피해는 `_skillPower`(공격력 계수)를 타므로
//    표에 적힌 값과 다르다. 사람에게 필요한 것은 «무엇을 하는가» 이지 정확한 딜량이 아니다.
(function () {
  //  거리 등급 — 아레나 폭 대비 비율로 말한다(프로필과 무관해진다).
  function reach(px) {
    var w = (GAME.CONFIG && GAME.CONFIG.ARENA && GAME.CONFIG.ARENA.w) || 808;
    var f = px / w;
    if (f < 0.06) return '코앞';
    if (f < 0.14) return '가까이';
    if (f < 0.26) return '중간';
    return '멀리';
  }
  function sec(ms) { return Math.round(ms / 100) / 10; }

  //  스킬 하나 → 한 줄. 슬롯·이름은 부르는 쪽이 붙인다.
  GAME.skillBlurb = function (sk) {
    if (!sk) return '';
    var t = sk.type, s = [];
    switch (t) {
      case 'dash':
        s.push(reach(sk.dist) + ' 돌진하며 지나간 길을 벤다');
        break;
      case 'blink':
        s.push(reach(sk.dist) + ' 순간이동 — 피해 없음, 빠져나갈 때');
        break;
      case 'aoeSelf':
        s.push('내 주변을 통째로 — ' + reach(sk.radius) + ' 범위');
        break;
      case 'aoeTarget':
        s.push('찍은 자리에 떨어진다 — 예고 뒤 터진다'
               + (sk.repeat > 1 ? (' · ' + sk.repeat + '연발') : ''));
        break;
      case 'projectile':
        s.push('앞으로 날린다' + (sk.pierce ? ' · 관통' : ''));
        break;
      case 'strike':
        s.push('한 대상에게 강타'
               + (sk.lifestealMul > 1 ? (' · 흡혈 ' + sk.lifestealMul + '배') : ''));
        break;
      case 'pull':
        s.push('앞쪽을 끌어당긴다 — ' + reach(sk.dist) + ' 원뿔');
        break;
      case 'trap':
        s.push('덫을 깐다 — 밟으면 ' + sec(sk.rootMs) + '초 묶인다');
        break;
      case 'aura':
        s.push('그 자리에 장판 — ' + sec(sk.duration) + '초 동안 계속 깎는다');
        break;
      case 'buff':
        var b = [];
        if (sk.healNow > 0) b.push('즉시 회복');
        if (sk.shield > 0) b.push('보호막');
        if (sk.armorAdd > 0) b.push('방어 +' + sk.armorAdd);
        if (sk.speedMul > 1) b.push('이동 ' + Math.round((sk.speedMul - 1) * 100) + '% 빠르게');
        if (sk.damageMul > 1) b.push('공격 ' + Math.round((sk.damageMul - 1) * 100) + '% 강하게');
        if (!b.length) b.push('자신을 강화');
        s.push(b.join(' · ') + ' · ' + sec(sk.duration) + '초');
        break;
      case 'summon':
        var lo = sk.countMin || sk.count || 1, hi = sk.countMax || lo;
        s.push('부하 ' + (lo === hi ? lo : (lo + '~' + hi)) + '기 소환 · '
               + sec(sk.life) + '초 동안 싸운다');
        break;
      case 'summonBoss':
        s.push('작은 보스를 부른다 · ' + sec(sk.life) + '초');
        break;
      case 'markZone':
        s.push('영역을 펼친다 — 안에 있는 적이 받는 피해 '
               + Math.round(((sk.markMul || 1) - 1) * 100) + '% 증가');
        break;
      case 'stealth':
        s.push('숨는다 ' + sec(sk.duration) + '초 — 풀리는 첫 타격이 '
               + (sk.ambushMul || 1) + '배');
        break;
      case 'spray':
        s.push('사방으로 난사');
        break;
      case 'clone':
        s.push('분신을 세운다');
        break;
      case 'flurry':
        s.push('붙어서 연격 — 떨어지면 끊긴다');
        break;
      case 'chain':
        s.push('적을 타고 이어진다');
        break;
      default:
        s.push('');
    }
    //  쿨은 언제나 마지막에 — «얼마나 자주 쓰나» 가 실시간에서 가장 큰 정보다.
    if (sk.cooldown > 0) s.push('쿨 ' + sec(sk.cooldown) + '초');
    return s.filter(function (x) { return !!x; }).join(' · ');
  };
})();
