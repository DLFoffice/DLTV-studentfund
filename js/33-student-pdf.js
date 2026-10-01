/* ============================================================
   33-student-pdf.js — ส่งออก PDF รายบุคคล (รายงานข้อมูลนักเรียนทุน 1 คน)
   ------------------------------------------------------------
   เปิดจากปุ่ม "📄 PDF รายบุคคล" ท้ายหน้าต่างรายละเอียดนักเรียน
   เนื้อหา (A4 แนวตั้ง):
     1. ข้อมูลนักเรียน: รูป ชื่อ ลำดับทุน วันเกิด (พ.ศ.) อายุ โรงเรียน ระดับชั้น จังหวัด สังกัด กลุ่มการดูแล
     2. ผู้ติดต่อ: นักเรียน ผู้ปกครอง ครูที่ปรึกษา พี่เลี้ยง (มูลนิธิฯ) ผู้อำนวยการ
     3. ผลการเรียนรายภาคเรียน + แนวโน้ม · 4. ผล SDQ รายภาคเรียน
     5. การเงิน: สรุปตามระดับชั้น + รายภาคเรียน (ส่วนที่ 1 / ส่วนที่ 2 / รวม)
     6. สถานะการส่งแบบฟอร์มรายภาคเรียน · 7. บันทึกพฤติกรรม
   ไม่รวมเลขบัญชีธนาคารและที่อยู่บ้าน · เลขบัตรประชาชนแสดงแบบปิดบางส่วน
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const money = v => (typeof fmt === 'function') ? fmt(v) : num(v).toLocaleString('th-TH');
  const tkey = t => { const m = String(t || '').match(/(\d)\/(\d{4})/); return m ? +m[2] * 10 + +m[1] : 0; };
  const grade = t => (typeof gradeFromTerm === 'function') ? (gradeFromTerm(t) || '') : '';
  const lvOf = t => (typeof gradeLevelOf === 'function') ? gradeLevelOf(t) : 0;
  const gName = lv => (typeof gradeName === 'function') ? gradeName(lv) : 'ม.' + lv;
  const thDate = v => {
    const n = (typeof normDateISO === 'function') ? normDateISO(v) : '';
    if (!n) return '';
    return new Date(n + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const sentAt = iso => { try { const d = new Date(iso); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'; } catch (e) { return ''; } };
  const val = v => (v !== undefined && v !== null && String(v).trim() !== '') ? E(v) : '<span class="sp-empty">—</span>';
  const gCls = g => (g === 'ปกติ' || g === 'จุดแข็ง') ? 'ok' : g === 'เสี่ยง' ? 'risk' : g ? 'prob' : 'na';

  function termsOf(s) {
    const set = new Set();
    (s.semGpa || []).forEach(g => g && g.term && set.add(g.term));
    (s.semPayments || []).forEach(p => p && p.term && set.add(p.term));
    Object.keys(s.forms || {}).forEach(t => /\d\/\d{4}/.test(t) && set.add(t));
    Object.keys(s.sdq || {}).forEach(t => /\d\/\d{4}/.test(t) && set.add(t));
    return [...set].sort((a, b) => tkey(a) - tkey(b));
  }

  function buildHtml(s) {
    const actT = (window.Term && Term.active) ? Term.active() : '';
    const terms = termsOf(s);
    const sa = s.school_m1_addr || {};
    const c = (typeof stdContactsOf === 'function') ? stdContactsOf(s) : { student: {}, parent: {}, teacher: {}, mentor: {}, director: {} };
    const care = (window.CareGroup && CareGroup.compute) ? CareGroup.compute(s) : { label: '' };
    const careCls = care.label === 'ต้องดูแลเป็นพิเศษ' ? 'prob' : care.label === 'เฝ้าระวัง' ? 'risk' : care.label === 'ปกติ' ? 'ok' : 'na';
    const latest = (typeof getLatestGpa === 'function') ? (getLatestGpa(s) || {}) : {};
    const src = (typeof safeUrl === 'function' && s.photoUrl) ? safeUrl(typeof fixDriveUrl === 'function' ? fixDriveUrl(s.photoUrl) : s.photoUrl) : '';
    const ini = E(String(s.name || '?').replace(/^(เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นางสาว|นาย|นาง)/, '').trim().slice(0, 2));
    const photo = src ? `<img class="sp-photo" src="${E(src)}" alt="" onerror="this.outerHTML='<div class=&quot;sp-photo sp-noimg&quot;>${ini}</div>'">` : `<div class="sp-photo sp-noimg">${ini}</div>`;
    const age = (typeof calcAge === 'function') ? calcAge(s.dob) : '';
    const idMasked = (typeof maskId === 'function' && s.id) ? maskId(s.id) : '';

    // ผลการเรียน
    const gpas = (s.semGpa || []).filter(g => g && g.term && Number(g.gpa) > 0).sort((a, b) => tkey(a.term) - tkey(b.term));
    let prev = Number(s.gpa_p6) > 0 ? Number(s.gpa_p6) : null;
    const gpaRows = gpas.map(g => {
      const v = Number(g.gpa);
      const d = prev !== null ? Math.round((v - prev) * 100) / 100 : null;
      prev = v;
      const tr = d === null ? '' : Math.abs(d) < 0.005 ? '<span class="sp-tr">เท่าเดิม</span>' : d > 0 ? `<span class="sp-tr up">▲ ${d.toFixed(2)}</span>` : `<span class="sp-tr down">▼ ${Math.abs(d).toFixed(2)}</span>`;
      return `<tr><td>${E(g.term)}</td><td>${E(grade(g.term))}</td><td class="r"><b>${v.toFixed(2)}</b></td><td>${tr}</td><td>${val(g.weakSubjects)}</td></tr>`;
    }).join('');

    // SDQ
    const sdqRows = terms.map(t => {
      const b = s.sdq && s.sdq[t];
      if (!b || !b.submittedAt || !window.SDQ) return '';
      const r = SDQ.compute(b);
      if (!r.complete) return '';
      const dm = SDQ.domainMeta;
      const cells = ['emotional', 'conduct', 'hyper', 'peer', 'prosocial'].map(d => `<td class="c"><span class="sp-chip ${gCls(r.groups[d])}">${r.domainScore[d]}</span></td>`).join('');
      return `<tr><td>${E(t)}</td>${cells}<td><span class="sp-chip ${gCls(r.totalGroup)} wide">${E(r.totalGroup)} (${r.totalDiff})</span></td></tr>`;
    }).join('');

    // การเงิน
    const pays = (s.semPayments || []).filter(p => p).slice().sort((a, b) => tkey(a.term) - tkey(b.term));
    const byLv = new Map();
    pays.forEach(p => { const lv = lvOf(p.term) || 0; const g = byLv.get(lv) || { lv, n: 0, p1: 0, p2: 0 }; g.n++; g.p1 += num(p.p1); g.p2 += num(p.p2); byLv.set(lv, g); });
    const lvRows = [...byLv.values()].sort((a, b) => a.lv - b.lv);
    const tot = lvRows.reduce((a, g) => ({ n: a.n + g.n, p1: a.p1 + g.p1, p2: a.p2 + g.p2 }), { n: 0, p1: 0, p2: 0 });
    let lastLv = null;
    const payRows = pays.map(p => {
      const lv = lvOf(p.term) || 0;
      const gs = byLv.get(lv);
      const sep = lv !== lastLv ? `<tr class="sp-sep"><td colspan="4">${lv ? E(gName(lv)) + ' · ปีการศึกษา ' + E(String(p.term).split('/')[1] || '') : 'ไม่ระบุระดับชั้น'}</td><td class="r">รวม ${money(gs ? gs.p1 + gs.p2 : 0)}</td></tr>` : '';
      lastLv = lv;
      return sep + `<tr><td>${E(p.term || '-')}</td><td class="r">${money(num(p.p1))}</td><td class="sm">${val(p.item1)}</td><td class="r">${money(num(p.p2))}</td><td class="r"><b>${money(num(p.p1) + num(p.p2))}</b></td></tr>`;
    }).join('');

    // สถานะแบบฟอร์ม
    const st = (k, t) => {
      if (k === 'sdq') { const b = s.sdq && s.sdq[t]; return b && b.submittedAt ? `<span class="sp-ok">✓ ${E(sentAt(b.submittedAt))}</span>` : '<span class="sp-wait">ยังไม่ส่ง</span>'; }
      if (!window.Term) return '';
      const sent = Term.state(s, k, t) === 'submitted';
      const at = sent ? ((Term.meta(s, k, t) || {}).submittedAt || '') : '';
      return sent ? `<span class="sp-ok">✓ ${at ? E(sentAt(at)) : 'ส่งแล้ว'}</span>` : '<span class="sp-wait">ยังไม่ส่ง</span>';
    };
    const formRows = terms.map(t => `<tr${t === actT ? ' class="sp-now"' : ''}><td>${E(t)} ${E(grade(t))}${t === actT ? ' <small>(ปัจจุบัน)</small>' : ''}</td><td>${st('form1', t)}</td><td>${st('form2', t)}</td><td>${st('sdq', t)}</td></tr>`).join('');

    const printed = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const qs = v => String(v).replace(/["\\\n\r]/g, ' ');
    return `<style>
      @page spdoc { size: A4; margin: 12mm 13mm 14mm;
        @top-left { content: "รายงานนักเรียนทุนรายบุคคล — ${qs(s.name || '')}"; font-family: Sarabun,'Noto Sans Thai',sans-serif; font-size: 8.5pt; color: #64748B; }
        @bottom-left { content: "พิมพ์เมื่อ ${qs(printed)} · เอกสารใช้ภายใน"; font-family: Sarabun,'Noto Sans Thai',sans-serif; font-size: 8.5pt; color: #94A3B8; }
        @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font-family: Sarabun,'Noto Sans Thai',sans-serif; font-size: 8.5pt; color: #64748B; } }
    </style>
    <article class="sp-doc">
      <header class="sp-head">
        <div><div class="sp-org">มูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์</div>
          <h1>รายงานข้อมูลนักเรียนทุนการศึกษา (รายบุคคล)</h1>
          <div class="sp-sub">ข้อมูล ณ ${E(window.Term && actT ? Term.label(actT) : '')}</div></div>
        <div class="sp-no">ลำดับทุน<b>${E(s.no ?? '-')}</b></div>
      </header>

      <section class="sp-profile">
        ${photo}
        <div class="sp-pmain">
          <h2>${E(s.name || '(ยังไม่ระบุชื่อ)')}${s.nickname ? ` <small>(${E(s.nickname)})</small>` : ''}</h2>
          <div class="sp-badges">
            <span class="sp-chip ${careCls} wide">กลุ่มการดูแล: ${E(care.label || 'รอข้อมูล')}</span>
            ${Number(latest.gpa) > 0 ? `<span class="sp-chip info wide">GPA ล่าสุด ${Number(latest.gpa).toFixed(2)} (${E(latest.term || '')})</span>` : ''}
            <span class="sp-chip info wide">เงินทุนสะสม ${money(tot.p1 + tot.p2)} บาท</span>
          </div>
          <dl class="sp-grid">
            <div><dt>เลขประจำตัวประชาชน</dt><dd>${val(idMasked)}</dd></div>
            <div><dt>วันเกิด</dt><dd>${val(thDate(s.dob))}${age && age !== '-' ? ` <small>(${E(age)})</small>` : ''}</dd></div>
            <div><dt>GPA ป.6</dt><dd>${Number(s.gpa_p6) > 0 ? E(s.gpa_p6) : val('')}</dd></div>
            <div class="w2"><dt>โรงเรียน</dt><dd>${val(s.school_m1)}</dd></div>
            <div><dt>ระดับชั้นปัจจุบัน</dt><dd>${val(actT ? grade(actT) : '')}</dd></div>
            <div><dt>อำเภอ / จังหวัด</dt><dd>${val([sa.amphoe, s.province].filter(Boolean).join(' / '))}</dd></div>
            <div class="w2"><dt>สังกัด</dt><dd>${val(s.org)}</dd></div>
          </dl>
        </div>
      </section>

      <h3><span>1</span>ผู้ติดต่อ</h3>
      <table class="sp-table sp-contacts"><tbody>
        <tr><th>นักเรียน</th><td>${val(s.name)}</td><td class="tel">${val(c.student.phone)}</td></tr>
        <tr><th>ผู้ปกครอง</th><td>${val(c.parent.name)}</td><td class="tel">${val(c.parent.phone)}</td></tr>
        <tr><th>ครูที่ปรึกษา</th><td>${val(c.teacher.name)}${c.teacher.extra ? ` <small>${E(c.teacher.extra)}</small>` : ''}</td><td class="tel">${val(c.teacher.phone)}</td></tr>
        <tr><th>พี่เลี้ยง (มูลนิธิฯ)</th><td>${val(c.mentor && c.mentor.name)}${c.mentor && c.mentor.extra ? ` <small>${E(c.mentor.extra)}</small>` : ''}</td><td class="tel">${val(c.mentor && c.mentor.phone)}</td></tr>
        <tr><th>ผู้อำนวยการ</th><td>${val(c.director.name)}</td><td class="tel">${val(c.director.phone)}</td></tr>
      </tbody></table>

      <h3><span>2</span>ผลการเรียนรายภาคเรียน</h3>
      ${gpaRows ? `<table class="sp-table"><thead><tr><th>ภาคเรียน</th><th>ชั้น</th><th class="r">เกรดเฉลี่ย</th><th>เทียบภาคก่อน</th><th>วิชาที่ควรพัฒนา</th></tr></thead><tbody>${gpaRows}</tbody></table>`
        : '<p class="sp-none">ยังไม่มีข้อมูลผลการเรียน</p>'}

      <h3><span>3</span>ผลการประเมิน SDQ (ส่งผลแล้ว)</h3>
      ${sdqRows ? `<table class="sp-table"><thead><tr><th>ภาคเรียน</th><th class="c">อารมณ์</th><th class="c">เกเร</th><th class="c">สมาธิสั้น</th><th class="c">เพื่อน</th><th class="c">สัมพันธภาพ</th><th>รวม 4 ด้าน</th></tr></thead><tbody>${sdqRows}</tbody></table>
        <p class="sp-note">ตัวเลข = คะแนนรายด้าน (เต็ม 10) · สีเขียว ปกติ/จุดแข็ง · สีส้ม เสี่ยง · สีแดง มีปัญหา</p>`
        : '<p class="sp-none">ยังไม่มีผลการประเมิน SDQ ที่ส่งแล้ว</p>'}

      <h3 class="sp-keep"><span>4</span>ข้อมูลการเงิน</h3>
      ${pays.length ? `
      <div class="sp-avoid"><div class="sp-sub-h">สรุปตามระดับชั้น</div>
      <table class="sp-table sp-money"><thead><tr><th>ระดับชั้น</th><th class="r">จำนวนภาคเรียน</th><th class="r">ส่วนที่ 1 (บาท)</th><th class="r">ส่วนที่ 2 (บาท)</th><th class="r">รวม (บาท)</th></tr></thead>
        <tbody>${lvRows.map(g => `<tr><td>${g.lv ? E(gName(g.lv)) : 'ไม่ระบุ'}</td><td class="r">${g.n}</td><td class="r">${money(g.p1)}</td><td class="r">${money(g.p2)}</td><td class="r"><b>${money(g.p1 + g.p2)}</b></td></tr>`).join('')}
        <tr class="sp-total"><td>รวมทั้งหมด</td><td class="r">${tot.n}</td><td class="r">${money(tot.p1)}</td><td class="r">${money(tot.p2)}</td><td class="r"><b>${money(tot.p1 + tot.p2)}</b></td></tr></tbody></table></div>
      <div class="sp-sub-h">รายภาคเรียน</div>
      <table class="sp-table sp-money"><thead><tr><th>ภาคเรียน</th><th class="r">ส่วนที่ 1 (บาท)</th><th>รายการส่วนที่ 1</th><th class="r">ส่วนที่ 2 (บาท)</th><th class="r">รวม (บาท)</th></tr></thead>
        <tbody>${payRows}</tbody></table>
      <p class="sp-note">ส่วนที่ 1 = ค่าใช้จ่ายที่สถานศึกษาเรียกเก็บ (ค่าบำรุงการศึกษา) · ส่วนที่ 2 = ค่าใช้จ่ายในการเรียน/ครองชีพ</p>`
        : '<p class="sp-none">ยังไม่มีข้อมูลการเบิกจ่าย</p>'}

      <h3 class="sp-keep"><span>5</span>สถานะการส่งแบบฟอร์มรายภาคเรียน</h3>
      ${formRows ? `<table class="sp-table"><thead><tr><th>ภาคเรียน</th><th>แบบฟอร์มที่ 1</th><th>แบบฟอร์มที่ 2</th><th>แบบประเมิน SDQ</th></tr></thead><tbody>${formRows}</tbody></table>` : '<p class="sp-none">ยังไม่มีข้อมูล</p>'}

      ${s.behavior ? `<h3 class="sp-keep"><span>6</span>บันทึกพฤติกรรม/ข้อสังเกต</h3><div class="sp-para">${E(s.behavior)}</div>` : ''}
    </article>`;
  }

  window.exportStudentPdf = function (idx) {
    const s = DB.students[idx];
    if (!s) return;
    let area = document.getElementById('sf-print-area');
    if (!area) { area = document.createElement('div'); area.id = 'sf-print-area'; document.body.appendChild(area); }
    area.innerHTML = buildHtml(s);
    const oldTitle = document.title;
    document.title = `รายงานนักเรียนทุน-${String(s.no || '')}-${String(s.name || '').replace(/[\\/:*?"<>|]/g, '')}`;
    const restore = () => { document.title = oldTitle; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    const img = area.querySelector('img.sp-photo');
    const wait = !img || img.complete ? Promise.resolve() : new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
    Promise.race([wait, new Promise(r => setTimeout(r, 5000))]).then(() => setTimeout(() => window.print(), 80));
  };

  // ปุ่มในหน้าต่างรายละเอียดนักเรียน
  const _open = window.openStudentDetail;
  if (typeof _open === 'function') {
    window.openStudentDetail = function (idx) {
      const r = _open.apply(this, arguments);
      try {
        const foot = document.querySelector('#student-modal .modal-footer');
        if (foot) {
          let b = foot.querySelector('[data-sp-pdf]');
          if (!b) {
            b = document.createElement('button');
            b.className = 'btn'; b.setAttribute('data-sp-pdf', '');
            b.innerHTML = '📄 PDF รายบุคคล';
            b.title = 'ส่งออกรายงานข้อมูลนักเรียนคนนี้เป็น PDF (ข้อมูลทั่วไป ผลการเรียน SDQ การเงินรายชั้น/รายภาค)';
            foot.insertBefore(b, foot.firstChild);
          }
          b.onclick = () => window.exportStudentPdf(idx);
        }
      } catch (e) {}
      return r;
    };
  }
})();
