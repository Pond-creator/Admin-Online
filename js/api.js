// ============================================================
//  Admin Online — API Client
// ============================================================

// <<< URL ของ Web App หลัง Deploy GAS >>>
const API_URL = 'https://script.google.com/macros/s/AKfycby5NofUechoY7L8JtCGkBjB-9YjkTanH8klDzfTRRryJzdin0t17fNWsSYNJrYrPZZiKA/exec';

// คืนวันแรก (yyyy-mm-dd) เมื่อ N เดือนก่อน (รวมเดือนปัจจุบัน) สำหรับโหลดตามช่วงเวลา — 0/ว่าง = ทั้งหมด
function periodDateFrom(months) {
  months = Number(months) || 0;
  if (!months) return '';
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth() - (months - 1), 1);
  return from.getFullYear() + '-' + String(from.getMonth() + 1).padStart(2, '0') + '-01';
}
// limit ที่เหมาะกับช่วง — "ทั้งหมด" ใช้เพดานสูง กันข้อมูลหลุด
function periodLimit(months) { return (Number(months) || 0) ? 1000 : 100000; }

// ====== Global loading overlay (วงหมุน + เลขนิ่งตรงกลาง) ======
let _loaderEl = null, _loaderTimer = null, _loaderPct = 0, _loaderCount = 0;
function _ensureLoader() {
  if (_loaderEl) return _loaderEl;
  _loaderEl = document.createElement('div');
  _loaderEl.className = 'app-loader';
  _loaderEl.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div><span class="pct">0%</span></div><div class="lbl">กำลังโหลด...</div>`;
  document.body.appendChild(_loaderEl);
  return _loaderEl;
}
function showLoader(label) {
  const el = _ensureLoader();
  el.querySelector('.lbl').textContent = label || 'กำลังโหลด...';
  _loaderCount++;
  el.classList.add('show');
  _loaderPct = 0;
  el.querySelector('.pct').textContent = '0%';
  clearInterval(_loaderTimer);
  _loaderTimer = setInterval(() => {
    if (_loaderPct < 95) {
      _loaderPct += Math.max(1, Math.round((95 - _loaderPct) * 0.09));
      el.querySelector('.pct').textContent = Math.min(_loaderPct, 99) + '%';
    }
  }, 110);
}
// เปลี่ยนข้อความใต้วงหมุน (เช่น "กำลังโหลด 2/5") ระหว่างงานที่คุมเอง
function setLoaderLabel(text) {
  if (_loaderEl) _loaderEl.querySelector('.lbl').textContent = text || 'กำลังโหลด...';
}
function hideLoader() {
  if (_loaderCount > 0) _loaderCount--;
  if (_loaderCount > 0 || !_loaderEl) return;   // ยังมีงานค้าง
  clearInterval(_loaderTimer);
  _loaderEl.querySelector('.pct').textContent = '100%';
  const el = _loaderEl;
  setTimeout(() => { if (_loaderCount === 0) el.classList.remove('show'); }, 200);
}

async function apiCall(action, data = {}, opts = {}) {
  const payload = { action, token: Auth.getToken(), ...data };
  if (!opts.silent) showLoader();   // silent = ไม่ขึ้น overlay ใหญ่ (เช่น ดึงรหัสสินค้า)
  const maxTries = opts.retry ? 3 : 1;   // retry เฉพาะงานอ่าน (opts.retry) — งานเขียนห้ามซ้ำ กันข้อมูลซ้ำ
  try {
    let lastErr = '';
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        const payloadStr = JSON.stringify(payload);
        let res;
        if (payloadStr.length > 3500) {
          // payload ใหญ่ (เช่น แนบรูป) → POST
          res = await fetch(API_URL, {
            method: 'POST',
            body: payloadStr,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
          });
        } else {
          const params = new URLSearchParams();
          Object.entries(payload).forEach(([k, v]) => {
            params.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
          });
          res = await fetch(API_URL + '?' + params.toString());
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);   // 404/500 (เช่น Google Drive ขัดข้อง)
        const json = await res.json();                         // ถ้าได้หน้า error (ไม่ใช่ JSON) → throw → retry
        if (json.success === false && json.message === 'Unauthorized') {
          Auth.clear();
          window.location.href = 'index.html';
        }
        return json;   // ได้คำตอบจริง (รวม business error ที่ success:false) → คืนเลย ไม่ลองซ้ำ
      } catch (err) {
        lastErr = err.message;
        if (attempt < maxTries) {
          if (!opts.silent) setLoaderLabel('Google ขัดข้องชั่วคราว — กำลังลองใหม่ (' + (attempt + 1) + '/' + maxTries + ')...');
          await new Promise(r => setTimeout(r, 700 * attempt));   // หน่วงก่อนลองซ้ำ (0.7s → 1.4s)
        }
      }
    }
    return { success: false, message: 'เชื่อมต่อ Google ไม่ได้ชั่วคราว (บริการอาจขัดข้อง) — กรุณารีเฟรชแล้วลองใหม่' };
  } finally {
    if (!opts.silent) hideLoader();
  }
}

const API = {
  login:          (username, password) => apiCall('login', { username, password }, { retry: true }),
  getMeta:        () => apiCall('getMeta', {}, { retry: true }),
  getProduct:     (code) => apiCall('getProduct', { code }, { silent: true, retry: true }),
  getNextOrderNo: (store) => apiCall('getNextOrderNo', { store }, { silent: true }),   // ไม่ retry (กันเลขข้าม)
  searchProducts: (q) => apiCall('searchProducts', { q }, { silent: true, retry: true }),
  saveNote:       (data) => apiCall('saveNote', data),          // งานเขียน — ไม่ retry
  updateNote:     (data) => apiCall('updateNote', data),        // งานเขียน — ไม่ retry
  listNotes:      (filters = {}) => apiCall('listNotes', filters, { retry: true }),
  getNote:        (id, opts) => apiCall('getNote', { id }, { retry: true, ...opts }),
  deleteNote:     (id) => apiCall('deleteNote', { id }),        // งานเขียน — ไม่ retry
  issueInvoice:   (data) => apiCall('issueInvoice', data),      // งานเขียน — ไม่ retry
  getUsers:       () => apiCall('getUsers', {}, { retry: true }),
  addUser:        (data) => apiCall('addUser', data),
  updateUser:     (data) => apiCall('updateUser', data)
};

// ====== UI helpers ======
function toast(msg, type = 'info') {
  let box = document.getElementById('toast-container');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-container';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2800);
}

function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// แปลง Y-m-d → วัน/เดือน/ปี (เช่น 2026-07-01 → 01/07/2026)
function fmtDate(s) {
  if (!s) return '-';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

// แปลงวันเวลา → วัน/เดือน/ปี ชม:นาที (24 ชม.) เช่น 2026-07-02 09:35:13 → 02/07/2026 09:35
function fmtDateTime(s) {
  if (!s) return '-';
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : fmtDate(s);
}

// เวลาปัจจุบัน (ไทย ตามเครื่อง) วัน/เดือน/ปี ชม:นาที
function nowStamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// แสดง loader ตอนคลิกลิงก์เปลี่ยนหน้า (เช่น เมนู, ปุ่มแก้ไข)
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('#') || a.target === '_blank') return;
  if (/\.html(\?|$)/.test(href) || href === 'index.html') showLoader('กำลังเปิดหน้า...');
});
