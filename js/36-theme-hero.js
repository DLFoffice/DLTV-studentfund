/* ============================================================
   36-theme-hero.js — แบนเนอร์ต้อนรับหน้า Dashboard (ธีมเดียวกับหน้าเข้าสู่ระบบ)
   น้ำเงินลึก + ดาว + วงโคจรดาวเทียม · ทักทายตามช่วงเวลา · ภาคเรียนปัจจุบัน
   · ความคืบหน้าการส่งงานภาคเรียนนี้ (นับตัวเลขขึ้น) · ปุ่มลัดไปหน้าที่ใช้บ่อย
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function greet() { const h = new Date().getHours(); return h < 12 ? 'อรุณสวัสดิ์' : h < 17 ? 'สวัสดียามบ่าย' : 'สวัสดียามเย็น'; }
  function stats() {
    const t = (window.Term && Term.active) ? Term.active() : '';
    let done = 0, total = 0, students = (DB.students || []).length;
    if (window.Worklist && Worklist.summary && t) (DB.students || []).forEach(s => { const sm = Worklist.summary(s, t); done += sm.doneCount; total += sm.tasks.length; });
    return { t, done, total, students, pct: total ? Math.round(done / total * 100) : 0 };
  }
  function countUp(el, to, suffix) {
    if (reduce()) { el.textContent = to + (suffix || ''); return; }
    const t0 = performance.now(), dur = 1100, from = 0;
    (function tick(n) { const k = Math.min(1, (n - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e) + (suffix || ''); if (k < 1) requestAnimationFrame(tick); })(t0);
  }
  /* กันหน้าเพี้ยน: ถ้าเบราว์เซอร์ยังใช้ style.css รุ่นเก่า (แคช) ซึ่งยังไม่มีสไตล์ของแบนเนอร์ จะไม่แสดงแบนเนอร์ */
  function themeCssReady() {
    try { return getComputedStyle(document.documentElement).getPropertyValue('--lg-ease').trim() !== ''; } catch (e) { return false; }
  }
  function render() {
    const page = document.getElementById('page-dashboard');
    if (!page || window.STUDENT_MODE) return;
    if (!themeCssReady()) { const old = page.querySelector('.hx'); if (old) old.remove(); return; }
    let el = page.querySelector('.hx');
    if (!el) { el = document.createElement('section'); el.className = 'hx'; page.insertBefore(el, page.firstChild); }
    const st = stats();
    const name = (document.querySelector('.sidebar-user-name') || {}).textContent || '';
    const today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    el.innerHTML = `
      <div class="hx-stars" aria-hidden="true"></div>
      <div class="hx-orbit" aria-hidden="true"><span class="r1"><i></i></span><span class="r2"><i></i></span><span class="core"></span></div>
      <div class="hx-main">
        <div class="hx-date">${E(today)}</div>
        <h2>${greet()}${name ? ', <span>' + E(name.trim()) + '</span>' : ''}</h2>
        <p>${st.t && window.Term ? 'ภาคเรียนที่ใช้งาน: <b>' + E(Term.label(st.t)) + '</b> · ' : ''}นักเรียนทุน ${st.students} คน</p>
        <div class="hx-actions">
          <button type="button" class="hx-btn primary" data-hx="formtrack">ติดตามการกรอกแบบฟอร์ม</button>
          <button type="button" class="hx-btn" data-hx="scholarform">แบบฟอร์มทุนการศึกษา</button>
          <button type="button" class="hx-btn" data-hx="sdqdashboard">สรุปผล SDQ</button>
        </div>
      </div>
      <div class="hx-prog" role="img" aria-label="ส่งงานภาคเรียนนี้แล้ว ${st.pct}%">
        <svg viewBox="0 0 120 120" width="138" height="138" aria-hidden="true"><circle cx="60" cy="60" r="50" class="bgc"/>
          <circle cx="60" cy="60" r="50" class="fgc" style="stroke-dasharray:314.16;stroke-dashoffset:314.16"/></svg>
        <div class="hx-prog-in"><b data-hx-pct>0%</b><span>ส่งงานแล้ว</span><small>${st.done}/${st.total} งาน</small></div>
      </div>`;
    const fg = el.querySelector('.fgc');
    requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.strokeDashoffset = String(314.16 * (1 - st.pct / 100)); }));
    countUp(el.querySelector('[data-hx-pct]'), st.pct, '%');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-hx]'); if (!b) return;
    const p = b.getAttribute('data-hx');
    const nav = document.querySelector(`.nav-btn[onclick*="'${p}'"]`) || document.getElementById(p === 'sdqdashboard' ? 'sdq-nav-dash' : '');
    showPage(p, nav);
  });
  // ลิงก์คู่มือท้ายแถบเมนู: บัญชีครูผู้ดูแลเปิดคู่มือที่ส่วนของครูก่อน
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('#sidebar-manual'); if (!a) return;
    a.href = window.STUDENT_MODE ? 'manual.html?role=user' : 'manual.html';
  }, true);
  const _rd = window.renderDashboard;
  if (typeof _rd === 'function') window.renderDashboard = function () { const r = _rd.apply(this, arguments); try { render(); } catch (e) { console.warn(e); } return r; };
  window.addEventListener('dltv:students-loaded', () => setTimeout(() => { try { render(); } catch (e) {} }, 200));
  if (document.readyState !== 'loading') setTimeout(render, 300); else document.addEventListener('DOMContentLoaded', () => setTimeout(render, 300));
})();
