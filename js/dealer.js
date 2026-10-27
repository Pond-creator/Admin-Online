// ============================================================
//  Admin Online — รายงานเบิกสินค้าผู้แทนจำหน่าย (dealer.html)
//  ไฟล์แยกจาก report.js เพื่อไม่กระทบ 3 หน้ารายงานเดิมที่ใช้ report.js ร่วมกัน
//  ใช้ fmt* / escapeHtml / toast ร่วมจาก dashboard.js + api.js
// ============================================================

// หัวกระดาษของบริษัท (โชว์เฉพาะตอนพิมพ์ใบเบิก) — แก้ที่นี่ที่เดียว
const COMPANY = {
  name: 'บริษัทอโพสโทรฟี แอล จำกัด',
  address: '11 หมู่ 6 ต.บางขุนกอง อ.บางกรวย จ.นนทบุรี 11130',
  phone: '02 432 4999',
  logo: 'img/folio-logo-doc.png'   // ตัดขอบขาวจาก img/folio-logo.jpg ที่ผู้ใช้แนบ (ไฟล์ต้นฉบับยังอยู่)
};

const DEALER = {
  items: [],       // ใบเบิกทั้งหมดที่โหลดมา
  filtered: [],    // หลังกรอง (ใช้ตอน export)
  detail: {},      // แคชรายการสินค้าราย id (กันโหลดซ้ำตอนพิมพ์)

  init() {
    if (!document.getElementById('dr-rows')) return;
    if (!Auth.requirePage('dealer.html')) return;

    const u = Auth.getUser();
    document.getElementById('user-box').innerHTML = `<b>${escapeHtml(u.name)}</b> ${Auth.getRoleBadge(u.role)}`;

    const fpOpts = {
      dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y',
      locale: (window.flatpickr && flatpickr.l10ns && flatpickr.l10ns.th) ? 'th' : 'default', allowInput: true
    };
    flatpickr('#dr-from', fpOpts);
    flatpickr('#dr-to', fpOpts);

    ['dr-customer', 'dr-sale', 'dr-from', 'dr-to'].forEach(id =>
      document.getElementById(id).addEventListener('change', DEALER.render));
    document.getElementById('dr-q').addEventListener('input', DEALER.render);
    document.getElementById('dr-period').addEventListener('change', DEALER.load);
    document.getElementById('dr-export').addEventListener('click', DEALER.exportExcel);
    document.getElementById('dr-print-sel').addEventListener('click', DEALER.printSelected);
    document.getElementById('dr-check-all').addEventListener('change', e => {
      document.querySelectorAll('#dr-rows .dr-sel').forEach(cb => cb.checked = e.target.checked);
      DEALER.updatePrintCount();
    });

    DEALER.load();
  },

  async load() {
    const p = (document.getElementById('dr-period') || {}).value;
    const res = await API.listNotes({
      type: 'dealer', date_from: periodDateFrom(p), limit: periodLimit(p), date_field: 'purchase_date'
    });
    DEALER.items = res.success ? (res.data || []) : [];
    DEALER.detail = {};

    // เติมตัวเลือกผู้แทนฯ / Sale จากข้อมูลจริง
    DEALER.fillOptions('dr-customer', DEALER.items.map(n => n.cust_name));
    DEALER.fillOptions('dr-sale', DEALER.items.map(n => n.sale_person));
    DEALER.render();
  },

  // เติม dropdown โดยคงค่าที่เลือกไว้ (ถ้ายังมีอยู่)
  fillOptions(id, values) {
    const el = document.getElementById(id);
    const keep = el.value;
    const list = [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'th'));
    el.innerHTML = '<option value="">ทั้งหมด</option>' + list.map(v => `<option>${escapeHtml(v)}</option>`).join('');
    if (list.includes(keep)) el.value = keep;
  },

  render() {
    const cust = document.getElementById('dr-customer').value;
    const sale = document.getElementById('dr-sale').value;
    const from = document.getElementById('dr-from').value;
    const to   = document.getElementById('dr-to').value;
    const q    = document.getElementById('dr-q').value.trim().toLowerCase();

    let rows = DEALER.items.filter(n => {
      if (cust && n.cust_name !== cust) return false;
      if (sale && n.sale_person !== sale) return false;
      const d = String(n.purchase_date || n.date_noted || '');
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (q && ![n.order_no, n.cust_name, n.sale_person, n.remark].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    // ใหม่→เก่า ตามวันที่สั่งซื้อ (วันเดียวกันใช้เวลาที่บันทึกตัดสิน)
    rows.sort((a, b) =>
      String(b.purchase_date || b.date_noted).localeCompare(String(a.purchase_date || a.date_noted))
      || String(b.created_at).localeCompare(String(a.created_at)));
    DEALER.filtered = rows;

    document.getElementById('dr-count').textContent = rows.length;
    document.getElementById('dr-sum').textContent =
      rows.reduce((s, n) => s + (+n.total_qty || 0), 0).toLocaleString('en-US');
    document.getElementById('dr-money').textContent =
      fmtMoney(rows.reduce((s, n) => s + (+n.grand_total || 0), 0));

    const tb = document.getElementById('dr-rows');
    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:30px">ไม่พบใบเบิก</td></tr>`;
      DEALER.updatePrintCount();
      return;
    }
    tb.innerHTML = rows.map(n => `<tr>
      <td style="text-align:center"><input type="checkbox" class="dr-sel" value="${n.id}"></td>
      <td><b>${escapeHtml(n.order_no || '-')}</b></td>
      <td>${fmtDate(n.purchase_date || n.date_noted)}</td>
      <td>${n.deadline ? fmtDate(n.deadline) : '-'}</td>
      <td>${escapeHtml(n.sale_person || '-')}</td>
      <td>${escapeHtml(n.cust_name || '-')}</td>
      <td style="text-align:right;font-weight:700">${(+n.total_qty || 0).toLocaleString('en-US')}</td>
      <td style="text-align:right;font-weight:700;color:var(--primary)">${fmtMoney(n.grand_total)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" data-v="${n.id}">ดู</button>
        <button class="btn btn-primary btn-sm" data-p="${n.id}" style="margin-left:4px">🖨️</button>
      </td></tr>`).join('');

    tb.querySelectorAll('[data-v]').forEach(b => b.onclick = () => viewNote(b.dataset.v));
    tb.querySelectorAll('[data-p]').forEach(b => b.onclick = () => DEALER.printOne(b.dataset.p));
    tb.querySelectorAll('.dr-sel').forEach(cb => cb.addEventListener('change', DEALER.updatePrintCount));
    document.getElementById('dr-check-all').checked = false;
    DEALER.updatePrintCount();
  },

  updatePrintCount() {
    const n = document.querySelectorAll('#dr-rows .dr-sel:checked').length;
    document.getElementById('dr-print-sel').textContent = `🖨️ พิมพ์ที่เลือก (${n})`;
  },

  // ดึงรายการสินค้าของใบเบิก (แคชไว้ ไม่ดึงซ้ำ)
  async fetchItems(id, opts) {
    if (DEALER.detail[id]) return DEALER.detail[id];
    const res = await API.getNote(id, opts);
    if (!res.success) return null;
    DEALER.detail[id] = res.data;
    return res.data;
  },

  // ===== พิมพ์ / PDF =====
  async printOne(id) {
    const data = await DEALER.fetchItems(id);
    if (!data) return toast('โหลดใบเบิกไม่ได้', 'error');
    DEALER.renderPrint([data]);
  },

  async printSelected() {
    const ids = [...document.querySelectorAll('#dr-rows .dr-sel:checked')].map(c => c.value);
    if (!ids.length) return toast('เลือกใบเบิกที่ต้องการพิมพ์ก่อน', 'warning');
    showLoader('กำลังเตรียมเอกสาร...');
    const list = [];
    for (let i = 0; i < ids.length; i++) {
      if (typeof setLoaderLabel === 'function') setLoaderLabel(`กำลังโหลด ${i + 1}/${ids.length}`);
      const d = await DEALER.fetchItems(ids[i], { silent: true });
      if (d) list.push(d);
    }
    hideLoader();
    if (!list.length) return toast('โหลดใบเบิกไม่ได้', 'error');
    DEALER.renderPrint(list);
  },

  // แสดงเอกสาร: วัดความสูงจริงแล้วแบ่งหน้าเอง → คุมได้ว่าหน้า 2+ ไม่มีหัวโลโก้ และใส่เลขหน้า X/Y ได้
  async renderPrint(list) {
    const root = document.getElementById('modal-root');
    root.innerHTML = '<div id="print-area" class="print-only-area"></div>';
    const area = document.getElementById('print-area');

    for (const data of list) {
      const pages = await DEALER.buildPages(data);
      area.insertAdjacentHTML('beforeend', pages);
    }
    // รอรูปโหลดครบก่อนสั่งพิมพ์ ไม่งั้นหัวกระดาษอาจว่าง
    const imgs = [...area.querySelectorAll('img')];
    await Promise.all(imgs.map(im => im.complete ? Promise.resolve()
      : new Promise(r => { im.onload = im.onerror = r; })));
    // เคลียร์เอกสารทิ้งหลังพิมพ์/ยกเลิก ไม่ให้ค้างอยู่ในหน้า
    const clear = () => { root.innerHTML = ''; window.removeEventListener('afterprint', clear); };
    window.addEventListener('afterprint', clear);
    setTimeout(() => window.print(), 80);
  },

  // ===== แบ่งหน้าแบบวัดจริง =====
  // A4 = 297mm, ขอบบน-ล่างอย่างละ 14mm → พื้นที่ใช้งาน 269mm · กว้าง 210-28 = 182mm
  async buildPages(data) {
    const n = data.note;
    const items = data.dealer_items || [];
    const parts = DEALER.docParts(data);

    // กล่องวัดความสูง — กว้างเท่ากระดาษจริง ซ่อนไว้นอกจอ (ไม่ใช่ display:none ไม่งั้นวัดไม่ได้)
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-99999px;top:0;width:182mm;visibility:hidden';
    probe.innerHTML = `<div class="dl-doc">${parts.head}${parts.info}${parts.cont}
      <table class="dl-table"><thead>${parts.thead}</thead><tbody>
      ${parts.rows.join('')}${parts.totalRow}</tbody></table>${parts.remark}
      <div class="dl-pageno">หน้า 1/1</div></div>`;
    document.body.appendChild(probe);

    // รอรูปในกล่องวัดโหลดเสร็จ ไม่งั้นความสูงหัวกระดาษวัดได้ 0
    await Promise.all([...probe.querySelectorAll('img')].map(im =>
      im.complete ? Promise.resolve() : new Promise(r => { im.onload = im.onerror = r; })));

    const mm = probe.querySelector('.dl-doc').offsetWidth / 182;   // px ต่อ 1mm
    const h = el => el ? Math.ceil(el.getBoundingClientRect().height) : 0;
    const PAGE   = Math.floor(269 * mm);
    const headH  = h(probe.querySelector('.dl-head')) + h(probe.querySelector('.dl-info')) + Math.ceil(8 * mm);
    const contH  = h(probe.querySelector('.dl-cont')) + Math.ceil(4 * mm);
    const theadH = h(probe.querySelector('.dl-table thead'));
    const footH  = h(probe.querySelector('.dl-pageno')) + Math.ceil(4 * mm);
    const remarkH = h(probe.querySelector('.dl-remark'));
    const bodyRows = [...probe.querySelectorAll('.dl-table tbody tr')];
    const rowH = bodyRows.map(h);
    const totalRowH = rowH.length ? rowH[rowH.length - 1] : 0;
    const itemH = rowH.slice(0, items.length);
    probe.remove();

    // จัดแถวลงหน้า — หน้าแรกเสียพื้นที่ให้หัวกระดาษ หน้าถัดไปเสียแค่บรรทัดต่อเนื่อง
    const budget = first => PAGE - footH - theadH - (first ? headH : contH);
    const chunks = [];
    let cur = [], used = 0;
    for (let i = 0; i < itemH.length; i++) {
      const b = budget(chunks.length === 0);
      // แถวสุดท้าย ต้องเผื่อที่ให้แถว "รวม" + หมายเหตุ อยู่หน้าเดียวกัน
      const need = itemH[i] + (i === itemH.length - 1 ? totalRowH + remarkH : 0);
      if (cur.length && used + need > b) { chunks.push(cur); cur = []; used = 0; }
      cur.push(i); used += itemH[i];
    }
    chunks.push(cur);
    // ถ้าแถว "รวม" ล้นหน้าสุดท้ายจริงๆ ให้ดันไปหน้าใหม่
    const lastUsed = chunks[chunks.length - 1].reduce((t, i) => t + itemH[i], 0);
    if (lastUsed + totalRowH + remarkH > budget(chunks.length === 1)) chunks.push([]);

    const total = chunks.length;
    return chunks.map((idxs, p) => {
      const isFirst = p === 0, isLast = p === total - 1;
      return `<div class="dl-doc dl-page">
        ${isFirst ? parts.head + parts.info : parts.cont}
        <table class="dl-table"><thead>${parts.thead}</thead><tbody>
          ${idxs.map(i => parts.rows[i]).join('')}
          ${isLast ? parts.totalRow : ''}
        </tbody></table>
        ${isLast ? parts.remark : ''}
        <div class="dl-pageno">หน้า ${p + 1}/${total}</div>
      </div>`;
    }).join('');
  },

  // ชิ้นส่วนของเอกสาร (เอาไปประกอบเป็นหน้าๆ)
  docParts(data) {
    const n = data.note;
    const items = data.dealer_items || [];
    const total = items.reduce((s, i) => s + (+i.qty || 0), 0);
    const totalMoney = items.reduce((s, i) => s + (+i.line_total || 0), 0);
    const addr = String(n.cust_address || '').split('\n').filter(Boolean)
      .map(l => `<div>${escapeHtml(l)}</div>`).join('');

    return {
      head: `
      <div class="dl-head">
        <img class="dl-logo" src="${COMPANY.logo}" alt="Folio">
        <div class="dl-co">
          <div class="dl-co-name">${escapeHtml(COMPANY.name)}</div>
          <div>${escapeHtml(COMPANY.address)}</div>
          <div>โทร : ${escapeHtml(COMPANY.phone)}</div>
        </div>
      </div>`,

      info: `
      <div class="dl-info">
        <div class="dl-info-l">
          <div class="dl-row"><span class="dl-lb">Sale</span><span class="dl-vl">${escapeHtml(n.sale_person || '-')}</span></div>
          <div class="dl-row"><span class="dl-lb">Customer</span><span class="dl-vl">${escapeHtml(n.cust_name || '-')}</span></div>
          <div class="dl-row"><span class="dl-lb">ที่อยู่</span><span class="dl-vl">${addr || '-'}
            ${n.cust_phone ? `<div>Tel. : ${escapeHtml(n.cust_phone)}</div>` : ''}</span></div>
        </div>
        <div class="dl-info-r">
          <div>วันที่สั่งซื้อ : ${fmtDateBE(n.purchase_date || n.date_noted)}</div>
          <div>กำหนดส่ง : ${n.deadline ? fmtDateBE(n.deadline) : '-'}</div>
          ${n.ship_by ? `<div class="dl-ship">จัดส่งโดย${escapeHtml(n.ship_by)}</div>` : ''}
          <div class="dl-docno">เลขที่ : ${escapeHtml(n.order_no || '-')}</div>
        </div>
      </div>`,

      // หน้า 2 เป็นต้นไป — ไม่มีโลโก้/ที่อยู่บริษัท เหลือแค่บรรทัดบอกว่าเป็นใบไหน (กันเอกสารหลุดปน)
      cont: `<div class="dl-cont">ใบเบิกเลขที่ ${escapeHtml(n.order_no || '-')} · ${escapeHtml(n.cust_name || '-')} <span>(ต่อ)</span></div>`,

      thead: `<tr>
        <th style="width:34px">ลำดับ</th><th style="width:112px">รหัส</th>
        <th>ชื่อสินค้า</th><th style="width:78px">สี</th><th style="width:44px">จำนวน</th>
        <th style="width:64px">ราคา/ชิ้น</th><th style="width:74px">รวมเงิน</th>
      </tr>`,

      rows: items.map((it, i) => `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td class="dl-code">${escapeHtml(it.code || '')}</td>
        <td>${escapeHtml(it.name || '')}</td>
        <td>${escapeHtml(it.color || '')}</td>
        <td style="text-align:center">${it.qty}</td>
        <td style="text-align:right">${fmtMoney(it.price)}</td>
        <td style="text-align:right">${fmtMoney(it.line_total)}</td></tr>`),

      totalRow: `<tr class="dl-total"><td colspan="4" style="text-align:right">รวม</td>
        <td style="text-align:center">${total.toLocaleString('en-US')}</td>
        <td></td><td style="text-align:right">${fmtMoney(totalMoney)}</td></tr>`,

      remark: n.remark ? `<div class="dl-remark"><b>หมายเหตุ</b><div class="remark-text">${escapeHtml(n.remark)}</div></div>` : ''
    };
  },

  // ===== Export Excel (CSV + BOM เปิดด้วย Excel ภาษาไทยไม่เพี้ยน) =====
  async exportExcel() {
    const rows = DEALER.filtered;
    if (!rows.length) return toast('ไม่มีข้อมูลให้ export', 'warning');

    showLoader('กำลังเตรียมไฟล์...');
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    const lines = [];
    const from = document.getElementById('dr-from').value, to = document.getElementById('dr-to').value;
    lines.push(esc(`รายงานเบิกสินค้าผู้แทนจำหน่าย · ดึงตามวันที่สั่งซื้อ ตั้งแต่ ${from ? fmtDate(from) : '-'} ถึง ${to ? fmtDate(to) : '-'}`));
    lines.push(['เลขที่ใบเบิก', 'วันที่สั่งซื้อ', 'กำหนดส่ง', 'Sale', 'ผู้แทนจำหน่าย', 'จัดส่งโดย',
      'ลำดับ', 'รหัสสินค้า', 'ชื่อสินค้า', 'สี', 'จำนวน', 'ราคา/ชิ้น', 'รวมเงิน', 'หมายเหตุ'].map(esc).join(','));

    // export แยกรายสินค้า (1 แถว/ชิ้น) — ต้องดึงรายการของแต่ละใบ
    for (let i = 0; i < rows.length; i++) {
      if (typeof setLoaderLabel === 'function') setLoaderLabel(`กำลังรวบรวม ${i + 1}/${rows.length}`);
      const n = rows[i];
      const d = await DEALER.fetchItems(n.id, { silent: true });
      const items = (d && d.dealer_items) || [];
      if (!items.length) continue;
      items.forEach((it, idx) => lines.push([
        n.order_no, fmtDate(n.purchase_date || n.date_noted), n.deadline ? fmtDate(n.deadline) : '',
        n.sale_person, n.cust_name, n.ship_by,
        idx + 1, it.code, it.name, it.color, it.qty, it.price, it.line_total, n.remark
      ].map(esc).join(',')));
    }
    hideLoader();

    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'รายงานเบิกสินค้า_' + nowStamp().replace(/[\/: ]/g, '-') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('ดาวน์โหลดไฟล์แล้ว (เปิดด้วย Excel ได้)', 'success');
  }
};

// วันที่แบบ วว-ดด-ปปปป พ.ศ. (ตามใบตัวอย่าง เช่น 15-09-2569)
function fmtDateBE(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '-';
  return `${m[3]}-${m[2]}-${+m[1] + 543}`;
}

document.addEventListener('DOMContentLoaded', DEALER.init);
