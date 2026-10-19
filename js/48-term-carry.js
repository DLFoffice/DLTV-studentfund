/* ============================================================
   48-term-carry.js (v62) — ยกข้อมูลแบบฟอร์มจากภาคเรียนก่อนหน้ามาให้ในภาคเรียนใหม่
   ------------------------------------------------------------
   • เปิดแบบฟอร์ม (1 หรือ 2) ของภาคเรียนที่ใช้งาน ครั้งแรก → หาภาคเรียนล่าสุดก่อนหน้าที่มีข้อมูลของฟอร์มนั้น
     แล้วคัดลอก "เฉพาะช่องที่ยังว่าง" มาให้ (ไม่ทับสิ่งที่กรอกแล้ว)
   • ไม่ยกข้อมูลรายภาคเรียน: ภาคเรียน/ปีการศึกษา/ระดับชั้น, ความประพฤติ, การรับ-จ่ายเงิน, ยอดเงิน,
     วันที่ลงนาม, ข้อคิดเห็นของครู, ผลงานดีเด่น, เอกสารแนบ
   • ช่องที่ระบบดึงจากทะเบียนนักเรียน (from:) ใช้ค่าจากทะเบียนก่อน — ยกจากภาคก่อนเฉพาะเมื่อทะเบียนว่าง
   • ทำครั้งเดียวต่อฟอร์มต่อภาคเรียน (บันทึก __carriedFrom ไว้) — ล้างช่องเองแล้วจะไม่ถูกเติมกลับ
   • แถบแจ้งในหน้าแบบฟอร์ม + ปุ่ม "ไม่ใช้ข้อมูลที่ยกมา" (ล้างเฉพาะช่องที่ยกมาและยังไม่ได้แก้)
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  /* v65: ยกมาทุกช่อง ยกเว้นข้อมูลที่ต้องเป็นของภาคเรียนใหม่เท่านั้น (ภาค/ปี/ชั้น วันที่ลงนาม เอกสารแนบ) */
  const SKIP = {
    form1: ['academic_year', 'fund_year', 'student_sign_date', 'teacher_sign_date'],
    form2: ['semester', 'academic_year', 'grade_level', 'balance_date',
      'student_sign_date', 'teacher_sign_date', 'director_sign_date', 'attachments', 'attachments_note'],
  };
  const CARRY_V = 2;
  const NOVAL = { heading: 1, note: 1, files: 1 };
  const clone = v => JSON.parse(JSON.stringify(v));

  function hasData(v) {
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.some(r => r && r.cells && Object.values(r.cells).some(x => String(x ?? '').trim() !== ''));
    if (typeof v === 'object') {
      if ('choice' in v) return !!(v.choice || v.other);
      if ('selected' in v) return !!((v.selected && v.selected.length) || v.other);
      if ('values' in v) return Object.values(v.values || {}).some(r => r && Object.values(r).some(x => String(x ?? '').trim() !== ''));
      return Object.keys(v).length > 0;
    }
    return String(v).trim() !== '';
  }
  function fieldsOf(fk) {
    const out = [];
    try { sfGetSections(fk).forEach(sec => sec.fields.forEach(f => { if (!NOVAL[f.type]) out.push(f); })); } catch (e) {}
    return out;
  }
  /** ภาคเรียนก่อน term ทั้งหมด (ใหม่ → เก่า) */
  function prevTerms(s, term) {
    if (!s || !s.forms || !window.Term) return [];
    return Object.keys(s.forms).filter(t => t !== term && Term.isValid(t) && Term.cmp(t, term) < 0).sort(Term.cmp).reverse();
  }
  /** ภาคเรียนล่าสุดก่อน term ที่ฟอร์ม fk มีข้อมูลจริง */
  function prevTermWithData(s, fk, term) {
    const fields = fieldsOf(fk);
    return prevTerms(s, term).find(t => { const st = s.forms[t] && s.forms[t][fk]; return st && fields.some(f => hasData(st[f.id])); }) || null;
  }

  function carry(s, fk) {
    if (!s || !window.Term || (fk !== 'form1' && fk !== 'form2')) return null;
    const term = Term.active();
    sfEnsureFormStore(s);
    const store = s[fk]; if (!store || store.__carryOff) return null;
    if (store.__carriedFrom && (store.__carryV || 1) >= CARRY_V) return null;   // v65: รุ่นเก่ายกมาไม่ครบ → ยกเพิ่มอีกรอบ
    try { if (Term.state(s, fk, term) === 'submitted') return null; } catch (e) {}
    const terms = prevTerms(s, term); if (!terms.length) return null;
    const skip = new Set(SKIP[fk] || []);
    const copied = store.__carriedFields ? store.__carriedFields.slice() : [];
    const sig = Object.assign({}, store.__carriedSig || {});
    let from = store.__carriedFrom || null;
    fieldsOf(fk).forEach(f => {
      if (skip.has(f.id) || hasData(store[f.id])) return;
      if (f.from) { let fresh = ''; try { fresh = f.from(s); } catch (e) {} if (hasData(fresh)) return; }
      // ใช้ค่าจากภาคเรียนล่าสุดที่ช่องนี้มีข้อมูล (ภาคก่อนหน้าอาจกรอกไม่ครบ)
      const t = terms.find(t2 => { const st = s.forms[t2] && s.forms[t2][fk]; return st && hasData(st[f.id]); });
      if (!t) return;
      store[f.id] = clone(s.forms[t][fk][f.id]);
      if (!copied.includes(f.id)) copied.push(f.id);
      sig[f.id] = JSON.stringify(store[f.id]);
      if (!from || Term.cmp(t, from) > 0) from = t;
    });
    if (!from) return null;
    store.__carriedFrom = from;
    store.__carryV = CARRY_V;
    store.__carriedFields = copied;
    store.__carriedSig = sig;
    try { if (typeof _sfDebouncedSave === 'function') _sfDebouncedSave(); else if (window.fbSaveNow) fbSaveNow(); } catch (e) {}
    return { from, n: copied.length };
  }

  function undo() {
    const s = sfGetStudent(), fk = sfState.formKey; if (!s) return;
    sfEnsureFormStore(s);
    const store = s[fk]; if (!store || !store.__carriedFrom) return;
    let n = 0;
    (store.__carriedFields || []).forEach(id => {
      // ล้างเฉพาะช่องที่ยังเป็นค่าที่ยกมา (ช่องที่ผู้ใช้แก้แล้วคงไว้)
      if (JSON.stringify(store[id]) === (store.__carriedSig || {})[id]) { delete store[id]; n++; }
    });
    store.__carryOff = store.__carriedFrom;
    store.__carriedFields = []; store.__carriedSig = {};
    if (typeof sfPersist === 'function') sfPersist();
    sfRenderPage();
    if (window.UIDialog) UIDialog.alert({ tone: 'success', title: 'ล้างข้อมูลที่ยกมาแล้ว', message: `ล้าง ${n} ช่องที่ยกมาจากภาคเรียนก่อน — ช่องที่แก้ไขแล้วยังคงอยู่` });
  }

  function bannerHtml(s, fk) {
    const store = s && s[fk]; if (!store || !store.__carriedFrom || store.__carryOff) return '';
    const n = (store.__carriedFields || []).length; if (!n) return '';
    let hidden = false; try { hidden = sessionStorage.getItem('dltv.carry.hide.' + fk + '.' + (s.no ?? '')) === '1'; } catch (e) {}
    if (hidden) return '';
    const lbl = window.Term ? Term.label(store.__carriedFrom) : store.__carriedFrom;
    const per = fk === 'form2' ? 'ภาคเรียน ปีการศึกษา ระดับชั้น วันที่ลงนาม และเอกสารแนบ' : 'ปีการศึกษา รับทุนปีที่ และวันที่ลงนาม';
    return `<div class="tc-banner" role="status">
      <span class="tc-ic" aria-hidden="true">📋</span>
      <div class="tc-tx"><b>ยกข้อมูลจาก${E(lbl)} มาให้แล้ว ${n} ช่อง</b>
        <span>ตรวจทานและแก้ให้เป็นข้อมูลของภาคเรียนนี้ก่อนกดส่ง (โดยเฉพาะความประพฤติ การรับ-จ่ายเงิน และข้อคิดเห็นครู) · ${per} เว้นว่างไว้ให้กรอกใหม่</span></div>
      <div class="tc-acts"><button type="button" class="tc-btn" data-tc-hide="${fk}">รับทราบ</button>
        <button type="button" class="tc-btn ghost" data-tc-undo>ไม่ใช้ข้อมูลที่ยกมา</button></div>
    </div>`;
  }

  const _ed = window.sfRenderEditor;
  if (typeof _ed === 'function') {
    window.sfRenderEditor = function () {
      const s = sfGetStudent(), fk = sfState.formKey;
      try { carry(s, fk); } catch (e) { console.warn('carry', e); }
      const html = _ed.apply(this, arguments);
      const b = bannerHtml(s, fk);
      if (!b) return html;
      // แสดงเหนือกล่องคำชี้แจง (ถ้ามี) ไม่เช่นนั้นเหนือเนื้อหาแบบฟอร์ม
      const at = html.indexOf('<details class="gd') >= 0 ? html.indexOf('<details class="gd') : html.indexOf('<div class="sfx-body">');
      return at >= 0 ? html.slice(0, at) + b + html.slice(at) : html;
    };
    try { sfRenderEditor = window.sfRenderEditor; } catch (e) {}
  }

  document.addEventListener('click', async e => {
    const h = e.target.closest && e.target.closest('[data-tc-hide]');
    if (h) { const s = sfGetStudent(); try { sessionStorage.setItem('dltv.carry.hide.' + h.dataset.tcHide + '.' + (s && s.no != null ? s.no : ''), '1'); } catch (x) {} const bn = h.closest('.tc-banner'); if (bn) bn.remove(); return; }
    const u = e.target.closest && e.target.closest('[data-tc-undo]');
    if (u) {
      const ok = typeof uiAsk === 'function'
        ? await uiAsk('ล้างช่องที่ยกมาจากภาคเรียนก่อนออก (ช่องที่คุณแก้ไขแล้วจะคงไว้) แล้วกรอกใหม่ทั้งหมดเอง?', { tone: 'warning', title: 'ไม่ใช้ข้อมูลที่ยกมา?', confirmText: 'ล้างช่องที่ยกมา' })
        : confirm('ล้างช่องที่ยกมาจากภาคเรียนก่อน?');
      if (ok) undo();
    }
  });

  window.TermCarry = { carry, undo, prevTermWithData, hasData, SKIP };
})();
