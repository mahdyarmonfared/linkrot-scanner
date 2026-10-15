const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { createServer, isPathSafe } = require('../src/server/server');

describe('LinkRot-Scanner Web Studio Server', () => {
  let server;
  let serverPort;
  let baseUrl;

  before(async () => {
    server = createServer();
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    serverPort = server.address().port;
    baseUrl = `http://127.0.0.1:${serverPort}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('isPathSafe', () => {
    const base = path.resolve('src/ui');

    it('should allow paths within base directory', () => {
      assert.equal(isPathSafe(base, path.join(base, 'index.html')), true);
      assert.equal(isPathSafe(base, path.join(base, 'style.css')), true);
    });

    it('should block directory traversal paths outside base directory', () => {
      assert.equal(isPathSafe(base, path.resolve(base, '../server.js')), false);
      assert.equal(isPathSafe(base, path.resolve(base, '../../package.json')), false);
    });
  });

  function makeRequest(pathname, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: serverPort,
        path: pathname,
        method: options.method || 'GET',
        headers: options.headers || {}
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });

      req.on('error', reject);
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  describe('REST Endpoints', () => {
    it('should handle CORS OPTIONS preflight', async () => {
      const res = await makeRequest('/api/extract', { method: 'OPTIONS' });
      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['access-control-allow-origin'], '*');
    });

    it('POST /api/extract should extract links from body content', async () => {
      const res = await makeRequest('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { content: '[Node](https://nodejs.org)' }
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.success, true);
      assert.equal(data.total, 1);
      assert.equal(data.links[0].url, 'https://nodejs.org');
    });

    it('POST /api/clean should return sanitized content', async () => {
      const res = await makeRequest('/api/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          content: '- [A](https://a.com)\n- [B](https://b.com)',
          deadUrls: ['https://b.com']
        }
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.success, true);
      assert.ok(!data.cleaned.includes('https://b.com'));
      assert.ok(data.cleaned.includes('https://a.com'));
    });

    it('POST /api/check-single should return single URL status', async () => {
      const res = await makeRequest('/api/check-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { url: 'htp://invalid-link' }
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.success, true);
      assert.equal(data.result.category, 'network_error');
    });

    it('POST /api/scan should batch scan links', async () => {
      const res = await makeRequest('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          links: ['not-a-valid-url-1', 'not-a-valid-url-2'],
          concurrency: 2
        }
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.success, true);
      assert.equal(data.report.total, 2);
    });
  });

  describe('Static Asset Serving', () => {
    it('GET / should serve index.html', async () => {
      const res = await makeRequest('/');
      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'], /text\/html/);
      assert.ok(res.body.includes('LinkRot-Scanner'));
    });

    it('GET /style.css should serve CSS', async () => {
      const res = await makeRequest('/style.css');
      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'], /text\/css/);
    });

    it('GET /not-found-xyz.html should return 404', async () => {
      const res = await makeRequest('/not-found-xyz.html');
      assert.equal(res.statusCode, 404);
    });

    it('Path traversal attempt should return 403 Forbidden', async () => {
      const res = await makeRequest('/../../package.json');
      assert.equal(res.statusCode, 403);
    });
  });
});
