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

function proxyImageUrl(url) {
    if (/s3[^/]*amazonaws\.com/i.test(url)) {
        return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
}

function renderCellValue(value) {
    if (!value && value !== 0) return '';
    const dated = formatDateValue(String(value));
    if (dated) return dated;
    if (isImageUrl(value)) {
        const proxied = proxyImageUrl(value);
        return `<a href="${value}" target="_blank">
                    <img src="${proxied}" alt="selfie" crossorigin="anonymous"
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
    body.innerHTML = '';
    const labelCol = pickLabelColumn(columns, rows);
    const valueCol = pickValueColumn(columns, rows, labelCol);
    const total = rows.reduce((s, r) => s + (r[valueCol] || 0), 0);

    // Chart wrapper (left: doughnut, right: legend table)
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;gap:20px;flex-wrap:wrap;';

    // Canvas container
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'position:relative;width:240px;height:240px;flex-shrink:0;';
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${widgetId}`;
    canvasWrap.appendChild(canvas);
    wrapper.appendChild(canvasWrap);

    // Legend table
    const legendDiv = document.createElement('div');
    legendDiv.style.cssText = 'flex:1;min-width:200px;';
    let legendHtml = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    legendHtml += '<tr style="border-bottom:1px solid rgba(80,130,255,.15);">' +
        '<th style="text-align:left;padding:6px 8px;color:#2ee8ff;font-size:10px;letter-spacing:.5px;">NAME</th>' +
        '<th style="text-align:right;padding:6px 8px;color:#2ee8ff;font-size:10px;letter-spacing:.5px;">COUNT</th>' +
        '<th style="text-align:right;padding:6px 8px;color:#2ee8ff;font-size:10px;letter-spacing:.5px;">%</th></tr>';
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

const TIMING_ORDER = ['Before 10 AM','10 AM To 12 Noon','12 Noon To 2 PM','After 2 PM','Not Check in'];

function renderPivotTiming(body, rows) {
    if (!rows.length) { body.innerHTML = '<div style="color:var(--text-muted);padding:20px">No data</div>'; return; }

    const dateSet = new Set();
    const timingSet = new Set();
    rows.forEach(r => { dateSet.add(r.date); timingSet.add(r.timing); });

    const dates = Array.from(dateSet).sort();
    const timings = TIMING_ORDER.filter(t => timingSet.has(t));
    timingSet.forEach(t => { if (!TIMING_ORDER.includes(t)) timings.push(t); });

    const map = {};
    rows.forEach(r => { map[`${r.timing}__${r.date}`] = r.cnt; });

    let html = '<div class="pivot-wrapper"><table class="pivot-table"><thead><tr>';
    html += '<th class="row-header">TIMING</th>';
    dates.forEach(d => { html += `<th>${formatPivotDate(d)}</th>`; });
    html += '</tr></thead><tbody>';

    const colTotals = {};
    dates.forEach(d => colTotals[d] = 0);

    timings.forEach(timing => {
        html += `<tr><td class="row-label">${timing}</td>`;
        dates.forEach(d => {
            const v = map[`${timing}__${d}`] || 0;
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

const IMPACT_ORDER = ['4.5-9 Hrs (Half Day)','9 Hrs (Full Day)','No Check-Out (LOP)','Not Check in'];

function renderPivotSalary(body, rows) {
    if (!rows.length) { body.innerHTML = '<div style="color:var(--text-muted);padding:20px">No data</div>'; return; }

    const dateSet = new Set();
    const impactSet = new Set();
    rows.forEach(r => { dateSet.add(r.date); impactSet.add(r.impact); });

    const dates = Array.from(dateSet).sort();
    const impacts = IMPACT_ORDER.filter(t => impactSet.has(t));
    impactSet.forEach(t => { if (!IMPACT_ORDER.includes(t)) impacts.push(t); });

    const map = {};
    rows.forEach(r => { map[`${r.impact}__${r.date}`] = r.cnt; });

    // Compute date totals for percentage calculation
    const dateTotals = {};
    dates.forEach(d => {
        let sum = 0;
        impacts.forEach(imp => { sum += map[`${imp}__${d}`] || 0; });
        dateTotals[d] = sum;
    });

    let html = '<div class="pivot-wrapper"><table class="pivot-table"><thead>';
    // Header row 1: DATE spans
    html += '<tr><th class="row-header" rowspan="2">Salary Impact</th>';
    dates.forEach(d => { html += `<th colspan="2">${formatPivotDate(d)}</th>`; });
    html += '</tr>';
    // Header row 2: sub-columns
    html += '<tr>';
    dates.forEach(() => {
        html += '<th>Salary Impact</th><th>% of Salary Impact</th>';
    });
    html += '</tr></thead><tbody>';

    impacts.forEach(impact => {
        html += `<tr><td class="row-label">${impact}</td>`;
        dates.forEach(d => {
            const v = map[`${impact}__${d}`] || 0;
            const total = dateTotals[d] || 1;
            const pct = Math.round((v / total) * 100);
            html += `<td>${v > 0 ? v.toLocaleString() : ''}</td>`;
            html += `<td>${v > 0 ? pct + '%' : ''}</td>`;
        });
        html += '</tr>';
    });

    // Total row
    html += '<tr class="total-row"><td class="row-label">Total</td>';
    dates.forEach(d => {
        html += `<td>${dateTotals[d].toLocaleString()}</td><td>100%</td>`;
    });
    html += '</tr></tbody></table></div>';

    body.innerHTML = html;
}

function renderProfile(body, columns, rows) {
    if (!rows.length) { body.innerHTML = '<div style="color:var(--text-muted);padding:20px">No employee found</div>'; return; }
    const r = rows[0];
    const pic = r['Profile Picture'];
    const hasPic = pic && pic !== 'NA' && pic.startsWith('http');
    const proxiedPic = hasPic ? `/api/image-proxy?url=${encodeURIComponent(pic)}` : '';

    body.innerHTML = `
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding:8px 0;">
        <div style="flex-shrink:0;">
            ${hasPic
                ? `<img src="${proxiedPic}" alt="Profile" crossorigin="anonymous"
                    style="width:100px;height:100px;object-fit:cover;border-radius:50%;
                           border:3px solid var(--cyan,#2ee8ff);box-shadow:0 0 20px rgba(46,232,255,.15);"
                    onerror="this.style.display='none'">`
                : `<div style="width:100px;height:100px;border-radius:50%;background:linear-gradient(135deg,var(--accent,#3a7bd5),var(--cyan,#2ee8ff));
                           display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800;color:#fff;">
                    ${(r['Employee Name'] || '?')[0]}</div>`
            }
        </div>
        <div style="flex:1;min-width:200px;">
            <div style="font-size:20px;font-weight:800;color:var(--text,#e8f0ff);margin-bottom:4px;">${r['Employee Name'] || '-'}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
                ${['Employee ID','User ID','Gender','Region','Type','ASE','ZSE'].map(key => {
                    const val = r[key];
                    if (!val && val !== 0) return '';
                    return `<span style="background:rgba(46,232,255,.08);border:1px solid rgba(46,232,255,.15);border-radius:20px;padding:4px 14px;font-size:11px;color:#c8dcf8;">
                        <span style="color:var(--cyan,#2ee8ff);font-weight:600;">${key}:</span> ${val}</span>`;
                }).join('')}
            </div>
        </div>
    </div>`;
}

const PROFILE_WIDGET_ID = 15;
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
        case 'pivot_timing': renderPivotTiming(body, rows); break;
        case 'profile':      renderProfile(body, columns, rows); break;
        case 'pivot_salary': renderPivotSalary(body, rows); break;
        default:      renderPie(body, widget.id, columns, rows, widget.chart_type); break;
    }
}

// ── Filter getters ───────────────────────────────────────
let currentWidgets = [];
let cascading = false; // prevent re-entrancy during cascade update

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
    if (chartType === 'pivot' || chartType === 'pivot_region' || chartType === 'pivot_timing' || chartType === 'pivot_salary') return 'col-12';
    if (chartType === 'table') return 'col-md-6';
    return 'col-md-6';
}

function reloadWidgetData() {
    currentWidgets.forEach(w => {
        if (w.id === EMPLOYEE_WIDGET_ID || w.id === PROFILE_WIDGET_ID) return;
        loadWidget(w);
    });
    refreshEmployeeWidget();
}

// ══════════════════════════════════════════════════════════
// CASCADING FILTER SYSTEM
// When any filter changes → fetch available options for
// all OTHER filters from /api/filter-options, then update
// the dropdown options accordingly.
// ══════════════════════════════════════════════════════════

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

    // Uncheck "all" if any option is checked
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
    const opts = await (await fetch(`/api/filter-options?${params.toString()}`)).json();

    cascading = true;

    // Update Region select
    populateSelect(document.getElementById('region-filter'), opts.regions);

    // Update ASE select
    populateSelect(document.getElementById('ase-filter'), opts.ases);

    // Update ZSE select
    populateSelect(document.getElementById('zse-filter'), opts.zses);

    // Update User ID dropdown
    populateSelect(document.getElementById('userid-dropdown'), opts.user_ids);

    // Update multi-select dropdowns
    updateMultiDropdown('type-filter-menu',    'type-filter-btn',    'All Types',    'type-option',    opts.types);
    updateMultiDropdown('channel-filter-menu', 'channel-filter-btn', 'All Channels', 'channel-option', opts.channels);
    updateMultiDropdown('atype-filter-menu',   'atype-filter-btn',   'All Types',    'atype-option',   opts.atypes);

    cascading = false;
}

function onFilterChange() {
    if (cascading) return;
    reloadWidgetData();
}

// ── Initial filter setup ────────────────────────────────
async function initAllFilters() {
    // Load initial full options
    const opts = await (await fetch('/api/filter-options')).json();

    // Region
    const regionSel = document.getElementById('region-filter');
    opts.regions.forEach(r => {
        const o = document.createElement('option');
        o.value = o.textContent = r;
        regionSel.appendChild(o);
    });
    regionSel.addEventListener('change', onFilterChange);

    // ASE
    const aseSel = document.getElementById('ase-filter');
    opts.ases.forEach(a => {
        const o = document.createElement('option');
        o.value = o.textContent = a;
        aseSel.appendChild(o);
    });
    aseSel.addEventListener('change', onFilterChange);

    // ZSE
    const zseSel = document.getElementById('zse-filter');
    opts.zses.forEach(z => {
        const o = document.createElement('option');
        o.value = o.textContent = z;
        zseSel.appendChild(o);
    });
    zseSel.addEventListener('change', onFilterChange);

    // Multi-select dropdowns (Type, Channel, Attendance Type)
    updateMultiDropdown('type-filter-menu',    'type-filter-btn',    'All Types',    'type-option',    opts.types);
    updateMultiDropdown('channel-filter-menu', 'channel-filter-btn', 'All Channels', 'channel-option', opts.channels);
    updateMultiDropdown('atype-filter-menu',   'atype-filter-btn',   'All Types',    'atype-option',   opts.atypes);

    // Date filters
    ['date-from', 'date-to'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', onFilterChange);
    });

    // User ID dropdown
    const uidDropdown = document.getElementById('userid-dropdown');
    opts.user_ids.forEach(u => {
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
        refreshEmployeeWidget();
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
                refreshEmployeeWidget();
            }, 600);
        });
    }
}

// ── Clear all ────────────────────────────────────────────
async function clearAllFilters() {
    document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
        const btn = menu.previousElementSibling;
        if (btn) bootstrap.Dropdown.getOrCreateInstance(btn).hide();
    });

    document.getElementById('region-filter').value = 'All';
    document.getElementById('ase-filter').value = 'All';
    document.getElementById('zse-filter').value = 'All';
    document.getElementById('userid-dropdown').value = 'All';
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    document.getElementById('user-id-filter').value = '';

    // Reload full options (no filters applied)
    const opts = await (await fetch('/api/filter-options')).json();

    populateSelect(document.getElementById('region-filter'), opts.regions);
    populateSelect(document.getElementById('ase-filter'), opts.ases);
    populateSelect(document.getElementById('zse-filter'), opts.zses);
    populateSelect(document.getElementById('userid-dropdown'), opts.user_ids);
    updateMultiDropdown('type-filter-menu',    'type-filter-btn',    'All Types',    'type-option',    opts.types,    true);
    updateMultiDropdown('channel-filter-menu', 'channel-filter-btn', 'All Channels', 'channel-option', opts.channels, true);
    updateMultiDropdown('atype-filter-menu',   'atype-filter-btn',   'All Types',    'atype-option',   opts.atypes,   true);

    reloadWidgetData();
    refreshEmployeeWidget();
}

const EMPLOYEE_WIDGET_ID = 8;

function getEnteredUserId() {
    return document.getElementById('user-id-filter')?.value?.trim() || '';
}

function widgetShouldShow(widget) {
    if (widget.id === EMPLOYEE_WIDGET_ID || widget.id === PROFILE_WIDGET_ID) {
        return getEnteredUserId().length > 0;
    }
    return true;
}

function refreshEmployeeWidget() {
    const uid = getEnteredUserId();

    [EMPLOYEE_WIDGET_ID, PROFILE_WIDGET_ID].forEach(wid => {
        const col = document.getElementById(`widget-col-${wid}`);
        if (!col) return;
        if (uid) {
            col.style.display = '';
            const w = currentWidgets.find(w => w.id === wid);
            if (w) loadWidget(w);
        } else {
            col.style.display = 'none';
        }
    });
}

// ── Dashboard loader ─────────────────────────────────────
async function loadDashboard() {
    const container = document.getElementById('dashboard-container');
    container.innerHTML = '';

    currentWidgets = await (await fetch('/api/widgets')).json();

    currentWidgets.forEach(widget => {
        const col = document.createElement('div');
        col.id = `widget-col-${widget.id}`;

        const isEmployeeWidget = widget.id === EMPLOYEE_WIDGET_ID || widget.id === PROFILE_WIDGET_ID;
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
initAllFilters();
loadDashboard();
