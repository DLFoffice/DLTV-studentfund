/* ============================================================
   24-risk-analysis.js — วิเคราะห์ "กลุ่มการดูแล" อัตโนมัติ จาก GPA + SDQ
   ------------------------------------------------------------
   แทนที่ระบบเดิมที่ครูต้องเลือก "ระดับความเสี่ยง" (ต่ำ/ปานกลาง/สูง/สูงมาก)
   และกรอก "มีอุปสรรค" เอง — ตอนนี้ระบบคำนวณให้อัตโนมัติจาก:
     1) เกรดเฉลี่ย (GPA) ล่าสุดของนักเรียน
     2) ผลประเมิน SDQ ฉบับล่าสุดที่ "กรอกครบ 25 ข้อ" (คะแนนรวม 4 ด้าน)
   แล้วสรุปเป็น "กลุ่มการดูแล" 3 ระดับ: ปกติ / เฝ้าระวัง / ต้องดูแลเป็นพิเศษ
   ถ้ายังไม่มีข้อมูลฝั่งใดฝั่งหนึ่ง ระบบจะบอกตรงๆ ว่า "รอข้อมูล" แทนการเดา
   และจะบอกด้วยว่ากลุ่มที่แสดงนั้นวิเคราะห์จากอะไรบ้าง (โปร่งใส ตรวจสอบได้)

   เกณฑ์:
   - GPA: >=3.00 ปกติ, 2.50–2.99 เฝ้าระวัง, <2.50 ต้องดูแลเป็นพิเศษ
   - SDQ: ใช้ totalGroup (คะแนนรวม 4 ด้าน) ที่คำนวณไว้แล้วใน 23-sdq-form.js
          ปกติ / เสี่ยง / มีปัญหา
   - กลุ่มสุดท้าย = "แย่กว่า" ของสองฝั่ง (ฝั่งไหนสูงกว่าใช้ฝั่งนั้น)
     เพื่อไม่ให้ GPA ดีบดบังปัญหาด้านพฤติกรรม/อารมณ์ หรือกลับกัน

   ใช้งาน: window.CareGroup.compute(student) -> { severity, label, badgeClass, ... }
           window.CareGroup.domainProblemCounts() -> สรุปด้าน SDQ ที่พบปัญหามากสุดทั้งระบบ

   โหลดหลังสุด (หลัง 23-sdq-form.js) — ไม่แก้ไฟล์อื่น เพิ่มฟังก์ชันใหม่เข้ามาแทน
   ============================================================ */
(function () {
  'use strict';

  const LABELS = {
    2:    { text: 'ต้องดูแลเป็นพิเศษ', badge: 'badge b-red',   dot: '#DC2626' },
    1:    { text: 'เฝ้าระวัง',          badge: 'badge b-amber', dot: '#D97706' },
    0:    { text: 'ปกติ',               badge: 'badge b-green', dot: '#16A34A' },
    '-1': { text: 'รอข้อมูล',           badge: 'badge b-gray',  dot: '#9CA3AF' }
  };

  function gpaSeverity(gpaVal) {
    if (!gpaVal || gpaVal <= 0) return -1;
    if (gpaVal < 2.5) return 2;
    if (gpaVal < 3.0) return 1;
    return 0;
  }

  function sdqTotalSeverity(group) {
    if (group === 'มีปัญหา') return 2;
    if (group === 'เสี่ยง') return 1;
    if (group === 'ปกติ') return 0;
    return -1;
  }

  /** หาแบบประเมิน SDQ ฉบับล่าสุดที่ "กรอกครบ 25 ข้อ" ของนักเรียนคนหนึ่ง */
  function latestCompleteSdq(s) {
    if (!s || !s.sdq || typeof s.sdq !== 'object') return null;
    let terms = Object.keys(s.sdq);
    if (window.Term && typeof Term.isValid === 'function') terms = terms.filter(t => Term.isValid(t));
    terms.sort((a, b) => (window.Term && typeof Term.cmp === 'function') ? Term.cmp(b, a) : (a < b ? 1 : -1)); // ใหม่ → เก่า
    for (const t of terms) {
      const rec = s.sdq[t];
      if (!rec || typeof window.SDQ === 'undefined') continue;
      let res;
      try { res = SDQ.compute(rec); } catch (e) { continue; }
      if (res && res.complete) return { term: t, record: rec, result: res };
    }
    return null;
  }

  /** วิเคราะห์กลุ่มการดูแลของนักเรียน 1 คน จาก GPA ล่าสุด + SDQ ฉบับล่าสุดที่ครบ */
  function computeCareGroup(s) {
    const g = (typeof getLatestGpa === 'function') ? getLatestGpa(s) : (s && s.gpa) || {};
    const gpaVal = +g.gpa || 0;
    const gSev = gpaSeverity(gpaVal);

    const sdq = latestCompleteSdq(s);
    const sSev = sdq ? sdqTotalSeverity(sdq.result.totalGroup) : -1;

    const severity = (gSev === -1 && sSev === -1) ? -1 : Math.max(gSev, sSev);
    const meta = LABELS[severity];

    let note = '';
    if (severity === -1) note = 'ยังไม่มีทั้ง GPA และผลประเมิน SDQ ที่กรอกครบ';
    else if (gSev === -1) note = 'วิเคราะห์จากผล SDQ เท่านั้น (ยังไม่มีข้อมูล GPA)';
    else if (sSev === -1) note = 'วิเคราะห์จาก GPA เท่านั้น (ยังไม่มีผล SDQ ที่กรอกครบ)';
    else note = 'วิเคราะห์จาก GPA + ผลประเมิน SDQ';

    return {
      severity, label: meta.text, badgeClass: meta.badge, dotColor: meta.dot, note,
      gpaVal, gpaSeverity: gSev,
      sdqTerm: sdq ? sdq.term : null,
      sdqGroup: sdq ? sdq.result.totalGroup : null,
      sdqSeverity: sSev,
      hasGpa: gSev !== -1, hasSdq: sSev !== -1
    };
  }

  /** สรุปจำนวนนักเรียนที่อยู่ในกลุ่ม "มีปัญหา" (หรือ "ไม่มีจุดแข็ง" สำหรับด้านสัมพันธภาพทางสังคม)
   *  แยกตามด้าน SDQ ทั้ง 5 ด้าน โดยใช้ฉบับล่าสุดที่กรอกครบของแต่ละคน */
  function domainProblemCounts() {
    const domainMeta = (window.SDQ && SDQ.domainMeta) || {};
    const keys = Object.keys(domainMeta);
    const counts = {};
    keys.forEach(d => counts[d] = 0);
    (DB.students || []).forEach(s => {
      const sdq = latestCompleteSdq(s);
      if (!sdq) return;
      keys.forEach(d => {
        const grp = sdq.result.groups[d];
        if (grp === 'มีปัญหา' || grp === 'ไม่มีจุดแข็ง') counts[d]++;
      });
    });
    return keys.map(d => ({ key: d, label: (domainMeta[d] && (domainMeta[d].short || domainMeta[d].label)) || d, count: counts[d] }));
  }

  window.CareGroup = {
    compute: computeCareGroup,
    latestCompleteSdq,
    domainProblemCounts,
    labels: LABELS
  };
})();
