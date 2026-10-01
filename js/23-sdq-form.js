/* ============================================================
   23-sdq-form.js — แบบประเมิน SDQ (ฉบับครูเป็นผู้ประเมิน)
   ------------------------------------------------------------
   เพิ่มเข้ามา:
   1. หน้ากรอกแบบประเมิน SDQ 25 ข้อ ต่อนักเรียน 1 คน / 1 ภาคเรียน
      (เก็บที่ student.sdq[term] = {...})
   2. คิดคะแนน + แปลผล 5 ด้าน (อารมณ์ / เกเร / ไม่อยู่นิ่ง-สมาธิสั้น /
      สัมพันธ์กับเพื่อน / สัมพันธภาพทางสังคม) + คะแนนรวม 4 ด้าน
      ตามเกณฑ์ "ฉบับครูหรือผู้ปกครองเป็นผู้ประเมิน"
   3. หน้า Dashboard สรุปผลรวมทั้งโรงเรียน/ระดับชั้น พร้อมกราฟ Chart.js
   4. Export PDF ต่อคน (จัดหน้าสวยงาม) ผ่าน window.print()
   5. แอดมิน/ครู เปิด-ปิด การใช้งานฟอร์มนี้ได้ (เหมือนฟอร์ม 1/2)
      เก็บที่ settings/sdqFormAccess บน Firestore + localStorage สำรอง

   โหลดหลัง 19-term-system.js (ใช้ Term.active() เป็นค่าเริ่มต้นของภาคเรียน)
   ============================================================ */
(function () {
  'use strict';

  /* ══════════ 1) โครงสร้างข้อคำถาม 25 ข้อ ══════════ */
  const SDQ_ITEMS = [
    { id: 1, text: 'ห่วงใยความรู้สึกของคนอื่น', domain: 'prosocial' },
    { id: 2, text: 'อยู่ไม่นิ่ง นั่งนิ่งๆ ไม่ได้', domain: 'hyper' },
    { id: 3, text: 'มักจะบ่นว่าปวดศีรษะ ปวดท้อง หรือไม่สบาย', domain: 'emotional' },
    { id: 4, text: 'เต็มใจแบ่งปันสิ่งของให้เพื่อน (ขนม, ของเล่น, ดินสอ เป็นต้น)', domain: 'prosocial' },
    { id: 5, text: 'มักจะอาละวาดหรือโมโหร้าย', domain: 'conduct' },
    { id: 6, text: 'ค่อนข้างแยกตัว ชอบเล่นคนเดียว', domain: 'peer' },
    { id: 7, text: 'เชื่อฟัง มักจะทำตามที่ผู้ใหญ่ต้องการ', domain: 'conduct', reverse: true },
    { id: 8, text: 'กังวลใจหลายเรื่อง ดูวิตกกังวลเสมอ', domain: 'emotional' },
    { id: 9, text: 'เป็นที่พึ่งได้เวลาที่คนอื่นเสียใจ อารมณ์ไม่ดี หรือไม่สบายใจ', domain: 'prosocial' },
    { id: 10, text: 'อยู่ไม่สุข วุ่นวายอย่างมาก', domain: 'hyper' },
    { id: 11, text: 'มีเพื่อนสนิท', domain: 'peer', reverse: true },
    { id: 12, text: 'มักมีเรื่องทะเลาะวิวาทกับเด็กอื่น หรือรังแกเด็กอื่น', domain: 'conduct' },
    { id: 13, text: 'ดูไม่มีความสุข ท้อแท้ ร้องไห้บ่อย', domain: 'emotional' },
    { id: 14, text: 'เป็นที่ชื่นชอบของเพื่อน', domain: 'peer', reverse: true },
    { id: 15, text: 'วอกแวกง่าย สมาธิสั้น', domain: 'hyper' },
    { id: 16, text: 'เครียด ไม่ยอมห่างเวลาอยู่ในสถานการณ์ที่ไม่คุ้น และขาดความเชื่อมั่นในตนเอง', domain: 'emotional' },
    { id: 17, text: 'ใจดีกับเด็กที่เล็กกว่า', domain: 'prosocial' },
    { id: 18, text: 'ชอบโกหกหรือขี้โกง', domain: 'conduct' },
    { id: 19, text: 'ถูกเด็กคนอื่นล้อเลียนหรือรังแก', domain: 'peer' },
    { id: 20, text: 'ชอบอาสาช่วยเหลือคนอื่น (พ่อ, แม่, ครู, เด็กคนอื่น)', domain: 'prosocial' },
    { id: 21, text: 'คิดก่อนทำ', domain: 'hyper', reverse: true },
    { id: 22, text: 'ขโมยของของที่บ้าน ที่โรงเรียน หรือที่อื่น', domain: 'conduct' },
    { id: 23, text: 'เข้ากับผู้ใหญ่ได้ดีกว่าเด็กวัยเดียวกัน', domain: 'peer' },
    { id: 24, text: 'ขี้กลัว รู้สึกหวาดกลัวได้ง่าย', domain: 'emotional' },
    { id: 25, text: 'ทำงานได้จนเสร็จ มีความตั้งใจในการทำงาน', domain: 'hyper', reverse: true }
  ];
  const CHOICES = ['ไม่จริง', 'ค่อนข้างจริง', 'จริง']; // index 0,1,2

  const DOMAIN_META = {
    emotional: { label: 'ด้านอารมณ์', short: 'อารมณ์', normal: [0, 3], risk: [4, 4], problem: [5, 10], color: 'violet' },
    conduct: { label: 'ด้านความประพฤติ/เกเร', short: 'เกเร', normal: [0, 3], risk: [4, 4], problem: [5, 10], color: 'peach' },
    hyper: { label: 'ด้านพฤติกรรมไม่อยู่นิ่ง/สมาธิสั้น', short: 'ไม่อยู่นิ่ง/สมาธิสั้น', normal: [0, 5], risk: [6, 6], problem: [7, 10], color: 'lemon' },
    peer: { label: 'ด้านความสัมพันธ์กับเพื่อน', short: 'สัมพันธ์เพื่อน', normal: [0, 5], risk: [6, 6], problem: [7, 10], color: 'sky' },
    prosocial: { label: 'ด้านสัมพันธภาพทางสังคม (จุดแข็ง)', short: 'สัมพันธภาพทางสังคม', normal: [4, 10], risk: [3, 3], problem: [0, 2], isStrength: true, color: 'mint' }
  };
  /* ── โทนสีพาสเทลประจำแต่ละด้าน (ใช้ทั้งบนหน้าจอและ dashboard) ── */
  const DOMAIN_COLORS = {
    violet: { bg: '#F1EBFB', bg2: '#E7DCF9', line: '#8B5CF6', text: '#5B21B6' },
    peach:  { bg: '#FDECE3', bg2: '#FBDCC9', line: '#F0985E', text: '#9A4A17' },
    lemon:  { bg: '#FBF3D6', bg2: '#F7E8B0', line: '#D8B12B', text: '#8A6A0A' },
    sky:    { bg: '#E3F1FC', bg2: '#CDE7FA', line: '#4EA1DE', text: '#175D8C' },
    mint:   { bg: '#E2F6EC', bg2: '#CDEEDC', line: '#3FB080', text: '#166A48' }
  };
  /* สีพาสเทลของ 3 คำตอบ (ไม่จริง / ค่อนข้างจริง / จริง) — ใช้กับปุ่มเลือกคำตอบ */
  const CHOICE_COLORS = [
    { bg: '#E4F6EC', bg2: '#C7ECD7', line: '#38A870', text: '#1C6B47' },
    { bg: '#FDF2DA', bg2: '#FAE3AE', line: '#DFA426', text: '#8A6510' },
    { bg: '#FCE6E4', bg2: '#F9C9C5', line: '#E1685C', text: '#9C3931' }
  ];
  const TOTAL_META = { normal: [0, 15], risk: [16, 17], problem: [18, 40] };
  const DIFF_DOMAINS = ['emotional', 'conduct', 'hyper', 'peer'];

  function inRange(v, r) { return v >= r[0] && v <= r[1]; }
  function classify(score, meta) {
    if (inRange(score, meta.normal)) return meta.isStrength ? 'จุดแข็ง' : 'ปกติ';
    if (inRange(score, meta.risk)) return 'เสี่ยง';
    return meta.isStrength ? 'ไม่มีจุดแข็ง' : 'มีปัญหา';
  }
  function classifyTotal(score) {
    if (inRange(score, TOTAL_META.normal)) return 'ปกติ';
    if (inRange(score, TOTAL_META.risk)) return 'เสี่ยง';
    return 'มีปัญหา';
  }
  function groupCls(g) {
    if (g === 'ปกติ' || g === 'จุดแข็ง') return 'b-green';
    if (g === 'เสี่ยง') return 'b-amber';
    return 'b-red';
  }

  /* ส่วนเสริมด้านหลัง (ผลกระทบ) — ไม่บังคับ */
  const IMPACT_SCALE = { 'ไม่เลย': 0, 'เล็กน้อย': 0, 'ค่อนข้างมาก': 1, 'มาก': 2 };
  function classifyImpact(score) {
    if (score <= 0) return 'ปกติ';
    if (score <= 2) return 'เสี่ยง';
    return 'มีปัญหา';
  }

  /** คิดคะแนนทั้งหมดจากคำตอบ */
  function sdqCompute(data) {
    const ans = (data && data.answers) || {};
    const domainScore = { emotional: 0, conduct: 0, hyper: 0, peer: 0, prosocial: 0 };
    const answeredCount = { emotional: 0, conduct: 0, hyper: 0, peer: 0, prosocial: 0 };
    SDQ_ITEMS.forEach(it => {
      const raw = ans[it.id];
      if (raw === undefined || raw === null || raw === '') return;
      const idx = Number(raw);
      if (!(idx >= 0 && idx <= 2)) return;
      const score = it.reverse ? (2 - idx) : idx;
      domainScore[it.domain] += score;
      answeredCount[it.domain]++;
    });
    const totalAnswered = Object.values(answeredCount).reduce((a, b) => a + b, 0);
    const totalDiff = DIFF_DOMAINS.reduce((a, d) => a + domainScore[d], 0);
    const groups = {};
    Object.keys(DOMAIN_META).forEach(d => { groups[d] = classify(domainScore[d], DOMAIN_META[d]); });
    const totalGroup = classifyTotal(totalDiff);

    // ผลกระทบ (ด้านหลัง) — ถ้าตอบ
    let impactScore = null, impactGroup = null;
    if (data && data.overall && data.overall !== '1') {
      const distress = IMPACT_SCALE[data.distress] || 0;
      const areas = ['home', 'friends', 'classroom', 'leisure'];
      let sum = distress;
      areas.forEach(a => { sum += IMPACT_SCALE[(data.impact || {})[a]] || 0; });
      impactScore = sum;
      impactGroup = classifyImpact(sum);
    }

    return {
      domainScore, answeredCount, totalAnswered, totalDiff, groups, totalGroup,
      complete: totalAnswered >= 25,
      impactScore, impactGroup
    };
  }

  /* ══════════ 2) เข้าถึง/บันทึกข้อมูล ══════════ */
  function sdqTerm() { return (typeof Term === 'object' && Term.active) ? Term.active() : '1/2568'; }
  function sdqGradeGuess(term) { return (typeof gradeFromTerm === 'function') ? (gradeFromTerm(term) || '') : ''; }

  function sdqBucket(student, term, create) {
    if (!student.sdq || typeof student.sdq !== 'object') student.sdq = {};
    if (!student.sdq[term]) {
      if (!create) return null;
      student.sdq[term] = { grade: sdqGradeGuess(term), term, evaluator: '', date: '', answers: {}, overall: '', duration: '', distress: '', impact: {}, __touched: false, submittedAt: '' };
    }
    return student.sdq[term];
  }

  const _sdqDebounced = (function () {
    let t = null;
    return function (fn, wait) {
      clearTimeout(t); t = setTimeout(fn, wait || 500);
    };
  })();
  function sdqPersist() {
    _sdqDebounced(function () {
      try { saveToStorage(); } catch (e) { console.warn('sdqPersist save error', e); }
    }, 500);
  }

  /* ══════════ 3) เปิด/ปิด การใช้งานฟอร์ม (ครู/แอดมิน) ══════════ */
  const SDQ_LS_ACCESS = 'dltv_sdq_form_access';
  let _sdqOpen = null;
  function sdqIsStaff() { return !window.STUDENT_MODE; }
  function sdqFsdb() {
    try { if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) return firebase.firestore(); } catch (e) {}
    return null;
  }
  function sdqGetOpen() {
    if (_sdqOpen !== null) return _sdqOpen;
    let v = null;
    try { v = localStorage.getItem(SDQ_LS_ACCESS); } catch (e) {}
    _sdqOpen = v !== 'closed';
    return _sdqOpen;
  }
  function sdqSetOpen(open) {
    if (!sdqIsStaff()) return;
    _sdqOpen = !!open;
    try { localStorage.setItem(SDQ_LS_ACCESS, open ? 'open' : 'closed'); } catch (e) {}
    const db = sdqFsdb();
    if (db) {
      db.collection('settings').doc('sdqFormAccess')
        .set({ open: !!open, at: new Date().toISOString() }, { merge: true })
        .catch(e => console.warn('ตั้งสิทธิ์ SDQ บนคลาวด์ไม่สำเร็จ:', e.message));
    }
    if (typeof showStatus === 'function') showStatus((open ? '🔓 เปิด' : '🔒 ปิด') + 'การใช้งานแบบประเมิน SDQ แล้ว', open ? 'success' : 'error');
    sdqRerender();
  }
  async function sdqPullOpen() {
    const db = sdqFsdb(); if (!db) return;
    try {
      const d = await db.collection('settings').doc('sdqFormAccess').get();
      if (d.exists) {
        _sdqOpen = d.data().open !== false;
        try { localStorage.setItem(SDQ_LS_ACCESS, _sdqOpen ? 'open' : 'closed'); } catch (e) {}
        sdqRerender();
      }
    } catch (e) { /* ยังไม่มี settings หรือไม่มีสิทธิ์ */ }
  }
  function sdqRerender() {
    const p1 = document.getElementById('page-sdqform');
    if (p1 && p1.classList.contains('active')) sdqRenderFormPage();
    const p2 = document.getElementById('page-sdqdashboard');
    if (p2 && p2.classList.contains('active')) sdqRenderDashboard();
  }

  /* ══════════ 4) STATE ของหน้ากรอก ══════════ */
  const sdqState = { studentIdx: null, term: null, search: '' };

  function sdqStudents() { return DB.students || []; }

  window.sdqRenderFormPage = function () {
    const host = document.getElementById('sdq-root');
    if (!host) return;
    if (!sdqState.term || !sdqIsStaff()) sdqState.term = sdqTerm();   // v31: นักเรียนใช้ภาคเรียนที่ผู้ดูแลกำหนดเสมอ

    // บัญชีนักเรียน: DB.students มีแค่ระเบียนของตัวเองเสมอ (กรองมาแล้วจากชั้น Firestore)
    // ข้ามหน้าเลือกนักเรียน แล้วเปิดแบบประเมินของตัวเองตรงๆ
    if (!sdqIsStaff() && sdqState.studentIdx === null && sdqStudents().length) {
      sdqState.studentIdx = 0;
    }

    if (sdqState.studentIdx === null) {
      host.innerHTML = sdqPickerHtml();
      sdqBindPickerEvents(host);
      return;
    }
    host.innerHTML = sdqEditorHtml();
    sdqBindEditorEvents(host);
  };

  /* ══════════ v37: หน้าแบบประเมิน SDQ รูปแบบใหม่ ══════════
     • หน้าแรก: แถบความคืบหน้าการส่งผล + ตัวกรอง (ทั้งหมด/ยังไม่ส่ง/ส่งแล้ว) + รายชื่อแบบการ์ด
     • หน้ากรอก: ข้อคำถามแบบการ์ด ปุ่มคำตอบมีข้อความ (ไม่จริง/ค่อนข้างจริง/จริง) กดง่ายบนมือถือ
       + แผงผลการประเมินแบบสด (คะแนนรวม 4 ด้านพร้อมแถบเกณฑ์ + ผลรายด้าน)
       + แถบล่าง "ตอบแล้ว x/25" และปุ่ม "บันทึกและส่งผล"
     • บันทึกแล้ว → บันทึกขึ้นคลาวด์จริง → กลับหน้าแรก + สรุปผลในกล่องกลางจอ */
  const termLabelOf = t => (typeof Term === 'object' && Term.label) ? Term.label(t) : t;
  const DOMAIN_ORDER = ['emotional', 'conduct', 'hyper', 'peer', 'prosocial'];
  const sentWhen = iso => (typeof Term === 'object' && Term.sentLabel) ? Term.sentLabel(iso) : 'ส่งแล้ว';
  const gKey = g => (g === 'ปกติ' || g === 'จุดแข็ง') ? 'ok' : g === 'เสี่ยง' ? 'risk' : 'prob';
  function avatar(s) {
    if (typeof photoEl === 'function') return `<span class="sq2-avwrap">${photoEl(s, 'sq2-av', 'sq2-av sq2-av-txt')}</span>`;
    return `<span class="sq2-avwrap"><span class="sq2-av sq2-av-txt">${sdqEsc(String(s.name || '?').slice(0, 1))}</span></span>`;
  }
  if (!('pick' in sdqState)) sdqState.pick = 'all';

  function sdqPickerHtml() {
    const open = sdqGetOpen();
    const term = sdqState.term;
    const all = sdqStudents().map((s, idx) => {
      const b = (s.sdq && s.sdq[term]) || null;
      return { s, idx, b, sent: !!(b && b.submittedAt) };
    });
    const sent = all.filter(r => r.sent).length;
    const pct = all.length ? Math.round(sent / all.length * 100) : 0;
    const q = sdqState.search.trim().toLowerCase();
    const list = all
      .filter(r => sdqState.pick === 'all' || (sdqState.pick === 'sent' ? r.sent : !r.sent))
      .filter(r => !q || (r.s.name || '').toLowerCase().includes(q) || (r.s.school_m1 || '').toLowerCase().includes(q) || String(r.s.no) === q)
      .sort((a, b) => (a.s.no || 0) - (b.s.no || 0));
    const chip = (k, t, n) => `<button type="button" class="sq2-chip ${sdqState.pick === k ? 'on' : ''}" data-sq2-pick="${k}" aria-pressed="${sdqState.pick === k}">${t} <b>${n}</b></button>`;
    const termCtrl = sdqIsStaff()
      ? `<select id="sdq-term-select" class="sq2-select" aria-label="ภาคเรียน">${(typeof Term === 'object' && Term.options) ? Term.options(Term.all(), term) : `<option>${sdqEsc(term)}</option>`}</select>`
      : `<span class="tm-term-fixed">${sdqEsc(termLabelOf(term))}</span>`;
    return `<div class="sq2">
      <header class="sq2-head">
        <div><h2>แบบประเมิน SDQ</h2><p>ฉบับครูเป็นผู้ประเมิน · 25 ข้อ · ${sdqEsc(termLabelOf(term))}</p></div>
        <div class="sq2-head-tools">${termCtrl}
          ${sdqIsStaff() ? `<button class="sq2-btn ${open ? '' : 'sq2-btn-primary'}" id="sdq-toggle-btn">${open ? '🔒 ปิดรับการประเมิน' : '🔓 เปิดรับการประเมิน'}</button>
            <button class="sq2-btn sq2-btn-danger" id="sdq-clear-term-btn" title="ล้างแบบประเมินของทุกคนในภาคเรียนนี้ (เช่น ข้อมูลทดสอบ)">🗑️ ล้างผลทั้งภาคเรียน</button>` : ''}</div>
      </header>
      ${!open && sdqIsStaff() ? `<div class="sq2-banner">ฟอร์ม SDQ ปิดรับอยู่ — ครูท่านอื่นและนักเรียนกรอกไม่ได้ (คุณยังดู/แก้ไขได้ในฐานะผู้ดูแล)</div>` : ''}
      <section class="sq2-card sq2-progress">
        <div class="sq2-progress-num"><b>${sent}</b> / ${all.length} คน</div>
        <div class="sq2-progress-main">
          <div class="sq2-progress-lbl">ส่งผลการประเมินแล้ว ${pct}%</div>
          <div class="sq2-meter"><span style="width:${pct}%"></span></div>
        </div>
      </section>
      <section class="sq2-card sq2-listcard">
        <div class="sq2-tools">
          <div class="sq2-chips">${chip('all', 'ทั้งหมด', all.length)}${chip('todo', 'ยังไม่ส่ง', all.length - sent)}${chip('sent', 'ส่งแล้ว', sent)}</div>
          <input type="search" id="sdq-search" class="sq2-search" placeholder="ค้นหาชื่อนักเรียน โรงเรียน หรือลำดับ" value="${sdqEsc(sdqState.search)}">
        </div>
        <ul class="sq2-plist">${list.map(sdqPickerRow).join('') || `<li class="sq2-empty">ไม่พบนักเรียนตามเงื่อนไขนี้</li>`}</ul>
      </section>
    </div>`;
  }

  function sdqPickerRow(r) {
    const { s, idx, b, sent } = r;
    const res = b ? sdqCompute(b) : null;
    const status = sent
      ? `<span class="sq2-st is-sent">✓ ${sdqEsc(sentWhen(b.submittedAt))}</span>${res && res.complete ? `<span class="sq2-g g-${gKey(res.totalGroup)}">${res.totalGroup} · ${res.totalDiff} คะแนน</span>` : ''}`
      : `<span class="sq2-st is-wait">ยังไม่ส่ง</span>${b && b.__touched && res ? `<span class="sq2-draft">มีร่างที่บันทึกไว้ ${res.totalAnswered}/25 ข้อ</span>` : ''}`;
    const btn = sent ? 'แก้ไข' : (b && b.__touched ? 'ทำต่อ' : 'เริ่มประเมิน');
    return `<li class="sq2-prow">
      <span class="sq2-no">${sdqEsc(s.no ?? '')}</span>
      ${avatar(s)}
      <div class="sq2-pwho"><b>${sdqEsc(s.name || '')}</b><span>${sdqEsc(s.school_m1 || '-')}${s.nickname ? ' · ' + sdqEsc(s.nickname) : ''}</span></div>
      <div class="sq2-pstatus">${status}</div>
      <div class="sq2-rowact">
        ${sdqIsStaff() && b ? `<button type="button" class="sq2-btn sq2-icon-btn" data-sdq-clear="${idx}" title="ล้างข้อมูลแบบประเมินของคนนี้" aria-label="ล้างข้อมูลแบบประเมินของ ${sdqEsc(s.name || '')}">🗑️</button>` : ''}
        <button type="button" class="sq2-btn ${sent ? '' : 'sq2-btn-primary'}" data-sdq-open="${idx}">${btn}</button>
      </div>
    </li>`;
  }

  function sdqBindPickerEvents(host) {
    const term = document.getElementById('sdq-term-select');
    if (term) term.onchange = () => { sdqState.term = term.value; sdqRenderFormPage(); };
    const search = document.getElementById('sdq-search');
    if (search) search.oninput = () => {
      sdqState.search = search.value;
      const pos = search.selectionStart;
      sdqRenderFormPage();
      const s2 = document.getElementById('sdq-search');
      if (s2) { s2.focus(); s2.setSelectionRange(pos, pos); }
    };
    const toggle = document.getElementById('sdq-toggle-btn');
    if (toggle) toggle.onclick = () => sdqSetOpen(!sdqGetOpen());
    const clearAll = document.getElementById('sdq-clear-term-btn');
    if (clearAll) clearAll.onclick = () => sdqClearTerm();
    host.querySelectorAll('[data-sq2-pick]').forEach(b => { b.onclick = () => { sdqState.pick = b.getAttribute('data-sq2-pick'); sdqRenderFormPage(); }; });
    host.querySelectorAll('[data-sdq-clear]').forEach(btn => {
      btn.onclick = () => sdqClear(sdqStudents()[Number(btn.getAttribute('data-sdq-clear'))]);
    });
    host.querySelectorAll('[data-sdq-open]').forEach(btn => {
      btn.onclick = () => { sdqState.studentIdx = Number(btn.getAttribute('data-sdq-open')); sdqRenderFormPage(); const m = document.querySelector('.main'); if (m) m.scrollTop = 0; };
    });
  }

  /* ---------- แผงผลการประเมิน (อัปเดตสด) ---------- */
  function sdqResultHtml(res) {
    const pos = Math.min(100, res.totalDiff / 40 * 100);
    const total = res.complete
      ? `<div class="sq2-total">
          <div class="sq2-total-top"><span class="sq2-total-num">${res.totalDiff}</span><span class="sq2-total-of">/ 40 คะแนน</span>
            <span class="sq2-g g-${gKey(res.totalGroup)}">${res.totalGroup}</span></div>
          <div class="sq2-gauge" aria-hidden="true"><span class="z ok" style="width:40%"></span><span class="z risk" style="width:5%"></span><span class="z prob" style="width:55%"></span>
            <i style="left:${pos}%"></i></div>
          <div class="sq2-gauge-lbl"><span>ปกติ 0–15</span><span>เสี่ยง 16–17</span><span>มีปัญหา 18–40</span></div>
        </div>`
      : `<div class="sq2-total is-wait"><b>ตอบแล้ว ${res.totalAnswered} จาก 25 ข้อ</b><span>ตอบให้ครบเพื่อดูผลรวม 4 ด้าน</span>
          <div class="sq2-meter"><span style="width:${res.totalAnswered / 25 * 100}%"></span></div></div>`;
    const doms = DOMAIN_ORDER.map(d => {
      const m = DOMAIN_META[d], sc = res.domainScore[d], g = res.groups[d];
      const answered = res.answeredCount[d] >= 5;
      return `<li class="sq2-dom">
        <div class="sq2-dom-top"><span>${sdqEsc(m.short)}${m.isStrength ? ' <small>(จุดแข็ง)</small>' : ''}</span>
          ${answered ? `<span class="sq2-g g-${gKey(g)}">${g}</span>` : `<span class="sq2-g g-na">รอคำตอบ</span>`}</div>
        <div class="sq2-dom-bar"><span class="${answered ? 'g-' + gKey(g) : 'g-na'}" style="width:${sc * 10}%"></span></div>
        <div class="sq2-dom-score">${sc} / 10</div>
      </li>`;
    }).join('');
    return `<h3 class="sq2-side-title">ผลการประเมิน</h3><p class="sq2-side-sub">คำนวณอัตโนมัติตามเกณฑ์ SDQ ฉบับครู</p>
      ${total}<ul class="sq2-doms">${doms}</ul>`;
  }

  function sdqEditorHtml() {
    const student = sdqStudents()[sdqState.studentIdx];
    if (!student) { sdqState.studentIdx = null; return sdqPickerHtml(); }
    const open = sdqGetOpen();
    const locked = !open && sdqIsStaff() === false;
    const data = sdqBucket(student, sdqState.term, true);
    const res = sdqCompute(data);
    const dis = locked ? 'disabled' : '';
    const qs = SDQ_ITEMS.map(it => {
      const cur = data.answers[it.id];
      const has = cur !== undefined && cur !== null && cur !== '';
      return `<li class="sq2-q ${has ? 'is-done' : ''}" id="sq2-q-${it.id}">
        <span class="sq2-q-no">${it.id}</span>
        <div class="sq2-q-text">${sdqEsc(it.text)}</div>
        <div class="sq2-seg" role="radiogroup" aria-label="ข้อ ${it.id}">
          ${CHOICES.map((c, i) => `<label class="sq2-opt o${i}"><input type="radio" name="sdq-item-${it.id}" data-sdq-item="${it.id}" value="${i}" ${has && Number(cur) === i ? 'checked' : ''} ${dis}><span>${c}</span></label>`).join('')}
        </div>
      </li>`;
    }).join('');
    const hasData = !!(data.submittedAt || res.totalAnswered || data.overall || data.evaluator || data.grade);
    const showImpact = data.overall && data.overall !== '1';
    const impactAreas = [['home', 'ความเป็นอยู่ที่บ้าน'], ['friends', 'การคบเพื่อน'], ['classroom', 'การเรียนในห้องเรียน'], ['leisure', 'กิจกรรมยามว่าง']];
    const opt = (list, cur) => list.map(o => `<option value="${o}" ${cur === o ? 'selected' : ''}>${o || '— ยังไม่ระบุ —'}</option>`).join('');
    const sentNote = data.submittedAt ? `<span class="sq2-st is-sent">✓ ${sdqEsc(sentWhen(data.submittedAt))}</span>` : `<span class="sq2-st is-wait">ยังไม่ส่ง</span>`;
    return `<div class="sq2 sq2-editor">
      <header class="sq2-ed-head">
        ${sdqIsStaff() ? `<button type="button" class="sq2-btn sq2-back" id="sdq-back-btn">← รายชื่อ</button>` : ''}
        ${avatar(student)}
        <div class="sq2-ed-who"><h2>${sdqEsc(student.name || '')}</h2>
          <p>${sdqEsc(student.school_m1 || '-')} · ${sdqEsc(termLabelOf(sdqState.term))} ${sentNote}</p></div>
        <div class="sq2-ed-tools">
          ${!locked && hasData ? `<button type="button" class="sq2-btn sq2-btn-danger" id="sdq-clear-btn" title="ลบคำตอบและผลการประเมินของภาคเรียนนี้">🗑️ ล้างข้อมูล</button>` : ''}
          <button type="button" class="sq2-btn" id="sdq-print-btn">🖨️ พิมพ์ / PDF</button>
        </div>
      </header>
      ${!sdqIsStaff() ? `<div class="sq2-note">นักเรียนเห็นเฉพาะแบบประเมินและผลของตัวเองเท่านั้น</div>` : ''}
      ${locked ? `<div class="sq2-banner">ฟอร์มนี้ปิดรับอยู่ ไม่สามารถกรอกหรือแก้ไขได้ในขณะนี้</div>` : ''}

      <section class="sq2-card sq2-meta">
        <label>ระดับชั้น<input type="text" id="sdq-f-grade" value="${sdqEsc(data.grade || '')}" placeholder="เช่น ม.1/1" ${dis}></label>
        <label>ภาคเรียน<input type="text" value="${sdqEsc(sdqState.term)}" readonly tabindex="-1" class="is-ro"></label>
        <label>ผู้ประเมิน (ครู)<input type="text" id="sdq-f-evaluator" value="${sdqEsc(data.evaluator || '')}" placeholder="ชื่อ-สกุลครูผู้ประเมิน" ${dis}></label>
        <label>วันที่ประเมิน<input type="date" id="sdq-f-date" value="${sdqEsc((typeof normDateISO === 'function' ? normDateISO(data.date) : data.date) || '')}" ${dis}></label>
      </section>

      <div class="sq2-layout">
        <section class="sq2-card sq2-qs">
          <div class="sq2-qs-head">
            <div><h3>ข้อคำถาม 25 ข้อ</h3><p>เลือกคำตอบที่ตรงกับพฤติกรรมของนักเรียนในช่วง 6 เดือนที่ผ่านมา</p></div>
            <div class="sq2-count"><b id="sq2-count">${res.totalAnswered}</b>/25<div class="sq2-meter sm"><span id="sq2-count-bar" style="width:${res.totalAnswered / 25 * 100}%"></span></div></div>
          </div>
          <ol class="sq2-qlist">${qs}</ol>
        </section>
        <aside class="sq2-side"><div class="sq2-card sq2-result" id="sq2-result">${sdqResultHtml(res)}</div></aside>
      </div>

      <details class="sq2-card sq2-impact" ${data.overall ? 'open' : ''}>
        <summary><span>ส่วนเสริม: ผลกระทบต่อชีวิตประจำวัน</span><small>ไม่บังคับ</small></summary>
        <div class="sq2-impact-body">
          <label>โดยรวมแล้ว นักเรียนมีปัญหาด้านอารมณ์ สมาธิ พฤติกรรม หรือความสามารถเข้ากับผู้อื่นหรือไม่
            <select id="sdq-f-overall" ${dis}>
              <option value="">— ยังไม่ระบุ —</option>
              ${[['1', 'ไม่'], ['2', 'ใช่ มีปัญหาเล็กน้อย'], ['3', 'ใช่ มีปัญหาชัดเจน'], ['4', 'ใช่ มีปัญหาอย่างมาก']].map(([v, t]) => `<option value="${v}" ${data.overall === v ? 'selected' : ''}>${v}. ${t}</option>`).join('')}
            </select></label>
          <div id="sdq-impact-detail" class="sq2-impact-grid" style="display:${showImpact ? '' : 'none'}">
            <label>ปัญหานี้ทำให้นักเรียนรู้สึกไม่สบายใจหรือไม่<select id="sdq-f-distress" ${dis}>${opt(['', 'ไม่เลย', 'เล็กน้อย', 'ค่อนข้างมาก', 'มาก'], data.distress)}</select></label>
            ${impactAreas.map(([k, lbl]) => `<label>รบกวนด้าน "${lbl}"<select data-sdq-impact="${k}" ${dis}>${opt(['', 'ไม่เลย', 'เล็กน้อย', 'ค่อนข้างมาก', 'มาก'], (data.impact || {})[k])}</select></label>`).join('')}
            <div class="sq2-impact-sum" id="sq2-impact-sum">${res.impactGroup ? `สรุปผลกระทบ: <span class="sq2-g g-${gKey(res.impactGroup)}">${res.impactGroup}</span> (คะแนน ${res.impactScore})` : ''}</div>
          </div>
        </div>
      </details>

      <div class="sq2-actionbar">
        <div class="sq2-action-status"><span id="sdq-save-status">ระบบบันทึกร่างให้อัตโนมัติระหว่างกรอก</span></div>
        <button type="button" class="sq2-btn sq2-btn-primary sq2-btn-lg" id="sdq-submit-btn" ${dis}>💾 บันทึกและส่งผลการประเมิน</button>
      </div>
    </div>`;
  }

  function sdqBindEditorEvents(host) {
    const student = sdqStudents()[sdqState.studentIdx];
    const back = document.getElementById('sdq-back-btn');
    if (back) back.onclick = () => { sdqState.studentIdx = null; sdqRenderFormPage(); };
    const printBtn = document.getElementById('sdq-print-btn');
    if (printBtn) printBtn.onclick = () => sdqPrintCurrent();
    function data() { return sdqBucket(student, sdqState.term, true); }
    function touched() { data().__touched = true; sdqPersist(); }
    ['grade', 'evaluator', 'date'].forEach(f => {
      const el = document.getElementById('sdq-f-' + f);
      if (el) el.oninput = () => { data()[f] = el.value; touched(); };
    });
    host.querySelectorAll('[data-sdq-item]').forEach(inp => {
      inp.onchange = () => {
        data().answers[Number(inp.getAttribute('data-sdq-item'))] = Number(inp.value);
        touched();
        const li = inp.closest('.sq2-q');
        if (li) { li.classList.add('is-done'); li.classList.remove('is-missing'); li.classList.remove('sq2-pop'); void li.offsetWidth; li.classList.add('sq2-pop'); }
        sdqRefreshResultInline(host, data());
      };
    });
    const overall = document.getElementById('sdq-f-overall');
    if (overall) overall.onchange = () => {
      data().overall = overall.value; touched();
      const det = document.getElementById('sdq-impact-detail');
      if (det) det.style.display = overall.value && overall.value !== '1' ? '' : 'none';
      sdqRefreshResultInline(host, data());
    };
    const distress = document.getElementById('sdq-f-distress');
    if (distress) distress.onchange = () => { data().distress = distress.value; touched(); sdqRefreshResultInline(host, data()); };
    host.querySelectorAll('[data-sdq-impact]').forEach(sel => {
      sel.onchange = () => { const d = data(); if (!d.impact) d.impact = {}; d.impact[sel.getAttribute('data-sdq-impact')] = sel.value; touched(); sdqRefreshResultInline(host, d); };
    });
    const submitBtn = document.getElementById('sdq-submit-btn');
    if (submitBtn) submitBtn.onclick = () => sdqSubmit(student);
    const clearBtn = document.getElementById('sdq-clear-btn');
    if (clearBtn) clearBtn.onclick = () => sdqClear(student);
  }

  /* ---------- v44: ล้างข้อมูลแบบประเมิน (ทั้งร่างและผลที่ส่งแล้ว) ---------- */
  async function clearBucket(student, term) {
    if (student.sdq && student.sdq[term]) delete student.sdq[term];
    let r = { ok: true };
    if (typeof window.fbDeleteField === 'function') r = await window.fbDeleteField(student, 'sdq', term);
    if (r && r.ok === false) throw (r.error || new Error('ลบบนคลาวด์ไม่สำเร็จ'));
    if (typeof window.fbSaveNow === 'function') await window.fbSaveNow(); else saveToStorage();
  }
  async function sdqClear(student) {
    const term = sdqState.term;
    const d = (student.sdq && student.sdq[term]) || {};
    const res = sdqCompute(sdqBucket(student, term, true));
    if (!window.UIDialog) return;
    UIDialog.confirm({
      tone: 'danger', title: 'ล้างข้อมูลแบบประเมิน SDQ?',
      message: 'คำตอบทั้ง 25 ข้อ ผู้ประเมิน วันที่ และผลการประเมินของภาคเรียนนี้จะถูกลบ และกู้คืนไม่ได้\nสถานะจะกลับเป็น "ยังไม่ส่ง"',
      details: [{ label: 'นักเรียน', value: student.name || '-' }, { label: 'ภาคเรียน', value: termLabelOf(term) },
                { label: 'ข้อมูลที่มี', value: (d.submittedAt ? 'ส่งผลแล้ว · ' : 'ร่าง · ') + res.totalAnswered + '/25 ข้อ' }],
      confirmText: 'ล้างข้อมูล', workingText: 'กำลังล้างข้อมูล…',
      onConfirm: async () => {
        await clearBucket(student, term);
        sdqRenderFormPage();
        return { title: 'ล้างข้อมูลแล้ว', message: 'แบบประเมินของ ' + (student.name || '') + ' ภาคเรียน ' + term + ' ว่างแล้ว เริ่มประเมินใหม่ได้ทันที' };
      }
    });
  }
  // ผู้ดูแล: ล้างผล SDQ ของทุกคนในภาคเรียนที่เลือก (ใช้ล้างข้อมูลทดสอบ) — ต้องพิมพ์ภาคเรียนยืนยัน
  async function sdqClearTerm() {
    const term = sdqState.term;
    const list = sdqStudents().filter(s => s.sdq && s.sdq[term]);
    if (!list.length) { UIDialog.alert({ tone: 'info', title: 'ไม่มีข้อมูลให้ล้าง', message: 'ภาคเรียน ' + term + ' ยังไม่มีแบบประเมิน SDQ' }); return; }
    const typed = await UIDialog.prompt({
      tone: 'danger', icon: 'danger', title: 'ล้างผล SDQ ทั้งภาคเรียน?',
      message: 'แบบประเมินของนักเรียน ' + list.length + ' คนในภาคเรียน ' + term + ' (ทั้งร่างและที่ส่งแล้ว) จะถูกลบ และกู้คืนไม่ได้\n\nพิมพ์ ' + term + ' เพื่อยืนยัน',
      placeholder: term, confirmText: 'ล้างทั้งหมด',
      validate: v => v === term ? '' : 'พิมพ์ ' + term + ' ให้ตรงเพื่อยืนยัน'
    });
    if (typed !== term) return;
    const close = UIDialog.busy ? UIDialog.busy('กำลังล้างผล SDQ ' + list.length + ' คน…') : () => {};
    let fail = 0;
    for (const s of list) {
      if (s.sdq) delete s.sdq[term];
      if (typeof window.fbDeleteField === 'function') { const r = await window.fbDeleteField(s, 'sdq', term); if (r && r.ok === false) fail++; }
    }
    try { if (typeof window.fbSaveNow === 'function') await window.fbSaveNow(); else saveToStorage(); } catch (e) {}
    close();
    sdqRenderFormPage();
    UIDialog.alert(fail ? { tone: 'warning', title: 'ล้างได้บางส่วน', message: 'ล้างสำเร็จ ' + (list.length - fail) + ' คน · ไม่สำเร็จ ' + fail + ' คน (ตรวจอินเทอร์เน็ต/สิทธิ์ แล้วลองอีกครั้ง)' }
      : { tone: 'success', title: 'ล้างผล SDQ แล้ว', message: 'ล้างแบบประเมินภาคเรียน ' + term + ' ของนักเรียน ' + list.length + ' คนเรียบร้อย' });
  }

  function sdqRefreshResultInline(host, data) {
    const res = sdqCompute(data);
    const box = document.getElementById('sq2-result');
    if (box) box.innerHTML = sdqResultHtml(res);
    const c = document.getElementById('sq2-count'); if (c) c.textContent = res.totalAnswered;
    const bar = document.getElementById('sq2-count-bar'); if (bar) bar.style.width = (res.totalAnswered / 25 * 100) + '%';
    const imp = document.getElementById('sq2-impact-sum');
    if (imp) imp.innerHTML = res.impactGroup ? `สรุปผลกระทบ: <span class="sq2-g g-${gKey(res.impactGroup)}">${res.impactGroup}</span> (คะแนน ${res.impactScore})` : '';
  }

  /* ---------- บันทึกและส่งผล → กลับหน้าแรก ---------- */
  let _sqSaving = false;
  async function sdqSubmit(student) {
    if (_sqSaving || !student) return;
    const d = sdqBucket(student, sdqState.term, true);
    const res = sdqCompute(d);
    const tell = o => (window.UIDialog ? UIDialog.alert(o) : (typeof showStatus === 'function' && showStatus(o.title, o.tone === 'success' ? 'success' : 'error')));
    if (!res.complete) {
      const missing = SDQ_ITEMS.filter(it => { const v = d.answers[it.id]; return v === undefined || v === null || v === ''; }).map(it => it.id);
      document.querySelectorAll('.sq2-q').forEach(li => li.classList.remove('is-missing'));
      missing.forEach(id => { const li = document.getElementById('sq2-q-' + id); if (li) li.classList.add('is-missing'); });
      const first = document.getElementById('sq2-q-' + missing[0]);
      tell({ tone: 'warning', title: `ยังตอบไม่ครบ (เหลือ ${missing.length} ข้อ)`,
        message: 'ข้อที่ยังไม่ได้ตอบมีกรอบสีส้ม ระบบจะพาไปที่ข้อแรกที่ยังว่าง',
        details: [{ label: 'ข้อที่ยังไม่ตอบ', value: missing.slice(0, 12).join(', ') + (missing.length > 12 ? ' …' : '') }] })
        .then(() => { if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      return;
    }
    _sqSaving = true;
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
    const close = window.UIDialog && UIDialog.busy ? UIDialog.busy('กำลังบันทึกผลการประเมิน SDQ…') : () => {};
    const prevAt = d.submittedAt;
    d.submittedAt = new Date().toISOString();
    d.__touched = true;
    let note = '';
    try {
      let r;
      const timeout = new Promise(ok => setTimeout(() => ok({ timeout: true }), 15000));
      if (typeof window.fbSaveNow === 'function') r = await Promise.race([window.fbSaveNow(), timeout]);
      else { await saveToStorage(); r = { ok: true }; }
      if (r && r.timeout) note = 'บันทึกไว้ในเครื่องแล้ว กำลังรอส่งขึ้นคลาวด์ (อินเทอร์เน็ตช้า) ระบบจะส่งให้อัตโนมัติ';
      else if (r && r.ok === false) throw (r.error || new Error('บันทึกขึ้นคลาวด์ไม่สำเร็จ'));
    } catch (e) {
      d.submittedAt = prevAt || '';
      close(); _sqSaving = false;
      tell({ tone: 'danger', title: 'บันทึกไม่สำเร็จ', message: 'คำตอบยังอยู่ในหน้านี้ ตรวจสอบอินเทอร์เน็ตแล้วกดบันทึกอีกครั้ง\n\nรายละเอียด: ' + ((e && (e.code || e.message)) || e) });
      return;
    }
    close(); _sqSaving = false;
    const name = student.name || '';
    const term = sdqState.term;
    sdqState.studentIdx = null;
    if (sdqIsStaff()) {
      sdqRenderFormPage();
    } else {
      showPage('scholarform', document.querySelector('.nav-btn[onclick*="scholarform"]'));   // หน้าแรกของบัญชีนักเรียน
    }
    const m = document.querySelector('.main'); if (m) m.scrollTo({ top: 0, behavior: 'smooth' });
    tell({
      tone: note ? 'warning' : 'success',
      title: note ? 'บันทึกแล้ว (รอซิงก์ขึ้นคลาวด์)' : 'บันทึกและส่งผลการประเมินแล้ว',
      message: note || 'แก้ไขภายหลังได้ โดยเปิดแบบประเมินแล้วกดบันทึกอีกครั้ง',
      details: [
        { label: 'นักเรียน', value: name },
        { label: 'ภาคเรียน', value: termLabelOf(term) },
        { label: 'ผลรวม 4 ด้าน', value: `${res.totalGroup} (${res.totalDiff} คะแนน)` },
        { label: 'ส่งเมื่อ', value: sentWhen(d.submittedAt).replace(/^ส่งแล้ว\s*/, '') }
      ]
    });
  }

  function sdqEsc(s) { return (typeof sfEscapeHtml === 'function') ? sfEscapeHtml(s) : String(s == null ? '' : s); }

  /* ══════════ 5) Dashboard สรุปผล ══════════ */
  let _sdqCharts = {};

  /* มุมมองนักเรียน: การ์ดสีพาสเทลแยกตามด้าน แสดงเฉพาะผลของตัวเอง */
  function sdqRenderMyDashboard() {
    const staffView = document.getElementById('sdq-dash-staff-view');
    const myView = document.getElementById('sdq-dash-my-view');
    if (staffView) staffView.style.display = 'none';
    if (!myView) return;
    myView.style.display = '';

    const student = sdqStudents()[0];
    if (!student) {
      myView.innerHTML = `<div class="sdq-my-note">ไม่พบข้อมูลนักเรียน</div>`;
      return;
    }
    const term = sdqTerm();          // v31: นักเรียนดูผลของภาคเรียนที่ผู้ดูแลกำหนดเท่านั้น
    sdqState.term = term;
    const bucket = student.sdq && student.sdq[term];
    const res = bucket ? sdqCompute(bucket) : null;
    const domains = Object.keys(DOMAIN_META);

    let body;
    if (!bucket || !bucket.__touched) {
      body = `<div class="sdq-my-note">📋 ยังไม่มีผลการประเมิน SDQ ในภาคเรียนนี้ — ครูประจำชั้นจะเป็นผู้ประเมินให้</div>`;
    } else if (!res.complete) {
      body = `<div class="sdq-my-note">📝 ครูกำลังประเมินอยู่ (กรอกแล้ว ${res.totalAnswered}/25 ข้อ) — ผลสรุปจะแสดงเมื่อประเมินครบถ้วน</div>`;
    } else {
      body = `
        <div class="sdq-result-box">
          <div class="sdq-result-title">ผลการประเมิน — ${sdqEsc(student.name || '')} <span class="badge ${groupCls(res.totalGroup)}">รวม 4 ด้าน: ${res.totalGroup} (${res.totalDiff} คะแนน)</span></div>
          <div class="sdq-result-grid">
            ${domains.map(d => `
              <div class="sdq-result-card sdq-domain-${DOMAIN_META[d].color}">
                <div class="sdq-result-card-lbl">${DOMAIN_META[d].short}</div>
                <div class="sdq-result-card-val">${res.domainScore[d]}</div>
                <span class="badge ${groupCls(res.groups[d])}">${res.groups[d]}</span>
              </div>`).join('')}
          </div>
        </div>
        ${res.impactGroup ? `<div class="sdq-impact-box"><div class="sdq-result-title">ผลกระทบต่อชีวิตประจำวัน</div><span class="badge ${groupCls(res.impactGroup)}">${res.impactGroup}</span> (คะแนน ${res.impactScore})</div>` : ''}`;
    }

    myView.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-title">📈 ผลการประเมิน SDQ ของฉัน</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="tm-term-fixed" title="ภาคเรียนนี้กำหนดโดยผู้ดูแลระบบ">${typeof Term === 'object' ? Term.label(term) : term}</span>
          <button class="btn btn-sm" id="sdq-my-print-btn">🖨️ พิมพ์ / PDF</button>
        </div>
      </div>
      <div class="sdq-my-summary">${body}</div>`;

    const sel = document.getElementById('sdq-my-term');
    if (sel) sel.onchange = () => { sdqState.term = sel.value; sdqRenderMyDashboard(); };
    const printBtn = document.getElementById('sdq-my-print-btn');
    if (printBtn) printBtn.onclick = () => sdqPrintFor(student, term);
  }

  /* ══════════ v37: Dashboard สรุปผล SDQ รูปแบบใหม่ ══════════
     KPI 4 ใบ · ผลรายด้าน (แถบสัดส่วน) · กลุ่มรวม 4 ด้าน (โดนัท) · นักเรียนที่ควรติดตาม · ตารางพร้อมตัวกรอง
     นับเฉพาะแบบประเมินที่ "ส่งผลแล้ว" และตอบครบ 25 ข้อ (สอดคล้องกับสถานะ ส่งแล้ว/ยังไม่ส่ง) */
  if (!('dashQ' in sdqState)) { sdqState.dashQ = ''; sdqState.dashG = 'all'; }
  function sdqDashRows(term) {
    return sdqStudents().map((s, idx) => {
      const b = s.sdq && s.sdq[term];
      const res = b ? sdqCompute(b) : null;
      return { s, idx, b, res, done: !!(b && b.submittedAt && res && res.complete) };
    });
  }
  window.sdqRenderDashboard = function () {
    const host = document.getElementById('page-sdqdashboard');
    if (!host) return;
    if (!sdqState.term) sdqState.term = sdqTerm();
    if (!sdqIsStaff()) { sdqRenderMyDashboard(); return; }
    const view = document.getElementById('sdq-dash-staff-view');
    const myView = document.getElementById('sdq-dash-my-view');
    if (!view) return;
    view.style.display = ''; if (myView) myView.style.display = 'none';
    const term = sdqState.dashTerm || sdqState.term;
    const rows = sdqDashRows(term);
    const done = rows.filter(r => r.done);
    const N = rows.length, D = done.length;
    const cnt = { ok: 0, risk: 0, prob: 0 };
    done.forEach(r => cnt[gKey(r.res.totalGroup)]++);
    const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
    const kpi = (cls, label, val, sub, barPct) => `<div class="sq2-kpi k-${cls}">
        <div class="sq2-kpi-lbl">${label}</div>
        <div class="sq2-kpi-val">${val}</div>
        <div class="sq2-kpi-sub">${sub}</div>
        <div class="sq2-meter sm"><span style="width:${barPct}%"></span></div></div>`;

    // ผลรายด้าน
    const domRows = DOMAIN_ORDER.map(d => {
      const c = { ok: 0, risk: 0, prob: 0 };
      done.forEach(r => c[gKey(r.res.groups[d])]++);
      const m = DOMAIN_META[d];
      const seg = (k, lbl) => c[k] ? `<span class="seg g-${k}" style="flex:${c[k]}" title="${lbl} ${c[k]} คน">${c[k]}</span>` : '';
      return `<li class="sq2-drow">
        <div class="sq2-drow-lbl">${sdqEsc(m.short)}${m.isStrength ? '<small>จุดแข็ง</small>' : ''}</div>
        <div class="sq2-stack">${D ? seg('ok', m.isStrength ? 'มีจุดแข็ง' : 'ปกติ') + seg('risk', 'เสี่ยง') + seg('prob', m.isStrength ? 'ไม่มีจุดแข็ง' : 'มีปัญหา') : '<span class="seg g-na" style="flex:1">ยังไม่มีข้อมูล</span>'}</div>
        <div class="sq2-drow-n">${c.risk + c.prob ? `<b>${c.risk + c.prob}</b> คนต้องดูแล` : '<span class="ok">ไม่มี</span>'}</div>
      </li>`;
    }).join('');

    // โดนัท
    const a1 = D ? cnt.ok / D * 360 : 0, a2 = D ? (cnt.ok + cnt.risk) / D * 360 : 0;
    const donut = D
      ? `conic-gradient(var(--sq-ok) 0 ${a1}deg, var(--sq-risk) ${a1}deg ${a2}deg, var(--sq-prob) ${a2}deg 360deg)`
      : 'conic-gradient(#E2E8F0 0 360deg)';

    // นักเรียนที่ควรติดตาม
    const watch = done.filter(r => r.res.totalGroup !== 'ปกติ' || DIFF_DOMAINS.some(d => r.res.groups[d] === 'มีปัญหา'))
      .sort((a, b) => b.res.totalDiff - a.res.totalDiff);
    const watchHtml = watch.length ? watch.slice(0, 8).map(r => {
      const flags = DOMAIN_ORDER.filter(d => gKey(r.res.groups[d]) !== 'ok')
        .map(d => `<span class="sq2-g g-${gKey(r.res.groups[d])}">${sdqEsc(DOMAIN_META[d].short)}</span>`).join('');
      return `<li class="sq2-watch-row">
        ${avatar(r.s)}
        <div class="sq2-pwho"><b>${sdqEsc(r.s.name || '')}</b><span>${sdqEsc(r.s.school_m1 || '-')}</span></div>
        <div class="sq2-watch-flags"><span class="sq2-g g-${gKey(r.res.totalGroup)} strong">รวม ${r.res.totalDiff} · ${r.res.totalGroup}</span>${flags}</div>
        <div class="sq2-watch-act"><button type="button" class="sq2-btn" data-sq2-open="${r.idx}">ดูผล</button><button type="button" class="sq2-btn" data-sq2-print="${r.idx}">PDF</button></div>
      </li>`;
    }).join('') + (watch.length > 8 ? `<li class="sq2-more">และอีก ${watch.length - 8} คน — กรองตาราง "เสี่ยง" หรือ "มีปัญหา" ด้านล่าง</li>` : '')
      : `<li class="sq2-empty">${D ? 'ไม่มีนักเรียนในกลุ่มเสี่ยงหรือมีปัญหา' : 'ยังไม่มีผลการประเมินที่ส่งแล้วในภาคเรียนนี้'}</li>`;

    // ตาราง
    const q = sdqState.dashQ.trim().toLowerCase();
    const G = sdqState.dashG;
    const tRows = rows
      .filter(r => G === 'all' || (G === 'todo' ? !r.done : (r.done && gKey(r.res.totalGroup) === G)))
      .filter(r => !q || (r.s.name || '').toLowerCase().includes(q) || (r.s.school_m1 || '').toLowerCase().includes(q) || String(r.s.no) === q)
      .sort((a, b) => (a.s.no || 0) - (b.s.no || 0));
    const chip = (k, t, n) => `<button type="button" class="sq2-chip ${G === k ? 'on' : ''} c-${k}" data-sq2-g="${k}" aria-pressed="${G === k}">${t} <b>${n}</b></button>`;
    const body = tRows.map(r => {
      if (!r.done) return `<tr class="is-todo"><td class="n">${sdqEsc(r.s.no ?? '')}</td>
        <td><div class="sq2-tw">${avatar(r.s)}<div><b>${sdqEsc(r.s.name || '')}</b><span>${sdqEsc(r.s.school_m1 || '-')}</span></div></div></td>
        <td colspan="6"><span class="sq2-st is-wait">ยังไม่ส่งผล</span></td>
        <td class="act"><button type="button" class="sq2-btn sq2-btn-primary" data-sq2-open="${r.idx}">ประเมิน</button></td></tr>`;
      const res = r.res;
      return `<tr><td class="n">${sdqEsc(r.s.no ?? '')}</td>
        <td><div class="sq2-tw">${avatar(r.s)}<div><b>${sdqEsc(r.s.name || '')}</b><span>${sdqEsc(r.s.school_m1 || '-')}</span></div></div></td>
        ${DOMAIN_ORDER.map(d => `<td><span class="sq2-dchip g-${gKey(res.groups[d])}" title="${sdqEsc(DOMAIN_META[d].label)}: ${res.groups[d]}">${res.domainScore[d]}</span></td>`).join('')}
        <td><div class="sq2-tot"><span class="sq2-g g-${gKey(res.totalGroup)}">${res.totalGroup}</span><b>${res.totalDiff}</b><small>/40</small></div></td>
        <td class="act"><button type="button" class="sq2-btn" data-sq2-open="${r.idx}">แก้ไข</button><button type="button" class="sq2-btn" data-sq2-print="${r.idx}">PDF</button></td></tr>`;
    }).join('') || `<tr><td colspan="9" class="sq2-empty">ไม่พบนักเรียนตามเงื่อนไขนี้</td></tr>`;

    const focusSearch = document.activeElement && document.activeElement.id === 'sq2-dash-q' ? document.activeElement.selectionStart : null;
    view.innerHTML = `<div class="sq2 sq2-dash">
      <header class="sq2-head">
        <div><h2>สรุปผลการประเมิน SDQ</h2><p>${sdqEsc(termLabelOf(term))} · นับเฉพาะแบบประเมินที่ส่งผลแล้ว</p></div>
        <div class="sq2-head-tools">
          <select id="sdq-dash-term" class="sq2-select" aria-label="ภาคเรียน">${(typeof Term === 'object' && Term.options) ? Term.options(Term.all(), term) : `<option>${sdqEsc(term)}</option>`}</select>
          <button type="button" class="sq2-btn" data-sq2-csv>ส่งออก CSV</button>
        </div>
      </header>
      <section class="sq2-kpis">
        ${kpi('blue', 'ส่งผลแล้ว', `${D}<small>/${N}</small>`, `${pct(D, N)}% ของนักเรียนทั้งหมด · ยังไม่ส่ง ${N - D} คน`, pct(D, N))}
        ${kpi('ok', 'ปกติ', cnt.ok, `${pct(cnt.ok, D)}% ของผู้ที่ส่งผลแล้ว`, pct(cnt.ok, D))}
        ${kpi('risk', 'เสี่ยง', cnt.risk, `${pct(cnt.risk, D)}% · ควรเฝ้าระวัง`, pct(cnt.risk, D))}
        ${kpi('prob', 'มีปัญหา', cnt.prob, `${pct(cnt.prob, D)}% · ควรช่วยเหลือ/ส่งต่อ`, pct(cnt.prob, D))}
      </section>
      <section class="sq2-dash-grid">
        <div class="sq2-card">
          <div class="sq2-card-head"><h3>ผลรายด้าน</h3><p>สัดส่วนนักเรียนในแต่ละกลุ่ม จาก ${D} คนที่ส่งผลแล้ว</p></div>
          <ul class="sq2-drows">${domRows}</ul>
          <div class="sq2-legend"><span><i class="g-ok"></i>ปกติ / มีจุดแข็ง</span><span><i class="g-risk"></i>เสี่ยง</span><span><i class="g-prob"></i>มีปัญหา / ไม่มีจุดแข็ง</span></div>
        </div>
        <div class="sq2-card sq2-donut-card">
          <div class="sq2-card-head"><h3>กลุ่มรวม 4 ด้าน</h3><p>อารมณ์ · เกเร · สมาธิสั้น · เพื่อน</p></div>
          <div class="sq2-donut-wrap">
            <div class="sq2-donut" style="background:${donut}" role="img" aria-label="ปกติ ${cnt.ok} เสี่ยง ${cnt.risk} มีปัญหา ${cnt.prob}"><div><b>${D}</b><span>คน</span></div></div>
            <ul class="sq2-donut-legend">
              <li><i class="g-ok"></i>ปกติ<b>${cnt.ok}</b><small>${pct(cnt.ok, D)}%</small></li>
              <li><i class="g-risk"></i>เสี่ยง<b>${cnt.risk}</b><small>${pct(cnt.risk, D)}%</small></li>
              <li><i class="g-prob"></i>มีปัญหา<b>${cnt.prob}</b><small>${pct(cnt.prob, D)}%</small></li>
            </ul>
          </div>
        </div>
      </section>
      <section class="sq2-card sq2-watch">
        <div class="sq2-card-head"><h3>นักเรียนที่ควรติดตาม</h3><p>กลุ่มรวมเสี่ยง/มีปัญหา หรือมีปัญหาบางด้าน · เรียงจากคะแนนรวมมากไปน้อย</p></div>
        <ul class="sq2-watch-list">${watchHtml}</ul>
      </section>
      <section class="sq2-card sq2-tablecard">
        <div class="sq2-tools">
          <div class="sq2-chips">${chip('all', 'ทั้งหมด', N)}${chip('ok', 'ปกติ', cnt.ok)}${chip('risk', 'เสี่ยง', cnt.risk)}${chip('prob', 'มีปัญหา', cnt.prob)}${chip('todo', 'ยังไม่ส่ง', N - D)}</div>
          <input type="search" id="sq2-dash-q" class="sq2-search" placeholder="ค้นหาชื่อนักเรียน โรงเรียน หรือลำดับ" value="${sdqEsc(sdqState.dashQ)}">
        </div>
        <div class="sq2-twrap"><table class="sq2-table">
          <thead><tr><th>ลำดับ</th><th>นักเรียน</th>${DOMAIN_ORDER.map(d => `<th title="${sdqEsc(DOMAIN_META[d].label)}">${sdqEsc(DOMAIN_META[d].short)}</th>`).join('')}<th>รวม 4 ด้าน</th><th></th></tr></thead>
          <tbody>${body}</tbody></table></div>
        <div class="sq2-tfoot">ตัวเลขในช่อง = คะแนนรายด้าน (เต็ม 10) · สีบอกกลุ่ม: <span class="sq2-dchip g-ok">ปกติ</span> <span class="sq2-dchip g-risk">เสี่ยง</span> <span class="sq2-dchip g-prob">มีปัญหา</span></div>
      </section>
    </div>`;
    if (focusSearch !== null) { const i = document.getElementById('sq2-dash-q'); if (i) { i.focus(); i.setSelectionRange(focusSearch, focusSearch); } }
    sdqBindDash(view);
  };

  function sdqBindDash(view) {
    if (view.dataset.sq2Bound) return;
    view.dataset.sq2Bound = '1';
    view.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      const term = sdqState.dashTerm || sdqState.term;
      if (t.hasAttribute('data-sq2-g')) { sdqState.dashG = t.getAttribute('data-sq2-g'); sdqRenderDashboard(); return; }
      if (t.hasAttribute('data-sq2-csv')) { sdqExportDashboardCSV(); return; }
      if (t.hasAttribute('data-sq2-open')) {
        sdqState.studentIdx = Number(t.getAttribute('data-sq2-open'));
        sdqState.term = term;
        showPage('sdqform', document.getElementById('sdq-nav-form'));
        return;
      }
      if (t.hasAttribute('data-sq2-print')) sdqPrintFor(DB.students[Number(t.getAttribute('data-sq2-print'))], term);
    });
    view.addEventListener('input', e => { if (e.target.id === 'sq2-dash-q') { sdqState.dashQ = e.target.value; sdqRenderDashboard(); } });
    view.addEventListener('change', e => { if (e.target.id === 'sdq-dash-term') { sdqState.dashTerm = e.target.value; sdqRenderDashboard(); } });
  }

  window.sdqExportDashboardCSV = function () {
    const term = document.getElementById('sdq-dash-term')?.value || sdqState.dashTerm || sdqState.term;
    const domains = Object.keys(DOMAIN_META);
    const head = ['ลำดับ', 'ชื่อ-สกุล', 'โรงเรียน', ...domains.map(d => DOMAIN_META[d].short + ' (คะแนน)'), ...domains.map(d => DOMAIN_META[d].short + ' (กลุ่ม)'), 'รวม 4 ด้าน (คะแนน)', 'รวม 4 ด้าน (กลุ่ม)'];
    const esc = v => '"' + String(v ?? '').replace(/"/g, '""').replace(/^[=+\-@]/, "'$&") + '"';
    const body = sdqStudents().map(s => {
      const bucket = s.sdq && s.sdq[term];
      if (!bucket || !bucket.submittedAt) return null;     // v37: เฉพาะที่ส่งผลแล้ว
      const res = sdqCompute(bucket);
      return [s.no, s.name, s.school_m1 || '', ...domains.map(d => res.domainScore[d]), ...domains.map(d => res.groups[d]), res.totalDiff, res.totalGroup].map(esc).join(',');
    }).filter(Boolean);
    const csv = '\uFEFF' + [head.map(esc).join(','), ...body].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `สรุปผล_SDQ_${String(term).replace('/', '-')}.csv`;
    a.click();
  };

  /* ══════════ 6) พิมพ์ / PDF (ใช้ #sf-print-area ร่วมกับฟอร์มทุนฯ) ══════════ */
  function sdqPrintCurrent() {
    const student = sdqStudents()[sdqState.studentIdx];
    if (!student) return;
    sdqPrintFor(student, sdqState.term);
  }
  function sdqPrintFor(student, term) {
    const data = (student.sdq && student.sdq[term]) || {};
    const res = sdqCompute(data);
    let area = document.getElementById('sf-print-area');
    if (!area) { area = document.createElement('div'); area.id = 'sf-print-area'; document.body.appendChild(area); }
    area.innerHTML = sdqBuildPrintHtml(student, data, res);
    setTimeout(() => window.print(), 50);
  }

  function sdqBuildPrintHtml(student, data, res) {
    const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    const itemRows = SDQ_ITEMS.map(it => {
      const cur = data.answers ? data.answers[it.id] : undefined;
      return `<tr><td style="width:26px;text-align:center">${it.id}</td><td>${sdqEsc(it.text)}</td>
        ${CHOICES.map((c, i) => `<td style="text-align:center">${Number(cur) === i ? '✔' : ''}</td>`).join('')}
      </tr>`;
    }).join('');

    const domains = Object.keys(DOMAIN_META);
    const resultRows = domains.map(d => `<tr class="sdq-print-domain-${DOMAIN_META[d].color}">
        <td>${DOMAIN_META[d].label}</td>
        <td style="text-align:center">${res.domainScore[d]}</td>
        <td style="text-align:center"><b>${res.groups[d]}</b></td>
      </tr>`).join('');

    return `
    <div class="sfp-page sdq-print-page">
      <div class="sfp-brand">มูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์</div>
      <div class="sfp-pageno">แบบประเมิน SDQ (ฉบับครู)</div>
      <div class="sfp-center" style="margin-top:10mm">
        <div class="sfp-title">แบบประเมินพฤติกรรมเด็ก (SDQ) — ฉบับครูเป็นผู้ประเมิน</div>
        <div class="sfp-sub">คำชี้แจง โปรดทำเครื่องหมายให้ตรงกับพฤติกรรมของนักเรียนในช่วง 6 เดือนที่ผ่านมา</div>
      </div>
      <hr class="sfp-hr">
      <div class="sfp-field-line"><span>ชื่อ-สกุลนักเรียน</span>${sdqFill(student.name)}</div>
      <div class="sfp-field-line"><span>ระดับชั้น</span>${sdqFill(data.grade, 60)}<span style="margin-left:16px">ภาคเรียน</span>${sdqFill(data.term, 60)}</div>
      <div class="sfp-field-line"><span>โรงเรียน</span>${sdqFill(student.school_m1)}</div>
      <div class="sfp-field-line"><span>ผู้ประเมิน (ครู)</span>${sdqFill(data.evaluator, 100)}<span style="margin-left:16px">วันที่</span>${sdqFill(data.date, 60)}</div>

      <table class="sfp-table sdq-print-items" style="margin-top:12px;table-layout:fixed">
        <colgroup>
          <col style="width:5%">
          <col style="width:52%">
          <col style="width:14.33%"><col style="width:14.33%"><col style="width:14.34%">
        </colgroup>
        <thead><tr><th></th><th style="text-align:left">รายการประเมิน</th>${CHOICES.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="sdq-print-results">
        <div class="sfp-section-title">สรุปผลการประเมิน — ${sdqEsc(student.name || '')}</div>
        <table class="sfp-table">
          <thead><tr><th style="text-align:left">ด้าน</th><th>คะแนน</th><th>ผลการแปลผล</th></tr></thead>
          <tbody>
            ${resultRows}
            <tr style="background:#EFF6FB"><td><b>รวมคะแนน 4 ด้าน (อารมณ์ + เกเร + ไม่อยู่นิ่ง + เพื่อน)</b></td><td style="text-align:center"><b>${res.totalDiff}</b></td><td style="text-align:center"><b>${res.totalGroup}</b></td></tr>
          </tbody>
        </table>
        ${res.impactGroup ? `<div class="sfp-field-line" style="margin-top:10px"><span>ผลกระทบต่อชีวิตประจำวัน</span>${sdqFill(res.impactGroup + ' (คะแนน ' + res.impactScore + ')', 80)}</div>` : ''}
        <div class="sfp-sign-row">
          <div class="sfp-sign">${sdqFill(data.evaluator || '.......................................', 200)}<br>ผู้ประเมิน (ครู)<br>วันที่ ${sdqEsc(data.date || today)}</div>
        </div>
        <div class="sfp-sum-footer">พิมพ์เมื่อ ${today} — มูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์</div>
      </div>
    </div>`;
  }
  function sdqFill(text, minWidth) {
    const t = sdqEsc(text || '');
    return `<span class="sfp-fill" style="min-width:${minWidth || 40}px">${t || '&nbsp;'}</span>`;
  }

  /* ══════════ 7) เชื่อมเข้าระบบนำทางเดิม ══════════ */
  if (typeof PAGE_META === 'object') {
    PAGE_META.sdqform = { title: 'แบบประเมิน SDQ', sub: 'แบบประเมินพฤติกรรมเด็ก (SDQ) ฉบับครูเป็นผู้ประเมิน — 25 ข้อ พร้อมแปลผลอัตโนมัติ' };
    PAGE_META.sdqdashboard = { title: 'สรุปผล SDQ', sub: 'ภาพรวมผลการประเมิน SDQ และการจัดกลุ่มนักเรียนทั้งหมด' };
  }
  const _origShowPage = window.showPage;
  window.showPage = function (p, btn) {
    _origShowPage(p, btn);
    if (p === 'sdqform') { sdqRenderFormPage(); }
    else if (p === 'sdqdashboard') sdqRenderDashboard();
  };

  /* ══════════ 8) แทรกเมนู sidebar + หน้า (ไม่ต้องแก้ index.html) ══════════ */
  function injectUI() {
    const nav = document.getElementById('sidebar-nav');
    if (nav && !document.getElementById('sdq-nav-form')) {
      const label = document.createElement('div');
      label.className = 'sidebar-section-label';
      label.textContent = 'พฤติกรรมนักเรียน';
      const btn1 = document.createElement('button');
      btn1.className = 'nav-btn'; btn1.id = 'sdq-nav-form';
      btn1.innerHTML = '<span class="nav-icon">🧠</span> แบบประเมิน SDQ';
      btn1.onclick = () => showPage('sdqform', btn1);
      const btn2 = document.createElement('button');
      btn2.className = 'nav-btn'; btn2.id = 'sdq-nav-dash';
      btn2.innerHTML = '<span class="nav-icon">📈</span> สรุปผล SDQ';
      btn2.onclick = () => showPage('sdqdashboard', btn2);
      nav.appendChild(label); nav.appendChild(btn1); nav.appendChild(btn2);
    }
    const main = document.querySelector('.main');
    if (main && !document.getElementById('page-sdqform')) {
      const p1 = document.createElement('div');
      p1.id = 'page-sdqform'; p1.className = 'page'; p1.style.display = 'none';
      p1.innerHTML = '<div id="sdq-root"></div>';
      const p2 = document.createElement('div');
      p2.id = 'page-sdqdashboard'; p2.className = 'page'; p2.style.display = 'none';
      p2.innerHTML = `
        <div id="sdq-dash-staff-view"></div>
        <div id="sdq-dash-my-view" style="display:none"></div>`;
      main.appendChild(p1);
      main.appendChild(p2);
    }
  }

  function injectStyles() {
    if (document.getElementById('sdq-inline-style')) return;
    const style = document.createElement('style');
    style.id = 'sdq-inline-style';
    style.textContent = `
      .sdq-banner{padding:10px 16px;border-radius:var(--rad);margin-bottom:14px;font-size:13px;font-weight:600;animation:sdqSlideDown .35s ease}
      .sdq-banner-closed{background:#FEF3C7;color:#92400E;border:1px solid #FDE68A}
      .sdq-topfields{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
      .sdq-topfields label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:var(--text2)}
      .sdq-topfields input{padding:8px 10px;border-radius:var(--rad);border:1px solid var(--border2);font-family:'Noto Sans Thai',sans-serif;font-size:13px;transition:border-color .15s ease,box-shadow .15s ease}
      .sdq-topfields input:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px var(--blue-lt)}

      .sdq-editor{animation:sdqFadeIn .3s ease}
      .toolbar-title, #sdq-root .toolbar{animation:sdqFadeIn .25s ease}

      .sdq-table{width:100%;border-collapse:collapse;font-size:13px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--rad-lg);overflow:hidden;margin-bottom:18px;table-layout:fixed}
      .sdq-table th,.sdq-table td{padding:8px 8px;border-bottom:1px solid var(--border);overflow-wrap:break-word}
      .sdq-table thead th{background:var(--bg2);font-size:10.5px;color:var(--text2);text-transform:uppercase;letter-spacing:.3px;text-align:center}
      .sdq-table thead th:nth-child(2){text-align:left}
      .sdq-table tbody tr{transition:background .15s ease}
      .sdq-table tbody tr:hover{background:var(--blue-lt)}
      .sdq-row-anim{animation:sdqRowIn .35s ease both}
      .sdq-choice-cell{transition:background-color .18s ease;padding:6px 4px!important}
      .sdq-choice-cell.sdq-pop{animation:sdqPop .26s cubic-bezier(.34,1.56,.64,1)}

      /* ปุ่มเลือกคำตอบทรงเม็ดยา พร้อมสีแยกตามคำตอบ (ไม่จริง/ค่อนข้างจริง/จริง) */
      .sdq-pill{display:flex;align-items:center;justify-content:center;gap:6px;margin:0 auto;padding:7px 6px;
        border-radius:9999px;border:1.5px solid var(--border2);background:var(--bg2);cursor:pointer;
        transition:all .15s ease;min-width:64px;max-width:100%;position:relative}
      .sdq-pill input[type=radio]{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;inset:0}
      .sdq-pill-dot{width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid var(--border2);transition:all .15s ease;flex:none}
      .sdq-pill:hover{transform:translateY(-1px);box-shadow:0 2px 8px rgba(15,17,35,.08)}
      .sdq-pill-disabled{cursor:not-allowed;opacity:.65}
      .sdq-pill-disabled:hover{transform:none;box-shadow:none}

      .sdq-pill-0.sdq-pill-on{background:${CHOICE_COLORS[0].bg};border-color:${CHOICE_COLORS[0].line}}
      .sdq-pill-0.sdq-pill-on .sdq-pill-dot{background:${CHOICE_COLORS[0].line};border-color:${CHOICE_COLORS[0].line}}
      .sdq-pill-1.sdq-pill-on{background:${CHOICE_COLORS[1].bg};border-color:${CHOICE_COLORS[1].line}}
      .sdq-pill-1.sdq-pill-on .sdq-pill-dot{background:${CHOICE_COLORS[1].line};border-color:${CHOICE_COLORS[1].line}}
      .sdq-pill-2.sdq-pill-on{background:${CHOICE_COLORS[2].bg};border-color:${CHOICE_COLORS[2].line}}
      .sdq-pill-2.sdq-pill-on .sdq-pill-dot{background:${CHOICE_COLORS[2].line};border-color:${CHOICE_COLORS[2].line}}
      .sdq-choice-cell.sdq-choice-selected.sdq-choice-c0{background:${CHOICE_COLORS[0].bg}}
      .sdq-choice-cell.sdq-choice-selected.sdq-choice-c1{background:${CHOICE_COLORS[1].bg}}
      .sdq-choice-cell.sdq-choice-selected.sdq-choice-c2{background:${CHOICE_COLORS[2].bg}}

      .sdq-result-box,.sdq-impact-box{background:var(--bg4);border:1px solid var(--border);border-radius:var(--rad-lg);padding:16px;margin-bottom:16px;animation:sdqFadeIn .3s ease}
      .sdq-result-title{font-weight:700;margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .sdq-result-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
      .sdq-result-card{background:var(--bg2);border-radius:var(--rad);padding:10px;text-align:center;transition:transform .15s ease,box-shadow .15s ease;border:1px solid transparent}
      .sdq-result-card:hover{transform:translateY(-2px);box-shadow:0 4px 14px rgba(15,17,35,.08)}
      .sdq-result-card.sdq-pulse{animation:sdqPulse .45s ease}
      .sdq-result-card-lbl{font-size:11px;color:var(--text3);margin-bottom:4px;font-weight:700}
      .sdq-result-card-val{font-size:22px;font-weight:800;margin-bottom:4px;transition:color .2s ease}
      .sdq-impact-box label{display:block;margin-bottom:10px;font-size:13px;font-weight:600;color:var(--text2)}
      .sdq-impact-box select{margin-top:4px;padding:7px 10px;border-radius:var(--rad);border:1px solid var(--border2);font-family:'Noto Sans Thai',sans-serif;font-size:13px;width:100%;max-width:360px;transition:border-color .15s ease}
      .sdq-impact-box select:focus{outline:none;border-color:var(--blue)}
      .sdq-actions{display:flex;align-items:center;gap:14px}

      /* โทนสีพาสเทลประจำด้าน (การ์ดผลประเมิน + dashboard ส่วนตัว) */
      ${Object.keys(DOMAIN_COLORS).map(c => `
      .sdq-domain-${c}{background:${DOMAIN_COLORS[c].bg};border-color:${DOMAIN_COLORS[c].bg2}}
      .sdq-domain-${c} .sdq-result-card-lbl{color:${DOMAIN_COLORS[c].text}}
      .sdq-domain-${c} .sdq-result-card-val{color:${DOMAIN_COLORS[c].text}}
      `).join('')}

      .sdq-table + .sdq-actions .btn,#sdq-submit-btn,.sdq-actions .btn{transition:transform .12s ease,box-shadow .12s ease}
      .sdq-actions .btn:hover,.tbl-wrap .btn:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(15,17,35,.12)}
      .tbl-wrap tbody tr{transition:background .15s ease}

      /* ── สรุปผลเฉพาะตัว (มุมมองนักเรียน) ── */
      .sdq-my-summary{margin-bottom:18px}
      .sdq-my-term-row{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
      .sdq-my-note{background:var(--blue-lt);color:var(--blue-dk);border-radius:var(--rad);padding:10px 14px;font-size:13px;margin-bottom:14px}

      @keyframes sdqFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      @keyframes sdqSlideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes sdqRowIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
      @keyframes sdqPop{0%{transform:scale(1)}45%{transform:scale(1.12)}100%{transform:scale(1)}}
      @keyframes sdqPulse{0%{box-shadow:0 0 0 0 var(--blue-lt)}60%{box-shadow:0 0 0 8px rgba(93,135,255,0)}100%{box-shadow:0 0 0 0 rgba(93,135,255,0)}}

      @media (max-width:900px){.sdq-topfields{grid-template-columns:1fr 1fr}.sdq-result-grid{grid-template-columns:repeat(2,1fr)}}
      @media print{.sdq-table,.sdq-editor,.sdq-row-anim,.sdq-result-card{animation:none!important}}

      /* ── การจัดหน้าพิมพ์ / PDF ของแบบประเมิน SDQ (กันตกขอบ + พื้นที่ว่างเกิน) ── */
      @media print{
        .sdq-print-page{page-break-after:auto!important}
        .sdq-print-items tbody tr{page-break-inside:avoid;break-inside:avoid}
        .sdq-print-results{page-break-inside:avoid;break-inside:avoid;margin-top:10px}
        .sdq-print-results table.sfp-table tr{page-break-inside:avoid;break-inside:avoid}
        .sdq-print-domain-violet td:first-child{border-left:4px solid ${DOMAIN_COLORS.violet.line}}
        .sdq-print-domain-peach td:first-child{border-left:4px solid ${DOMAIN_COLORS.peach.line}}
        .sdq-print-domain-lemon td:first-child{border-left:4px solid ${DOMAIN_COLORS.lemon.line}}
        .sdq-print-domain-sky td:first-child{border-left:4px solid ${DOMAIN_COLORS.sky.line}}
        .sdq-print-domain-mint td:first-child{border-left:4px solid ${DOMAIN_COLORS.mint.line}}
      }
    `;
    document.head.appendChild(style);
  }

  /* ══════════ 9) เปิดใช้งาน ══════════ */
  function boot() {
    injectStyles();
    injectUI();
    sdqPullOpen();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // v31: ผู้ดูแลเปลี่ยนภาคเรียน → หน้า SDQ ของนักเรียนเปลี่ยนตาม
  window.sdqRerenderForTerm = function () {
    if (sdqIsStaff()) return;
    sdqState.term = sdqTerm();
    const p1 = document.getElementById('page-sdqform'), p2 = document.getElementById('page-sdqdashboard');
    if (p1 && p1.classList.contains('active')) sdqRenderFormPage();
    if (p2 && p2.classList.contains('active')) sdqRenderDashboard();
  };

  window.SDQ = { compute: sdqCompute, items: SDQ_ITEMS, domainMeta: DOMAIN_META, isOpen: sdqGetOpen, setOpen: sdqSetOpen,
    // v16: เปิดแบบประเมินของนักเรียนคนนี้ในภาคเรียนนี้โดยตรง (ใช้จากหน้า "งานที่ต้องกรอก")
    openFor: function (idx, term) {
      sdqState.studentIdx = idx;
      if (term) sdqState.term = term;
      showPage('sdqform', document.getElementById('sdq-nav-form'));
    } };
  console.log('🧠 แบบประเมิน SDQ (ฉบับครู) พร้อมใช้งาน');
})();
