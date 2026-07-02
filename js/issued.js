// ============================================================
//  Admin Online — รายงานใบกำกับภาษีที่ออกแล้ว
//  ใช้ viewNote / noteBodyHtml / fmt* ร่วมจาก dashboard.js + api.js
// ============================================================
const ISSUED = {
  items: [],

  init() {
    if (!document.getElementById('if-rows')) return;
    if (!Auth.requirePage('issued.html')) return;
    const u = Auth.getUser();
    document.getElementById('user-box').innerHTML = `<b>${escapeHtml(u.name)}</b> ${Auth.getRoleBadge(u.role)}`;

    const sel = document.getElementById('if-store');
    DEFAULT_META.stores.forEach(s => sel.insertAdjacentHTML('beforeend', `<option>${escapeHtml(s)}</option>`));

    const fp = {
      dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y',
      locale: (window.flatpickr && flatpickr.l10ns && flatpickr.l10ns.th) ? 'th' : 'default', allowInput: true
    };
    flatpickr('#if-from', fp);
    flatpickr('#if-to', fp);

    ['if-store', 'if-from', 'if-to'].forEach(id => document.getElementById(id).addEventListener('change', ISSUED.render));
    document.getElementById('if-q').addEventListener('input', ISSUED.render);
    ISSUED.load();
  },

  async load() {
    const res = await API.listNotes({ only_issued: '1', limit: 500 });
    ISSUED.items = res.success ? (res.data || []) : [];
    ISSUED.render();
  },

  render() {
    const store = document.getElementById('if-store').value;
    const from = document.getElementById('if-from').value;
    const to = document.getElementById('if-to').value;
    const q = document.getElementById('if-q').value.trim().toLowerCase();

    let rows = ISSUED.items.filter(n => {
      if (store && n.store !== store) return false;
      const d = String(n.issued_at || '').slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (q && ![n.order_no, n.customer].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    rows.sort((a, b) => String(b.issued_at).localeCompare(String(a.issued_at)));

    const withFiles = rows.filter(n => (n.invoice_files || '').split(',').filter(Boolean).length).length;
    const d = new Date(), ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const thisMonth = rows.filter(n => String(n.issued_at || '').startsWith(ym)).length;
    document.getElementById('if-summary').innerHTML =
      ISSUED.stat('📄', 'ออกแล้วทั้งหมด', rows.length) +
      ISSUED.stat('📅', 'ออกเดือนนี้', thisMonth) +
      ISSUED.stat('📎', 'มีไฟล์แนบ', withFiles);

    const tb = document.getElementById('if-rows');
    if (!rows.length) { tb.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px">ยังไม่มีใบกำกับที่ออกแล้ว</td></tr>`; return; }
    tb.innerHTML = rows.map(n => {
      const inv = (n.invoice_files || '').split(',').filter(Boolean);
      const dl = inv.length
        ? inv.map((u, i) => `<a class="btn btn-secondary btn-sm" href="${u}" target="_blank" style="margin-right:4px">⬇️ ${i + 1}</a>`).join('')
        : '<span style="color:var(--text-muted)">- ไม่มีไฟล์ -</span>';
      return `<tr>
        <td>${fmtDateTime(n.issued_at)}</td>
        <td>${escapeHtml(n.store)}</td>
        <td>${escapeHtml(n.customer || '-')}</td>
        <td>${escapeHtml(n.order_no || '-')}</td>
        <td><span class="badge badge-primary">ใบกำกับ</span></td>
        <td style="white-space:nowrap">${dl}</td>
        <td><button class="btn btn-secondary btn-sm" data-v="${n.id}">ดู</button></td>
      </tr>`;
    }).join('');
    tb.querySelectorAll('[data-v]').forEach(b => b.onclick = () => viewNote(b.dataset.v));
  },

  stat(icon, label, val) {
    return `<div class="stat-card"><div class="stat-icon purple">${icon}</div><div><div class="stat-value">${val}</div><div class="stat-label">${escapeHtml(label)}</div></div></div>`;
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ISSUED.init());
else ISSUED.init();
