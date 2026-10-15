const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { checkUrl, checkBatch } = require('../src/core/checker');

describe('LinkRot-Scanner Checker Module', () => {
  let mockServer;
  let mockPort;
  let baseUrl;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const url = req.url;

      if (url === '/ok') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('All good');
      } else if (url === '/not-found') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else if (url === '/server-error') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else if (url === '/redirect') {
        res.writeHead(302, { 'Location': '/ok' });
        res.end();
      } else if (url === '/head-not-allowed') {
        if (req.method === 'HEAD') {
          res.writeHead(405, { 'Content-Type': 'text/plain' });
          res.end();
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('GET succeeded');
        }
      } else if (url === '/slow') {
        // Delayed response to test timeout
        setTimeout(() => {
          res.writeHead(200);
          res.end('Late');
        }, 300);
      } else {
        res.writeHead(400);
        res.end('Bad Request');
      }
    });

    await new Promise((resolve) => {
      mockServer.listen(0, '127.0.0.1', resolve);
    });

    mockPort = mockServer.address().port;
    baseUrl = `http://127.0.0.1:${mockPort}`;
  });

  after(async () => {
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });

  describe('checkUrl', () => {
    it('should classify 200 OK as alive', async () => {
      const res = await checkUrl(`${baseUrl}/ok`);
      assert.equal(res.statusCode, 200);
      assert.equal(res.category, 'alive');
      assert.equal(res.error, null);
    });

    it('should classify 404 as dead', async () => {
      const res = await checkUrl(`${baseUrl}/not-found`);
      assert.equal(res.statusCode, 404);
      assert.equal(res.category, 'dead');
    });

    it('should classify 500 as server_error', async () => {
      const res = await checkUrl(`${baseUrl}/server-error`);
      assert.equal(res.statusCode, 500);
      assert.equal(res.category, 'server_error');
    });

    it('should follow redirect and reach final destination', async () => {
      const res = await checkUrl(`${baseUrl}/redirect`);
      assert.equal(res.statusCode, 200);
      assert.equal(res.category, 'alive');
      assert.equal(res.redirectUrl, `${baseUrl}/ok`);
    });

    it('should handle redirects when followRedirects is false', async () => {
      const res = await checkUrl(`${baseUrl}/redirect`, { followRedirects: false });
      assert.equal(res.statusCode, 302);
      assert.equal(res.category, 'redirect');
      assert.equal(res.redirectUrl, `${baseUrl}/ok`);
    });

    it('should fallback to GET when HEAD returns 405', async () => {
      const res = await checkUrl(`${baseUrl}/head-not-allowed`);
      assert.equal(res.statusCode, 200);
      assert.equal(res.category, 'alive');
    });

    it('should handle timeout error properly', async () => {
      const res = await checkUrl(`${baseUrl}/slow`, { timeout: 100 });
      assert.equal(res.category, 'network_error');
      assert.match(res.error, /timed out/i);
    });

    it('should handle invalid URL gracefully', async () => {
      const res = await checkUrl('not-a-valid-url');
      assert.equal(res.category, 'network_error');
      assert.equal(res.statusText, 'Invalid URL');
    });

    it('should handle unsupported protocol gracefully', async () => {
      const res = await checkUrl('ftp://example.com/file.zip');
      assert.equal(res.category, 'network_error');
      assert.equal(res.statusText, 'Invalid Protocol');
    });

    it('should handle non-existent domain as network error', async () => {
      const res = await checkUrl('http://non-existent-domain-123456789xyz.fake');
      assert.equal(res.category, 'network_error');
      assert.ok(res.error);
    });
  });

  describe('checkBatch', () => {
    it('should batch scan URLs with concurrency and compute health metrics', async () => {
      const items = [
        { url: `${baseUrl}/ok`, title: 'Home' },
        { url: `${baseUrl}/not-found`, title: 'Broken' },
        { url: `${baseUrl}/server-error`, title: 'Server Down' }
      ];

      const progressEvents = [];
      const report = await checkBatch(items, { concurrency: 2 }, (p) => {
        progressEvents.push(p);
      });

      assert.equal(report.total, 3);
      assert.equal(report.alive, 1);
      assert.equal(report.dead, 1);
      assert.equal(report.serverErrors, 1);
      assert.equal(report.deadTotal, 2);
      assert.equal(report.healthScore, 33);
      assert.equal(report.results.length, 3);
      assert.equal(progressEvents.length, 3);
    });
  });
});
