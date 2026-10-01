/* ============================================================
   34-thai-datepicker.js — ปฏิทินเลือกวันที่แบบ พ.ศ. (แทนปฏิทินของเบราว์เซอร์ที่แสดง ค.ศ.)
   ------------------------------------------------------------
   หลักการ: ไม่เปลี่ยนรูปแบบข้อมูล — ช่อง <input type="date"> เดิมยังอยู่ (ซ่อนไว้) และเก็บค่า
   YYYY-MM-DD (ค.ศ.) เหมือนเดิม โค้ดเดิมทุกจุด (oninput/onchange/this.value) จึงทำงานต่อได้
   ระบบสร้างช่องแสดงผลคู่กัน แสดง วว/ดด/ปปปป (พ.ศ.) + ปฏิทินภาษาไทยปี พ.ศ.
     • พิมพ์เองได้: 9/11/2555 · 09-11-2555 · 9 11 55 (ปี 2 หลัก = 25xx)
     • ปฏิทิน: เลือกเดือน/ปี พ.ศ. ได้เร็ว (เหมาะกับวันเกิด), ปุ่ม วันนี้ / ล้างค่า
     • คีย์บอร์ด: ลูกศรเลื่อนวัน · PageUp/PageDown เปลี่ยนเดือน · Enter เลือก · Esc ปิด
   ใช้กับทุกช่องวันที่ในระบบอัตโนมัติ (ตรวจหาช่องใหม่ทุกครั้งที่หน้าเปลี่ยน)
   ============================================================ */
(function () {
  'use strict';
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const daysIn = (y, m) => new Date(y, m, 0).getDate();

  function parseISO(v) {
    const n = (typeof normDateISO === 'function') ? normDateISO(v) : v;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(n || '');
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  function fmtBE(v) { const p = parseISO(v); return p ? `${pad(p.d)}/${pad(p.m)}/${p.y + 543}` : ''; }
  /** ข้อความที่พิมพ์ → ISO ค.ศ. · '' = ว่าง · null = อ่านไม่ได้ */
  function parseTyped(t) {
    t = String(t || '').trim();
    if (!t) return '';
    const m = /^(\d{1,2})\s*[\/.\-\s]\s*(\d{1,2})\s*[\/.\-\s]\s*(\d{2}|\d{4})$/.exec(t);
    if (!m) return null;
    let y = +m[3]; const mo = +m[2], d = +m[1];
    if (y < 100) y += 2500;
    if (y > 2400) y -= 543;
    if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
    return iso(y, mo, d);
  }

  /* ---------- ปฏิทิน (ใช้ตัวเดียวร่วมกันทั้งหน้า) ---------- */
  let pop = null, cur = null;      // cur = { hidden, disp, wrap, view:{y,m}, focus:{y,m,d} }
  function buildPop() {
    pop = document.createElement('div');
    pop.className = 'thdp-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'เลือกวันที่ (พุทธศักราช)');
    pop.addEventListener('mousedown', e => { if (e.target.tagName !== 'SELECT') e.preventDefault(); });
    pop.addEventListener('click', onPopClick);
    pop.addEventListener('change', onPopChange);
    pop.addEventListener('keydown', onPopKey);
    document.body.appendChild(pop);
  }
  function render() {
    const { view, focus } = cur;
    const sel = parseISO(cur.hidden.value);
    const now = new Date();
    const today = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
    const first = new Date(view.y, view.m - 1, 1).getDay();
    const nDays = daysIn(view.y, view.m);
    const yNow = now.getFullYear();
    const yMin = Math.min(1940, view.y), yMax = Math.max(yNow + 10, view.y);
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<span class="thdp-blank"></span>';
    for (let d = 1; d <= nDays; d++) {
      const isSel = sel && sel.y === view.y && sel.m === view.m && sel.d === d;
      const isToday = today.y === view.y && today.m === view.m && today.d === d;
      const isFocus = focus.y === view.y && focus.m === view.m && focus.d === d;
      cells += `<button type="button" class="thdp-day${isSel ? ' is-sel' : ''}${isToday ? ' is-today' : ''}" data-d="${d}"
        tabindex="${isFocus ? 0 : -1}" aria-pressed="${!!isSel}" aria-label="${d} ${MONTHS[view.m - 1]} ${view.y + 543}">${d}</button>`;
    }
    let yOpts = '';
    for (let y = yMax; y >= yMin; y--) yOpts += `<option value="${y}" ${y === view.y ? 'selected' : ''}>${y + 543}</option>`;
    pop.innerHTML = `
      <div class="thdp-head">
        <button type="button" class="thdp-nav" data-nav="-1" aria-label="เดือนก่อนหน้า">‹</button>
        <select class="thdp-sel" data-sel="m" aria-label="เดือน">${MONTHS.map((mn, i) => `<option value="${i + 1}" ${i + 1 === view.m ? 'selected' : ''}>${mn}</option>`).join('')}</select>
        <select class="thdp-sel" data-sel="y" aria-label="ปี พ.ศ.">${yOpts}</select>
        <button type="button" class="thdp-nav" data-nav="1" aria-label="เดือนถัดไป">›</button>
      </div>
      <div class="thdp-dow">${DOW.map((d, i) => `<span class="${i === 0 ? 'sun' : ''}">${d}</span>`).join('')}</div>
      <div class="thdp-grid">${cells}</div>
      <div class="thdp-foot">
        <button type="button" class="thdp-link" data-act="clear">ล้างค่า</button>
        <span class="thdp-hint">ปี พ.ศ.</span>
        <button type="button" class="thdp-link strong" data-act="today">วันนี้</button>
      </div>`;
  }
  function place() {
    if (!cur) return;
    const r = cur.wrap.getBoundingClientRect();
    const h = pop.offsetHeight || 340, w = pop.offsetWidth || 300;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    let left = Math.min(r.left, window.innerWidth - w - 8);
    pop.style.top = Math.max(8, top) + 'px';
    pop.style.left = Math.max(8, left) + 'px';
  }
  function open(c) {
    if (!pop) buildPop();
    const sel = parseISO(c.hidden.value);
    const now = new Date();
    const base = sel || { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
    cur = Object.assign(c, { view: { y: base.y, m: base.m }, focus: { ...base } });
    render();
    pop.classList.add('open');
    place();
    c.wrap.classList.add('is-open');
    c.disp.setAttribute('aria-expanded', 'true');
  }
  function close(refocus) {
    if (!cur) return;
    pop.classList.remove('open');
    cur.wrap.classList.remove('is-open');
    cur.disp.setAttribute('aria-expanded', 'false');
    const d = cur.disp; cur = null;
    if (refocus) d.focus();
  }
  function commit(c, value) {
    c.hidden.value = value;
    c.disp.value = fmtBE(value);
    c.disp.classList.remove('thdp-bad');
    c.hidden.dispatchEvent(new Event('input', { bubbles: true }));
    c.hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function focusDay() { const b = pop.querySelector('.thdp-day[tabindex="0"]'); if (b) b.focus(); }
  function moveFocus(days) {
    const f = cur.focus;
    const dt = new Date(f.y, f.m - 1, f.d + days);
    cur.focus = { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
    cur.view = { y: cur.focus.y, m: cur.focus.m };
    render(); focusDay();
  }
  function moveMonth(n) {
    const dt = new Date(cur.view.y, cur.view.m - 1 + n, 1);
    cur.view = { y: dt.getFullYear(), m: dt.getMonth() + 1 };
    cur.focus = { y: cur.view.y, m: cur.view.m, d: Math.min(cur.focus.d, daysIn(cur.view.y, cur.view.m)) };
    render();
  }
  function onPopClick(e) {
    if (!cur) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.nav) { moveMonth(+b.dataset.nav); return; }
    if (b.dataset.d) { const c = cur; commit(c, iso(c.view.y, c.view.m, +b.dataset.d)); close(true); return; }
    if (b.dataset.act === 'today') { const n = new Date(); const c = cur; commit(c, iso(n.getFullYear(), n.getMonth() + 1, n.getDate())); close(true); return; }
    if (b.dataset.act === 'clear') { const c = cur; commit(c, ''); close(true); }
  }
  function onPopChange(e) {
    if (!cur) return;
    const s = e.target.dataset.sel; if (!s) return;
    if (s === 'm') cur.view.m = +e.target.value; else cur.view.y = +e.target.value;
    cur.focus = { y: cur.view.y, m: cur.view.m, d: Math.min(cur.focus.d, daysIn(cur.view.y, cur.view.m)) };
    render();
  }
  function onPopKey(e) {
    if (!cur) return;
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (!e.target.classList.contains('thdp-day')) return;
    const map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (map[e.key]) { e.preventDefault(); moveFocus(map[e.key]); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); moveMonth(e.key === 'PageUp' ? -1 : 1); focusDay(); }
  }
  document.addEventListener('mousedown', e => {
    if (cur && pop && !pop.contains(e.target) && !cur.wrap.contains(e.target)) close(false);
  }, true);
  window.addEventListener('resize', () => place());
  document.addEventListener('scroll', () => { if (cur) place(); }, true);

  /* ---------- แปลงช่องวันที่ ---------- */
  function labelText(input) {
    const lab = input.closest('label');
    const t = lab && (lab.querySelector('.sf-label') || lab);
    return t ? String(t.textContent || '').trim().slice(0, 60) : 'วันที่';
  }
  function enhance(hidden) {
    if (hidden.dataset.thdp) return;
    hidden.dataset.thdp = '1';
    const wrap = document.createElement('span');
    wrap.className = 'thdp-wrap';
    const disp = document.createElement('input');
    disp.type = 'text';
    disp.className = (hidden.className || '') + ' thdp-input';
    if (hidden.getAttribute('style')) disp.setAttribute('style', hidden.getAttribute('style'));
    disp.placeholder = 'วว/ดด/ปปปป (พ.ศ.)';
    disp.inputMode = 'numeric';
    disp.autocomplete = 'off';
    disp.setAttribute('aria-label', labelText(hidden) + ' (พ.ศ.)');
    disp.setAttribute('aria-haspopup', 'dialog');
    disp.setAttribute('aria-expanded', 'false');
    disp.value = fmtBE(hidden.value);
    disp.disabled = hidden.disabled;
    disp.readOnly = hidden.readOnly;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thdp-btn';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', 'เปิดปฏิทิน');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
    btn.disabled = hidden.disabled || hidden.readOnly;
    wrap.appendChild(disp); wrap.appendChild(btn);
    hidden.parentNode.insertBefore(wrap, hidden);   // ก่อนช่องเดิม → คลิกชื่อช่อง (label) แล้วโฟกัสช่องใหม่
    hidden.classList.add('thdp-hidden');
    hidden.tabIndex = -1;
    hidden.setAttribute('aria-hidden', 'true');
    const c = { hidden, disp, wrap };
    const canEdit = () => !hidden.disabled && !hidden.readOnly;
    disp.addEventListener('click', () => { if (canEdit() && (!cur || cur.hidden !== hidden)) open(c); });
    btn.addEventListener('click', () => { if (!canEdit()) return; if (cur && cur.hidden === hidden) close(true); else { open(c); focusDay(); } });
    disp.addEventListener('focus', () => { if (document.activeElement === disp && disp.value !== fmtBE(hidden.value) && !disp.classList.contains('thdp-bad')) disp.value = fmtBE(hidden.value); });
    disp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' && canEdit()) { e.preventDefault(); open(c); focusDay(); }
      else if (e.key === 'Escape' && cur) { e.preventDefault(); close(true); }
      else if (e.key === 'Enter') { e.preventDefault(); applyTyped(); close(false); }
    });
    function applyTyped() {
      const v = parseTyped(disp.value);
      if (v === null) { disp.classList.add('thdp-bad'); disp.title = 'รูปแบบไม่ถูกต้อง ใช้ วว/ดด/ปปปป เช่น 09/11/2555'; return; }
      disp.title = '';
      if (v !== (parseISO(hidden.value) ? fmtISO(hidden.value) : '')) commit(c, v);
      else { disp.value = fmtBE(v); disp.classList.remove('thdp-bad'); }
    }
    disp.addEventListener('change', applyTyped);
  }
  function fmtISO(v) { const p = parseISO(v); return p ? iso(p.y, p.m, p.d) : ''; }

  function scan() {
    document.querySelectorAll('input[type="date"]:not([data-thdp])').forEach(enhance);
    // ค่าเปลี่ยนจากโค้ด (ไม่ผ่านช่องแสดงผล) → อัปเดตช่องแสดงผลให้ตรง
    document.querySelectorAll('input[type="date"][data-thdp]').forEach(h => {
      const w = h.previousElementSibling;
      const d = w && w.classList.contains('thdp-wrap') ? w.querySelector('.thdp-input') : null;
      if (d && document.activeElement !== d && !d.classList.contains('thdp-bad') && d.value !== fmtBE(h.value)) d.value = fmtBE(h.value);
      if (d) { d.disabled = h.disabled; }
    });
  }
  let queued = false;
  const queue = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); }); };
  function boot() {
    scan();
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.ThaiDate = { fmtBE, parseTyped, scan };
})();
