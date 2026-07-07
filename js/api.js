// ============================================================
//  Admin Online — API Client
// ============================================================

// <<< URL ของ Web App หลัง Deploy GAS >>>
const API_URL = 'https://script.google.com/macros/s/AKfycby5NofUechoY7L8JtCGkBjB-9YjkTanH8klDzfTRRryJzdin0t17fNWsSYNJrYrPZZiKA/exec';

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
    const json = await res.json();
    if (json.success === false && json.message === 'Unauthorized') {
      Auth.clear();
      window.location.href = 'index.html';
    }
    return json;
  } catch (err) {
    return { success: false, message: 'เชื่อมต่อ API ไม่ได้: ' + err.message };
  } finally {
    if (!opts.silent) hideLoader();
  }
}

const API = {
  login:          (username, password) => apiCall('login', { username, password }),
  getMeta:        () => apiCall('getMeta'),
  getProduct:     (code) => apiCall('getProduct', { code }, { silent: true }),
  getNextOrderNo: (store) => apiCall('getNextOrderNo', { store }, { silent: true }),
  searchProducts: (q) => apiCall('searchProducts', { q }, { silent: true }),
  saveNote:       (data) => apiCall('saveNote', data),
  updateNote:     (data) => apiCall('updateNote', data),
  listNotes:      (filters = {}) => apiCall('listNotes', filters),
  getNote:        (id) => apiCall('getNote', { id }),
  deleteNote:     (id) => apiCall('deleteNote', { id }),
  issueInvoice:   (data) => apiCall('issueInvoice', data),
  getUsers:       () => apiCall('getUsers'),
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
