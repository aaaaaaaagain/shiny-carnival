const http = require('http');

const ORIGIN = process.env.ORIGIN;          // https://sub-origin.твойдомен.com/k7Qx2/
const TOKEN = process.env.ORIGIN_TOKEN;     // тот же секрет, что в правиле WAF
const PREFIX = '/s/';
const PASS_HEADERS = ['subscription-userinfo', 'profile-update-interval', 'profile-title', 'content-disposition'];

http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  if (!path.startsWith(PREFIX)) { res.writeHead(404); return res.end(); }

  const id = path.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) { res.writeHead(404); return res.end(); }

  try {
    const r = await fetch(ORIGIN + id, {
      headers: { 'user-agent': req.headers['user-agent'] || '', 'x-sub-token': TOKEN }
    });
    const headers = { 'content-type': r.headers.get('content-type') || 'text/plain; charset=utf-8' };
    for (const h of PASS_HEADERS) {
      const v = r.headers.get(h);
      if (v) headers[h] = v;
    }
    res.writeHead(r.status, headers);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(502);
    res.end();
  }
}).listen(process.env.PORT || 3000);