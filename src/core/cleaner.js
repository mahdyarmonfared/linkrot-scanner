/**
 * LinkRot-Scanner - Cleaner & Report Exporter Module
 * Generates sanitized files (removing dead links) and formats analytical reports.
 */

/**
 * Removes or comments out dead links from original content.
 */
function cleanContent(originalContent, deadUrls, options = {}) {
  if (typeof originalContent !== 'string') return '';
  const deadSet = new Set(Array.isArray(deadUrls) ? deadUrls : Array.from(deadUrls));

  const lines = originalContent.split(/\r?\n/);
  const cleanedLines = [];

  const isHtml = /<(html|dl|dt|p|a\s)/i.test(originalContent);

  for (const line of lines) {
    let hasDeadLink = false;
    for (const deadUrl of deadSet) {
      if (line.includes(deadUrl)) {
        hasDeadLink = true;
        break;
      }
    }

    if (!hasDeadLink) {
      cleanedLines.push(line);
      continue;
    }

    // Line has a dead link
    if (isHtml) {
      // In Netscape bookmark files, drop the entire <DT><A ...> line
      if (options.commentOut) {
        cleanedLines.push(`<!-- [REMOVED DEAD LINK] ${line.trim()} -->`);
      }
      // Else drop line entirely
    } else {
      // Markdown: strike-through or drop
      if (options.strikethrough) {
        cleanedLines.push(`~~${line}~~ (broken link removed)`);
      } else if (options.commentOut) {
        cleanedLines.push(`<!-- [BROKEN LINK]: ${line} -->`);
      }
      // Else drop line entirely
    }
  }

  return cleanedLines.join('\n');
}

/**
 * Formats scan report into Markdown, CSV, or JSON.
 */
function exportReport(batchResult, format = 'markdown') {
  if (format === 'json') {
    return JSON.stringify(batchResult, null, 2);
  }

  if (format === 'csv') {
    let csv = 'Status,Code,Latency(ms),Title,URL,Error\n';
    for (const r of batchResult.results) {
      const title = `"${(r.title || '').replace(/"/g, '""')}"`;
      const url = `"${(r.url || '').replace(/"/g, '""')}"`;
      const err = `"${(r.error || '').replace(/"/g, '""')}"`;
      csv += `${r.category},${r.statusCode || 'N/A'},${r.latencyMs || 0},${title},${url},${err}\n`;
    }
    return csv;
  }

  // Default: Markdown table report
  let md = `# LinkRot-Scanner Audit Report 📊\n\n`;
  md += `Scan Duration: **${(batchResult.durationMs / 1000).toFixed(2)}s** | Overall Health: **${batchResult.healthScore}%**\n\n`;
  md += `- **Total Links Scanned:** ${batchResult.total}\n`;
  md += `- 🟢 **Alive (2xx):** ${batchResult.alive}\n`;
  md += `- 🟡 **Redirects (3xx):** ${batchResult.redirects}\n`;
  md += `- 🔴 **Dead (4xx):** ${batchResult.dead}\n`;
  md += `- 🟣 **Server Errors (5xx):** ${batchResult.serverErrors}\n`;
  md += `- ⚪ **Network / DNS Errors:** ${batchResult.networkErrors}\n\n`;

  md += `| Status | Code | Title | URL | Reason |\n`;
  md += `| :--- | :---: | :--- | :--- | :--- |\n`;

  for (const r of batchResult.results) {
    const badge = r.category === 'alive' ? '🟢 Alive' :
      r.category === 'redirect' ? '🟡 Redirect' :
      r.category === 'dead' ? '🔴 Dead' :
      r.category === 'server_error' ? '🟣 Server Err' : '⚪ Network Err';

    const code = r.statusCode ? `\`${r.statusCode}\`` : '`-`';
    const title = (r.title || 'Untitled').slice(0, 35);
    const reason = r.error || (r.redirectUrl ? `&rarr; ${r.redirectUrl}` : r.statusText || 'OK');

    md += `| ${badge} | ${code} | ${title} | [Link](${r.url}) | ${reason} |\n`;
  }

  return md;
}

module.exports = {
  cleanContent,
  exportReport
};
