/* ============================================================
   35-school-history.js — ประวัติสถานศึกษา / การย้ายโรงเรียน + ระดับชั้นตามการจ่ายทุนล่าสุด
   ------------------------------------------------------------
   ข้อมูล (เพิ่มในเอกสารนักเรียน ไม่แก้ฟิลด์เดิม):
     s.school_m1 + s.province + s.org + s.school_m1_addr  = โรงเรียน "ปัจจุบัน" (ฟิลด์เดิม ใช้ทั้งระบบ)
     s.schoolSince   = { term, reason, note, recordedAt, recordedBy }   เริ่มเรียนที่โรงเรียนปัจจุบันเมื่อไร
     s.schoolHistory = [ { school, province, org, amphoe, district, tambon, zip, address, lat, lng,
                           directorM1, telDirectorM1, advisorM1, telAdvisorM1, advisorPosM1,
                           fromTerm, toTerm, reason, note, recordedAt, recordedBy } ]  โรงเรียนเดิม (ปิดช่วงแล้ว)
   ใช้งาน:
     SchoolHistory.periods(s)  → ทุกช่วง (เดิม → ปัจจุบัน)   SchoolHistory.at(s, term) → โรงเรียนในภาคนั้น
     SchoolHistory.status(s)   → { moved, count, label, since }
     SchoolHistory.openTransfer(idx) → กล่องบันทึกการย้าย
     currentGradeOf(s)         → ระดับชั้นปัจจุบัน ยึดจากภาคเรียนที่จ่ายเงินทุนล่าสุด
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const tkey = t => { const m = String(t || '').match(/(\d)\/(\d{4})/); return m ? +m[2] * 10 + +m[1] : 0; };
  const validTerm = t => /^[12]\/\d{4}$/.test(String(t || '').trim());
  const termLbl = t => (window.Term && Term.label && validTerm(t)) ? Term.label(t) : (t || '');
  const grade = t => (typeof gradeFromTerm === 'function' && t) ? (gradeFromTerm(t) || '') : '';
  const activeTerm = () => (window.Term && Term.active) ? Term.active() : '';
  const baseYear = () => (typeof GRADE_BASE_YEAR !== 'undefined') ? GRADE_BASE_YEAR : 2568;
  const SA_KEYS = ['amphoe', 'district', 'tambon', 'zip', 'address', 'lat', 'lng', 'directorM1', 'telDirectorM1', 'advisorM1', 'telAdvisorM1', 'advisorPosM1'];
  const CONTACT_KEYS = ['directorM1', 'telDirectorM1', 'advisorM1', 'telAdvisorM1', 'advisorPosM1'];
  const REASONS = ['ย้ายตามผู้ปกครอง / ย้ายที่อยู่', 'ศึกษาต่อระดับชั้นที่สูงขึ้น (เช่น ม.4)', 'โรงเรียนเดิมไม่เปิดสอนระดับชั้นนี้', 'ปัญหาการเดินทาง', 'ปัญหาสุขภาพ / ครอบครัว', 'อื่น ๆ'];

  function prevTerm(t) { const m = String(t).match(/^([12])\/(\d{4})$/); if (!m) return ''; return m[1] === '2' ? `1/${m[2]}` : `2/${+m[2] - 1}`; }
  function knownTerms(s) {
    const set = new Set();
    (s.semPayments || []).forEach(p => validTerm(p && p.term) && set.add(p.term));
    (s.semGpa || []).forEach(g => validTerm(g && g.term) && set.add(g.term));
    Object.keys(s.forms || {}).forEach(t => validTerm(t) && set.add(t));
    return [...set].sort((a, b) => tkey(a) - tkey(b));
  }
  function firstTerm(s) { return knownTerms(s)[0] || `1/${baseYear()}`; }

  /* ---------- ระดับชั้นปัจจุบัน: ยึดภาคเรียนที่จ่ายเงินทุนล่าสุด ---------- */
  function currentGradeOf(s) {
    const pays = (s.semPayments || []).filter(p => p && validTerm(p.term));
    const paid = pays.filter(p => num(p.p1) + num(p.p2) > 0).sort((a, b) => tkey(b.term) - tkey(a.term));
    const pick = paid[0] || pays.sort((a, b) => tkey(b.term) - tkey(a.term))[0];
    if (pick) return { grade: grade(pick.term), term: pick.term, source: 'payment', year: pick.term.split('/')[1] };
    const t = activeTerm();
    return { grade: grade(t), term: t, source: 'active', year: String(t).split('/')[1] || '' };
  }
  window.currentGradeOf = currentGradeOf;

  /* ---------- ช่วงเวลาสถานศึกษา ---------- */
  function currentPeriod(s) {
    const sa = s.school_m1_addr || {};
    const since = s.schoolSince || {};
    const p = { school: s.school_m1 || '', province: s.province || '', org: s.org || '', fromTerm: since.term || '', toTerm: '',
      reason: since.reason || '', note: since.note || '', recordedAt: since.recordedAt || '', current: true };
    SA_KEYS.forEach(k => { p[k] = sa[k] || ''; });
    if (!p.fromTerm) p.fromTerm = (s.schoolHistory && s.schoolHistory.length) ? '' : firstTerm(s);
    return p;
  }
  function periods(s) {
    const past = (Array.isArray(s.schoolHistory) ? s.schoolHistory : []).slice().sort((a, b) => tkey(a.fromTerm) - tkey(b.fromTerm));
    return [...past, currentPeriod(s)];
  }
  function at(s, term) {
    const k = tkey(term);
    const ps = periods(s);
    for (const p of ps) {
      const f = tkey(p.fromTerm) || 0, t = p.toTerm ? tkey(p.toTerm) : Infinity;
      if (k >= f && k <= t) return p;
    }
    return ps[ps.length - 1];
  }
  function status(s) {
    const n = Array.isArray(s.schoolHistory) ? s.schoolHistory.length : 0;
    const since = (s.schoolSince && s.schoolSince.term) || '';
    return n
      ? { moved: true, count: n, since, label: `ย้ายสถานศึกษา ${n} ครั้ง${since ? ' · ล่าสุดภาคเรียน ' + since : ''}` }
      : { moved: false, count: 0, since: firstTerm(s), label: 'เรียนที่สถานศึกษาเดิม (ไม่เคยย้าย)' };
  }

  /* ---------- แผงในแท็บการศึกษา ---------- */
  function panelHtml(idx) {
    const s = DB.students[idx];
    const st = status(s);
    const ps = periods(s);
    const rows = ps.slice().reverse().map(p => `<li class="sh-item${p.current ? ' is-cur' : ''}">
        <span class="sh-dot" aria-hidden="true"></span>
        <div class="sh-body">
          <div class="sh-top"><b>${E(p.school || '(ยังไม่ระบุชื่อโรงเรียน)')}</b>${p.current ? '<span class="sh-tag cur">ปัจจุบัน</span>' : '<span class="sh-tag">เดิม</span>'}</div>
          <div class="sh-meta">${E([p.amphoe && 'อ.' + p.amphoe, p.province && 'จ.' + p.province, p.org].filter(Boolean).join(' · ') || 'ไม่ระบุที่ตั้ง')}</div>
          <div class="sh-when">${p.fromTerm ? 'ตั้งแต่ ' + E(termLbl(p.fromTerm)) : 'ไม่ทราบภาคเรียนที่เริ่ม'}${p.toTerm ? ' ถึง ' + E(termLbl(p.toTerm)) : p.current ? ' ถึงปัจจุบัน' : ''}</div>
          ${p.reason ? `<div class="sh-reason">เหตุผลที่ย้ายมา: ${E(p.reason)}${p.note ? ' — ' + E(p.note) : ''}</div>` : ''}
        </div></li>`).join('');
    return `<section class="sh-card" data-sh-idx="${idx}">
      <div class="sh-head">
        <div><div class="sh-title">สถานะสถานศึกษา</div>
          <div class="sh-status ${st.moved ? 'moved' : 'same'}">${st.moved ? '🔁' : '✓'} ${E(st.label)}</div></div>
        <div class="sh-actions">
          ${st.moved ? `<button type="button" class="btn btn-sm" data-sh-undo="${idx}">↩︎ ยกเลิกการย้ายล่าสุด</button>` : ''}
          <button type="button" class="btn btn-primary btn-sm" data-sh-move="${idx}">🔁 บันทึกการย้ายสถานศึกษา</button>
        </div>
      </div>
      <ol class="sh-list">${rows}</ol>
      <p class="sh-hint">เมื่อนักเรียนย้ายโรงเรียน ให้กด "บันทึกการย้ายสถานศึกษา" ระบบจะเก็บโรงเรียนเดิมไว้ในประวัติ (พร้อมครูที่ปรึกษา/ผู้อำนวยการเดิม)
        แล้วตั้งโรงเรียนใหม่เป็นโรงเรียนปัจจุบัน — แบบฟอร์มภาคเรียนใหม่จะใช้ข้อมูลโรงเรียนใหม่ ส่วนเอกสารภาคเรียนเก่ายังคงเป็นโรงเรียนเดิม</p>
    </section>`;
  }
  function inject(idx) {
    const host = document.getElementById('st-panel-6');
    if (!host) return;
    const old = host.querySelector('.sh-card'); if (old) old.remove();
    const first = host.querySelector('.form-section');
    if (first) first.insertAdjacentHTML('beforebegin', panelHtml(idx)); else host.insertAdjacentHTML('afterbegin', panelHtml(idx));
    const t = host.querySelector('.form-section-title');
    if (t && /ม\.1\)/.test(t.textContent)) t.textContent = '🏫 ข้อมูลโรงเรียนปัจจุบัน';
  }
  const _rsp = window.renderSchoolPanel;
  if (typeof _rsp === 'function') {
    window.renderSchoolPanel = function (idx) { const r = _rsp.apply(this, arguments); try { inject(idx); } catch (e) { console.warn(e); } return r; };
  }
  document.addEventListener('click', e => {
    const mv = e.target.closest && e.target.closest('[data-sh-move]');
    if (mv) { openTransfer(+mv.getAttribute('data-sh-move')); return; }
    const un = e.target.closest && e.target.closest('[data-sh-undo]');
    if (un) undoTransfer(+un.getAttribute('data-sh-undo'));
  });

  function rerender(idx) {
    try { window.renderSchoolPanel(idx); } catch (e) {}
    try { if (typeof renderStudents === 'function') renderStudents(); } catch (e) {}
  }
  function persist() { try { saveToStorage(); } catch (e) {} }

  /* ---------- กล่องบันทึกการย้าย ---------- */
  function openTransfer(idx) {
    const s = DB.students[idx]; if (!s) return;
    const act = activeTerm();
    const terms = new Set(knownTerms(s)); if (act) terms.add(act);
    if (window.Term && Term.all) Term.all().forEach(t => terms.add(t));
    const list = [...terms].filter(validTerm).sort((a, b) => tkey(b) - tkey(a));
    const w = document.createElement('div');
    w.className = 'uid-backdrop';
    w.innerHTML = `<div class="uid sh-dlg" role="dialog" aria-modal="true" aria-labelledby="sh-dlg-t">
      <div class="uid-icon">🔁</div>
      <h2 class="uid-title" id="sh-dlg-t">บันทึกการย้ายสถานศึกษา</h2>
      <div class="uid-msg"><p>${E(s.name || '')} · ปัจจุบันเรียนที่ <b>${E(s.school_m1 || 'ไม่ระบุ')}</b></p></div>
      <div class="sh-form">
        <label class="w2">ชื่อสถานศึกษาใหม่ <em>*</em><input data-f="school" type="text" placeholder="เช่น โรงเรียนบ้านนาเจริญ"></label>
        <label>ตำบล<input data-f="district" type="text"></label>
        <label>อำเภอ<input data-f="amphoe" type="text"></label>
        <label>จังหวัด<input data-f="province" type="text" value="${E(s.province || '')}"></label>
        <label>สังกัด<input data-f="org" type="text" placeholder="เช่น สพม.นครพนม"></label>
        <label>เริ่มเรียนที่ใหม่ภาคเรียน <em>*</em><select data-f="term">${list.map(t => `<option value="${t}" ${t === act ? 'selected' : ''}>${E(termLbl(t))}</option>`).join('')}</select></label>
        <label>เหตุผลที่ย้าย<select data-f="reason">${REASONS.map(r => `<option>${E(r)}</option>`).join('')}</select></label>
        <label class="w2">หมายเหตุ<input data-f="note" type="text" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"></label>
        <label class="w2 sh-check"><input data-f="clear" type="checkbox" checked> ล้างชื่อครูที่ปรึกษา ผู้อำนวยการ และพิกัดของโรงเรียนเดิม (เก็บไว้ในประวัติ) แล้วค่อยกรอกของโรงเรียนใหม่</label>
      </div>
      <div class="uid-error" data-err role="alert"></div>
      <div class="uid-actions"><button type="button" class="uid-btn uid-cancel">ยกเลิก</button><button type="button" class="uid-btn uid-ok">บันทึกการย้าย</button></div>
    </div>`;
    document.body.appendChild(w);
    requestAnimationFrame(() => w.classList.add('in'));
    const q = f => w.querySelector(`[data-f="${f}"]`);
    const close = () => { w.classList.remove('in'); setTimeout(() => w.remove(), 160); document.removeEventListener('keydown', onKey, true); };
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    document.addEventListener('keydown', onKey, true);
    w.querySelector('.uid-cancel').onclick = close;
    setTimeout(() => q('school').focus(), 40);
    w.querySelector('.uid-ok').onclick = () => {
      const school = q('school').value.trim(), term = q('term').value;
      const err = w.querySelector('[data-err]');
      if (!school) { err.textContent = 'กรุณากรอกชื่อสถานศึกษาใหม่'; q('school').focus(); return; }
      if (school.replace(/\s+/g, '') === String(s.school_m1 || '').replace(/\s+/g, '')) { err.textContent = 'ชื่อสถานศึกษาใหม่ซ้ำกับโรงเรียนปัจจุบัน'; q('school').focus(); return; }
      const cur = currentPeriod(s);
      if (cur.fromTerm && tkey(term) <= tkey(cur.fromTerm)) { err.textContent = `ภาคเรียนที่ย้ายต้องอยู่หลัง ${termLbl(cur.fromTerm)} (ภาคที่เริ่มเรียนโรงเรียนปัจจุบัน)`; return; }
      const who = (window.STUDENT_MODE && STUDENT_MODE.username) || 'staff';
      const snap = Object.assign({}, cur, { toTerm: prevTerm(term), recordedAt: new Date().toISOString(), recordedBy: who });
      delete snap.current;
      if (!Array.isArray(s.schoolHistory)) s.schoolHistory = [];
      s.schoolHistory.push(snap);
      s.school_m1 = school;
      s.province = q('province').value.trim();
      s.org = q('org').value.trim();
      const sa = s.school_m1_addr = (s.school_m1_addr && typeof s.school_m1_addr === 'object') ? s.school_m1_addr : {};
      ['district', 'amphoe', 'tambon', 'zip', 'address', 'lat', 'lng'].forEach(k => { sa[k] = ''; });
      sa.district = q('district').value.trim(); sa.amphoe = q('amphoe').value.trim();
      if (q('clear').checked) CONTACT_KEYS.forEach(k => { sa[k] = ''; });
      s.schoolSince = { term, reason: q('reason').value, note: q('note').value.trim(), recordedAt: new Date().toISOString(), recordedBy: who };
      persist(); close(); rerender(idx);
      if (window.UIDialog) UIDialog.alert({ tone: 'success', title: 'บันทึกการย้ายสถานศึกษาแล้ว',
        message: 'โรงเรียนเดิมถูกเก็บไว้ในประวัติ กรอกข้อมูลครูที่ปรึกษา ผู้อำนวยการ และพิกัดของโรงเรียนใหม่ได้ในแท็บนี้',
        details: [{ label: 'จาก', value: snap.school || '-' }, { label: 'ไปที่', value: school }, { label: 'เริ่มภาคเรียน', value: termLbl(term) }] });
    };
  }
  async function undoTransfer(idx) {
    const s = DB.students[idx]; if (!s || !Array.isArray(s.schoolHistory) || !s.schoolHistory.length) return;
    const last = s.schoolHistory.slice().sort((a, b) => tkey(a.fromTerm) - tkey(b.fromTerm)).pop();
    const ok = window.uiAsk ? await uiAsk('ข้อมูลโรงเรียนปัจจุบันจะถูกแทนด้วยโรงเรียนเดิมจากประวัติ (ใช้เมื่อบันทึกการย้ายผิดพลาด)',
      { tone: 'warning', title: 'ยกเลิกการย้ายล่าสุด?', details: { from: s.school_m1 || '-', to: last.school || '-' }, confirmText: 'กลับไปโรงเรียนเดิม' }) : confirm('ยกเลิกการย้ายล่าสุด?');
    if (!ok) return;
    s.schoolHistory.splice(s.schoolHistory.indexOf(last), 1);
    s.school_m1 = last.school || ''; s.province = last.province || ''; s.org = last.org || '';
    const sa = s.school_m1_addr = s.school_m1_addr || {};
    SA_KEYS.forEach(k => { sa[k] = last[k] || ''; });
    s.schoolSince = last.fromTerm || last.reason ? { term: last.fromTerm || '', reason: last.reason || '', note: last.note || '', recordedAt: last.recordedAt || '' } : undefined;
    if (!s.schoolSince) delete s.schoolSince;
    persist(); rerender(idx);
  }

  window.SchoolHistory = { periods, at, status, openTransfer, prevTerm };
})();
