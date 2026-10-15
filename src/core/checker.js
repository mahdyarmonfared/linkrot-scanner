/**
 * LinkRot-Scanner - HTTP Status Checker & Concurrent Scanner
 * Pure Node.js zero-dependency HTTP/HTTPS client with concurrent worker pool.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 5;

/**
 * Checks a single URL using native http/https with HEAD fallback to GET.
 */
function checkUrl(urlStr, options = {}, redirectCount = 0) {
  return new Promise((resolve) => {
    let targetUrl;
    try {
      targetUrl = new URL(urlStr);
    } catch (err) {
      return resolve({
        url: urlStr,
        statusCode: null,
        statusText: 'Invalid URL',
        category: 'network_error',
        latencyMs: 0,
        error: err.message,
        redirectUrl: null
      });
    }

    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return resolve({
        url: urlStr,
        statusCode: null,
        statusText: 'Invalid Protocol',
        category: 'network_error',
        latencyMs: 0,
        error: `Unsupported protocol: ${targetUrl.protocol}`,
        redirectUrl: null
      });
    }

    const isHttps = targetUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;
    const method = options.method || 'HEAD';

    const reqOptions = {
      method,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LinkRot-Scanner/1.0',
        'Accept': '*/*'
      },
      timeout: timeoutMs
    };

    const startTime = Date.now();
    let isResolved = false;

    const finalize = (result) => {
      if (!isResolved) {
        isResolved = true;
        resolve(result);
      }
    };

    const req = client.request(reqOptions, (res) => {
      const latencyMs = Date.now() - startTime;
      const status = res.statusCode;
      const statusText = res.statusMessage || '';

      // Consume data to avoid memory leaks
      res.resume();

      // Handle Redirects (301, 302, 303, 307, 308)
      if (status >= 300 && status < 400 && res.headers.location) {
        let redirectTarget = res.headers.location;
        try {
          // Handle relative redirect URLs
          redirectTarget = new URL(redirectTarget, targetUrl).href;
        } catch {
          // Keep raw if URL parsing fails
        }

        if (options.followRedirects !== false && redirectCount < MAX_REDIRECTS) {
          return resolve(checkUrl(redirectTarget, options, redirectCount + 1));
        }

        return finalize({
          url: urlStr,
          statusCode: status,
          statusText,
          category: 'redirect',
          latencyMs,
          redirectUrl: redirectTarget,
          error: null
        });
      }

      // If HEAD returns 405 (Method Not Allowed) or 403, retry once with GET
      if ((status === 405 || status === 403) && method === 'HEAD') {
        return resolve(checkUrl(urlStr, { ...options, method: 'GET' }, redirectCount));
      }

      let category = 'alive';
      if (status >= 400 && status < 500) {
        category = 'dead';
      } else if (status >= 500) {
        category = 'server_error';
      }

      finalize({
        url: urlStr,
        statusCode: status,
        statusText,
        category,
        latencyMs,
        redirectUrl: redirectCount > 0 ? targetUrl.href : null,
        error: null
      });
    });

    req.on('timeout', () => {
      req.destroy();
      finalize({
        url: urlStr,
        statusCode: null,
        statusText: 'Timeout',
        category: 'network_error',
        latencyMs: timeoutMs,
        redirectUrl: null,
        error: `Request timed out after ${timeoutMs}ms`
      });
    });

    req.on('error', (err) => {
      // If HEAD failed with network error, try GET if not already done
      if (method === 'HEAD' && (err.code === 'ECONNRESET' || err.code === 'EPROTO')) {
        return resolve(checkUrl(urlStr, { ...options, method: 'GET' }, redirectCount));
      }

      const latencyMs = Date.now() - startTime;
      let errorMsg = err.code || err.message;
      if (err.code === 'ENOTFOUND') errorMsg = 'DNS Lookup Failed (Domain not found)';
      if (err.code === 'ECONNREFUSED') errorMsg = 'Connection Refused';

      finalize({
        url: urlStr,
        statusCode: null,
        statusText: err.code || 'Network Error',
        category: 'network_error',
        latencyMs,
        redirectUrl: null,
        error: errorMsg
      });
    });

    req.end();
  });
}

/**
 * Concurrently checks a batch of URLs with worker pool limit.
 */
async function checkBatch(items, options = {}, onProgress = null) {
  const concurrency = options.concurrency || 5;
  const results = [];
  const total = items.length;
  let cursor = 0;
  let completed = 0;
  const startTime = Date.now();

  async function worker() {
    while (cursor < total) {
      const index = cursor++;
      const item = items[index];
      const url = typeof item === 'string' ? item : item.url;
      const meta = typeof item === 'object' ? item : {};

      const checkRes = await checkUrl(url, options);
      const combined = {
        ...meta,
        ...checkRes
      };

      results[index] = combined;
      completed++;

      if (typeof onProgress === 'function') {
        onProgress({
          completed,
          total,
          percent: Math.round((completed / total) * 100),
          current: combined
        });
      }
    }
  }

  const workerPromises = [];
  const workerCount = Math.min(concurrency, total);
  for (let w = 0; w < workerCount; w++) {
    workerPromises.push(worker());
  }

  await Promise.all(workerPromises);

  const durationMs = Date.now() - startTime;

  // Aggregate stats
  let aliveCount = 0;
  let redirectCount = 0;
  let deadCount = 0;
  let serverErrorCount = 0;
  let networkErrorCount = 0;

  for (const r of results) {
    if (r.category === 'alive') aliveCount++;
    else if (r.category === 'redirect') redirectCount++;
    else if (r.category === 'dead') deadCount++;
    else if (r.category === 'server_error') serverErrorCount++;
    else networkErrorCount++;
  }

  const deadTotal = deadCount + serverErrorCount + networkErrorCount;
  const healthScore = total > 0 ? Math.round((aliveCount / total) * 100) : 100;

  return {
    total,
    alive: aliveCount,
    redirects: redirectCount,
    dead: deadCount,
    serverErrors: serverErrorCount,
    networkErrors: networkErrorCount,
    deadTotal,
    healthScore,
    durationMs,
    results
  };
}

module.exports = {
  checkUrl,
  checkBatch
};
