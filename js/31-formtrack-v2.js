/* ============================================================
   31-formtrack-v2.js — หน้า "ติดตามการกรอกแบบฟอร์ม" แบบใหม่ (แทน renderFormTrack เดิม)
   ------------------------------------------------------------
   เดิม: การ์ด 4 ใบ + ตารางที่รวมทุกอย่างไว้ในช่องเดียว (ป้าย "กรอกบางส่วน" + ป้ายย่อย + ลิงก์)
         ต้องอ่านทีละแถวจึงจะรู้ว่าใครค้างงานไหน
   ใหม่:
   1) ภาพรวมภาคเรียน — งานเสร็จกี่ % (1 คน = 3 งาน: ฟอร์ม 1, ฟอร์ม 2, SDQ) + แถบสีสัดส่วน
   2) การ์ดรายงาน 3 ใบ — แต่ละงานมีครบ / กำลังกรอก / ยังไม่เริ่ม กี่คน กด "ดูคนที่ยังค้าง" ได้ทันที
   3) ตาราง 1 แถว = 1 คน · 1 คอลัมน์ = 1 งาน — มองลงคอลัมน์เดียวก็รู้ว่าใครยังไม่ทำงานนั้น
      ช่องที่กำลังกรอกบอก % และ "ส่วนที่ยังค้าง" · กดที่ช่องเพื่อดูตัวอย่าง/เปิดงาน
   4) กรอง / ค้นหา / เรียง "ค้างมากสุดก่อน" / ส่งออก CSV
   ใช้สถานะชุดเดียวกับหน้า "งานที่ต้องกรอก" (Worklist) และ Term — ไม่แก้ข้อมูลใด ๆ
   ============================================================ */
(function () {
  'use strict';

  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isStaff = () => !window.STUDENT_MODE;
  const activeTerm = () => (window.Term && Term.active) ? Term.active() : '1/2568';
  const PER_PAGE = 20;
  const TASK_KEYS = ['form1', 'form2', 'sdq'];
  const TASK_NAME = { form1: 'แบบฟอร์มที่ 1', form2: 'แบบฟอร์มที่ 2', sdq: 'แบบประเมิน SDQ' };
  const TASK_HINT = { form1: 'ข้อมูลรายบุคคล', form2: 'ผลการเรียน ความประพฤติ การใช้จ่าย', sdq: 'พฤติกรรม 25 ข้อ' };

  const st = { page: 1, group: 'all', task: null, q: '', sort: 'no' };

  /* ---------- สถานะ ---------- */
  const isDone = s => s === 'done' || s === 'submitted';
  function required(f) { return !['heading', 'note', 'table', 'matrix'].includes(f.type) && !f.optional; }
  function filled(f, v) {
    if (v === undefined || v === null) return false;
    if (f.type === 'radio') return !!v.choice;
    if (f.type === 'checkboxgroup') return !!((v.selected && v.selected.length) || v.other);
    return v !== '';
  }
  function missingSections(s, key, term) {
    if (key === 'sdq' || !window.Term) return [];
    const b = Term.bucket(s, term); const store = (b && b[key]) || {};
    return sfGetSections(key).filter(sec => sec.fields.some(f => required(f) && !filled(f, store[f.id])))
      .map(sec => sec.short || sec.title);
  }
  function submittedAt(s, key, term) {
    try {
      if (key === 'sdq') return (s.sdq && s.sdq[term] && s.sdq[term].submittedAt) || '';
      return (Term.meta(s, key, term) || {}).submittedAt || '';
    } catch (e) { return ''; }
  }
  const thDateTime = iso => { try { const d = new Date(iso); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'; } catch (e) { return ''; } };
  const thDate = iso => { try { return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); } catch (e) { return ''; } };

  // v48: เอกสารแนบจำเป็นของแบบฟอร์มที่ 2 (ผลการเรียน + สมุดบัญชี)
  function attachInfo(s, term) {
    try {
      const f = sfFindField('form2', 'attachments'); const req = ((f && f.kinds) || []).filter(k => k.required);
      const v = (s.forms && s.forms[term] && s.forms[term].form2 && s.forms[term].form2.attachments) || {};
      return { need: req.length, ok: req.filter(k => (v[k.id] || []).length).length, missing: req.filter(k => !(v[k.id] || []).length).map(k => k.short || k.label) };
    } catch (e) { return { need: 0, ok: 0, missing: [] }; }
  }
  function rowsFor(term) {
    return (DB.students || []).map((s, idx) => {
      const sum = Worklist.summary(s, term);
      const tasks = {};
      sum.tasks.forEach(t => { tasks[t.key] = t; });
      const pctAvg = sum.tasks.reduce((a, t) => a + (isDone(t.state) ? 1 : t.pct || 0), 0) / sum.tasks.length;
      return { s, idx, sum, tasks, pctAvg };
    });
  }

  /* ---------- ส่วนภาพรวม ---------- */
  function overviewHtml(rows, term) {
    const total = rows.length * TASK_KEYS.length;
    let done = 0;
    rows.forEach(r => TASK_KEYS.forEach(k => { if (isDone(r.tasks[k].state)) done++; }));
    const none = total - done;
    const pct = total ? Math.round(done / total * 100) : 0;
    const w = n => total ? (n / total * 100).toFixed(2) : 0;
    const acc = (window.Term && Term.formAccess) ? Term.formAccess() : { form1: true, form2: true };
    const sdqOpen = !(window.SDQ && SDQ.isOpen) || SDQ.isOpen();
    const pill = (name, open) => `<span class="ft2-access ${open ? 'on' : 'off'}">${open ? 'เปิดรับ' : 'ปิดรับ'}: ${name}</span>`;
    const cntStudents = { todo: 0, doing: 0, done: 0 };
    rows.forEach(r => cntStudents[r.sum.group]++);

    return `<section class="ft2-overview">
      <div class="ft2-ov-top">
        <div>
          <h2 class="ft2-title">ติดตามการกรอกแบบฟอร์ม</h2>
          <p class="ft2-term">${E(Term.label(term))}</p>
          <div class="ft2-access-row">${pill('ฟอร์ม 1', acc.form1)}${pill('ฟอร์ม 2', acc.form2)}${pill('SDQ', sdqOpen)}</div>
        </div>
        ${isStaff() ? `<button type="button" class="ft2-btn" data-ft2="csv">ส่งออก CSV</button>` : ''}
      </div>
      <div class="ft2-ov-main">
        <div class="ft2-big"><span class="ft2-big-num">${pct}%</span>
          <span class="ft2-big-lbl">ส่งแล้ว ${done} จาก ${total} งาน<br><small>นักเรียน ${rows.length} คน × 3 งาน</small></span></div>
        <div class="ft2-stack-wrap">
          <div class="ft2-stack" role="img" aria-label="ส่งแล้ว ${done} ยังไม่ส่ง ${none}">
            <span class="seg done" style="width:${w(done)}%"></span><span class="seg none" style="width:${w(none)}%"></span>
          </div>
          <div class="ft2-legend">
            <span><i class="dot done"></i>ส่งแล้ว ${done}</span>
            <span><i class="dot none"></i>ยังไม่ส่ง ${none}</span>
            <span class="ft2-legend-note">นับว่าส่งแล้วเมื่อกด "บันทึกและส่งข้อมูล"</span>
          </div>
        </div>
      </div>
      <div class="ft2-people">
        ${chip('all', 'นักเรียนทั้งหมด', rows.length)}
        ${chip('todo', 'ยังไม่ส่งสักงาน', cntStudents.todo)}
        ${chip('doing', 'ส่งแล้วบางงาน', cntStudents.doing)}
        ${chip('done', 'ส่งครบทั้ง 3 งาน', cntStudents.done)}
      </div>
    </section>`;
  }
  function chip(key, text, n) {
    const on = st.group === key && !st.task;
    return `<button type="button" class="ft2-chip ft2-chip-${key} ${on ? 'on' : ''}" data-ft2-group="${key}" aria-pressed="${on}">${text} <b>${n}</b></button>`;
  }

  function taskCardsHtml(rows) {
    return `<section class="ft2-tasks">${TASK_KEYS.map(k => {
      let d = 0;
      rows.forEach(r => { if (isDone(r.tasks[k].state)) d++; });
      const n = rows.length, left = n - d, none = n - d;
      const w = x => n ? (x / n * 100).toFixed(2) : 0;
      const on = st.task === k;
      return `<article class="ft2-task ${on ? 'on' : ''}">
        <header><h3>${TASK_NAME[k]}</h3><span>${TASK_HINT[k]}</span></header>
        <div class="ft2-task-num"><b>${d}</b> / ${n} คน ส่งแล้ว</div>
        <div class="ft2-stack sm"><span class="seg done" style="width:${w(d)}%"></span><span class="seg none" style="width:${w(none)}%"></span></div>
        <div class="ft2-task-foot">
          <span>ยังไม่ส่ง ${none} คน</span>
          ${left ? `<button type="button" class="ft2-link" data-ft2-task="${k}">${on ? 'แสดงทุกคน' : `ดูคนที่ยังไม่ส่ง ${left} คน`}</button>` : `<span class="ft2-allok">ครบทุกคน</span>`}
        </div>
      </article>`;
    }).join('')}</section>`;
  }

  /* ---------- ตาราง ---------- */
  function cellHtml(r, k, term) {
    const t = r.tasks[k];
    let label, detail = '';
    if (t.state === 'submitted') {
      label = '✓ ส่งแล้ว';
      const d = t.at || submittedAt(r.s, k, term);
      detail = d ? 'ล่าสุด ' + thDateTime(d) : '';
    }
    else if (t.state === 'locked') { label = 'ปิดรับ'; }
    else { label = 'ยังไม่ส่ง'; }
    if (k === 'form2') { const a = attachInfo(r.s, term); if (a.need) detail = (detail ? detail + ' · ' : '') + (a.ok === a.need ? '📎 เอกสารครบ' : `📎 เอกสาร ${a.ok}/${a.need}`); }
    const canOpen = t.state !== 'locked';
    const tip = !canOpen ? '' : (k !== 'sdq' && t.state === 'submitted') ? 'ดูตัวอย่างแบบฟอร์มที่ส่ง' : 'เปิดงานนี้';
    return `<td class="ft2-cell" data-label="${TASK_NAME[k]}">
      <button type="button" class="ft2-state s-${t.state}" ${canOpen ? '' : 'disabled'} data-ft2-cell="${k}" data-idx="${r.idx}" title="${E(tip)}">
        <span class="ft2-state-lbl">${E(label)}</span>
        ${detail ? `<span class="ft2-state-detail">${E(detail)}</span>` : ''}
      </button></td>`;
  }
  function rowHtml(r, term) {
    const photo = (typeof photoEl === 'function') ? photoEl(r.s) : '';
    const dots = TASK_KEYS.map(k => `<i class="${isDone(r.tasks[k].state) ? 'ok' : ''}"></i>`).join('');
    const next = r.sum.next;
    const btn = next
      ? `<button type="button" class="ft2-btn ft2-btn-primary" data-ft2-open="${next.key}" data-idx="${r.idx}">ไปที่ ${next.key === 'sdq' ? 'SDQ' : 'ฟอร์ม ' + next.key.slice(-1)}</button>`
      : (r.sum.group === 'done'
          ? `<button type="button" class="ft2-btn" data-ft2-open="form1" data-idx="${r.idx}">เปิดดู</button>`
          : `<span class="ft2-wait">รอเปิดรับ</span>`);
    return `<tr class="ft2-row g-${r.sum.group}">
      <td class="ft2-no" data-label="ลำดับ">${E(r.s.no ?? r.idx + 1)}</td>
      <td class="ft2-who" data-label="นักเรียน"><div class="ft2-who-in">${photo}
        <div><div class="ft2-name">${E(r.s.name || '(ไม่ระบุชื่อ)')}</div><div class="ft2-school">${E(r.s.school_m1 || '-')}</div></div></div></td>
      ${TASK_KEYS.map(k => cellHtml(r, k, term)).join('')}
      <td class="ft2-sum" data-label="รวม"><div class="ft2-dots" aria-label="ส่งแล้ว ${r.sum.doneCount} จาก 3 งาน">${dots}</div><span>${r.sum.doneCount}/3</span></td>
      <td class="ft2-act">${btn}</td>
    </tr>`;
  }

  function filterSort(rows) {
    const q = st.q.trim().toLowerCase();
    let list = rows.filter(r =>
      (st.task ? !isDone(r.tasks[st.task].state) : (st.group === 'all' || r.sum.group === st.group))
      && (!q || (r.s.name || '').toLowerCase().includes(q) || (r.s.school_m1 || '').toLowerCase().includes(q)
          || (r.s.province || '').toLowerCase().includes(q) || String(r.s.no ?? '') === q));
    const byNo = (a, b) => (a.s.no || a.idx) - (b.s.no || b.idx);
    if (st.sort === 'behind') list.sort((a, b) => (a.sum.doneCount - b.sum.doneCount) || byNo(a, b));
    else if (st.sort === 'school') list.sort((a, b) => String(a.s.school_m1 || '').localeCompare(String(b.s.school_m1 || ''), 'th') || byNo(a, b));
    else list.sort(byNo);
    return list;
  }

  function tableHtml(rows, term) {
    const list = filterSort(rows);
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (st.page > pages) st.page = 1;
    const slice = list.slice((st.page - 1) * PER_PAGE, st.page * PER_PAGE);
    const filterNote = st.task
      ? `<div class="ft2-filter-note">แสดงเฉพาะคนที่ยังไม่ส่ง<b>${TASK_NAME[st.task]}</b> <button type="button" class="ft2-link" data-ft2-task="${st.task}">ล้างตัวกรอง</button></div>` : '';
    const tools = rows.length > 1 ? `<div class="ft2-tools">
        <input type="search" class="ft2-search" data-ft2="q" placeholder="ค้นหาชื่อนักเรียน โรงเรียน จังหวัด หรือลำดับ" value="${E(st.q)}">
        <label class="ft2-sort">เรียงตาม
          <select data-ft2="sort">
            <option value="no" ${st.sort === 'no' ? 'selected' : ''}>ลำดับ</option>
            <option value="behind" ${st.sort === 'behind' ? 'selected' : ''}>ยังไม่ส่งมากสุดก่อน</option>
            <option value="school" ${st.sort === 'school' ? 'selected' : ''}>ชื่อโรงเรียน</option>
          </select></label>
      </div>` : '';
    let pag = '';
    if (pages > 1) {
      const b = (p, t, dis, on) => `<button type="button" class="page-btn ${on ? 'active' : ''}" data-ft2-page="${p}" ${dis ? 'disabled' : ''}>${t}</button>`;
      pag += b(st.page - 1, '←', st.page === 1);
      for (let p = 1; p <= pages; p++) {
        if (p === 1 || p === pages || Math.abs(p - st.page) <= 1) pag += b(p, p, false, p === st.page);
        else if (Math.abs(p - st.page) === 2) pag += '<span class="ft2-ellipsis">…</span>';
      }
      pag += b(st.page + 1, '→', st.page === pages);
    }
    return `<section class="ft2-list">
      ${tools}${filterNote}
      <div class="ft2-table-wrap"><table class="ft2-table">
        <thead><tr><th>ลำดับ</th><th>นักเรียน</th><th>แบบฟอร์มที่ 1</th><th>แบบฟอร์มที่ 2</th><th>SDQ</th><th>รวม</th><th></th></tr></thead>
        <tbody>${slice.map(r => rowHtml(r, term)).join('')
          || `<tr><td colspan="7" class="ft2-empty">${rows.length ? 'ไม่พบนักเรียนตามเงื่อนไขนี้ ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา' : 'ยังไม่มีรายชื่อนักเรียนในระบบ'}</td></tr>`}</tbody>
      </table></div>
      <div class="ft2-foot"><span>${list.length ? `แสดง ${(st.page - 1) * PER_PAGE + 1}–${Math.min(st.page * PER_PAGE, list.length)} จาก ${list.length} คน` : ''}</span>
        <span class="ft2-key">กดช่อง "ส่งแล้ว" เพื่อดูตัวอย่าง · กดช่อง "ยังไม่ส่ง" เพื่อเปิดงาน</span></div>
      <div class="pagination">${pag}</div>
    </section>`;
  }

  /* ---------- เปิดงาน / ส่งออก ---------- */
  function openTask(idx, key) {
    if (key === 'sdq') { if (window.SDQ && SDQ.openFor) SDQ.openFor(idx, activeTerm()); return; }
    sfState.studentIdx = idx; sfState.formKey = key; sfState.sectionIndex = 0; sfState.lastDir = 'jump';
    showPage('scholarform', document.querySelector('.nav-btn[onclick*="scholarform"]'));
  }
  function exportCsv() {
    const term = activeTerm();
    const safe = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const txt = t => t.state === 'submitted' ? 'ส่งแล้ว' : t.state === 'locked' ? 'ปิดรับ' : 'ยังไม่ส่ง';
    const when = t => t.at ? thDateTime(t.at) : '';
    const head = ['ลำดับ', 'ชื่อ-สกุล', 'โรงเรียน', 'จังหวัด', 'ฟอร์ม 1', 'ฟอร์ม 1 ส่งล่าสุด', 'ฟอร์ม 2', 'ฟอร์ม 2 ส่งล่าสุด', 'SDQ', 'SDQ ส่งล่าสุด', 'ส่งแล้ว (จาก 3)', 'เอกสารแนบที่ยังขาด'];
    const lines = [head.map(safe).join(',')];
    rowsFor(term).sort((a, b) => (a.s.no || 0) - (b.s.no || 0)).forEach(r => {
      const f1 = r.tasks.form1, f2 = r.tasks.form2, sd = r.tasks.sdq;
      lines.push([r.s.no, r.s.name, r.s.school_m1, r.s.province,
        txt(f1), when(f1), txt(f2), when(f2), txt(sd), when(sd), r.sum.doneCount, attachInfo(r.s, term).missing.join(' / ') || 'ครบ'].map(safe).join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ติดตามแบบฟอร์ม_' + term.replace('/', '-') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- วาดหน้า ---------- */
  function render() {
    const page = document.getElementById('page-formtrack');
    if (!page || !window.Worklist || !window.Term) return;
    const term = activeTerm();
    const rows = rowsFor(term);
    // คงตำแหน่งเคอร์เซอร์ในช่องค้นหาระหว่างพิมพ์
    const a = document.activeElement;
    const keepSearch = a && a.getAttribute && a.getAttribute('data-ft2') === 'q' ? a.selectionStart : null;
    page.innerHTML = `<div class="ft2">
      ${overviewHtml(rows, term)}
      ${rows.length > 1 ? taskCardsHtml(rows) : ''}
      ${tableHtml(rows, term)}
    </div>`;
    if (keepSearch !== null) {
      const inp = page.querySelector('[data-ft2="q"]');
      if (inp) { inp.focus(); inp.setSelectionRange(keepSearch, keepSearch); }
    }
    bind(page);
  }

  function bind(page) {
    if (page.dataset.ft2Bound) return;
    page.dataset.ft2Bound = '1';
    page.addEventListener('click', e => {
      const g = e.target.closest('[data-ft2-group]');
      if (g) { st.group = g.getAttribute('data-ft2-group'); st.task = null; st.page = 1; render(); return; }
      const t = e.target.closest('[data-ft2-task]');
      if (t) { const k = t.getAttribute('data-ft2-task'); st.task = st.task === k ? null : k; st.group = 'all'; st.page = 1; render(); return; }
      const p = e.target.closest('[data-ft2-page]');
      if (p && !p.disabled) { st.page = +p.getAttribute('data-ft2-page'); render(); page.scrollIntoView({ block: 'start' }); return; }
      const c = e.target.closest('[data-ft2-cell]');
      if (c && !c.disabled) {
        const k = c.getAttribute('data-ft2-cell'), idx = +c.getAttribute('data-idx');
        const state = rowsFor(activeTerm())[idx].tasks[k].state;
        if (k !== 'sdq' && state === 'submitted' && typeof ftOpenPreview === 'function') ftOpenPreview(idx, k);
        else openTask(idx, k);
        return;
      }
      const o = e.target.closest('[data-ft2-open]');
      if (o) { openTask(+o.getAttribute('data-idx'), o.getAttribute('data-ft2-open')); return; }
      if (e.target.closest('[data-ft2="csv"]')) exportCsv();
    });
    page.addEventListener('input', e => {
      if (e.target.getAttribute('data-ft2') === 'q') { st.q = e.target.value; st.page = 1; render(); }
    });
    page.addEventListener('change', e => {
      if (e.target.getAttribute('data-ft2') === 'sort') { st.sort = e.target.value; st.page = 1; render(); }
    });
  }

  window.renderFormTrack = render;
  console.log('📋 หน้าติดตามการกรอกแบบฟอร์ม v2 พร้อมใช้งาน');
})();
