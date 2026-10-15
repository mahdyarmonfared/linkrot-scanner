/**
 * LinkRot-Scanner - CLI Command Runner
 */

const fs = require('fs');
const path = require('path');
const ansi = require('./ansi');
const { extractLinks } = require('../core/extractor');
const { checkUrl, checkBatch } = require('../core/checker');
const { cleanContent, exportReport } = require('../core/cleaner');
const { startServer } = require('../server/server');

function printHelp() {
  console.log(`
${ansi.bold(ansi.cyan('LinkRot-Scanner'))} - Zero-Dependency Broken Link & Dead Bookmark Auditor

${ansi.bold('USAGE:')}
  ${ansi.green('linkrot')} ${ansi.yellow('<command>')} [target] [options]

${ansi.bold('COMMANDS:')}
  ${ansi.yellow('scan')} <file> [options]         Extract and audit all links in Markdown or HTML bookmarks
  ${ansi.yellow('check')} <url>                  Quickly check status, latency, and redirects for a single URL
  ${ansi.yellow('clean')} <file> [-o output]     Remove dead links from Markdown or HTML file
  ${ansi.yellow('ui')} [--port <number>]         Launch the interactive Web Studio (default: 3024)
  ${ansi.yellow('help')}                         Show this help manual

${ansi.bold('OPTIONS:')}
  ${ansi.gray('-c, --concurrency <number>')}     Concurrent connection limit (default: 5)
  ${ansi.gray('-t, --timeout <ms>')}             HTTP request timeout in ms (default: 5000)
  ${ansi.gray('-f, --format <format>')}          Export format: table, json, markdown, csv
  ${ansi.gray('-o, --output <file>')}            Save report or cleaned file to output path

${ansi.bold('EXAMPLES:')}
  ${ansi.gray('# Audit a markdown documentation file:')}
  linkrot scan README.md

  ${ansi.gray('# Audit exported Chrome / Firefox bookmarks HTML:')}
  linkrot scan bookmarks.html --concurrency 8

  ${ansi.gray('# Check single URL status and latency:')}
  linkrot check https://github.com

  ${ansi.gray('# Launch local Web Studio on port 3024:')}
  linkrot ui
`);
}

async function handleCheck(args) {
  if (args.length === 0) {
    console.error(ansi.red('Error: Missing URL argument.'));
    console.log('Usage: linkrot check <url>');
    process.exit(1);
  }

  const url = args[0];
  console.log(`Checking: ${ansi.yellow(url)} ...`);

  const result = await checkUrl(url);

  console.log(`\n${ansi.bold(ansi.cyan('=== Single URL Audit ==='))}`);
  console.log(`${ansi.bold('URL:')}          ${result.url}`);
  console.log(`${ansi.bold('Status:')}       ${result.statusCode ? ansi.bold(result.statusCode) : 'N/A'} (${result.statusText || 'N/A'})`);
  console.log(`${ansi.bold('Category:')}     ${formatCategoryBadge(result.category)}`);
  console.log(`${ansi.bold('Latency:')}      ${result.latencyMs}ms`);
  if (result.redirectUrl) {
    console.log(`${ansi.bold('Redirect To:')}  ${ansi.yellow(result.redirectUrl)}`);
  }
  if (result.error) {
    console.log(`${ansi.bold('Error:')}        ${ansi.red(result.error)}`);
  }
  console.log('');
}

async function handleScan(args) {
  if (args.length === 0) {
    console.error(ansi.red('Error: Missing target file.'));
    console.log('Usage: linkrot scan <file.md|bookmarks.html>');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  if (!fs.existsSync(filePath)) {
    console.error(ansi.red(`Error: File not found at "${filePath}"`));
    process.exit(1);
  }

  // Parse flags
  let concurrency = 5;
  const cIdx = args.findIndex(a => a === '-c' || a === '--concurrency');
  if (cIdx !== -1 && args[cIdx + 1]) concurrency = parseInt(args[cIdx + 1], 10) || 5;

  let timeout = 5000;
  const tIdx = args.findIndex(a => a === '-t' || a === '--timeout');
  if (tIdx !== -1 && args[tIdx + 1]) timeout = parseInt(args[tIdx + 1], 10) || 5000;

  let format = 'table';
  const fIdx = args.findIndex(a => a === '-f' || a === '--format');
  if (fIdx !== -1 && args[fIdx + 1]) format = args[fIdx + 1].toLowerCase();

  const raw = fs.readFileSync(filePath, 'utf8');
  const links = extractLinks(raw, { uniqueOnly: true });

  if (links.length === 0) {
    console.log(ansi.yellow(`No HTTP/HTTPS links discovered in "${filePath}".`));
    return;
  }

  console.log(`\n${ansi.bold(ansi.cyan('╔════════════════════════════════════════════════════════════╗'))}`);
  console.log(`${ansi.bold(ansi.cyan('║'))}  ${ansi.bold(ansi.green('LinkRot-Scanner'))} · Scanning ${ansi.yellow(links.length)} links (Concurrency: ${concurrency})     ${ansi.bold(ansi.cyan('║'))}`);
  console.log(`${ansi.bold(ansi.cyan('╚════════════════════════════════════════════════════════════╝'))}\n`);

  const batchResult = await checkBatch(links, { concurrency, timeout }, (progress) => {
    process.stdout.write(`\r[${progress.percent}%] Scanned ${progress.completed}/${progress.total} links...`);
  });

  process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear progress line

  // Export or render
  if (format === 'json') {
    console.log(exportReport(batchResult, 'json'));
    return;
  } else if (format === 'markdown') {
    console.log(exportReport(batchResult, 'markdown'));
    return;
  } else if (format === 'csv') {
    console.log(exportReport(batchResult, 'csv'));
    return;
  }

  // Terminal Table rendering
  console.log(`\n${ansi.bold('Audit Results:')}`);
  console.log(ansi.gray('─'.repeat(80)));

  for (const r of batchResult.results) {
    const badge = formatCategoryBadge(r.category);
    const code = String(r.statusCode || '---').padEnd(4, ' ');
    const url = r.url.length > 45 ? r.url.slice(0, 42) + '...' : r.url.padEnd(45, ' ');
    const note = r.error ? ansi.red(r.error) : r.redirectUrl ? ansi.yellow('-> ' + r.redirectUrl) : ansi.gray(r.latencyMs + 'ms');

    console.log(`  ${badge}  ${code}  ${ansi.cyan(url)}  ${note}`);
  }

  console.log(ansi.gray('─'.repeat(80)));
  console.log(`\n${ansi.bold(ansi.cyan('=== Summary Statistics ==='))}`);
  console.log(`Total Scanned:  ${ansi.bold(batchResult.total)} in ${(batchResult.durationMs / 1000).toFixed(2)}s`);
  console.log(`🟢 Alive (2xx):  ${ansi.green(batchResult.alive)}`);
  console.log(`🟡 Redirects:    ${ansi.yellow(batchResult.redirects)}`);
  console.log(`🔴 Dead (4xx):   ${ansi.red(batchResult.dead)}`);
  console.log(`🟣 Server Err:   ${ansi.magenta(batchResult.serverErrors)}`);
  console.log(`⚪ Network Err:  ${ansi.gray(batchResult.networkErrors)}`);
  console.log(`Overall Health: ${batchResult.healthScore >= 90 ? ansi.green(batchResult.healthScore + '%') : ansi.yellow(batchResult.healthScore + '%')}\n`);
}

async function handleClean(args) {
  if (args.length === 0) {
    console.error(ansi.red('Error: Missing file to clean.'));
    console.log('Usage: linkrot clean <file> [-o output]');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  let outPath = null;
  const oIdx = args.findIndex(a => a === '-o' || a === '--output');
  if (oIdx !== -1 && args[oIdx + 1]) {
    outPath = path.resolve(args[oIdx + 1]);
  } else {
    const ext = path.extname(filePath);
    const base = filePath.slice(0, -ext.length);
    outPath = `${base}_clean${ext}`;
  }

  if (!fs.existsSync(filePath)) {
    console.error(ansi.red(`Error: File not found at "${filePath}"`));
    process.exit(1);
  }

  console.log(`Scanning "${filePath}" to identify dead links...`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const links = extractLinks(raw, { uniqueOnly: true });

  const batchResult = await checkBatch(links, { concurrency: 6 });
  const deadUrls = batchResult.results
    .filter(r => r.category === 'dead' || r.category === 'server_error' || r.category === 'network_error')
    .map(r => r.url);

  console.log(`Discovered ${ansi.red(deadUrls.length)} dead links out of ${links.length} total.`);

  const cleaned = cleanContent(raw, deadUrls);
  fs.writeFileSync(outPath, cleaned, 'utf8');

  console.log(`${ansi.bold(ansi.green('Sanitized file written to:'))} ${outPath}\n`);
}

function handleUi(args) {
  let port = 3024;
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1 && args[portIdx + 1]) {
    const p = parseInt(args[portIdx + 1], 10);
    if (!isNaN(p) && p > 0) port = p;
  }
  startServer({ port });
}

function formatCategoryBadge(category) {
  switch (category) {
    case 'alive':
      return ansi.bgGreen(ansi.black(' 200 OK '));
    case 'redirect':
      return ansi.bgYellow(ansi.black(' 3xx RED '));
    case 'dead':
      return ansi.bgRed(ansi.white(' 4xx DEAD '));
    case 'server_error':
      return ansi.bgMagenta(ansi.white(' 5xx ERR '));
    default:
      return ansi.bgBlue(ansi.white(' NET ERR '));
  }
}

function run(argv) {
  const args = argv.slice(2);
  const command = args[0] || 'help';
  const commandArgs = args.slice(1);

  switch (command) {
    case 'scan':
      handleScan(commandArgs);
      break;
    case 'check':
      handleCheck(commandArgs);
      break;
    case 'clean':
      handleClean(commandArgs);
      break;
    case 'ui':
    case 'serve':
      handleUi(commandArgs);
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    case '--version':
    case '-v':
      console.log('linkrot-scanner v1.0.0');
      break;
    default:
      console.error(ansi.red(`Unknown command: "${command}"`));
      printHelp();
      process.exit(1);
  }
}

module.exports = {
  run
};
