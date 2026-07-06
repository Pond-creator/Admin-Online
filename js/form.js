// ============================================================
//  Admin Online — Form Logic
// ============================================================
if (!Auth.requireAuth()) throw new Error('no auth');

// ค่าสำรอง — ใช้เมื่อดึงจาก server ไม่ได้ (แท็บ/ตัวเลือกจะไม่หาย)
const DEFAULT_META = {
  stores: ['FO', 'FA', 'FF', 'GB', 'อื่นๆ'],
  channels: ['Facebook', 'Line', 'Shopee', 'Lazada', 'TikTok', 'Walk-in', 'Website', 'อื่นๆ'],
  types: [
    { key: 'tax', label: 'ออกใบกำกับภาษี' },
    { key: 'sale', label: 'ออเดอร์ขาย' },
    { key: 'exchange', label: 'เปลี่ยนสินค้า' },
    { key: 'cancel', label: 'ยกเลิก' }
  ]
};
let META = DEFAULT_META;
let currentType = 'tax';
let images = [];           // รูปใหม่ [{ name, dataUrl }]
let existingImages = [];   // รูปเดิม (URL) ตอนแก้ไข
let editId = null;         // ถ้าไม่ null = โหมดแก้ไข
let fpDateNoted, fpPurchase;  // instance ปฏิทิน

document.addEventListener('DOMContentLoaded', init);

// ตัวเลือกปฏิทิน วัน/เดือน/ปี (เก็บค่าเบื้องหลังเป็น Y-m-d)
function fpBaseOpts() {
  return {
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd/m/Y',
    locale: (window.flatpickr && flatpickr.l10ns && flatpickr.l10ns.th) ? 'th' : 'default',
    allowInput: true
  };
}

async function init() {
  const u = Auth.getUser();
  // บัญชี (account) สร้าง/แก้ไขไม่ได้ → เด้งไปหน้ารายการ
  if (!Auth.can('create') && !Auth.can('edit')) {
    toast('บัญชีของคุณไม่มีสิทธิ์สร้าง/แก้ไข', 'warning');
    setTimeout(() => window.location.href = Auth.landing(), 800);
    return;
  }
  document.getElementById('user-box').innerHTML =
    `<b>${escapeHtml(u.name)}</b> ${Auth.getRoleBadge(u.role)}`;

  const fpOpts = fpBaseOpts();
  const meta = await API.getMeta();
  if (meta.success && meta.data) META = meta.data;   // ถ้าดึงไม่ได้ ใช้ DEFAULT_META
  // บังคับลำดับแท็บให้ใบกำกับมาก่อนเสมอ (ไม่ต้องพึ่งลำดับจาก server)
  const ORDER = ['tax', 'sale', 'exchange', 'cancel'];
  META.types = (META.types || []).slice().sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  fillSelect('store', META.stores);
  fillSelect('channel', META.channels);

  const qs = new URLSearchParams(location.search);
  editId = qs.get('id');
  const typeParam = qs.get('type');
  if (!editId && typeParam && META.types.some(t => t.key === typeParam)) currentType = typeParam;

  fpDateNoted = flatpickr('#date_noted', Object.assign(editId ? {} : { defaultDate: 'today' }, fpOpts));
  fpPurchase = flatpickr('#purchase_date', fpOpts);

  renderTabs();
  renderTypeSection();

  // ช่องทาง "อื่นๆ" → โผล่ช่องระบุ
  document.getElementById('channel').addEventListener('change', e => {
    document.getElementById('channel-other-group').style.display =
      (e.target.value === 'อื่นๆ') ? '' : 'none';
  });

  // คลิกช่องตัวเลข → เลือกทั้งหมดให้ พิมพ์ทับได้เลยไม่ต้องลบ 0
  document.addEventListener('focusin', e => {
    if (e.target.matches('input[type="number"]')) setTimeout(() => e.target.select(), 0);
  });

  document.getElementById('images').addEventListener('change', handleImages);
  document.getElementById('note-form').addEventListener('submit', submitNote);

  if (editId) loadForEdit(editId);
}

function fillSelect(id, arr) {
  document.getElementById(id).innerHTML =
    '<option value="">— เลือก —</option>' + arr.map(v => `<option>${escapeHtml(v)}</option>`).join('');
}

// ====== Tabs ======
function renderTabs() {
  // โหมดแก้ไข: แสดงเฉพาะประเภทที่กำลังแก้ (เปลี่ยนประเภทไม่ได้)
  const types = editId ? META.types.filter(t => t.key === currentType) : META.types;
  document.getElementById('type-tabs').innerHTML =
    (editId ? '<span class="tab active" style="cursor:default">✏️ แก้ไข: </span>' : '') +
    types.map(t =>
      `<button type="button" class="tab ${t.key === currentType ? 'active' : ''}" data-type="${t.key}">${escapeHtml(t.label)}</button>`
    ).join('');
  if (editId) return;
  document.querySelectorAll('#type-tabs .tab').forEach(btn =>
    btn.addEventListener('click', () => { currentType = btn.dataset.type; renderTabs(); renderTypeSection(); }));
}

// ====== Type section ======
function renderTypeSection() {
  const box = document.getElementById('type-section');
  if (currentType === 'sale')      box.innerHTML = tplSale();
  else if (currentType === 'exchange') box.innerHTML = tplExchange();
  else if (currentType === 'cancel')   box.innerHTML = tplCancel();
  else if (currentType === 'tax')      box.innerHTML = tplTax();

  if (currentType === 'sale') {
    document.getElementById('add-sale').addEventListener('click', () => addSaleItem());
    document.getElementById('add-gift').addEventListener('click', () => addGiftItem());
    document.getElementById('shipping_fee').addEventListener('input', recalcSale);
    addSaleItem();
  } else if (currentType === 'exchange') {
    document.getElementById('add-from').addEventListener('click', () => addExItem('from'));
    document.getElementById('add-to').addEventListener('click', () => addExItem('to'));
    document.getElementById('has-exchange-fee').addEventListener('change', e =>
      document.getElementById('exchange-fee-box').style.display = e.target.checked ? '' : 'none');
    addExItem('from'); addExItem('to');
  } else if (currentType === 'cancel') {
    document.getElementById('cancel_warehouse').addEventListener('change', e =>
      document.getElementById('cancel-wh-other').style.display = (e.target.value === 'อื่นๆ') ? '' : 'none');
  } else if (currentType === 'tax') {
    flatpickr('#deadline', fpBaseOpts());   // ปฏิทิน deadline
    const hasShip = document.getElementById('has-ship');
    const sameShip = document.getElementById('same-ship');
    // ระบุที่อยู่ต่าง ↔ ใช้ที่อยู่เดียวกัน (เลือกได้อย่างเดียว)
    hasShip.addEventListener('change', () => {
      if (hasShip.checked) sameShip.checked = false;
      document.getElementById('ship-block').style.display = hasShip.checked ? '' : 'none';
    });
    sameShip.addEventListener('change', () => {
      if (sameShip.checked) { hasShip.checked = false; document.getElementById('ship-block').style.display = 'none'; }
    });

    // บุคคลธรรมดา / นิติบุคคล
    document.querySelectorAll('#entity-tabs .tab').forEach(btn =>
      btn.addEventListener('click', () => setEntity(btn.dataset.entity)));

    // กรอกเลขได้ทั้งสำนักงานใหญ่และสาขา (ไม่ปิดช่อง)
  }
}

function setEntity(type) {
  document.querySelectorAll('#entity-tabs .tab').forEach(b =>
    b.classList.toggle('active', b.dataset.entity === type));
  document.getElementById('branch-group').style.display = (type === 'company') ? '' : 'none';
  document.getElementById('tax_name_label').textContent = (type === 'company') ? 'ชื่อบริษัท' : 'ชื่อ';
  document.getElementById('tax_surname_label').textContent = (type === 'company') ? 'สาขา/แผนก (ถ้ามี)' : 'นามสกุล';
}

// ---------- SALE ----------
function tplSale() {
  return `
  <div class="card" style="margin-bottom:16px">
    <div class="section-title">ข้อมูลลูกค้า</div>
    <div class="form-group"><label class="form-label">ชื่อลูกค้า <span style="color:var(--danger)">*</span></label>
      <input id="cust_name" class="form-control" placeholder="ชื่อ-นามสกุล ลูกค้า"></div>
    <div class="grid-2">
      <div class="form-group" style="margin-bottom:0"><label class="form-label">ที่อยู่</label>
        <textarea id="cust_address" class="form-control" rows="2" placeholder="ที่อยู่จัดส่ง (ถ้ามี)"></textarea></div>
      <div class="form-group" style="margin-bottom:0"><label class="form-label">เบอร์ติดต่อ</label>
        <input id="cust_phone" class="form-control" placeholder="เบอร์โทร (ถ้ามี)"></div>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="section-title">รายการสินค้า</div>
    <div id="sale-items"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button type="button" class="btn btn-secondary btn-sm" id="add-sale">➕ เพิ่มชุดสินค้า</button>
      <button type="button" class="btn btn-success btn-sm" id="add-gift">🎁 เพิ่มของแถม</button>
    </div>
    <div class="total-box" style="margin-top:16px">
      <div class="total-row"><span>รวมราคาสินค้า (ก่อนหักส่วนลด)</span><span id="t-gross">0.00</span></div>
      <div class="total-row"><span>รวมส่วนลด</span><span id="t-discount" style="color:var(--danger)">0.00</span></div>
      <div class="total-row"><span>รวมหลังหักส่วนลด</span><span id="t-subtotal">0.00</span></div>
      <div class="total-row" style="align-items:center">
        <span>ค่าจัดส่ง</span>
        <input type="number" id="shipping_fee" class="form-control" value="0" style="max-width:140px;text-align:right">
      </div>
      <div class="total-row grand"><span>ยอดที่ต้องชำระ</span><span id="t-grand">0.00</span></div>
    </div>
  </div>`;
}

function itemCardSale(no) {
  return `
  <div class="item-card" data-sale-item>
    <span class="item-no">รายการ ${no}</span>
    <button type="button" class="remove-btn" data-remove>×</button>
    <div class="grid-3">
      <div class="form-group">
        <label class="form-label">รหัสสินค้า</label>
        <input class="form-control" data-code placeholder="กรอกรหัส แล้ว Enter">
      </div>
      <div class="form-group">
        <label class="form-label">ชื่อสินค้า</label>
        <input class="form-control" data-name placeholder="ดึงอัตโนมัติ">
      </div>
      <div class="form-group">
        <label class="form-label">สี</label>
        <input class="form-control" data-color placeholder="ดึงอัตโนมัติ">
      </div>
    </div>
    <div class="grid-3">
      <div class="form-group"><label class="form-label">จำนวน</label>
        <input type="number" class="form-control" data-qty value="1" min="1"></div>
      <div class="form-group"><label class="form-label">ราคา/ชิ้น</label>
        <input type="number" class="form-control" data-price value="0" min="0"></div>
      <div class="form-group"><label class="form-label">ส่วนลด (บาท)</label>
        <input type="number" class="form-control" data-discount value="0" min="0"></div>
    </div>
    <div class="item-name-preview" data-linetotal></div>
  </div>`;
}

function addSaleItem() {
  const box = document.getElementById('sale-items');
  const n = box.querySelectorAll('[data-sale-item]').length + 1;
  box.insertAdjacentHTML('beforeend', itemCardSale(n));
  const card = box.lastElementChild;
  bindLookup(card);
  card.querySelector('[data-remove]').addEventListener('click', () => {
    if (box.querySelectorAll('[data-sale-item]').length <= 1) return toast('ต้องมีอย่างน้อย 1 รายการ', 'warning');
    card.remove(); renumberSale(); recalcSale();
  });
  ['[data-qty]', '[data-price]', '[data-discount]'].forEach(sel =>
    card.querySelector(sel).addEventListener('input', recalcSale));
  recalcSale();
  return card;
}

function renumberSale() {
  document.querySelectorAll('#sale-items [data-sale-item]').forEach((c, i) =>
    c.querySelector('.item-no').textContent = 'รายการ ' + (i + 1));
}

// ---------- ของแถม (ไม่คิดราคา) ----------
function itemCardGift(no) {
  return `
  <div class="item-card gift-card" data-gift-item>
    <span class="item-no gift-no">🎁 ของแถม ${no}</span>
    <button type="button" class="remove-btn" data-remove>×</button>
    <div class="grid-3">
      <div class="form-group"><label class="form-label">รหัสสินค้า</label>
        <input class="form-control" data-code placeholder="กรอกรหัส แล้ว Enter"></div>
      <div class="form-group"><label class="form-label">ชื่อสินค้า</label>
        <input class="form-control" data-name placeholder="ดึงอัตโนมัติ / กรอกเอง"></div>
      <div class="form-group"><label class="form-label">สี</label>
        <input class="form-control" data-color placeholder="ดึงอัตโนมัติ"></div>
    </div>
    <div class="grid-3">
      <div class="form-group"><label class="form-label">จำนวน</label>
        <input type="number" class="form-control" data-qty value="1" min="1"></div>
      <div class="form-group"><label class="form-label">ราคา/ชิ้น</label>
        <input type="number" class="form-control" data-price value="0" min="0"></div>
    </div>
    <div class="item-name-preview" data-giftval style="color:var(--success)">🎁 ของแถม (คิดเป็นส่วนลด)</div>
  </div>`;
}

function addGiftItem() {
  const box = document.getElementById('sale-items');
  const n = box.querySelectorAll('[data-gift-item]').length + 1;
  box.insertAdjacentHTML('beforeend', itemCardGift(n));
  const card = box.lastElementChild;
  bindLookup(card);
  card.querySelector('[data-remove]').addEventListener('click', () => {
    card.remove(); renumberGift(); recalcSale();
  });
  ['[data-qty]', '[data-price]'].forEach(sel =>
    card.querySelector(sel).addEventListener('input', recalcSale));
  recalcSale();
  return card;
}

function renumberGift() {
  document.querySelectorAll('#sale-items [data-gift-item]').forEach((c, i) =>
    c.querySelector('.item-no').textContent = '🎁 ของแถม ' + (i + 1));
}

function recalcSale() {
  let gross = 0, discountTotal = 0;
  document.querySelectorAll('#sale-items [data-sale-item]').forEach(c => {
    const qty = +c.querySelector('[data-qty]').value || 0;
    const price = +c.querySelector('[data-price]').value || 0;
    const disc = +c.querySelector('[data-discount]').value || 0;
    const line = Math.max(0, qty * price - disc);
    gross += qty * price;
    discountTotal += disc;
    c.querySelector('[data-linetotal]').innerHTML =
      `รวมรายการ: <b>${fmtMoney(line)}</b> บาท`;
  });
  // ของแถม: มูลค่าเข้าทั้ง gross และส่วนลด (ฟรี → ยอดชำระไม่รวม)
  document.querySelectorAll('#sale-items [data-gift-item]').forEach(c => {
    const qty = +c.querySelector('[data-qty]').value || 0;
    const price = +c.querySelector('[data-price]').value || 0;
    const val = qty * price;
    gross += val;
    discountTotal += val;
    const pv = c.querySelector('[data-giftval]');
    if (pv) pv.innerHTML = `🎁 มูลค่าของแถม: <b>${fmtMoney(val)}</b> บาท (คิดเป็นส่วนลด)`;
  });
  const subtotal = Math.max(0, gross - discountTotal);
  const ship = +document.getElementById('shipping_fee').value || 0;
  document.getElementById('t-gross').textContent = fmtMoney(gross);
  document.getElementById('t-discount').textContent = '-' + fmtMoney(discountTotal);
  document.getElementById('t-subtotal').textContent = fmtMoney(subtotal);
  document.getElementById('t-grand').textContent = fmtMoney(subtotal + ship);
}

// ---------- EXCHANGE ----------
function tplExchange() {
  return `
  <div class="card" style="margin-bottom:16px">
    <div class="grid-2">
      <div class="exchange-col">
        <h4>🔴 เปลี่ยนจาก</h4>
        <div id="ex-from"></div>
        <button type="button" class="btn btn-secondary btn-sm" id="add-from">➕ เพิ่มรายการ</button>
      </div>
      <div class="exchange-col">
        <h4>🟢 เปลี่ยนเป็น</h4>
        <div id="ex-to"></div>
        <button type="button" class="btn btn-secondary btn-sm" id="add-to">➕ เพิ่มรายการ</button>
      </div>
    </div>
    <div style="border-top:1px dashed var(--border);margin-top:14px;padding-top:12px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="has-exchange-fee"> <span>มีค่าเปลี่ยน (เก็บเงินส่วนต่าง)</span>
      </label>
      <div id="exchange-fee-box" style="display:none;margin-top:10px;max-width:240px">
        <label class="form-label">ค่าเปลี่ยน (บาท)</label>
        <input type="number" id="exchange_fee" class="form-control" value="0" min="0">
        <div style="font-size:12px;color:var(--danger);margin-top:4px">* ต้องแนบรูป (เช่น สลิปโอนเงิน) เมื่อมีค่าเปลี่ยน</div>
      </div>
    </div>
  </div>`;
}

function itemCardEx(no) {
  return `
  <div class="item-card" data-ex-item>
    <span class="item-no">${no}</span>
    <button type="button" class="remove-btn" data-remove>×</button>
    <div class="form-group"><label class="form-label">รหัสสินค้า</label>
      <input class="form-control" data-code placeholder="กรอกรหัส แล้ว Enter"></div>
    <div class="form-group"><label class="form-label">ชื่อสินค้า</label>
      <input class="form-control" data-name placeholder="ดึงอัตโนมัติ"></div>
    <div class="form-group"><label class="form-label">สี</label>
      <input class="form-control" data-color placeholder="ดึงอัตโนมัติ"></div>
    <div class="form-group" style="margin-bottom:0"><label class="form-label">เพิ่มเติม</label>
      <input class="form-control" data-remark></div>
  </div>`;
}

function addExItem(dir) {
  const box = document.getElementById(dir === 'from' ? 'ex-from' : 'ex-to');
  const n = box.querySelectorAll('[data-ex-item]').length + 1;
  box.insertAdjacentHTML('beforeend', itemCardEx(n));
  const card = box.lastElementChild;
  bindLookup(card);
  card.querySelector('[data-remove]').addEventListener('click', () => {
    if (box.querySelectorAll('[data-ex-item]').length <= 1) return toast('ต้องมีอย่างน้อย 1 รายการ', 'warning');
    card.remove();
    box.querySelectorAll('[data-ex-item]').forEach((c, i) => c.querySelector('.item-no').textContent = (i + 1));
  });
  return card;
}

// ---------- CANCEL ----------
function tplCancel() {
  return `
  <div class="card" style="margin-bottom:16px">
    <div class="section-title">รายละเอียดการยกเลิก</div>
    <div class="form-group"><label class="form-label">สาเหตุ</label>
      <textarea id="cancel_reason" class="form-control" rows="2" placeholder="เช่น สินค้ามีขนาดเล็กกว่าที่ใช้อยู่"></textarea></div>
    <div class="grid-2">
      <div class="form-group"><label class="form-label">สถานะการส่งคืน</label>
        <select id="cancel_status" class="form-control">
          <option value="">— เลือก —</option>
          <option>อยู่ระหว่างจัดส่ง</option>
          <option>ถึงบริษัทแล้ว</option>
        </select></div>
      <div class="form-group"><label class="form-label">สถานะสินค้าที่คืน</label>
        <select id="cancel_item_status" class="form-control">
          <option value="">— เลือก —</option>
          <option>ตรวจสอบแล้ว</option>
          <option>รอตรวจสอบ</option>
        </select></div>
    </div>
    <div class="form-group" style="margin-bottom:0"><label class="form-label">คลังที่รับสินค้าเข้า</label>
      <select id="cancel_warehouse" class="form-control">
        <option value="">— เลือก —</option>
        <option>คลัง 01</option>
        <option>คลัง 15</option>
        <option>คลัง 99</option>
        <option value="อื่นๆ">คลังอื่นๆ (ระบุ)</option>
      </select>
    </div>
    <div class="form-group" id="cancel-wh-other" style="display:none;margin-top:12px;margin-bottom:0">
      <label class="form-label">ระบุคลัง (อื่นๆ)</label>
      <input id="cancel_warehouse_other" class="form-control" placeholder="พิมพ์ชื่อคลัง">
    </div>
  </div>`;
}

// ---------- TAX ----------
function tplTax() {
  return `
  <div class="card" style="margin-bottom:16px">
    <div class="section-title">ข้อมูลการออกใบกำกับภาษี</div>

    <div class="form-group">
      <label class="form-label">ประเภทผู้เสียภาษี</label>
      <div class="tabs" style="margin-bottom:0" id="entity-tabs">
        <button type="button" class="tab active" data-entity="individual">👤 บุคคลธรรมดา</button>
        <button type="button" class="tab" data-entity="company">🏢 นิติบุคคล</button>
      </div>
    </div>

    <div class="grid-2">
      <div class="form-group"><label class="form-label">เลขผู้เสียภาษี</label>
        <input id="tax_id" class="form-control" placeholder="เช่น 0994000162987"></div>
      <div class="form-group"><label class="form-label">วันที่ลูกค้าต้องการใช้ (deadline)</label>
        <input type="text" id="deadline" class="form-control" placeholder="ไม่บังคับ — วว/ดด/ปปปป"></div>
    </div>

    <div class="form-group" id="branch-group" style="display:none">
      <label class="form-label">สำนักงาน / สาขา (นิติบุคคล)</label>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="radio" name="branchtype" value="head" checked> สำนักงานใหญ่</label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="radio" name="branchtype" value="branch"> สาขาเลขที่</label>
        <input id="branch_code" class="form-control" style="max-width:150px" placeholder="เลขที่ (ถ้ามี)">
      </div>
    </div>

    <div class="grid-2">
      <div class="form-group"><label class="form-label" id="tax_name_label">ชื่อ</label><input id="tax_name" class="form-control"></div>
      <div class="form-group"><label class="form-label" id="tax_surname_label">นามสกุล</label><input id="tax_surname" class="form-control"></div>
    </div>
    <div class="form-group"><label class="form-label">ที่อยู่</label>
      <textarea id="tax_address" class="form-control" rows="2"></textarea></div>
    <div class="grid-2">
      <div class="form-group"><label class="form-label">โทร (ถ้ามี)</label><input id="tax_phone" class="form-control"></div>
      <div class="form-group"><label class="form-label">Email (ถ้ามี)</label><input id="tax_email" class="form-control"></div>
    </div>

    <div style="display:flex;gap:22px;flex-wrap:wrap;margin:6px 0 4px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="same-ship"> <span>ใช้ที่อยู่จัดส่งเดียวกับใบกำกับ</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="has-ship"> <span>ระบุที่อยู่จัดส่งใบกำกับ (ต่างจากด้านบน)</span>
      </label>
    </div>
    <div id="ship-block" style="display:none;border-top:1px dashed var(--border);padding-top:12px;margin-top:6px">
      <div class="grid-2">
        <div class="form-group"><label class="form-label">ชื่อ (ผู้รับใบกำกับ)</label><input id="ship_name" class="form-control"></div>
        <div class="form-group"><label class="form-label">นามสกุล</label><input id="ship_surname" class="form-control"></div>
      </div>
      <div class="form-group"><label class="form-label">ที่อยู่จัดส่ง</label>
        <textarea id="ship_address" class="form-control" rows="2"></textarea></div>
      <div class="form-group" style="margin-bottom:0"><label class="form-label">โทร</label>
        <input id="ship_phone" class="form-control"></div>
    </div>
  </div>`;
}

// ====== Product lookup ======
function bindLookup(card) {
  const codeEl = card.querySelector('[data-code]');
  let lastCode = '';          // กันยิงซ้ำเมื่อรหัสไม่เปลี่ยน
  let loading = false;
  const fg = codeEl.closest('.form-group');
  const run = async () => {
    const code = codeEl.value.trim();
    if (!code || code === lastCode || loading) return;   // ไม่เปลี่ยน = ไม่ต้องดึงซ้ำ
    loading = true;
    lastCode = code;
    if (fg) fg.classList.add('code-loading');   // วงหมุนเล็กในช่อง
    const res = await API.getProduct(code);
    if (fg) fg.classList.remove('code-loading');
    loading = false;
    const nameEl = card.querySelector('[data-name]');
    const colorEl = card.querySelector('[data-color]');
    const priceEl = card.querySelector('[data-price]');
    if (res.success) {
      // ดึงจากระบบสำเร็จ → ล็อกไม่ให้แก้ (ชื่อ/สี/ราคา)
      nameEl.value = res.data.name; nameEl.readOnly = true;
      colorEl.value = res.data.color; colorEl.readOnly = true;
      if (priceEl) { priceEl.value = res.data.price; priceEl.readOnly = true; recalcSale(); }
    } else {
      lastCode = '';   // ให้ลองใหม่ได้
      // ไม่พบในระบบ → ปลดล็อก ให้กรอกเอง (ขายของนอกระบบ)
      nameEl.readOnly = false; colorEl.readOnly = false; if (priceEl) priceEl.readOnly = false;
      toast('ไม่พบในระบบ — กรอกชื่อ/ราคาเองได้', 'warning');
    }
    // ไม่ดึงโฟกัสกลับ — ผู้ใช้กดไปช่องอื่นได้เลย
  };
  codeEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  codeEl.addEventListener('change', run);   // ใช้ change แทน blur — ยิงเฉพาะตอนค่าเปลี่ยนจริง
}

// ====== Images ======
function handleImages(e) {
  const files = Array.from(e.target.files || []);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      images.push({ name: file.name, dataUrl: reader.result });
      renderPreviews();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

function renderPreviews() {
  const existHtml = existingImages.map((url, i) =>
    `<div class="img-thumb"><img src="${url}"><button type="button" class="x" data-ex="${i}">×</button></div>`).join('');
  const newHtml = images.map((img, i) =>
    `<div class="img-thumb"><img src="${img.dataUrl}"><button type="button" class="x" data-i="${i}">×</button></div>`).join('');
  document.getElementById('img-previews').innerHTML = existHtml + newHtml;
  document.querySelectorAll('#img-previews .x[data-i]').forEach(b =>
    b.addEventListener('click', () => { images.splice(+b.dataset.i, 1); renderPreviews(); }));
  document.querySelectorAll('#img-previews .x[data-ex]').forEach(b =>
    b.addEventListener('click', () => { existingImages.splice(+b.dataset.ex, 1); renderPreviews(); }));
}

// ====== Submit ======
async function submitNote(e) {
  e.preventDefault();
  let channel = document.getElementById('channel').value;
  const payload = {
    type: currentType,
    date_noted: document.getElementById('date_noted').value,
    store: document.getElementById('store').value,
    channel,
    order_no: document.getElementById('order_no').value.trim(),
    purchase_date: document.getElementById('purchase_date').value,
    remark: document.getElementById('remark').value.trim(),
    images
  };

  // บังคับกรอกข้อมูลทั่วไป (ยกเว้นหมายเลขคำสั่งซื้อ)
  if (!payload.date_noted) return toast('กรุณาเลือกวันที่โน๊ต', 'warning');
  if (!payload.store) return toast('กรุณาเลือกร้านค้า', 'warning');
  if (!channel) return toast('กรุณาเลือกช่องทางขาย', 'warning');
  if (channel === 'อื่นๆ') {
    const other = document.getElementById('channel_other').value.trim();
    if (!other) return toast('กรุณาระบุช่องทาง (อื่นๆ)', 'warning');
    payload.channel = other;   // เก็บชื่อช่องทางที่พิมพ์เอง
  }
  if (!payload.purchase_date) return toast('กรุณาเลือกวันที่สั่งซื้อ', 'warning');

  if (currentType === 'sale') {
    payload.cust_name = val('cust_name');
    payload.cust_address = val('cust_address');
    payload.cust_phone = val('cust_phone');
    if (!payload.cust_name) return toast('กรุณากรอกชื่อลูกค้า', 'warning');
    const items = [];
    let regAfterDisc = 0, regDisc = 0, giftVal = 0;
    document.querySelectorAll('#sale-items [data-sale-item]').forEach(c => {
      const code = c.querySelector('[data-code]').value.trim();
      const name = c.querySelector('[data-name]').value.trim();
      if (!code && !name) return;
      const qty = +c.querySelector('[data-qty]').value || 0;
      const price = +c.querySelector('[data-price]').value || 0;
      const discount = +c.querySelector('[data-discount]').value || 0;
      const line_total = Math.max(0, qty * price - discount);
      regAfterDisc += line_total;
      regDisc += discount;
      items.push({ code, name, color: c.querySelector('[data-color]').value.trim(), qty, price, discount, line_total, is_gift: false });
    });
    // ของแถม: ราคาถูกเก็บไว้ + คิดเป็นส่วนลด (ยอดชำระไม่รวม)
    document.querySelectorAll('#sale-items [data-gift-item]').forEach(c => {
      const code = c.querySelector('[data-code]').value.trim();
      const name = c.querySelector('[data-name]').value.trim();
      if (!code && !name) return;
      const qty = +c.querySelector('[data-qty]').value || 1;
      const price = +c.querySelector('[data-price]').value || 0;
      const val = qty * price;
      giftVal += val;
      items.push({ code, name, color: c.querySelector('[data-color]').value.trim(), qty, price, discount: 0, line_total: val, is_gift: true });
    });
    if (!items.length) return toast('กรุณากรอกรายการสินค้าอย่างน้อย 1 รายการ', 'warning');
    const ship = +document.getElementById('shipping_fee').value || 0;
    payload.items = items;
    payload.shipping_fee = ship;
    payload.discount_total = regDisc + giftVal;       // รวมส่วนลด = ส่วนลดสินค้า + มูลค่าของแถม
    payload.grand_total = regAfterDisc + ship;        // ยอดชำระ = สินค้าหลังลด + ค่าส่ง (ของแถมฟรี)

  } else if (currentType === 'exchange') {
    payload.from_items = gatherEx('ex-from');
    payload.to_items = gatherEx('ex-to');
    if (!payload.from_items.length || !payload.to_items.length)
      return toast('กรุณากรอกทั้ง "เปลี่ยนจาก" และ "เปลี่ยนเป็น"', 'warning');
    if (document.getElementById('has-exchange-fee').checked) {
      payload.exchange_fee = +document.getElementById('exchange_fee').value || 0;
      if (payload.exchange_fee <= 0) return toast('กรุณาใส่จำนวนค่าเปลี่ยน', 'warning');
      if (images.length + existingImages.length === 0)
        return toast('มีค่าเปลี่ยน — ต้องแนบรูป (เช่น สลิปโอนเงิน)', 'warning');
    }

  } else if (currentType === 'cancel') {
    payload.cancel_reason = document.getElementById('cancel_reason').value.trim();
    payload.cancel_status = document.getElementById('cancel_status').value;
    payload.cancel_item_status = document.getElementById('cancel_item_status').value;
    if (!payload.cancel_reason) return toast('กรุณากรอกสาเหตุการยกเลิก', 'warning');
    let wh = document.getElementById('cancel_warehouse').value;
    if (wh === 'อื่นๆ') {
      wh = document.getElementById('cancel_warehouse_other').value.trim();
      if (!wh) return toast('กรุณาระบุคลัง (อื่นๆ)', 'warning');
    }
    payload.cancel_warehouse = wh;

  } else if (currentType === 'tax') {
    const entity = (document.querySelector('#entity-tabs .tab.active') || {}).dataset ?
      document.querySelector('#entity-tabs .tab.active').dataset.entity : 'individual';
    payload.deadline = val('deadline');   // วันที่ลูกค้าต้องการใช้ (ไม่บังคับ)
    payload.tax = {
      tax_id: val('tax_id'), name: val('tax_name'), surname: val('tax_surname'),
      address: val('tax_address'), phone: val('tax_phone'), email: val('tax_email'),
      entity_type: entity, branch: ''
    };
    if (entity === 'company') {
      const bt = (document.querySelector('input[name="branchtype"]:checked') || {}).value || 'head';
      const code = val('branch_code');
      payload.tax.branch = (bt === 'branch')
        ? ('สาขาที่ ' + (code || '-'))
        : ('สำนักงานใหญ่' + (code ? ' ' + code : ''));
    }
    if (document.getElementById('same-ship').checked) {
      // ใช้ที่อยู่เดียวกับใบกำกับ → คัดลอกตอนบันทึก (ไม่ต้องโชว์)
      Object.assign(payload.tax, {
        ship_name: payload.tax.name, ship_surname: payload.tax.surname,
        ship_address: payload.tax.address, ship_phone: payload.tax.phone
      });
    } else if (document.getElementById('has-ship').checked) {
      Object.assign(payload.tax, {
        ship_name: val('ship_name'), ship_surname: val('ship_surname'),
        ship_address: val('ship_address'), ship_phone: val('ship_phone')
      });
    }
    if (!payload.tax.tax_id && !payload.tax.name) return toast('กรุณากรอกข้อมูลผู้เสียภาษี', 'warning');
  }

  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = editId ? '⏳ กำลังอัปเดต...' : '⏳ กำลังบันทึก...';

  let res;
  if (editId) {
    payload.id = editId;
    payload.existing_images = existingImages;   // รูปเดิมที่เก็บไว้
    res = await API.updateNote(payload);
  } else {
    res = await API.saveNote(payload);
  }

  if (res.success) {
    showSuccessDialog(editId ? 'อัปเดตโน๊ตสำเร็จ' : 'บันทึกโน๊ตสำเร็จ');
  } else {
    toast(res.message || 'บันทึกไม่สำเร็จ', 'error');
    btn.disabled = false;
    btn.textContent = editId ? '💾 อัปเดตโน๊ต' : '💾 บันทึกโน๊ต';
  }
}

// ป๊อปอัปสำเร็จ — เลือกทำต่อ / ไปดูรายงาน
function showSuccessDialog(msg) {
  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal-card" style="max-width:420px;text-align:center">
      <div style="font-size:52px;line-height:1">✅</div>
      <h3 style="color:var(--success);margin:10px 0 4px">${escapeHtml(msg)}</h3>
      <p style="color:var(--text-secondary);margin-bottom:22px">ต้องการทำอะไรต่อ?</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="sd-new">➕ ทำรายการต่อ</button>
        <button class="btn btn-secondary" id="sd-report">📋 ไปดูรายงาน</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  root.querySelector('#sd-new').onclick = () => {
    showLoader('กำลังเปิดฟอร์มใหม่...');
    window.location.href = 'form.html?type=' + currentType;   // ฟอร์มเปล่า ประเภทเดิม
  };
  root.querySelector('#sd-report').onclick = () => {
    showLoader('กำลังไปหน้ารายงาน...');
    window.location.href = 'dashboard.html';
  };
}

function gatherEx(boxId) {
  const out = [];
  document.querySelectorAll('#' + boxId + ' [data-ex-item]').forEach(c => {
    const code = c.querySelector('[data-code]').value.trim();
    const name = c.querySelector('[data-name]').value.trim();
    if (!code && !name) return;
    out.push({
      code, name, color: c.querySelector('[data-color]').value.trim(),
      remark: c.querySelector('[data-remark]').value.trim()
    });
  });
  return out;
}

function val(id) { return (document.getElementById(id).value || '').trim(); }

// ====== โหลดโน๊ตเดิมมาแก้ไข ======
async function loadForEdit(id) {
  const res = await API.getNote(id);
  if (!res.success) { toast(res.message || 'โหลดโน๊ตไม่ได้', 'error'); return; }
  const { note, sale_items, exchange_from, exchange_to, tax } = res.data;

  currentType = note.type;
  renderTabs();
  renderTypeSection();

  // ข้อมูลทั่วไป
  if (note.date_noted) fpDateNoted.setDate(note.date_noted, true);
  if (note.purchase_date) fpPurchase.setDate(note.purchase_date, true);
  document.getElementById('order_no').value = note.order_no || '';
  document.getElementById('remark').value = note.remark || '';
  document.getElementById('store').value = note.store || '';

  // ช่องทาง (ถ้าไม่ตรงตัวเลือก = อื่นๆ)
  const chSel = document.getElementById('channel');
  if (META.channels.includes(note.channel)) {
    chSel.value = note.channel;
  } else if (note.channel) {
    chSel.value = 'อื่นๆ';
    document.getElementById('channel-other-group').style.display = '';
    document.getElementById('channel_other').value = note.channel;
  }

  // ตามประเภท
  if (note.type === 'sale') {
    document.getElementById('cust_name').value = note.cust_name || '';
    document.getElementById('cust_address').value = note.cust_address || '';
    document.getElementById('cust_phone').value = note.cust_phone || '';
    const box = document.getElementById('sale-items');
    box.innerHTML = '';
    (sale_items || []).forEach(it => {
      const gift = (it.is_gift === true || it.is_gift === 'TRUE' || it.is_gift === 'true');
      const card = gift ? addGiftItem() : addSaleItem();
      card.querySelector('[data-code]').value = it.code || '';
      card.querySelector('[data-name]').value = it.name || '';
      card.querySelector('[data-color]').value = it.color || '';
      card.querySelector('[data-qty]').value = it.qty || 1;
      card.querySelector('[data-price]').value = it.price || 0;   // ทั้งสินค้าและของแถมมีราคา
      if (!gift) card.querySelector('[data-discount]').value = it.discount || 0;
    });
    if (!box.querySelector('[data-sale-item]')) addSaleItem();
    document.getElementById('shipping_fee').value = note.shipping_fee || 0;
    recalcSale();

  } else if (note.type === 'exchange') {
    ['ex-from', 'ex-to'].forEach(bid => document.getElementById(bid).innerHTML = '');
    const fill = (arr, dir) => (arr || []).forEach(it => {
      const card = addExItem(dir);
      card.querySelector('[data-code]').value = it.code || '';
      card.querySelector('[data-name]').value = it.name || '';
      card.querySelector('[data-color]').value = it.color || '';
      card.querySelector('[data-remark]').value = it.remark || '';
    });
    fill(exchange_from, 'from'); fill(exchange_to, 'to');
    if (!document.querySelectorAll('#ex-from [data-ex-item]').length) addExItem('from');
    if (!document.querySelectorAll('#ex-to [data-ex-item]').length) addExItem('to');
    if (note.exchange_fee && +note.exchange_fee > 0) {
      document.getElementById('has-exchange-fee').checked = true;
      document.getElementById('exchange-fee-box').style.display = '';
      document.getElementById('exchange_fee').value = note.exchange_fee;
    }

  } else if (note.type === 'cancel') {
    document.getElementById('cancel_reason').value = note.cancel_reason || '';
    document.getElementById('cancel_status').value = note.cancel_status || '';
    document.getElementById('cancel_item_status').value = note.cancel_item_status || '';
    const wh = note.cancel_warehouse || '';
    const whSel = document.getElementById('cancel_warehouse');
    if (['คลัง 01', 'คลัง 15', 'คลัง 99'].includes(wh)) {
      whSel.value = wh;
    } else if (wh) {
      whSel.value = 'อื่นๆ';
      document.getElementById('cancel-wh-other').style.display = '';
      document.getElementById('cancel_warehouse_other').value = wh;
    }

  } else if (note.type === 'tax' && tax) {
    if (note.deadline) { const fp = document.querySelector('#deadline')._flatpickr; if (fp) fp.setDate(note.deadline, true); }
    setEntity(tax.entity_type === 'company' ? 'company' : 'individual');
    if (tax.entity_type === 'company') {
      const b = tax.branch || '';
      if (b.indexOf('สาขาที่') === 0) {
        const r = document.querySelector('input[name="branchtype"][value="branch"]');
        if (r) r.checked = true;
        document.getElementById('branch_code').value = b.replace(/^สาขาที่\s*/, '').replace(/^-$/, '');
      } else if (b.indexOf('สำนักงานใหญ่') === 0) {
        document.getElementById('branch_code').value = b.replace(/^สำนักงานใหญ่\s*/, '');
      }
    }
    document.getElementById('tax_id').value = tax.tax_id || '';
    document.getElementById('tax_name').value = tax.name || '';
    document.getElementById('tax_surname').value = tax.surname || '';
    document.getElementById('tax_address').value = tax.address || '';
    document.getElementById('tax_phone').value = tax.phone || '';
    document.getElementById('tax_email').value = tax.email || '';
    if (tax.ship_address || tax.ship_name) {
      const sameAsInvoice = (tax.ship_address === tax.address && tax.ship_name === tax.name);
      if (sameAsInvoice) {
        document.getElementById('same-ship').checked = true;
      } else {
        document.getElementById('has-ship').checked = true;
        document.getElementById('ship-block').style.display = '';
        document.getElementById('ship_name').value = tax.ship_name || '';
        document.getElementById('ship_surname').value = tax.ship_surname || '';
        document.getElementById('ship_address').value = tax.ship_address || '';
        document.getElementById('ship_phone').value = tax.ship_phone || '';
      }
    }
  }

  // รูปเดิม
  existingImages = (note.images || '').split(',').filter(Boolean);
  renderPreviews();

  // ปุ่ม + หัวข้อ
  document.getElementById('btn-save').textContent = '💾 อัปเดตโน๊ต';
  document.title = 'Admin Online — แก้ไขโน๊ต';
}
