// ============================================================
//  Admin Online — รายงานยกเลิก / เปลี่ยนสินค้า (ใช้ร่วมกัน)
//  หน้า HTML ตั้ง REPORT_TYPE = 'cancel' | 'exchange'
//  ใช้ viewNote / noteBodyHtml / fmt* ร่วมจาก dashboard.js + api.js
// ============================================================
const REPORT = {
  items: [],

  init() {
    if (typeof REPORT_TYPE === 'undefined' || !document.getElementById('rp-rows')) return;
    const page = REPORT_TYPE === 'cancel' ? 'cancels.html' : (REPORT_TYPE === 'exchange' ? 'exchanges.html' : 'sales.html');
    if (!Auth.requirePage(page)) return;

    const u = Auth.getUser();
    document.getElementById('user-box').innerHTML = `<b>${escapeHtml(u.name)}</b> ${Auth.getRoleBadge(u.role)}`;

    const sel = document.getElementById('rp-store');
    DEFAULT_META.stores.forEach(s => sel.insertAdjacentHTML('beforeend', `<option>${escapeHtml(s)}</option>`));

    const fp = {
      dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y',
      locale: (window.flatpickr && flatpickr.l10ns && flatpickr.l10ns.th) ? 'th' : 'default', allowInput: true
    };
    flatpickr('#rp-from', fp);
    flatpickr('#rp-to', fp);

    ['rp-store', 'rp-from', 'rp-to'].forEach(id => document.getElementById(id).addEventListener('change', REPORT.render));
    document.getElementById('rp-q').addEventListener('input', REPORT.render);
    const ex = document.getElementById('rp-export');
    if (ex) ex.onclick = () => REPORT.exportCSV();
    REPORT.load();
  },

  exportCSV() {
    const rows = REPORT.filtered || [];
    if (!rows.length) return toast('ไม่มีข้อมูลให้ export', 'warning');
    let headers, mapper;
    if (REPORT_TYPE === 'sale') {
      headers = ['วันที่โน๊ต', 'ร้าน', 'ช่องทาง', 'เลขคำสั่งซื้อ', 'ลูกค้า', 'ส่วนลดรวม', 'ค่าจัดส่ง', 'ยอดที่ต้องชำระ', 'ผู้บันทึก', 'วันที่บันทึก'];
      mapper = n => [fmtDate(n.date_noted), n.store, n.channel, n.order_no, n.customer, n.discount_total, n.shipping_fee, n.grand_total, n.created_by_name, fmtDateTime(n.created_at)];
    } else if (REPORT_TYPE === 'cancel') {
      headers = ['วันที่โน๊ต', 'ร้าน', 'ช่องทาง', 'เลขคำสั่งซื้อ', 'สาเหตุ', 'สถานะการส่งคืน', 'สถานะสินค้าที่คืน', 'คลังที่รับเข้า', 'ผู้บันทึก', 'วันที่บันทึก'];
      mapper = n => [fmtDate(n.date_noted), n.store, n.channel, n.order_no, n.cancel_reason, n.cancel_status, n.cancel_item_status, n.cancel_warehouse, n.created_by_name, fmtDateTime(n.created_at)];
    } else {
      headers = ['วันที่โน๊ต', 'ร้าน', 'ช่องทาง', 'เลขคำสั่งซื้อ', 'ค่าเปลี่ยน', 'หมายเหตุ', 'ผู้บันทึก', 'วันที่บันทึก'];
      mapper = n => [fmtDate(n.date_noted), n.store, n.channel, n.order_no, n.exchange_fee, n.remark, n.created_by_name, fmtDateTime(n.created_at)];
    }
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = '﻿' + [headers.map(esc).join(','), ...rows.map(n => mapper(n).map(esc).join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const names = { sale: 'รายงานขาย', cancel: 'รายงานยกเลิก', exchange: 'รายงานเปลี่ยนสินค้า' };
    const a = document.createElement('a');
    a.href = url;
    a.download = (names[REPORT_TYPE] || 'report') + '_' + nowStamp().replace(/[\/: ]/g, '-') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('ดาวน์โหลดไฟล์แล้ว (เปิดด้วย Excel ได้)', 'success');
  },

  async load() {
    const res = await API.listNotes({ type: REPORT_TYPE, limit: 500 });
    REPORT.items = res.success ? (res.data || []) : [];
    REPORT.render();
  },

  render() {
    const store = document.getElementById('rp-store').value;
    const from = document.getElementById('rp-from').value;
    const to = document.getElementById('rp-to').value;
    const q = document.getElementById('rp-q').value.trim().toLowerCase();

    let rows = REPORT.items.filter(n => {
      if (store && n.store !== store) return false;
      const d = String(n.date_noted || '');
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (q && ![n.order_no, n.remark, n.customer, n.cancel_reason].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    REPORT.filtered = rows;   // เก็บไว้ให้ export

    document.getElementById('rp-count').textContent = rows.length;
    // รายงานขาย: รวมยอดขายทั้งหมด
    const sumEl = document.getElementById('rp-sum');
    if (sumEl) sumEl.textContent = fmtMoney(rows.reduce((s, n) => s + (+n.grand_total || 0), 0));
    const tb = document.getElementById('rp-rows');
    if (!rows.length) { tb.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px">ไม่พบรายการ</td></tr>`; return; }

    tb.innerHTML = rows.map(n => {
      let detail;
      if (REPORT_TYPE === 'cancel') {
        detail = `${escapeHtml(n.cancel_reason || '-')}` +
          (n.cancel_status ? ` <span class="badge badge-muted">${escapeHtml(n.cancel_status)}</span>` : '') +
          (n.cancel_item_status ? ` <span class="badge badge-muted">${escapeHtml(n.cancel_item_status)}</span>` : '') +
          (n.cancel_warehouse ? ` <span class="badge badge-primary">📦 ${escapeHtml(n.cancel_warehouse)}</span>` : '');
      } else if (REPORT_TYPE === 'sale') {
        detail = `<span style="color:var(--primary);font-weight:700">${fmtMoney(n.grand_total)} ฿</span>`;
      } else {
        detail = (n.exchange_fee && +n.exchange_fee > 0)
          ? `<span style="color:var(--primary);font-weight:600">ค่าเปลี่ยน ${fmtMoney(n.exchange_fee)} ฿</span>` : '-';
      }
      return `<tr>
        <td>${fmtDate(n.date_noted)}</td>
        <td>${escapeHtml(n.store)}</td>
        <td>${escapeHtml(n.channel)}</td>
        <td>${escapeHtml(n.order_no || '-')}</td>
        <td>${detail}<div style="font-size:11px;color:var(--text-muted)">โดย ${escapeHtml(n.created_by_name || '-')} · ${fmtDateTime(n.created_at)}</div></td>
        <td><button class="btn btn-secondary btn-sm" data-v="${n.id}">ดู</button></td>
      </tr>`;
    }).join('');
    tb.querySelectorAll('[data-v]').forEach(b => b.onclick = () => viewNote(b.dataset.v));
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => REPORT.init());
else REPORT.init();
