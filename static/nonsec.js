const charts = {};
const PALETTE = ['#1e6ff1','#2ed47a','#ffb547','#ff6b81','#9d7bff','#4fd1c5','#f783ac','#ffd43b','#74c0fc','#b2f2bb'];

if (window.ChartDataLabels) Chart.register(ChartDataLabels);
Chart.defaults.color = '#7898c4';
Chart.defaults.borderColor = 'rgba(62,139,255,.07)';
Chart.defaults.font.family = "'Inter', 'Segoe UI', Roboto, Arial, sans-serif";

let currentWidgets = [];
let cascading = false;
const TOP10_RT_ID = 18;
const TOP10_9H_ID = 19;

function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
function isNumericColumn(rows, col) { return rows.length > 0 && rows.every(r => r[col] === null || typeof r[col] === 'number'); }
function pickLabelColumn(columns, rows) { let c = columns.find(c => /label/i.test(c)); if (c) return c; c = columns.find(c => !isNumericColumn(rows, c)); return c || columns[0]; }
function pickValueColumn(columns, rows, ex) { let c = columns.find(c => c !== ex && /^count/i.test(c)); if (c) return c; c = columns.find(c => c !== ex && isNumericColumn(rows, c)); return c || columns.find(c => c !== ex) || columns[0]; }

// ── Renderers ───────────────────────────────────────────
function renderPie(body, widgetId, columns, rows) {
    body.innerHTML = '';
    const labelCol = pickLabelColumn(columns, rows);
    const valueCol = pickValueColumn(columns, rows, labelCol);
    const total = rows.reduce((s, r) => s + (r[valueCol] || 0), 0);
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;gap:20px;flex-wrap:wrap;';
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'position:relative;width:240px;height:240px;flex-shrink:0;';
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${widgetId}`;
    canvasWrap.appendChild(canvas);
    wrapper.appendChild(canvasWrap);
    const legendDiv = document.createElement('div');
    legendDiv.style.cssText = 'flex:1;min-width:200px;';
    let lh = '<table style="width:100%;border-collapse:collapse;font-size:12px;"><tr style="border-bottom:1px solid rgba(80,130,255,.15);"><th style="text-align:left;padding:6px 8px;color:#2ee8ff;font-size:10px;">NAME</th><th style="text-align:right;padding:6px 8px;color:#2ee8ff;font-size:10px;">COUNT</th><th style="text-align:right;padding:6px 8px;color:#2ee8ff;font-size:10px;">%</th></tr>';
    rows.forEach((r, i) => { const v = r[valueCol]||0; const p = total?((v/total)*100).toFixed(1):'0.0'; const c = PALETTE[i%PALETTE.length]; lh += `<tr style="border-bottom:1px solid rgba(80,130,255,.06);"><td style="padding:5px 8px;color:#c8dcf8;white-space:nowrap;"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-right:8px;vertical-align:middle;"></span>${r[labelCol]}</td><td style="text-align:right;padding:5px 8px;color:#e8f0ff;font-weight:600;">${v.toLocaleString()}</td><td style="text-align:right;padding:5px 8px;color:#ffd666;font-weight:700;">${p}%</td></tr>`; });
    lh += '</table>';
    legendDiv.innerHTML = lh;
    wrapper.appendChild(legendDiv);
    body.appendChild(wrapper);
    destroyChart(widgetId);
    charts[widgetId] = new Chart(canvas, { type:'doughnut', data:{labels:rows.map(r=>r[labelCol]),datasets:[{data:rows.map(r=>r[valueCol]),backgroundColor:PALETTE,borderColor:'#060e24',borderWidth:2}]}, options:{responsive:true,maintainAspectRatio:true,cutout:'55%',plugins:{legend:{display:false},datalabels:{color:'#fff',font:{weight:'bold',size:11},formatter:(v)=>{const p=total?((v/total)*100).toFixed(1):'0';return p>=5?p+'%':'';}}}} });
}

function renderBar(body, widgetId, columns, rows) {
    body.innerHTML = '';
    const w = document.createElement('div'); w.style.cssText = 'position:relative;height:320px;';
    const canvas = document.createElement('canvas'); canvas.id = `chart-${widgetId}`;
    w.appendChild(canvas); body.appendChild(w);
    const lc = pickLabelColumn(columns, rows); const vc = pickValueColumn(columns, rows, lc);
    destroyChart(widgetId);
    charts[widgetId] = new Chart(canvas, { type:'bar', data:{labels:rows.map(r=>r[lc]),datasets:[{label:vc,data:rows.map(r=>r[vc]),backgroundColor:PALETTE.map(c=>c+'cc'),borderColor:PALETTE,borderWidth:1,borderRadius:6}]}, options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24}},plugins:{legend:{display:false},datalabels:{anchor:'end',align:'top',color:'#ffd666',font:{weight:'700',size:11},formatter:v=>v?v.toLocaleString():''}},scales:{y:{beginAtZero:true},x:{ticks:{color:'#8daad4',font:{size:10}}}}} });
}

function renderTable(body, columns, rows, widgetId) {
    body.innerHTML = '';
    // Search + Export bar for ASE detail table
    if (widgetId === 11) {
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center;';
        toolbar.innerHTML = `
            <input type="text" id="ase-table-search" placeholder="Search in table..."
                style="background:rgba(4,7,26,.85);color:#e8f0ff;border:1px solid rgba(58,123,213,.28);border-radius:8px;padding:6px 12px;font-size:12px;flex:1;min-width:180px;outline:none;">
            <button onclick="exportTableExcel()" style="background:rgba(46,212,122,.1);border:1px solid rgba(46,212,122,.3);color:#2ed47a;border-radius:8px;padding:6px 14px;font-size:11px;font-weight:600;cursor:pointer;">Export Excel</button>
            <button onclick="exportTableImage(${widgetId})" style="background:rgba(46,232,255,.1);border:1px solid rgba(46,232,255,.3);color:#2ee8ff;border-radius:8px;padding:6px 14px;font-size:11px;font-weight:600;cursor:pointer;">Export Image</button>`;
        body.appendChild(toolbar);
    }

    const wrap = document.createElement('div');
    wrap.id = widgetId === 11 ? 'ase-detail-wrap' : '';
    wrap.className = 'table-responsive';
    wrap.style.cssText = 'max-height:500px;overflow:auto;scrollbar-width:thin;scrollbar-color:#3a7bd5 #060e24;';
    const dateCol = columns.find(c => /date/i.test(c));
    if (dateCol) {
        rows.sort((a, b) => {
            const da = new Date(a[dateCol] || ''), db = new Date(b[dateCol] || '');
            return da - db;
        });
    }
    let html = '<table class="table table-sm widget-table" id="ase-detail-table">';
    html += '<thead><tr>' + columns.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach(row => { html += '<tr>' + columns.map(c => `<td>${row[c] ?? ''}</td>`).join('') + '</tr>'; });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    body.appendChild(wrap);

    if (widgetId === 11) {
        const searchInput = document.getElementById('ase-table-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const q = searchInput.value.toLowerCase();
                const trs = wrap.querySelectorAll('tbody tr');
                trs.forEach(tr => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; });
            });
        }
    }
}

function renderTop10Table(body, columns, rows, widgetId) {
    // If user is searching and not in top 10, hide this widget
    const uid = document.getElementById('user-id-filter')?.value?.trim();
    if (uid) {
        const nameCol = columns.find(c => /ase/i.test(c)) || columns[1];
        const userInList = rows.some(r => (r[nameCol] || '').toLowerCase().includes(uid.toLowerCase()));
        if (!userInList) {
            body.innerHTML = '<div style="color:var(--text-muted);padding:12px;font-size:12px;text-align:center;">Searched user not in Top 10</div>';
            const col = document.getElementById(`widget-col-${widgetId}`);
            if (col) col.style.display = 'none';
            return;
        }
    }

    const col = document.getElementById(`widget-col-${widgetId}`);
    if (col) col.style.display = '';

    if (!rows.length) { body.innerHTML = '<div style="color:var(--text-muted);padding:20px">No data</div>'; return; }
    const regionCol = columns.find(c => /region/i.test(c)) || columns[0];
    const nameCol = columns.find(c => /ase/i.test(c)) || columns[1];
    const valueCol = columns.find(c => c !== regionCol && c !== nameCol) || columns[2];
    const regions = [...new Set(rows.map(r => r[regionCol]))].sort();

    let html = '<div style="display:flex;flex-wrap:wrap;gap:16px;">';
    regions.forEach(region => {
        const rr = rows.filter(r => r[regionCol] === region).slice(0, 10);
        html += '<div style="flex:1;min-width:280px;">';
        html += `<div style="font-size:12px;font-weight:700;color:var(--cyan,#2ee8ff);margin-bottom:8px;padding:6px 12px;background:rgba(46,232,255,.06);border-radius:8px;text-align:center;">${region}</div>`;
        html += '<table class="table table-sm widget-table" style="margin-bottom:0;">';
        html += `<thead><tr><th style="width:30px;">#</th><th>${nameCol}</th><th style="text-align:right;">${valueCol}</th></tr></thead><tbody>`;
        rr.forEach((row, i) => {
            const medal = i===0?'&#129351;':i===1?'&#129352;':i===2?'&#129353;':`${i+1}`;
            const isSearched = uid && (row[nameCol]||'').toLowerCase().includes(uid.toLowerCase());
            const highlight = isSearched ? 'background:rgba(46,232,255,.1);' : '';
            html += `<tr style="${highlight}"><td style="text-align:center;">${medal}</td><td>${row[nameCol]}</td><td style="text-align:right;font-weight:700;color:#ffd666;">${(row[valueCol]??0).toLocaleString()}</td></tr>`;
        });
        html += '</tbody></table></div>';
    });
    html += '</div>';
    body.innerHTML = html;
}

function renderGenericPivot(body, rows, rowKey, headerLabel) {
    if (!rows.length) { body.innerHTML = '<div style="color:var(--text-muted);padding:20px">No data</div>'; return; }
    const dateSet = new Set(); const catSet = new Set();
    rows.forEach(r => { dateSet.add(r.date); catSet.add(r[rowKey]); });
    const dates = Array.from(dateSet).sort((a,b) => { try { return new Date(a) - new Date(b); } catch(e) { return a.localeCompare(b); } });
    const categories = Array.from(catSet).sort();
    const map = {};
    rows.forEach(r => { map[`${r[rowKey]}__${r.date}`] = r.cnt; });
    let html = '<div class="pivot-wrapper"><table class="pivot-table"><thead><tr>';
    html += `<th class="row-header">${headerLabel}</th>`;
    dates.forEach(d => { html += `<th>${d}</th>`; });
    html += '</tr></thead><tbody>';
    const colTotals = {}; dates.forEach(d => colTotals[d] = 0);
    categories.forEach(cat => { html += `<tr><td class="row-label">${cat}</td>`; dates.forEach(d => { const v = map[`${cat}__${d}`]||0; colTotals[d]+=v; html += `<td>${v>0?v.toLocaleString():''}</td>`; }); html += '</tr>'; });
    html += '<tr class="total-row"><td class="row-label">Total</td>';
    dates.forEach(d => { html += `<td>${colTotals[d].toLocaleString()}</td>`; });
    html += '</tr></tbody></table></div>';
    body.innerHTML = html;
}

function renderWidgetBody(widget, columns, rows) {
    const body = document.getElementById(`widget-body-${widget.id}`);
    switch (widget.chart_type) {
        case 'pie': renderPie(body, widget.id, columns, rows); break;
        case 'bar': renderBar(body, widget.id, columns, rows); break;
        case 'table': renderTable(body, columns, rows, widget.id); break;
        case 'top10_table': renderTop10Table(body, columns, rows, widget.id); break;
        case 'pivot_location_in': renderGenericPivot(body, rows, 'location', 'CHECK IN LOCATION'); break;
        case 'pivot_location_out': renderGenericPivot(body, rows, 'location', 'CHECK OUT LOCATION'); break;
        case 'pivot_workhour': renderGenericPivot(body, rows, 'workhour', 'WORKING HOUR'); break;
        default: body.innerHTML = '<div style="color:var(--text-muted);padding:20px">Unknown chart type</div>';
    }
}

// ── ASE Table Export ────────────────────────────────────
function exportTableExcel() {
    const table = document.getElementById('ase-detail-table');
    if (!table) return;
    let csv = '';
    table.querySelectorAll('tr').forEach(tr => {
        if (tr.style.display === 'none') return;
        const cells = [];
        tr.querySelectorAll('th,td').forEach(td => cells.push('"' + td.textContent.replace(/"/g,'""') + '"'));
        csv += cells.join(',') + '\n';
    });
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.download = 'ASE_Attendance_Detail.csv';
    link.href = URL.createObjectURL(blob);
    link.click();
}

function exportTableImage(widgetId) {
    const wrap = document.getElementById('ase-detail-wrap');
    if (!wrap || !window.html2canvas) return;
    const clone = wrap.cloneNode(true);
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.maxHeight = 'none';
    clone.querySelectorAll('tbody tr').forEach(tr => { if (tr.style.display === 'none') tr.remove(); });
    document.body.appendChild(clone);
    html2canvas(clone, { backgroundColor: '#1a1a2e', scale: 2 }).then(canvas => {
        clone.remove();
        const link = document.createElement('a');
        link.download = 'ASE_Attendance_Detail.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}

// ── Filters ─────────────────────────────────────────────
function getCheckedValues(menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return [];
    return Array.from(menu.querySelectorAll('.multi-option:checked')).map(cb => cb.value);
}

function buildParams() {
    const p = new URLSearchParams();
    const region = document.getElementById('region-filter')?.value || 'All';
    p.set('region', region);
    const zse = document.getElementById('zse-filter')?.value;
    if (zse && zse !== 'All') p.set('zse', zse);
    const ase = document.getElementById('ase-filter')?.value;
    if (ase && ase !== 'All') p.set('ase', ase);
    getCheckedValues('channel-filter-menu').forEach(v => p.append('channel', v));
    getCheckedValues('tier-filter-menu').forEach(v => p.append('tier', v));
    const df = document.getElementById('date-from')?.value;
    const dt = document.getElementById('date-to')?.value;
    if (df) p.set('date_from', df);
    if (dt) p.set('date_to', dt);
    const uid = document.getElementById('user-id-filter')?.value?.trim();
    if (uid) p.set('user_id', uid);
    return p;
}

async function loadWidget(widget) {
    const params = buildParams();
    const res = await fetch(`/api/nonsec/widget-data/${widget.id}?${params.toString()}`);
    const { columns, rows } = await res.json();
    renderWidgetBody(widget, columns, rows);
}

function widgetColumnClass(chartType) {
    if (chartType === 'pie') return 'col-md-6';
    if (chartType === 'bar') return 'col-md-6';
    return 'col-12';
}

function reloadWidgetData() {
    currentWidgets.forEach(w => loadWidget(w));
}

// ── Select helpers ──────────────────────────────────────
function populateSelect(sel, values) {
    const current = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    values.forEach(v => { const o = document.createElement('option'); o.value = o.textContent = v; sel.appendChild(o); });
    if (values.includes(current)) sel.value = current; else sel.value = 'All';
}

function updateMultiDropdown(menuId, btnId, allLabel, optionClass, values, reset) {
    const menu = document.getElementById(menuId);
    const btn = document.getElementById(btnId);
    if (!menu || !btn) return;
    const checked = reset ? new Set() : new Set(getCheckedValues(menuId));
    menu.innerHTML = `<li class="px-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="${menuId}-all" ${checked.size===0?'checked':''}><label class="form-check-label" for="${menuId}-all">${allLabel}</label></div></li><li><hr></li>` +
        values.map((v,i) => `<li class="px-2"><div class="form-check"><input class="form-check-input ${optionClass} multi-option" type="checkbox" id="${menuId}-${i}" value="${v}" ${checked.has(v)?'checked':''}><label class="form-check-label" for="${menuId}-${i}">${v}</label></div></li>`).join('');
    const allCb = document.getElementById(`${menuId}-all`);
    const opts = Array.from(menu.querySelectorAll(`.${optionClass}`));
    if (opts.some(c=>c.checked)) allCb.checked = false; else allCb.checked = true;
    function updateLabel() { const s = opts.filter(c=>c.checked); btn.childNodes[0].textContent = s.length===0?allLabel:s.length===1?s[0].value:`${s.length} Selected`; }
    updateLabel();
    allCb.addEventListener('change', () => { if(allCb.checked) opts.forEach(c=>c.checked=false); updateLabel(); onFilterChange(); });
    opts.forEach(cb => { cb.addEventListener('change', () => { if(cb.checked) allCb.checked=false; else if(opts.every(c=>!c.checked)) allCb.checked=true; updateLabel(); onFilterChange(); }); });
}

// ── Cascading filters ───────────────────────────────────
async function refreshFilterOptions() {
    const params = buildParams();
    const opts = await (await fetch(`/api/nonsec/filter-options?${params.toString()}`)).json();
    cascading = true;
    populateSelect(document.getElementById('region-filter'), opts.regions);
    populateSelect(document.getElementById('zse-filter'), opts.zses);
    populateSelect(document.getElementById('ase-filter'), opts.ases);
    const dd = document.getElementById('userid-dropdown');
    if (dd) populateSelect(dd, opts.ase_ho_ids);
    updateMultiDropdown('channel-filter-menu', 'channel-filter-btn', 'All Channels', 'channel-option', opts.channels);
    updateMultiDropdown('tier-filter-menu', 'tier-filter-btn', 'All Tiers', 'tier-option', opts.tiers);
    cascading = false;
}

function onFilterChange() {
    if (cascading) return;
    refreshFilterOptions();
    reloadWidgetData();
}

// ── Autofill / datalist setup ───────────────────────────
function setupAutofill(inputId, values) {
    const input = document.getElementById(inputId);
    if (!input) return;
    let listId = inputId + '-list';
    let dl = document.getElementById(listId);
    if (!dl) { dl = document.createElement('datalist'); dl.id = listId; document.body.appendChild(dl); input.setAttribute('list', listId); }
    dl.innerHTML = values.map(v => `<option value="${v}">`).join('');
}

// ── Init ────────────────────────────────────────────────
async function initAllFilters() {
    const opts = await (await fetch('/api/nonsec/filter-options')).json();

    const regionSel = document.getElementById('region-filter');
    opts.regions.forEach(r => { const o = document.createElement('option'); o.value = o.textContent = r; regionSel.appendChild(o); });
    regionSel.addEventListener('change', onFilterChange);

    const zseSel = document.getElementById('zse-filter');
    opts.zses.forEach(z => { const o = document.createElement('option'); o.value = o.textContent = z; zseSel.appendChild(o); });
    zseSel.addEventListener('change', onFilterChange);

    const aseSel = document.getElementById('ase-filter');
    opts.ases.forEach(a => { const o = document.createElement('option'); o.value = o.textContent = a; aseSel.appendChild(o); });
    aseSel.addEventListener('change', onFilterChange);

    updateMultiDropdown('channel-filter-menu', 'channel-filter-btn', 'All Channels', 'channel-option', opts.channels);
    updateMultiDropdown('tier-filter-menu', 'tier-filter-btn', 'All Tiers', 'tier-option', opts.tiers);

    ['date-from', 'date-to'].forEach(id => { document.getElementById(id)?.addEventListener('change', onFilterChange); });

    // User ID dropdown
    const uidDropdown = document.getElementById('userid-dropdown');
    if (uidDropdown) {
        opts.ase_ho_ids.forEach(u => { const o = document.createElement('option'); o.value = o.textContent = u; uidDropdown.appendChild(o); });
        uidDropdown.addEventListener('change', () => {
            const val = uidDropdown.value;
            document.getElementById('user-id-filter').value = (val && val !== 'All') ? val : '';
            onFilterChange();
        });
    }

    // User ID search (debounced)
    const uidInput = document.getElementById('user-id-filter');
    if (uidInput) {
        let timer;
        // Setup autofill datalist
        setupAutofill('user-id-filter', opts.ase_ho_ids);
        uidInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => { const dd = document.getElementById('userid-dropdown'); if(dd) dd.value='All'; onFilterChange(); }, 400);
        });
    }
}

async function clearAllFilters() {
    document.querySelectorAll('.dropdown-menu.show').forEach(menu => { const btn = menu.previousElementSibling; if(btn) bootstrap.Dropdown.getOrCreateInstance(btn).hide(); });
    document.getElementById('region-filter').value = 'All';
    document.getElementById('zse-filter').value = 'All';
    document.getElementById('ase-filter').value = 'All';
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    const dd = document.getElementById('userid-dropdown'); if(dd) dd.value='All';
    document.getElementById('user-id-filter').value = '';

    const opts = await (await fetch('/api/nonsec/filter-options')).json();
    populateSelect(document.getElementById('region-filter'), opts.regions);
    populateSelect(document.getElementById('zse-filter'), opts.zses);
    populateSelect(document.getElementById('ase-filter'), opts.ases);
    if(dd) populateSelect(dd, opts.ase_ho_ids);
    updateMultiDropdown('channel-filter-menu','channel-filter-btn','All Channels','channel-option',opts.channels,true);
    updateMultiDropdown('tier-filter-menu','tier-filter-btn','All Tiers','tier-option',opts.tiers,true);
    setupAutofill('user-id-filter', opts.ase_ho_ids);

    // Show top10 widgets again
    [TOP10_RT_ID, TOP10_9H_ID].forEach(id => { const c = document.getElementById(`widget-col-${id}`); if(c) c.style.display=''; });

    reloadWidgetData();
}

async function loadDashboard() {
    const container = document.getElementById('dashboard-container');
    const topaseContainer = document.getElementById('topase-container');
    container.innerHTML = '';
    topaseContainer.innerHTML = '';
    currentWidgets = await (await fetch('/api/nonsec/widgets')).json();
    currentWidgets.forEach(widget => {
        const isTopAse = (widget.id === TOP10_RT_ID || widget.id === TOP10_9H_ID);
        const col = document.createElement('div');
        col.id = `widget-col-${widget.id}`;
        col.className = `${isTopAse ? 'col-12' : widgetColumnClass(widget.chart_type)} mb-2`;
        col.innerHTML = `<div class="dashboard-card h-100"><div class="card-header">${widget.widget_name}</div><div class="card-body" id="widget-body-${widget.id}"><div style="color:var(--text-muted);font-size:13px;padding:20px 0;">Loading...</div></div></div>`;
        (isTopAse ? topaseContainer : container).appendChild(col);
        loadWidget(widget);
    });
}

initAllFilters();
loadDashboard();
