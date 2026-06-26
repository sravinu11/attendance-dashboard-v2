// ── Export utilities ─────────────────────────────────────

let exportUnlocked = false;

function showOverlay(msg) {
    document.getElementById('export-msg').textContent = msg || 'Generating dashboard snapshot...';
    document.getElementById('export-overlay').classList.add('show');
}

function hideOverlay() {
    document.getElementById('export-overlay').classList.remove('show');
}

function getTimestamp() {
    const d = new Date();
    return `${d.getDate()}-${d.toLocaleDateString('en-US',{month:'short'})}-${d.getFullYear()}_${d.getHours()}${String(d.getMinutes()).padStart(2,'0')}`;
}

function getRegionName() {
    const sel = document.getElementById('region-filter');
    const val = sel ? sel.value : 'All';
    return (val && val !== 'All') ? val.replace(/\s+/g, '_') : 'All_Regions';
}

function getFileName(ext) {
    return `${getRegionName()}_Dashboard_${getTimestamp()}.${ext}`;
}

function captureDashboard() {
    const target = document.body;
    const exportBtns = document.querySelector('.export-bar');
    const adminModal = document.getElementById('admin-modal');
    const emailModal = document.getElementById('email-modal');
    const overlay = document.getElementById('export-overlay');
    if (exportBtns) exportBtns.style.display = 'none';
    if (adminModal) adminModal.style.display = 'none';
    if (emailModal) emailModal.style.display = 'none';
    if (overlay) overlay.style.cssText = 'display:none !important';

    return html2canvas(target, {
        backgroundColor: '#04071a',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        scrollX: 0,
        scrollY: 0,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
        height: document.documentElement.scrollHeight
    }).then(canvas => {
        if (exportBtns) exportBtns.style.display = '';
        return canvas;
    });
}

// ── Admin Auth Gate ─────────────────────────────────────
function requireAdminAuth(callback) {
    if (exportUnlocked) { callback(); return; }
    document.getElementById('admin-modal').classList.add('show');
    document.getElementById('admin-password').value = '';
    document.getElementById('admin-error').style.display = 'none';
    document.getElementById('admin-password').focus();
    window.__adminCallback = callback;
}

function submitAdminAuth() {
    const pwd = document.getElementById('admin-password').value;
    fetch('/api/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
    })
    .then(r => r.json())
    .then(result => {
        if (result.success) {
            exportUnlocked = true;
            document.getElementById('admin-modal').classList.remove('show');
            updateExportLockIcons();
            if (window.__adminCallback) window.__adminCallback();
        } else {
            document.getElementById('admin-error').style.display = 'block';
        }
    });
}

function hideAdminModal() {
    document.getElementById('admin-modal').classList.remove('show');
}

function updateExportLockIcons() {
    document.querySelectorAll('.lock-icon-span').forEach(el => {
        el.textContent = exportUnlocked ? '' : '🔒 ';
    });
}

// ── Download as Image ───────────────────────────────────
function exportImage() {
    requireAdminAuth(async () => {
        showOverlay('Capturing dashboard as image...');
        try {
            const canvas = await captureDashboard();
            const link = document.createElement('a');
            link.download = getFileName('png');
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (e) {
            alert('Failed to capture dashboard: ' + e.message);
        }
        hideOverlay();
    });
}

// ── Download as PDF ─────────────────────────────────────
function exportPDF() {
    requireAdminAuth(async () => {
        showOverlay('Generating PDF...');
        try {
            const canvas = await captureDashboard();
            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const imgW = canvas.width;
            const imgH = canvas.height;
            const pdfW = 297;
            const pdfH = (imgH * pdfW) / imgW;
            const pdf = new jsPDF({
                orientation: pdfH > pdfW ? 'portrait' : 'landscape',
                unit: 'mm',
                format: [pdfW, pdfH]
            });
            pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
            pdf.save(getFileName('pdf'));
        } catch (e) {
            alert('Failed to generate PDF: ' + e.message);
        }
        hideOverlay();
    });
}

// ── Email Modal ─────────────────────────────────────────
function showEmailModal() {
    requireAdminAuth(() => {
        document.getElementById('email-modal').classList.add('show');
    });
}

function hideEmailModal() {
    document.getElementById('email-modal').classList.remove('show');
}

async function sendEmail() {
    const to = document.getElementById('email-to').value.trim();
    const subject = document.getElementById('email-subject').value.trim();
    const body = document.getElementById('email-body').value.trim();

    hideEmailModal();
    showOverlay('Capturing dashboard and opening Outlook...');

    try {
        const canvas = await captureDashboard();
        const imgData = canvas.toDataURL('image/png');

        const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject, body, image: imgData })
        });

        const result = await res.json();
        if (result.success) {
            alert('Outlook opened with dashboard image! Add recipients and click Send.');
        } else {
            alert('Failed to open Outlook: ' + (result.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Failed: ' + e.message);
    }
    hideOverlay();
}
