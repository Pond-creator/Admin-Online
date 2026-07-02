// ============================================================
//  Admin Online — User Management (เฉพาะ admin)
// ============================================================
const Users = {
  ROLES: [
    { v: 'admin', l: 'Admin (ดูแลระบบ + ออกเอกสาร)' },
    { v: 'staff', l: 'พนักงาน (สร้าง/แก้ไข/ลบ)' },
    { v: 'account', l: 'บัญชี (ดูอย่างเดียว)' }
  ],

  init() {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn() || !Auth.hasRole('admin')) return;
    const box = document.getElementById('user-box');
    if (!box) return;
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = '👥 จัดการผู้ใช้';
    btn.style.marginRight = '10px';
    btn.onclick = () => Users.open();
    box.parentNode.insertBefore(btn, box);
  },

  async open() {
    document.getElementById('modal-root-users') || (() => {
      const d = document.createElement('div'); d.id = 'modal-root-users'; document.body.appendChild(d);
    })();
    const root = document.getElementById('modal-root-users');
    root.innerHTML = `<div class="modal-backdrop" id="ub"><div class="modal-card" style="max-width:640px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:var(--primary)">👥 จัดการผู้ใช้</h3>
        <button class="btn btn-secondary btn-sm" id="uu-close">✕ ปิด</button>
      </div>
      <div class="card" style="margin-bottom:16px;background:var(--bg-card2)">
        <div class="section-title">เพิ่มผู้ใช้ใหม่</div>
        <div class="grid-2">
          <div class="form-group"><label class="form-label">Username</label><input id="nu-username" class="form-control" autocomplete="off"></div>
          <div class="form-group"><label class="form-label">Password</label><input id="nu-password" class="form-control" autocomplete="new-password"></div>
          <div class="form-group"><label class="form-label">ชื่อที่แสดง</label><input id="nu-name" class="form-control"></div>
          <div class="form-group"><label class="form-label">สิทธิ์</label>
            <select id="nu-role" class="form-control">${Users.ROLES.map(r => `<option value="${r.v}">${r.l}</option>`).join('')}</select></div>
        </div>
        <button class="btn btn-primary btn-sm" id="nu-add">➕ เพิ่มผู้ใช้</button>
      </div>
      <div class="section-title">ผู้ใช้ทั้งหมด</div>
      <div id="uu-list"><div style="color:var(--text-muted);padding:12px">กำลังโหลด...</div></div>
    </div></div>`;

    document.getElementById('uu-close').onclick = () => root.innerHTML = '';
    document.getElementById('ub').onclick = e => { if (e.target.id === 'ub') root.innerHTML = ''; };
    document.getElementById('nu-add').onclick = Users.add;
    Users.loadList();
  },

  async loadList() {
    const el = document.getElementById('uu-list');
    const res = await API.getUsers();
    if (!res.success) { el.innerHTML = `<div style="color:var(--danger);padding:12px">${escapeHtml(res.message || 'โหลดไม่ได้')}</div>`; return; }
    el.innerHTML = `<div class="table-wrapper"><table><thead><tr>
        <th>ชื่อ</th><th>Username</th><th>สิทธิ์</th><th>สถานะ</th><th></th></tr></thead><tbody>` +
      res.data.map(u => `<tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${Auth.getRoleBadge(u.role)}</td>
        <td>${u.active ? '<span class="badge badge-success">ใช้งาน</span>' : '<span class="badge badge-muted">ปิด</span>'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm" data-pw="${u.id}" data-name="${escapeHtml(u.username)}">🔑 รีเซ็ตรหัส</button>
          <button class="btn btn-secondary btn-sm" data-toggle="${u.id}" data-active="${u.active}">${u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
        </td>
      </tr>`).join('') + `</tbody></table></div>`;

    el.querySelectorAll('[data-pw]').forEach(b => b.onclick = () => Users.resetPw(b.dataset.pw, b.dataset.name));
    el.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => Users.toggle(b.dataset.toggle, b.dataset.active === 'true'));
  },

  async add() {
    const data = {
      username: document.getElementById('nu-username').value.trim(),
      password: document.getElementById('nu-password').value,
      name: document.getElementById('nu-name').value.trim(),
      role: document.getElementById('nu-role').value
    };
    if (!data.username || !data.password || !data.name) return toast('กรอกข้อมูลให้ครบ', 'warning');
    const res = await API.addUser(data);
    if (res.success) {
      toast('เพิ่มผู้ใช้สำเร็จ', 'success');
      ['nu-username', 'nu-password', 'nu-name'].forEach(id => document.getElementById(id).value = '');
      Users.loadList();
    } else toast(res.message || 'เพิ่มไม่สำเร็จ', 'error');
  },

  async resetPw(id, username) {
    const pw = prompt('ตั้งรหัสผ่านใหม่สำหรับ ' + username + ':');
    if (!pw) return;
    const res = await API.updateUser({ id, password: pw });
    toast(res.success ? 'เปลี่ยนรหัสแล้ว' : (res.message || 'ไม่สำเร็จ'), res.success ? 'success' : 'error');
  },

  async toggle(id, active) {
    const res = await API.updateUser({ id, active: !active });
    if (res.success) { toast('อัปเดตแล้ว', 'success'); Users.loadList(); }
    else toast(res.message || 'ไม่สำเร็จ', 'error');
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Users.init());
else Users.init();
