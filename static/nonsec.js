const charts = {};
const PALETTE = ['#1e6ff1','#2ed47a','#ffb547','#ff6b81','#9d7bff','#4fd1c5','#f783ac','#ffd43b','#74c0fc','#b2f2bb'];

if (window.ChartDataLabels) Chart.register(ChartDataLabels);
Chart.defaults.color = '#7898c4';
Chart.defaults.borderColor = 'rgba(62,139,255,.07)';
Chart.defaults.font.family = "'Inter', 'Segoe UI', Roboto, Arial, sans-serif";

let currentWidgets = [];
let cascading = false;

// ── Helpers ─────────────────────────────────────────────
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function isNumericColumn(rows, col) {
    return rows.length > 0 && rows.every(r => r[col] === null || typeof r[col] === 'number');
}

function formatPivotDate(dateStr) {
    return dateStr;
}

function pickLabelColumn(columns, rows) {
    let col = columns.find(c => /label/i.test(c));
    if (col) return col;
    col = columns.find(c => !isNumericColumn(rows, c));
    return col || columns[0];
}

function pickValueColumn(columns, rows, excludeCol) {
    let col = columns.find(c => c !== excludeCol && /^count/i.test(c));
    if (col) return col;
    col = columns.find(c => c !== excludeCol && isNumericColumn(rows, c));
    return col || columns.find(c => c !== excludeCol) || columns[0];
}

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
    let legendHtml = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    legendHtml += '<tr style="border-bottom:1px solid rgba(80,130,255,.15);">' +
        '<th style="text-align:left;padding:6px 8px;color:#2ee8ff;font-size:10px;letter-spacing:.5px;">NAME</th>' +
        '<th style="text-align:right;padding:6px 8px;color:#2ee8ff;font-size:10px;">COUNT</th>' +
        '<th style="text-align:right;padding:6px 8px;color:#2ee8ff;font-size:10px;">%</th></tr>';
    rows.forEach((r, i) => {
        const val = r[valueCol] || 0;
        const pct = total ? ((val / total) * 100).toFixed(1) : '0.0';
        const color = PALETTE[i % PALETTE.length];
        legendHtml += `<tr style="border-bottom:1px solid rgba(80,130,255,.06);">` +
            `<td style="padding:5px 8px;color:#c8dcf8;white-space:nowrap;">` +
            `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${color};margin-right:8px;vertical-align:middle;"></span>${r[labelCol]}</td>` +
            `<td style="text-align:right;padding:5px 8px;color:#e8f0ff;font-weight:600;">${val.toLocaleString()}</td>` +
            `<td style="text-align:right;padding:5px 8px;color:#ffd666;font-weight:700;">${pct}%</td></tr>`;
    });
    legendHtml += '</table>';
    legendDiv.innerHTML = legendHtml;
    wrapper.appendChild(legendDiv);
    body.appendChild(wrapper);

    destroyChart(widgetId);
    charts[widgetId] = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: rows.map(r => r[labelCol]),
            datasets: [{
                data: rows.map(r => r[valueCol]),
                backgroundColor: PALETTE,
                borderColor: '#060e24',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '55%',
            plugins: {
                legend: { display: false },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 11 },
                    formatter: (value) => {
                        const pct = total ? ((value / total) * 100).toFixed(1) : '0';
                        return pct >= 5 ? pct + '%' : '';
                    }
                }
            }
        }
    });
}

function renderBar(body, widgetId, columns, rows) {
    body.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;height:320px;';
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${widgetId}`;
    wrapper.appendChild(canvas);
    body.appendChild(wrapper);

    const labelCol = pickLabelColumn(columns, rows);
    const valueCol = pickValueColumn(columns, rows, labelCol);

    destroyChart(widgetId);
    charts[widgetId] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: rows.map(r => r[labelCol]),
            datasets: [{
                label: valueCol,
                data: rows.map(r => r[valueCol]),
                backgroundColor: PALETTE.map(c => c + 'cc'),
                borderColor: PALETTE,
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 24 } },
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'top',
                    color: '#ffd666',
                    font: { weight: '700', size: 11 },
                    formatter: (v) => v ? v.toLocaleString() : ''
                }
            },
            scales: {
                y: { beginAtZero: true },
                x: { ticks: { color: '#8daad4', font: { size: 10 } } }
            }
        }
    });
}

function renderTable(body, columns, rows) {
    let html = '<div class="table-responsive" style="max-height:500px;overflow:auto;scrollbar-width:thin;scrollbar-color:#3a7bd5 #060e24;"><table class="table table-sm widget-table">';
    html += '<thead><tr>' + columns.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach(row => {
        html += '<tr>' + columns.map(c => `<td>${row[c] ?? ''}</td>`).join('') + '</tr>';
    });
    html += '</tbody></table></div>';
    body.innerHTML = html;
}

function renderTop10Table(body, columns, rows) {
    if (!rows.length) { body.innerHTML = '<div style="color:var(--text-muted);padding:20px">No data</div>'; return; }

    const regionCol = columns.find(c => /region/i.test(c)) || columns[0];
    const nameCol = columns.find(c => /ase/i.test(c)) || columns[1];
    const valueCol = columns.find(c => c !== regionCol && c !== nameCol) || columns[2];

    const regions = [...new Set(rows.map(r => r[regionCol]))].sort();

    let html = '<div style="display:flex;flex-wrap:wrap;gap:16px;">';

    regions.forEach(region => {
        const regionRows = rows.filter(r => r[regionCol] === region).slice(0, 10);
        html += '<div style="flex:1;min-width:280px;">';
        html += `<div style="font-size:12px;font-weight:700;color:var(--cyan,#2ee8ff);margin-bottom:8px;padding:6px 12px;background:rgba(46,232,255,.06);border-radius:8px;text-align:center;">${region}</div>`;
        html += '<table class="table table-sm widget-table" style="margin-bottom:0;">';
        html += `<thead><tr><th style="width:30px;">#</th><th>${nameCol}</th><th style="text-align:right;">${valueCol}</th></tr></thead><tbody>`;
        regionRows.forEach((row, i) => {
            const medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : `${i + 1}`;
            html += `<tr><td style="text-align:center;">${medal}</td><td>${row[nameCol]}</td><td style="text-align:right;font-weight:700;color:#ffd666;">${(row[valueCol] ?? 0).toLocaleString()}</td></tr>`;
        });
        html += '</tbody></table></div>';
    });

    html += '</div>';
    body.innerHTML = html;
}

function renderGenericPivot(body, rows, rowKey, headerLabel) {
    if (!rows.length) { body.innerHTML = '<div style="color:var(--text-muted);padding:20px">No data</div>'; return; }

    const dateSet = new Set();
    const catSet = new Set();
    rows.forEach(r => { dateSet.add(r.date); catSet.add(r[rowKey]); });

    const dates = Array.from(dateSet).sort();
    const categories = Array.from(catSet).sort();

    const map = {};
    rows.forEach(r => { map[`${r[rowKey]}__${r.date}`] = r.cnt; });

    let html = '<div class="pivot-wrapper"><table class="pivot-table"><thead><tr>';
    html += `<th class="row-header">${headerLabel}</th>`;
    dates.forEach(d => { html += `<th>${formatPivotDate(d)}</th>`; });
    html += '</tr></thead><tbody>';

    const colTotals = {};
    dates.forEach(d => colTotals[d] = 0);

    categories.forEach(cat => {
        html += `<tr><td class="row-label">${cat}</td>`;
        dates.forEach(d => {
            const v = map[`${cat}__${d}`] || 0;
            colTotals[d] += v;
            html += `<td>${v > 0 ? v.toLocaleString() : ''}</td>`;
        });
        html += '</tr>';
    });

    html += '<tr class="total-row"><td class="row-label">Total</td>';
    dates.forEach(d => { html += `<td>${colTotals[d].toLocaleString()}</td>`; });
    html += '</tr></tbody></table></div>';

    body.innerHTML = html;
}

function renderWidgetBody(widget, columns, rows) {
    const body = document.getElementById(`widget-body-${widget.id}`);
    switch (widget.chart_type) {
        case 'pie':
            renderPie(body, widget.id, columns, rows);
            break;
        case 'bar':
            renderBar(body, widget.id, columns, rows);
            break;
        case 'table':
            renderTable(body, columns, rows);
            break;
        case 'top10_table':
            renderTop10Table(body, columns, rows);
            break;
        case 'pivot_location_in':
            renderGenericPivot(body, rows, 'location', 'CHECK IN LOCATION');
            break;
        case 'pivot_location_out':
            renderGenericPivot(body, rows, 'location', 'CHECK OUT LOCATION');
            break;
        case 'pivot_workhour':
            renderGenericPivot(body, rows, 'workhour', 'WORKING HOUR');
            break;
        default:
            body.innerHTML = '<div style="color:var(--text-muted);padding:20px">Unknown chart type</div>';
    }
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

    const date = document.getElementById('date-filter')?.value;
    if (date && date !== 'All') p.set('date', date);

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

// ── Cascading filter helpers ────────────────────────────
function populateSelect(sel, values) {
    const current = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    values.forEach(v => {
        const o = document.createElement('option');
        o.value = o.textContent = v;
        sel.appendChild(o);
    });
    if (values.includes(current)) sel.value = current;
    else sel.value = 'All';
}

function updateMultiDropdown(menuId, btnId, allLabel, optionClass, availableValues, reset) {
    const menu = document.getElementById(menuId);
    const btn  = document.getElementById(btnId);
    if (!menu || !btn) return;

    const currentChecked = reset ? new Set() : new Set(getCheckedValues(menuId));

    menu.innerHTML = `
        <li class="px-2">
            <div class="form-check">
                <input class="form-check-input" type="checkbox" id="${menuId}-all" ${currentChecked.size === 0 ? 'checked' : ''}>
                <label class="form-check-label" for="${menuId}-all">${allLabel}</label>
            </div>
        </li>
        <li><hr></li>
        ${availableValues.map((v, i) => `
        <li class="px-2">
            <div class="form-check">
                <input class="form-check-input ${optionClass} multi-option" type="checkbox"
                       id="${menuId}-${i}" value="${v}" ${currentChecked.has(v) ? 'checked' : ''}>
                <label class="form-check-label" for="${menuId}-${i}">${v}</label>
            </div>
        </li>`).join('')}
    `;

    const allCb = document.getElementById(`${menuId}-all`);
    const opts  = Array.from(menu.querySelectorAll(`.${optionClass}`));

    const anyChecked = opts.some(c => c.checked);
    if (anyChecked) allCb.checked = false;
    else allCb.checked = true;

    function updateLabel() {
        const sel = opts.filter(c => c.checked);
        btn.childNodes[0].textContent = sel.length === 0
            ? allLabel
            : sel.length === 1 ? sel[0].value : `${sel.length} Selected`;
    }
    updateLabel();

    allCb.addEventListener('change', () => {
        if (allCb.checked) opts.forEach(c => c.checked = false);
        updateLabel();
        onFilterChange();
    });

    opts.forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) allCb.checked = false;
            else if (opts.every(c => !c.checked)) allCb.checked = true;
            updateLabel();
            onFilterChange();
        });
    });
}

async function refreshFilterOptions() {
    const params = buildParams();
    const opts = await (await fetch(`/api/nonsec/filter-options?${params.toString()}`)).json();

    cascading = true;
    populateSelect(document.getElementById('region-filter'), opts.regions);
    populateSelect(document.getElementById('zse-filter'), opts.zses);
    populateSelect(document.getElementById('ase-filter'), opts.ases);
    populateSelect(document.getElementById('date-filter'), opts.dates);
    populateSelect(document.getElementById('userid-dropdown'), opts.ase_ho_ids);
    updateMultiDropdown('channel-filter-menu', 'channel-filter-btn', 'All Channels', 'channel-option', opts.channels);
    updateMultiDropdown('tier-filter-menu',    'tier-filter-btn',    'All Tiers',    'tier-option',    opts.tiers);
    cascading = false;
}

function onFilterChange() {
    if (cascading) return;
    refreshFilterOptions();
    reloadWidgetData();
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

    const dateSel = document.getElementById('date-filter');
    opts.dates.forEach(d => { const o = document.createElement('option'); o.value = o.textContent = d; dateSel.appendChild(o); });
    dateSel.addEventListener('change', onFilterChange);

    updateMultiDropdown('channel-filter-menu', 'channel-filter-btn', 'All Channels', 'channel-option', opts.channels);
    updateMultiDropdown('tier-filter-menu',    'tier-filter-btn',    'All Tiers',    'tier-option',    opts.tiers);

    // Date range filters
    ['date-from', 'date-to'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', onFilterChange);
    });

    // User ID dropdown
    const uidDropdown = document.getElementById('userid-dropdown');
    opts.ase_ho_ids.forEach(u => {
        const o = document.createElement('option');
        o.value = o.textContent = u;
        uidDropdown.appendChild(o);
    });
    uidDropdown.addEventListener('change', () => {
        const val = uidDropdown.value;
        const uidInput = document.getElementById('user-id-filter');
        if (val && val !== 'All') {
            uidInput.value = val;
        } else {
            uidInput.value = '';
        }
        onFilterChange();
    });

    // User ID search (debounced)
    const uidInput = document.getElementById('user-id-filter');
    if (uidInput) {
        let timer;
        uidInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                uidDropdown.value = 'All';
                onFilterChange();
            }, 600);
        });
    }
}

async function clearAllFilters() {
    document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
        const btn = menu.previousElementSibling;
        if (btn) bootstrap.Dropdown.getOrCreateInstance(btn).hide();
    });

    document.getElementById('region-filter').value = 'All';
    document.getElementById('zse-filter').value = 'All';
    document.getElementById('ase-filter').value = 'All';
    document.getElementById('date-filter').value = 'All';
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    document.getElementById('userid-dropdown').value = 'All';
    document.getElementById('user-id-filter').value = '';

    const opts = await (await fetch('/api/nonsec/filter-options')).json();
    populateSelect(document.getElementById('region-filter'), opts.regions);
    populateSelect(document.getElementById('zse-filter'), opts.zses);
    populateSelect(document.getElementById('ase-filter'), opts.ases);
    populateSelect(document.getElementById('date-filter'), opts.dates);
    populateSelect(document.getElementById('userid-dropdown'), opts.ase_ho_ids);
    updateMultiDropdown('channel-filter-menu', 'channel-filter-btn', 'All Channels', 'channel-option', opts.channels, true);
    updateMultiDropdown('tier-filter-menu',    'tier-filter-btn',    'All Tiers',    'tier-option',    opts.tiers,    true);

    reloadWidgetData();
}

async function loadDashboard() {
    const container = document.getElementById('dashboard-container');
    container.innerHTML = '';

    currentWidgets = await (await fetch('/api/nonsec/widgets')).json();

    currentWidgets.forEach(widget => {
        const col = document.createElement('div');
        col.id = `widget-col-${widget.id}`;
        col.className = `${widgetColumnClass(widget.chart_type)} mb-2`;
        col.innerHTML = `
            <div class="dashboard-card h-100">
                <div class="card-header">${widget.widget_name}</div>
                <div class="card-body" id="widget-body-${widget.id}">
                    <div style="color:var(--text-muted);font-size:13px;padding:20px 0;">Loading...</div>
                </div>
            </div>`;
        container.appendChild(col);
        loadWidget(widget);
    });
}

initAllFilters();
loadDashboard();
