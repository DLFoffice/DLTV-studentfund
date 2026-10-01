/* ============================================================
   37-care-analysis.js — วิเคราะห์กลุ่มการดูแลใหม่ จาก "ผลการเรียนล่าสุด + ผล SDQ ล่าสุด"
   ------------------------------------------------------------
   แทน CareGroup.compute เดิม (24) ทั้งระบบ → Dashboard, รายชื่อ, PDF, GPA Sheet ใช้เกณฑ์เดียวกัน

   ข้อมูลที่ใช้ (ต่อคน)
     • GPA ล่าสุด = ภาคเรียนล่าสุดที่มีเกรด + GPA ภาคก่อนหน้า (ดูแนวโน้ม)
     • SDQ ล่าสุด = แบบประเมินฉบับล่าสุดที่ตอบครบ 25 ข้อ (คะแนนรวม 4 ด้าน + รายด้าน)

   ขั้นที่ 1  ระดับฝั่ง GPA      : ≥ 3.00 ปกติ (0) · 2.50–2.99 เฝ้าระวัง (1) · < 2.50 ต้องดูแล (2)
   ขั้นที่ 2  ระดับฝั่ง SDQ      : รวม 4 ด้าน ปกติ (0) · เสี่ยง (1) · มีปัญหา (2)
   ขั้นที่ 3  ตั้งต้น = ฝั่งที่แย่กว่า แล้วปรับเพิ่มเมื่อ
     • ทั้ง 2 ฝั่งน่ากังวลพร้อมกัน (GPA ≥ 1 และ SDQ ≥ 1)          → ต้องดูแลเป็นพิเศษ
     • GPA ลดลงตั้งแต่ 0.30 จากภาคก่อน                              → +1 ระดับ
     • SDQ รวมปกติ แต่มีบางด้าน "มีปัญหา" (อารมณ์/เกเร/สมาธิ/เพื่อน)  → อย่างน้อยเฝ้าระวัง
   ผล: ปกติ / เฝ้าระวัง / ต้องดูแลเป็นพิเศษ / รอข้อมูล + "เหตุผล" ทุกข้อ (โปร่งใส ตรวจสอบได้)
   ============================================================ */
(function () {
  'use strict';
  if (!window.CareGroup) return;
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  const tkey = t => { const m = String(t || '').match(/(\d)\/(\d{4})/); return m ? +m[2] * 10 + +m[1] : 0; };
  const LABELS = CareGroup.labels;
  const DROP = 0.30;
  const DIFF = ['emotional', 'conduct', 'hyper', 'peer'];
  const short = d => (window.SDQ && SDQ.domainMeta && SDQ.domainMeta[d] && SDQ.domainMeta[d].short) || d;

  function gpaInfo(s) {
    const list = (s.semGpa || []).filter(g => g && g.term && Number(g.gpa) > 0).sort((a, b) => tkey(b.term) - tkey(a.term));
    if (!list.length) return null;
    const cur = list[0], prev = list[1] || null;
    const v = Number(cur.gpa);
    return { term: cur.term, gpa: v, prevTerm: prev ? prev.term : null, prevGpa: prev ? Number(prev.gpa) : null,
      delta: prev ? Math.round((v - Number(prev.gpa)) * 100) / 100 : null,
      sev: v < 2.5 ? 2 : v < 3.0 ? 1 : 0, weak: cur.weakSubjects || '' };
  }
  function sdqInfo(s) {
    const x = CareGroup.latestCompleteSdq(s);
    if (!x) return null;
    const r = x.result;
    const sev = r.totalGroup === 'มีปัญหา' ? 2 : r.totalGroup === 'เสี่ยง' ? 1 : 0;
    const probDomains = DIFF.filter(d => r.groups[d] === 'มีปัญหา');
    const riskDomains = DIFF.filter(d => r.groups[d] === 'เสี่ยง');
    const noStrength = r.groups.prosocial === 'ไม่มีจุดแข็ง';
    return { term: x.term, total: r.totalDiff, group: r.totalGroup, sev, probDomains, riskDomains, noStrength,
      submitted: !!(x.record && x.record.submittedAt), result: r };
  }

  function compute(s) {
    const g = gpaInfo(s), q = sdqInfo(s);
    const reasons = [];
    let sev;
    if (!g && !q) sev = -1;
    else {
      const gs = g ? g.sev : -1, ss = q ? q.sev : -1;
      sev = Math.max(gs, ss);
      if (g) {
        if (g.sev === 2) reasons.push({ k: 'gpa', t: `GPA ${g.gpa.toFixed(2)} ต่ำกว่า 2.50`, lv: 2 });
        else if (g.sev === 1) reasons.push({ k: 'gpa', t: `GPA ${g.gpa.toFixed(2)} (2.50–2.99)`, lv: 1 });
      }
      if (q) {
        if (q.sev === 2) reasons.push({ k: 'sdq', t: `SDQ รวม ${q.total} มีปัญหา`, lv: 2 });
        else if (q.sev === 1) reasons.push({ k: 'sdq', t: `SDQ รวม ${q.total} เสี่ยง`, lv: 1 });
      }
      if (gs >= 1 && ss >= 1 && sev < 2) { sev = 2; reasons.push({ k: 'combo', t: 'ทั้งผลการเรียนและพฤติกรรมน่ากังวล', lv: 2 }); }
      if (g && g.delta !== null && g.delta <= -DROP) {
        reasons.push({ k: 'drop', t: `GPA ลดลง ${Math.abs(g.delta).toFixed(2)} จากภาค ${g.prevTerm}`, lv: 1 });
        sev = Math.min(2, Math.max(sev, 0) + 1);
      }
      if (q && q.sev === 0 && q.probDomains.length) {
        reasons.push({ k: 'dom', t: `SDQ ด้าน${q.probDomains.map(short).join(', ')} มีปัญหา`, lv: 1 });
        sev = Math.max(sev, 1);
      } else if (q && q.probDomains.length) {
        reasons.push({ k: 'dom', t: `ด้านที่มีปัญหา: ${q.probDomains.map(short).join(', ')}`, lv: 0 });
      }
      if (q && q.noStrength) reasons.push({ k: 'pro', t: 'ด้านสัมพันธภาพทางสังคม ไม่มีจุดแข็ง', lv: 0 });
      if (sev === -1) sev = 0;
    }
    const meta = LABELS[sev];
    let note;
    if (sev === -1) note = 'ยังไม่มีทั้ง GPA และผลประเมิน SDQ ที่กรอกครบ';
    else if (!g) note = 'วิเคราะห์จากผล SDQ ล่าสุดเท่านั้น (ยังไม่มี GPA)';
    else if (!q) note = 'วิเคราะห์จาก GPA ล่าสุดเท่านั้น (ยังไม่มีผล SDQ ที่ตอบครบ)';
    else note = `วิเคราะห์จาก GPA ${g.term} + SDQ ${q.term}`;
    if (reasons.length) note += ' · ' + reasons.filter(r => r.lv > 0).map(r => r.t).join(' · ');
    return {
      severity: sev, label: meta.text, badgeClass: meta.badge, dotColor: meta.dot, note, reasons,
      gpaVal: g ? g.gpa : 0, gpaSeverity: g ? g.sev : -1, gpa: g, sdq: q,
      sdqTerm: q ? q.term : null, sdqGroup: q ? q.group : null, sdqSeverity: q ? q.sev : -1,
      hasGpa: !!g, hasSdq: !!q, partial: !g || !q
    };
  }
  CareGroup.compute = compute;
  CareGroup.computeDetail = compute;
  CareGroup.criteria = { drop: DROP };

  /* ══════════ แผงวิเคราะห์ใน GPA Sheet ══════════ */
  const st = { group: 'focus', cell: null };
  const GROW = [{ k: 2, t: 'GPA < 2.50' }, { k: 1, t: 'GPA 2.50–2.99' }, { k: 0, t: 'GPA ≥ 3.00' }, { k: -1, t: 'ยังไม่มี GPA' }];
  const SCOL = [{ k: 0, t: 'SDQ ปกติ' }, { k: 1, t: 'SDQ เสี่ยง' }, { k: 2, t: 'SDQ มีปัญหา' }, { k: -1, t: 'ยังไม่มี SDQ' }];
  const sevCls = v => v === 2 ? 'prob' : v === 1 ? 'risk' : v === 0 ? 'ok' : 'na';

  function rows() {
    const q = ((document.getElementById('gps-search') || {}).value || '').toLowerCase();
    return (DB.students || []).map((s, idx) => ({ s, idx, c: compute(s) }))
      .filter(r => !q || ((r.s.name || '') + (r.s.school_m1 || '') + (r.s.province || '')).toLowerCase().includes(q));
  }
  function cellSev(gk, sk) {
    if (gk === -1 && sk === -1) return -1;
    let v = Math.max(gk, sk);
    if (gk >= 1 && sk >= 1) v = 2;
    return v;
  }

  function panelHtml() {
    const all = rows();
    const n = { 2: 0, 1: 0, 0: 0, '-1': 0 }, partial = all.filter(r => r.c.partial && r.c.severity !== -1).length;
    all.forEach(r => n[r.c.severity]++);
    const drops = all.filter(r => r.c.reasons.some(x => x.k === 'drop')).length;
    // ตาราง GPA × SDQ
    const grid = {};
    all.forEach(r => { const key = r.c.gpaSeverity + '|' + r.c.sdqSeverity; grid[key] = (grid[key] || 0) + 1; });
    const matrix = `<table class="ca-matrix" aria-label="จำนวนนักเรียนตาม GPA ล่าสุด และ SDQ ล่าสุด">
      <thead><tr><th></th>${SCOL.map(c => `<th>${c.t}</th>`).join('')}</tr></thead>
      <tbody>${GROW.map(g => `<tr><th>${g.t}</th>${SCOL.map(c => {
        const v = grid[g.k + '|' + c.k] || 0, sv = cellSev(g.k, c.k);
        const on = st.cell === g.k + '|' + c.k;
        return `<td><button type="button" class="ca-cell s-${sevCls(sv)}${on ? ' on' : ''}${v ? '' : ' zero'}" data-ca-cell="${g.k}|${c.k}" ${v ? '' : 'disabled'}
          aria-pressed="${on}" title="${g.t} · ${c.t}: ${v} คน">${v}</button></td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;

    let list = all;
    if (st.cell) { const [gk, sk] = st.cell.split('|').map(Number); list = all.filter(r => r.c.gpaSeverity === gk && r.c.sdqSeverity === sk); }
    else if (st.group === 'focus') list = all.filter(r => r.c.severity >= 1);
    else if (st.group !== 'all') list = all.filter(r => String(r.c.severity) === st.group);
    list.sort((a, b) => (b.c.severity - a.c.severity) || (b.c.reasons.filter(x => x.lv).length - a.c.reasons.filter(x => x.lv).length)
      || (a.c.gpaVal || 9) - (b.c.gpaVal || 9));
    const chip = (k, t, c, cls) => `<button type="button" class="ca-chip ${cls || ''}${st.group === k && !st.cell ? ' on' : ''}" data-ca-group="${k}">${t} <b>${c}</b></button>`;
    const item = r => {
      const g = r.c.gpa, q = r.c.sdq;
      const gpaTxt = g ? `<b style="color:${typeof gpaColor === 'function' ? gpaColor(g.gpa) : 'inherit'}">${g.gpa.toFixed(2)}</b> <small>${E(g.term)}</small>
          ${g.delta !== null ? `<span class="ca-tr ${g.delta <= -DROP ? 'down' : g.delta < 0 ? 'dn' : 'up'}">${g.delta >= 0 ? '▲' : '▼'} ${Math.abs(g.delta).toFixed(2)}</span>` : ''}`
        : '<span class="ca-na">ยังไม่มี GPA</span>';
      const sdqTxt = q ? `<span class="ca-g ${sevCls(q.sev)}">${E(q.group)} ${q.total}</span> <small>${E(q.term)}${q.submitted ? '' : ' · ยังไม่ส่ง'}</small>`
        : '<span class="ca-na">ยังไม่มี SDQ</span>';
      const why = r.c.reasons.map(x => `<span class="ca-why l${x.lv}">${E(x.t)}</span>`).join('') || '<span class="ca-why l0">ไม่มีสัญญาณที่น่ากังวล</span>';
      return `<li class="ca-item s-${sevCls(r.c.severity)}">
        <span class="ca-bar" aria-hidden="true"></span>
        <div class="ca-who">${typeof photoEl === 'function' ? photoEl(r.s) : ''}<div><b>${E(r.s.name || '')}</b><span>${E(r.s.school_m1 || '-')} · ${E(r.s.province || '-')}</span>
          <span class="ca-grp"><span class="${r.c.badgeClass}">${E(r.c.label)}</span></span></div></div>
        <div class="ca-data"><div><span class="ca-lbl">GPA ล่าสุด</span>${gpaTxt}</div><div><span class="ca-lbl">SDQ ล่าสุด</span>${sdqTxt}</div></div>
        <div class="ca-whys">${why}</div>
        <div class="ca-act"><button type="button" class="btn btn-sm" data-ca-open="${r.idx}">ดูข้อมูล</button>
          ${typeof window.exportStudentPdf === 'function' ? `<button type="button" class="btn btn-sm" data-ca-pdf="${r.idx}">PDF</button>` : ''}</div>
      </li>`;
    };
    const title = st.cell ? (() => { const [gk, sk] = st.cell.split('|').map(Number);
      return `${GROW.find(x => x.k === gk).t} · ${SCOL.find(x => x.k === sk).t}`; })()
      : st.group === 'focus' ? 'นักเรียนที่ต้องดูแลและเฝ้าระวัง' : st.group === 'all' ? 'นักเรียนทั้งหมด' : LABELS[st.group].text;
    return `<div class="ca-head">
        <div><h3>วิเคราะห์กลุ่มการดูแล: ผลการเรียนล่าสุด + ผลประเมิน SDQ ล่าสุด</h3>
          <p>ใช้ GPA ภาคเรียนล่าสุดของแต่ละคน (เทียบภาคก่อน) และ SDQ ฉบับล่าสุดที่ตอบครบ 25 ข้อ</p></div>
        <details class="ca-rule"><summary>เกณฑ์การจัดกลุ่ม</summary>
          <ol><li>GPA: ≥ 3.00 ปกติ · 2.50–2.99 เฝ้าระวัง · ต่ำกว่า 2.50 ต้องดูแลเป็นพิเศษ</li>
            <li>SDQ รวม 4 ด้าน: ปกติ · เสี่ยง (เฝ้าระวัง) · มีปัญหา (ต้องดูแลเป็นพิเศษ)</li>
            <li>ใช้ฝั่งที่แย่กว่าเป็นกลุ่มตั้งต้น</li>
            <li>ทั้ง GPA และ SDQ น่ากังวลพร้อมกัน → ต้องดูแลเป็นพิเศษ</li>
            <li>GPA ลดลงตั้งแต่ ${DROP.toFixed(2)} จากภาคก่อน → เลื่อนขึ้น 1 ระดับ</li>
            <li>SDQ รวมปกติ แต่บางด้านมีปัญหา → อย่างน้อยเฝ้าระวัง</li></ol></details>
      </div>
      <div class="ca-kpis">
        <div class="ca-kpi prob"><span>ต้องดูแลเป็นพิเศษ</span><b>${n[2]}</b><small>คน</small></div>
        <div class="ca-kpi risk"><span>เฝ้าระวัง</span><b>${n[1]}</b><small>คน</small></div>
        <div class="ca-kpi ok"><span>ปกติ</span><b>${n[0]}</b><small>คน</small></div>
        <div class="ca-kpi na"><span>ข้อมูลยังไม่ครบ</span><b>${partial + n['-1']}</b><small>คน · ขาด GPA หรือ SDQ</small></div>
        <div class="ca-kpi drop"><span>GPA ลดลง ≥ ${DROP.toFixed(2)}</span><b>${drops}</b><small>คน · เทียบภาคก่อน</small></div>
      </div>
      <div class="ca-body">
        <div class="ca-mwrap"><div class="ca-sub">จำนวนนักเรียนตาม GPA × SDQ <small>(กดช่องเพื่อดูรายชื่อ)</small></div>${matrix}
          <div class="ca-legend"><span><i class="ok"></i>ปกติ</span><span><i class="risk"></i>เฝ้าระวัง</span><span><i class="prob"></i>ต้องดูแลเป็นพิเศษ</span></div></div>
        <div class="ca-lwrap">
          <div class="ca-chips">${chip('focus', 'ต้องดูแล + เฝ้าระวัง', n[2] + n[1])}${chip('2', 'ต้องดูแลเป็นพิเศษ', n[2], 'c-prob')}${chip('1', 'เฝ้าระวัง', n[1], 'c-risk')}${chip('0', 'ปกติ', n[0], 'c-ok')}${chip('all', 'ทั้งหมด', all.length)}</div>
          <div class="ca-ltitle">${E(title)} · ${list.length} คน ${st.cell ? '<button type="button" class="ca-clear" data-ca-clear>ล้างตัวกรอง</button>' : ''}</div>
          <ul class="ca-list">${list.slice(0, 60).map(item).join('') || '<li class="ca-empty">ไม่มีนักเรียนในกลุ่มนี้</li>'}</ul>
          ${list.length > 60 ? `<div class="ca-more">แสดง 60 จาก ${list.length} คน — ใช้ช่องค้นหาด้านล่างเพื่อหาคนที่ต้องการ</div>` : ''}
        </div>
      </div>`;
  }

  function render() {
    const page = document.getElementById('gps-kpi')?.closest('.page');
    const kpi = document.getElementById('gps-kpi');
    if (!page || !kpi) return;
    let box = document.getElementById('gps-care');
    if (!box) { box = document.createElement('section'); box.id = 'gps-care'; box.className = 'ca-card'; kpi.insertAdjacentElement('afterend', box); bind(box); }
    box.innerHTML = panelHtml();
  }
  function bind(box) {
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.caGroup) { st.group = b.dataset.caGroup; st.cell = null; render(); return; }
      if (b.dataset.caCell) { st.cell = st.cell === b.dataset.caCell ? null : b.dataset.caCell; render(); return; }
      if (b.hasAttribute('data-ca-clear')) { st.cell = null; render(); return; }
      if (b.dataset.caOpen) { openStudentDetail(+b.dataset.caOpen); return; }
      if (b.dataset.caPdf) window.exportStudentPdf(+b.dataset.caPdf);
    });
  }

  const _rg = window.renderGpaSheet;
  if (typeof _rg === 'function') {
    window.renderGpaSheet = function () {
      const r = _rg.apply(this, arguments);
      try {
        render();
        // คอลัมน์ "ผล SDQ ภาคเรียนนี้" → SDQ ล่าสุด (พร้อมภาคเรียน) ให้ตรงกับการวิเคราะห์
        const head = [...document.querySelectorAll('#page-gpasheet th')].find(th => /ผล SDQ ภาคเรียนนี้/.test(th.textContent));
        if (head) head.textContent = 'SDQ ล่าสุด';
        const tb = document.getElementById('gps-tbody');
        if (tb && head) {
          const col = [...head.parentElement.children].indexOf(head);
          tb.querySelectorAll('tr').forEach(tr => {
            const btn = tr.querySelector('[onclick*="openStudentDetail("]');
            const m = btn && btn.getAttribute('onclick').match(/openStudentDetail\((\d+)\)/);
            const td = tr.children[col]; if (!m || !td) return;
            const q = compute(DB.students[+m[1]]).sdq;
            td.innerHTML = q ? `<span class="badge ${typeof sdqGroupBadge === 'function' ? sdqGroupBadge(q.group) : ''}">${E(q.group)}</span><div style="font-size:10.5px;color:var(--text3)">${E(q.term)}</div>`
              : '<span class="badge b-gray">ยังไม่ประเมิน</span>';
          });
        }
      } catch (e) { console.warn('care analysis', e); }
      return r;
    };
  }
})();
