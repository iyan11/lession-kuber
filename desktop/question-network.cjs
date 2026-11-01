const https = require('node:https');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');
const { X509Certificate } = require('node:crypto');
const GIGA_URLS = new Set(['https://ngw.devices.sberbank.ru:9443/api/v2/oauth', 'https://api.giga.chat/v1/chat/completions']);
// This CA is scoped to two GigaChat requests, never installed into Windows.
function questionFetch(url, options) {
  if (!GIGA_URLS.has(url)) {
    if (!['https://openrouter.ai/api/v1/chat/completions', 'http://127.0.0.1:11434/api/chat', 'http://127.0.0.1:11434/api/show'].includes(url)) throw new Error('Unsupported question endpoint');
    return fetch(url, options);
  }
  const pem = fs.readFileSync(path.join(__dirname, 'certs/russian_trusted_root_ca.pem'), 'utf8');
  const cert = new X509Certificate(pem);
  if (!cert.ca || cert.fingerprint256 !== 'D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31') throw new Error('Invalid bundled CA');
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: options.method, headers: options.headers, signal: options.signal, ca: [...tls.rootCertificates, pem], rejectUnauthorized: true }, response => {
      let size = 0; const chunks = [];
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 128000) { response.destroy(); reject(new Error('Response limit exceeded')); }
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })));
    });
    request.on('error', reject);
    request.end(options.body);
  });
}
module.exports = { questionFetch };
