// ============================================================
//  Admin Online — Auth Manager
// ============================================================

const Auth = {
  getToken: () => localStorage.getItem('ao_token'),
  getUser: () => JSON.parse(localStorage.getItem('ao_user') || 'null'),

  setSession: (token, user) => {
    localStorage.setItem('ao_token', token);
    localStorage.setItem('ao_user', JSON.stringify(user));
  },

  clear: () => {
    localStorage.removeItem('ao_token');
    localStorage.removeItem('ao_user');
  },

  isLoggedIn: () => !!localStorage.getItem('ao_token'),

  hasRole: (roles) => {
    const user = Auth.getUser();
    if (!user) return false;
    if (typeof roles === 'string') return user.role === roles;
    return roles.includes(user.role);
  },

  requireAuth: () => {
    if (!Auth.isLoggedIn()) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  },

  logout: () => {
    Auth.clear();
    window.location.href = 'index.html';
  },

  getRoleLabel: (role) => {
    const labels = { admin: 'Admin', staff: 'พนักงาน', account: 'บัญชี', stock: 'สต๊อก', view: 'ดูอย่างเดียว' };
    return labels[role] || role;
  },

  getRoleBadge: (role) => {
    const colors = { admin: 'danger', staff: 'primary', account: 'info', stock: 'warning', view: 'muted' };
    return `<span class="badge badge-${colors[role] || 'muted'}">${Auth.getRoleLabel(role)}</span>`;
  },

  // สิทธิ์การกระทำตาม role
  can: (action) => {
    const role = (Auth.getUser() || {}).role;
    const perms = {
      create:      ['admin', 'staff'],
      edit:        ['admin', 'staff'],
      delete:      ['admin', 'staff'],
      issue:       ['admin'],          // ออกเอกสารใบกำกับ
      manageUsers: ['admin']
    };
    return (perms[action] || []).includes(role);
  },

  // สิทธิ์เข้าถึงแต่ละหน้า (key = ชื่อไฟล์ .html)
  pageRoles: {
    'form.html':      ['admin', 'staff'],
    'dashboard.html': ['admin', 'staff', 'account'],
    'issued.html':    ['admin', 'staff', 'account'],
    'sales.html':     ['admin', 'staff', 'account'],
    'cancels.html':   ['admin', 'staff', 'account', 'stock'],
    'exchanges.html': ['admin', 'staff', 'account', 'stock']
  },
  canPage: (page) => (Auth.pageRoles[page] || []).includes((Auth.getUser() || {}).role),

  // หน้าแรกที่ควรเข้าหลัง login (ตาม role)
  landing: () => {
    const r = (Auth.getUser() || {}).role;
    if (r === 'stock') return 'cancels.html';
    return 'dashboard.html';
  },

  // เด้งออกถ้าไม่มีสิทธิ์ดูหน้านี้
  requirePage: (page) => {
    if (!Auth.requireAuth()) return false;
    if (!Auth.canPage(page)) { window.location.href = Auth.landing(); return false; }
    return true;
  }
};

// ซ่อนเมนูที่ role นี้เข้าไม่ได้
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.isLoggedIn()) return;
  Object.keys(Auth.pageRoles).forEach(page => {
    if (!Auth.canPage(page))
      document.querySelectorAll(`a[href="${page}"]`).forEach(a => a.style.display = 'none');
  });
});
