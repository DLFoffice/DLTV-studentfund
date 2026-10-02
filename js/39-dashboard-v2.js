/* ============================================================
   39-dashboard-v2.js — จัดหน้า Dashboard ใหม่ให้อ่านเป็นลำดับเรื่องราว
   1) แบนเนอร์ + ตัวเลขสำคัญ  2) ภาพรวมผลการเรียนและการดูแล (โดนัทแบบใหม่ + SDQ + แนวโน้ม GPA)
   3) เสียงจากนักเรียน (แบบฟอร์มที่ 2)  4) GPA รายบุคคล  5) นักเรียนที่ต้องติดตาม
   โดนัท 2 ใบวาดด้วย CSS (ตัวเลขรวมกลางวง + ตำนานพร้อม %) ไม่ต้องพึ่ง Chart.js
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

  function donut(el, items, centerTop, centerSub) {
    const total = items.reduce((a, x) => a + x.n, 0);
    let acc = 0;
    const stops = total ? items.filter(x => x.n).map(x => { const a = acc / total * 360; acc += x.n; return `${x.c} ${a}deg ${acc / total * 360}deg`; }).join(',') : '#E2E8F0 0 360deg';
    el.innerHTML = `<div class="dv-donut-wrap">
      <div class="dv-donut" style="background:conic-gradient(${stops})" role="img" aria-label="${E(items.map(x => x.t + ' ' + x.n).join(', '))}">
        <div><b>${centerTop}</b><span>${E(centerSub)}</span></div></div>
      <ul class="dv-legend">${items.map(x => `<li><i style="background:${x.c}"></i><span>${E(x.t)}</span><b>${x.n}</b><small>${pct(x.n, total)}%</small></li>`).join('')}</ul></div>`;
  }
  function replaceChart(canvasId, legendId, build) {
    const cv = document.getElementById(canvasId); if (!cv) return;
    const holder = cv.parentElement;
    let box = holder.parentElement.querySelector('.dv-box');
    if (!box) { box = document.createElement('div'); box.className = 'dv-box'; holder.insertAdjacentElement('afterend', box); }
    holder.style.display = 'none';
    const lg = legendId && document.getElementById(legendId); if (lg) lg.style.display = 'none';
    build(box);
  }

  function sectionTitle(id, kicker, title, sub, beforeEl) {
    if (!beforeEl || document.getElementById(id)) return;
    const h = document.createElement('div');
    h.id = id; h.className = 'dv-sec';
    h.innerHTML = `<span class="dv-kicker">${E(kicker)}</span><h3>${E(title)}</h3>${sub ? `<p>${E(sub)}</p>` : ''}`;
    beforeEl.insertAdjacentElement('beforebegin', h);
  }

  function layout() {
    const page = document.getElementById('page-dashboard'); if (!page || window.STUDENT_MODE) return;
    page.classList.add('dv');
    const grids = [...page.querySelectorAll(':scope > .chart-grid')];
    const overview = grids[0], gpaAll = grids[1];
    const f2 = document.getElementById('dx-f2');
    if (overview && f2 && overview.nextElementSibling !== f2 && overview.compareDocumentPosition(f2) & Node.DOCUMENT_POSITION_PRECEDING) {
      overview.insertAdjacentElement('afterend', f2);   // ภาพรวมก่อน แล้วค่อยเสียงจากนักเรียน
    }
    sectionTitle('dv-sec-overview', 'ภาพรวม', 'ผลการเรียนและการดูแล', 'กลุ่มการดูแลคิดจาก GPA ล่าสุด + ผล SDQ ล่าสุด', overview);
    sectionTitle('dv-sec-gpa', 'รายบุคคล', 'ผลการเรียนของนักเรียนทุกคน', null, gpaAll);
    if (overview) overview.classList.add('dv-overview');

    // โดนัท 1: การกระจาย GPA (ล่าสุดของแต่ละคน)
    replaceChart('chartGPA', 'legend-gpa', box => {
      const b = [['< 2.00', '#B91C1C', 0], ['2.00–2.49', '#EF4444', 0], ['2.50–2.99', '#F59E0B', 0], ['3.00–3.49', '#3B82F6', 0], ['3.50–4.00', '#16A34A', 0]];
      let n = 0, sum = 0;
      (DB.students || []).forEach(s => {
        const g = (typeof getLatestGpa === 'function') ? getLatestGpa(s) : null; const v = g && Number(g.gpa);
        if (!(v > 0)) return; n++; sum += v;
        b[v < 2 ? 0 : v < 2.5 ? 1 : v < 3 ? 2 : v < 3.5 ? 3 : 4][2]++;
      });
      donut(box, b.map(([t, c, k]) => ({ t, c, n: k })), n ? (sum / n).toFixed(2) : '—', n ? `GPA เฉลี่ย · ${n} คน` : 'ยังไม่มี GPA');
    });
    // โดนัท 2: กลุ่มการดูแล
    replaceChart('chartRisk', 'legend-risk', box => {
      const c = { 2: 0, 1: 0, 0: 0, '-1': 0 };
      (DB.students || []).forEach(s => { try { c[CareGroup.compute(s).severity]++; } catch (e) {} });
      donut(box, [{ t: 'ปกติ', c: '#16A34A', n: c[0] }, { t: 'เฝ้าระวัง', c: '#F59E0B', n: c[1] }, { t: 'ต้องดูแลเป็นพิเศษ', c: '#DC2626', n: c[2] }, { t: 'รอข้อมูล', c: '#CBD5E1', n: c['-1'] }],
        c[1] + c[2], 'คนที่ต้องดูแล/เฝ้าระวัง');
      if (!box.querySelector('.dv-link')) box.insertAdjacentHTML('beforeend', `<button type="button" class="dv-link" onclick="showPage('gpasheet', document.querySelector('.nav-btn[onclick*=gpasheet]'))">ดูการวิเคราะห์รายคนใน GPA Sheet →</button>`);
    });
  }

  const _rd = window.renderDashboard;
  if (typeof _rd === 'function') {
    window.renderDashboard = function () {
      const r = _rd.apply(this, arguments);
      try { layout(); } catch (e) { console.warn('dashboard v2', e); }
      return r;
    };
  }
})();
