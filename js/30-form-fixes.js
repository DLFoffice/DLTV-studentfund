/* ============================================================
   30-form-fixes.js — แก้ปัญหาหน้าแบบฟอร์มทุน (โหลดท้ายสุด)
   ------------------------------------------------------------
   F1  หน้าฟอร์ม "รีเฟรชเอง" ระหว่างพิมพ์ (เช่น ช่องครูที่ปรึกษา/โทรศัพท์/ตำแหน่ง)
       สาเหตุ: พิมพ์ในช่องที่เชื่อมกับทะเบียน → บันทึก → 26-data-links กระทบยอด
       ฟอร์มอีกใบ (ฟอร์ม 1) แล้วสั่ง Term.rerender() → sfRenderPage() วาดหน้าใหม่ทั้งหน้า
       → เคอร์เซอร์หลุด ตัวอักษรที่พิมพ์ต่อหาย
       แก้: ถ้าผู้ใช้กำลังพิมพ์อยู่ในช่องของฟอร์ม การวาดใหม่ที่ "ระบบสั่งเอง" จะถูกเลื่อน
       ไปทำตอนผู้ใช้ออกจากช่อง (การวาดใหม่ที่ผู้ใช้กดเอง เช่น ถัดไป/ย้อนกลับ ทำทันทีเหมือนเดิม)
   F2  กด "บันทึกข้อมูล" แล้วกลับไปหน้าแรกของแบบฟอร์ม (รายการงานของครู) อัตโนมัติ
   F3  ตารางผลการเรียน: ใช้ข้อมูลชุดเดียวกับหน้า "ผลการเรียน" (semGpa)
       • คอลัมน์ ม.1, ม.2, … ผูกกับภาคเรียน 1/2568, 2/2568, 1/2569, … ตามระดับชั้น
       • ค่าในหน้า "ผลการเรียน" แสดงในฟอร์มเสมอ (เดิมถ้าสองที่ไม่ตรงกัน ฟอร์มแสดงค่าเก่าค้าง)
       • ครูแก้ในฟอร์ม → หน้า "ผลการเรียน" อัปเดตทันที ทุกคอลัมน์ (เดิมอัปเดตแค่คอลัมน์ภาคปัจจุบัน)
       • คะแนนเฉลี่ยสะสม = เฉลี่ยทุกภาคเรียนที่มีข้อมูลจนถึงชั้นนั้น และเว้นว่างในชั้นที่ยังไม่มีข้อมูล
   F4  หัวข้อแต่ละส่วนของฟอร์มอ่านง่ายขึ้น: หัวส่วนบอก "ส่วนที่ x จาก y" + ความคืบหน้า,
       หัวข้อย่อยจัดเป็นกลุ่มพร้อมกรอบ, ชื่อขั้นในแถบขั้นตอนไม่ตัดคำเป็นแนวตั้ง
   ============================================================ */
(function () {
  'use strict';

  const esc = v => (typeof sfEscapeHtml === 'function') ? sfEscapeHtml(v) : String(v ?? '');
  const isStaff = () => !window.STUDENT_MODE;
  const activeTerm = () => { try { return (window.Term && Term.active) ? Term.active() : ''; } catch (e) { return ''; } };
  const mainEl = () => document.querySelector('.main');

  /* ══════════ F1) ไม่วาดหน้าใหม่ระหว่างที่ผู้ใช้กำลังพิมพ์ ══════════ */
  const TEXT_FIELD = 'input:not([type=radio]):not([type=checkbox]):not([type=button]):not([type=submit]):not([type=reset]), textarea, select';
  function isTypingInForm() {
    const a = document.activeElement;
    return !!(a && a.matches && a.matches(TEXT_FIELD) && a.closest('#sf-root .sf-editor'));
  }

  let userAction = false;      // true ชั่วขณะที่ผู้ใช้คลิก/เลือกเอง
  let pointerDown = false;
  let pending = false;          // มีการวาดใหม่ที่ถูกเลื่อนไว้

  ['click', 'change'].forEach(type => document.addEventListener(type, e => {
    if (!e.target || !e.target.closest || !e.target.closest('#sf-root')) return;
    userAction = true;
    setTimeout(() => { userAction = false; }, 0);
  }, true));
  document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  document.addEventListener('pointerup', () => {
    pointerDown = false;
    setTimeout(flushPending, 60);            // หลัง click ของปุ่มทำงานเสร็จแล้ว
  }, true);
  document.addEventListener('focusout', e => {
    if (!pending || !e.target.closest || !e.target.closest('#sf-root')) return;
    setTimeout(flushPending, 60);
  }, true);

  const _prevRender = window.sfRenderPage;
  function renderNow() {
    pending = false;
    return _prevRender.apply(this, arguments);
  }
  function flushPending() {
    if (!pending || pointerDown || isTypingInForm()) return;
    const m = mainEl(); const top = m ? m.scrollTop : 0;
    renderNow();
    if (m) m.scrollTop = top;                 // วาดใหม่เบื้องหลัง → คงตำแหน่งเลื่อนเดิม
  }
  if (typeof _prevRender === 'function') {
    window.sfRenderPage = function () {
      if (!userAction && isTypingInForm()) { pending = true; return; }
      return renderNow.apply(this, arguments);
    };
  }

  /* ══════════ F2) บันทึกและส่งข้อมูล → กลับไปหน้าแรกของแบบฟอร์ม (v34: เขียนใหม่ทั้งขั้นตอน) ══════════
     ปัญหาเดิม: ขั้นตอนบันทึกรอ Google Sheet (Apps Script ช้า/ค้างได้หลายสิบวินาที) ก่อนจะกลับหน้าแรก
     ระหว่างรอไม่มีอะไรบอกผู้ใช้ (ข้อความ "กำลังส่ง" อยู่บนปุ่มที่ถูกวาดทับไปแล้ว) และถ้าเกิดข้อผิดพลาด
     ระหว่างทาง ระบบเงียบหาย → ผู้ใช้เห็นว่า "กดแล้วไม่บันทึก ไม่กลับหน้าแรก"
     ใหม่:
       1) กดปุ่ม → ขึ้นกล่อง "กำลังบันทึก…" กลางจอทันที
       2) ตั้งสถานะ "ส่งแล้ว" + วันเวลา แล้วบันทึกลงเครื่องและคลาวด์ (รอผลจริง สูงสุด 15 วินาที)
       3) กลับหน้ารายการงาน + กล่องยืนยันว่าบันทึกแล้ว (หรือบอกสาเหตุชัดเจนถ้าไม่สำเร็จ)
       4) ส่งสำเนาไป Google Sheet เบื้องหลัง ไม่ทำให้หน้าจอค้าง */
  const withTimeout = (p, ms) => Promise.race([p, new Promise(res => setTimeout(() => res({ timeout: true }), ms))]);

  function savingOverlay(text) {
    const w = document.createElement('div');
    w.className = 'uid-backdrop in';
    w.innerHTML = `<div class="uid uid-info" role="status" aria-live="polite">
      <div class="uid-icon"><span class="uid-spin uid-spin-lg" aria-hidden="true"></span></div>
      <h2 class="uid-title">${esc(text)}</h2>
      <div class="uid-msg"><p>กรุณารอสักครู่ อย่าเพิ่งปิดหน้านี้</p></div></div>`;
    document.body.appendChild(w);
    return () => w.remove();
  }
  function tell(o) {
    if (window.UIDialog) return UIDialog.alert(o);
    if (typeof showStatus === 'function') showStatus(o.title + ' ' + (o.message || ''), o.tone === 'success' ? 'success' : 'error');
  }

  function sheetPayload(student, fk) {
    try {
      if (typeof SCRIPT_URL === 'undefined' || !SCRIPT_URL || typeof gasPost !== 'function') return null;
      const fields = sfFlattenFormForSheet(fk, student);
      const hide = typeof SHEET_SEND_SENSITIVE !== 'undefined' && !SHEET_SEND_SENSITIVE;
      if (hide && typeof isSensitiveLabel === 'function') fields.forEach(r => { if (isSensitiveLabel(r.label)) r.value = maskTail(r.value); });
      return {
        action: 'saveScholarshipForm', formType: fk,
        formLabel: fk === 'form1' ? 'แบบฟอร์มที่ 1 - ข้อมูลรายบุคคล' : 'แบบฟอร์มที่ 2 - ผลการเรียน ความประพฤติ การใช้จ่าย',
        studentId: hide && typeof maskTail === 'function' ? maskTail(student.id) : (student.id || ''),
        studentNo: student.no || '', studentName: student.name || '', school: student.school_m1 || '',
        province: student.province || '', updatedAt: new Date().toISOString(), fields
      };
    } catch (e) { console.warn('เตรียมข้อมูลส่ง Google Sheet ไม่สำเร็จ:', e); return null; }
  }
  function sendSheetInBackground(payload, label) {
    if (!payload) return;
    withTimeout(gasPost(payload).then(() => 'ok'), 90000)
      .then(r => {
        if (r && r.timeout) console.warn('Google Sheet ตอบช้าเกิน 90 วินาที:', label);
        else console.log('📄 ส่งสำเนาไป Google Sheet แล้ว:', label);
      })
      .catch(e => console.warn('ส่งสำเนาไป Google Sheet ไม่สำเร็จ (ข้อมูลในระบบบันทึกแล้ว):', label, e && e.message));
  }

  let saving = false;
  window.sfSendToSheet = async function () {
    if (saving) return;
    const student = (typeof sfGetStudent === 'function') ? sfGetStudent() : null;
    if (!student) return;
    const fk = sfState.formKey;
    const formName = fk === 'form1' ? 'แบบฟอร์มที่ 1' : 'แบบฟอร์มที่ 2';
    if (!isStaff() && window.Term && Term.isFormOpen && !Term.isFormOpen(fk)) {
      tell({ tone: 'warning', title: 'แบบฟอร์มนี้ปิดรับการกรอกแล้ว', message: 'ติดต่อผู้ดูแลระบบหากต้องการแก้ไข' });
      return;
    }
    saving = true;
    // ค่าที่กำลังพิมพ์อยู่ถูกเก็บแล้วทุกตัวอักษร (input event) — ปล่อยโฟกัสเพื่อให้ช่องวันที่ ฯลฯ ยืนยันค่า
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
    const close = savingOverlay('กำลังบันทึกและส่ง' + formName + '…');
    let at = '', cloudNote = '', payload = null;
    try {
      const b = (window.Term && Term.bucket) ? Term.bucket(student, activeTerm()) : student;
      const store = (b && b[fk]) || (student[fk] = student[fk] || {});
      store.__touched = true;
      try { store.__complete = sfIsFormComplete(fk); } catch (e) {}
      at = (window.Term && Term.markSubmitted) ? Term.markSubmitted(student, fk) : new Date().toISOString();
      payload = sheetPayload(student, fk);                 // เตรียมก่อนออกจากหน้า (อ่านค่าจากนักเรียนที่เปิดอยู่)
      let r;
      if (typeof window.fbSaveNow === 'function') r = await withTimeout(window.fbSaveNow(), 15000);
      else { await saveToStorage(); r = { ok: true, cloud: false }; }
      if (r && r.timeout) cloudNote = 'บันทึกไว้ในเครื่องแล้ว กำลังรอส่งขึ้นคลาวด์ (อินเทอร์เน็ตช้า) ระบบจะส่งให้อัตโนมัติ';
      else if (r && r.ok === false) throw (r.error || new Error('บันทึกขึ้นคลาวด์ไม่สำเร็จ'));
    } catch (e) {
      close(); saving = false;
      console.error('บันทึกแบบฟอร์มไม่สำเร็จ:', e);
      const perm = e && e.code === 'permission-denied';
      tell({ tone: 'danger', title: 'บันทึกไม่สำเร็จ',
        message: (perm ? 'บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลนี้' : 'ข้อมูลยังอยู่ในหน้าฟอร์ม ตรวจสอบอินเทอร์เน็ตแล้วกด "บันทึกและส่งข้อมูล" อีกครั้ง')
          + '\n\nรายละเอียด: ' + ((e && (e.code || e.message)) || e) });
      return;
    }
    close();
    // กลับหน้าแรกของเมนูแบบฟอร์ม (รายการงาน)
    sfState.studentIdx = null; sfState.sectionIndex = 0; sfState.lastDir = 'jump';
    try { renderNow(); } catch (e) { console.error(e); }
    try { if (typeof renderFormTrack === 'function') renderFormTrack(); } catch (e) {}
    const m = mainEl(); if (m) m.scrollTo({ top: 0, behavior: 'smooth' });
    saving = false;
    tell({
      tone: cloudNote ? 'warning' : 'success',
      title: cloudNote ? 'บันทึกแล้ว (รอซิงก์ขึ้นคลาวด์)' : 'บันทึกและส่งข้อมูลแล้ว',
      message: cloudNote || 'สถานะของแบบฟอร์มนี้เป็น "ส่งแล้ว" หากแก้ไขภายหลัง กดบันทึกอีกครั้งเพื่ออัปเดต',
      details: [
        { label: 'นักเรียน', value: student.name || '-' },
        { label: 'แบบฟอร์ม', value: formName },
        { label: 'ส่งเมื่อ', value: (window.Term && Term.sentLabel ? Term.sentLabel(at) : at).replace(/^ส่งแล้ว\s*/, '') }
      ]
    });
    sendSheetInBackground(payload, (student.name || '') + ' · ' + formName);
  };

  /* ══════════ F3) ตารางผลการเรียน ↔ หน้า "ผลการเรียน" (semGpa) ══════════ */
  const AVG_ROW = { form1: 'avg', form2: 'avg2' };
  const baseYear = () => (typeof GRADE_BASE_YEAR !== 'undefined') ? GRADE_BASE_YEAR : 2568;
  const yearOfLevel = lv => (typeof gradeYear === 'function') ? gradeYear(lv) : baseYear() + lv - 1;
  const nameOfLevel = lv => (typeof gradeName === 'function') ? gradeName(lv) : 'ม.' + lv;
  const levelOfTerm = t => (typeof gradeLevelOf === 'function') ? gradeLevelOf(t) : 1;

  function num(v) {
    if (v == null) return NaN;
    const s = String(v).replace(/,/g, '.').trim();
    if (s === '') return NaN;
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  const validGpa = n => isFinite(n) && n > 0 && n <= 4;
  const fmt2 = n => (Math.round(n * 100) / 100).toFixed(2);

  /** ระดับชั้นของคอลัมน์ (จากหัวคอลัมน์ ถ้าไม่ได้ระบุใช้ลำดับคอลัมน์: คอลัมน์แรก = ม.1) */
  function levelOfCol(col, i) {
    const lab = String((col && col.label) || '').replace(/\s+/g, '');
    let m = lab.match(/(?:ม\.?|มัธยมศึกษาปีที่)(\d+)/);
    if (m) return +m[1];
    m = lab.match(/อุดมศึกษา(?:ปี)?(\d+)/);
    if (m) return 6 + (+m[1]);
    m = lab.match(/(25\d\d)/);
    if (m) return Math.max(1, +m[1] - baseYear() + 1);
    return i + 1;
  }
  const termOf = (row, level) => (row === 'term1' ? '1/' : '2/') + yearOfLevel(level);

  function gpaEntry(s, term) { return (s.semGpa || []).find(g => g && g.term === term) || null; }

  function afterSemGpaChange(s) {
    try { s.semGpa.sort((a, b) => (window.Term && Term.cmp) ? Term.cmp(a.term, b.term) : 0); } catch (e) {}
    try {
      const latest = (typeof getLatestGpa === 'function') ? getLatestGpa(s) : null;
      if (latest && latest.term) s.gpa = Object.assign({}, latest);
    } catch (e) {}
  }
  function writeGpa(s, term, rawValue) {
    if (!Array.isArray(s.semGpa)) s.semGpa = [];
    const n = num(rawValue);
    const ex = gpaEntry(s, term);
    if (validGpa(n)) {
      const g = Math.round(n * 100) / 100;
      if (!ex) {
        s.semGpa.push({ term, gpa: g, riskLevel: '', hasObstacle: false, obstacleType: '',
          weakSubjects: '', schoolSupport: '', source: 'form' });
      } else if (Number(ex.gpa) !== g) { ex.gpa = g; ex.source = 'form'; }
      else return false;
      afterSemGpaChange(s);
      return true;
    }
    if (String(rawValue ?? '').trim() === '' && ex && Number(ex.gpa) > 0) {
      ex.gpa = 0; afterSemGpaChange(s); return true;   // ครูลบค่าในฟอร์ม = ลบ GPA ภาคนั้น
    }
    return false;
  }

  /** ช่องที่ผู้ใช้กำลังพิมพ์อยู่ (ห้ามเขียนทับ) */
  function focusedCell() {
    const a = document.activeElement;
    if (!a || !a.hasAttribute || !a.hasAttribute('data-sf-mrow')) return null;
    return { row: a.getAttribute('data-sf-mrow'), col: a.getAttribute('data-sf-mcol') };
  }

  /** เติม/ปรับตารางให้ตรงกับหน้า "ผลการเรียน" + ดันค่าที่มีแค่ในฟอร์มขึ้นไป (เฉพาะครู) */
  function syncGrades(s, m) {
    if (!s || !m || !Array.isArray(m.cols)) return;
    if (!m.values) m.values = {};
    // ให้มีคอลัมน์ครบถึงชั้นปัจจุบัน (ม.1 … ชั้นของภาคเรียนที่เปิดใช้งาน)
    const curLv = Math.min(12, levelOfTerm(activeTerm() || ('1/' + baseYear())));
    const hasLabels = m.cols.some(c => String(c.label || '').trim());
    if (!hasLabels) {
      while (m.cols.length < curLv) m.cols.push({ _id: (typeof sfUid === 'function') ? sfUid() : 'c' + Date.now() + m.cols.length, label: '' });
      m.cols.forEach((c, i) => { c.label = nameOfLevel(i + 1); });
    }
    // คอลัมน์ที่ยังไม่มีชื่อ → ตั้งชื่อต่อจากคอลัมน์ก่อนหน้า (ม.1 → ม.2 → …)
    let prevLv = 0;
    m.cols.forEach((c, i) => {
      if (!String(c.label || '').trim()) c.label = nameOfLevel(prevLv + 1);
      prevLv = levelOfCol(c, i);
    });
    const f = focusedCell();
    let changedGpa = false;
    m.cols.forEach((c, i) => {
      const lv = levelOfCol(c, i);
      ['term1', 'term2'].forEach(row => {
        if (!m.values[row]) m.values[row] = {};
        if (f && f.row === row && f.col === c._id) return;
        const term = termOf(row, lv);
        const ex = gpaEntry(s, term);
        const cell = m.values[row][c._id];
        const cellN = num(cell);
        if (ex && Number(ex.gpa) > 0) {
          const g = Number(ex.gpa);
          // ครู: ข้อมูลหน้า "ผลการเรียน" คือค่าจริง · นักเรียน: เติมให้เฉพาะช่องที่ยังว่าง
          if (!isFinite(cellN) || (isStaff() && Math.abs(cellN - g) > 0.0001)) m.values[row][c._id] = fmt2(g);
        } else if (isStaff() && validGpa(cellN)) {
          changedGpa = writeGpa(s, term, cell) || changedGpa;   // มีในฟอร์มแต่หน้า "ผลการเรียน" ยังไม่มี
        }
      });
    });
    return changedGpa;
  }

  /** คะแนนเฉลี่ย 2 ภาคเรียน + คะแนนเฉลี่ยสะสม (เฉลี่ยทุกภาคเรียนที่มีข้อมูลจนถึงชั้นนั้น) */
  function computeGrades(m, avgRow) {
    if (!m || !Array.isArray(m.cols)) return;
    if (!m.values) m.values = {};
    const t1 = m.values.term1 || {}, t2 = m.values.term2 || {};
    const avg = m.values[avgRow] = m.values[avgRow] || {};
    const cum = m.values.cumavg = m.values.cumavg || {};
    const all = [];
    m.cols.forEach(c => {
      const parts = [num(t1[c._id]), num(t2[c._id])].filter(validGpa);
      avg[c._id] = parts.length ? fmt2(parts.reduce((a, b) => a + b, 0) / parts.length) : '';
      all.push(...parts);
      cum[c._id] = (parts.length && all.length) ? fmt2(all.reduce((a, b) => a + b, 0) / all.length) : '';
    });
  }

  function prepareGrades(formKey) {
    const s = (typeof sfGetStudent === 'function') ? sfGetStudent() : null;
    const store = s && s[formKey];
    const m = store && store.grades_matrix;
    if (!m || typeof m !== 'object') return;
    const changed = syncGrades(s, m);
    computeGrades(m, AVG_ROW[formKey] || 'avg2');
    if (changed) { try { saveToStorage(); } catch (e) {} }
  }

  // แทนที่การวาดตารางผลการเรียน (ตารางอื่นใช้ของเดิม)
  const _prevMatrix = window.sfRenderMatrix;
  window.sfRenderMatrix = function (formKey, field) {
    if (!field || field.id !== 'grades_matrix') return _prevMatrix ? _prevMatrix.apply(this, arguments) : '';
    const m = sfGetValue(formKey, field.id, field);
    prepareGrades(formKey);
    const avgRow = AVG_ROW[formKey] || 'avg2';
    const computed = { [avgRow]: 1, cumavg: 1 };
    const cols = m.cols || [];
    const thead = `<th class="sf-th-rowlabel">ภาคเรียน</th>`
      + cols.map(c => `<th><input class="sf-input sf-col-head" type="text" data-sf-matrix="${field.id}" data-sf-colhead="${c._id}" value="${esc(c.label)}" placeholder="ระดับชั้น/ปี"></th>`).join('')
      + `<th class="sf-th-x"></th>`;
    const trs = field.rows.map(r => {
      const isComp = !!computed[r.id];
      const tds = cols.map((c, i) => {
        const v = (m.values[r.id] && m.values[r.id][c._id]) || '';
        if (isComp) {
          return `<td><input class="sf-input sf-cell-input sf-computed" type="text" readonly tabindex="-1"
            data-sf-cmatrix="${field.id}" data-sf-crow="${r.id}" data-sf-ccol="${c._id}" value="${esc(v)}"></td>`;
        }
        const term = termOf(r.id, levelOfCol(c, i));
        const bad = v !== '' && !validGpa(num(v));
        return `<td><input class="sf-input sf-cell-input${bad ? ' sf-invalid' : ''}" type="text" inputmode="decimal"
          data-sf-matrix="${field.id}" data-sf-mrow="${r.id}" data-sf-mcol="${c._id}" value="${esc(v)}"
          placeholder="—" title="ภาคเรียน ${term}"></td>`;
      }).join('');
      const tag = isComp ? ' <span class="sf-auto-tag">คิดให้อัตโนมัติ</span>' : '';
      return `<tr class="${isComp ? 'sf-row-computed' : ''}"><td class="sf-td-rowlabel">${esc(r.label)}${tag}</td>${tds}<td></td></tr>`;
    }).join('');
    return `<div class="sf-table-wrap" id="sf-matrix-${field.id}">
      <table class="sf-data-table"><thead><tr>${thead}</tr></thead><tbody>${trs}</tbody></table>
      <div class="sf-matrix-foot">
        <button type="button" class="sf-btn-add" data-sf-action="add-col" data-sf-matrix="${field.id}">+ เพิ่มคอลัมน์ระดับชั้น/ปี</button>
        <span class="sf-matrix-hint">ใช้ข้อมูลเดียวกับเมนู "ผลการเรียน" — แก้ที่นี่หรือที่เมนูนั้น อีกที่จะเปลี่ยนตาม · กรอกเกรดเฉลี่ย 0.01–4.00</span>
      </div></div>`;
  };

  // ครูพิมพ์เกรดในตาราง → อัปเดตหน้า "ผลการเรียน" ทันที (capture: ทำก่อนตัวจัดการเดิมของฟอร์ม)
  document.addEventListener('input', e => {
    const t = e.target;
    if (!t || !t.matches || !t.matches('[data-sf-matrix="grades_matrix"][data-sf-mrow][data-sf-mcol]')) return;
    const bad = t.value.trim() !== '' && !validGpa(num(t.value));
    t.classList.toggle('sf-invalid', bad);
    if (!isStaff()) return;                 // บัญชีนักเรียนแก้ผลการเรียนในทะเบียนไม่ได้ (ครูจะนำขึ้นให้)
    const s = sfGetStudent(); const store = s && s[sfState.formKey];
    const m = store && store.grades_matrix; if (!m || !m.cols) return;
    const ci = m.cols.findIndex(c => c._id === t.getAttribute('data-sf-mcol'));
    if (ci < 0) return;
    writeGpa(s, termOf(t.getAttribute('data-sf-mrow'), levelOfCol(m.cols[ci], ci)), t.value);
  }, true);

  // ค่าเฉลี่ยในหน้าจอ/การพิมพ์ใช้สูตรใหม่
  const _prevDerived = window.sfRecomputeDerived;
  window.sfRecomputeDerived = function (formKey) {
    const r = _prevDerived ? _prevDerived.apply(this, arguments) : undefined;
    try {
      formKey = formKey || sfState.formKey;
      const s = sfGetStudent(); const m = s && s[formKey] && s[formKey].grades_matrix;
      if (m) computeGrades(m, AVG_ROW[formKey] || 'avg2');
    } catch (e) {}
    return r;
  };
  const _prevPreview = window.sfOpenPreview;
  if (typeof _prevPreview === 'function') {
    window.sfOpenPreview = function () {
      try { prepareGrades(sfState.formKey); } catch (e) {}
      return _prevPreview.apply(this, arguments);
    };
  }

  /* ══════════ F4) หัวข้อแต่ละส่วนของฟอร์ม ══════════ */
  function sectionCounts(formKey, section) {
    let total = 0, filled = 0;
    section.fields.forEach(f => {
      if (['heading', 'note', 'table', 'matrix'].includes(f.type) || f.optional) return;
      if (f.showIf) {
        const dep = sfGetValue(formKey, f.showIf.field, { type: 'radio' });
        if (((dep && typeof dep === 'object') ? dep.choice : dep) !== f.showIf.equals) return;
      }
      total++;
      const v = sfGetValue(formKey, f.id, f);
      if (f.type === 'radio') { if (v && v.choice) filled++; }
      else if (f.type === 'checkboxgroup') { if (v && ((v.selected && v.selected.length) || v.other)) filled++; }
      else if (v !== '' && v !== null && v !== undefined) filled++;
    });
    return { total, filled };
  }
  function progressHtml(formKey, section) {
    const { total, filled } = sectionCounts(formKey, section);
    if (!total) return `<span class="sf-sec-status is-free">ไม่มีช่องบังคับ</span>`;
    const done = filled >= total;
    const pct = Math.round(filled / total * 100);
    return `<span class="sf-sec-status ${done ? 'is-done' : ''}">
      <span class="sf-sec-status-text">${done ? '✓ กรอกครบแล้ว' : `กรอกแล้ว ${filled} จาก ${total} ช่อง`}</span>
      <span class="sf-sec-meter" aria-hidden="true"><span style="width:${pct}%"></span></span></span>`;
  }

  window.sfRenderSectionContent = function (formKey, idx) {
    const sections = sfGetSections(formKey);
    const section = sections[idx];
    const dirClass = sfState.lastDir === 'prev' ? 'sf-dir-prev' : sfState.lastDir === 'jump' ? 'sf-dir-jump' : '';
    // แบ่งช่องเป็นกลุ่มตามหัวข้อย่อย (type:'heading')
    const groups = [{ title: null, html: [] }];
    section.fields.forEach(f => {
      if (f.type === 'heading') { groups.push({ title: f.text, html: [] }); return; }
      const h = sfRenderField(formKey, f);
      if (h) groups[groups.length - 1].html.push(h);
    });
    const body = groups.map(g => {
      if (!g.title) return g.html.length ? `<div class="sf-grid">${g.html.join('')}</div>` : '';
      return `<section class="sf-group">
        <h3 class="sf-group-title">${esc(g.title)}</h3>
        <div class="sf-grid">${g.html.join('')}</div></section>`;
    }).join('');
    return `<div class="sf-section-card sf-v2 ${dirClass}">
      <header class="sf-sec-head">
        <span class="sf-sec-num">${idx + 1}</span>
        <div class="sf-sec-titles">
          <h2>${esc(section.title)}</h2>
          <p>ส่วนที่ ${idx + 1} จาก ${sections.length}</p>
        </div>
        <div class="sf-sec-progress" data-sf-sec-progress>${progressHtml(formKey, section)}</div>
      </header>
      <div class="sf-sec-body">${body}</div></div>`;
  };

  // อัปเดตแถบความคืบหน้าของส่วนแบบสดขณะพิมพ์ (ไม่วาดทั้งหน้า)
  const _prevPersist = window.sfPersist;
  if (typeof _prevPersist === 'function') {
    let t = null;
    window.sfPersist = function () {
      const r = _prevPersist.apply(this, arguments);
      clearTimeout(t);
      t = setTimeout(() => {
        try {
          const el = document.querySelector('#sf-root [data-sf-sec-progress]');
          if (!el || sfState.studentIdx === null) return;
          const sec = sfGetSections(sfState.formKey)[sfState.sectionIndex];
          if (sec) el.innerHTML = progressHtml(sfState.formKey, sec);
        } catch (e) {}
      }, 150);
      return r;
    };
  }

  console.log('🛠️ 30-form-fixes: พิมพ์ไม่หลุด · บันทึกแล้วกลับหน้าแรก · ผลการเรียนเชื่อมหน้า "ผลการเรียน" · หัวข้อใหม่');
})();
