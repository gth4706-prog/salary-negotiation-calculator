window.BO = window.BO || {};
// Presentation only: receives a public target cell, never game state or an enemy position.
BO.Motion = (function () {
  // A shared world-space pigment field, clipped to public painted tiles only.
  var maskCache = {};
  function blob(x, y) {
    var pts = [], i, a, r, d = '';
    for (i = 0; i < 24; i++) {
      a = i * Math.PI / 12;
      r = ((i * 7 + x * 3 + y * 5) % 11 < 3 ? 43 : 28) + ((x * 17 + y * 23 + i * 13) % 8);
      pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
    }
    for (i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      if (!i) d = 'M' + ((pts[23][0] + p[0]) / 2) + ',' + ((pts[23][1] + p[1]) / 2);
      d += 'Q' + p[0] + ',' + p[1] + ' ' + ((p[0] + q[0]) / 2) + ',' + ((p[1] + q[1]) / 2);
    }
    return d + 'Z';
  }
  function color(h) { return 'hsl(' + ((h % 360 + 360) % 360) + ',82%,62%)'; }
  function palette(board, field, width, height) {
    if (!board || !field) return;
    var keys = Object.keys(field).sort(), key = '', defs = '', pools = '';
    keys.forEach(function (k) { key += k + ':' + field[k].tone + ';'; });
    if (board._pigmentKey === key) return;
    board._pigmentKey = key;
    keys.forEach(function (k, i) {
      var xy = k.split(','), x = Number(xy[0]), y = Number(xy[1]);
      var h = field[k].tone == null ? (x * 83 + y * 47) % 360 : field[k].tone;
      defs += '<radialGradient id="p' + i + '"><stop stop-color="' + color(h) + '"/><stop offset=".42" stop-color="' + color(h + 85) + '"/><stop offset=".76" stop-color="' + color(h + 190) + '" stop-opacity=".9"/><stop offset="1" stop-color="' + color(h + 190) + '" stop-opacity="0"/></radialGradient>';
      pools += '<ellipse cx="' + (x * 100 + 43) + '" cy="' + (y * 100 + 48) + '" rx="86" ry="78" fill="url(#p' + i + ')"/>';
    });
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (width * 100) + ' ' + (height * 100) + '"><defs>' + defs + '</defs>' + pools + '</svg>';
    board.style.setProperty('--paint-colors', 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")');
  }
  function paint(node, x, y, field, width, height) {
    width = width || 8; height = height || 8;
    palette(node.parentNode && node.parentNode.parentNode, field, width, height);
    node._paintTone = field && field[x + ',' + y] && field[x + ',' + y].tone;
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
    // Fine stationary droplets make a lone impact read as paint, not a rounded tile.
    for (var drop = 0; drop < 7; drop++) {
      var angle = (drop * 137.5 + x * 19 + y * 31) * Math.PI / 180;
      var radius = 43 + drop % 3;
      paths += '<circle cx="' + (50 + Math.cos(angle) * radius) + '" cy="' + (50 + Math.sin(angle) * radius) + '" r="' + (1.1 + drop % 3 * .55) + '"/>';
    }
    var key = x + ',' + y + ':' + signature;
    if (!maskCache[key]) maskCache[key] = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="white">' + paths + '</g></svg>') + '")';
    node.classList.add('paint-field');
    var previous = node._paintKey, oldPaths = node._paintPaths;
    var changing = previous && previous !== key;
    var fresh = field && field[x + ',' + y] && field[x + ',' + y].age === 0;
    var initial = '<path d="' + blob(x + 2, y + 2) + '"/>';
    if (previous !== key) {
      if (node._paintFrame) cancelAnimationFrame(node._paintFrame);
      node._paintFrame = 0;
      node._paintKey = key; node._paintPaths = paths;
      if (!reduced() && (changing || fresh)) {
        var base = oldPaths || initial, start = performance.now();
        function grow(now) {
          var t = reduced() ? 1 : Math.min(1, (now - start) / 1250);
          var eased = t * t * (3 - 2 * t);
          var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="wet"><circle cx="50" cy="50" r="' + (eased * 78) + '"/></clipPath></defs><g fill="white">' + base + '<g clip-path="url(#wet)">' + paths + '</g></g></svg>';
          node._paintCurrent = t < 1 ? 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")' : maskCache[key];
          node.style.setProperty('--splat', node._paintCurrent);
          node._paintFrame = t < 1 ? requestAnimationFrame(grow) : 0;
        }
        grow(start);
      } else node._paintCurrent = maskCache[key];
    }
    node.style.setProperty('--splat', node._paintCurrent || maskCache[key]);
    node.style.setProperty('--sz', '100%');
    node.style.setProperty('--field-size', (width * 100) + '% ' + (height * 100) + '%');
    node.style.setProperty('--field-pos', (x / Math.max(1, width - 1) * 100) + '% ' + (y / Math.max(1, height - 1) * 100) + '%');
  }
  function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function replay(node, name) { node.classList.remove(name); void node.offsetWidth; node.classList.add(name); }
  function clear(board) {
    board._pigmentKey = null; board.style.removeProperty('--paint-colors');
    var actors = board.querySelectorAll('.cell');
    for (var a = 0; a < actors.length; a++) { if (actors[a]._hurtTimer) clearTimeout(actors[a]._hurtTimer); actors[a]._hurtTimer = 0; actors[a].classList.remove('hit-reaction'); }
    var paintNodes = board.querySelectorAll('.splat');
    for (var j = 0; j < paintNodes.length; j++) {
      if (paintNodes[j]._paintFrame) cancelAnimationFrame(paintNodes[j]._paintFrame);
      paintNodes[j]._paintFrame = 0; paintNodes[j]._paintKey = null;
      paintNodes[j]._paintPaths = null; paintNodes[j]._paintCurrent = null;
    }
    var nodes = board.querySelectorAll('.reaction');
    for (var i = 0; i < nodes.length; i++) { nodes[i].className = 'reaction'; nodes[i].innerHTML = ''; }
    nodes = board.querySelectorAll('.recoil');
    for (i = 0; i < nodes.length; i++) nodes[i].classList.remove('recoil');
  }
  function hurt(cell) {
    if (!cell || (!cell.classList.contains('me') && !cell.classList.contains('foe'))) return;
    if (cell._hurtTimer) clearTimeout(cell._hurtTimer);
    var sp = cell.querySelector('.splat'), h = sp && sp._paintTone;
    h = h == null ? 185 : h;
    cell.style.setProperty('--coat-a', color(h)); cell.style.setProperty('--coat-b', color(h + 85));
    cell.style.setProperty('--coat-c', color(h + 190));
    replay(cell, 'hit-reaction');
    cell._hurtTimer = setTimeout(function () { cell.classList.remove('hit-reaction'); cell._hurtTimer = 0; }, reduced() ? 250 : 780);
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
    var painted = cell.querySelector('.splat'), hue = painted && painted._paintTone;
    hue = hue == null ? 185 : hue;
    fx.style.setProperty('--liquid-a', color(hue)); fx.style.setProperty('--liquid-b', color(hue + 85));
    fx.style.setProperty('--liquid-c', color(hue + 190));
    fx.style.setProperty('--impact-mask', 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="white" d="' + blob(x + 2, y + 2) + '"/></svg>') + '")');
    var mass = document.createElement('span'); mass.className = 'liquid-mass'; fx.appendChild(mass);
    var rim = document.createElement('span'); rim.className = 'liquid-rim'; fx.appendChild(rim);
    var count = material === 'fabric' ? 4 : 9;
    for (var i = 0; i < count; i++) {
      var p = document.createElement('i'), angle = (i * 137.5 + x * 29 + y * 17) * Math.PI / 180;
      var radius = Math.min(75, cell.clientWidth * (material === 'fabric' ? .25 : .6)) + (i * 11 % 19);
      p.className = material === 'paper' && i < 3 ? 'paper-chip' : 'paint-bead';
      var painted = cell.querySelector('.splat'), hue = painted && painted._paintTone;
      p.style.setProperty('--bead-color', color((hue == null ? 170 : hue) + (i % 3) * 85));
      p.style.setProperty('--dx', (Math.cos(angle) * radius).toFixed(2) + 'px');
      p.style.setProperty('--dy', (Math.sin(angle) * radius).toFixed(2) + 'px');
      p.style.setProperty('--spin', ((i % 2 ? 1 : -1) * (45 + i * 21)) + 'deg');
      p.style.setProperty('--delay', (i * 13) + 'ms');
      p.style.setProperty('--bead', (5 + i % 5) + 'px');
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
  return { impact: impact, shoot: shoot, hurt: hurt, clear: clear, paint: paint };
})();
