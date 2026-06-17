const charts = {};

// Extended palette — first colour (blue) for primary, then distinct hues for multi-series
const PALETTE = [
    '#1e6ff1', '#2ed47a', '#ffb547', '#ff6b81', '#9d7bff',
    '#4fd1c5', '#f783ac', '#ffd43b', '#74c0fc', '#b2f2bb'
];

const TEXT_MUTED = '#4a6899';
const GRID_COLOR = 'rgba(62,139,255,.07)';

if (window.ChartDataLabels) {
    Chart.register(ChartDataLabels);
}

Chart.defaults.color = '#7898c4';
Chart.defaults.borderColor = GRID_COLOR;
Chart.defaults.font.family = "'Segoe UI', Roboto, Arial, sans-serif";

// ── Formatting ──────────────────────────────────────────
function formatLabelValue(value) {
    if (typeof value !== 'number') return value;
    return value >= 1000 ? value.toLocaleString() : value;
}

function formatAxisLabel(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        const d = new Date(value);
        const day = d.getDate();
        const month = d.toLocaleDateString('en-US', { month: 'short' });
        const year = String(d.getFullYear()).slice(-2);
        return `${day}-${month}-${year}`;
    }
    return value;
}

function isNumericColumn(rows, col) {
    return rows.length > 0 && rows.every(r => r[col] === null || typeof r[col] === 'number');
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

function pickDateColumn(columns) {
    return columns.find(c => /date/i.test(c)) || columns[0];
}

// ── Chart destroy ────────────────────────────────────────
function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// ── Render helpers ───────────────────────────────────────
function renderKpi(body, columns, rows) {
    body.innerHTML = '';
    if (!rows.length) { body.innerHTML = '<div class="kpi-value">—</div>'; return; }
    const row = rows[0];
    columns.forEach(col => {
        const w = document.createElement('div');
        w.className = 'mb-3';
        w.innerHTML = `<div class="kpi-value">${(row[col] ?? '—').toLocaleString()}</div><div class="kpi-label">${col}</div>`;
        body.appendChild(w);
    });
}

function isImageUrl(value) {
    if (typeof value !== 'string') return false;
    return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)/i.test(value) ||
           /s3[^/]*amazonaws\.com/i.test(value);
}

function formatDateValue(value) {
    // Format ISO date strings as "1-Jun-2026"
    if (typeof value !== 'string') return null;
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(value);
    if (isNaN(d)) return null;
    const mon = d.toLocaleDateString('en-US', { month: 'short' });
    return `${d.getDate()}-${mon}-${d.getFullYear()}`;
}

function renderCellValue(value) {
    if (!value && value !== 0) return '';
    const dated = formatDateValue(String(value));
    if (dated) return dated;
    if (isImageUrl(value)) {
        return `<a href="${value}" target="_blank">
                    <img src="${value}" alt="selfie"
                         style="width:60px;height:60px;object-fit:cover;border-radius:8px;
                                border:1px solid rgba(59,130,246,.3);cursor:pointer;"
                         onerror="this.outerHTML='<span style=\'color:var(--text-muted)\'>No image</span>'">
                </a>`;
    }
    return value;
}

function renderTable(body, columns, rows) {
    let html = '<div class="table-responsive"><table class="table table-sm widget-table">';
    html += '<thead><tr>' + columns.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach(row => {
        html += '<tr>' + columns.map(c => `<td>${renderCellValue(row[c])}</td>`).join('') + '</tr>';
    });
    html += '</tbody></table></div>';
    body.innerHTML = html;
}

function renderCanvas(body, widgetId) {
    body.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;height:320px;';
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${widgetId}`;
    wrapper.appendChild(canvas);
    body.appendChild(wrapper);
    return canvas;
}

function renderPie(body, widgetId, columns, rows, chartType) {
    const canvas = renderCanvas(body, widgetId);
    const labelCol = pickLabelColumn(columns, rows);
    const valueCol = pickValueColumn(columns, rows, labelCol);

    destroyChart(widgetId);
    charts[widgetId] = new Chart(canvas, {
        type: chartType === 'doughnut' ? 'doughnut' : 'pie',
        data: {
            labels: rows.map(r => r[labelCol]),
            datasets: [{
                data: rows.map(r => r[valueCol]),
                backgroundColor: PALETTE,
                borderColor: '#0b1830',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 16, boxWidth: 12 } },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 12 },
                    formatter: formatLabelValue
                }
            }
        }
    });
}

function renderBar(body, widgetId, columns, rows) {
    const canvas = renderCanvas(body, widgetId);
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
                backgroundColor: 'rgba(30,111,241,.75)',
                borderColor: '#3d8bff',
                borderWidth: 1,
                borderRadius: 5
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
                    color: '#7898c4',
                    font: { weight: '600', size: 11 },
                    formatter: formatLabelValue
                }
            },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function renderLine(body, widgetId, columns, rows) {
    const canvas = renderCanvas(body, widgetId);
    const xCol = pickDateColumn(columns);
    const seriesCols = columns.filter(c => c !== xCol && isNumericColumn(rows, c));

    destroyChart(widgetId);
    charts[widgetId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: rows.map(r => formatAxisLabel(r[xCol])),
            datasets: seriesCols.map((col, i) => ({
                label: col,
                data: rows.map(r => r[col]),
                borderColor: PALETTE[i % PALETTE.length],
                backgroundColor: i === 0
                    ? 'rgba(30,111,241,.12)'
                    : `${PALETTE[i % PALETTE.length]}22`,
                tension: 0.35,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: PALETTE[i % PALETTE.length],
                datalabels: { display: rows.length <= 20 && i === 0 }
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 24 } },
            plugins: {
                legend: { position: 'bottom', labels: { padding: 16, boxWidth: 12 } },
                datalabels: {
                    align: 'top',
                    color: '#7898c4',
                    font: { weight: '600', size: 10 },
                    formatter: formatLabelValue
                }
            },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function formatPivotDate(isoStr) {
    const d = new Date(isoStr);
    const day = String(d.getDate()).padStart(2, '0');
    const mon = d.toLocaleDateString('en-US', { month: 'short' });
    const dow = d.toLocaleDateString('en-US', { weekday: 'short' });
    return `${day}-${mon}(${dow})`;
}

function renderPivot(body, rows) {
    if (!rows.length) { body.innerHTML = '<div style="color:var(--text-muted);padding:20px">No data</div>'; return; }

    // Collect unique dates and attendance types
    const dateSet = new Set();
    const typeSet = new Set();
    rows.forEach(r => { dateSet.add(r.date); typeSet.add(r.attendance_type); });

    const dates = Array.from(dateSet).sort();

    const TYPE_ORDER = ['Present','Gate Meeting','Training','Half Day','Weekoff',
                        'Leave','Outlet Closed','Absent','Holiday','Not Marked','Other'];
    const types = TYPE_ORDER.filter(t => typeSet.has(t));
    // append any unexpected types not in the predefined order
    typeSet.forEach(t => { if (!TYPE_ORDER.includes(t)) types.push(t); });

    // Build lookup map
    const map = {};
    rows.forEach(r => { map[`${r.attendance_type}__${r.date}`] = r.cnt; });

    // Render
    let html = '<div class="pivot-wrapper"><table class="pivot-table"><thead><tr>';
    html += '<th class="row-header">ATTENDANCE</th>';
    dates.forEach(d => { html += `<th>${formatPivotDate(d)}</th>`; });
    html += '</tr></thead><tbody>';

    const colTotals = {};
    dates.forEach(d => colTotals[d] = 0);

    types.forEach(type => {
        html += `<tr><td class="row-label">${type}</td>`;
        dates.forEach(d => {
            const v = map[`${type}__${d}`] || 0;
            colTotals[d] += v;
            html += `<td>${v > 0 ? v.toLocaleString() : ''}</td>`;
        });
        html += '</tr>';
    });

    // Total row
    html += '<tr class="total-row"><td class="row-label">Total</td>';
    dates.forEach(d => { html += `<td>${colTotals[d].toLocaleString()}</td>`; });
    html += '</tr></tbody></table></div>';

    body.innerHTML = html;
}

const TYPE_ORDER = ['Present','Gate Meeting','Training','Half Day','Weekoff',
                    'Leave','Outlet Closed','Absent','Holiday','Not Marked','Other'];

function renderPivotRegion(body, rows) {
    if (!rows.length) { body.innerHTML = '<div style="color:var(--text-muted);padding:20px">No data</div>'; return; }

    const regionSet = new Set();
    const typeSet   = new Set();
    rows.forEach(r => { regionSet.add(r.region); typeSet.add(r.attendance_type); });

    const regions = Array.from(regionSet).sort();
    const types   = TYPE_ORDER.filter(t => typeSet.has(t));
    typeSet.forEach(t => { if (!TYPE_ORDER.includes(t)) types.push(t); });

    const map = {};
    rows.forEach(r => { map[`${r.attendance_type}__${r.region}`] = r.cnt; });

    let html = '<div class="pivot-wrapper"><table class="pivot-table"><thead><tr>';
    html += '<th class="row-header">ATTENDANCE</th>';
    regions.forEach(r => { html += `<th>${r}</th>`; });
    html += '<th>Total</th></tr></thead><tbody>';

    const colTotals = {};
    regions.forEach(r => colTotals[r] = 0);
    let grandTotal = 0;

    types.forEach(type => {
        let rowTotal = 0;
        html += `<tr><td class="row-label">${type}</td>`;
        regions.forEach(r => {
            const v = map[`${type}__${r}`] || 0;
            colTotals[r] += v;
            rowTotal += v;
            html += `<td>${v > 0 ? v.toLocaleString() : ''}</td>`;
        });
        grandTotal += rowTotal;
        html += `<td style="font-weight:600;color:#a8c4ff;">${rowTotal.toLocaleString()}</td></tr>`;
    });

    // Total row
    html += '<tr class="total-row"><td class="row-label">Total</td>';
    regions.forEach(r => { html += `<td>${colTotals[r].toLocaleString()}</td>`; });
    html += `<td>${grandTotal.toLocaleString()}</td></tr>`;
    html += '</tbody></table></div>';

    body.innerHTML = html;
}

const ATTENDANCE_TREND_WIDGET_ID = 3;

function renderAttendanceSummary(body, rows) {
    const existing = body.querySelector('.attendance-summary');
    if (existing) existing.remove();

    if (!rows.length) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'attendance-summary';
    wrapper.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(59,130,246,.12);';

    rows.forEach(row => {
        const type = row['Attendance Type'];
        const days = row['Days'];
        if (!type || (!days && days !== 0)) return;

        const pill = document.createElement('div');
        pill.style.cssText = 'background:rgba(26,110,240,.12);border:1px solid rgba(59,130,246,.2);border-radius:20px;padding:4px 12px;font-size:12px;color:#c8d8f5;white-space:nowrap;';
        pill.innerHTML = `<span style="color:#7aaeff;font-weight:600;">${type}</span> — <span style="color:#fff;font-weight:700;">${days}</span> <span style="color:var(--text-muted);">day${days !== 1 ? 's' : ''}</span>`;
        wrapper.appendChild(pill);
    });

    body.appendChild(wrapper);
}

function renderWidgetBody(widget, columns, rows) {
    const body = document.getElementById(`widget-body-${widget.id}`);
    switch (widget.chart_type) {
        case 'kpi':   renderKpi(body, columns, rows); break;
        case 'table': renderTable(body, columns, rows); break;
        case 'bar':
            renderBar(body, widget.id, columns, rows);
            if (widget.id === ATTENDANCE_TREND_WIDGET_ID && getEnteredUserId()) {
                renderAttendanceSummary(body, rows);
            }
            break;
        case 'line':  renderLine(body, widget.id, columns, rows); break;
        case 'pivot':        renderPivot(body, rows); break;
        case 'pivot_region': renderPivotRegion(body, rows); break;
        default:      renderPie(body, widget.id, columns, rows, widget.chart_type); break;
    }
}

// ── Filter getters ───────────────────────────────────────
let currentWidgets = [];

function getSelectedRegion() {
    return document.getElementById('region-filter')?.value || 'All';
}

function getCheckedValues(menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return [];
    return Array.from(menu.querySelectorAll('.multi-option:checked')).map(cb => cb.value);
}

function buildParams() {
    const p = new URLSearchParams();
    p.set('region', getSelectedRegion());

    getCheckedValues('type-filter-menu').forEach(v => p.append('type', v));
    getCheckedValues('channel-filter-menu').forEach(v => p.append('channel', v));

    const ase = document.getElementById('ase-filter')?.value;
    if (ase && ase !== 'All') p.set('ase', ase);

    const zse = document.getElementById('zse-filter')?.value;
    if (zse && zse !== 'All') p.set('zse', zse);

    getCheckedValues('atype-filter-menu').forEach(v => p.append('atype', v));

    const df = document.getElementById('date-from')?.value;
    const dt = document.getElementById('date-to')?.value;
    if (df) p.set('date_from', df);
    if (dt) p.set('date_to', dt);

    const uid = document.getElementById('user-id-filter')?.value?.trim();
    if (uid) p.set('user_id', uid);

    return p;
}

// ── Load single widget ───────────────────────────────────
async function loadWidget(widget) {
    const params = buildParams();
    const res = await fetch(`/api/widget-data/${widget.id}?${params.toString()}`);
    const { columns, rows } = await res.json();
    renderWidgetBody(widget, columns, rows);
}

function widgetColumnClass(chartType) {
    if (chartType === 'kpi')   return 'col-md-3';
    if (chartType === 'pivot' || chartType === 'pivot_region') return 'col-12';
    if (chartType === 'table') return 'col-md-6';
    return 'col-md-6';
}

function reloadWidgetData() {
    currentWidgets.forEach(w => {
        if (w.id === EMPLOYEE_WIDGET_ID) return; // handled by refreshEmployeeWidget
        loadWidget(w);
    });
    refreshEmployeeWidget();
}

// ── Multi-select dropdown builder ────────────────────────
function buildMultiDropdown({ apiUrl, menuId, btnId, allLabel, optionClass }) {
    return fetch(apiUrl)
        .then(r => r.json())
        .then(values => {
            const menu = document.getElementById(menuId);
            const btn  = document.getElementById(btnId);
            if (!menu || !btn) return;

            menu.innerHTML = `
                <li class="px-2">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="${menuId}-all" checked>
                        <label class="form-check-label" for="${menuId}-all">${allLabel}</label>
                    </div>
                </li>
                <li><hr></li>
                ${values.map((v, i) => `
                <li class="px-2">
                    <div class="form-check">
                        <input class="form-check-input ${optionClass}" type="checkbox" id="${menuId}-${i}" value="${v}">
                        <label class="form-check-label" for="${menuId}-${i}">${v}</label>
                    </div>
                </li>`).join('')}
            `;

            const allCb = document.getElementById(`${menuId}-all`);
            const opts  = Array.from(menu.querySelectorAll(`.${optionClass}`));

            function updateLabel() {
                const sel = opts.filter(c => c.checked);
                btn.childNodes[0].textContent = sel.length === 0
                    ? allLabel
                    : sel.length === 1 ? sel[0].value : `${sel.length} Selected`;
            }

            allCb.addEventListener('change', () => {
                if (allCb.checked) opts.forEach(c => c.checked = false);
                updateLabel();
                reloadWidgetData();
            });

            opts.forEach(cb => {
                cb.addEventListener('change', () => {
                    if (cb.checked) allCb.checked = false;
                    else if (opts.every(c => !c.checked)) allCb.checked = true;
                    updateLabel();
                    reloadWidgetData();
                });
            });
        });
}

// ── Region filter ────────────────────────────────────────
async function loadRegions() {
    const sel = document.getElementById('region-filter');
    if (!sel) return;
    const regions = await (await fetch('/api/regions')).json();
    regions.forEach(r => {
        const o = document.createElement('option');
        o.value = o.textContent = r;
        sel.appendChild(o);
    });
    sel.addEventListener('change', reloadWidgetData);
}

// ── ASE ↔ ZSE cascading filters ─────────────────────────
let zseAseMap = []; // [{zse, ase}, ...]

function populateSelect(sel, values, allLabel) {
    const current = sel.value;
    // keep only the "All" option then re-add
    while (sel.options.length > 1) sel.remove(1);
    values.forEach(v => {
        const o = document.createElement('option');
        o.value = o.textContent = v;
        sel.appendChild(o);
    });
    // restore selection if it still exists in new list
    if (values.includes(current)) sel.value = current;
    else sel.value = 'All';
}

async function loadZseAseFilters() {
    zseAseMap = await (await fetch('/api/zse-ase-map')).json();

    const zseSel  = document.getElementById('zse-filter');
    const aseSel  = document.getElementById('ase-filter');
    if (!zseSel || !aseSel) return;

    // Populate ZSE with all unique ZSEs
    const allZses = [...new Set(zseAseMap.map(r => r.zse))].sort();
    populateSelect(zseSel, allZses, 'All ZSEs');

    // Populate ASE with all unique ASEs
    const allAses = [...new Set(zseAseMap.map(r => r.ase))].sort();
    populateSelect(aseSel, allAses, 'All ASEs');

    // ZSE change → filter ASE list, reload widgets
    zseSel.addEventListener('change', () => {
        const zse = zseSel.value;
        if (zse && zse !== 'All') {
            const filtered = zseAseMap
                .filter(r => r.zse === zse)
                .map(r => r.ase)
                .sort();
            populateSelect(aseSel, filtered, 'All ASEs');
        } else {
            populateSelect(aseSel, allAses, 'All ASEs');
        }
        reloadWidgetData();
    });

    // ASE change → auto-select matching ZSE, reload widgets
    aseSel.addEventListener('change', () => {
        const ase = aseSel.value;
        if (ase && ase !== 'All') {
            const match = zseAseMap.find(r => r.ase === ase);
            if (match) zseSel.value = match.zse;
        } else {
            zseSel.value = 'All';
            populateSelect(aseSel, allAses, 'All ASEs');
        }
        reloadWidgetData();
    });
}

// ── User ID filter (debounced) ───────────────────────────
function initUserIdFilter() {
    const input = document.getElementById('user-id-filter');
    if (!input) return;
    let timer;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            reloadWidgetData();
            refreshEmployeeWidget();
        }, 600);
    });
}

// ── Date filters ─────────────────────────────────────────
function initDateFilters() {
    ['date-from', 'date-to'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', reloadWidgetData);
    });
}

// ── Clear all ────────────────────────────────────────────
function clearAllFilters() {
    // Close any open dropdowns
    document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
        const btn = menu.previousElementSibling;
        if (btn) bootstrap.Dropdown.getOrCreateInstance(btn).hide();
    });

    document.getElementById('region-filter').value = 'All';

    ['type-filter-menu', 'channel-filter-menu', 'atype-filter-menu'].forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (!menu) return;
        const allCb = menu.querySelector('input[type=checkbox]:not(.multi-option)');
        if (allCb) allCb.checked = true;
        menu.querySelectorAll('.multi-option').forEach(cb => cb.checked = false);
    });

    document.getElementById('type-filter-btn').childNodes[0].textContent = 'All Types';
    document.getElementById('channel-filter-btn').childNodes[0].textContent = 'All Channels';
    document.getElementById('atype-filter-btn').childNodes[0].textContent = 'All Types';

    // Reset ZSE & ASE — restore full ASE list
    document.getElementById('zse-filter').value = 'All';
    const aseSel = document.getElementById('ase-filter');
    const allAses = [...new Set(zseAseMap.map(r => r.ase))].sort();
    populateSelect(aseSel, allAses, 'All ASEs');
    aseSel.value = 'All';
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    document.getElementById('user-id-filter').value = '';

    reloadWidgetData();
    refreshEmployeeWidget();
}

const EMPLOYEE_WIDGET_ID = 8;

function getEnteredUserId() {
    return document.getElementById('user-id-filter')?.value?.trim() || '';
}

function widgetShouldShow(widget) {
    if (widget.id === EMPLOYEE_WIDGET_ID) {
        return getEnteredUserId().length > 0;
    }
    return true;
}

function refreshEmployeeWidget() {
    const uid = getEnteredUserId();
    const col = document.getElementById(`widget-col-${EMPLOYEE_WIDGET_ID}`);
    if (!col) return;

    if (uid) {
        col.style.display = '';
        const w = currentWidgets.find(w => w.id === EMPLOYEE_WIDGET_ID);
        if (w) loadWidget(w);
    } else {
        col.style.display = 'none';
    }
}

// ── Dashboard loader ─────────────────────────────────────
async function loadDashboard() {
    const container = document.getElementById('dashboard-container');
    container.innerHTML = '';

    currentWidgets = await (await fetch('/api/widgets')).json();

    currentWidgets.forEach(widget => {
        const col = document.createElement('div');
        col.id = `widget-col-${widget.id}`;

        const isEmployeeWidget = widget.id === EMPLOYEE_WIDGET_ID;
        const colClass = isEmployeeWidget ? 'col-12' : widgetColumnClass(widget.chart_type);
        col.className = `${colClass} mb-2`;

        if (isEmployeeWidget) {
            col.style.display = 'none'; // hidden until user_id entered
        }

        col.innerHTML = `
            <div class="dashboard-card h-100">
                <div class="card-header">${widget.widget_name}</div>
                <div class="card-body" id="widget-body-${widget.id}">
                    <div style="color:var(--text-muted);font-size:13px;padding:20px 0;">Loading…</div>
                </div>
            </div>`;
        container.appendChild(col);

        if (!isEmployeeWidget) loadWidget(widget);
    });
}

// ── Init ─────────────────────────────────────────────────
loadRegions();
buildMultiDropdown({ apiUrl: '/api/types',                menuId: 'type-filter-menu',    btnId: 'type-filter-btn',    allLabel: 'All Types',    optionClass: 'type-option' });
buildMultiDropdown({ apiUrl: '/api/channels',             menuId: 'channel-filter-menu', btnId: 'channel-filter-btn', allLabel: 'All Channels', optionClass: 'channel-option' });
buildMultiDropdown({ apiUrl: '/api/attendance_types',     menuId: 'atype-filter-menu',   btnId: 'atype-filter-btn',   allLabel: 'All Types',    optionClass: 'atype-option' });
loadZseAseFilters();
initDateFilters();
initUserIdFilter();
loadDashboard();
