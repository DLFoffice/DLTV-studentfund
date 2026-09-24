/* ============================================================
   27-print-layout.js — รูปแบบเอกสาร "เต็มตามแบบฟอร์ม" สำหรับพิมพ์ / บันทึก PDF (v18)
   ------------------------------------------------------------
   แทนที่ sfPrintForm1 / sfPrintForm2 เดิม (15-form-tracking.js) โดยคงลำดับหัวข้อ
   และเลขข้อตามแบบฟอร์มกระดาษของมูลนิธิฯ แต่จัดวางใหม่ให้อ่านง่าย:
     • ข้อมูลเป็นตาราง 12 คอลัมน์ ป้ายกำกับอยู่เหนือค่า — ไม่ล้น ไม่เบียดกันเป็นบรรทัดยาว
     • ตัวเลือก (☐/☑) ดึงจาก schema จริง แสดงเป็นกล่องติ๊ก และ "อื่น ๆ" แสดงข้อความที่ระบุ
       (เดิมพิมพ์คำว่า __other__ ออกมาตรง ๆ)
     • ตัวเลขเงินมีจุลภาค + หน่วย, ตารางว่างเหลือบรรทัดให้เขียนมือ
     • เอกสารไหลต่อเนื่อง ตัดหน้าอัตโนมัติ (ไม่มีครึ่งหน้าว่าง) หัวตารางซ้ำทุกหน้า
       หัว-ท้ายกระดาษแสดงชื่อนักเรียน + เลขหน้า "หน้า x / y"
     • ใช้ฟอนต์ Sarabun (ฟอนต์มาตรฐานหนังสือราชการ) โทนหมึกดำ-น้ำเงิน ประหยัดหมึก
   หน้าสรุปย่อ และ SDQ ยังใช้รูปแบบเดิม (sfp-*) — ไม่กระทบ
   โหลดหลัง 26-data-links.js
   ============================================================ */
(function () {
  'use strict';

  const E = v => (typeof sfEscapeHtml === 'function') ? sfEscapeHtml(v) : String(v ?? '');
  const T = (f, id) => { try { return sfPText(f, id) || ''; } catch (e) { return ''; } };
  const money = v => {
    const s = String(v ?? '').trim(); if (!s) return '';
    const n = (typeof sfNum === 'function') ? sfNum(s) : Number(s.replace(/,/g, ''));
    return isFinite(n) ? n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : s;
  };

  /* ══════════ ชิ้นส่วนเอกสาร ══════════ */
  /** ช่องข้อมูล: w = ความกว้าง 1–12 คอลัมน์ */
  function fld(label, f, id, w, o) {
    o = o || {};
    let v = T(f, id);
    if (o.money && v) v = money(v);
    const unit = v && o.unit ? ` <small>${E(o.unit)}</small>` : '';
    return `<div class="pf-f" style="grid-column:span ${w || 4}"><span class="pf-l">${E(label)}</span>`
      + `<span class="pf-v${o.mono ? ' pf-mono' : ''}">${E(v) || '&nbsp;'}${unit}</span></div>`;
  }
  /** ช่องที่ค่ามาจากการคำนวณ (ไม่ใช่ field ในฟอร์ม) */
  function fldVal(label, v, w) {
    return `<div class="pf-f" style="grid-column:span ${w || 4}"><span class="pf-l">${E(label)}</span><span class="pf-v">${E(v) || '&nbsp;'}</span></div>`;
  }
  const row = (...cells) => `<div class="pf-row">${cells.join('')}</div>`;

  /** ตัวเลือก — อ่าน options / other จาก schema ของฟอร์มโดยตรง */
  function chc(f, id, o) {
    o = o || {};
    const field = sfFindField(f, id); if (!field) return '';
    const v = (typeof sfPV === 'function') ? sfPV(f, id) : null;
    const multi = field.type === 'checkboxgroup';
    const sel = v && typeof v === 'object' ? (multi ? (v.selected || []) : [v.choice]) : [];
    const box = (on, text) => `<span class="pf-opt${on ? ' on' : ''}"><i aria-hidden="true">${on ? '✓' : ''}</i>${text}</span>`;
    let html = (field.options || []).map(op => box(sel.indexOf(op) > -1, E(op))).join('');
    if (field.other) {
      const on = sel.indexOf('__other__') > -1;
      const lab = field.otherLabel || 'อื่น ๆ';
      const txt = on && v && v.other ? `<b>${E(v.other)}</b>` : '<span class="pf-blank"></span>';
      html += box(on, `${E(lab)} ${on ? '' : '(ระบุ)'} ${txt}`);
    }
    if (o.after) html += `<span class="pf-after">${o.after}</span>`;
    return `<div class="pf-choice"><span class="pf-l">${E(o.label || field.label)}</span><div class="pf-opts">${html}</div></div>`;
  }
  /** ค่าเล็ก ๆ ต่อท้ายตัวเลือก เช่น "จำนวน ___ บาท" */
  function inl(prefix, f, id, suffix, o) {
    o = o || {};
    let v = T(f, id); if (o.money && v) v = money(v);
    return `${E(prefix)} <span class="pf-inl">${E(v) || '&nbsp;'}</span> ${E(suffix || '')}`;
  }

  /** คำถามปลายเปิด + กล่องคำตอบ */
  function para(label, text, o) {
    o = o || {};
    return `<div class="pf-para${o.tall ? ' tall' : ''}">${label ? `<div class="pf-q">${label}</div>` : ''}`
      + `<div class="pf-ans">${text ? E(text).replace(/\n/g, '<br>') : ''}</div></div>`;
  }
  const paraF = (label, f, id, o) => para(label, T(f, id), o);

  /** ตาราง: ตัดแถวว่างทิ้ง ถ้าไม่มีข้อมูลเหลือบรรทัดว่างให้เขียนมือ */
  function tbl(cols, rows, o) {
    o = o || {};
    const moneyCols = o.money || [];
    const filled = (rows || []).filter(r => r.some(c => String(c ?? '').trim() !== ''));
    const body = filled.length ? filled : Array.from({ length: o.blank || 2 }, () => cols.map(() => ''));
    const head = cols.map((c, i) => `<th${moneyCols.includes(i) ? ' class="num"' : ''}${o.widths && o.widths[i] ? ` style="width:${o.widths[i]}"` : ''}>${E(c)}</th>`).join('');
    const trs = body.map(r => '<tr>' + cols.map((_, i) => {
      const raw = r[i] ?? '';
      const val = moneyCols.includes(i) && raw !== '' ? money(raw) : raw;
      return `<td${moneyCols.includes(i) ? ' class="num"' : ''}>${E(val) || '&nbsp;'}</td>`;
    }).join('') + '</tr>').join('');
    return `<table class="pf-table"><thead><tr>${head}</tr></thead><tbody>${trs}</tbody></table>`;
  }
  const rowsOf = (f, id, cols) => (typeof sfTableRowsFor === 'function') ? sfTableRowsFor(f, id, cols) : [];
  function gradesTbl(f) {
    const m = (typeof sfMatrixRowsFor === 'function') ? sfMatrixRowsFor(f, 'grades_matrix') : { headers: [], rows: [] };
    const headers = m.headers.length ? m.headers : ['ระดับชั้น/ปี', 'ระดับชั้น/ปี'];
    const rows = m.rows.length ? m.rows : [];
    // แสดงทุกแถว (ภาคเรียนที่ 1/2/เฉลี่ย/สะสม) แม้ยังว่าง — เป็นโครงของตารางผลการเรียน
    const body = rows.map(r => '<tr>' + r.map((c, i) => i === 0 ? `<th scope="row">${E(c)}</th>` : `<td class="num">${E(c) || '&nbsp;'}</td>`).join('') + '</tr>').join('');
    return `<table class="pf-table pf-grades"><thead><tr><th>ภาคเรียน</th>${headers.map(h => `<th class="num">${E(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  }

  const sec = (no, title, body, o) =>
    `<section class="pf-sec${o && o.breakBefore ? ' pf-break' : ''}"><h3>${no ? `<span class="pf-no">${E(no)}</span>` : ''}${E(title)}</h3>${body}</section>`;
  const sub = (no, title) => `<h4>${no ? `<span>${E(no)}</span> ` : ''}${E(title)}</h4>`;
  const note = t => `<p class="pf-note">หมายเหตุ ${E(t)}</p>`;
  const group = (title, body) => `<div class="pf-group"><div class="pf-group-t">${E(title)}</div>${body}</div>`;

  /** ช่องลงนาม */
  function sign(role, name, lines) {
    return `<div class="pf-sign">
      <div class="pf-sign-line"><span>ลงชื่อ</span><i></i></div>
      <div class="pf-sign-name">( ${E(name) || '<span class="pf-blank wide"></span>'} )</div>
      <div class="pf-sign-role">${E(role)}</div>
      ${(lines || []).map(([k, v]) => `<div class="pf-sign-meta">${E(k)} ${E(v) || '<span class="pf-blank"></span>'}</div>`).join('')}
    </div>`;
  }
  const certify = (text, signs) =>
    `<div class="pf-certify"><p>${E(text)}</p><div class="pf-signs">${signs.join('')}</div></div>`;

  /** หัวเอกสาร + แถบข้อมูลนักเรียน */
  function docHead(formNo, lines, idCells) {
    return `<header class="pf-head">
      <div class="pf-org">
        <div class="pf-org-name">มูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์</div>
        <div class="pf-org-sub">ทุนการศึกษาพระราชทาน DLTV</div>
      </div>
      <div class="pf-formno">แบบฟอร์มที่ ${formNo}</div>
    </header>
    <div class="pf-titleblock">${lines.map((l, i) => `<div class="${i === 0 ? 'pf-title' : 'pf-subtitle'}">${l}</div>`).join('')}</div>
    ${idCells ? `<div class="pf-idstrip">${idCells}</div>` : ''}`;
  }

  /** เอกสารทั้งฉบับ + หัว/ท้ายกระดาษแต่ละหน้า (Chrome/Edge รุ่นใหม่รองรับ) */
  function wrapDoc(inner, runningTitle) {
    const q = s => String(s).replace(/["\\\n\r]/g, ' ');
    const printed = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    return `<style>
      @page pfdoc {
        size: A4; margin: 16mm 15mm 17mm;
        @top-left { content: "${q(runningTitle)}"; font-family: Sarabun, 'Noto Sans Thai', sans-serif; font-size: 8.5pt; color: #64748B; }
        @bottom-left { content: "พิมพ์เมื่อ ${q(printed)}"; font-family: Sarabun, 'Noto Sans Thai', sans-serif; font-size: 8.5pt; color: #94A3B8; }
        @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font-family: Sarabun, 'Noto Sans Thai', sans-serif; font-size: 8.5pt; color: #64748B; }
      }
    </style><article class="pf-doc">${inner}</article>`;
  }

  /* ══════════ แบบฟอร์มที่ 1 ══════════ */
  function printForm1(student) {
    const f = 'form1';
    const person = (key, title) => group(title,
      row(fld('ชื่อ', f, key + '_name', 4), fld('นามสกุล', f, key + '_surname', 4), fld('เลขประจำตัวประชาชน', f, key + '_id', 4, { mono: true })) +
      row(fld('อายุ', f, key + '_age', 2, { unit: 'ปี' }), fld('การศึกษา', f, key + '_education', 3), fld('อาชีพ', f, key + '_occupation', 3), fld('รายได้ต่อปี', f, key + '_income', 4, { money: true, unit: 'บาท' })) +
      row(fld('ที่อยู่หรือที่ทำงาน', f, key + '_workplace', 8), fld('โทรศัพท์', f, key + '_phone', 4)));

    const name = T(f, 'full_name') || student.name || '';
    const inner = docHead('1', [
      'แบบรายงานข้อมูลรายบุคคล',
      'ผู้รับทุนการศึกษามูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์',
      'เนื่องในโอกาสมหามงคลเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว ทรงเจริญพระชนมพรรษา 6 รอบ 28 กรกฎาคม 2567',
      '(สำหรับสถานศึกษาจัดทำทุกครั้งเมื่อรับนักเรียนทุนเข้าศึกษาในสถานศึกษา)',
    ], row(fldVal('ผู้รับทุนการศึกษา', name, 6), fld('รับทุนปีที่', f, 'fund_year', 3), fld('ปีการศึกษา', f, 'academic_year', 3)))

    + sec('', 'สถานศึกษา',
      row(fld('ชื่อสถานศึกษา', f, 'school_name', 12)) +
      row(fld('เลขที่', f, 'addr_no', 2), fld('หมู่ที่', f, 'addr_moo', 2), fld('ถนน', f, 'addr_road', 4), fld('ตำบล/แขวง', f, 'addr_tambon', 4)) +
      row(fld('อำเภอ/เขต', f, 'addr_amphoe', 4), fld('จังหวัด', f, 'addr_province', 4), fld('รหัสไปรษณีย์', f, 'addr_zip', 4)) +
      row(fld('โทรศัพท์', f, 'phone', 4), fld('โทรสาร', f, 'fax', 4), fld('อีเมล', f, 'email', 4)))

    + sec('1', 'ข้อมูลส่วนตัว',
      sub('1.1', 'ข้อมูลผู้รับทุนการศึกษา') +
      row(fld('ชื่อ - นามสกุล ผู้รับทุนการศึกษา', f, 'full_name', 8), fld('ชื่อเล่น', f, 'nickname', 4)) +
      row(fld('เลขประจำตัวประชาชน', f, 'national_id', 4, { mono: true }), fld('วัน เดือน ปีเกิด', f, 'dob', 3), fld('เชื้อชาติ', f, 'nationality', 2), fld('ศาสนา', f, 'religion', 3)) +
      row(fld('ภูมิลำเนา (จังหวัด)', f, 'hometown', 4)) +
      group('ที่อยู่ปัจจุบัน',
        row(fld('เลขที่', f, 'cur_addr_no', 2), fld('หมู่ที่', f, 'cur_addr_moo', 2), fld('ถนน', f, 'cur_addr_road', 4), fld('ตำบล/แขวง', f, 'cur_addr_tambon', 4)) +
        row(fld('อำเภอ/เขต', f, 'cur_addr_amphoe', 4), fld('จังหวัด', f, 'cur_addr_province', 4), fld('รหัสไปรษณีย์', f, 'cur_addr_zip', 4)) +
        row(fld('โทรศัพท์', f, 'cur_phone', 4), fld('อีเมล', f, 'cur_email', 4), fld('ID Line', f, 'id_line', 4))) +
      chc(f, 'live_with') + chc(f, 'residence_type') + chc(f, 'travel_method') +
      row(fld('ระยะทางจากบ้านมาสถานศึกษา', f, 'distance_km', 4, { unit: 'กิโลเมตร' }), fld('ใช้เวลาเดินทาง (ชั่วโมง)', f, 'travel_hour', 4, { unit: 'ชั่วโมง' }), fld('ใช้เวลาเดินทาง (นาที)', f, 'travel_min', 4, { unit: 'นาที' })) +
      group('ค่าใช้จ่ายประจำวัน',
        row(fld('ได้รับเงินเพื่อเป็นค่าใช้จ่ายจาก', f, 'expense_source', 8), fld('เป็นเงิน', f, 'expense_amount', 4, { money: true, unit: 'บาท/วัน' })) +
        row(fld('ค่าพาหนะเดินทางไป-กลับ', f, 'expense_transport', 4, { money: true, unit: 'บาท/วัน' }), fld('ค่าอาหารเช้า-กลางวัน', f, 'expense_food', 4, { money: true, unit: 'บาท/วัน' }), fld('ค่าใช้จ่ายอื่น ๆ', f, 'expense_other', 4))) +
      sub('', 'เพื่อนในสถานศึกษาที่สนิทมากที่สุด') +
      tbl(['ชื่อ - นามสกุล', 'ชั้น', 'ห้อง', 'โทรศัพท์', 'เหตุผล'], rowsOf(f, 'friends_school', ['name', 'class', 'room', 'phone', 'reason']), { widths: ['28%', '9%', '9%', '17%', ''] }) +
      sub('', 'เพื่อนที่อยู่บ้านใกล้เคียงกับนักเรียนมากที่สุด') +
      tbl(['ชื่อ - นามสกุล', 'ชั้น', 'ห้อง', 'โทรศัพท์'], rowsOf(f, 'friend_neighbor', ['name', 'class', 'room', 'phone']), { blank: 1, widths: ['40%', '12%', '12%', ''] }) +
      sub('1.2', 'ทุนการศึกษานี้เป็นทุนต่อเนื่องจนจบระดับปริญญาตรี นักเรียนมีความคาดหวังด้านการศึกษาอย่างไร') + paraF('', f, 'expect_education') +
      sub('1.3', 'ความคาดหวังด้านอาชีพในอนาคต') + paraF('', f, 'expect_career') +
      sub('1.4', 'ความภาคภูมิใจและความต้องการพัฒนาตนเอง') +
      tbl(['ระดับชั้น/ปี', 'ความภาคภูมิใจในตนเอง', 'ความต้องการในการพัฒนาตนเอง', 'ความต้องการให้ครูหรือสถานศึกษาช่วยเหลือ'], rowsOf(f, 'pride_table', ['level', 'pride', 'develop', 'help']), { widths: ['14%', '', '', ''] }))

    + sec('2', 'ข้อมูลด้านสุขภาพ',
      row(fld('หมู่โลหิต', f, 'blood_type', 3), fld('มีตำหนิที่เห็นชัดเจน คือ', f, 'visible_mark', 9)) +
      row(fld('โรคประจำตัว', f, 'chronic_disease', 6), fld('การรักษาพยาบาลเบื้องต้น', f, 'treatment', 6)) +
      row(fld('แพ้ยา', f, 'allergy', 6), fld('ยาที่ใช้ประจำ', f, 'regular_medicine', 6)) +
      chc(f, 'eyesight') +
      chc(f, 'impairment', { after: inl('คือ', f, 'impairment_detail') }) +
      row(fld('เคยป่วยหนักหรือประสบอุบัติเหตุร้ายแรงถึงขั้นเข้านอนโรงพยาบาล คือ', f, 'serious_illness', 9), fld('เมื่อ พ.ศ.', f, 'illness_year', 3)))

    + sec('3', 'ข้อมูลด้านครอบครัว',
      person('father', 'บิดา') + person('mother', 'มารดา') + person('guardian', 'ผู้ปกครอง') +
      chc(f, 'guardian_type') + chc(f, 'parents_status') +
      chc(f, 'family_debt', { after: inl('จำนวน', f, 'family_debt_amount', 'บาท', { money: true }) }) +
      row(fld('ครอบครัวของนักเรียนมีสมาชิกทั้งหมด', f, 'family_members', 6, { unit: 'คน' }), fld('นักเรียนมีพี่น้องทั้งหมด', f, 'siblings_total', 6, { unit: 'คน' })) +
      sub('', 'พี่น้องร่วมบิดามารดาเดียวกัน เรียงลำดับ ดังนี้') +
      tbl(['ชื่อ - สกุล', 'อายุ', 'การศึกษา', 'อาชีพ/ตำแหน่ง', 'รายได้ต่อเดือน (บาท)', 'สถานศึกษาหรือที่ทำงาน', 'สถานภาพ'],
        rowsOf(f, 'siblings_table', ['name', 'age', 'education', 'occupation', 'income', 'workplace', 'status']), { money: [4], widths: ['22%', '7%', '10%', '13%', '13%', '', '10%'] }) +
      group('บุคคลในครอบครัวที่นักเรียนไว้ใจมากที่สุด',
        row(fld('ชื่อ - นามสกุล', f, 'trusted_name', 6), fld('อายุ', f, 'trusted_age', 2, { unit: 'ปี' }), fld('เกี่ยวข้องเป็น', f, 'trusted_relation', 2), fld('โทรศัพท์', f, 'trusted_phone', 2))) +
      chc(f, 'parents_relationship') +
      chc(f, 'substance_abuse', { after: inl('เกี่ยวข้องเป็น', f, 'substance_relation', 'กับนักเรียน') }) +
      sub('', 'แผนที่แสดงการเดินทางจากสถานศึกษาไปบ้าน (โดยสังเขป)') +
      `<div class="pf-mapbox">${E(T(f, 'travel_map_note')) || '<span>พื้นที่สำหรับวาดแผนที่ / แนบรูปถ่ายบ้านผู้รับทุนการศึกษา</span>'}</div>`)

    + sec('4', 'ข้อมูลด้านการเรียนและความสามารถ',
      sub('4.1', 'ประวัติการศึกษา') +
      tbl(['ระดับการศึกษา', 'สถานศึกษา', 'จังหวัด'], rowsOf(f, 'education_history', ['level', 'school', 'province']), { widths: ['24%', '', '24%'] }) +
      note('กรณีเรียนระดับชั้นสูงกว่าหรือเทียบเท่า ให้ปรับแก้ไขเพื่อกรอกข้อมูลตามความเหมาะสม') +
      tbl(['ระดับชั้น/ปี', 'แผนการเรียน/แผนก/สาขาวิชา', 'ครูที่ปรึกษาหรือครูผู้ดูแล'], rowsOf(f, 'study_plan', ['level', 'track', 'advisor']), { blank: 1, widths: ['18%', '', '34%'] }) +
      sub('4.2', 'ข้อมูลผลการเรียน') + gradesTbl(f) +
      note('เป็นข้อมูลผลการเรียนในสถานศึกษาที่เรียนอยู่ในปัจจุบัน แนบรายงานผลการเรียนแต่ละภาคเรียน') +
      sub('4.3', 'ความสามารถพิเศษ') + paraF('', f, 'special_ability') +
      sub('4.4', 'ผลงานดีเด่นและความภาคภูมิใจในปีที่ผ่านมา') + paraF('', f, 'achievement'))

    + sec('5', 'ข้อมูลด้านการดูแลช่วยเหลือที่สถานศึกษาดำเนินการ',
      sub('5.1', 'ทุนการศึกษาอื่นที่ได้รับ') +
      tbl(['ชื่อทุน', 'จำนวนเงิน (บาท)', 'เมื่อปี พ.ศ.'], rowsOf(f, 'other_scholarships', ['name', 'amount', 'year']), { money: [1], blank: 1, widths: ['', '24%', '18%'] }) +
      sub('5.2', 'การหารายได้ระหว่างเรียน') + tbl(['รายละเอียด'], rowsOf(f, 'part_time_income', ['detail']), { blank: 1 }) +
      sub('5.3', 'การได้รับการสอนเสริมพิเศษ') + tbl(['วิชา', 'ช่วงเวลา', 'ผู้สอน'], rowsOf(f, 'extra_tutoring', ['subject', 'time', 'teacher']), { blank: 1 }) +
      sub('5.4', '') + chc(f, 'other_support'))

    + sec('6', 'ความต้องการในการได้รับความช่วยเหลือเพิ่มเติม', tbl(['รายละเอียด'], rowsOf(f, 'additional_needs', ['detail']), { blank: 2 }))
    + sec('7', 'การเข้าร่วมกิจกรรมที่แสดงถึงความสำนึกในพระมหากรุณาธิคุณ', tbl(['รายละเอียด'], rowsOf(f, 'loyalty_activities', ['detail']), { blank: 2 }))

    + sec('8', 'ข้อมูลด้านการรับเงินทุนการศึกษาและการใช้จ่าย',
      row(fld('บัญชีธนาคาร', f, 'bank_name', 6), fld('สาขา', f, 'bank_branch', 6)) +
      row(fld('ชื่อบัญชี', f, 'account_name', 7), fld('เลขที่บัญชี', f, 'account_no', 5, { mono: true })) +
      row(fld('ผู้มีอำนาจสั่งจ่าย คนที่ 1', f, 'signer1', 6), fld('ผู้มีอำนาจสั่งจ่าย คนที่ 2', f, 'signer2', 6)) +
      tbl(['ครั้งที่', 'วันที่ได้รับ', 'จำนวนเงิน', 'ส่วนที่ 1 สถานศึกษาเรียกเก็บ', 'ส่วนที่ 2 ค่าครองชีพ', 'ส่วนที่ 3 กรณีพิเศษเฉพาะราย'],
        rowsOf(f, 'receipts', ['no', 'date', 'amount', 'part1', 'part2', 'part3']), { money: [2, 3, 4, 5], blank: 3, widths: ['9%', '15%', '', '', '', ''] }) +
      certify('ขอรับรองว่าข้อมูลข้างต้นเป็นจริงทุกประการ', [sign('ผู้รับทุนการศึกษา', sfSignName(f, student))]))

    + sec('9', 'ครูที่ปรึกษาหรือครูผู้ดูแลบันทึกความคิดเห็นเพิ่มเติม',
      sub('9.1', 'ด้านการเรียน') + paraF('', f, 'teacher_comment_study') +
      sub('9.2', 'ด้านความประพฤติ') + paraF('', f, 'teacher_comment_behavior') +
      sub('9.3', 'ด้านอื่น ๆ') + paraF('', f, 'teacher_comment_other') +
      certify('ขอรับรองว่าข้อมูลข้างต้นเป็นจริงทุกประการ', [sign('ครูที่ปรึกษาหรือครูผู้ดูแล', T(f, 'teacher_name'),
        [['ตำแหน่ง', T(f, 'teacher_position')], ['สถานศึกษา', T(f, 'teacher_school')], ['โทรศัพท์', T(f, 'teacher_phone')], ['วันที่', T(f, 'teacher_sign_date')]])]));

    return wrapDoc(inner, `แบบฟอร์มที่ 1 แบบรายงานข้อมูลรายบุคคล — ${name}`);
  }

  /* ══════════ แบบฟอร์มที่ 2 ══════════ */
  function printForm2(student) {
    const f = 'form2';
    const fullName = [sfPChoiceText(f, 'prefix'), T(f, 'first_name'), T(f, 'last_name')].filter(Boolean).join(' ') || student.name || '';
    const term = `ภาคเรียนที่ ${T(f, 'semester') || '……'} ปีการศึกษา ${T(f, 'academic_year') || '……'}`;
    const m = id => money(T(f, id));

    const cover = `<div class="pf-cover">` + docHead('2', [
      'รายงานผลการเรียน ความประพฤติ และการใช้จ่ายเงินทุนการศึกษา',
      'ของผู้รับทุนการศึกษามูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์',
      'เนื่องในโอกาสมหามงคลเฉลิมพระชนมพรรษา พระบาทสมเด็จพระเจ้าอยู่หัว ทรงเจริญพระชนมพรรษา 6 รอบ 28 กรกฎาคม 2567',
      '(สำหรับสถานศึกษาจัดทำทุกภาคเรียน)',
    ]) + `<div class="pf-cover-term">${E(term)}</div>
      <div class="pf-cover-card">
        ${row(fldVal('ชื่อ - นามสกุล ผู้รับทุนการศึกษา', fullName, 12))}
        ${row(fld('ระดับชั้น', f, 'grade_level', 4), fld('แผน/แผนก/สาขา', f, 'track', 8))}
        ${row(fld('สถานศึกษา', f, 'school_name', 12))}
        ${row(fld('จังหวัด', f, 'province', 6), fld('สังกัด', f, 'sangkad', 6))}
      </div></div>`;

    const summary = `<section class="pf-sec pf-break">
      <div class="pf-titleblock"><div class="pf-title">สรุปสาระสำคัญรายงานผลการเรียน ความประพฤติ และการใช้จ่ายเงินทุนการศึกษา</div><div class="pf-subtitle">${E(term)}</div></div>
      <h3><span class="pf-no">1</span>สรุปรายงานผลการเรียนของนักเรียนทุนการศึกษา</h3>
      ${row(fldVal('ชื่อ - นามสกุล', fullName, 6), fld('ปัจจุบันเรียนระดับชั้น', f, 'grade_level', 3), fld('แผน/แผนก/สาขา', f, 'track', 3))}
      ${row(fld('สถานศึกษา', f, 'school_name', 6), fld('จังหวัด', f, 'province', 3), fld('สังกัด', f, 'sangkad', 3))}
      ${paraF('ปัญหาอุปสรรคที่ส่งผลต่อการเรียน', f, 'learning_problems')}
      ${paraF('ปัจจุบันได้รับความช่วยเหลือจากโรงเรียนด้าน', f, 'current_help')}
      <h3><span class="pf-no">2</span>สรุปรายงานความประพฤติของนักเรียนทุนการศึกษา</h3>
      ${para('', [T(f, 'activities_participation'), T(f, 'community_loyalty')].filter(Boolean).join('\n'))}
      <h3><span class="pf-no">3</span>สรุปรายงานการใช้จ่ายเงินทุนการศึกษา</h3>
      <table class="pf-table pf-money">
        <tbody>
          <tr class="pf-strong"><th scope="row">เงินทุนการศึกษาที่ได้รับรวมทั้งสิ้น</th><td class="num">${m('total_received') || '&nbsp;'}</td><td class="unit">บาท</td></tr>
          <tr class="pf-strong"><th scope="row">เบิกจ่ายไปแล้วจนถึงปัจจุบันรวมทั้งสิ้น</th><td class="num">${m('total_disbursed') || '&nbsp;'}</td><td class="unit">บาท</td></tr>
          <tr><th scope="row" class="pf-indent">3.1 ส่วนที่ 1 ค่าใช้จ่ายที่สถานศึกษาเรียกเก็บ</th><td class="num">${m('part1_amount') || '&nbsp;'}</td><td class="unit">บาท</td></tr>
          <tr><th scope="row" class="pf-indent">3.2 ส่วนที่ 2 ค่าใช้จ่ายครองชีพประจำตัว</th><td class="num">${m('part2_amount') || '&nbsp;'}</td><td class="unit">บาท</td></tr>
          <tr><th scope="row" class="pf-indent">3.3 ส่วนที่ 3 ค่าใช้จ่ายที่จำเป็นอย่างยิ่งต่อการเรียนเป็นกรณีพิเศษเฉพาะราย</th><td class="num">${m('part3_amount') || '&nbsp;'}</td><td class="unit">บาท</td></tr>
          <tr class="pf-total"><th scope="row">ยอดคงเหลือ ณ วันที่ ${E(T(f, 'balance_date')) || '……………………'}</th><td class="num">${m('balance') || '&nbsp;'}</td><td class="unit">บาท</td></tr>
        </tbody>
      </table>
      ${certify('ขอรับรองว่าเป็นความจริงทุกประการ', [
        sign('ครูที่ปรึกษาหรือครูผู้ดูแล', T(f, 'teacher_name'), [['ตำแหน่ง', T(f, 'teacher_position')], ['โทรศัพท์', T(f, 'teacher_phone')], ['วันที่', T(f, 'teacher_sign_date')]]),
        sign('ผู้อำนวยการสถานศึกษา', T(f, 'director_name'), [['วันที่', T(f, 'director_sign_date')]]),
      ])}
    </section>`;

    const detail = `<div class="pf-titleblock pf-break"><div class="pf-title">รายงานผลการเรียน ความประพฤติ และการใช้จ่ายเงินทุนการศึกษา</div><div class="pf-subtitle">${E(term)}</div></div>`
      + sec('', 'ข้อมูลทั่วไป',
        row(fldVal('1. ชื่อ - นามสกุล', fullName, 8), fld('ชื่อเล่น', f, 'nickname', 4)) +
        row(fld('เลขประจำตัวประชาชน', f, 'national_id', 6, { mono: true }), fld('วัน เดือน ปีเกิด', f, 'dob', 6)) +
        row(fld('2. สถานศึกษา', f, 'school_name', 8), fld('อำเภอ', f, 'amphoe', 4)) +
        row(fld('จังหวัด', f, 'province', 4), fld('สังกัด', f, 'sangkad', 4), fld('ระดับชั้น', f, 'grade_level', 4)))
      + sec('', 'ข้อมูลผลการเรียน',
        sub('3', 'ข้อมูลผลการเรียน (โปรดแนบรายละเอียดรายงานผลการเรียนรายวิชาที่สถานศึกษารับรองแล้ว)') + gradesTbl(f) +
        sub('4', 'ปัญหาอุปสรรคที่ส่งผลต่อการเรียนที่เป็นสาเหตุให้มีคะแนนผลการเรียนลดลง') + paraF('', f, 'learning_problems') +
        sub('5', 'การดูแลช่วยเหลือที่สถานศึกษาดำเนินการ (เลือกได้มากกว่า 1 ข้อ)') +
        `<div class="pf-q">จัดสอนเสริมพิเศษ ได้แก่</div>` +
        tbl(['วิชา', 'ช่วงเวลา', 'ผู้สอน'], rowsOf(f, 'tutoring', ['subject', 'time', 'teacher']), { blank: 1 }) +
        `<div class="pf-q">จัดหาเงินทุนจากแหล่งอื่นเพิ่มเติม ได้แก่</div>` +
        tbl(['แหล่งทุน', 'จำนวนเงิน (บาท)'], rowsOf(f, 'extra_funding', ['source', 'amount']), { money: [1], blank: 1, widths: ['', '28%'] }) +
        chc(f, 'support_other', { label: 'การดูแลช่วยเหลืออื่น ๆ' }) +
        sub('6', 'ความต้องการในการได้รับความช่วยเหลือเพิ่มเติม จากสถานศึกษา ครู หรือ อื่น ๆ') + paraF('', f, 'additional_needs') +
        sub('7', 'ความคาดหวังด้านการศึกษา') + paraF('', f, 'expect_education') +
        sub('8', 'ความคาดหวังด้านอาชีพในอนาคต') + paraF('', f, 'expect_career') +
        sub('9', 'ผลงานดีเด่น ความภาคภูมิใจ ในปีที่ผ่านมา') + paraF('', f, 'achievement'))
      + sec('', 'ข้อมูลความประพฤติ',
        sub('10', 'การเข้าร่วมกิจกรรมต่าง ๆ ของสถานศึกษาในภาคเรียนปัจจุบัน') + paraF('', f, 'activities_participation') +
        sub('11', 'งานที่ต้องรับผิดชอบดูแลช่วยเหลือครอบครัวในด้านต่าง ๆ') + paraF('', f, 'family_responsibility') +
        sub('12', 'การมีส่วนร่วมในการดำเนินกิจกรรมที่เป็นประโยชน์ต่อชุมชนและสังคม ตลอดจนการแสดงถึงความจงรักภักดีต่อสถาบันพระมหากษัตริย์') + paraF('', f, 'community_loyalty'))
      + sec('', 'ข้อมูลด้านการรับเงินทุนการศึกษาและการใช้จ่าย',
        sub('13', 'บัญชีรับเงินทุน') +
        row(fld('บัญชีธนาคาร', f, 'bank_name', 6), fld('สาขา', f, 'bank_branch', 6)) +
        row(fld('ชื่อบัญชี', f, 'account_name', 7), fld('เลขที่บัญชี', f, 'account_no', 5, { mono: true })) +
        row(fld('ผู้มีอำนาจสั่งจ่าย คนที่ 1', f, 'signer1', 6), fld('ผู้มีอำนาจสั่งจ่าย คนที่ 2', f, 'signer2', 6)) +
        sub('14', 'รายงานการรับเงินทุนการศึกษาและการใช้จ่าย (โปรดแนบสำเนาสมุดบัญชีเงินฝากธนาคารที่แสดงยอด ณ วันที่รายงาน)') +
        tbl(['ครั้งที่', 'วันที่ได้รับ', 'จำนวนเงิน', 'ส่วนที่ 1 สถานศึกษาเรียกเก็บ', 'ส่วนที่ 2 ค่าครองชีพ', 'ส่วนที่ 3 กรณีพิเศษเฉพาะราย'],
          rowsOf(f, 'receipts', ['no', 'date', 'amount', 'part1', 'part2', 'part3']), { money: [2, 3, 4, 5], blank: 3, widths: ['9%', '15%', '', '', '', ''] }) +
        certify('ขอรับรองว่าข้อมูลข้างต้นเป็นจริงทุกประการ', [sign('ผู้รับทุนการศึกษา', sfSignName(f, student))]))
      + sec('', 'ข้อคิดเห็นเพิ่มเติมของครูที่ปรึกษาหรือครูผู้ดูแล',
        sub('15', 'ด้านการเรียนของผู้รับทุนการศึกษา') + paraF('', f, 'teacher_comment_study') +
        sub('16', 'ด้านความประพฤติและการปฏิบัติตนของผู้รับทุนการศึกษา') + paraF('', f, 'teacher_comment_behavior') +
        sub('17', 'การรับรองและข้อคิดเห็นเพิ่มเติมของครูที่ปรึกษาหรือครูผู้ดูแล ในการใช้จ่ายเงินทุนการศึกษาของผู้รับทุนการศึกษา') + paraF('', f, 'teacher_comment_expense') +
        certify('ขอรับรองว่าข้อมูลข้างต้นเป็นจริงทุกประการ และได้กำกับ ดูแล ตรวจสอบการเบิกจ่ายเงินของผู้รับทุนการศึกษาตามเงื่อนไขข้อกำหนด',
          [sign('ครูที่ปรึกษาหรือครูผู้ดูแล', T(f, 'teacher_name'), [['ตำแหน่ง', T(f, 'teacher_position')], ['วันที่', T(f, 'teacher_sign_date')]])]));

    return wrapDoc(cover + summary + detail, `แบบฟอร์มที่ 2 รายงานผลการเรียน ความประพฤติ และการใช้จ่าย — ${fullName} — ${term}`);
  }

  /* ══════════ ติดตั้ง ══════════ */
  if (typeof sfPrintForm1 === 'function') sfPrintForm1 = printForm1;
  if (typeof sfPrintForm2 === 'function') sfPrintForm2 = printForm2;

  // ตัวอย่างก่อนพิมพ์: ใช้กระดาษแผ่นเดียวยาวต่อเนื่อง (ตัดหน้าจริงตอนพิมพ์)
  if (typeof sfRenderPreviewBody === 'function') {
    const _orig = sfRenderPreviewBody;
    sfRenderPreviewBody = function () {
      _orig.apply(this, arguments);
      const body = document.getElementById('sf-modal-body');
      const pages = body && body.querySelector('.sf-preview-pages');
      if (pages && pages.querySelector('.pf-doc')) pages.classList.add('pf-preview');
    };
  }
  window.PrintLayout = { form1: printForm1, form2: printForm2 };
})();
