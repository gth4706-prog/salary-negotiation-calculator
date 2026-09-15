window.BO = window.BO || {};
// Presentation only: receives a public target cell, never game state or an enemy position.
BO.Motion = (function () {
  // A shared world-space pigment field, clipped to public painted tiles only.
  var maskCache = {};
  function blob(x, y) {
    var pts = [], i, a, r, d = '';
    for (i = 0; i < 16; i++) {
      a = i * Math.PI / 8;
      r = 40 + ((x * 17 + y * 23 + i * 13 + i * i * 3) % 10);
      pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
    }
    for (i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      if (!i) d = 'M' + ((pts[15][0] + p[0]) / 2) + ',' + ((pts[15][1] + p[1]) / 2);
      d += 'Q' + p[0] + ',' + p[1] + ' ' + ((p[0] + q[0]) / 2) + ',' + ((p[1] + q[1]) / 2);
    }
    return d + 'Z';
  }
  function paint(node, x, y, field, width, height) {
    width = width || 8; height = height || 8;
    var signature = '', paths = '', dx, dy;
    for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
      var present = (!dx && !dy) || (field && field[(x + dx) + ',' + (y + dy)]);
      signature += present ? '1' : '0';
      if (present) paths += '<path transform="translate(' + (dx * 100) + ' ' + (dy * 100) + ')" d="' + blob(x + dx + 2, y + dy + 2) + '"/>';
    }
    // Rounded bridges join painted neighbours while exposed edges retain their splash shape.
    if (field) {
      if (field[x + ',' + (y - 1)]) paths += '<path d="M24 50 Q24 22 28 0 H72 Q76 22 76 50Z"/>';
      if (field[x + ',' + (y + 1)]) paths += '<path d="M24 50 Q24 78 28 100 H72 Q76 78 76 50Z"/>';
      if (field[(x - 1) + ',' + y]) paths += '<path d="M50 24 Q22 24 0 28 V72 Q22 76 50 76Z"/>';
      if (field[(x + 1) + ',' + y]) paths += '<path d="M50 24 Q78 24 100 28 V72 Q78 76 50 76Z"/>';
    }
    // Close a corner only when all four public painted tiles meet there.
    if (field) for (dy = -1; dy <= 1; dy += 2) for (dx = -1; dx <= 1; dx += 2) {
      if (field[(x + dx) + ',' + y] && field[x + ',' + (y + dy)] && field[(x + dx) + ',' + (y + dy)])
        paths += '<rect x="' + (dx < 0 ? 0 : 50) + '" y="' + (dy < 0 ? 0 : 50) + '" width="50" height="50"/>';
    }
    var surrounded = !!field;
    for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
      var nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && field && !field[nx + ',' + ny]) surrounded = false;
    }
    if (surrounded) paths += '<rect width="100" height="100"/>';
    var key = x + ',' + y + ':' + signature;
    if (!maskCache[key]) maskCache[key] = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="white">' + paths + '</g></svg>') + '")';
    node.classList.add('paint-field');
    node.style.setProperty('--splat', maskCache[key]);
    node.style.setProperty('--sz', '100%');
    node.style.setProperty('--field-size', (width * 100) + '% ' + (height * 100) + '%');
    node.style.setProperty('--field-pos', (x / Math.max(1, width - 1) * 100) + '% ' + (y / Math.max(1, height - 1) * 100) + '%');
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
