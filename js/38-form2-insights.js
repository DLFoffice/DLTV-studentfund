/* ============================================================
   38-form2-insights.js — Dashboard: วิเคราะห์ข้อมูลจากแบบฟอร์มที่ 2
   ------------------------------------------------------------
   แหล่งข้อมูล (แบบฟอร์มที่ 2 ส่วน "การดูแลช่วยเหลือ ความต้องการ และความคาดหวัง")
     learning_problems ปัญหาอุปสรรคที่ส่งผลต่อการเรียน (ข้อความ · ส่วนผลการเรียน)
     expect_career     ความคาดหวังด้านอาชีพในอนาคต (ข้อความ)
     additional_needs  ความต้องการความช่วยเหลือเพิ่มเติม จากสถานศึกษา ครู หรืออื่น ๆ (ข้อความ)
     expect_education  ความคาดหวังด้านการศึกษา (ข้อความ)
     support_other     การดูแลช่วยเหลืออื่น ๆ (ตัวเลือก) · tutoring สอนเสริม (ตาราง) · extra_funding ทุนอื่น (ตาราง)
   วิธีวิเคราะห์ (ทำในเบราว์เซอร์ ไม่ส่งข้อมูลออกนอกระบบ)
     • เชิงปริมาณ: จัดหมวดข้อความด้วยคำสำคัญภาษาไทย (1 คนอยู่ได้หลายหมวด) → จำนวน/ร้อยละ
     • เชิงคุณภาพ: ข้อความจริงของแต่ละหมวด (กดดู), สรุปประเด็นอัตโนมัติ, GPA เฉลี่ยของกลุ่มที่มีอุปสรรคแต่ละแบบ
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
  const OBST = [
    ['subject', 'เรียนไม่เข้าใจบางวิชา / พื้นฐานไม่แน่น', /ไม่เข้าใจ|ยาก|วิชา|คณิต|อังกฤษ|วิทยาศาสตร์|ฟิสิกส์|เคมี|ชีว|เรียนไม่ทัน|ตามไม่ทัน|พื้นฐาน|ภาษาไทย|สังคม/],
    ['focus', 'สมาธิ / การจัดการเวลา / ส่งงาน', /สมาธิ|ไม่ตั้งใจ|ขี้เกียจ|เกม|โทรศัพท์|มือถือ|โซเชียล|จัดการเวลา|แบ่งเวลา|ส่งงาน|งานค้าง|ขาดเรียน|มาสาย|หลับ|ง่วง/],
    ['family', 'ครอบครัว / ภาระทางบ้าน', /ครอบครัว|ทางบ้าน|งานบ้าน|ดูแลน้อง|ผู้ปกครอง|พ่อแม่|บิดา|มารดา|หย่า|แยกทาง|ภาระ|ช่วยงาน|ปู่|ย่า|ยาย/],
    ['money', 'เศรษฐกิจ / ค่าใช้จ่าย', /เงิน|ค่าใช้จ่าย|ยากจน|รายได้|ฐานะ|ขาดแคลน|ค่าเดินทาง|หนี้/],
    ['emotion', 'อารมณ์ / ความเครียด / การปรับตัว', /เครียด|กังวล|ท้อ|เศร้า|ซึมเศร้า|ปรับตัว|ไม่มั่นใจ|ถูกแกล้ง|กดดัน|ทะเลาะ|เพื่อน/],
    ['health', 'สุขภาพ / เจ็บป่วย', /สุขภาพ|ป่วย|โรค|เจ็บ|ผ่าตัด|โรงพยาบาล|สายตา|ภูมิแพ้|นอนไม่พอ|พักผ่อน/],
    ['travel', 'การเดินทาง / ระยะทาง', /เดินทาง|ระยะทาง|ไกล|รถ/],
    ['equip', 'ขาดอุปกรณ์ / อินเทอร์เน็ต', /อุปกรณ์|คอมพิวเตอร์|อินเทอร์เน็ต|อินเตอร์เน็ต|สัญญาณ|หนังสือ|ไฟฟ้า/],
    ['activity', 'กิจกรรม / งานนอกเวลาเรียนมาก', /กิจกรรม|แข่งขัน|ซ้อม|ทำงานพิเศษ|รับจ้าง|ทำงานหาเงิน/],
    ['none', 'ไม่มีปัญหาอุปสรรค', /ไม่มีปัญหา|ไม่พบปัญหา|ไม่มีอุปสรรค|^ไม่มี|เรียนได้ดี|ผลการเรียนดี/]
  ];
  const OB_SUGGEST = {
    subject: 'จัดสอนเสริม/ติวพื้นฐานในวิชาที่นักเรียนเรียนไม่เข้าใจ และให้ครูประจำวิชาติดตาม',
    focus: 'ครูที่ปรึกษาช่วยวางแผนเวลาเรียน ติดตามการส่งงาน และพูดคุยเรื่องการใช้โทรศัพท์/เกม',
    family: 'เยี่ยมบ้านและประสานผู้ปกครอง เพื่อลดภาระงานบ้านที่กระทบการเรียน',
    money: 'ตรวจสอบการใช้จ่ายเงินทุน และพิจารณาความช่วยเหลือด้านค่าใช้จ่ายเพิ่มเติม',
    emotion: 'ให้คำปรึกษา/ส่งต่อครูแนะแนว ใช้ผล SDQ ประกอบการดูแล',
    health: 'ประสานหน่วยสาธารณสุขหรือโรงพยาบาลในพื้นที่ดูแลสุขภาพ',
    travel: 'หาทางเลือกการเดินทาง/ที่พัก ลดเวลาเดินทางที่กระทบการเรียน',
    equip: 'จัดหาอุปกรณ์การเรียน/อินเทอร์เน็ตให้เพียงพอ',
    activity: 'ช่วยนักเรียนจัดสมดุลระหว่างกิจกรรม/งานนอกเวลา กับการเรียน'
  };
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

  /* ---------- เก็บข้อมูล ---------- */
  const st = { term: 'latest', open: null };
  const isEmpty = v => v == null || EMPTY_RE.test(String(v).trim());
  const text = v => (typeof v === 'string' && !isEmpty(v)) ? v.trim() : '';
  function form2Of(s, term) {
    const forms = s.forms || {};
    const pick = t => { const f = forms[t] && forms[t].form2; return f && typeof f === 'object' ? f : null; };
    const sel = v => v && ((v.selected || []).length || text(v.other));
    const has = f => f && (text(f.expect_career) || text(f.additional_needs) || text(f.expect_education) || obText(f.learning_problems)
      || sel(f.career_choices) || sel(f.needs_choices) || sel(f.edu_choices) || sel(f.obstacle_choices)
      || (f.support_other && ((f.support_other.selected || []).length || text(f.support_other.other))));
    if (term !== 'latest') { const f = pick(term); return has(f) ? { term, f } : null; }
    const terms = Object.keys(forms).filter(t => /\d\/\d{4}/.test(t)).sort((a, b) => tkey(b) - tkey(a));
    for (const t of terms) { const f = pick(t); if (has(f)) return { term: t, f }; }
    return null;
  }
  // ปัญหาอุปสรรค: คำตอบ "ไม่มี" มีความหมาย (= ไม่มีปัญหา) ไม่ใช่ช่องว่าง
  function obText(v) {
    if (typeof v !== 'string') return '';
    const t = v.trim();
    if (!t || /^[-–—.]+$/.test(t)) return '';
    if (/^ไม่มี(ครับ|ค่ะ|คะ)?$/.test(t)) return 'ไม่มีปัญหาอุปสรรค';
    return t;
  }
  function withChoices(v, detail, dict) {
    const selected = (v && v.selected) || [], other = text(v && v.other);
    if (!selected.length && !other) return { text: detail, cats: classify(detail, dict), picked: false };
    const keys = new Set();
    selected.forEach(name => { const d = dict.find(x => x[1] === name); (d ? [d[0]] : classify(name, dict)).forEach(k => keys.add(k)); });
    if (other) classify(other, dict).forEach(k => keys.add(k));
    const label = [...selected, other].filter(Boolean).join(', ');
    return { text: detail ? label + ' — ' + detail : label, cats: [...keys], picked: true };
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
      // v47: หมวดที่ครูติ๊ก (ถ้ามี) เป็นหลัก + ข้อความรายละเอียด · ไม่มีการติ๊ก → จัดหมวดจากข้อความแบบเดิม
      const C = withChoices(f.career_choices, text(f.expect_career), CAREER);
      const Nd = withChoices(f.needs_choices, text(f.additional_needs), NEED);
      const Ed = withChoices(f.edu_choices, text(f.expect_education), EDU);
      const Ob = withChoices(f.obstacle_choices, obText(f.learning_problems), OBST);
      const career = C.text, needs = Nd.text, edu = Ed.text, obst = Ob.text;
      const so = f.support_other || {};
      const sent = !!(window.Term && Term.state && Term.state(s, 'form2', x.term) === 'submitted');
      let care = null; try { care = window.CareGroup ? CareGroup.compute(s) : null; } catch (e) {}
      const gl = (s.semGpa || []).filter(g => g && Number(g.gpa) > 0).sort((a, b) => tkey(b.term) - tkey(a.term))[0];
      out.push({ s, idx, term: x.term, sent, career, needs, edu, obst, care, gpa: gl ? Number(gl.gpa) : null, obCat: Ob.cats, picked: C.picked || Nd.picked || Ed.picked || Ob.picked,
        careerCat: C.cats, needCat: Nd.cats, eduCat: Ed.cats,
        support: (so.selected || []).slice(), supportOther: text(so.other),
        tutoring: tableRows(f.tutoring), funding: tableRows(f.extra_funding) });
    });
    return out;
  }
  // หมวดหลักเรียงตามจำนวน → หมวดสถานะ (ยังไม่แน่ใจ/เพียงพอ/ไม่มีปัญหา) → อื่น ๆ
  const rank = k => k === 'other' ? 2 : ['unsure', 'enough', 'none'].includes(k) ? 1 : 0;
  function tally(rows, field, dict) {
    const m = new Map();
    rows.forEach(r => r[field].forEach(k => { if (!m.has(k)) m.set(k, []); m.get(k).push(r); }));
    const name = k => k === 'other' ? 'อื่น ๆ (ไม่เข้าหมวด)' : (dict.find(d => d[0] === k) || [, k])[1];
    return [...m.entries()].map(([k, list]) => ({ k, name: name(k), list, n: list.length }))
      .sort((a, b) => rank(a.k) - rank(b.k) || b.n - a.n);
  }
  const short = (t, n) => { t = String(t).replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

  /* ---------- วาด ---------- */
  const DIM = {
    career: { title: 'ความคาดหวังด้านอาชีพในอนาคต', icon: '🎯', tone: 'blue', field: 'career', cat: 'careerCat', dict: CAREER, color: 'linear-gradient(90deg,#3A68FF,#5CC8FF)' },
    need: { title: 'ความต้องการความช่วยเหลือเพิ่มเติม', sub: 'จากสถานศึกษา ครู หรืออื่น ๆ', icon: '🤝', tone: 'amber', field: 'needs', cat: 'needCat', dict: NEED, color: 'linear-gradient(90deg,#F59E0B,#FFC531)' },
    obst: { title: 'ปัญหาอุปสรรคที่ส่งผลต่อการเรียน', icon: '🧩', tone: 'rose', field: 'obst', cat: 'obCat', dict: OBST, color: 'linear-gradient(90deg,#E11D48,#FB7185)', gpa: true },
    edu: { title: 'ความคาดหวังด้านการศึกษา', icon: '🎓', tone: 'green', field: 'edu', cat: 'eduCat', dict: EDU, color: 'linear-gradient(90deg,#16A34A,#4ADE80)' }
  };
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  function bars(id, items, total, allGpa) {
    const d = DIM[id];
    if (!items.length) return '<p class="fx-none">ยังไม่มีข้อมูลในหัวข้อนี้</p>';
    const max = Math.max(...items.map(i => i.n));
    return `<ul class="fx-bars">${items.map(i => {
      const key = id + ':' + i.k, open = st.open === key;
      const g = d.gpa ? avg(i.list.map(r => r.gpa).filter(v => v)) : null;
      const gNote = g !== null && allGpa !== null && i.k !== 'none'
        ? `<span class="fx-gpa ${g < allGpa - 0.05 ? 'low' : ''}" title="GPA ล่าสุดเฉลี่ยของกลุ่มนี้ เทียบค่าเฉลี่ยทุกคน ${allGpa.toFixed(2)}">GPA ${g.toFixed(2)}</span>` : '';
      const quotes = open ? `<div class="fx-quotes">${i.list.slice(0, 40).map(r => `<blockquote><p>“${E(short(r[d.field], 220))}”</p>
          <footer><button type="button" class="fx-who" data-fx-open="${r.idx}">${E(r.s.name || '')}</button> · ${E(r.s.school_m1 || '-')} · ${E(r.term)}${r.gpa ? ' · GPA ' + r.gpa.toFixed(2) : ''}${r.care && r.care.severity >= 1 ? ` · <span class="${r.care.badgeClass}">${E(r.care.label)}</span>` : ''}</footer></blockquote>`).join('')}
          ${i.list.length > 40 ? `<div class="fx-more">และอีก ${i.list.length - 40} คน (ดูทั้งหมดในไฟล์ CSV)</div>` : ''}</div>` : '';
      return `<li class="${open ? 'open' : ''}">
        <button type="button" class="fx-bar" data-fx-cat="${key}" aria-expanded="${open}">
          <span class="fx-bar-name">${E(i.name)}${gNote}</span>
          <span class="fx-bar-track"><span style="width:${(i.n / max * 100).toFixed(1)}%;background:${d.color}"></span></span>
          <span class="fx-bar-n"><b>${i.n}</b> คน <small>${pct(i.n, total)}%</small></span>
          <span class="fx-bar-chev" aria-hidden="true">›</span>
        </button>${quotes}</li>`;
    }).join('')}</ul>`;
  }
  const named = (T, skip) => T.filter(x => x.k !== 'other' && !(skip || []).includes(x.k));
  function narrative(rows, T, careRows) {
    const pts = [];
    const nOf = f => rows.filter(r => r[f]).length;
    const c = named(T.career, ['unsure']);
    if (c.length) pts.push(`<b>อาชีพ:</b> จาก ${nOf('career')} คน สนใจ <b>${E(c[0].name)}</b> มากที่สุด (${c[0].n} คน, ${pct(c[0].n, nOf('career'))}%)`
      + (c[1] ? ` รองลงมาคือ ${E(c[1].name)} (${c[1].n})` : '') + (c[2] ? ` และ ${E(c[2].name)} (${c[2].n})` : ''));
    const uns = T.career.find(x => x.k === 'unsure');
    if (uns) pts.push(`<b>${uns.n} คนยังไม่แน่ใจเรื่องอาชีพ</b> — ควรได้รับการแนะแนวอาชีพเป็นพิเศษ`);
    const o = named(T.obst, ['none']);
    if (o.length) {
      const none = T.obst.find(x => x.k === 'none');
      pts.push(`<b>ปัญหาอุปสรรคการเรียน:</b> พบมากที่สุดคือ <b>${E(o[0].name)}</b> (${o[0].n} คน)` + (o[1] ? ` รองลงมาคือ ${E(o[1].name)} (${o[1].n})` : '')
        + (none ? ` · ${none.n} คนระบุว่าไม่มีปัญหา` : ''));
    }
    const n = named(T.need, ['enough']);
    if (n.length) pts.push(`<b>ความต้องการเพิ่มเติม:</b> พบมากที่สุดคือ <b>${E(n[0].name)}</b> (${n[0].n} คน)` + (n[1] ? ` รองลงมาคือ ${E(n[1].name)} (${n[1].n})` : '') + (n[2] ? ` และ ${E(n[2].name)} (${n[2].n})` : ''));
    const eN = nOf('edu'), ba = T.edu.filter(x => ['ba', 'grad'].includes(x.k)).reduce((a, x) => a + x.n, 0);
    if (eN) pts.push(`<b>การศึกษา:</b> ${pct(ba, eN)}% ของผู้ที่ระบุ ตั้งเป้าเรียนถึงปริญญาตรีขึ้นไป`);
    if (careRows.length) {
      const t2 = named(tally(careRows.filter(r => r.obst), 'obCat', OBST), ['none']);
      const t3 = named(tally(careRows.filter(r => r.needs), 'needCat', NEED), ['enough']);
      pts.push(`<b>กลุ่มต้องดูแล/เฝ้าระวัง (${careRows.length} คน):</b> `
        + (t2.length ? `อุปสรรคหลัก ${t2.slice(0, 2).map(x => `${E(x.name)} (${x.n})`).join(', ')}` : 'ยังไม่ได้ระบุปัญหาอุปสรรค')
        + (t3.length ? ` · ต้องการ ${t3.slice(0, 2).map(x => `${E(x.name)} (${x.n})`).join(', ')}` : ''));
    }
    return pts;
  }
  function suggestions(T, tutorSubjects) {
    const out = [];
    named(T.obst, ['none']).slice(0, 3).forEach(x => OB_SUGGEST[x.k] && out.push({ t: OB_SUGGEST[x.k], n: x.n, src: 'อุปสรรค' }));
    named(T.need, ['enough']).slice(0, 3).forEach(x => {
      if (!SUGGEST[x.k]) return;
      let t = SUGGEST[x.k];
      if (x.k === 'tutor' && tutorSubjects.length) t += ` (วิชาที่พบบ่อย: ${tutorSubjects.slice(0, 3).map(([w]) => w).join(', ')})`;
      if (x.k === 'guide') { const top = named(T.career, ['unsure']).slice(0, 2).map(c => c.name); if (top.length) t += ` เช่น ${top.join(' และ ')}`; }
      if (!out.some(o => o.t.slice(0, 12) === t.slice(0, 12))) out.push({ t, n: x.n, src: 'ความต้องการ' });
    });
    const uns = T.career.find(x => x.k === 'unsure');
    if (uns) out.push({ t: 'จัดกิจกรรมสำรวจความถนัดและแนะแนวอาชีพ สำหรับนักเรียนที่ยังไม่แน่ใจเรื่องอาชีพ', n: uns.n, src: 'อาชีพ' });
    return out.slice(0, 6);
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
    const T = {}, R = {};
    Object.entries(DIM).forEach(([k, d]) => { R[k] = rows.filter(r => r[d.field]); T[k] = tally(R[k], d.cat, d.dict); });
    const careRows = rows.filter(r => r.care && r.care.severity >= 1);
    const allGpa = avg(rows.map(r => r.gpa).filter(v => v));
    const supp = new Map(); rows.forEach(r => r.support.forEach(o => supp.set(o, (supp.get(o) || 0) + 1)));
    const suppOther = rows.filter(r => r.supportOther).length;
    const tutorRows = rows.filter(r => r.tutoring.length);
    const tutorSubjects = [...rows.flatMap(r => r.tutoring.map(c => String(c.subject || '').trim())).filter(Boolean)
      .reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const fundRows = rows.filter(r => r.funding.length);
    const fundSum = rows.reduce((a, r) => a + r.funding.reduce((x, c) => x + (parseFloat(String(c.amount || '').replace(/[^\d.]/g, '')) || 0), 0), 0);
    const pts = narrative(rows, T, careRows);
    const sug = suggestions(T, tutorSubjects);
    const sent = rows.filter(r => r.sent).length;
    const money = n => (typeof fmt === 'function') ? fmt(n) : Math.round(n).toLocaleString('th-TH');
    const hl = (k, skip) => {
      const d = DIM[k], top = named(T[k], skip)[0];
      return `<button type="button" class="fx-hl t-${d.tone}" data-fx-jump="${k}">
        <span class="fx-hl-ic" aria-hidden="true">${d.icon}</span>
        <span class="fx-hl-lbl">${k === 'career' ? 'อาชีพที่สนใจมากที่สุด' : k === 'need' ? 'ความต้องการหลัก' : k === 'obst' ? 'อุปสรรคการเรียนหลัก' : 'เป้าหมายการศึกษาหลัก'}</span>
        <b>${top ? E(top.name) : '—'}</b>
        <span class="fx-hl-n">${top ? `${top.n} คน · ${pct(top.n, R[k].length)}% ของผู้ที่ระบุ` : 'ยังไม่มีข้อมูล'}</span></button>`;
    };
    const dimCard = k => { const d = DIM[k];
      return `<article class="fx-card fx-dim t-${d.tone}" id="fx-dim-${k}">
        <header><span class="fx-dim-ic" aria-hidden="true">${d.icon}</span><div><h4>${d.title}</h4>
          <small>${d.sub ? d.sub + ' · ' : ''}${R[k].length} คนที่ระบุ · 1 คนอยู่ได้หลายหมวด</small></div></header>
        ${bars(k, T[k], R[k].length, allGpa)}</article>`; };

    box.innerHTML = `
      <header class="fx-head">
        <div><span class="fx-kicker">เสียงจากนักเรียน</span><h3>วิเคราะห์จากแบบฟอร์มที่ 2</h3>
          <p>อาชีพที่คาดหวัง · ความต้องการ · ปัญหาอุปสรรคการเรียน · เป้าหมายการศึกษา — กดแต่ละหมวดเพื่ออ่านข้อความจริง</p></div>
        <div class="fx-tools">
          <select class="fx-sel" data-fx-term aria-label="ภาคเรียน"><option value="latest" ${st.term === 'latest' ? 'selected' : ''}>ล่าสุดของแต่ละคน</option>
            ${terms.map(t => `<option value="${t}" ${st.term === t ? 'selected' : ''}>${E(window.Term && Term.label ? Term.label(t) : t)}</option>`).join('')}</select>
          <button type="button" class="fx-btn" data-fx-csv>ส่งออก CSV</button>
        </div>
      </header>
      <div class="fx-cover">
        <span><b>${rows.length}</b>/${N} คนมีข้อมูล</span><span><b>${R.career.length}</b> ระบุอาชีพ</span><span><b>${R.need.length}</b> ระบุความต้องการ</span>
        <span><b>${R.obst.length}</b> ระบุปัญหาอุปสรรค</span><span><b>${R.edu.length}</b> ระบุเป้าหมายการศึกษา</span><span><b>${sent}</b> ฉบับส่งแล้ว</span><span title="ครูติ๊กหมวดเองในแบบฟอร์ม (แม่นยำกว่าการจับคำสำคัญ)"><b>${rows.filter(r => r.picked).length}</b> คนเลือกหมวดเอง</span>
      </div>
      ${rows.length ? `
      <div class="fx-hls">${hl('career', ['unsure'])}${hl('need', ['enough'])}${hl('obst', ['none'])}${hl('edu')}</div>
      <div class="fx-grid2 fx-insight">
        <article class="fx-card fx-summary"><h4>สรุปประเด็นสำคัญ</h4>
          <ul class="fx-points">${pts.map(p => `<li>${p}</li>`).join('') || '<li>ยังมีข้อมูลไม่พอสำหรับสรุป</li>'}</ul></article>
        <article class="fx-card fx-sugcard"><h4>ข้อเสนอแนะการดูแล</h4>
          ${sug.length ? `<ol class="fx-sug">${sug.map(x => `<li><span>${E(x.t)}</span><span class="fx-tags"><span class="fx-tag">${x.n} คน</span><span class="fx-tag soft">${x.src}</span></span></li>`).join('')}</ol>` : '<p class="fx-none">ยังไม่มีข้อเสนอแนะ</p>'}
          <p class="fx-note">สรุปอัตโนมัติจากคำสำคัญในข้อความ ควรอ่านข้อความจริงประกอบก่อนตัดสินใจ</p></article>
      </div>
      <div class="fx-grid2">${dimCard('career')}${dimCard('need')}</div>
      <div class="fx-grid2">${dimCard('obst')}${dimCard('edu')}</div>
      <article class="fx-card fx-support"><header><span class="fx-dim-ic" aria-hidden="true">🏫</span><div><h4>การดูแลช่วยเหลือที่ได้รับอยู่</h4><small>จากตัวเลือกและตารางในแบบฟอร์มที่ 2 · ${rows.length} คน</small></div></header>
        <div class="fx-tiles">
          ${[...supp.entries()].sort((a, b) => b[1] - a[1]).map(([o, c]) => `<div><b>${c}</b><span>${E(o)}</span><small>${pct(c, rows.length)}%</small></div>`).join('')}
          ${suppOther ? `<div><b>${suppOther}</b><span>อื่น ๆ (ระบุเอง)</span><small>${pct(suppOther, rows.length)}%</small></div>` : ''}
          <div><b>${tutorRows.length}</b><span>ได้รับการสอนเสริม</span><small>${tutorSubjects.length ? tutorSubjects.slice(0, 3).map(([w, c]) => `${E(w)} ${c}`).join(' · ') : pct(tutorRows.length, rows.length) + '%'}</small></div>
          <div><b>${fundRows.length}</b><span>ได้รับทุนจากแหล่งอื่น</span><small>${fundSum ? 'รวม ' + money(fundSum) + ' บาท' : pct(fundRows.length, rows.length) + '%'}</small></div>
        </div></article>` : `<div class="fx-card fx-empty">ยังไม่มีข้อมูลในแบบฟอร์มที่ 2 ${st.term !== 'latest' ? 'ของภาคเรียนนี้' : ''} — ข้อมูลจะแสดงเมื่อครูกรอกส่วน "ผลการเรียน" และ "ช่วยเหลือ/คาดหวัง"</div>`}`;
    box._rows = rows;
  }

  function exportCsv(rows) {
    const safe = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const nm = (ks, dict) => ks.map(k => k === 'other' ? 'อื่น ๆ' : (dict.find(d => d[0] === k) || [, k])[1]).join(' / ');
    const head = ['ลำดับ', 'ชื่อ-สกุล', 'โรงเรียน', 'ภาคเรียน', 'สถานะ', 'กลุ่มการดูแล', 'GPA ล่าสุด', 'ปัญหาอุปสรรคที่ส่งผลต่อการเรียน', 'หมวดปัญหาอุปสรรค', 'ความคาดหวังด้านอาชีพ', 'หมวดอาชีพ', 'ความต้องการเพิ่มเติม', 'หมวดความต้องการ', 'ความคาดหวังด้านการศึกษา', 'หมวดการศึกษา', 'การช่วยเหลือที่ได้รับ', 'สอนเสริม (วิชา)', 'ทุนอื่น'];
    const lines = [head.map(safe).join(',')].concat(rows.slice().sort((a, b) => (a.s.no || 0) - (b.s.no || 0)).map(r => [
      r.s.no, r.s.name, r.s.school_m1, r.term, r.sent ? 'ส่งแล้ว' : 'ยังไม่ส่ง', r.care ? r.care.label : '',
      r.gpa ? r.gpa.toFixed(2) : '', r.obst, r.obst ? nm(r.obCat, OBST) : '', r.career, r.career ? nm(r.careerCat, CAREER) : '', r.needs, r.needs ? nm(r.needCat, NEED) : '', r.edu, r.edu ? nm(r.eduCat, EDU) : '',
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
      if (b.dataset.fxJump) { const el = document.getElementById('fx-dim-' + b.dataset.fxJump); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
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
      // v55: ใช้การ์ดกลาง (js/46-gpa-trend.js) — เกณฑ์เดียวกับหน้าผลการเรียน + กดดูรายชื่อได้
      holder.innerHTML = '<canvas id="chartBank" style="display:none"></canvas>' + (window.GpaTrend ? GpaTrend.cardHtml(GpaTrend.rows(null), { withLow: false }) : '');
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
