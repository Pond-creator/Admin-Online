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
    const labels = { admin: 'Admin', staff: 'พนักงาน', account: 'บัญชี', view: 'ดูอย่างเดียว' };
    return labels[role] || role;
  },

  getRoleBadge: (role) => {
    const colors = { admin: 'danger', staff: 'primary', account: 'info', view: 'muted' };
    return `<span class="badge badge-${colors[role] || 'muted'}">${Auth.getRoleLabel(role)}</span>`;
  },

  // สิทธิ์การใช้งานตาม role
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
  }
};

// ซ่อนเมนู "สร้างโน๊ต" สำหรับ role ที่สร้างไม่ได้ (เช่น บัญชี)
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.isLoggedIn() || Auth.can('create')) return;
  document.querySelectorAll('a[href="form.html"]').forEach(a => a.style.display = 'none');
});
