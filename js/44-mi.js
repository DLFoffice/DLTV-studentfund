/* ============================================================
   44-mi.js — ผลแบบสำรวจแววความสามารถพิเศษ (MI) ในระบบหลัก
   ------------------------------------------------------------
   • เมนู "แบบสำรวจแววความสามารถ" (ทุกบทบาท) → เปิด mi.html (ล็อกอินเดียวกัน)
   • หน้ารายละเอียดนักเรียน → แท็บ "การศึกษา" → การ์ด "แววความสามารถพิเศษ (MI)"
       8 ด้าน (คะแนนขั้นต้น + ผ่านเกณฑ์) · ผลเฉพาะด้าน (ระดับ) · 3 สายอาชีพที่เหมาะ · วันที่/ผู้ตอบ
   • ดึงผลจาก Google Sheet ของแบบสำรวจ (กรณีนักเรียนทำโดยไม่ได้ล็อกอิน)
       - ในการ์ด: "ดึงผลล่าสุด" (คนเดียว) · หน้ารายชื่อ: "🧠 ดึงผลแบบสำรวจ MI" (ทุกคน)
   ข้อมูลเก็บที่ students/{id}.mi (สรุปจาก js/mi-core.js — เกณฑ์เดียวกับหน้าแบบสำรวจ)
   ============================================================ */
(function () {
  'use strict';
  if (typeof MI === 'undefined') return;
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  const isStaff = () => !window.STUDENT_MODE;
  const fmtD = iso => { try { return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); } catch (e) { return ''; } };
  const LV_CLS = ['lv0', 'lv1', 'lv2'];

  /* ---------- ดึงจาก Google Sheet ของแบบสำรวจ ---------- */
  async function fetchSheet(no) {
    const r = await fetch(MI_WEB_APP_URL + '?id=' + encodeURIComponent(no));
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'อ่านผลไม่สำเร็จ');
    const dn = j.done || {};
    if (!dn.basic) return null;
    const specAns = {}; MI.DOMS.forEach(d => { if (dn[d]) specAns[d] = dn[d]; });
    return MI.summarize({ basicAns: dn.basic, specAns, at: j.at || {}, respondent: j.respondent || '', source: 'sheet' });
  }
  function apply(s, sum) {
    if (!sum) return false;
    if (s.mi && JSON.stringify(s.mi.answers || {}) === JSON.stringify(sum.answers)) return false;
    s.mi = sum; return true;
  }
  async function syncOne(idx, quiet) {
    const s = DB.students[idx]; if (!s) return;
    const close = quiet ? () => {} : UIDialog.busy('กำลังดึงผลแบบสำรวจ…', 'ลำดับ ' + (s.no ?? ''));
    try {
      const sum = await fetchSheet(s.no);
      const changed = apply(s, sum);
      if (changed) { try { if (window.fbSaveNow) await fbSaveNow(); else saveToStorage(); } catch (e) {} }
      close();
      if (!quiet) UIDialog.alert(sum ? { tone: 'success', title: changed ? 'อัปเดตผลแบบสำรวจแล้ว' : 'ผลเป็นปัจจุบันแล้ว', message: changed ? 'นำผลจากแบบสำรวจเข้าข้อมูลนักเรียนเรียบร้อย' : 'ข้อมูลในระบบตรงกับแบบสำรวจล่าสุด' }
        : { tone: 'info', title: 'ยังไม่มีผลแบบสำรวจ', message: 'นักเรียนลำดับ ' + (s.no ?? '') + ' ยังไม่ได้ทำแบบสำรวจขั้นต้น' });
      renderCard(idx);
    } catch (e) { close(); if (!quiet) UIDialog.alert({ tone: 'danger', title: 'ดึงผลไม่สำเร็จ', message: e.message || String(e) }); throw e; }
  }
  async function syncAll() {
    const list = (DB.students || []).map((s, i) => i).filter(i => DB.students[i].no != null);
    if (!list.length) return;
    const ok = await uiAsk(`ระบบจะอ่านผลแบบสำรวจของนักเรียน ${list.length} คนจาก Google Sheet ของแบบสำรวจ แล้วนำผลล่าสุดเข้าข้อมูลนักเรียน`,
      { tone: 'info', title: 'ดึงผลแบบสำรวจ MI ทั้งหมด?', confirmText: 'ดึงผล' });
    if (!ok) return;
    const close = UIDialog.busy('กำลังดึงผลแบบสำรวจ…', `0 / ${list.length}`);
    let done = 0, upd = 0, none = 0, fail = 0, q = list.slice();
    const worker = async () => {
      while (q.length) {
        const i = q.shift(), s = DB.students[i];
        try { const sum = await fetchSheet(s.no); if (!sum) none++; else if (apply(s, sum)) upd++; } catch (e) { fail++; }
        done++;
        const m = document.querySelector('.uid-backdrop:last-child .uid-msg p'); if (m) m.textContent = `${done} / ${list.length}`;
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (upd) { try { if (window.fbSaveNow) await fbSaveNow(); else saveToStorage(); } catch (e) {} }
    close();
    try { if (typeof renderStudents === 'function') renderStudents(); } catch (e) {}
    UIDialog.alert({ tone: fail ? 'warning' : 'success', title: 'ดึงผลแบบสำรวจเสร็จแล้ว',
      details: [{ label: 'อัปเดตผลใหม่', value: upd + ' คน' }, { label: 'ยังไม่ได้ทำแบบสำรวจ', value: none + ' คน' }, { label: 'ไม่เปลี่ยนแปลง', value: (done - upd - none - fail) + ' คน' }, { label: 'อ่านไม่สำเร็จ', value: fail + ' คน' }] });
  }

  /* ---------- การ์ดในหน้ารายละเอียด ---------- */
  function cardHtml(idx) {
    const s = DB.students[idx], m = s.mi;
    const open = `<a class="mi-btn primary" href="mi.html" target="_blank" rel="noopener">${m ? 'เปิดแบบสำรวจ (ทำเฉพาะด้านเพิ่ม)' : 'เปิดแบบสำรวจ'}</a>`;
    const sync = isStaff() ? `<button type="button" class="mi-btn" data-mi-sync="${idx}">ดึงผลล่าสุด</button>` : '';
    if (!m || !m.basic) return `<section class="mi-card" id="mi-card"><header><div><h4>🧠 แววความสามารถพิเศษ (แบบสำรวจ MI)</h4>
      <p>ยังไม่มีผลแบบสำรวจ — ให้นักเรียนทำแบบสำรวจขั้นต้น 58 ข้อ ระบบจะแสดงผลที่นี่อัตโนมัติ</p></div><div class="mi-acts">${sync}${open}</div></header></section>`;
    const bars = MI.DOMS.map(d => { const b = m.basic[d] || {}, sp = m.spec && m.spec[d];
      return `<li><span class="mi-dn"><i style="background:${MI.color(d)}"></i><span title="${E(MI.name(d))}">${E(MI.short(d))}</span></span>
        <span class="mi-track"><span style="width:${b.t ? (b.raw / b.t * 100).toFixed(0) : 0}%;background:${MI.color(d)}"></span><em style="left:${b.t ? (b.pass / b.t * 100).toFixed(0) : 0}%" title="เกณฑ์ ${b.pass}/${b.t}"></em></span>
        <span class="mi-sc">${b.raw ?? '-'}/${b.t ?? '-'}</span>
        <span class="mi-st">${sp ? `<span class="mi-lv ${LV_CLS[sp.level]}" title="สนใจ ${E(sp.int)} · ความสามารถ ${E(sp.abl)}">${E(MI.LEVELS[sp.level])}</span>` : b.ok ? '<span class="mi-ok">✓ ผ่านเกณฑ์ขั้นต้น</span>' : ''}</span></li>`; }).join('');
    const strong = MI.DOMS.filter(d => m.spec && m.spec[d] && m.spec[d].level === 2).map(MI.name);
    const passed = (m.passed || []).map(MI.name);
    const careers = (m.careers || []).map((c, i) => `<li><span class="mi-ci">${E(c.i || '⭐')}</span><div><b>${i + 1}. ${E(c.n)}</b><small>${E((c.jobs || []).join(' · '))}${c.plan ? ' · แผนการเรียน ' + E(c.plan) : ''}</small></div><span class="mi-cs">${c.score}%</span></li>`).join('');
    return `<section class="mi-card" id="mi-card">
      <header><div><h4>🧠 แววความสามารถพิเศษ (แบบสำรวจ MI)</h4>
        <p>อัปเดต ${E(fmtD(m.updatedAt))}${m.respondent ? ' · ผู้ตอบ: ' + E(m.respondent) : ''}${m.source === 'sheet' ? ' · ดึงจากแบบสำรวจ' : ''}</p></div>
        <div class="mi-acts">${sync}${open}</div></header>
      <div class="mi-sum">
        <div><span>ผ่านเกณฑ์ขั้นต้น</span><b>${passed.length ? E(passed.join(', ')) : 'ยังไม่มีด้านที่ผ่าน'}</b></div>
        <div><span>มีแววความสามารถพิเศษ (ยืนยันจากแบบเฉพาะด้าน)</span><b>${strong.length ? E(strong.join(', ')) : (Object.keys(m.spec || {}).length ? 'ยังไม่มีด้านที่ยืนยัน' : 'ยังไม่ได้ทำแบบเฉพาะด้าน')}</b></div>
      </div>
      <div class="mi-grid">
        <div><div class="mi-sub">คะแนนขั้นต้น 8 ด้าน <small>เส้นดำ = เกณฑ์ผ่าน</small></div><ul class="mi-bars">${bars}</ul></div>
        <div><div class="mi-sub">สายอาชีพที่เหมาะ 3 อันดับแรก</div><ul class="mi-careers">${careers}</ul></div>
      </div></section>`;
  }
  function renderCard(idx) {
    const host = document.getElementById('st-panel-2'); if (!host) return;
    const old = document.getElementById('mi-card'); if (old) old.remove();
    host.insertAdjacentHTML('beforeend', cardHtml(idx));
  }
  const _open = window.openStudentDetail;
  if (typeof _open === 'function') window.openStudentDetail = function (idx) { const r = _open.apply(this, arguments); try { renderCard(idx); } catch (e) { console.warn(e); } return r; };
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-mi-sync]'); if (b) { syncOne(+b.dataset.miSync).catch(() => {}); return; }
    const a = e.target.closest && e.target.closest('#mi-sync-all'); if (a) syncAll();
  });

  /* ---------- เมนู + ปุ่มในหน้ารายชื่อ ---------- */
  function addNav() {
    const nav = document.getElementById('sidebar-nav'); if (!nav || document.getElementById('mi-nav')) return;
    const b = document.createElement('button');
    b.className = 'nav-btn'; b.id = 'mi-nav'; b.type = 'button';
    b.innerHTML = '<span class="nav-icon">🌟</span> แบบสำรวจแววความสามารถ <span class="mi-ext" aria-hidden="true">↗</span>';
    b.title = 'แบบสำรวจแววความสามารถพิเศษและสายอาชีพ (เปิดแท็บใหม่)';
    b.onclick = () => window.open('mi.html', '_blank', 'noopener');
    const sdqDash = document.getElementById('sdq-nav-dash');
    if (sdqDash) sdqDash.insertAdjacentElement('afterend', b); else nav.appendChild(b);
  }
  function addListButton() {
    const bar = document.querySelector('#page-students .toolbar'); if (!bar || !isStaff() || document.getElementById('mi-sync-all')) return;
    const b = document.createElement('button'); b.className = 'btn'; b.id = 'mi-sync-all'; b.textContent = '🧠 ดึงผลแบบสำรวจ MI';
    b.title = 'นำผลแบบสำรวจแววความสามารถพิเศษจาก Google Sheet เข้าข้อมูลนักเรียนทุกคน'; bar.appendChild(b);
  }
  const _rs = window.renderStudents;
  if (typeof _rs === 'function') window.renderStudents = function () { const r = _rs.apply(this, arguments); try { addListButton(); } catch (e) {} return r; };
  const boot = () => { addNav(); setTimeout(addNav, 1500); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.MISystem = { syncOne, syncAll, cardHtml };
})();
