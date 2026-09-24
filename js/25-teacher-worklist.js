/* ============================================================
   25-teacher-worklist.js — หน้า "งานที่ต้องกรอก" (แทนหน้าเลือกนักเรียนเดิมของแบบฟอร์มทุน)
   ------------------------------------------------------------
   ปัญหาเดิม: หน้าเลือกนักเรียนแสดงแค่ป้ายเล็ก ๆ "แบบฟอร์ม 1 / แบบฟอร์ม 2"
   ครูไม่รู้ว่าต้องทำอะไรบ้าง ทำไปถึงไหน และต้องกดตรงไหนต่อ — และแบบประเมิน SDQ
   อยู่อีกเมนูหนึ่ง ไม่ถูกนับรวมเป็นงานของภาคเรียน

   หน้านี้รวม "งาน 3 อย่างต่อนักเรียน 1 คน ต่อภาคเรียน" ไว้ที่เดียว:
     ① แบบฟอร์มที่ 1  ② แบบฟอร์มที่ 2  ③ แบบประเมิน SDQ
   แต่ละงานบอกสถานะ + ความคืบหน้า กดเพื่อเปิดงานนั้นได้ทันที
   และมีปุ่ม "ทำต่อ" ที่พาไปยัง "ส่วนแรกที่ยังกรอกไม่ครบ" ของงานถัดไป

   ไม่แก้ข้อมูลใด ๆ — อ่านสถานะจาก Term (19) และ SDQ (23) อย่างเดียว
   โหลดหลัง 24-risk-analysis.js
   ============================================================ */
(function () {
  'use strict';

  const esc = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  const isStaff = () => !window.STUDENT_MODE;
  const activeTerm = () => (window.Term && Term.active) ? Term.active() : '1/2568';

  let wlFilter = 'all';   // all | todo | doing | done

  /* ══════════ 1) คำนวณสถานะ ══════════ */
  const TASKS = [
    { key: 'form1', title: 'แบบฟอร์มที่ 1', hint: 'ข้อมูลรายบุคคล ครอบครัว สุขภาพ' },
    { key: 'form2', title: 'แบบฟอร์มที่ 2', hint: 'ผลการเรียน ความประพฤติ การใช้จ่าย' },
    { key: 'sdq',   title: 'แบบประเมิน SDQ', hint: 'พฤติกรรม 25 ข้อ ครูเป็นผู้ประเมิน' },
  ];

  function isRequiredCountable(f) {
    return !(f.type === 'heading' || f.type === 'note' || f.type === 'table' || f.type === 'matrix' || f.optional);
  }
  function isFilled(f, v) {
    if (v === undefined || v === null) return false;
    if (f.type === 'radio') return !!v.choice;
    if (f.type === 'checkboxgroup') return !!((v.selected && v.selected.length) || v.other);
    return v !== '';
  }
  /** ส่วนแรกของฟอร์มที่ยังกรอกช่องบังคับไม่ครบ (ไม่มี = 0) */
  function firstIncompleteSection(student, formKey, term) {
    const b = window.Term ? Term.bucket(student, term) : null;
    const store = (b && b[formKey]) || {};
    const secs = sfGetSections(formKey);
    for (let i = 0; i < secs.length; i++) {
      if (secs[i].fields.some(f => isRequiredCountable(f) && !isFilled(f, store[f.id]))) return i;
    }
    return 0;
  }

  function formOpen(key) {
    if (isStaff()) return true;
    if (key === 'sdq') return !(window.SDQ && SDQ.isOpen) || SDQ.isOpen();
    return !(window.Term && Term.isFormOpen) || Term.isFormOpen(key);
  }

  /** สถานะของงานหนึ่ง → { state: none|partial|done|submitted|locked, pct, text } */
  function taskStatus(student, key, term) {
    let state = 'none', pct = 0, text = 'ยังไม่เริ่ม';
    if (key === 'sdq') {
      const bucket = student.sdq && student.sdq[term];
      if (bucket && bucket.__touched) {
        const res = (window.SDQ && SDQ.compute) ? SDQ.compute(bucket) : { totalAnswered: 0, complete: false };
        pct = Math.min(1, (res.totalAnswered || 0) / 25);
        if (bucket.submittedAt) { state = 'submitted'; text = 'ส่งแล้ว'; }
        else if (res.complete) { state = 'done'; text = 'ประเมินครบ · ' + (res.totalGroup || ''); }
        else { state = 'partial'; text = 'ตอบแล้ว ' + (res.totalAnswered || 0) + '/25 ข้อ'; }
      }
    } else if (window.Term) {
      const st = Term.state(student, key, term);
      pct = Term.progress(student, key, term);
      if (st === 'submitted') { state = 'submitted'; text = 'ส่งแล้ว'; pct = 1; }
      else if (st === 'filled') { state = 'done'; text = 'กรอกครบแล้ว'; pct = 1; }
      else if (st === 'partial') { state = 'partial'; text = 'กรอกแล้ว ' + Math.round(pct * 100) + '%'; }
      else pct = 0;
    }
    if (state !== 'done' && state !== 'submitted' && !formOpen(key)) { state = 'locked'; text = 'ยังไม่เปิดให้กรอก'; }
    return { key, state, pct, text };
  }

  function studentSummary(student, term) {
    const tasks = TASKS.map(t => Object.assign({}, t, taskStatus(student, t.key, term)));
    const doneCount = tasks.filter(t => t.state === 'done' || t.state === 'submitted').length;
    const started = tasks.some(t => t.state !== 'none' && t.state !== 'locked');
    const group = doneCount === tasks.length ? 'done' : started ? 'doing' : 'todo';
    // งานถัดไป = งานแรกที่ยังไม่ครบและเปิดให้กรอก
    const next = tasks.find(t => (t.state === 'none' || t.state === 'partial'));
    return { tasks, doneCount, group, next };
  }

  /* ══════════ 2) วาดหน้า ══════════ */
  function taskIcon(state, n) {
    if (state === 'done' || state === 'submitted') return '✓';
    if (state === 'locked') return '🔒';
    return String(n);
  }

  function taskHtml(t, n, idx) {
    const clickable = t.state !== 'locked';
    return `<button type="button" class="wl-task wl-${t.state}" ${clickable ? '' : 'disabled'}
        data-wl-open="${t.key}" data-wl-idx="${idx}"
        aria-label="${esc(t.title + ': ' + t.text)}">
      <span class="wl-task-mark" aria-hidden="true">${taskIcon(t.state, n)}</span>
      <span class="wl-task-body">
        <span class="wl-task-title">${esc(t.title)}</span>
        <span class="wl-task-hint">${esc(t.hint)}</span>
        <span class="wl-task-status">${esc(t.text)}</span>
        <span class="wl-task-bar" aria-hidden="true"><span style="width:${Math.round(t.pct * 100)}%"></span></span>
      </span>
    </button>`;
  }

  /** ข้อความปุ่ม "ทำงานถัดไป" → { main, sub } */
  function nextLabel(sum, student, term) {
    if (!sum.next) return null;
    const verb = sum.next.state === 'none' ? 'เริ่ม' : 'ทำต่อ: ';
    if (sum.next.key === 'sdq') return { main: verb + 'แบบประเมิน SDQ', sub: sum.next.state === 'none' ? '25 ข้อ' : sum.next.text };
    const secIdx = firstIncompleteSection(student, sum.next.key, term);
    const sec = sfGetSections(sum.next.key)[secIdx];
    return { main: verb + sum.next.title, sub: sec ? 'เริ่มที่ส่วน ' + (sec.short || sec.title) : '' };
  }

  function rowHtml(s, idx, sum, term) {
    const photo = (typeof photoEl === 'function') ? photoEl(s, 'wl-photo', 'wl-avatar') : '';
    const label = nextLabel(sum, s, term);
    const action = label
      ? `<button type="button" class="wl-next" data-wl-next="${idx}">${esc(label.main)}${label.sub ? `<small>${esc(label.sub)}</small>` : ''}</button>`
      : (sum.group === 'done'
          ? `<button type="button" class="wl-next wl-next-quiet" data-wl-open="form1" data-wl-idx="${idx}">ดูหรือแก้ไขแบบฟอร์ม</button>`
          : `<span class="wl-wait">รอผู้ดูแลเปิดให้กรอก</span>`);
    return `<article class="wl-row wl-row-${sum.group}">
      <div class="wl-who">
        <span class="wl-photo-wrap">${photo}</span>
        <span class="wl-who-text">
          <span class="wl-name">${esc(s.name || '(ยังไม่ระบุชื่อ)')}</span>
          <span class="wl-school">ลำดับ ${esc(s.no ?? idx + 1)} ${s.school_m1 ? '— ' + esc(s.school_m1) : ''}</span>
          <span class="wl-count">เสร็จ ${sum.doneCount} จาก 3 งาน</span>
        </span>
      </div>
      <div class="wl-tasks">${sum.tasks.map((t, i) => taskHtml(t, i + 1, idx)).join('')}</div>
      <div class="wl-action">${action}</div>
    </article>`;
  }

  function renderWorklist() {
    const term = activeTerm();
    const termText = (window.Term && Term.label) ? Term.label(term) : term;
    const q = String(sfState.query || '').trim().toLowerCase();
    const all = (DB.students || []).map((s, idx) => ({ s, idx, sum: studentSummary(s, term) }))
      .sort((a, b) => (a.s.no || 0) - (b.s.no || 0));

    const cnt = { todo: 0, doing: 0, done: 0 };
    let tasksDone = 0;
    all.forEach(r => { cnt[r.sum.group]++; tasksDone += r.sum.doneCount; });
    const tasksTotal = all.length * TASKS.length;
    const pctAll = tasksTotal ? Math.round(tasksDone / tasksTotal * 100) : 0;

    const list = all.filter(r =>
      (wlFilter === 'all' || r.sum.group === wlFilter)
      && (!q || (r.s.name || '').toLowerCase().includes(q) || (r.s.school_m1 || '').toLowerCase().includes(q)
          || (r.s.province || '').toLowerCase().includes(q) || String(r.s.no || '') === q));

    const single = !isStaff() && all.length === 1;
    const heading = single
      ? `งานของ ${esc(all[0].s.name || 'นักเรียนทุน')} ใน${esc(termText)}`
      : `งานที่ต้องกรอกใน${esc(termText)}`;
    const lead = !tasksTotal ? 'ยังไม่มีรายชื่อนักเรียนในระบบ'
      : single ? `เสร็จแล้ว ${tasksDone} จาก 3 งาน ทำตามลำดับ 1 ถึง 3 หรือกดปุ่มสีน้ำเงินเพื่อทำต่อจากที่ค้างไว้`
      : `เสร็จแล้ว ${tasksDone} จาก ${tasksTotal} งาน (นักเรียน ${all.length} คน คนละ 3 งาน) กดที่งานเพื่อเปิด หรือกดปุ่มสีน้ำเงินเพื่อทำต่อจากที่ค้างไว้`;

    const chip = (key, text, n) =>
      `<button type="button" class="wl-chip ${wlFilter === key ? 'on' : ''}" data-wl-filter="${key}" aria-pressed="${wlFilter === key}">${text}${n != null ? ` <b>${n}</b>` : ''}</button>`;

    const filters = single ? '' : `
      <div class="wl-tools">
        <div class="wl-chips" role="group" aria-label="กรองตามความคืบหน้า">
          ${chip('all', 'ทั้งหมด', all.length)}
          ${chip('todo', 'ยังไม่เริ่ม', cnt.todo)}
          ${chip('doing', 'ทำค้างไว้', cnt.doing)}
          ${chip('done', 'ครบทุกงาน', cnt.done)}
        </div>
        <input type="search" class="sf-search wl-search" data-sf-action="search"
          placeholder="ค้นหาชื่อนักเรียน โรงเรียน หรือลำดับ" value="${esc(sfState.query || '')}">
      </div>`;

    const empty = !all.length
      ? `<div class="wl-empty"><p>ยังไม่มีรายชื่อนักเรียน</p><span>${isStaff() ? 'เพิ่มนักเรียนในหน้า "รายชื่อนักเรียน" ก่อน แล้วกลับมาที่หน้านี้' : 'บัญชีนี้ยังไม่ได้เชื่อมกับข้อมูลนักเรียน แจ้งครูผู้ดูแลระบบให้ตรวจการเชื่อมบัญชี'}</span></div>`
      : !list.length
        ? `<div class="wl-empty"><p>ไม่พบนักเรียนตามเงื่อนไขนี้</p><span>ลองเลือก "ทั้งหมด" หรือเปลี่ยนคำค้นหา</span></div>`
        : '';

    return `<section class="wl ${single ? 'wl-single' : ''}">
      <header class="wl-head">
        <h2>${heading}</h2>
        <p>${lead}</p>
        ${tasksTotal ? `<div class="wl-overall" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctAll}" aria-label="ความคืบหน้ารวม">
          <span style="width:${pctAll}%"></span></div>` : ''}
      </header>
      ${filters}
      ${empty || `<div class="wl-list">${list.map(r => rowHtml(r.s, r.idx, r.sum, term)).join('')}</div>`}
    </section>`;
  }

  /* ══════════ 3) เปิดงาน ══════════ */
  function openTask(idx, key) {
    const s = DB.students[idx]; if (!s) return;
    if (key === 'sdq') {
      if (window.SDQ && SDQ.openFor) SDQ.openFor(idx, activeTerm());
      return;
    }
    sfState.studentIdx = idx;
    sfState.formKey = key;
    sfState.sectionIndex = firstIncompleteSection(s, key, activeTerm());
    sfState.lastDir = 'jump';
    sfRenderPage();
    const main = document.querySelector('.main'); if (main) main.scrollTop = 0;
  }

  function bindOnce() {
    const root = document.getElementById('sf-root');
    if (!root || root.dataset.wlBound) return;
    root.dataset.wlBound = '1';
    root.addEventListener('click', e => {
      const f = e.target.closest('[data-wl-filter]');
      if (f) { wlFilter = f.getAttribute('data-wl-filter'); sfRenderPage(); return; }
      const o = e.target.closest('[data-wl-open]');
      if (o && !o.disabled) { openTask(+o.getAttribute('data-wl-idx'), o.getAttribute('data-wl-open')); return; }
      const n = e.target.closest('[data-wl-next]');
      if (n) {
        const idx = +n.getAttribute('data-wl-next');
        const sum = studentSummary(DB.students[idx], activeTerm());
        if (sum.next) openTask(idx, sum.next.key);
      }
    });
  }

  /* ══════════ 4) แทนที่หน้าเลือกนักเรียนเดิม ══════════ */
  if (typeof sfRenderPicker === 'function') {
    sfRenderPicker = function () { setTimeout(bindOnce, 0); return renderWorklist(); };
  }
  window.Worklist = { render: renderWorklist, summary: studentSummary };
})();
