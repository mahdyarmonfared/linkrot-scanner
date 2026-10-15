const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { cleanContent, exportReport } = require('../src/core/cleaner');

describe('LinkRot-Scanner Cleaner & Exporter Module', () => {
  describe('cleanContent', () => {
    it('should remove lines containing dead URLs from Markdown by default', () => {
      const md = '# Links\n- [Good](https://good.com)\n- [Dead](https://dead.com)\n- [Other](https://other.com)';
      const deadUrls = ['https://dead.com'];
      const cleaned = cleanContent(md, deadUrls);

      assert.ok(!cleaned.includes('https://dead.com'));
      assert.ok(cleaned.includes('https://good.com'));
      assert.ok(cleaned.includes('https://other.com'));
    });

    it('should strikethrough dead URLs in Markdown when requested', () => {
      const md = '- [Dead](https://dead.com)';
      const deadUrls = ['https://dead.com'];
      const cleaned = cleanContent(md, deadUrls, { strikethrough: true });

      assert.match(cleaned, /~~- \[Dead\]\(https:\/\/dead\.com\)~~ \(broken link removed\)/);
    });

    it('should comment out dead URLs in Markdown when requested', () => {
      const md = '- [Dead](https://dead.com)';
      const deadUrls = ['https://dead.com'];
      const cleaned = cleanContent(md, deadUrls, { commentOut: true });

      assert.match(cleaned, /<!-- \[BROKEN LINK\]: - \[Dead\]\(https:\/\/dead\.com\) -->/);
    });

    it('should remove dead bookmark line in HTML bookmarks', () => {
      const html = '<DL><p>\n<DT><A HREF="https://good.com">Good</A>\n<DT><A HREF="https://dead.com">Dead</A>\n</DL>';
      const deadUrls = ['https://dead.com'];
      const cleaned = cleanContent(html, deadUrls);

      assert.ok(!cleaned.includes('https://dead.com'));
      assert.ok(cleaned.includes('https://good.com'));
    });

    it('should comment out dead bookmark in HTML bookmarks when requested', () => {
      const html = '<DL><p>\n<DT><A HREF="https://dead.com">Dead</A>\n</DL>';
      const deadUrls = ['https://dead.com'];
      const cleaned = cleanContent(html, deadUrls, { commentOut: true });

      assert.match(cleaned, /<!-- \[REMOVED DEAD LINK\] <DT><A HREF="https:\/\/dead\.com">Dead<\/A> -->/);
    });

    it('should handle non-string or empty input safely', () => {
      assert.equal(cleanContent(null, []), '');
      assert.equal(cleanContent(undefined, []), '');
    });
  });

  describe('exportReport', () => {
    const mockReport = {
      total: 3,
      alive: 1,
      redirects: 1,
      dead: 1,
      serverErrors: 0,
      networkErrors: 0,
      deadTotal: 1,
      healthScore: 33,
      durationMs: 1200,
      results: [
        {
          category: 'alive',
          statusCode: 200,
          latencyMs: 85,
          title: 'Google',
          url: 'https://google.com',
          error: null
        },
        {
          category: 'redirect',
          statusCode: 301,
          latencyMs: 110,
          title: 'HTTP Google',
          url: 'http://google.com',
          redirectUrl: 'https://google.com/',
          error: null
        },
        {
          category: 'dead',
          statusCode: 404,
          latencyMs: 95,
          title: 'Broken Page',
          url: 'https://example.com/broken',
          error: 'Not Found'
        }
      ]
    };

    it('should format report as Markdown table', () => {
      const md = exportReport(mockReport, 'markdown');
      assert.ok(md.includes('# LinkRot-Scanner Audit Report'));
      assert.ok(md.includes('Overall Health: **33%**'));
      assert.ok(md.includes('| 🟢 Alive | `200` | Google | [Link](https://google.com) | OK |'));
      assert.ok(md.includes('| 🔴 Dead | `404` | Broken Page | [Link](https://example.com/broken) | Not Found |'));
    });

    it('should format report as CSV', () => {
      const csv = exportReport(mockReport, 'csv');
      assert.ok(csv.startsWith('Status,Code,Latency(ms),Title,URL,Error'));
      assert.ok(csv.includes('alive,200,85,"Google","https://google.com",""'));
      assert.ok(csv.includes('dead,404,95,"Broken Page","https://example.com/broken","Not Found"'));
    });

    it('should format report as JSON', () => {
      const jsonStr = exportReport(mockReport, 'json');
      const parsed = JSON.parse(jsonStr);
      assert.equal(parsed.total, 3);
      assert.equal(parsed.healthScore, 33);
      assert.equal(parsed.results.length, 3);
    });
  });
});
