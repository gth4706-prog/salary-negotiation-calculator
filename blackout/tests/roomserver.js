// 방 서버 **대역**. 실제 서버(Cloudflare Durable Object)는 이 환경의 네트워크 정책에
// 막혀 있어서(workers.dev → 403), 같은 규약을 말하는 최소 서버를 세워 넷코드를 잰다.
// 여기서 확인하는 것: 입장·준비→시작(같은 씨앗)·릴레이·끊김/재접속.
// 여기서 **확인 못 하는 것**: 실제 워커의 동작, WebRTC 직결·TURN.
const http = require('http');
const { WebSocketServer } = require('ws');

const rooms = new Map();   // code -> { name, host, clients:Set }
const PORT = 8767;

function code() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }
function json(res, obj, st) {
  res.writeHead(st || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  //  JSON POST 는 프리플라이트(OPTIONS)가 먼저 온다. 이걸 안 받으면 방 만들기가
  //  CORS 로 조용히 막힌다(실제로 여기서 한 번 막혔다).
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization' });
    return res.end();
  }
  if (u.pathname === '/health') return json(res, { ok: true });
  if (u.pathname === '/ice') return json(res, { iceServers: [] });
  if (u.pathname === '/rooms' && req.method === 'GET') {
    return json(res, { rooms: [...rooms.entries()].map(([c, r]) =>
      ({ code: c, name: r.name, host: r.host, mode: r.mode, count: r.clients.size })) });
  }
  if (u.pathname === '/rooms' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      let b = {}; try { b = JSON.parse(body); } catch (e) {}
      const c = code();
      rooms.set(c, { name: b.name || '', host: b.id || '손님', mode: b.mode || '', clients: new Set() });
      json(res, { code: c, host: b.id, mode: b.mode });
    });
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const u = new URL(req.url, 'http://x');
  const c = (u.searchParams.get('code') || '').toUpperCase();
  const id = u.searchParams.get('id') || '손님';
  const v = u.searchParams.get('v') || '';
  const room = rooms.get(c);
  if (!room) return ws.close(4004, 'no room');
  //  버전 악수 — 다른 게임(에그워)의 방과 섞이지 않게 하는 안전장치.
  if (room.v && room.v !== v) return ws.close(4009, 'version');
  room.v = v;

  ws.id = id; ws.ready = false;
  room.clients.add(ws);
  if (room.clients.size === 1) room.host = id;

  const peers = () => [...room.clients].map(w => ({ id: w.id, ready: w.ready }));
  const bcast = (o, except) => room.clients.forEach(w => { if (w !== except && w.readyState === 1) w.send(JSON.stringify(o)); });

  ws.send(JSON.stringify({ t: 'welcome', you: id, host: room.host, peers: peers(), iceTicket: '' }));
  bcast({ t: 'peer', peers: peers(), host: room.host }, ws);

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'ping') return ws.send(JSON.stringify({ t: 'pong', n: m.n }));
    if (m.t === 'relay') return bcast({ t: 'relay', from: id, data: m.data }, ws);
    if (m.t === 'ready') {
      ws.ready = m.ready !== false;
      bcast({ t: 'peer', peers: peers(), host: room.host });
      const all = [...room.clients];
      if (all.length === 2 && all.every(w => w.ready)) {
        all.forEach(w => w.ready = false);
        //  씨앗은 **서버가** 정한다. 클라이언트가 정하면 둘이 다른 판을 연다.
        const seed = (Math.random() * 0xffffffff) >>> 0;
        bcast({ t: 'start', seed, at: Date.now() });
      }
      return;
    }
    if (m.t === 'bye') ws.close(1000, 'bye');
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    if (room.clients.size === 0) { setTimeout(() => { if (rooms.get(c)?.clients.size === 0) rooms.delete(c); }, 30000); return; }
    if (room.host === id) room.host = [...room.clients][0].id;
    bcast({ t: 'peer', peers: peers(), host: room.host });
  });
});
server.listen(PORT, () => console.log('방 서버 대역 :' + PORT));
