const http = require('http');

const ORIGIN = (process.env.ORIGIN || '').trim().replace(/\/?$/, '/');
const DEBUG_KEY = process.env.DEBUG_KEY || '';
const PORT = process.env.PORT || 3000;
const PREFIX = '/s/';
const PASS = ['subscription-userinfo', 'profile-update-interval', 'profile-title',
              'content-disposition', 'profile-web-page-url', 'support-url'];
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

console.log('[start] ORIGIN =', ORIGIN.length > 1 ? new URL(ORIGIN).host + '/…' : '(НЕ ЗАДАН!)');

async function pull(id, ua) {
  const r = await fetch(ORIGIN + id, {
    headers: { 'user-agent': ua || 'sub-relay' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });
  const body = Buffer.from(await r.arrayBuffer());
  const headers = { 'content-type': r.headers.get('content-type') || 'text/plain; charset=utf-8' };
  for (const h of PASS) { const v = r.headers.get(h); if (v) headers[h] = v; }
  return { status: r.status, headers, body };
}

function errInfo(e) {
  return (e.cause && (e.cause.code || e.cause.message)) || e.name || String(e);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  // проверка, что сервис жив
  if (path === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('ok\norigin задан: ' + (ORIGIN.length > 1) + '\n');
  }

  // диагностика: /debug?key=ТВОЙ_DEBUG_KEY&id=ID_КЛИЕНТА
  if (path === '/debug') {
    if (!DEBUG_KEY || url.searchParams.get('key') !== DEBUG_KEY) { res.writeHead(404); return res.end(); }
    const id = url.searchParams.get('id') || 'test';
    let out = 'origin host: ' + (ORIGIN.length > 1 ? new URL(ORIGIN).host : 'НЕ ЗАДАН') + '\n';
    out += 'запрос: ' + ORIGIN.replace(/\/\/[^/]+/, '//***') + id.slice(0, 3) + '…\n';
    try {
      const t = Date.now();
      const r = await pull(id, req.headers['user-agent']);
      out += 'ответ панели: ' + r.status + ' за ' + (Date.now() - t) + ' мс, ' + r.body.length + ' байт\n';
    } catch (e) {
      out += 'ОШИБКА: ' + errInfo(e) + '\n';
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end(out);
  }

  // подписка: /s/ID
  if (!path.startsWith(PREFIX)) { res.writeHead(404); return res.end(); }
  const id = path.slice(PREFIX.length).replace(/\/$/, '');
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) { res.writeHead(404); return res.end(); }
  if (ORIGIN.length <= 1) { res.writeHead(500); return res.end('ORIGIN not set'); }

  const key = id + '|' + (req.headers['user-agent'] || '');
  try {
    const r = await pull(id, req.headers['user-agent']);
    console.log('[sub]', id.slice(0, 3) + '…', '->', r.status);
    if (r.status === 200) cache.set(key, { ...r, t: Date.now() });
    res.writeHead(r.status, r.headers);
    return res.end(r.body);
  } catch (e) {
    console.log('[sub]', id.slice(0, 3) + '…', 'ОШИБКА:', errInfo(e));
    const c = cache.get(key);
    if (c && Date.now() - c.t < CACHE_MS) {   // панель недоступна — отдаём последнюю копию
      res.writeHead(200, c.headers);
      return res.end(c.body);
    }
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('origin error');
  }
}).listen(PORT, () => console.log('[start] слушаю порт', PORT));
