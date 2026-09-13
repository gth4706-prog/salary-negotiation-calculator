// assets/ 폴더를 훑어 assets/manifest.json 을 만든다.
//   node blackout/tests/assets-manifest.js
// 그림을 넣거나 뺀 뒤 한 번 돌리면 된다. js/art.js 가 이 목록만 믿는다.
// (목록이 없으면 art.js 는 파일을 하나하나 더듬는데, 그러면 접속마다 404 가 쌓인다.)
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..', 'assets');
var files = [];
(function walk(dir, rel) {
  fs.readdirSync(dir).sort().forEach(function (name) {
    var full = path.join(dir, name), r = rel ? rel + '/' + name : name;
    if (fs.statSync(full).isDirectory()) { walk(full, r); return; }
    if (/\.(png|jpe?g|webp|gif|svg|ogg|mp3|wav)$/i.test(name) && r.indexOf('concept/') !== 0) files.push(r);
  });
})(root, '');
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ files: files }, null, 2) + '\n');
console.log('assets/manifest.json — ' + files.length + '개: ' + files.join(', '));
