// ============================================================
//  Admin Online — Recent Notes Drawer (แผงงานล่าสุดด้านขวา)
//  ใช้ร่วมทั้งหน้าฟอร์มและ Dashboard
// ============================================================
const Recent = {
  LABELS: { sale: 'ออเดอร์ขาย', exchange: 'เปลี่ยนสินค้า', cancel: 'ยกเลิก', tax: 'ออกใบกำกับ' },
  BADGE: { sale: 'success', exchange: 'info', cancel: 'danger', tax: 'primary' },
  filter: '',
  items: [],
  page: 0,
  PER: 30,

  init() {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) return;
    const toggle = document.createElement('button');
    toggle.className = 'recent-toggle';
    toggle.textContent = '🕑 งานล่าสุด';
    toggle.onclick = () => Recent.open();

    const backdrop = document.createElement('div');
    backdrop.className = 'recent-backdrop';
    backdrop.onclick = () => Recent.close();

    const drawer = document.createElement('div');
    drawer.className = 'recent-drawer';
    drawer.id = 'recent-drawer';
    drawer.innerHTML = `
      <div class="recent-head">
        <h3>🕑 งานล่าสุด</h3>
        <button class="btn btn-secondary btn-sm" id="recent-refresh">↻</button>
        <button class="btn btn-secondary btn-sm" id="recent-close">✕</button>
      </div>
      <div class="recent-tabs" id="recent-tabs"></div>
      <div class="recent-list" id="recent-list"></div>`;

    document.body.appendChild(toggle);
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    drawer.querySelector('#recent-close').onclick = () => Recent.close();
    drawer.querySelector('#recent-refresh').onclick = () => Recent.load();

    const chips = [{ k: '', l: 'ทั้งหมด' },
      { k: 'tax', l: 'ใบกำกับ' }, { k: 'sale', l: 'ขาย' },
      { k: 'exchange', l: 'เปลี่ยน' }, { k: 'cancel', l: 'ยกเลิก' }];
    document.getElementById('recent-tabs').innerHTML = chips.map(c =>
      `<span class="recent-chip ${c.k === '' ? 'active' : ''}" data-k="${c.k}">${c.l}</span>`).join('');
    document.querySelectorAll('#recent-tabs .recent-chip').forEach(ch =>
      ch.onclick = () => {
        Recent.filter = ch.dataset.k;
        document.querySelectorAll('#recent-tabs .recent-chip').forEach(x => x.classList.remove('active'));
        ch.classList.add('active');
        Recent.load();
      });
  },

  open() {
    document.getElementById('recent-drawer').classList.add('open');
    document.querySelector('.recent-backdrop').classList.add('open');
    Recent.load();
  },

  close() {
    document.getElementById('recent-drawer').classList.remove('open');
    document.querySelector('.recent-backdrop').classList.remove('open');
  },

  async load() {
    const list = document.getElementById('recent-list');
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:20px">กำลังโหลด...</div>`;
    const res = await API.listNotes({ type: Recent.filter, limit: 500 });
    if (!res.success) { list.innerHTML = `<div style="color:var(--text-muted);padding:16px">โหลดไม่ได้</div>`; return; }
    Recent.items = res.data || [];   // เรียงล่าสุดบนสุดมาจาก server แล้ว
    Recent.page = 0;
    Recent.renderPage();
  },

  renderPage() {
    const list = document.getElementById('recent-list');
    const total = Recent.items.length;
    if (!total) { list.innerHTML = `<div style="color:var(--text-muted);padding:16px">ยังไม่มีโน๊ต</div>`; return; }
    const pages = Math.ceil(total / Recent.PER);
    if (Recent.page >= pages) Recent.page = pages - 1;
    if (Recent.page < 0) Recent.page = 0;
    const start = Recent.page * Recent.PER;
    const slice = Recent.items.slice(start, start + Recent.PER);

    const rows = slice.map(n => `
      <div class="recent-item" data-id="${n.id}">
        <div class="r-top">
          <span class="badge badge-${Recent.BADGE[n.type] || 'muted'}">${Recent.LABELS[n.type] || n.type}</span>
          <span class="r-date">${fmtDate(n.date_noted)}</span>
          ${Auth.can('delete') ? `<button class="r-del" data-del="${n.id}" title="ลบโน๊ต"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>` : ''}
        </div>
        <div class="r-meta"><b>${escapeHtml(n.store || '-')}</b> · ${escapeHtml(n.channel || '-')}
          ${n.order_no ? '· ' + escapeHtml(n.order_no) : ''}
          ${n.type === 'sale' ? '· ' + fmtMoney(n.grand_total) + '฿' : ''}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px">โดย ${escapeHtml(n.created_by_name || '-')}</div>
        ${n.updated_at ? `<div style="font-size:11px;color:var(--warning);margin-top:2px">✏️ แก้ไขวันที่ ${fmtDate(n.updated_at)}</div>` : ''}
      </div>`).join('');

    const pager = pages > 1 ? `
      <div class="recent-pager">
        <button class="btn btn-secondary btn-sm" id="rp-prev" ${Recent.page === 0 ? 'disabled' : ''}>← ก่อนหน้า</button>
        <span>หน้า ${Recent.page + 1}/${pages}</span>
        <button class="btn btn-secondary btn-sm" id="rp-next" ${Recent.page >= pages - 1 ? 'disabled' : ''}>ถัดไป →</button>
      </div>` : '';

    list.innerHTML = rows + pager;
    list.querySelectorAll('.recent-item').forEach(el =>
      el.onclick = () => {
        if (Auth.can('edit')) { showLoader('กำลังเปิดโน๊ต...'); window.location.href = 'form.html?id=' + el.dataset.id; }
        else if (typeof viewNote === 'function') { Recent.close(); viewNote(el.dataset.id); }  // บัญชี = ดูอย่างเดียว
      });

    // ปุ่มลบ (ไม่เปิดหน้าแก้ไข)
    list.querySelectorAll('.r-del').forEach(b =>
      b.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm('ยืนยันลบโน๊ตนี้?')) return;
        const r = await API.deleteNote(b.dataset.del);
        if (r.success) { toast('ลบแล้ว', 'success'); Recent.load(); }
        else toast(r.message || 'ลบไม่ได้', 'error');
      });
    const prev = document.getElementById('rp-prev'), next = document.getElementById('rp-next');
    if (prev) prev.onclick = () => { Recent.page--; Recent.renderPage(); list.scrollTop = 0; };
    if (next) next.onclick = () => { Recent.page++; Recent.renderPage(); list.scrollTop = 0; };
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Recent.init());
} else {
  Recent.init();  // สคริปต์โหลดหลัง DOM พร้อมแล้ว → เรียกทันที
}
