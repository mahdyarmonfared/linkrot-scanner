/**
 * LinkRot-Scanner - URL Extractor Module
 * Zero-dependency parser extracting links from Markdown, HTML Bookmarks, and Plain Text.
 */

/**
 * Extracts links from Markdown content.
 * Matches:
 * - [Link Text](https://example.com "title")
 * - <https://example.com>
 * - [ref]: https://example.com
 * - Raw URLs
 */
function extractFromMarkdown(content) {
  if (typeof content !== 'string') return [];

  const lines = content.split(/\r?\n/);
  const links = [];
  const seenUrls = new Set();

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // 1. Standard markdown [text](url)
    const mdLinkRegex = /\[([^\]]*)\]\((https?:\/\/[^\s\)]+)(?:\s+"[^"]*")?\)/gi;
    let match;
    while ((match = mdLinkRegex.exec(line)) !== null) {
      const title = match[1].trim() || match[2];
      const url = match[2].trim();
      links.push({
        url,
        title,
        line: lineNum + 1,
        source: 'markdown-link'
      });
      seenUrls.add(url);
    }

    // 2. Autolinks <https://...>
    const autolinkRegex = /<(https?:\/\/[^>]+)>/gi;
    while ((match = autolinkRegex.exec(line)) !== null) {
      const url = match[1].trim();
      if (!seenUrls.has(url)) {
        links.push({
          url,
          title: url,
          line: lineNum + 1,
          source: 'markdown-autolink'
        });
        seenUrls.add(url);
      }
    }

    // 3. Reference-style definitions: [id]: https://...
    const refRegex = /^\[([^\]]+)\]:\s*(https?:\/\/\S+)/gi;
    while ((match = refRegex.exec(line)) !== null) {
      const url = match[2].trim();
      if (!seenUrls.has(url)) {
        links.push({
          url,
          title: match[1].trim(),
          line: lineNum + 1,
          source: 'markdown-reference'
        });
        seenUrls.add(url);
      }
    }
  }

  return links;
}

/**
 * Extracts links from HTML bookmarks (Netscape format from Chrome, Firefox, Safari)
 * Matches: <A HREF="https://..." ADD_DATE="..." ICON="...">Bookmark Title</A>
 */
function extractFromHtml(content) {
  if (typeof content !== 'string') return [];

  const lines = content.split(/\r?\n/);
  const links = [];
  const seenUrls = new Set();

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // Anchor tags: <a href="url" ...>Title</a>
    const tagRegex = /<a\s+(?:[^>]*?\s+)?href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match;

    while ((match = tagRegex.exec(line)) !== null) {
      const url = match[1].trim();
      // Strip any nested tags inside title
      const cleanTitle = match[2].replace(/<[^>]*>/g, '').trim() || url;

      links.push({
        url,
        title: cleanTitle,
        line: lineNum + 1,
        source: 'html-anchor'
      });
      seenUrls.add(url);
    }
  }

  return links;
}

/**
 * Extracts raw URLs from arbitrary text.
 */
function extractFromText(content) {
  if (typeof content !== 'string') return [];

  const urlRegex = /\b(https?:\/\/[^\s<>"'\)]+)/gi;
  const lines = content.split(/\r?\n/);
  const links = [];
  const seenUrls = new Set();

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let match;

    while ((match = urlRegex.exec(line)) !== null) {
      let url = match[1].trim();
      // Strip trailing punctuation like .,;
      url = url.replace(/[.,;:]+$/, '');

      if (!seenUrls.has(url)) {
        links.push({
          url,
          title: url,
          line: lineNum + 1,
          source: 'raw-url'
        });
        seenUrls.add(url);
      }
    }
  }

  return links;
}

/**
 * Auto-detects format (HTML, Markdown, Plain Text) and extracts all links.
 */
function extractLinks(content, options = {}) {
  if (!content) return [];

  const str = String(content);
  let links = [];

  // Check if content looks like HTML
  if (/<(html|head|body|dl|p|dt|a\s)/i.test(str)) {
    links = extractFromHtml(str);
  } else if (/\[.+\]\(https?:\/\/.+\)/.test(str) || /^#+\s/m.test(str)) {
    links = extractFromMarkdown(str);
  } else {
    links = extractFromText(str);
  }

  // Deduplicate by URL if uniqueOnly requested
  if (options.uniqueOnly) {
    const map = new Map();
    for (const l of links) {
      if (!map.has(l.url)) {
        map.set(l.url, l);
      }
    }
    return Array.from(map.values());
  }

  return links;
}

module.exports = {
  extractFromMarkdown,
  extractFromHtml,
  extractFromText,
  extractLinks
};
