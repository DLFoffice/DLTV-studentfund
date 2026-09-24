/* ============================================================
   26-data-links.js — เชื่อมข้อมูล "แบบฟอร์ม ↔ ทะเบียนนักเรียน ↔ ผลการเรียน" ให้เป็นชุดเดียว
   ------------------------------------------------------------
   ก่อนหน้านี้:
     • ทะเบียน → ฟอร์ม : เติมให้แค่ครั้งแรก (ช่องว่าง) — แก้ทะเบียนทีหลัง ฟอร์มไม่ตาม
     • ฟอร์ม → ทะเบียน : ไม่มีเลย — ครูแก้เบอร์/ที่อยู่ในฟอร์ม ทะเบียนยังเป็นค่าเก่า
     • เกรดในฟอร์ม → GPA : ไม่มี — กลุ่มการดูแล/Dashboard ขึ้น "รอข้อมูล"

   หลักการ (ใช้กับแบบฟอร์มของ "ภาคเรียนที่เปิดใช้งาน" เท่านั้น
   แบบฟอร์มภาคเรียนที่ผ่านมาถือเป็นหลักฐาน ณ วันนั้น ไม่ถูกแก้ย้อนหลัง):

   1) ทุกช่องที่เชื่อมกับทะเบียนจำ "ค่าที่ระบบเติมให้ล่าสุด" ไว้ใน store.__pf
      และจำเวลาที่ผู้ใช้พิมพ์แก้เองไว้ใน store.__ed
   2) ทะเบียน → ฟอร์ม : ถ้าค่าในฟอร์มยังเท่ากับค่าที่ระบบเติมให้ (ผู้ใช้ไม่ได้แก้)
      และทะเบียนเปลี่ยนไปแล้ว → อัปเดตฟอร์มตามทะเบียน
   3) ฟอร์ม → ทะเบียน : ถ้าผู้ใช้แก้ช่องนั้นเอง → ค่านั้นกลายเป็นค่าล่าสุดของทะเบียน
      • ครู/แอดมิน : อัปเดตทะเบียนทันทีที่พิมพ์
      • บัญชีนักเรียน (Rules ไม่ให้แก้ทะเบียน) : เก็บเป็น "รอซิงก์" แล้วเครื่องของครู
        จะนำขึ้นทะเบียนให้อัตโนมัติเมื่อได้รับข้อมูล (realtime)
   4) ข้อมูลเก่าที่ไม่รู้ว่าฝั่งไหนใหม่กว่า (ทั้งสองฝั่งมีค่าและไม่ตรงกัน) → ไม่เขียนทับใคร
      จนกว่าจะมีการแก้ครั้งถัดไป (กันข้อมูลหาย)
   5) เกรดเฉลี่ยในตาราง "ผลการเรียน" ของฟอร์ม → semGpa ของภาคเรียนนั้น (source:'form')
      ถ้าครูกรอก GPA ในหน้า "ผลการเรียน" เองไว้แล้ว ค่านั้นมาก่อนเสมอ

   ไม่เชื่อมกลับ (ตั้งใจ): ชื่อ-สกุล, เลขบัตร ปชช. (ใช้ยืนยันตัวตนบัญชี), ภูมิลำเนา,
   ภาคเรียน/ปีการศึกษา, ยอดเงินทุนรวม (คำนวณจากประวัติเบิกจ่าย)
   โหลดหลัง 25-teacher-worklist.js
   ============================================================ */
(function () {
  'use strict';

  const isStaff = () => !window.STUDENT_MODE;
  const activeTerm = () => (window.Term && Term.active) ? Term.active() : null;
  const isBlank = v => v === undefined || v === null || String(v).trim() === '';
  const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

  /* ══════════ 1) ช่องในฟอร์มที่เชื่อมกลับไปทะเบียน ══════════ */
  function setPath(s, path, v) {
    const ks = path.split('.'); let o = s;
    for (let i = 0; i < ks.length - 1; i++) {
      if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = v;
  }
  const joinName = (a, b) => [a, b].map(x => String(x ?? '').trim()).filter(Boolean).join(' ');
  // คงคำนำหน้าชื่อเดิม (นาย/นาง/นางสาว) ไว้ — ฟอร์มเก็บชื่อแบบไม่มีคำนำหน้า
  const TITLE_RE = /^\s*(เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นางสาว|นาย|นาง)/;
  function withTitle(oldFull, first, last) {
    const t = (String(oldFull || '').match(TITLE_RE) || [])[1] || '';
    const f = String(first || '').trim();
    return joinName(t && !TITLE_RE.test(f) ? t + f : f, last);
  }

  const COMMON = {
    nickname: 'nickname', dob: 'dob', school_name: 'school_m1',
    bank_name: 'bank.bankSt', bank_branch: 'bank.branchSt',
    account_name: 'bank.accNameSt', account_no: 'bank.accNoSt',
    teacher_position: 'mentor.position', teacher_phone: 'mentor.phone',
    teacher_name: (s, v) => {
      const p = (typeof sfSplitName === 'function') ? sfSplitName(v) : { first: v, last: '' };
      setPath(s, 'mentor.firstName', p.first || ''); setPath(s, 'mentor.lastName', p.last || '');
    },
  };
  const LINKS = {
    form1: Object.assign({}, COMMON, {
      nationality: 'addr.nat', religion: 'addr.rel',
      cur_addr_no: 'addr.no', cur_addr_moo: 'addr.moo', cur_addr_tambon: 'addr.tambon',
      cur_addr_amphoe: 'addr.amphoe', cur_addr_province: 'addr.province', cur_addr_zip: 'addr.zip',
      cur_phone: 'phone', guardian_phone: 'parentPhone',
      addr_tambon: 'school_m1_addr.district', addr_amphoe: 'school_m1_addr.amphoe', addr_province: 'province',
      // ชื่อ/นามสกุลผู้ปกครองรวมเป็นช่องเดียวในทะเบียน — อีกครึ่งที่ว่างใช้ค่าเดิมจากทะเบียน
      guardian_name: (s, v, store) => {
        const old = (typeof sfSplitName === 'function') ? sfSplitName(s.parent) : { last: '' };
        s.parent = withTitle(s.parent, v, store.guardian_surname || old.last);
      },
      guardian_surname: (s, v, store) => {
        const old = (typeof sfSplitName === 'function') ? sfSplitName(s.parent) : { first: '' };
        s.parent = withTitle(s.parent, store.guardian_name || old.first, v);
      },
    }),
    form2: Object.assign({}, COMMON, {
      amphoe: 'school_m1_addr.amphoe', province: 'province', sangkad: 'org',
      director_name: 'school_m1_addr.directorM1',
    }),
  };
  function applyToProfile(s, formKey, fieldId, value, store) {
    const link = LINKS[formKey] && LINKS[formKey][fieldId];
    if (!link) return false;
    if (typeof link === 'function') link(s, value, store); else setPath(s, link, value);
    return true;
  }

  /* ══════════ 2) สถานะของช่องหนึ่ง ══════════ */
  function fieldsWithFrom(formKey) {
    const out = [];
    sfGetSections(formKey).forEach(sec => sec.fields.forEach(f => {
      if (f.from && (f.type === 'text' || f.type === 'number' || f.type === 'date' || f.type === 'textarea')) out.push(f);
    }));
    return out;
  }
  function meta(store) {
    if (!store.__pf || typeof store.__pf !== 'object') store.__pf = {};
    if (!store.__ed || typeof store.__ed !== 'object') store.__ed = {};
    return store;
  }
  function profileValue(s, f) { try { const v = f.from(s); return v == null ? '' : v; } catch (e) { return ''; } }

  /** ผู้ใช้แก้ช่องนี้เองและยังไม่ได้ขึ้นทะเบียน? */
  function isPending(s, formKey, f, store) {
    if (!(LINKS[formKey] && LINKS[formKey][f.id])) return false;
    const v = store[f.id];
    if (isBlank(v) || typeof v === 'object') return false;       // ช่องว่างไม่ลบข้อมูลทะเบียน
    const pf = store.__pf && store.__pf[f.id];
    if (store.__ed && store.__ed[f.id]) return !same(v, pf) && !same(v, profileValue(s, f));
    // ข้อมูลเก่า (ก่อนมีระบบนี้): ขึ้นทะเบียนเฉพาะเมื่อทะเบียนยังว่าง
    return pf === undefined && isBlank(profileValue(s, f));
  }

  /** ทะเบียน → ฟอร์ม สำหรับช่องเดียว (คืน true ถ้ามีการเปลี่ยน) */
  function refreshFromProfile(s, formKey, f, store) {
    meta(store);
    const v = store[f.id];
    if (v !== undefined && typeof v === 'object') return false;
    const fresh = profileValue(s, f);
    const pf = store.__pf[f.id];
    if (pf === undefined) {
      // ยังไม่เคยจำ: ถ้าค่าตรงกับทะเบียนอยู่แล้ว ถือว่าระบบเติมให้
      if (!isBlank(v) && same(v, fresh)) { store.__pf[f.id] = v; return true; }
      return false;
    }
    if (same(v, pf) && !isBlank(fresh) && !same(fresh, v)) {
      store[f.id] = fresh; store.__pf[f.id] = fresh; return true;
    }
    return false;
  }

  /* ══════════ 3) กระทบยอดนักเรียน 1 คน ══════════ */
  function reconcileForms(s, opts) {
    const t = activeTerm(); if (!t || !window.Term) return false;
    const b = Term.bucket(s, t); if (!b) return false;          // ยังไม่เคยเปิดฟอร์มภาคนี้ → ไม่สร้างใหม่
    let changed = false;
    const canWriteProfile = opts.writeProfile;
    ['form1', 'form2'].forEach(formKey => {
      const store = b[formKey]; if (!store || typeof store !== 'object') return;
      meta(store);
      const fields = fieldsWithFrom(formKey);
      // (ก) ฟอร์ม → ทะเบียน
      if (canWriteProfile) fields.forEach(f => {
        if (!isPending(s, formKey, f, store)) return;
        if (applyToProfile(s, formKey, f.id, store[f.id], store)) {
          store.__pf[f.id] = store[f.id]; changed = true;
        }
      });
      // (ข) ทะเบียน → ฟอร์ม
      fields.forEach(f => { if (!isPending(s, formKey, f, store) && refreshFromProfile(s, formKey, f, store)) changed = true; });
    });
    // ให้ alias student.form1/form2 ชี้ภาคเรียนปัจจุบันเสมอ
    s.form1 = b.form1; s.form2 = b.form2;
    return changed;
  }

  /* ══════════ 4) เกรดในฟอร์ม → semGpa ══════════ */
  const GPA_MATRICES = [['form2', 'grades_matrix'], ['form1', 'grades_matrix']];
  function pickColumn(m, term) {
    const cols = (m && m.cols) || []; if (!cols.length) return null;
    const p = Term.parse(term); if (!p) return cols[cols.length - 1];
    const byYear = cols.find(c => String(c.label || '').includes(String(p.year)));
    if (byYear) return byYear;
    const grade = (typeof gradeFromTerm === 'function') ? gradeFromTerm(term) : '';   // เช่น "ม.2"
    const gNum = (grade.match(/\d+/) || [])[0];
    if (gNum) {
      const byGrade = cols.find(c => {
        const lab = String(c.label || '').replace(/\s+/g, '');
        return new RegExp('(ม\\.?|มัธยมศึกษาปีที่)' + gNum + '(?!\\d)').test(lab);
      });
      if (byGrade) return byGrade;
    }
    return cols[cols.length - 1];                                  // คอลัมน์ขวาสุด = ปีล่าสุด
  }
  function gpaFromForms(s, term) {
    const at = activeTerm(); const b = at ? Term.bucket(s, at) : null; if (!b) return null;
    const p = Term.parse(term); if (!p) return null;
    const row = p.sem === 1 ? 'term1' : 'term2';
    for (const [fk, fid] of GPA_MATRICES) {
      const m = b[fk] && b[fk][fid];
      if (!m || !m.values || !m.values[row]) continue;
      const col = pickColumn(m, term); if (!col) continue;
      const g = parseFloat(String(m.values[row][col._id] ?? '').replace(',', '.'));
      if (g > 0 && g <= 4) return Math.round(g * 100) / 100;
    }
    return null;
  }
  function reconcileGpa(s) {
    const at = activeTerm(); const p = at && Term.parse(at); if (!p) return false;
    const terms = p.sem === 2 ? ['1/' + p.year, at] : [at];       // ภาค 2 → เติมภาค 1 ของปีเดียวกันด้วยถ้ายังไม่มี
    let changed = false;
    if (!Array.isArray(s.semGpa)) s.semGpa = [];
    terms.forEach(t => {
      const g = gpaFromForms(s, t); if (g == null) return;
      const ex = s.semGpa.find(x => x && x.term === t);
      if (!ex) {
        s.semGpa.push({ term: t, gpa: g, riskLevel: '', hasObstacle: false, obstacleType: '',
          weakSubjects: '', schoolSupport: '', source: 'form' });
        changed = true;
      } else if ((ex.source === 'form' || !(Number(ex.gpa) > 0)) && Number(ex.gpa) !== g) {
        ex.gpa = g; ex.source = 'form'; changed = true;           // ค่าที่ครูกรอกเองในหน้าผลการเรียน (>0) ไม่ถูกทับ
      }
    });
    if (changed) {
      s.semGpa.sort((a, b) => Term.cmp(a.term, b.term));
      const latest = (typeof getLatestGpa === 'function') ? getLatestGpa(s) : null;
      if (latest && latest.term) s.gpa = Object.assign({}, latest);
    }
    return changed;
  }

  /* ══════════ 5) กระทบยอดทั้งระบบ (เครื่องครู/แอดมิน) ══════════ */
  let _busy = false;
  function reconcileAll(reason) {
    if (_busy || !isStaff() || !window.Term) return 0;
    _busy = true;
    let n = 0;
    try {
      (DB.students || []).forEach(s => {
        let c = false;
        try { c = reconcileForms(s, { writeProfile: true }) || c; } catch (e) { console.warn('links/forms', e); }
        try { c = reconcileGpa(s) || c; } catch (e) { console.warn('links/gpa', e); }
        if (c) n++;
      });
    } finally { _busy = false; }
    if (n) {
      console.log('🔗 เชื่อมข้อมูลฟอร์ม ↔ ทะเบียน/ผลการเรียน: อัปเดต ' + n + ' คน (' + reason + ')');
      try { saveToStorage(); } catch (e) {}
      try { renderDashboard(); renderStudents(); } catch (e) {}
      try { if (window.Term) Term.rerender(); } catch (e) {}
    }
    return n;
  }

  /* ══════════ 6) ต่อเข้ากับการกรอกฟอร์มแบบ realtime ══════════ */
  // (ก) ทุกครั้งที่ฟอร์มอ่านค่าช่อง → ดึงค่าล่าสุดจากทะเบียน ถ้าผู้ใช้ไม่ได้แก้ช่องนั้น
  if (typeof sfGetValue === 'function') {
    const _origGet = sfGetValue;
    sfGetValue = function (formKey, fieldId, field) {
      const r = _origGet.apply(this, arguments);
      try {
        if (field && field.from && (typeof r !== 'object' || r === null)) {
          const s = sfGetStudent(); const store = s && s[formKey];
          if (store && !isPending(s, formKey, field, store) && refreshFromProfile(s, formKey, field, store)) return store[fieldId];
        }
      } catch (e) {}
      return r;
    };
  }
  // (ข) ผู้ใช้พิมพ์ในช่อง → จำว่าแก้เอง + ครูขึ้นทะเบียนทันที
  if (typeof sfSetSimpleValue === 'function') {
    const _origSet = sfSetSimpleValue;
    sfSetSimpleValue = function (formKey, fieldId, value) {
      const r = _origSet.apply(this, arguments);
      try {
        const s = sfGetStudent(); const store = s && s[formKey];
        if (store && LINKS[formKey] && LINKS[formKey][fieldId]) {
          meta(store); store.__ed[fieldId] = Date.now();
          if (isStaff() && !isBlank(value) && applyToProfile(s, formKey, fieldId, value, store)) {
            store.__pf[fieldId] = value;
          }
        }
      } catch (e) { console.warn('links/set', e); }
      return r;
    };
  }
  // (ค) ครูแก้ตารางผลการเรียนในฟอร์ม → อัปเดต GPA ทันที (หน่วงเล็กน้อย)
  let _gpaTimer = null;
  const _origPersist = window.sfPersist;
  if (typeof _origPersist === 'function') {
    window.sfPersist = function () {
      const r = _origPersist.apply(this, arguments);
      if (isStaff()) {
        clearTimeout(_gpaTimer);
        _gpaTimer = setTimeout(() => {
          const s = (typeof sfGetStudent === 'function') ? sfGetStudent() : null;
          if (s && reconcileGpa(s)) { try { saveToStorage(); } catch (e) {} }
        }, 900);
      }
      return r;
    };
  }

  // (ง) ข้อมูลจากคลาวด์มาถึง (ครั้งแรก + ทุกครั้งที่เครื่องอื่นแก้) → กระทบยอดทั้งระบบ
  //     setTimeout: รอให้ตัวเชื่อม Firebase ตั้งสถานะ "พร้อมบันทึก" ก่อน จึงจะส่งขึ้นคลาวด์ได้
  window.addEventListener('dltv:students-loaded', e => {
    if (e.detail && e.detail.studentMode) return;
    setTimeout(() => reconcileAll('cloud'), 50);
  });
  // โหมดไม่ใช้ Firebase (localStorage): กระทบยอดหนึ่งครั้งตอนเปิดแอป
  if (!window.FB_NO_LOCAL_STUDENT_CACHE) setTimeout(() => reconcileAll('local'), 300);

  // หลังครูแก้ข้อมูลในหน้ารายละเอียด/ผลการเรียนแล้วกดบันทึก → ฟอร์มภาคปัจจุบันตามทันที
  const _origSave = window.saveToStorage;
  if (typeof _origSave === 'function') {
    let _t = null;
    saveToStorage = async function () {
      const r = await _origSave.apply(this, arguments);
      if (isStaff() && !_busy) { clearTimeout(_t); _t = setTimeout(() => reconcileAll('edit'), 1200); }
      return r;
    };
  }

  window.DataLinks = { reconcileAll, reconcileForms, reconcileGpa, gpaFromForms, LINKS };
})();
