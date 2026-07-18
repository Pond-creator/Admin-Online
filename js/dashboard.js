// ============================================================
//  Admin Online — Dashboard Logic
// ============================================================
if (!Auth.requireAuth()) throw new Error('no auth');

const TYPE_LABELS = { sale: 'ออเดอร์ขาย', exchange: 'เปลี่ยนสินค้า', cancel: 'ยกเลิก', tax: 'ออกใบกำกับ' };
const TYPE_BADGE  = { sale: 'success', exchange: 'info', cancel: 'danger', tax: 'primary' };
const DEFAULT_META = {
  stores: ['FO', 'FA', 'FF', 'GB'],
  channels: ['Facebook', 'Line', 'Shopee', 'Lazada', 'TikTok', 'Walk-in', 'Website', 'อื่นๆ'],
  types: [
    { key: 'tax', label: 'ออกใบกำกับภาษี' }, { key: 'sale', label: 'ออเดอร์ขาย' },
    { key: 'exchange', label: 'เปลี่ยนสินค้า' }, { key: 'cancel', label: 'ยกเลิก' }
  ]
};
let META = DEFAULT_META;
let ALL = [];              // โน๊ตทั้งหมดที่โหลดมา
let byDeadline = false;    // โหมดเรียงตาม deadline
let dashPage = 0;          // หน้าปัจจุบัน
const DASH_PER = 50;       // 50 บรรทัด/หน้า
function rerender0() { dashPage = 0; render(); }   // กรอง/ค้นหา → กลับหน้าแรก

document.addEventListener('DOMContentLoaded', init);

async function init() {
  if (!document.getElementById('f-type')) return;   // ไม่ใช่หน้ารายการโน๊ต → ไม่รัน
  if (!Auth.requirePage('dashboard.html')) return;   // ไม่มีสิทธิ์ดู → เด้งออก
  const u = Auth.getUser();
  document.getElementById('user-box').innerHTML =
    `<b>${escapeHtml(u.name)}</b> ${Auth.getRoleBadge(u.role)}`;

  const meta = await API.getMeta();
  if (meta.success && meta.data) META = meta.data;
  const ORDER = ['tax', 'sale', 'exchange', 'cancel'];
  META.types = (META.types || []).slice().sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  META.stores = (META.stores || []).filter(s => s !== 'อื่นๆ');   // ไม่ให้เลือกร้าน "อื่นๆ"
  addOptions('f-type', META.types.map(t => ({ v: t.key, l: t.label })));
  addOptions('f-store', META.stores.map(s => ({ v: s, l: s })));
  addOptions('f-channel', META.channels.map(c => ({ v: c, l: c })));

  const fpOpts = {
    dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y',
    locale: (window.flatpickr && flatpickr.l10ns && flatpickr.l10ns.th) ? 'th' : 'default', allowInput: true
  };
  flatpickr('#f-from', fpOpts);
  flatpickr('#f-to', fpOpts);

  // ทุกตัวกรอง → กรองสดทันที (client-side) + กลับไปหน้าแรก
  ['f-type', 'f-store', 'f-channel'].forEach(id =>
    document.getElementById(id).addEventListener('change', rerender0));
  document.getElementById('f-q').addEventListener('input', rerender0);
  document.getElementById('f-from').addEventListener('change', rerender0);
  document.getElementById('f-to').addEventListener('change', rerender0);
  document.getElementById('btn-deadline').addEventListener('click', () => {
    byDeadline = !byDeadline;
    document.getElementById('btn-deadline').classList.toggle('btn-success', byDeadline);
    document.getElementById('btn-deadline').classList.toggle('btn-secondary', !byDeadline);
    rerender0();
  });
  document.getElementById('btn-clear').addEventListener('click', clearFilters);

  load();
}

function addOptions(id, arr) {
  const sel = document.getElementById(id);
  arr.forEach(o => sel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(o.v)}">${escapeHtml(o.l)}</option>`));
}

function clearFilters() {
  ['f-type', 'f-store', 'f-channel'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-q').value = '';
  [document.querySelector('#f-from')._flatpickr, document.querySelector('#f-to')._flatpickr].forEach(fp => fp && fp.clear());
  byDeadline = false;
  document.getElementById('btn-deadline').classList.remove('btn-success');
  document.getElementById('btn-deadline').classList.add('btn-secondary');
  rerender0();
}

async function load() {
  const tbody = document.getElementById('rows');
  tbody.innerHTML = row8('กำลังโหลด...');
  const res = await API.listNotes({ limit: 500 });
  if (!res.success) { tbody.innerHTML = row8('โหลดข้อมูลไม่ได้: ' + res.message); return; }
  ALL = res.data || [];
  dashPage = 0;
  render();
}

function render() {
  const tbody = document.getElementById('rows');
  const type = document.getElementById('f-type').value;
  const store = document.getElementById('f-store').value;
  const channel = document.getElementById('f-channel').value;
  const from = document.getElementById('f-from').value;   // Y-m-d
  const to = document.getElementById('f-to').value;
  const q = document.getElementById('f-q').value.trim().toLowerCase();

  let rows = ALL.filter(n => {
    if (type && n.type !== type) return false;
    if (store && n.store !== store) return false;
    if (channel && n.channel !== channel) return false;
    if (from && String(n.date_noted || '') < from) return false;
    if (to && String(n.date_noted || '') > to) return false;
    if (q) {
      const hay = [n.order_no, n.remark, n.customer, n.store, n.channel].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (byDeadline) {
    // เฉพาะที่มี deadline → เรียงใกล้สุดก่อน
    rows = rows.filter(n => n.deadline).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
  }

  const pager = document.getElementById('dash-pager');
  if (!rows.length) {
    tbody.innerHTML = row8(byDeadline ? 'ไม่มีรายการที่มี deadline' : 'ไม่พบรายการ');
    if (pager) pager.innerHTML = '';
    return;
  }

  // แบ่งหน้า 50 บรรทัด
  const total = rows.length;
  const pages = Math.ceil(total / DASH_PER);
  if (dashPage >= pages) dashPage = pages - 1;
  if (dashPage < 0) dashPage = 0;
  const start = dashPage * DASH_PER;
  const pageRows = rows.slice(start, start + DASH_PER);

  tbody.innerHTML = pageRows.map(n => {
    const dl = deadlineTag(n.deadline);
    const cust = n.customer ? `<div style="font-size:11px;color:var(--text-muted)">${escapeHtml(n.customer)}</div>` : '';
    return `
    <tr>
      <td>${fmtDate(n.date_noted)}</td>
      <td><span class="badge badge-${TYPE_BADGE[n.type] || 'muted'}">${TYPE_LABELS[n.type] || n.type}</span></td>
      <td>${escapeHtml(n.store)}</td>
      <td>${escapeHtml(n.channel)}</td>
      <td>${escapeHtml(n.order_no || '-')}${cust}${dl}</td>
      <td style="text-align:right">${n.type === 'sale' ? fmtMoney(n.grand_total) : '-'}</td>
      <td>${escapeHtml(n.created_by_name || '-')}<div style="font-size:11px;color:var(--text-muted)">${fmtDateTime(n.created_at)}</div></td>
      <td><button class="btn btn-secondary btn-sm" data-view="${n.id}">ดู</button></td>
    </tr>`; }).join('');

  document.querySelectorAll('[data-view]').forEach(b =>
    b.addEventListener('click', () => viewNote(b.dataset.view)));

  if (pager) {
    pager.innerHTML = pages > 1 ? `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <span style="font-size:13px;color:var(--text-secondary)">ทั้งหมด ${total} รายการ · แสดง ${start + 1}-${start + pageRows.length}</span>
        <span style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-secondary btn-sm" id="dp-prev" ${dashPage === 0 ? 'disabled' : ''}>← ก่อนหน้า</button>
          <span style="font-size:13px">หน้า ${dashPage + 1}/${pages}</span>
          <button class="btn btn-secondary btn-sm" id="dp-next" ${dashPage >= pages - 1 ? 'disabled' : ''}>ถัดไป →</button>
        </span>
      </div>` : `<span style="font-size:13px;color:var(--text-secondary)">ทั้งหมด ${total} รายการ</span>`;
    const prev = document.getElementById('dp-prev'), next = document.getElementById('dp-next');
    if (prev) prev.onclick = () => { dashPage--; render(); window.scrollTo(0, 0); };
    if (next) next.onclick = () => { dashPage++; render(); window.scrollTo(0, 0); };
  }
}

// จำนวนวันจากวันนี้ถึง deadline (บวก=อีกกี่วัน, ลบ=เกินมาแล้วกี่วัน)
function daysUntil(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const target = new Date(+m[1], +m[2] - 1, +m[3]);
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((target - today) / 86400000);
}

// ป้าย deadline (แดงถ้าเกินกำหนด)
function deadlineTag(ymd) {
  if (!ymd) return '';
  const d = daysUntil(ymd);
  if (d === null) return '';
  if (d < 0) return `<div style="font-size:11px;color:var(--danger);font-weight:700">⚠️ เกินกำหนด ${-d} วัน · ใช้ ${fmtDate(ymd)}</div>`;
  if (d === 0) return `<div style="font-size:11px;color:var(--danger);font-weight:700">⚠️ ครบกำหนดวันนี้ · ${fmtDate(ymd)}</div>`;
  return `<div style="font-size:11px;color:var(--warning)">🗓️ ใช้ ${fmtDate(ymd)} (อีก ${d} วัน)</div>`;
}

function row8(msg) {
  return `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:30px">${escapeHtml(msg)}</td></tr>`;
}

// ====== Detail modal ======
async function viewNote(id) {
  const res = await API.getNote(id);
  if (!res.success) return toast(res.message || 'โหลดไม่ได้', 'error');
  const { note } = res.data;
  const body = noteBodyHtml(res.data);

  const isIssued = (note.issued === true || note.issued === 'TRUE' || note.issued === 'true');
  // ออกเอกสารได้: ใบกำกับ (tax) หรือ ออเดอร์ขายที่มีข้อมูลใบกำกับ
  const hasTaxInfo = (note.type === 'tax') || (note.type === 'sale' && res.data.tax);
  const canIssue = hasTaxInfo && !isIssued && Auth.can('issue');

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="mb">
      <div class="modal-card" id="print-area">
        <div class="print-only" style="text-align:center;margin-bottom:14px">
          <div style="font-size:20px;font-weight:700;color:#000">Admin Online — Folio</div>
          <div style="font-size:13px;color:#555">รายละเอียดโน๊ต · ${TYPE_LABELS[note.type] || note.type}</div>
          <div style="font-size:12px;color:#777;margin-top:2px">พิมพ์เมื่อ ${nowStamp()} น.</div>
        </div>
        <div class="no-print" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="color:var(--primary)">รายละเอียดโน๊ต</h3>
          <div style="display:flex;gap:8px">
            ${canIssue ? `<button class="btn btn-success btn-sm" id="m-issue">📄 จัดการออกเอกสาร</button>` : ''}
            <button class="btn btn-primary btn-sm" id="m-print">🖨️ พิมพ์/PDF</button>
            <button class="btn btn-secondary btn-sm" id="m-close">✕ ปิด</button>
          </div>
        </div>
        ${body}
        <div style="margin-top:18px;font-size:12px;color:var(--text-muted)">บันทึกโดย ${escapeHtml(note.created_by_name || '-')} · ${fmtDateTime(note.created_at)}</div>
        ${note.updated_at ? `<div style="font-size:12px;color:var(--warning)">✏️ แก้ไขล่าสุด ${fmtDateTime(note.updated_at)}</div>` : ''}
      </div>
    </div>`;
  document.getElementById('m-close').addEventListener('click', closeModal);
  document.getElementById('m-print').addEventListener('click', () => window.print());
  document.getElementById('mb').addEventListener('click', e => { if (e.target.id === 'mb') closeModal(); });
  if (canIssue) document.getElementById('m-issue').addEventListener('click', () => issueModal(res.data));
}

// สร้าง HTML เนื้อหารายละเอียดโน๊ต (ใช้ซ้ำทั้งหน้าดู / ออกเอกสาร / รายงานที่ออกแล้ว)
function noteBodyHtml(data) {
  const { note, sale_items, exchange_from, exchange_to, tax } = data;

  let body = `
    <div class="detail-grid">
      <div class="k">ประเภท</div><div><span class="badge badge-${TYPE_BADGE[note.type]}">${TYPE_LABELS[note.type]}</span></div>
      <div class="k">วันที่โน๊ต</div><div>${fmtDate(note.date_noted)}</div>
      <div class="k">ร้านค้า</div><div>${escapeHtml(note.store)}</div>
      <div class="k">ช่องทางขาย</div><div>${escapeHtml(note.channel)}</div>
      <div class="k">เลขคำสั่งซื้อ</div><div>${escapeHtml(note.order_no || '-')}</div>
      <div class="k">วันที่สั่งซื้อ</div><div>${fmtDate(note.purchase_date)}</div>
      ${(note.type === 'tax' || note.deadline) ? `<div class="k">🗓️ ลูกค้าต้องใช้เอกสาร</div><div style="color:var(--danger);font-weight:700">${note.deadline ? (fmtDate(note.deadline) + (daysUntil(note.deadline) < 0 ? ' · เกินกำหนด ' + (-daysUntil(note.deadline)) + ' วัน' : (daysUntil(note.deadline) === 0 ? ' · ครบกำหนดวันนี้' : ' · อีก ' + daysUntil(note.deadline) + ' วัน'))) : '-'}</div>` : ''}
    </div><hr style="border-color:var(--border);margin:16px 0">`;

  if (note.type === 'sale') {
    if (note.cust_name || note.cust_address || note.cust_phone) {
      body += `<div class="detail-grid" style="margin-bottom:12px">
        <div class="k">ลูกค้า</div><div><b>${escapeHtml(note.cust_name || '-')}</b></div>
        ${note.cust_address ? `<div class="k">ที่อยู่</div><div>${escapeHtml(note.cust_address)}</div>` : ''}
        ${note.cust_phone ? `<div class="k">เบอร์ติดต่อ</div><div>${escapeHtml(note.cust_phone)}</div>` : ''}
      </div>`;
    }
    body += `<table style="margin-bottom:12px"><thead><tr>
        <th>รหัส</th><th>สินค้า</th><th>สี</th><th style="text-align:right">จำนวน</th>
        <th style="text-align:right">ราคา</th><th style="text-align:right">ส่วนลด</th><th style="text-align:right">รวม</th>
      </tr></thead><tbody>` +
      sale_items.map(i => {
        const gift = (i.is_gift === true || i.is_gift === 'TRUE' || i.is_gift === 'true');
        return `<tr${gift ? ' style="background:rgba(31,164,99,0.06)"' : ''}>
        <td>${escapeHtml(i.code)}</td>
        <td>${escapeHtml(i.name)} ${gift ? '<span class="badge badge-success">🎁 ของแถม</span>' : ''}</td>
        <td>${escapeHtml(i.color)}</td>
        <td style="text-align:right">${i.qty}</td>
        <td style="text-align:right">${fmtMoney(i.price)}</td>
        <td style="text-align:right">${gift ? 'แถม' : fmtMoney(i.discount)}</td>
        <td style="text-align:right">${gift ? '🎁 แถม' : fmtMoney(i.line_total)}</td>
      </tr>`; }).join('') + `</tbody></table>`;
    const isGift = i => (i.is_gift === true || i.is_gift === 'TRUE' || i.is_gift === 'true');
    const gross = sale_items.reduce((s, i) => s + (+i.qty || 0) * (+i.price || 0), 0);
    const disc = sale_items.reduce((s, i) => s + (isGift(i) ? (+i.qty || 0) * (+i.price || 0) : (+i.discount || 0)), 0);
    body += `<div class="total-box">
        <div class="total-row"><span>รวมราคาสินค้า (ก่อนหักส่วนลด)</span><span>${fmtMoney(gross)}</span></div>
        <div class="total-row"><span>รวมส่วนลด</span><span style="color:var(--danger)">-${fmtMoney(disc)}</span></div>
        <div class="total-row"><span>รวมหลังหักส่วนลด</span><span>${fmtMoney(gross - disc)}</span></div>
        <div class="total-row"><span>ค่าจัดส่ง</span><span>${fmtMoney(note.shipping_fee)}</span></div>
        <div class="total-row grand"><span>ยอดที่ต้องชำระ</span><span>${fmtMoney(note.grand_total)}</span></div>
      </div>`;
  } else if (note.type === 'exchange') {
    body += `<div class="grid-2">
      <div><h4 style="margin-bottom:8px">🔴 เปลี่ยนจาก</h4>${exItems(exchange_from)}</div>
      <div><h4 style="margin-bottom:8px">🟢 เปลี่ยนเป็น</h4>${exItems(exchange_to)}</div>
    </div>`;
    if (note.exchange_fee && +note.exchange_fee > 0)
      body += `<div class="detail-grid" style="margin-top:12px"><div class="k">ค่าเปลี่ยน</div><div style="color:var(--primary);font-weight:700">${fmtMoney(note.exchange_fee)} บาท</div></div>`;
  } else if (note.type === 'cancel') {
    body += `<div class="detail-grid">
      <div class="k">สาเหตุ</div><div>${escapeHtml(note.cancel_reason || '-')}</div>
      <div class="k">สถานะการส่งคืน</div><div>${escapeHtml(note.cancel_status || '-')}</div>
      <div class="k">สถานะสินค้าที่คืน</div><div>${escapeHtml(note.cancel_item_status || '-')}</div>
      <div class="k">คลังที่รับเข้า</div><div>${escapeHtml(note.cancel_warehouse || '-')}</div>
    </div>`;
  } else if (note.type === 'tax' && tax) {
    body += taxDetailHtml(tax);
  }

  // ออเดอร์ขายที่พ่วงใบกำกับ → แสดงข้อมูลใบกำกับด้วย
  if (note.type === 'sale' && tax) {
    body += `<hr style="border-color:var(--border);margin:16px 0"><div class="k" style="color:var(--primary);font-weight:600;margin-bottom:8px">🧾 ข้อมูลใบกำกับภาษี</div>` + taxDetailHtml(tax);
  }

  if (note.remark) body += `<div style="margin-top:14px"><div class="k" style="color:var(--text-muted);font-size:12px">หมายเหตุ</div>${escapeHtml(note.remark)}</div>`;

  const imgs = (note.images || '').split(',').filter(Boolean);
  if (imgs.length) {
    body += `<div style="margin-top:14px"><div class="k" style="color:var(--text-muted);font-size:12px">รูปแนบ (ชี้เพื่อดูรูปใหญ่)</div><div class="img-previews">` +
      imgs.map(u => `<a href="${u.replace('&sz=w1000', '')}" target="_blank" class="img-zoom-wrap" title="ชี้ดูรูปใหญ่ / คลิกเปิดเต็ม"><img class="thumb" src="${u}"><img class="zoom" src="${u.replace('sz=w1000', 'sz=w1600')}"></a>`).join('') + `</div></div>`;
  }

  // เอกสารใบกำกับตัวจริง (ถ้าออกแล้ว)
  const inv = (note.invoice_files || '').split(',').filter(Boolean);
  if (inv.length) {
    body += `<div style="margin-top:14px"><div class="k" style="color:var(--success);font-size:12px;font-weight:600">📄 เอกสารใบกำกับตัวจริง</div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">` +
      inv.map((u, i) => `<a class="btn btn-secondary btn-sm" href="${u}" target="_blank">⬇️ เอกสาร ${i + 1}</a>`).join('') + `</div></div>`;
  }
  if (note.issued_at) body += `<div style="margin-top:8px;font-size:12px;color:var(--success)">✅ ออกเอกสารแล้ว · ${fmtDateTime(note.issued_at)}</div>`;

  return body;
}

function taxDetailHtml(tax) {
  let h = `<div class="detail-grid">
      <div class="k">ประเภท</div><div>${tax.entity_type === 'company' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}${tax.branch ? ' · ' + escapeHtml(tax.branch) : ''}</div>
      <div class="k">เลขผู้เสียภาษี</div><div>${escapeHtml(tax.tax_id)}</div>
      <div class="k">${tax.entity_type === 'company' ? 'ชื่อบริษัท' : 'ชื่อ-สกุล'}</div><div>${escapeHtml((tax.name || '') + ' ' + (tax.surname || ''))}</div>
      <div class="k">ที่อยู่</div><div>${escapeHtml(tax.address)}</div>
      <div class="k">โทร</div><div>${escapeHtml(tax.phone || '-')}</div>
      <div class="k">Email</div><div>${escapeHtml(tax.email || '-')}</div>`;
  if (tax.ship_address) {
    h += `<div class="k" style="grid-column:1/3;color:var(--primary);margin-top:8px">ที่อยู่จัดส่งใบกำกับ</div>
        <div class="k">ชื่อ-สกุล</div><div>${escapeHtml((tax.ship_name || '') + ' ' + (tax.ship_surname || ''))}</div>
        <div class="k">ที่อยู่</div><div>${escapeHtml(tax.ship_address)}</div>
        <div class="k">โทร</div><div>${escapeHtml(tax.ship_phone || '-')}</div>`;
  }
  return h + `</div>`;
}

function exItems(arr) {
  if (!arr || !arr.length) return '<div style="color:var(--text-muted)">-</div>';
  return arr.map(i => `<div class="item-card" style="margin-bottom:8px">
    <div><b>${escapeHtml(i.code)}</b></div>
    <div style="font-size:13px">${escapeHtml(i.name)}</div>
    <div style="font-size:13px;color:var(--text-secondary)">สี: ${escapeHtml(i.color || '-')}</div>
    ${i.remark ? `<div style="font-size:12px;color:var(--text-muted)">${escapeHtml(i.remark)}</div>` : ''}
  </div>`).join('');
}

// ====== ออกเอกสารใบกำกับ (ซ้าย=พรีวิว, ขวา=ฟอร์มออกเอกสาร) ======
function issueModal(data) {
  const note = data.note;
  const files = [];
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" id="mb2">
      <div class="modal-card" style="max-width:900px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="color:var(--primary)">📄 จัดการออกเอกสารใบกำกับภาษี</h3>
          <button class="btn btn-secondary btn-sm" id="mi-close">✕ ปิด</button>
        </div>
        <div class="grid-2" style="gap:20px;align-items:start">
          <div>${noteBodyHtml(data)}</div>
          <div class="card" style="background:var(--bg-card2)">
            <div class="section-title">ออกเอกสาร</div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:16px;font-size:15px">
              <input type="checkbox" id="mi-issued"> <span>✅ ออกเอกสารแล้ว</span>
            </label>
            <div class="form-group">
              <label class="form-label">แนบเอกสารตัวจริง (รูป / PDF — หลายไฟล์ได้)</label>
              <input type="file" id="mi-files" class="form-control" accept="image/*,application/pdf" multiple>
              <div id="mi-list" style="margin-top:10px"></div>
            </div>
            <button class="btn btn-primary" id="mi-save" style="width:100%">💾 บันทึกการออกเอกสาร</button>
            <div style="font-size:11px;color:var(--text-muted);margin-top:8px">* ไฟล์จะเก็บที่โฟลเดอร์ invoice · เมื่อออกแล้วรายการจะย้ายไปหน้า "ใบกำกับที่ออกแล้ว"</div>
          </div>
        </div>
      </div>
    </div>`;

  const renderList = () => {
    const el = document.getElementById('mi-list');
    el.innerHTML = files.map((f, i) => `<div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:5px">
        <span>${f.pdf ? '📄' : '🖼️'} ${escapeHtml(f.name)}</span>
        <button class="btn btn-secondary btn-sm" data-rmf="${i}">ลบ</button></div>`).join('');
    el.querySelectorAll('[data-rmf]').forEach(b => b.onclick = () => { files.splice(+b.dataset.rmf, 1); renderList(); });
  };

  document.getElementById('mi-close').onclick = closeModal;
  document.getElementById('mb2').onclick = e => { if (e.target.id === 'mb2') closeModal(); };
  document.getElementById('mi-files').onchange = e => {
    Array.from(e.target.files || []).forEach(file => {
      const r = new FileReader();
      r.onload = () => { files.push({ name: file.name, dataUrl: r.result, pdf: file.type === 'application/pdf' }); renderList(); };
      r.readAsDataURL(file);
    });
    e.target.value = '';
  };
  document.getElementById('mi-save').onclick = async () => {
    const issued = document.getElementById('mi-issued').checked;
    if (!issued && !files.length) return toast('ติ๊ก "ออกเอกสารแล้ว" หรือแนบไฟล์อย่างน้อย 1 ไฟล์', 'warning');
    const btn = document.getElementById('mi-save');
    btn.disabled = true; btn.textContent = '⏳ กำลังบันทึก...';
    const res = await API.issueInvoice({ id: note.id, issued, files });
    if (res.success) { toast(res.message || 'สำเร็จ', 'success'); closeModal(); load(); }
    else { toast(res.message || 'ไม่สำเร็จ', 'error'); btn.disabled = false; btn.textContent = '💾 บันทึกการออกเอกสาร'; }
  };
}

function closeModal() { document.getElementById('modal-root').innerHTML = ''; }
