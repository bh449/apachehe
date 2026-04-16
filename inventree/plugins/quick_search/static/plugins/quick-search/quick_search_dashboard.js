/**
 * Quick Search Dashboard Widget for InvenTree.
 * Renders a search input with barcode/IPN/name search capability.
 * Runs inside InvenTree's React PUI as a dashboard item.
 */

function getCsrf() {
  const v = '; ' + document.cookie;
  const p = v.split('; csrftoken=');
  if (p.length === 2) return p.pop().split(';').shift();
  return '';
}

async function apiGet(url) {
  const r = await fetch(url, {
    headers: { 'Accept': 'application/json', 'X-CSRFToken': getCsrf() }
  });
  if (!r.ok) throw new Error('API ' + r.status);
  return r.json();
}

async function apiPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRFToken': getCsrf() },
    body: JSON.stringify(body)
  });
  return r.json();
}

export function renderDashboardItem(target, data) {
  if (!target) return;

  target.innerHTML = `
    <div style="font-family:var(--mantine-font-family,system-ui,-apple-system,sans-serif)">
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input id="qs-input" type="text"
          placeholder="输入 IPN、UPC 条码或产品名称..."
          autocomplete="off"
          style="flex:1;padding:8px 12px;border:1px solid var(--mantine-color-gray-4,#ced4da);
                 border-radius:var(--mantine-radius-default,4px);font-size:14px;
                 outline:none;background:var(--mantine-color-body,#fff);
                 color:var(--mantine-color-text,#212529)"
        />
        <button id="qs-btn"
          style="padding:8px 16px;border:none;border-radius:var(--mantine-radius-default,4px);
                 background:var(--mantine-primary-color-filled,#228be6);color:#fff;
                 font-size:14px;cursor:pointer;white-space:nowrap">
          搜索
        </button>
      </div>
      <div id="qs-status" style="font-size:12px;color:var(--mantine-color-dimmed,#868e96);margin-bottom:8px"></div>
      <div id="qs-results" style="max-height:360px;overflow-y:auto"></div>
    </div>
  `;

  const input = target.querySelector('#qs-input');
  const btn = target.querySelector('#qs-btn');
  const status = target.querySelector('#qs-status');
  const results = target.querySelector('#qs-results');
  let timer = null;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    if (!input.value.trim()) { clear(); return; }
    timer = setTimeout(search, 350);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(timer); search(); }
    if (e.key === 'Escape') clear();
  });
  btn.addEventListener('click', search);

  function clear() {
    input.value = '';
    status.textContent = '';
    results.innerHTML = '';
    input.focus();
  }

  async function search() {
    const q = input.value.trim();
    if (!q) return;
    status.textContent = '搜索中...';
    results.innerHTML = '';
    let parts = [];

    try {
      // 1. Barcode
      try {
        const bc = await apiPost('/api/barcode/', { barcode: q });
        if (bc.part && bc.part.instance) parts = [bc.part.instance];
      } catch(e) {}

      // 2. Exact IPN
      if (!parts.length) {
        const r = await apiGet('/api/part/?IPN=' + encodeURIComponent(q) + '&limit=1');
        const res = r.results || r;
        if (res.length) parts = res;
      }

      // 3. Name/keyword
      if (!parts.length) {
        const r = await apiGet('/api/part/?search=' + encodeURIComponent(q) + '&limit=10&active=true');
        parts = r.results || r;
      }

      if (!parts.length) {
        status.textContent = '未找到与 "' + q + '" 相关的产品';
        return;
      }
      status.textContent = '找到 ' + parts.length + ' 个产品';
      renderParts(parts);
    } catch(e) {
      status.textContent = '搜索出错: ' + e.message;
    }
  }

  async function renderParts(parts) {
    const cards = await Promise.all(parts.map(async (p) => {
      let stockInfo = '';
      try {
        const st = await apiGet('/api/stock/?part=' + p.pk + '&limit=50&location_detail=true');
        const items = st.results || st;
        const byLoc = {};
        items.forEach(s => {
          const k = s.location || 'none';
          const n = s.location_detail ? (s.location_detail.pathstring || s.location_detail.name) : '未分配';
          if (!byLoc[k]) byLoc[k] = { name: n, qty: 0 };
          byLoc[k].qty += parseFloat(s.quantity);
        });
        const total = Object.values(byLoc).reduce((s, v) => s + v.qty, 0);
        const isLow = p.minimum_stock > 0 && total <= p.minimum_stock;

        const locTags = Object.values(byLoc).map(l =>
          '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;' +
          'border:1px solid var(--mantine-color-gray-3,#dee2e6);margin:2px 4px 2px 0;' +
          'background:var(--mantine-color-gray-0,#f8f9fa)">' +
          l.name.split('/').pop() + ': ' + l.qty + '</span>'
        ).join('');

        const badgeBg = isLow ? '#fa5252' : 'var(--mantine-color-gray-6,#868e96)';
        stockInfo = '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:12px;' +
          'color:#fff;background:' + badgeBg + '">' + total + ' ' + (p.units || 'pcs') + '</span>' +
          (isLow ? '<span style="color:#fa5252;font-size:11px;font-weight:600">⚠ 低于安全库存</span>' : '') +
          locTags + '</div>';
      } catch(e) {
        stockInfo = '<span style="font-size:12px;color:var(--mantine-color-dimmed,#868e96)">库存查询失败</span>';
      }

      return '<div style="padding:12px;border:1px solid var(--mantine-color-gray-3,#dee2e6);' +
        'border-radius:var(--mantine-radius-default,4px);margin-bottom:8px;' +
        'background:var(--mantine-color-body,#fff)">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
          '<div style="min-width:0">' +
            '<a href="/web/part/' + p.pk + '" style="font-size:15px;font-weight:600;' +
            'color:var(--mantine-primary-color-filled,#228be6);text-decoration:none">' + p.name + '</a>' +
            '<div style="font-size:12px;color:var(--mantine-color-dimmed,#868e96);font-family:monospace;margin-top:2px">' +
            (p.IPN || '—') + '</div>' +
            (p.description ? '<div style="font-size:12px;color:var(--mantine-color-dimmed,#868e96);margin-top:4px">' + p.description + '</div>' : '') +
          '</div>' +
          '<a href="/web/part/' + p.pk + '" style="padding:4px 12px;border-radius:4px;font-size:13px;' +
          'border:1px solid var(--mantine-primary-color-filled,#228be6);' +
          'color:var(--mantine-primary-color-filled,#228be6);text-decoration:none;white-space:nowrap;margin-left:12px">查看</a>' +
        '</div>' +
        stockInfo +
      '</div>';
    }));

    results.innerHTML = cards.join('');
  }
}
