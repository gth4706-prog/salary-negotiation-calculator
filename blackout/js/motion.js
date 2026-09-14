window.BO = window.BO || {};
// Presentation only: receives a public target cell, never game state or an enemy position.
BO.Motion = (function () {
  // Public tile coordinates vary pigment pools without touching simulation randomness.
  function paint(node, x, y) {
    var n = (x * 7 + y * 11) % 4;
    node.style.setProperty('--pool-x', (22 + n * 16) + '%');
    node.style.setProperty('--pool-y', (24 + ((n + 2) % 4) * 15) + '%');
    node.style.setProperty('--pigment-turn', (n * 67 + 25) + 'deg');
  }
  function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function replay(node, name) { node.classList.remove(name); void node.offsetWidth; node.classList.add(name); }
  function clear(board) {
    var nodes = board.querySelectorAll('.reaction');
    for (var i = 0; i < nodes.length; i++) { nodes[i].className = 'reaction'; nodes[i].innerHTML = ''; }
    nodes = board.querySelectorAll('.recoil');
    for (i = 0; i < nodes.length; i++) nodes[i].classList.remove('recoil');
  }
  function shoot(board) {
    if (reduced()) return;
    var me = board.querySelector('.cell.me');
    if (!me) return;
    if (!me._muzzle) {
      me._muzzle = document.createElement('span'); me._muzzle.className = 'muzzle';
      me._muzzle.setAttribute('aria-hidden', 'true'); me.appendChild(me._muzzle);
      me.addEventListener('animationend', function (e) { if (e.animationName === 'paint-recoil') me.classList.remove('recoil'); });
    }
    replay(me, 'recoil');
  }
  function impact(cell, material, mine) {
    var fx = cell.querySelector('.reaction');
    fx.className = 'reaction'; fx.innerHTML = '';
    if (reduced()) return;
    material = /^(paper|fabric|wood)$/.test(material) ? material : 'wood';
    fx.style.setProperty('--impact-color', mine ? 'var(--pm)' : 'var(--pf)');
    var x = Number(cell.dataset.x) || 0, y = Number(cell.dataset.y) || 0;
    var count = material === 'fabric' ? 4 : 9;
    for (var i = 0; i < count; i++) {
      var p = document.createElement('i'), angle = (i * 137.5 + x * 29 + y * 17) * Math.PI / 180;
      var radius = (material === 'fabric' ? 12 : 23) + (i * 11 % 19);
      p.className = material === 'paper' && i < 3 ? 'paper-chip' : 'paint-bead';
      p.style.setProperty('--bead-color', (mine ? ['#48bba5','#e6b953','#788aca'] : ['#e78194','#efb85c','#a180bc'])[i % 3]);
      p.style.setProperty('--dx', (Math.cos(angle) * radius).toFixed(2) + 'px');
      p.style.setProperty('--dy', (Math.sin(angle) * radius).toFixed(2) + 'px');
      p.style.setProperty('--spin', ((i % 2 ? 1 : -1) * (45 + i * 21)) + 'deg');
      p.style.setProperty('--delay', (i * 13) + 'ms');
      p.style.setProperty('--bead', (3 + i % 3) + 'px');
      fx.appendChild(p);
    }
    if (!fx._motionBound) {
      fx._motionBound = true;
      fx.addEventListener('animationend', function (e) {
        if (e.target === fx && e.animationName === 'impact-life') { fx.className = 'reaction'; fx.innerHTML = ''; }
      });
    }
    void fx.offsetWidth;
    fx.className = 'reaction motion-impact impact-' + material;
  }
  return { impact: impact, shoot: shoot, clear: clear, paint: paint };
})();
