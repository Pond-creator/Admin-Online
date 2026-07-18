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

    ['rp-store', 'rp-channel', 'rp-from', 'rp-to'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', REPORT.render); });
    document.getElementById('rp-q').addEventListener('input', REPORT.render);
    const ex = document.getElementById('rp-export');
    if (ex) ex.onclick = () => REPORT.exportCSV();
    REPORT.load();
  },

  exportCSV() {
    const rows = REPORT.filtered || [];
    if (!rows.length) return toast('ไม่มีข้อมูลให้ export', 'warning');
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const isGift = it => (it.is_gift === true || it.is_gift === 'TRUE' || it.is_gift === 'true');
    const lines = [];

    if (REPORT_TYPE === 'sale') {
      // รายงานขาย: แยกรายสินค้า 1 แถว/ชิ้น + หัวรายงาน + เฉลี่ยค่าส่ง
      const store = document.getElementById('rp-store').value || 'ทั้งหมด';
      const from = document.getElementById('rp-from').value, to = document.getElementById('rp-to').value;
      lines.push(esc(`รายงานคำสั่งซื้อของแบรนด์ ${store} · ดึงตั้งแต่วันที่ ${from ? fmtDate(from) : '-'} ถึง ${to ? fmtDate(to) : '-'}`));
      lines.push(['รหัสออเดอร์', 'วันที่', 'ช่องทางขาย', 'รหัสสินค้า', 'รายละเอียดการสั่งซื้อ', 'จำนวน', 'ราคาเต็ม', 'ส่วนลด', 'ค่าจัดส่ง', 'ยอดชำระ', 'ชื่อ', 'เบอร์โทร', 'ที่อยู่'].map(esc).join(','));
      rows.forEach(n => {
        const items = (n.sale_items || []).filter(it => !isGift(it));
        if (!items.length) return;
        const ship = +n.shipping_fee || 0;
        const per = Math.floor((ship / items.length) * 100) / 100;   // เฉลี่ยต่อชิ้น (ปัดลง)
        items.forEach((it, idx) => {
          const qty = +it.qty || 0, price = +it.price || 0, disc = +it.discount || 0;
          const shipShare = (idx === items.length - 1) ? +(ship - per * (items.length - 1)).toFixed(2) : per;
          const pay = +(Math.max(0, qty * price - disc) + shipShare).toFixed(2);
          const detail = (it.name || '') + (it.color ? ' : ' + it.color : '');
          lines.push([n.order_no, fmtDate(n.purchase_date), n.channel, it.code, detail, qty, price, disc, shipShare, pay, n.cust_name, n.cust_phone, n.cust_address].map(esc).join(','));
        });
      });
    } else if (REPORT_TYPE === 'cancel') {
      lines.push(['วันที่โน๊ต', 'ร้าน', 'ช่องทาง', 'เลขคำสั่งซื้อ', 'สาเหตุ', 'สถานะการส่งคืน', 'สถานะสินค้าที่คืน', 'คลังที่รับเข้า', 'ผู้บันทึก', 'วันที่บันทึก'].map(esc).join(','));
      rows.forEach(n => lines.push([fmtDate(n.date_noted), n.store, n.channel, n.order_no, n.cancel_reason, n.cancel_status, n.cancel_item_status, n.cancel_warehouse, n.created_by_name, fmtDateTime(n.created_at)].map(esc).join(',')));
    } else {
      lines.push(['วันที่โน๊ต', 'ร้าน', 'ช่องทาง', 'เลขคำสั่งซื้อ', 'ค่าเปลี่ยน', 'หมายเหตุ', 'ผู้บันทึก', 'วันที่บันทึก'].map(esc).join(','));
      rows.forEach(n => lines.push([fmtDate(n.date_noted), n.store, n.channel, n.order_no, n.exchange_fee, n.remark, n.created_by_name, fmtDateTime(n.created_at)].map(esc).join(',')));
    }

    const csv = '﻿' + lines.join('\r\n');
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
    const res = await API.listNotes({ type: REPORT_TYPE, limit: 500, with_items: REPORT_TYPE === 'sale' ? '1' : '' });
    REPORT.items = res.success ? (res.data || []) : [];
    // เติมช่องทางจริงจากข้อมูลลง dropdown (รวมช่องทางที่พิมพ์เอง)
    const chSel = document.getElementById('rp-channel');
    if (chSel) {
      const cur = chSel.value;
      const chans = [...new Set(REPORT.items.map(n => n.channel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
      chSel.innerHTML = `<option value="">ทั้งหมด</option>` + chans.map(c => `<option${c === cur ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
    }
    REPORT.render();
  },

  render() {
    const store = document.getElementById('rp-store').value;
    const chEl = document.getElementById('rp-channel');
    const channel = chEl ? chEl.value : '';
    const from = document.getElementById('rp-from').value;
    const to = document.getElementById('rp-to').value;
    const q = document.getElementById('rp-q').value.trim().toLowerCase();

    let rows = REPORT.items.filter(n => {
      if (store && n.store !== store) return false;
      if (channel && n.channel !== channel) return false;
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
        <td>${escapeHtml(n.order_no || '-')}${REPORT_TYPE === 'sale' && n.has_tax ? `<div style="margin-top:4px"><span class="badge ${(n.issued === true || n.issued === 'TRUE' || n.issued === 'true') ? 'badge-primary' : 'badge-warning'}">🧾 ${(n.issued === true || n.issued === 'TRUE' || n.issued === 'true') ? 'ออกใบกำกับแล้ว' : 'ขอใบกำกับ'}</span></div>` : ''}</td>
        <td>${detail}<div style="font-size:11px;color:var(--text-muted)">โดย ${escapeHtml(n.created_by_name || '-')} · ${fmtDateTime(n.created_at)}</div></td>
        <td><button class="btn btn-secondary btn-sm" data-v="${n.id}">ดู</button></td>
      </tr>`;
    }).join('');
    tb.querySelectorAll('[data-v]').forEach(b => b.onclick = () => viewNote(b.dataset.v));
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => REPORT.init());
else REPORT.init();
