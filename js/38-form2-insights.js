/* ============================================================
   38-form2-insights.js — Dashboard: วิเคราะห์ข้อมูลจากแบบฟอร์มที่ 2
   ------------------------------------------------------------
   แหล่งข้อมูล (แบบฟอร์มที่ 2 ส่วน "การดูแลช่วยเหลือ ความต้องการ และความคาดหวัง")
     expect_career     ความคาดหวังด้านอาชีพในอนาคต (ข้อความ)
     additional_needs  ความต้องการความช่วยเหลือเพิ่มเติม จากสถานศึกษา ครู หรืออื่น ๆ (ข้อความ)
     expect_education  ความคาดหวังด้านการศึกษา (ข้อความ)
     support_other     การดูแลช่วยเหลืออื่น ๆ (ตัวเลือก) · tutoring สอนเสริม (ตาราง) · extra_funding ทุนอื่น (ตาราง)
   วิธีวิเคราะห์ (ทำในเบราว์เซอร์ ไม่ส่งข้อมูลออกนอกระบบ)
     • เชิงปริมาณ: จัดหมวดข้อความด้วยคำสำคัญภาษาไทย (1 คนอยู่ได้หลายหมวด) → จำนวน/ร้อยละ
     • เชิงคุณภาพ: ข้อความตัวอย่างของแต่ละหมวด (กดดูทั้งหมด), คำที่พบบ่อย, สรุปประเด็นอัตโนมัติ
       และข้อเสนอแนะการดูแลจากผลการวิเคราะห์ (เชื่อมกับกลุ่มการดูแล GPA + SDQ)
   ข้อความที่ไม่เข้าหมวดใด → "อื่น ๆ" (ไม่ตกหล่น ดูข้อความจริงได้เสมอ)
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tkey = t => { const m = String(t || '').match(/(\d)\/(\d{4})/); return m ? +m[2] * 10 + +m[1] : 0; };
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const EMPTY_RE = /^(\s*[-–—.]*\s*|ไม่มี|ไม่ระบุ|ไม่ทราบ|n\/?a)$/i;

  /* ---------- พจนานุกรมหมวด (คำสำคัญ) ---------- */
  const CAREER = [
    ['vet', 'สัตวแพทย์', /สัตวแพทย์|หมอ\s*สัตว์|หมอรักษาสัตว์/],
    ['med', 'แพทย์ / พยาบาล / สาธารณสุข', /(?<!สัตว)แพทย์|หมอ(?!ดู)|พยาบาล|เภสัช|ทันต|สาธารณสุข|กายภาพ|เทคนิคการแพทย์|รังสี|ผดุงครรภ์|นักโภชนา|บุคลากรทางการแพทย์/],
    ['teach', 'ครู / อาจารย์ / การศึกษา', /ครู|อาจารย์|นักการศึกษา|ศึกษานิเทศก์|บรรณารักษ์/],
    ['eng', 'วิศวกร / สถาปนิก', /วิศว|สถาปนิก|สถาปัตย/],
    ['it', 'คอมพิวเตอร์ / เทคโนโลยี / ดิจิทัล', /โปรแกรม|คอมพิวเตอร์|คอม|ไอที|\bit\b|เทคโนโลยี|ซอฟต์แวร์|เกม|ดิจิทัล|\bai\b|นักพัฒนา|developer|ยูทูบ|youtube|สตรีม|ครีเอเตอร์|อินฟลู/i],
    ['sec', 'ทหาร / ตำรวจ / ความมั่นคง', /ทหาร|ตำรวจ|นายร้อย|นักเรียนนาย|เตรียมทหาร|นายสิบ|ดับเพลิง|กู้ภัย|นักบิน|ราชนาวี|อากาศโยธิน/],
    ['gov', 'ข้าราชการ / พนักงานรัฐ', /ข้าราชการ|รับราชการ|ราชการ|ปลัด|นักปกครอง|นายอำเภอ|พนักงานรัฐ|รัฐวิสาหกิจ/],
    ['law', 'กฎหมาย / บัญชี / การเงิน', /ทนาย|กฎหมาย|อัยการ|ผู้พิพากษา|นิติ|บัญชี|การเงิน|ธนาคาร|เศรษฐ/],
    ['biz', 'ธุรกิจ / ค้าขาย / ผู้ประกอบการ', /ธุรกิจ|ค้าขาย|ขายของ|ผู้ประกอบการ|เจ้าของ(กิจการ|ร้าน|บริษัท)|นักการตลาด|การตลาด|แม่ค้า|พ่อค้า|เถ้าแก่/],
    ['art', 'ศิลปะ / สื่อ / ออกแบบ / บันเทิง', /ศิลป|นักร้อง|นักดนตรี|ดนตรี|นักแสดง|ออกแบบ|ดีไซน์|กราฟิก|ช่างภาพ|ถ่ายภาพ|นักเขียน|นักข่าว|ผู้ประกาศ|สื่อ|แอนิเมชัน|นักวาด|วาดรูป/],
    ['sport', 'นักกีฬา / โค้ช', /นักกีฬา|กีฬา|ฟุตบอล|นักฟุตบอล|วอลเลย์|มวย|โค้ช|ผู้ฝึกสอน/],
    ['svc', 'อาหาร / ท่องเที่ยว / บริการ', /เชฟ|ทำอาหาร|พ่อครัว|แม่ครัว|ทำขนม|เบเกอรี่|โรงแรม|ท่องเที่ยว|ไกด์|มัคคุเทศก์|แอร์โฮสเตส|สจ๊วต|ลูกเรือ|บาริสต้า|ช่างเสริมสวย|ช่างตัดผม/],
    ['tech', 'ช่าง / อาชีวะ', /ช่าง(?!ภาพ|เสริมสวย|ตัดผม)|ช่างยนต์|ช่างไฟ|ช่างเชื่อม|ช่างกล|อิเล็กทรอนิกส์/],
    ['sci', 'นักวิทยาศาสตร์ / นักวิจัย', /นักวิทยาศาสตร์|วิทยาศาสตร์|นักวิจัย|วิจัย|นักเคมี|นักชีว|นักฟิสิกส์|ดาราศาสตร์/],
    ['agri', 'เกษตร / ประมง / สิ่งแวดล้อม', /เกษตร|ชาวนา|ชาวสวน|ทำสวน|ทำไร่|ปศุสัตว์|ประมง|ป่าไม้|สิ่งแวดล้อม/],
    ['abroad', 'ทำงานต่างประเทศ / ภาษา', /ต่างประเทศ|ล่าม|นักแปล|ภาษาอังกฤษ|ภาษาจีน|ภาษาญี่ปุ่น|ภาษาเกาหลี|สายการบิน/],
    ['unsure', 'ยังไม่แน่ใจ / ยังไม่ได้ตัดสินใจ', /ยังไม่(แน่ใจ|ได้ตัดสินใจ|ทราบ|รู้|มีเป้าหมาย)|ไม่แน่ใจ|ยังไม่ชัดเจน|กำลังค้นหา/]
  ];
  const NEED = [
    ['money', 'ทุน / ค่าใช้จ่าย / การเงิน', /ทุน|เงิน|ค่าใช้จ่าย|ค่าเทอม|ค่าบำรุง|ค่าเดินทาง|ค่าครองชีพ|ค่าอาหาร|ค่าหอ|ค่าธรรมเนียม|ค่าเรียน|ค่าหนังสือ|ค่าชุด/],
    ['equip', 'อุปกรณ์การเรียน / เทคโนโลยี', /อุปกรณ์|คอมพิวเตอร์|โน้ตบุ๊ก|โน๊ตบุ๊ค|notebook|แท็บเล็ต|แทปเล็ต|ไอแพด|ipad|โทรศัพท์|มือถือ|อินเทอร์เน็ต|อินเตอร์เน็ต|wifi|หนังสือ|ตำรา|เครื่องเขียน|เครื่องแบบ|ชุดนักเรียน|รองเท้า|กระเป๋า|จักรยาน/i],
    ['tutor', 'สอนเสริม / ติวเตอร์ / วิชาการ', /สอนเสริม|ติว|เรียนพิเศษ|สอนพิเศษ|ทบทวน|การบ้าน|วิชา|คณิต|อังกฤษ|วิทยาศาสตร์|ฟิสิกส์|เคมี|ชีว|ภาษาไทย|สังคม|ซ่อมเสริม|เสริมความรู้|อ่อน/],
    ['guide', 'แนะแนว / ศึกษาต่อ / เตรียมสอบ', /แนะแนว|ศึกษาต่อ|เรียนต่อ|สอบเข้า|เตรียมสอบ|มหาวิทยาลัย|tcas|ทีแคส|รับตรง|โควตา|เป้าหมาย|อาชีพ(?!เสริม)|ค้นหาตัวเอง/i],
    ['care', 'กำลังใจ / คำปรึกษา / ดูแลใกล้ชิด', /กำลังใจ|ปรึกษา|คำแนะนำ|แนะนำ|ดูแล|ใส่ใจ|เอาใจใส่|ติดตาม|เยี่ยมบ้าน|จิตใจ|ความเครียด|เครียด|รับฟัง/],
    ['live', 'ที่พัก / การเดินทาง', /ที่พัก|หอพัก|บ้านพัก|รถรับส่ง|เดินทาง|ยานพาหนะ|ระยะทาง/],
    ['health', 'อาหาร / สุขภาพ', /อาหาร|อาหารกลางวัน|สุขภาพ|รักษา|แว่น|ทำฟัน|โรค|ป่วย/],
    ['work', 'รายได้ระหว่างเรียน / ฝึกอาชีพ', /หารายได้|รายได้|ทำงาน|งานพิเศษ|ฝึกอาชีพ|อาชีพเสริม|ฝึกงาน|ทักษะอาชีพ/],
    ['family', 'ครอบครัว / ผู้ปกครอง', /ครอบครัว|ผู้ปกครอง|บิดา|มารดา|คุณพ่อ|คุณแม่|ปู่|ย่า|ยาย|น้อง/],
    ['activity', 'กิจกรรม / ทักษะ / พัฒนาตนเอง', /กิจกรรม|ค่าย|ทักษะ|พัฒนาตน|แข่งขัน|ประกวด|ศึกษาดูงาน|ทัศนศึกษา/],
    ['enough', 'ไม่ต้องการเพิ่มเติม / เพียงพอแล้ว', /เพียงพอ|พอแล้ว|ไม่ต้องการ|ไม่มีความต้องการ|ดีอยู่แล้ว|ได้รับครบ/]
  ];
  const EDU = [
    ['grad', 'สูงกว่าปริญญาตรี', /ปริญญาโท|ปริญญาเอก|ป\.โท|ป\.เอก|ดุษฎี|มหาบัณฑิต/],
    ['ba', 'ปริญญาตรี / มหาวิทยาลัย', /ปริญญาตรี|ป\.ตรี|มหาวิทยาลัย|มหาลัย|คณะ|บัณฑิต|จุฬา|ธรรมศาสตร์|มหิดล|เกษตรศาสตร์|ขอนแก่น|เชียงใหม่|สงขลา/],
    ['voc', 'สายอาชีพ (ปวช./ปวส.)', /ปวช|ปวส|อาชีวะ|อาชีวศึกษา|วิทยาลัยเทคนิค|เทคนิค|สารพัดช่าง|พาณิชย/],
    ['mil', 'โรงเรียนทหาร / ตำรวจ', /เตรียมทหาร|นายร้อย|นายสิบ|โรงเรียนตำรวจ|นักเรียนนาย/],
    ['hs', 'จบ ม.6 / ม.ปลาย', /ม\.?\s?6|มัธยมศึกษาตอนปลาย|ม\.ปลาย|ม\.4|สายวิทย์|สายศิลป์/],
    ['good', 'ตั้งใจเรียน / ผลการเรียนดีขึ้น', /เกรด|ผลการเรียน|ตั้งใจเรียน|เรียนเก่ง|สอบได้|คะแนน|ดีขึ้น/]
  ];
  const SUGGEST = {
    money: 'ทบทวนแผนการเบิกจ่าย และประสานแหล่งทุนเสริมสำหรับผู้ที่ระบุความต้องการด้านการเงิน',
    equip: 'สำรวจรายการอุปกรณ์ที่ต้องการ (เช่น คอมพิวเตอร์ อินเทอร์เน็ต หนังสือ) เพื่อจัดหาหรือขอรับบริจาค',
    tutor: 'ประสานโรงเรียนจัดสอนเสริมในวิชาที่ถูกระบุบ่อย และติดตามผลการเรียนภาคถัดไป',
    guide: 'จัดกิจกรรมแนะแนวการศึกษาต่อ/เตรียมสอบ ให้สอดคล้องกับสายอาชีพที่นักเรียนคาดหวัง',
    care: 'ให้พี่เลี้ยง/ครูที่ปรึกษาติดตามใกล้ชิด พูดคุยให้กำลังใจ และเยี่ยมบ้านตามความเหมาะสม',
    live: 'ตรวจสอบปัญหาการเดินทาง/ที่พัก และพิจารณาค่าเดินทางหรือที่พักในสถานศึกษา',
    health: 'ประสานโรงเรียนเรื่องอาหารกลางวันและการดูแลสุขภาพ',
    work: 'เชื่อมโยงกิจกรรมฝึกอาชีพหรือหารายได้ระหว่างเรียนที่ไม่กระทบการเรียน',
    family: 'ประสานผู้ปกครองเพื่อร่วมวางแผนการดูแลนักเรียน',
    activity: 'สนับสนุนการเข้าร่วมค่าย/กิจกรรมพัฒนาทักษะตามความสนใจ'
  };
  const STOP = new Set(('และ ที่ ใน การ ให้ มี เป็น ได้ ของ จะ ไป กับ อยาก เพื่อ ความ ต้องการ ด้าน หรือ ทำ นักเรียน อื่น ๆ คน เรียน ได้รับ จาก ครู โรงเรียน ' +
    'สถานศึกษา อยู่ แล้ว ไม่ มาก ขึ้น เพิ่ม เพิ่มเติม ช่วย เหลือ ช่วยเหลือ เรื่อง ใน ตัว เอง ตนเอง ต่อ โดย มา นี้ นั้น ซึ่ง อย่าง ทุก ๆ ก็ แต่ ถ้า ว่า เมื่อ ด้วย ยัง ตาม ' +
    'หนู ผม ดิฉัน เขา เรา ฉัน คือ คะ ครับ ค่ะ จึง อาชีพ อนาคต ทำงาน การศึกษา').split(/\s+/));

  /* ---------- เก็บข้อมูล ---------- */
  const st = { term: 'latest', open: null, wordTab: 'career' };
  const isEmpty = v => v == null || EMPTY_RE.test(String(v).trim());
  const text = v => (typeof v === 'string' && !isEmpty(v)) ? v.trim() : '';
  function form2Of(s, term) {
    const forms = s.forms || {};
    const pick = t => { const f = forms[t] && forms[t].form2; return f && typeof f === 'object' ? f : null; };
    const has = f => f && (text(f.expect_career) || text(f.additional_needs) || text(f.expect_education)
      || (f.support_other && ((f.support_other.selected || []).length || text(f.support_other.other))));
    if (term !== 'latest') { const f = pick(term); return has(f) ? { term, f } : null; }
    const terms = Object.keys(forms).filter(t => /\d\/\d{4}/.test(t)).sort((a, b) => tkey(b) - tkey(a));
    for (const t of terms) { const f = pick(t); if (has(f)) return { term: t, f }; }
    return null;
  }
  function classify(str, dict) {
    if (!str) return [];
    const hit = dict.filter(([, , re]) => re.test(str)).map(([k]) => k);
    return hit.length ? hit : ['other'];
  }
  function tableRows(v) { return Array.isArray(v) ? v.map(r => (r && r.cells) || {}).filter(c => Object.values(c).some(x => String(x || '').trim())) : []; }

  function collect() {
    const out = [];
    (DB.students || []).forEach((s, idx) => {
      const x = form2Of(s, st.term);
      if (!x) return;
      const f = x.f;
      const career = text(f.expect_career), needs = text(f.additional_needs), edu = text(f.expect_education);
      const so = f.support_other || {};
      const sent = !!(window.Term && Term.state && Term.state(s, 'form2', x.term) === 'submitted');
      let care = null; try { care = window.CareGroup ? CareGroup.compute(s) : null; } catch (e) {}
      out.push({ s, idx, term: x.term, sent, career, needs, edu, care,
        careerCat: classify(career, CAREER), needCat: classify(needs, NEED), eduCat: classify(edu, EDU),
        support: (so.selected || []).slice(), supportOther: text(so.other),
        tutoring: tableRows(f.tutoring), funding: tableRows(f.extra_funding) });
    });
    return out;
  }
  function tally(rows, field, dict) {
    const m = new Map();
    rows.forEach(r => r[field].forEach(k => { if (!m.has(k)) m.set(k, []); m.get(k).push(r); }));
    const name = k => k === 'other' ? 'อื่น ๆ (ไม่เข้าหมวด)' : (dict.find(d => d[0] === k) || [, k])[1];
    return [...m.entries()].map(([k, list]) => ({ k, name: name(k), list, n: list.length }))
      .sort((a, b) => (a.k === 'other') - (b.k === 'other') || b.n - a.n);
  }
  function topWords(strs, n) {
    const cnt = new Map();
    const seg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
    strs.forEach(t => {
      const words = seg ? [...seg.segment(t)].filter(x => x.isWordLike).map(x => x.segment) : t.split(/[\s,./()]+/);
      new Set(words.map(w => w.trim().toLowerCase()).filter(w => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w))).forEach(w => cnt.set(w, (cnt.get(w) || 0) + 1));
    });
    return [...cnt.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, n);
  }
  const short = (t, n) => { t = String(t).replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

  /* ---------- วาด ---------- */
  function bars(id, items, total, color) {
    if (!items.length) return '<p class="fx-none">ยังไม่มีข้อมูลในหัวข้อนี้</p>';
    const max = Math.max(...items.map(i => i.n));
    return `<ul class="fx-bars">${items.map(i => {
      const key = id + ':' + i.k, open = st.open === key;
      const quotes = open ? `<div class="fx-quotes">${i.list.slice(0, 40).map(r => {
        const t = id === 'career' ? r.career : id === 'need' ? r.needs : r.edu;
        return `<blockquote><p>“${E(short(t, 220))}”</p><footer><button type="button" class="fx-who" data-fx-open="${r.idx}">${E(r.s.name || '')}</button> · ${E(r.s.school_m1 || '-')} · ${E(r.term)}</footer></blockquote>`;
      }).join('')}${i.list.length > 40 ? `<div class="fx-more">และอีก ${i.list.length - 40} คน (ดูทั้งหมดในไฟล์ CSV)</div>` : ''}</div>` : '';
      return `<li class="${open ? 'open' : ''}">
        <button type="button" class="fx-bar" data-fx-cat="${key}" aria-expanded="${open}">
          <span class="fx-bar-name">${E(i.name)}</span>
          <span class="fx-bar-track"><span style="width:${(i.n / max * 100).toFixed(1)}%;background:${color}"></span></span>
          <span class="fx-bar-n"><b>${i.n}</b> คน <small>${pct(i.n, total)}%</small></span>
          <span class="fx-bar-chev" aria-hidden="true">›</span>
        </button>${quotes}</li>`;
    }).join('')}</ul>`;
  }
  function narrative(rows, cT, nT, eT, careRows) {
    const pts = [];
    const cN = rows.filter(r => r.career).length, nN = rows.filter(r => r.needs).length;
    const named = cT.filter(x => x.k !== 'other' && x.k !== 'unsure');
    if (named.length) {
      const [a, b, c] = named;
      pts.push(`<b>ด้านอาชีพ:</b> จาก ${cN} คนที่ระบุ สนใจ <b>${E(a.name)}</b> มากที่สุด (${a.n} คน, ${pct(a.n, cN)}%)`
        + (b ? ` รองลงมาคือ ${E(b.name)} (${b.n} คน)` : '') + (c ? ` และ ${E(c.name)} (${c.n} คน)` : ''));
    }
    const uns = cT.find(x => x.k === 'unsure');
    if (uns) pts.push(`<b>${uns.n} คน (${pct(uns.n, cN)}%) ยังไม่แน่ใจเรื่องอาชีพ</b> — กลุ่มที่ควรได้รับการแนะแนวอาชีพเป็นพิเศษ`);
    const needNamed = nT.filter(x => x.k !== 'other' && x.k !== 'enough');
    if (needNamed.length) {
      pts.push(`<b>ความต้องการเพิ่มเติม:</b> พบมากที่สุดคือ <b>${E(needNamed[0].name)}</b> (${needNamed[0].n} คน, ${pct(needNamed[0].n, nN)}%)`
        + (needNamed[1] ? ` รองลงมาคือ ${E(needNamed[1].name)} (${needNamed[1].n} คน)` : '') + (needNamed[2] ? ` และ ${E(needNamed[2].name)} (${needNamed[2].n} คน)` : ''));
    }
    const en = nT.find(x => x.k === 'enough');
    if (en) pts.push(`${en.n} คนระบุว่าการช่วยเหลือที่ได้รับเพียงพอแล้ว`);
    const ba = eT.filter(x => ['ba', 'grad'].includes(x.k)).reduce((a, x) => a + x.n, 0), eN = rows.filter(r => r.edu).length;
    if (eN) pts.push(`<b>ด้านการศึกษา:</b> ${pct(ba, eN)}% ของผู้ที่ระบุ ตั้งเป้าเรียนถึงระดับปริญญาตรีขึ้นไป`
      + ((eT.find(x => x.k === 'voc') || {}).n ? ` · สายอาชีพ ${(eT.find(x => x.k === 'voc')).n} คน` : ''));
    if (careRows.length) {
      const t2 = tally(careRows, 'needCat', NEED).filter(x => x.k !== 'other' && x.k !== 'enough');
      pts.push(`<b>กลุ่มต้องดูแล/เฝ้าระวัง (${careRows.length} คนที่มีข้อมูล):</b> `
        + (t2.length ? `ต้องการ ${t2.slice(0, 3).map(x => `${E(x.name)} (${x.n})`).join(', ')}` : 'ยังไม่ได้ระบุความต้องการเพิ่มเติม'));
    }
    return pts;
  }
  function suggestions(nT, cT, tutorSubjects) {
    const out = [];
    nT.filter(x => SUGGEST[x.k]).slice(0, 4).forEach(x => {
      let t = SUGGEST[x.k];
      if (x.k === 'tutor' && tutorSubjects.length) t += ` (วิชาที่พบบ่อย: ${tutorSubjects.slice(0, 3).map(([w]) => w).join(', ')})`;
      if (x.k === 'guide') { const top = cT.filter(c => !['other', 'unsure'].includes(c.k)).slice(0, 2).map(c => c.name); if (top.length) t += ` เช่น ${top.join(' และ ')}`; }
      out.push({ t, n: x.n, name: x.name });
    });
    const uns = cT.find(x => x.k === 'unsure');
    if (uns && !out.some(o => /แนะแนว/.test(o.t))) out.push({ t: 'จัดกิจกรรมสำรวจความถนัดและแนะแนวอาชีพ สำหรับนักเรียนที่ยังไม่แน่ใจเรื่องอาชีพ', n: uns.n, name: uns.name });
    return out;
  }

  function render() {
    const page = document.getElementById('page-dashboard');
    const anchor = document.getElementById('dash-metrics');
    if (!page || !anchor || window.STUDENT_MODE) return;
    let box = document.getElementById('dx-f2');
    if (!box) { box = document.createElement('section'); box.id = 'dx-f2'; box.className = 'fx'; anchor.insertAdjacentElement('afterend', box); bind(box); }
    const rows = collect();
    const N = (DB.students || []).length;
    const terms = [...new Set((DB.students || []).flatMap(s => Object.keys(s.forms || {})))].filter(t => /\d\/\d{4}/.test(t)).sort((a, b) => tkey(b) - tkey(a));
    const cRows = rows.filter(r => r.career), nRows = rows.filter(r => r.needs), eRows = rows.filter(r => r.edu);
    const cT = tally(cRows, 'careerCat', CAREER), nT = tally(nRows, 'needCat', NEED), eT = tally(eRows, 'eduCat', EDU);
    const careRows = rows.filter(r => r.care && r.care.severity >= 1);
    // การช่วยเหลือที่ได้รับ (ตัวเลือก/ตาราง)
    const supp = new Map(); rows.forEach(r => r.support.forEach(o => supp.set(o, (supp.get(o) || 0) + 1)));
    const suppOther = rows.filter(r => r.supportOther).length;
    const tutorRows = rows.filter(r => r.tutoring.length);
    const tutorSubjects = [...rows.flatMap(r => r.tutoring.map(c => String(c.subject || '').trim())).filter(Boolean)
      .reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const fundRows = rows.filter(r => r.funding.length);
    const fundSum = rows.reduce((a, r) => a + r.funding.reduce((x, c) => x + (parseFloat(String(c.amount || '').replace(/[^\d.]/g, '')) || 0), 0), 0);
    const words = topWords((st.wordTab === 'career' ? cRows.map(r => r.career) : st.wordTab === 'need' ? nRows.map(r => r.needs) : eRows.map(r => r.edu)), 24);
    const maxW = words.length ? words[0][1] : 1, minW = words.length ? words[words.length - 1][1] : 1;
    const wScale = c => maxW === minW ? .35 : (c - minW) / (maxW - minW);
    const pts = narrative(rows, cT, nT, eT, careRows);
    const sug = suggestions(nT, cT, tutorSubjects);
    const sent = rows.filter(r => r.sent).length;
    const money = n => (typeof fmt === 'function') ? fmt(n) : Math.round(n).toLocaleString('th-TH');

    box.innerHTML = `
      <header class="fx-head">
        <div><h3>วิเคราะห์จากแบบฟอร์มที่ 2: ความคาดหวังและความต้องการของนักเรียน</h3>
          <p>สรุปเชิงปริมาณ (จำนวน/ร้อยละ) และเชิงคุณภาพ (ข้อความจริง คำที่พบบ่อย ข้อเสนอแนะ) · กดแต่ละหมวดเพื่ออ่านข้อความของนักเรียน</p></div>
        <div class="fx-tools">
          <select class="fx-sel" data-fx-term aria-label="ภาคเรียน"><option value="latest" ${st.term === 'latest' ? 'selected' : ''}>ล่าสุดของแต่ละคน</option>
            ${terms.map(t => `<option value="${t}" ${st.term === t ? 'selected' : ''}>${E(window.Term && Term.label ? Term.label(t) : t)}</option>`).join('')}</select>
          <button type="button" class="fx-btn" data-fx-csv>ส่งออก CSV</button>
        </div>
      </header>
      <div class="fx-cover">
        <div><b>${rows.length}</b><span>จาก ${N} คน มีข้อมูลแบบฟอร์มที่ 2</span></div>
        <div><b>${cRows.length}</b><span>ระบุความคาดหวังด้านอาชีพ</span></div>
        <div><b>${nRows.length}</b><span>ระบุความต้องการเพิ่มเติม</span></div>
        <div><b>${eRows.length}</b><span>ระบุความคาดหวังด้านการศึกษา</span></div>
        <div><b>${sent}</b><span>ฉบับที่ส่งแล้ว</span></div>
      </div>
      ${rows.length ? `
      <div class="fx-grid2">
        <article class="fx-card fx-summary">
          <h4>สรุปประเด็นสำคัญ</h4>
          <ul class="fx-points">${pts.map(p => `<li>${p}</li>`).join('') || '<li>ยังมีข้อมูลไม่พอสำหรับสรุป</li>'}</ul>
          ${sug.length ? `<h4 class="fx-h4b">ข้อเสนอแนะการดูแล</h4><ol class="fx-sug">${sug.map(x => `<li>${E(x.t)} <span class="fx-tag">${x.n} คน</span></li>`).join('')}</ol>` : ''}
          <p class="fx-note">สรุปอัตโนมัติจากคำสำคัญในข้อความ ควรอ่านข้อความจริงประกอบก่อนตัดสินใจ</p>
        </article>
        <article class="fx-card">
          <h4>คำที่พบบ่อย</h4>
          <div class="fx-tabs" role="tablist">
            ${[['career', 'อาชีพ'], ['need', 'ความต้องการ'], ['edu', 'การศึกษา']].map(([k, t]) => `<button type="button" role="tab" aria-selected="${st.wordTab === k}" class="${st.wordTab === k ? 'on' : ''}" data-fx-words="${k}">${t}</button>`).join('')}
          </div>
          <div class="fx-cloud">${words.length ? words.map(([w, c]) => `<span style="font-size:${(13 + 13 * wScale(c)).toFixed(1)}px;opacity:${(.6 + .4 * wScale(c)).toFixed(2)}" title="${c} คน">${E(w)}<small>${c}</small></span>`).join('') : '<p class="fx-none">ยังมีคำซ้ำไม่พอ</p>'}</div>
        </article>
      </div>
      <div class="fx-grid2">
        <article class="fx-card"><h4>ความคาดหวังด้านอาชีพในอนาคต <small>${cRows.length} คน · 1 คนอาจอยู่ได้หลายหมวด</small></h4>${bars('career', cT, cRows.length, 'linear-gradient(90deg,#3A68FF,#5CC8FF)')}</article>
        <article class="fx-card"><h4>ความต้องการความช่วยเหลือเพิ่มเติม <small>จากสถานศึกษา ครู หรืออื่น ๆ · ${nRows.length} คน</small></h4>${bars('need', nT, nRows.length, 'linear-gradient(90deg,#F59E0B,#FFC531)')}</article>
      </div>
      <div class="fx-grid2">
        <article class="fx-card"><h4>ความคาดหวังด้านการศึกษา <small>${eRows.length} คน</small></h4>${bars('edu', eT, eRows.length, 'linear-gradient(90deg,#16A34A,#4ADE80)')}</article>
        <article class="fx-card"><h4>การดูแลช่วยเหลือที่ได้รับอยู่ <small>จากตัวเลือกและตารางในแบบฟอร์ม</small></h4>
          <ul class="fx-stats">
            ${[...supp.entries()].sort((a, b) => b[1] - a[1]).map(([o, c]) => `<li><span>${E(o)}</span><b>${c}</b><small>${pct(c, rows.length)}%</small></li>`).join('')}
            ${suppOther ? `<li><span>อื่น ๆ (ระบุเอง)</span><b>${suppOther}</b><small>${pct(suppOther, rows.length)}%</small></li>` : ''}
            <li><span>ได้รับการสอนเสริม</span><b>${tutorRows.length}</b><small>${pct(tutorRows.length, rows.length)}%</small></li>
            <li><span>ได้รับทุนจากแหล่งอื่น</span><b>${fundRows.length}</b><small>${fundSum ? 'รวม ' + money(fundSum) + ' บาท' : pct(fundRows.length, rows.length) + '%'}</small></li>
          </ul>
          ${tutorSubjects.length ? `<div class="fx-sub">วิชาที่สอนเสริมบ่อย: ${tutorSubjects.slice(0, 6).map(([w, c]) => `<span class="fx-tag">${E(w)} ${c}</span>`).join(' ')}</div>` : ''}
        </article>
      </div>` : `<div class="fx-card fx-empty">ยังไม่มีข้อมูลความคาดหวังหรือความต้องการในแบบฟอร์มที่ 2 ${st.term !== 'latest' ? 'ของภาคเรียนนี้' : ''} — ข้อมูลจะแสดงเมื่อครูกรอกส่วน "ช่วยเหลือ/คาดหวัง"</div>`}`;
    box._rows = rows;
  }

  function exportCsv(rows) {
    const safe = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const nm = (ks, dict) => ks.map(k => k === 'other' ? 'อื่น ๆ' : (dict.find(d => d[0] === k) || [, k])[1]).join(' / ');
    const head = ['ลำดับ', 'ชื่อ-สกุล', 'โรงเรียน', 'ภาคเรียน', 'สถานะ', 'กลุ่มการดูแล', 'ความคาดหวังด้านอาชีพ', 'หมวดอาชีพ', 'ความต้องการเพิ่มเติม', 'หมวดความต้องการ', 'ความคาดหวังด้านการศึกษา', 'หมวดการศึกษา', 'การช่วยเหลือที่ได้รับ', 'สอนเสริม (วิชา)', 'ทุนอื่น'];
    const lines = [head.map(safe).join(',')].concat(rows.slice().sort((a, b) => (a.s.no || 0) - (b.s.no || 0)).map(r => [
      r.s.no, r.s.name, r.s.school_m1, r.term, r.sent ? 'ส่งแล้ว' : 'ยังไม่ส่ง', r.care ? r.care.label : '',
      r.career, r.career ? nm(r.careerCat, CAREER) : '', r.needs, r.needs ? nm(r.needCat, NEED) : '', r.edu, r.edu ? nm(r.eduCat, EDU) : '',
      r.support.concat(r.supportOther ? ['อื่น ๆ: ' + r.supportOther] : []).join(' / '),
      r.tutoring.map(c => c.subject).filter(Boolean).join(' / '), r.funding.map(c => [c.source, c.amount].filter(Boolean).join(' ')).join(' / ')
    ].map(safe).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'วิเคราะห์แบบฟอร์มที่2_' + (st.term === 'latest' ? 'ล่าสุด' : st.term.replace('/', '-')) + '.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function bind(box) {
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.fxCat) { st.open = st.open === b.dataset.fxCat ? null : b.dataset.fxCat; render(); return; }
      if (b.dataset.fxWords) { st.wordTab = b.dataset.fxWords; render(); return; }
      if (b.dataset.fxOpen) { openStudentDetail(+b.dataset.fxOpen); return; }
      if (b.hasAttribute('data-fx-csv')) exportCsv(box._rows || []);
    });
    box.addEventListener('change', e => { if (e.target.hasAttribute('data-fx-term')) { st.term = e.target.value; st.open = null; render(); } });
  }

  /* ---------- ปรับกราฟเดิมบน Dashboard ---------- */
  function improveCharts() {
    // 1) SDQ รายด้าน: ถ้ายังไม่มีใครมีปัญหา แสดงข้อความแทนกราฟว่าง
    const sdqCanvas = document.getElementById('chartObstacle');
    if (sdqCanvas && window.CareGroup) {
      const holder = sdqCanvas.parentElement;
      let msg = holder.querySelector('.fx-chart-empty');
      const stats = CareGroup.domainProblemCounts();
      const any = stats.some(d => d.count > 0);
      const done = (DB.students || []).filter(s => CareGroup.latestCompleteSdq(s)).length;
      if (!any) {
        if (!msg) { msg = document.createElement('div'); msg.className = 'fx-chart-empty'; holder.appendChild(msg); }
        msg.innerHTML = done ? `<b>ยังไม่พบด้านที่มีปัญหา</b><span>จากผล SDQ ที่ตอบครบ ${done} คน</span>` : '<b>ยังไม่มีผล SDQ ที่ตอบครบ</b><span>กราฟจะแสดงเมื่อมีการประเมิน</span>';
        sdqCanvas.style.visibility = 'hidden';
      } else { if (msg) msg.remove(); sdqCanvas.style.visibility = ''; }
    }
    // 2) แทน "ธนาคาร Top 5" ด้วย "แนวโน้ม GPA เทียบภาคก่อน" (ใช้ตัดสินใจได้มากกว่า)
    const bank = document.getElementById('chartBank');
    if (bank) {
      const card = bank.closest('.chart-card');
      const t = card && card.querySelector('.chart-title'); if (t) t.textContent = 'แนวโน้ม GPA เทียบภาคก่อน';
      const c = { up: 0, same: 0, down: 0, drop: 0, one: 0 }, dropList = [];
      (DB.students || []).forEach((s, idx) => {
        const l = (s.semGpa || []).filter(g => g && g.term && Number(g.gpa) > 0).sort((a, b) => tkey(b.term) - tkey(a.term));
        if (l.length < 2) { if (l.length) c.one++; return; }
        const d = Math.round((Number(l[0].gpa) - Number(l[1].gpa)) * 100) / 100;
        if (d <= -0.30) { c.drop++; dropList.push({ s, idx, d }); } else if (d < -0.05) c.down++; else if (d > 0.05) c.up++; else c.same++;
      });
      const tot = c.up + c.same + c.down + c.drop;
      const row = (k, lbl, col) => `<li><span class="fx-dot" style="background:${col}"></span><span>${lbl}</span><b>${c[k]}</b><small>${pct(c[k], tot)}%</small></li>`;
      const holder = bank.parentElement;
      holder.style.height = 'auto';
      holder.innerHTML = `<canvas id="chartBank" style="display:none"></canvas><div class="fx-trend">
        <div class="fx-trend-bar">${[['up', '#16A34A'], ['same', '#94A3B8'], ['down', '#F59E0B'], ['drop', '#DC2626']].map(([k, col]) => c[k] ? `<span style="flex:${c[k]};background:${col}" title="${c[k]}"></span>` : '').join('')}</div>
        <ul>${row('up', 'ดีขึ้น (> +0.05)', '#16A34A')}${row('same', 'ใกล้เคียงเดิม', '#94A3B8')}${row('down', 'ลดลงเล็กน้อย', '#F59E0B')}${row('drop', 'ลดลงตั้งแต่ 0.30', '#DC2626')}</ul>
        <p>${tot ? `เทียบได้ ${tot} คน` : 'ยังไม่มีนักเรียนที่มี GPA 2 ภาคเรียนขึ้นไป'}${c.one ? ` · มี GPA ภาคเดียว ${c.one} คน` : ''}</p>
        ${dropList.length ? `<div class="fx-droplist">${dropList.sort((a, b) => a.d - b.d).slice(0, 4).map(x => `<button type="button" onclick="openStudentDetail(${x.idx})">${E(x.s.name || '')} <b>▼ ${Math.abs(x.d).toFixed(2)}</b></button>`).join('')}</div>` : ''}
      </div>`;
      if (typeof charts !== 'undefined' && charts.chartBank) { try { charts.chartBank.destroy(); } catch (e) {} delete charts.chartBank; }
    }
  }

  const _rd = window.renderDashboard;
  if (typeof _rd === 'function') {
    window.renderDashboard = function () {
      const r = _rd.apply(this, arguments);
      try { improveCharts(); } catch (e) { console.warn('dash charts', e); }
      try { render(); } catch (e) { console.warn('form2 insights', e); }
      return r;
    };
  }
  window.Form2Insights = { render, collect };
})();
