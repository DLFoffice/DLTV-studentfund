/* ============================================================
   49-term-view.js (v63) — ดูแบบฟอร์มที่กรอกของ "ภาคเรียนย้อนหลัง" (อ่านอย่างเดียว)
   ------------------------------------------------------------
   ใช้หน้าพรีวิว/พิมพ์เดิม (sfOpenPreview) แต่ชี้ข้อมูลไปที่ "สำเนา" ของภาคเรียนที่เลือก
   ระหว่างหน้าต่างพรีวิวเปิดอยู่ → ปิดแล้วคืนค่าภาคเรียนที่ใช้งานตามเดิม ข้อมูลจริงไม่ถูกแก้
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  let restore = null, opening = false;

  function preview(idx, fk, term) {
    const s = DB.students[idx]; if (!s || !window.Term) return;
    const b = s.forms && s.forms[term]; if (!b) return;
    if (restore) restore();
    const c1 = JSON.parse(JSON.stringify(b.form1 || {})), c2 = JSON.parse(JSON.stringify(b.form2 || {}));
    const prevEnsure = window.sfEnsureFormStore;
    const prevIdx = sfState.studentIdx, prevFk = sfState.formKey;
    // v64: ให้ทุกส่วนของพรีวิว/พิมพ์ (หัวเอกสาร ภาคเรียน ปีการศึกษา ระดับชั้น ตารางผลการเรียน) ใช้ "ภาคเรียนที่ดู"
    const realActive = Term.active;
    Term.active = () => term;
    TermView.realActive = realActive;
    window.sfEnsureFormStore = function (st) {
      if (st === s) { st.form1 = c1; st.form2 = c2; return; }
      return prevEnsure.apply(this, arguments);
    };
    restore = () => {
      Term.active = realActive; TermView.realActive = null;
      window.sfEnsureFormStore = prevEnsure;
      try { Term.bind(s, Term.active()); } catch (e) {}
      sfState.studentIdx = prevIdx; sfState.formKey = prevFk;
      restore = null;
    };
    sfState.studentIdx = idx; sfState.formKey = fk;
    opening = true;
    try { sfOpenPreview(); } finally { opening = false; }
    const sub = document.querySelector('#sf-preview-overlay .sf-modal-sub');
    if (sub) sub.insertAdjacentHTML('beforeend', ` · <b class="tv-term">📂 ${E(Term.label(term))} (ดูย้อนหลัง)</b>`);
  }

  const _close = window.sfClosePreview;
  if (typeof _close === 'function') {
    window.sfClosePreview = function () {
      const r = _close.apply(this, arguments);
      if (!opening && restore) restore();
      return r;
    };
    try { sfClosePreview = window.sfClosePreview; } catch (e) {}
  }
  const TermView = window.TermView = { preview, realActive: null };
})();
