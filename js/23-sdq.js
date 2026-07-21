/* ============================================================
   23-sdq.js — แบบประเมินพฤติกรรมนักเรียน SDQ (ฉบับครูเป็นผู้ประเมิน)
   - 25 ข้อ, คิดคะแนน 5 ด้าน, แปลผลจัดกลุ่ม (ปกติ/เสี่ยง/มีปัญหา)
   - Dashboard สรุปผลรายชั้น/ภาคเรียน
   - Export PDF
   - แอดมินเปิด-ปิดได้ (ใช้สิทธิ์ key 'sdq' ผ่าน window.Term)
   ============================================================ */
(function () {
  'use strict';

  /* ---------- นิยามข้อคำถาม 25 ข้อ ----------
     sub: emo(อารมณ์) con(ความประพฤติ/เกเร) hyp(ไม่อยู่นิ่ง/สมาธิสั้น) peer(เพื่อน) pro(สัมพันธภาพ/จุดแข็ง)
     rev: ข้อที่ให้คะแนนกลับด้าน (2-1-0) ได้แก่ 7,11,14,21,25 */
  const ITEMS = [
    { n: 1,  t: 'ห่วงใยความรู้สึกของคนอื่น', sub: 'pro' },
    { n: 2,  t: 'อยู่ไม่นิ่ง นั่งนิ่ง ๆ ไม่ได้', sub: 'hyp' },
    { n: 3,  t: 'มักจะบ่นว่าปวดศีรษะ ปวดท้อง หรือไม่สบาย', sub: 'emo' },
    { n: 4,  t: 'เต็มใจแบ่งปันสิ่งของให้เพื่อน (ขนม ของเล่น ดินสอ เป็นต้น)', sub: 'pro' },
    { n: 5,  t: 'มักจะอาละวาดหรือโมโหร้าย', sub: 'con' },
    { n: 6,  t: 'ค่อนข้างแยกตัว ชอบเล่นคนเดียว', sub: 'peer' },
    { n: 7,  t: 'เชื่อฟัง มักจะทำตามที่ผู้ใหญ่ต้องการ', sub: 'con', rev: true },
    { n: 8,  t: 'กังวลใจหลายเรื่อง ดูวิตกกังวลเสมอ', sub: 'emo' },
    { n: 9,  t: 'เป็นที่พึ่งได้เวลาที่คนอื่นเสียใจ อารมณ์ไม่ดี หรือไม่สบายใจ', sub: 'pro' },
    { n: 10, t: 'อยู่ไม่สุข วุ่นวายอย่างมาก', sub: 'hyp' },
    { n: 11, t: 'มีเพื่อนสนิท', sub: 'peer', rev: true },
    { n: 12, t: 'มักมีเรื่องทะเลาะวิวาทกับเด็กอื่น หรือรังแกเด็กอื่น', sub: 'con' },
    { n: 13, t: 'ดูไม่มีความสุข ท้อแท้ ร้องไห้บ่อย', sub: 'emo' },
    { n: 14, t: 'เป็นที่ชื่นชอบของเพื่อน', sub: 'peer', rev: true },
    { n: 15, t: 'วอกแวกง่าย สมาธิสั้น', sub: 'hyp' },
    { n: 16, t: 'เครียด ไม่ยอมห่างเวลาอยู่ในสถานการณ์ที่ไม่คุ้น และขาดความเชื่อมั่นในตนเอง', sub: 'emo' },
    { n: 17, t: 'ใจดีกับเด็กที่เล็กกว่า', sub: 'pro' },
    { n: 18, t: 'ชอบโกหกหรือขี้โกง', sub: 'con' },
    { n: 19, t: 'ถูกเด็กคนอื่นล้อเลียนหรือรังแก', sub: 'peer' },
    { n: 20, t: 'ชอบอาสาช่วยเหลือคนอื่น (พ่อ แม่ ครู เด็กคนอื่น)', sub: 'pro' },
    { n: 21, t: 'คิดก่อนทำ', sub: 'hyp', rev: true },
    { n: 22, t: 'ขโมยของที่บ้าน ที่โรงเรียน หรือที่อื่น', sub: 'con' },
    { n: 23, t: 'เข้ากับผู้ใหญ่ได้ดีกว่าเด็กวัยเดียวกัน', sub: 'peer' },
    { n: 24, t: 'ขี้กลัว รู้สึกหวาดกลัวได้ง่าย', sub: 'emo' },
    { n: 25, t: 'ทำงานได้จนเสร็จ มีความตั้งใจในการทำงาน', sub: 'hyp', rev: true }
  ];

  const CHOICES = [
    { v: 0, label: 'ไม่จริง' },
    { v: 1, label: 'ค่อนข้างจริง' },
    { v: 2, label: 'จริง' }
  ];

  /* ---------- นิยามด้านและเกณฑ์แปลผล (ฉบับครูประเมิน) ---------- */
  // difficulty subscales: ยิ่งมากยิ่งแย่  |  pro: จุดแข็ง ยิ่งมากยิ่งดี
  const SUBS = {
    emo:  { label: 'ด้านอารมณ์',                 short: 'อารมณ์',   normalMax: 5, riskVal: 6 },
    con:  { label: 'ด้านความประพฤติ/เกเร',        short: 'เกเร',     normalMax: 4, riskVal: 5 },
    hyp:  { label: 'ด้านพฤติกรรมไม่อยู่นิ่ง/สมาธิสั้น', short: 'สมาธิสั้น', normalMax: 5, riskVal: 6 },
    peer: { label: 'ด้านความสัมพันธ์กับเพื่อน',    short: 'เพื่อน',   normalMax: 3, riskVal: 4 }
  };
  const SUB_ORDER = ['emo', 'con', 'hyp', 'peer'];

  // pro (สัมพันธภาพทางสังคม/จุดแข็ง): 4-10 จุดแข็ง, 3 เสี่ยง, 0-2 ควรส่งเสริม
  // total (4 ด้านรวม): 0-15 ปกติ, 16-17 เสี่ยง, 18-40 มีปัญหา
  const GROUP = {
    normal:  { key: 'normal',  label: 'ปกติ',    color: 'var(--green)', bg: 'var(--green-lt)' },
    risk:    { key: 'risk',    label: 'เสี่ยง',   color: 'var(--amber)', bg: 'var(--amber-lt)' },
    problem: { key: 'problem', label: 'มีปัญหา', color: 'var(--red)',   bg: 'var(--red-lt)' }
  };

  function interpDiff(subKey, score) {
    const c = SUBS[subKey];
    if (score <= c.normalMax) return 'normal';
    if (score === c.riskVal) return 'risk';
    return 'problem';
  }
  function interpTotal(total) {
    if (total <= 15) return 'normal';
    if (total <= 17) return 'risk';
    return 'problem';
  }
  function interpPro(pro) {
    if (pro >= 4) return 'normal';   // จุดแข็ง
    if (pro === 3) return 'risk';
    return 'problem';                // 0-2 ควรส่งเสริม
  }

  /* ---------- ตัวช่วย ---------- */
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function isStaff() { return !window.STUDENT_MODE; }
  function activeTerm() { return (window.Term && Term.active && Term.active()) || '2/2568'; }
  function termLabel(t) { return (window.Term && Term.label) ? Term.label(t) : ('ภาคเรียน ' + t); }
  function allTerms() { return (window.Term && Term.all) ? Term.all() : [activeTerm()]; }
  function sdqOpen() { return !window.Term || !Term.isFormOpen || Term.isFormOpen('sdq'); }

  let _saveTimer = null;
  function scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => { try { if (typeof saveToStorage === 'function') saveToStorage(); } catch (e) {} }, 700);
  }

  /* ---------- เข้าถึงข้อมูล SDQ บน student.sdq[term] ---------- */
  function recOf(student, term, create) {
    if (!student.sdq) { if (!create) return null; student.sdq = {}; }
    if (!student.sdq[term]) {
      if (!create) return null;
      student.sdq[term] = { grade: student.class || student.grade || student.level || '', ans: {}, assessor: '', updatedAt: null };
    }
    if (!student.sdq[term].ans) student.sdq[term].ans = {};
    return student.sdq[term];
  }

  /* ---------- คิดคะแนน ---------- */
  function itemScore(item, ans) {
    if (ans == null || ans === '') return null;
    const a = Number(ans);
    return item.rev ? (2 - a) : a;
  }
  function computeScores(rec) {
    const sums = { emo: 0, con: 0, hyp: 0, peer: 0, pro: 0 };
    let answered = 0;
    ITEMS.forEach(it => {
      const raw = rec && rec.ans ? rec.ans[it.n] : null;
      const s = itemScore(it, raw);
      if (s != null) { sums[it.sub] += s; answered++; }
    });
    const total = sums.emo + sums.con + sums.hyp + sums.peer;
    const groups = {
      emo: interpDiff('emo', sums.emo),
      con: interpDiff('con', sums.con),
      hyp: interpDiff('hyp', sums.hyp),
      peer: interpDiff('peer', sums.peer),
      pro: interpPro(sums.pro),
      total: interpTotal(total)
    };
    return { sums, total, groups, answered, complete: answered === 25 };
  }

  /* ---------- สถานะปัจจุบันของหน้า ---------- */
  const state = { view: 'list', idx: null, term: null, search: '', dashTerm: null, filter: 'all' };

  function studentsSorted() {
    return DB.students.slice().sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function root() { return document.getElementById('sdq-root'); }

  function renderSdqPage() {
    const el = root(); if (!el) return;
    if (!isStaff()) { el.innerHTML = '<div class="sdq-empty">หน้านี้สำหรับครู/ผู้ดูแลเท่านั้น</div>'; return; }
    if (state.term == null) state.term = activeTerm();
    if (state.dashTerm == null) state.dashTerm = activeTerm();
    if (state.view === 'assess' && state.idx != null) renderAssess();
    else if (state.view === 'dashboard') renderDashboard();
    else renderList();
  }

  function topBar(active) {
    const open = sdqOpen();
    return `<div class="sdq-topbar">
      <div class="sdq-tabs">
        <button class="sdq-tab ${active === 'list' ? 'on' : ''}" data-sdq="view-list">📝 ประเมินรายคน</button>
        <button class="sdq-tab ${active === 'dashboard' ? 'on' : ''}" data-sdq="view-dash">📊 Dashboard สรุปผล</button>
      </div>
      <label class="sdq-access" title="เปิด/ปิดการประเมิน SDQ สำหรับครู">
        <input type="checkbox" data-sdq="toggle-open" ${open ? 'checked' : ''}>
        <span>${open ? 'เปิดให้ประเมิน' : 'ปิดการประเมิน'}</span>
      </label>
    </div>`;
  }

  /* ---------- 1) รายชื่อนักเรียน ---------- */
  function renderList() {
    const term = state.term;
    const q = state.search.trim().toLowerCase();
    let list = studentsSorted();
    if (q) list = list.filter(s => (s.name || '').toLowerCase().includes(q) || String(s.no || '').includes(q) || (s.school || '').toLowerCase().includes(q));

    const rows = list.map(s => {
      const rec = recOf(s, term, false);
      const sc = rec ? computeScores(rec) : null;
      let status;
      if (!rec || !sc || sc.answered === 0) status = '<span class="sdq-pill none">ยังไม่ประเมิน</span>';
      else if (!sc.complete) status = '<span class="sdq-pill part">ทำ ' + sc.answered + '/25</span>';
      else { const g = GROUP[sc.groups.total]; status = '<span class="sdq-pill" style="background:' + g.bg + ';color:' + g.color + '">' + g.label + '</span>'; }
      return `<tr data-sdq="open" data-idx="${DB.students.indexOf(s)}">
        <td class="sdq-no">${esc(s.no || '-')}</td>
        <td>${esc(s.name || '-')}</td>
        <td class="sdq-hide-sm">${esc(s.school || '-')}</td>
        <td>${status}</td>
        <td class="sdq-go">›</td></tr>`;
    }).join('');

    root().innerHTML = topBar('list') + `
      <div class="sdq-list-head">
        <div class="sdq-termsel">
          <span>ภาคเรียน</span>
          <select data-sdq="term">${allTerms().map(t => `<option value="${t}" ${t === term ? 'selected' : ''}>${esc(termLabel(t))}</option>`).join('')}</select>
        </div>
        <input class="sdq-search" data-sdq="search" placeholder="🔍 ค้นหาชื่อ / ลำดับ / โรงเรียน" value="${esc(state.search)}">
      </div>
      <div class="sdq-card">
        <table class="sdq-table">
          <thead><tr><th>ลำดับ</th><th>ชื่อ - สกุล</th><th class="sdq-hide-sm">โรงเรียน</th><th>ผลประเมิน (${esc(termLabel(term))})</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" class="sdq-empty">ไม่พบนักเรียน</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  /* ---------- 2) แบบประเมินรายคน ---------- */
  function renderAssess() {
    const s = DB.students[state.idx];
    if (!s) { state.view = 'list'; return renderList(); }
    const term = state.term;
    const rec = recOf(s, term, true);
    const open = sdqOpen();

    const items = ITEMS.map(it => {
      const cur = rec.ans[it.n];
      const opts = CHOICES.map(c => `<label class="sdq-opt ${String(cur) === String(c.v) ? 'sel' : ''}">
        <input type="radio" name="sdq-${it.n}" value="${c.v}" ${String(cur) === String(c.v) ? 'checked' : ''} ${open ? '' : 'disabled'} data-sdq="ans" data-n="${it.n}">
        <span>${c.label}</span></label>`).join('');
      return `<tr><td class="sdq-qn">${it.n}</td><td class="sdq-qt">${esc(it.t)}</td><td class="sdq-qopts">${opts}</td></tr>`;
    }).join('');

    root().innerHTML = topBar('list') + `
      <div class="sdq-assess-head">
        <button class="sdq-back" data-sdq="view-list">← กลับรายชื่อ</button>
        <div class="sdq-stu">
          <div class="sdq-stu-name">${esc(s.name || '-')}</div>
          <div class="sdq-stu-sub">ลำดับ ${esc(s.no || '-')} · ${esc(s.school || '-')}</div>
        </div>
        <div class="sdq-head-actions">
          <button class="sdq-btn ghost" data-sdq="pdf">🧾 Export PDF</button>
        </div>
      </div>

      ${open ? '' : '<div class="sdq-closed-note">🔒 การประเมิน SDQ ถูกปิดโดยผู้ดูแล — ขณะนี้ดูผลได้แต่แก้ไขไม่ได้</div>'}

      <div class="sdq-meta">
        <label>ระดับชั้น <input type="text" data-sdq="grade" value="${esc(rec.grade || '')}" placeholder="เช่น ม.2/1" ${open ? '' : 'disabled'}></label>
        <label>ภาคเรียน
          <select data-sdq="term" ${open ? '' : 'disabled'}>${allTerms().map(t => `<option value="${t}" ${t === term ? 'selected' : ''}>${esc(termLabel(t))}</option>`).join('')}</select>
        </label>
        <label>ครูผู้ประเมิน <input type="text" data-sdq="assessor" value="${esc(rec.assessor || '')}" placeholder="ชื่อครูผู้ประเมิน" ${open ? '' : 'disabled'}></label>
      </div>

      <div class="sdq-assess-grid">
        <div class="sdq-card sdq-qwrap">
          <div class="sdq-instruction">ทำเครื่องหมายให้ตรงกับพฤติกรรมที่เกิดขึ้นในช่วง 6 เดือนที่ผ่านมา</div>
          <table class="sdq-qtable"><tbody>${items}</tbody></table>
        </div>
        <div class="sdq-scorewrap"><div id="sdq-scorepanel">${scorePanelHtml(rec)}</div></div>
      </div>`;
  }

  function scorePanelHtml(rec) {
    const sc = computeScores(rec);
    const rowsHtml = SUB_ORDER.map(k => {
      const g = GROUP[sc.groups[k]];
      return `<div class="sdq-score-row">
        <span class="sdq-score-label">${SUBS[k].label}</span>
        <span class="sdq-score-val">${sc.sums[k]}</span>
        <span class="sdq-score-grp" style="background:${g.bg};color:${g.color}">${g.label}</span></div>`;
    }).join('');
    const gt = GROUP[sc.groups.total];
    const gp = GROUP[sc.groups.pro];
    return `<div class="sdq-score-card">
      <div class="sdq-score-title">ผลการประเมิน</div>
      <div class="sdq-progress">ทำแล้ว ${sc.answered}/25 ข้อ</div>
      ${rowsHtml}
      <div class="sdq-score-row total">
        <span class="sdq-score-label">รวมคะแนน 4 ด้าน</span>
        <span class="sdq-score-val">${sc.total}</span>
        <span class="sdq-score-grp" style="background:${gt.bg};color:${gt.color}">${gt.label}</span></div>
      <div class="sdq-score-row">
        <span class="sdq-score-label">ด้านสัมพันธภาพ (จุดแข็ง)</span>
        <span class="sdq-score-val">${sc.sums.pro}</span>
        <span class="sdq-score-grp" style="background:${gp.bg};color:${gp.color}">${sc.groups.pro === 'normal' ? 'จุดแข็ง' : gp.label}</span></div>
      <div class="sdq-overall" style="background:${gt.bg};color:${gt.color}">
        สรุป: จัดอยู่ในกลุ่ม <b>${gt.label}</b></div>
    </div>`;
  }

  /* ---------- 3) Dashboard ---------- */
  function renderDashboard() {
    const term = state.dashTerm;
    const students = studentsSorted();
    const assessed = [];
    students.forEach(s => {
      const rec = recOf(s, term, false);
      if (rec) { const sc = computeScores(rec); if (sc.answered > 0) assessed.push({ s, rec, sc }); }
    });
    const done = assessed.filter(a => a.sc.complete);

    // tally overall groups
    const tally = { normal: 0, risk: 0, problem: 0 };
    done.forEach(a => tally[a.sc.groups.total]++);
    // per-subscale tally
    const subTally = {};
    ['emo', 'con', 'hyp', 'peer', 'pro'].forEach(k => subTally[k] = { normal: 0, risk: 0, problem: 0 });
    done.forEach(a => ['emo', 'con', 'hyp', 'peer', 'pro'].forEach(k => subTally[k][a.sc.groups[k]]++));

    const total = students.length;
    const pct = n => done.length ? Math.round(n * 100 / done.length) : 0;

    // list filtered
    let listRows = done.slice();
    if (state.filter !== 'all') listRows = listRows.filter(a => a.sc.groups.total === state.filter);
    listRows.sort((a, b) => b.sc.total - a.sc.total);

    const metric = (label, val, sub, accent) => `<div class="sdq-metric" style="--m:${accent}">
      <div class="sdq-metric-val">${val}</div><div class="sdq-metric-label">${label}</div>${sub ? '<div class="sdq-metric-sub">' + sub + '</div>' : ''}</div>`;

    const bar = (t) => `<div class="sdq-bar">
      <div class="seg n" style="width:${pct(t.normal)}%" title="ปกติ ${t.normal}"></div>
      <div class="seg r" style="width:${pct(t.risk)}%" title="เสี่ยง ${t.risk}"></div>
      <div class="seg p" style="width:${pct(t.problem)}%" title="มีปัญหา ${t.problem}"></div></div>`;

    const subRows = ['emo', 'con', 'hyp', 'peer', 'pro'].map(k => {
      const lbl = k === 'pro' ? 'สัมพันธภาพ (จุดแข็ง)' : SUBS[k].label;
      const t = subTally[k];
      return `<tr><td>${lbl}</td>
        <td class="sdq-cellbar">${bar(t)}</td>
        <td class="c n">${t.normal}</td><td class="c r">${t.risk}</td><td class="c p">${t.problem}</td></tr>`;
    }).join('');

    const rows = listRows.map(a => {
      const g = GROUP[a.sc.groups.total];
      const chip = k => { const gg = GROUP[a.sc.groups[k]]; return '<span class="sdq-mini" style="background:' + gg.bg + ';color:' + gg.color + '" title="' + SUBS[k].label + '">' + a.sc.sums[k] + '</span>'; };
      const pro = GROUP[a.sc.groups.pro];
      return `<tr data-sdq="open" data-idx="${DB.students.indexOf(a.s)}">
        <td class="sdq-no">${esc(a.s.no || '-')}</td>
        <td>${esc(a.s.name || '-')}</td>
        <td class="sdq-hide-sm">${esc(a.rec.grade || '-')}</td>
        <td>${chip('emo')}${chip('con')}${chip('hyp')}${chip('peer')}</td>
        <td><span class="sdq-mini" style="background:${pro.bg};color:${pro.color}">${a.sc.sums.pro}</span></td>
        <td class="sdq-tot">${a.sc.total}</td>
        <td><span class="sdq-pill" style="background:${g.bg};color:${g.color}">${g.label}</span></td></tr>`;
    }).join('');

    root().innerHTML = topBar('dashboard') + `
      <div class="sdq-list-head">
        <div class="sdq-termsel"><span>ภาคเรียน</span>
          <select data-sdq="dashterm">${allTerms().map(t => `<option value="${t}" ${t === term ? 'selected' : ''}>${esc(termLabel(t))}</option>`).join('')}</select></div>
        <button class="sdq-btn ghost" data-sdq="dash-pdf">🧾 Export PDF สรุป</button>
      </div>

      <div class="sdq-metrics">
        ${metric('นักเรียนทั้งหมด', total, '', 'var(--blue)')}
        ${metric('ประเมินครบแล้ว', done.length, assessed.length > done.length ? ('ทำค้าง ' + (assessed.length - done.length) + ' คน') : '', 'var(--teal)')}
        ${metric('กลุ่มปกติ', tally.normal, pct(tally.normal) + '%', 'var(--green)')}
        ${metric('กลุ่มเสี่ยง', tally.risk, pct(tally.risk) + '%', 'var(--amber)')}
        ${metric('กลุ่มมีปัญหา', tally.problem, pct(tally.problem) + '%', 'var(--red)')}
      </div>

      <div class="sdq-card sdq-summary">
        <div class="sdq-card-title">สรุปผลรายด้าน (เฉพาะที่ประเมินครบ ${done.length} คน)</div>
        <table class="sdq-subtable">
          <thead><tr><th>ด้าน</th><th>สัดส่วน</th><th class="c">ปกติ</th><th class="c">เสี่ยง</th><th class="c">มีปัญหา</th></tr></thead>
          <tbody>${subRows}</tbody>
        </table>
        <div class="sdq-legend"><span class="lg n">■ ปกติ</span> <span class="lg r">■ เสี่ยง</span> <span class="lg p">■ มีปัญหา</span></div>
      </div>

      <div class="sdq-card">
        <div class="sdq-card-title-row">
          <div class="sdq-card-title">รายชื่อและผลประเมิน</div>
          <div class="sdq-filter">
            ${['all', 'normal', 'risk', 'problem'].map(f => `<button class="sdq-fbtn ${state.filter === f ? 'on' : ''}" data-sdq="filter" data-f="${f}">${f === 'all' ? 'ทั้งหมด' : GROUP[f].label}</button>`).join('')}
          </div>
        </div>
        <table class="sdq-table">
          <thead><tr><th>ลำดับ</th><th>ชื่อ - สกุล</th><th class="sdq-hide-sm">ชั้น</th><th>อารมณ์·เกเร·สมาธิ·เพื่อน</th><th>จุดแข็ง</th><th>รวม</th><th>กลุ่ม</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="sdq-empty">ยังไม่มีผลประเมินในภาคเรียนนี้</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  function bind() {
    const el = root(); if (!el || el._sdqBound) return; el._sdqBound = true;

    el.addEventListener('click', e => {
      const t = e.target.closest('[data-sdq]');
      if (!t) return;
      const act = t.getAttribute('data-sdq');
      if (act === 'view-list') { state.view = 'list'; renderSdqPage(); }
      else if (act === 'view-dash') { state.view = 'dashboard'; renderSdqPage(); }
      else if (act === 'open') { state.idx = Number(t.getAttribute('data-idx')); state.view = 'assess'; renderSdqPage(); }
      else if (act === 'filter') { state.filter = t.getAttribute('data-f'); renderSdqPage(); }
      else if (act === 'pdf') { exportStudentPdf(); }
      else if (act === 'dash-pdf') { exportDashboardPdf(); }
      else if (act === 'toggle-open') {
        // handled by change; ignore click
      }
    });

    el.addEventListener('change', e => {
      const t = e.target.closest('[data-sdq]'); if (!t) return;
      const act = t.getAttribute('data-sdq');
      if (act === 'ans') {
        const s = DB.students[state.idx]; if (!s) return;
        const rec = recOf(s, state.term, true);
        rec.ans[Number(t.getAttribute('data-n'))] = Number(t.value);
        rec.updatedAt = new Date().toISOString();
        // อัปเดตแผงคะแนนสด + ไฮไลต์ตัวเลือก
        const box = document.getElementById('sdq-scorepanel');
        if (box) box.innerHTML = scorePanelHtml(rec);
        const grp = t.closest('.sdq-qopts');
        if (grp) grp.querySelectorAll('.sdq-opt').forEach(o => o.classList.toggle('sel', o.querySelector('input').checked));
        scheduleSave();
      } else if (act === 'term') {
        state.term = t.value; renderSdqPage();
      } else if (act === 'dashterm') {
        state.dashTerm = t.value; renderSdqPage();
      } else if (act === 'grade') {
        const s = DB.students[state.idx]; if (!s) return;
        recOf(s, state.term, true).grade = t.value; scheduleSave();
      } else if (act === 'assessor') {
        const s = DB.students[state.idx]; if (!s) return;
        recOf(s, state.term, true).assessor = t.value; scheduleSave();
      } else if (act === 'toggle-open') {
        if (window.Term && Term.setFormAccess) Term.setFormAccess('sdq', t.checked);
        renderSdqPage();
      }
    });

    el.addEventListener('input', e => {
      const t = e.target.closest('[data-sdq="search"]'); if (!t) return;
      state.search = t.value;
      // re-render list only (keep focus)
      const active = document.activeElement === t;
      renderList();
      if (active) { const ns = root().querySelector('[data-sdq="search"]'); if (ns) { ns.focus(); ns.setSelectionRange(ns.value.length, ns.value.length); } }
    });
  }

  /* ============================================================
     PDF EXPORT
     ============================================================ */
  function printHtml(title, inner) {
    const w = window.open('', '_blank');
    if (!w) { alert('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต popup'); return; }
    w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>${esc(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Sarabun',sans-serif;color:#2A3547;font-size:13px;line-height:1.5;padding:24px 26px}
      .pdf-head{display:flex;align-items:center;gap:12px;border-bottom:2px solid #5D87FF;padding-bottom:10px;margin-bottom:14px}
      .pdf-badge{width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#5D87FF,#49BEFF);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:13px}
      .pdf-title{font-size:17px;font-weight:700;color:#2A3547}
      .pdf-sub{font-size:12px;color:#5A6A85}
      .pdf-info{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin:10px 0 14px;font-size:13px}
      .pdf-info b{color:#2A3547}
      table{width:100%;border-collapse:collapse;margin:8px 0}
      th,td{border:1px solid #D8DEE8;padding:5px 7px;text-align:left;vertical-align:top}
      thead th{background:#ECF2FF;color:#2A3547;font-weight:600}
      .qn{width:26px;text-align:center;color:#5A6A85}
      .ck{width:74px;text-align:center}
      .mark{font-weight:700;color:#5D87FF}
      .sum th,.sum td{text-align:center}
      .sum td.l{text-align:left}
      .g-normal{color:#0F9E82;font-weight:600}.g-risk{color:#B26B00;font-weight:600}.g-problem{color:#E0523C;font-weight:700}
      .pdf-overall{margin-top:10px;padding:9px 12px;border-radius:8px;background:#ECF2FF;font-size:14px}
      .sign{margin-top:26px;text-align:center;width:280px;float:right}
      .sign .line{margin-top:34px}
      @media print{body{padding:0}.no-print{display:none}}
      .foot{margin-top:16px;font-size:11px;color:#8A97AC;border-top:1px solid #E9EDF3;padding-top:6px}
    </style></head><body>${inner}
    <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
    </body></html>`);
    w.document.close();
  }

  function exportStudentPdf() {
    const s = DB.students[state.idx]; if (!s) return;
    const term = state.term;
    const rec = recOf(s, term, true);
    const sc = computeScores(rec);
    const gLabel = k => GROUP[sc.groups[k]].label;
    const gCls = k => 'g-' + sc.groups[k];

    const itemRows = ITEMS.map(it => {
      const a = rec.ans[it.n];
      const cell = v => (String(a) === String(v)) ? '<span class="mark">✓</span>' : '';
      return `<tr><td class="qn">${it.n}</td><td>${esc(it.t)}</td>
        <td class="ck">${cell(0)}</td><td class="ck">${cell(1)}</td><td class="ck">${cell(2)}</td></tr>`;
    }).join('');

    const sumRows = SUB_ORDER.map(k =>
      `<tr><td class="l">${SUBS[k].label}</td><td>${sc.sums[k]}</td><td class="${gCls(k)}">${gLabel(k)}</td></tr>`
    ).join('') +
      `<tr style="background:#F6F8FC"><td class="l"><b>รวมคะแนน 4 ด้าน</b></td><td><b>${sc.total}</b></td><td class="${gCls('total')}"><b>${gLabel('total')}</b></td></tr>` +
      `<tr><td class="l">ด้านสัมพันธภาพทางสังคม (จุดแข็ง)</td><td>${sc.sums.pro}</td><td class="${gCls('pro')}">${sc.groups.pro === 'normal' ? 'เป็นจุดแข็ง' : gLabel('pro')}</td></tr>`;

    const inner = `
      <div class="pdf-head"><div class="pdf-badge">SDQ</div>
        <div><div class="pdf-title">แบบประเมินพฤติกรรมนักเรียน (SDQ) ฉบับครูประเมิน</div>
        <div class="pdf-sub">DLTV · มูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์</div></div></div>
      <div class="pdf-info">
        <div><b>ชื่อ-สกุล:</b> ${esc(s.name || '-')}</div>
        <div><b>โรงเรียน:</b> ${esc(s.school || '-')}</div>
        <div><b>ระดับชั้น:</b> ${esc(rec.grade || '-')}</div>
        <div><b>ภาคเรียน:</b> ${esc(termLabel(term))}</div>
        <div><b>ครูผู้ประเมิน:</b> ${esc(rec.assessor || '-')}</div>
        <div><b>ประเมินเมื่อ:</b> ${rec.updatedAt ? esc(new Date(rec.updatedAt).toLocaleDateString('th-TH', { dateStyle: 'long' })) : '-'}</div>
      </div>
      <table><thead><tr><th class="qn">ข้อ</th><th>รายการประเมิน</th><th class="ck">ไม่จริง</th><th class="ck">ค่อนข้างจริง</th><th class="ck">จริง</th></tr></thead>
        <tbody>${itemRows}</tbody></table>
      <h3 style="margin:14px 0 4px;font-size:14px">สรุปคะแนนและการแปลผล</h3>
      <table class="sum"><thead><tr><th class="l">ด้าน</th><th>คะแนน</th><th>แปลผล</th></tr></thead><tbody>${sumRows}</tbody></table>
      <div class="pdf-overall">โดยรวมนักเรียนจัดอยู่ในกลุ่ม <b class="${gCls('total')}">${gLabel('total')}</b>${sc.complete ? '' : ' (ประเมิน ' + sc.answered + '/25 ข้อ ยังไม่ครบ)'}</div>
      <div class="sign">(ลงชื่อ)................................................<div class="line">( ${esc(rec.assessor || '................................................')} )</div><div>ครูผู้ประเมิน</div></div>
      <div style="clear:both"></div>
      <div class="foot">พิมพ์จากระบบดูแลนักเรียนทุน DLTV · เกณฑ์แปลผลตามแบบประเมิน SDQ ฉบับครูประเมิน</div>`;
    printHtml('SDQ - ' + (s.name || ''), inner);
  }

  function exportDashboardPdf() {
    const term = state.dashTerm;
    const students = studentsSorted();
    const done = [];
    students.forEach(s => { const rec = recOf(s, term, false); if (rec) { const sc = computeScores(rec); if (sc.complete) done.push({ s, rec, sc }); } });
    const tally = { normal: 0, risk: 0, problem: 0 };
    done.forEach(a => tally[a.sc.groups.total]++);
    done.sort((a, b) => b.sc.total - a.sc.total);

    const gLabel = k => GROUP[k].label;
    const rows = done.map((a, i) => {
      const g = 'g-' + a.sc.groups.total;
      return `<tr><td class="qn">${i + 1}</td><td>${esc(a.s.name || '-')}</td><td>${esc(a.rec.grade || '-')}</td>
        <td style="text-align:center">${a.sc.sums.emo}</td><td style="text-align:center">${a.sc.sums.con}</td>
        <td style="text-align:center">${a.sc.sums.hyp}</td><td style="text-align:center">${a.sc.sums.peer}</td>
        <td style="text-align:center">${a.sc.sums.pro}</td><td style="text-align:center"><b>${a.sc.total}</b></td>
        <td class="${g}" style="text-align:center">${gLabel(a.sc.groups.total)}</td></tr>`;
    }).join('');

    const inner = `
      <div class="pdf-head"><div class="pdf-badge">SDQ</div>
        <div><div class="pdf-title">สรุปผลการประเมิน SDQ (ฉบับครูประเมิน)</div>
        <div class="pdf-sub">${esc(termLabel(term))} · ประเมินครบ ${done.length} คน</div></div></div>
      <div class="pdf-info">
        <div><b>กลุ่มปกติ:</b> <span class="g-normal">${tally.normal} คน</span></div>
        <div><b>กลุ่มเสี่ยง:</b> <span class="g-risk">${tally.risk} คน</span></div>
        <div><b>กลุ่มมีปัญหา:</b> <span class="g-problem">${tally.problem} คน</span></div>
        <div><b>รวมประเมิน:</b> ${done.length} คน</div>
      </div>
      <table><thead><tr><th class="qn">#</th><th>ชื่อ-สกุล</th><th>ชั้น</th>
        <th>อารมณ์</th><th>เกเร</th><th>สมาธิ</th><th>เพื่อน</th><th>จุดแข็ง</th><th>รวม</th><th>กลุ่ม</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10" style="text-align:center">ยังไม่มีข้อมูล</td></tr>'}</tbody></table>
      <div class="foot">พิมพ์จากระบบดูแลนักเรียนทุน DLTV · เรียงตามคะแนนรวมจากมากไปน้อย</div>`;
    printHtml('SDQ Dashboard ' + term, inner);
  }

  /* ============================================================
     HOOKS
     ============================================================ */
  /* ---------- helper: ผลสรุป SDQ ล่าสุด (ครบ 25 ข้อ) ของนักเรียน ----------
     ใช้แทน "ความเสี่ยง" เดิมในหน้ารายชื่อ เมื่อครูประเมินครบแล้ว */
  function cmpTermSafe(a, b) {
    if (window.Term && Term.cmp) { try { return Term.cmp(a, b); } catch (e) {} }
    return a > b ? 1 : (a < b ? -1 : 0);
  }
  function sdqOverallFor(student) {
    if (!student || !student.sdq) return null;
    let best = null;
    Object.keys(student.sdq).forEach(term => {
      const rec = student.sdq[term];
      if (!rec || !rec.ans) return;
      const sc = computeScores(rec);
      if (!sc.complete) return;                       // ต้องประเมินครบ 25 ข้อเท่านั้น
      if (!best || cmpTermSafe(term, best.term) > 0) best = { group: sc.groups.total, term };
    });
    if (!best) return null;
    const g = GROUP[best.group];
    return { group: best.group, label: g.label, color: g.color, bg: g.bg, term: best.term };
  }
  function sdqRiskBadge(student) {
    const o = sdqOverallFor(student);
    if (!o) return '';
    return '<span class="badge sdq-risk-badge" style="background:' + o.bg + ';color:' + o.color +
      '" title="ผลจากแบบประเมิน SDQ (' + esc(termLabel(o.term)) + ')">🧠 ' + o.label + '</span>';
  }
  window.sdqOverallFor = sdqOverallFor;
  window.sdqRiskBadge = sdqRiskBadge;

  window.renderSdqPage = function () { bind(); renderSdqPage(); };
  window.sdqOnDataUpdate = function () {
    // ไม่รีเฟรชระหว่างครูกำลังกรอกประเมินรายคน เพื่อไม่ให้เคอร์เซอร์/ตัวเลือกหลุด
    if (state.view === 'assess') return;
    renderSdqPage();
  };
  window.sdqOnAccessChange = function () {
    const pg = document.getElementById('page-sdq');
    if (pg && (pg.classList.contains('active') || pg.style.display === 'block')) renderSdqPage();
  };

  console.log('🧠 โมดูลแบบประเมิน SDQ พร้อมใช้งาน');
})();
