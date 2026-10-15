/**
 * LinkRot-Scanner - Web Studio Client Application
 */

let scanResults = [];
let activeFilter = 'all';

const sampleMarkdown = `# Awesome Developer Resources 🚀

Here is a curated collection of developer bookmarks:

- [GitHub Main Portal](https://github.com) - The world's leading developer platform
- [Node.js Official Documentation](https://nodejs.org) - Asynchronous event-driven JavaScript runtime
- [Vite Next Generation Tooling](https://vitejs.dev) - Frontend dev server
- [Definitely Dead 404 Example](https://httpstat.us/404) - Simulated 404 Not Found endpoint
- [Simulated 500 Server Error](https://httpstat.us/500) - Simulated internal error
- [Legacy HTTP Redirection](http://github.com) - Automatically redirects to HTTPS
- [MDN Web Docs](https://developer.mozilla.org) - Web standards and APIs
- [Dead Nonexistent Domain](https://this-domain-surely-does-not-exist-123456.com) - DNS resolution failure
`;

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadSample();
});

function setupEventListeners() {
  const btnLoadSample = document.getElementById('btnLoadSample');
  const btnStartScan = document.getElementById('btnStartScan');
  const btnCleanFile = document.getElementById('btnCleanFile');
  const btnExportReport = document.getElementById('btnExportReport');
  const btnUploadFile = document.getElementById('btnUploadFile');
  const fileInput = document.getElementById('fileInput');
  const sourceInput = document.getElementById('sourceContentInput');

  btnLoadSample.addEventListener('click', loadSample);
  btnStartScan.addEventListener('click', startScan);
  btnCleanFile.addEventListener('click', handleCleanFile);
  btnExportReport.addEventListener('click', handleExportReport);

  btnUploadFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileUpload);

  // Drag and drop
  sourceInput.addEventListener('dragover', e => e.preventDefault());
  sourceInput.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      readFile(e.dataTransfer.files[0]);
    }
  });

  // Filter tabs
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderTable();
    });
  });
}

function loadSample() {
  document.getElementById('sourceContentInput').value = sampleMarkdown;
  extractAndDisplayInitial();
}

async function extractAndDisplayInitial() {
  const content = document.getElementById('sourceContentInput').value;
  if (!content) return;

  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('valTotal').textContent = data.total;
    }
  } catch (err) {
    console.error('Extract failed:', err);
  }
}

async function startScan() {
  const content = document.getElementById('sourceContentInput').value.trim();
  if (!content) {
    alert('لطفاً ابتدا متنی حاوی لینک وارد کنید.');
    return;
  }

  const concurrency = parseInt(document.getElementById('concurrencyInput').value, 10) || 5;
  const timeoutSec = parseInt(document.getElementById('timeoutInput').value, 10) || 5;

  const progressWrapper = document.getElementById('progressWrapper');
  const progressFill = document.getElementById('progressBarFill');
  const progressText = document.getElementById('progressText');
  const tableContainer = document.getElementById('tableContainer');

  progressWrapper.classList.remove('hidden');
  progressFill.style.width = '30%';
  progressText.textContent = 'در حال ارسال و آغاز پویش موازی...';
  tableContainer.innerHTML = '<div class="empty-state">پویش در حال اجرا است، لطفاً شکیبا باشید...</div>';

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        concurrency,
        timeout: timeoutSec * 1000
      })
    });

    const data = await res.json();
    if (!data.success) {
      alert(`خطا در پویش: ${data.error}`);
      return;
    }

    progressFill.style.width = '100%';
    progressText.textContent = `پویش کامل شد (${(data.report.durationMs / 1000).toFixed(2)} ثانیه)`;

    scanResults = data.report.results || [];
    updateMetrics(data.report);
    renderTable();

  } catch (err) {
    console.error('Scan error:', err);
    progressText.textContent = 'خطا در برقراری ارتباط با سرور.';
  }
}

function updateMetrics(rep) {
  document.getElementById('valTotal').textContent = rep.total;
  document.getElementById('valAlive').textContent = rep.alive;
  document.getElementById('valRedirects').textContent = rep.redirects;
  document.getElementById('valDead').textContent = rep.dead;
  document.getElementById('valErrors').textContent = rep.serverErrors + rep.networkErrors;
  document.getElementById('valScore').textContent = `${rep.healthScore}٪`;
}

function renderTable() {
  const container = document.getElementById('tableContainer');
  let filtered = scanResults;

  if (activeFilter === 'dead') {
    filtered = scanResults.filter(r => r.category === 'dead' || r.category === 'server_error' || r.category === 'network_error');
  } else if (activeFilter === 'redirect') {
    filtered = scanResults.filter(r => r.category === 'redirect');
  } else if (activeFilter === 'alive') {
    filtered = scanResults.filter(r => r.category === 'alive');
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">هیچ لینکی در این دسته‌بندی یافت نشد.</div>';
    return;
  }

  let html = `
    <table class="links-table">
      <thead>
        <tr>
          <th>وضعیت</th>
          <th>کد</th>
          <th>عنوان</th>
          <th>آدرس (URL)</th>
          <th>تاخیر / جزئیات</th>
        </tr>
      </thead>
      <tbody>
  `;

  filtered.forEach(r => {
    const badgeText = r.category === 'alive' ? '200 OK' :
      r.category === 'redirect' ? '3xx RED' :
      r.category === 'dead' ? '4xx DEAD' :
      r.category === 'server_error' ? '5xx ERR' : 'NET ERR';

    const note = r.error ? `<span class="text-red">${r.error}</span>` :
      r.redirectUrl ? `<span class="text-yellow">&rarr; ${r.redirectUrl}</span>` :
      `<span class="link-latency">${r.latencyMs}ms</span>`;

    html += `
      <tr>
        <td><span class="status-tag ${r.category}">${badgeText}</span></td>
        <td><code>${r.statusCode || '---'}</code></td>
        <td class="link-title" title="${escapeHtml(r.title || '')}">${escapeHtml(r.title || 'Untitled')}</td>
        <td><a href="${r.url}" target="_blank" class="link-url" title="${r.url}">${r.url}</a></td>
        <td>${note}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

async function handleCleanFile() {
  const content = document.getElementById('sourceContentInput').value;
  if (!content || scanResults.length === 0) {
    alert('ابتدا باید یک بار پویش را اجرا کنید تا لینک‌های مرده شناسایی شوند.');
    return;
  }

  const deadUrls = scanResults
    .filter(r => r.category === 'dead' || r.category === 'server_error' || r.category === 'network_error')
    .map(r => r.url);

  if (deadUrls.length === 0) {
    alert('تبریک! هیچ لینک مرده‌ای در این سند وجود ندارد.');
    return;
  }

  try {
    const res = await fetch('/api/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, deadUrls })
    });
    const data = await res.json();
    if (!data.success) return;

    downloadText(data.cleaned, 'sanitized_links_cleaned.md');
    alert(`تعداد ${deadUrls.length} لینک مرده با موفقیت حذف شد و فایل تمیز دانلود گردید.`);
  } catch (err) {
    console.error('Clean error:', err);
  }
}

function handleExportReport() {
  if (scanResults.length === 0) {
    alert('ابتدا پویش را اجرا کنید تا گزارش ایجاد شود.');
    return;
  }

  let md = `# LinkRot-Scanner Audit Report 📊\n\n`;
  md += `| Status | Code | Title | URL | Reason |\n`;
  md += `| :--- | :---: | :--- | :--- | :--- |\n`;

  scanResults.forEach(r => {
    const code = r.statusCode || '-';
    const reason = r.error || (r.redirectUrl ? `-> ${r.redirectUrl}` : `${r.latencyMs}ms`);
    md += `| ${r.category} | ${code} | ${r.title || ''} | ${r.url} | ${reason} |\n`;
  });

  downloadText(md, 'linkrot_audit_report.md');
}

function handleFileUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (file) readFile(file);
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = evt => {
    document.getElementById('sourceContentInput').value = evt.target.result;
    extractAndDisplayInitial();
  };
  reader.readAsText(file);
}

function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
