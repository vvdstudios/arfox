const https = require('https'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.glb': 'model/gltf-binary',
  '.tflite': 'application/octet-stream', '.wasm': 'application/wasm', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
https.createServer({ key: fs.readFileSync('certs/key.pem'), cert: fs.readFileSync('certs/cert.pem') }, (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(8443, '0.0.0.0', () => console.log('Fox GO on https://192.168.71.41:8443'));
