const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractFromMarkdown,
  extractFromHtml,
  extractFromText,
  extractLinks
} = require('../src/core/extractor');

describe('LinkRot-Scanner URL Extractor', () => {
  describe('extractFromMarkdown', () => {
    it('should extract inline markdown links', () => {
      const md = '# Header\nCheck out [Google](https://google.com) and [GitHub](https://github.com "GH").';
      const links = extractFromMarkdown(md);
      assert.equal(links.length, 2);
      assert.equal(links[0].url, 'https://google.com');
      assert.equal(links[0].title, 'Google');
      assert.equal(links[0].line, 2);
      assert.equal(links[0].source, 'markdown-link');
      assert.equal(links[1].url, 'https://github.com');
      assert.equal(links[1].title, 'GitHub');
    });

    it('should extract autolinks', () => {
      const md = 'Visit <https://nodejs.org> for runtime docs.';
      const links = extractFromMarkdown(md);
      assert.equal(links.length, 1);
      assert.equal(links[0].url, 'https://nodejs.org');
      assert.equal(links[0].source, 'markdown-autolink');
    });

    it('should extract reference-style markdown links', () => {
      const md = '[NodeJS]: https://nodejs.org/en\n[npm]: https://npmjs.com';
      const links = extractFromMarkdown(md);
      assert.equal(links.length, 2);
      assert.equal(links[0].url, 'https://nodejs.org/en');
      assert.equal(links[0].title, 'NodeJS');
      assert.equal(links[0].source, 'markdown-reference');
    });

    it('should handle empty or non-string inputs gracefully', () => {
      assert.deepEqual(extractFromMarkdown(null), []);
      assert.deepEqual(extractFromMarkdown(undefined), []);
      assert.deepEqual(extractFromMarkdown(123), []);
      assert.deepEqual(extractFromMarkdown(''), []);
    });
  });

  describe('extractFromHtml', () => {
    it('should extract links from Netscape bookmark HTML', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
        <TITLE>Bookmarks</TITLE>
        <H1>Bookmarks</H1>
        <DL><p>
            <DT><A HREF="https://developer.mozilla.org" ADD_DATE="1600000000">MDN Web Docs</A>
            <DT><A HREF="https://example.com/test"><b>Bold</b> Example</A>
        </DL><p>
      `;
      const links = extractFromHtml(html);
      assert.equal(links.length, 2);
      assert.equal(links[0].url, 'https://developer.mozilla.org');
      assert.equal(links[0].title, 'MDN Web Docs');
      assert.equal(links[0].source, 'html-anchor');
      assert.equal(links[1].url, 'https://example.com/test');
      assert.equal(links[1].title, 'Bold Example');
    });

    it('should return empty array for non-string', () => {
      assert.deepEqual(extractFromHtml(null), []);
    });
  });

  describe('extractFromText', () => {
    it('should extract raw URLs from plain text and strip trailing punctuation', () => {
      const text = 'Check out https://github.com/nodejs, or https://fastify.io; also http://local.dev:8080.';
      const links = extractFromText(text);
      assert.equal(links.length, 3);
      assert.equal(links[0].url, 'https://github.com/nodejs');
      assert.equal(links[1].url, 'https://fastify.io');
      assert.equal(links[2].url, 'http://local.dev:8080');
    });
  });

  describe('extractLinks (Auto-detector)', () => {
    it('should auto-detect HTML format', () => {
      const content = '<!DOCTYPE html><html><body><a href="https://example.com">Example</a></body></html>';
      const links = extractLinks(content);
      assert.equal(links.length, 1);
      assert.equal(links[0].url, 'https://example.com');
    });

    it('should auto-detect Markdown format', () => {
      const content = '# Readme\n[Docs](https://example.com/docs)';
      const links = extractLinks(content);
      assert.equal(links.length, 1);
      assert.equal(links[0].url, 'https://example.com/docs');
    });

    it('should deduplicate links when uniqueOnly is true', () => {
      const content = '[Docs 1](https://example.com)\n[Docs 2](https://example.com)';
      const links = extractLinks(content, { uniqueOnly: true });
      assert.equal(links.length, 1);
      assert.equal(links[0].url, 'https://example.com');
    });
  });
});
