/* ============================================================
   03-utils.js — ฟังก์ชันช่วยเหลือ: format, วันที่ไทย, สี GPA, รูปภาพ + ตัวโหลดพิกัดจาก Sheet
   (แยกมาจาก index.html เดิม บรรทัด 1436-1610 โดยรักษาลำดับโค้ดเดิม)
   ============================================================ */
const fmt=n=>Number(n||0).toLocaleString('th-TH');

/* ============================================================
   🛡️ ความปลอดภัยของการแสดงผล (เพิ่มใน v15)
   ------------------------------------------------------------
   ปัญหาเดิม: ข้อมูลนักเรียนถูกนำไปต่อเป็น HTML แล้วใส่ innerHTML ตรง ๆ
   กว่า 60 จุด — บัญชีนักเรียนแก้เอกสารตัวเองได้ จึงฝังสคริปต์ลงใน
   ชื่อเล่น/โรงเรียน/URL รูป แล้วสคริปต์จะไปรันในเบราว์เซอร์ของครู/แอดมิน

   แก้ 2 ชั้น:
   1) escHtml() / lbAttrs() — escape ตอนสร้าง HTML (ใช้ในจุดหลักที่ครูเห็น)
   2) sanitizeStudent() — ล้างอักขระอันตรายตั้งแต่ข้อมูล "เข้ามา" ในแอป
      (จากคลาวด์ / Sheet / localStorage) ครอบคลุมทุกจุดที่ยังไม่ได้ escape
   ============================================================ */

/** escape ข้อความสำหรับใส่ใน HTML (ทั้งเนื้อหาและค่า attribute ที่มีเครื่องหมายคำพูด) */
function escHtml(v){
  return String(v ?? '').replace(/[&<>"'`]/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
}

/** อนุญาตเฉพาะ URL รูปที่ปลอดภัย (https หรือ data:image) — อย่างอื่นคืนค่าว่าง */
function safeUrl(u){
  const s = String(u ?? '').trim();
  if (/^https:\/\//i.test(s)) return s;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(s)) return s;
  return '';
}

/** attribute สำหรับเปิดรูปขยาย — ใช้แทน onclick="openLightbox('...')" ที่ escape ไม่ได้จริง
    (การแทน ' ด้วย &#39; ไม่ช่วย เพราะเบราว์เซอร์ถอดกลับเป็น ' ก่อนรันโค้ดใน onclick) */
function lbAttrs(url, name){
  return `data-lb-url="${escHtml(safeUrl(url))}" data-lb-name="${escHtml(name)}"`;
}
// ตัวรับคลิกกลางสำหรับ data-lb-url (capture phase → หยุดไม่ให้คลิกทะลุไปเปิดการ์ดนักเรียน)
document.addEventListener('click', e => {
  const el = e.target && e.target.closest && e.target.closest('[data-lb-url]');
  if (!el) return;
  e.stopPropagation(); e.preventDefault();
  const url = el.getAttribute('data-lb-url');
  if (url && typeof openLightbox === 'function') openLightbox(url, el.getAttribute('data-lb-name') || '');
}, true);

/* ล้างอักขระที่ใช้เจาะ HTML/JS ออกจากทุกข้อความในระเบียน (ลงลึกทุกชั้น)
   แทนด้วยอักขระหน้าตาใกล้เคียงที่ไม่มีความหมายพิเศษใน HTML:
     <  →  ＜      >  →  ＞      "  →  ”      '  →  ’      `  →  ‘      \  →  ＼
     &# / &name;  →  ＆...   (กันการซ่อนเครื่องหมายคำพูดในรูป entity เช่น &#39;)
   ฟิลด์ที่เป็น URL (photoUrl ฯลฯ) ใช้กฎของ URL แทน เพื่อไม่ให้ลิงก์ Google Drive พัง
   ทำซ้ำกี่ครั้งผลก็เท่าเดิม (idempotent) จึงไม่ทำให้ระบบ sync เห็นว่าข้อมูลเปลี่ยนวนไปมา */
const _URL_KEY_RE = /(url|photo|link|image|img)$/i;
function sanitizeText(v){
  return String(v)
    .replace(/&(?=#?[A-Za-z0-9]+;)/g, '＆')
    .replace(/</g, '＜').replace(/>/g, '＞')
    .replace(/"/g, '”').replace(/'/g, '’')
    .replace(/`/g, '‘').replace(/\\/g, '＼');
}
function sanitizeUrlValue(v){
  const s = String(v).trim();
  if (s === '') return '';
  if (/^data:image\//i.test(s)) return safeUrl(s);
  if (!/^https?:\/\//i.test(s)) return '';          // javascript:, vbscript: ฯลฯ → ทิ้ง
  return s.replace(/["'<>`\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
          .replace(/&(?=#?[A-Za-z0-9]+;)/g, '%26');
}
function sanitizeDeep(v, key){
  if (typeof v === 'string') return _URL_KEY_RE.test(key || '') ? sanitizeUrlValue(v) : sanitizeText(v);
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = sanitizeDeep(v[i], key); return v; }
  if (v && typeof v === 'object') {
    // ชื่อ key ก็ถูกนำไปแสดงได้ในบางหน้า (เช่น ตารางใน form) — ล้าง key ที่มีอักขระอันตรายด้วย
    Object.keys(v).forEach(k => {
      const val = sanitizeDeep(v[k], k);
      const nk = /[<>"'`&\\]/.test(k) ? sanitizeText(k) : k;
      if (nk !== k) delete v[k];
      v[nk] = val;
    });
    return v;
  }
  return v;
}
/** ใช้กับระเบียนนักเรียน 1 คน — แก้ในที่ (in-place) และคืนตัวเดิม */
function sanitizeStudent(s){
  if (!s || typeof s !== 'object') return s;
  try { sanitizeDeep(s, ''); } catch (e) { console.warn('sanitizeStudent:', e); }
  return s;
}

/* ============================================================
   🔒 ข้อมูลอ่อนไหวที่ส่งไป Google Sheet (เพิ่มใน v15)
   Apps Script Web App ที่ตั้งเป็น "Anyone" ไม่มีการยืนยันตัวตน —
   ค่าเริ่มต้นจึง "ปิดบัง" เลขบัตร ปชช. และเลขบัญชีธนาคาร (เหลือ 4 หลักท้าย)
   ในข้อมูล "แบบฟอร์มทุน" ที่ส่งไป Sheet (sfSendToSheet)
   ส่วนการ mirror ทั้งระเบียนไป Sheet ถูกปิดในโหมด Firebase (ดู 18-firebase-bridge.js)
   ถ้า Apps Script ตรวจ token แล้วและจำเป็นต้องใช้ข้อมูลเต็ม ค่อยเปลี่ยนเป็น true
   ============================================================ */
const SHEET_SEND_SENSITIVE = false;
// โหมด Firebase: ไม่ mirror "ทั้งระเบียน" (เลขบัตร/บัญชีธนาคาร/ที่อยู่) ไป Sheet อีก
// (saveStudentToSheet / saveAllToSheet / deleteStudentFromSheet) — เปลี่ยนเป็น true ถ้าจำเป็นจริง
const SHEET_MIRROR_IN_FIREBASE_MODE = false;
function maskTail(v){
  const s = String(v ?? '');
  const digits = s.replace(/\D/g, '');
  if (!digits) return s ? '•••' : '';
  return '•'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
}
const _SENSITIVE_LABEL_RE = /(เลขบัตร|เลขประจำตัวประชาชน|บัตรประชาชน|เลขที่บัญชี|เลขบัญชี)/;
function isSensitiveLabel(label){ return _SENSITIVE_LABEL_RE.test(String(label || '')); }

// จัดรูปแบบวันที่ให้เป็น dd/mm/yyyy (พ.ศ.) ไม่ว่าค่าจะมาแบบ ISO, Date, หรือ dd/mm/yyyy
function fmtThaiDate(v){
  if(v===null||v===undefined||v==='') return '';
  // เป็น Date object → จัดรูปตามโซนเวลากรุงเทพ (กันวันคลาด)
  if(v instanceof Date){
    try{ return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric'}).format(v); }catch(e){ return String(v); }
  }
  const s=String(v).trim();
  if(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return s;            // เป็น dd/mm/yyyy อยู่แล้ว
  if(/^\d{3,4}-\d{1,2}-\d{1,2}T/.test(s)){                        // ISO มีเวลา → ใช้โซนกรุงเทพ
    const d=new Date(s);
    if(!isNaN(d.getTime())){
      try{ return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric'}).format(d); }catch(e){}
    }
  }
  const m=s.match(/^(\d{3,4})-(\d{1,2})-(\d{1,2})$/);            // ISO ไม่มีเวลา (YYYY-MM-DD)
  if(m){ const p=x=>String(x).padStart(2,'0'); return p(m[3])+'/'+p(m[2])+'/'+m[1]; }
  return s;                                                      // รูปแบบอื่น คืนตามเดิม
}

// คำนวณอายุจากวันเกิด (รองรับปี พ.ศ.)
function maskId(id){
  if(!id) return '-';
  const s=String(id).replace(/\D/g,'');
  if(s.length!==13) return id;
  // แสดงรูปแบบ: 1-xxxx-xxxxx-xx-5 (เห็นแค่หลักแรกและหลักสุดท้าย)
  return s[0]+'-xxxx-xxxxx-xx-'+s[12];
}
function calcAge(dob){
  if(!dob) return '-';
  const parts = String(dob).split('-');
  if(parts.length < 3) return '-';
  let by = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  const d = parseInt(parts[2]);
  // ถ้า by > 2400 ถือเป็น พ.ศ. ให้แปลงเป็น ค.ศ.
  const cy = by > 2400 ? by - 543 : by;
  const today = new Date();
  let age = today.getFullYear() - cy;
  const monthDiff = (today.getMonth()+1) - m;
  if(monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
  return (age > 0 && age < 30) ? age + ' ปี' : '-';
}

// ============ GOOGLE SHEET LAT/LNG SYNC ============
const SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbzytJf5cvW3hxcMCDByruDk4NiQFkZBxpA9tlj6eAZFgSA-9S3K5gQR_zH1RGBTVoBssQ/exec';

async function syncLatLngFromSheet(){
  const btn = document.getElementById('sync-latlng-btn');
  if(btn){ btn.disabled=true; btn.textContent='⏳ กำลังซิงค์...'; }
  try {
    const res = await fetch(SHEET_API_URL + '?action=getLatLng', {mode:'cors'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    if(!Array.isArray(data)) throw new Error('รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น Array)');
    let updated = 0;
    data.forEach(row => {
      const idx = DB.students.findIndex(s => String(s.no) === String(row.no));
      if(idx >= 0 && (row.lat || row.lng)){
        if(!DB.students[idx].school_m1_addr) DB.students[idx].school_m1_addr = {};
        if(row.lat) DB.students[idx].school_m1_addr.lat = parseFloat(row.lat);
        if(row.lng) DB.students[idx].school_m1_addr.lng = parseFloat(row.lng);
        if(row.amphoe) DB.students[idx].school_m1_addr.amphoe = row.amphoe;
        if(row.tambon) DB.students[idx].school_m1_addr.tambon = row.tambon;
        updated++;
      }
    });
    saveToStorage();
    renderMapMarkers();
    if(btn){ btn.disabled=false; btn.textContent='🔄 ซิงค์ lat/lng จาก Google Sheet'; }
    showMapNotice('✅ ซิงค์สำเร็จ อัปเดต '+updated+' โรงเรียน','#3A6A10');
  } catch(e){
    if(btn){ btn.disabled=false; btn.textContent='🔄 ซิงค์ lat/lng จาก Google Sheet'; }
    showMapNotice('❌ ซิงค์ไม่สำเร็จ: '+e.message,'#9E2B2B');
  }
}

// วาง JSON lat/lng จาก clipboard หรือ export จาก Sheet โดยตรง
// รูปแบบ: [{"no":1,"lat":15.123,"lng":100.456}, ...]
function applyLatLngJSON(){
  const jsonStr = prompt('วาง JSON lat/lng ที่นี่\nรูปแบบ: [{"no":1,"lat":15.12,"lng":100.45}, ...]\n\n(คัดลอกจาก Google Sheet หรือ Apps Script)');
  if(!jsonStr) return;
  try{
    const data = JSON.parse(jsonStr);
    let updated = 0;
    data.forEach(row => {
      const idx = DB.students.findIndex(s => String(s.no) === String(row.no));
      if(idx>=0 && (row.lat||row.lng)){
        if(!DB.students[idx].school_m1_addr) DB.students[idx].school_m1_addr={};
        if(row.lat) DB.students[idx].school_m1_addr.lat = parseFloat(row.lat);
        if(row.lng) DB.students[idx].school_m1_addr.lng = parseFloat(row.lng);
        updated++;
      }
    });
    saveToStorage();
    renderMapMarkers();
    showMapNotice('✅ อัปเดต lat/lng สำเร็จ '+updated+' รายการ','#3A6A10');
  }catch(e){
    alert('❌ JSON ไม่ถูกต้อง: '+e.message);
  }
}

function showMapNotice(msg, color){
  const el = document.getElementById('map-notice');
  if(!el) return;
  el.textContent = msg;
  el.style.color = color||'var(--text)';
  el.style.display = 'block';
  setTimeout(()=>{ el.style.display='none'; }, 5000);
}

function gpaColor(g){
  if(!g||g===0) return '#aaa';
  if(g>=3.5) return '#A2CB8B';
  if(g>=3.0) return '#FFD786';
  if(g>=2.5) return '#DC143C';
  return '#9E2B2B';
}
function riskBadge(r){
  if(r==='สูงมาก') return 'badge risk-high-high';
  if(r==='สูง') return 'badge risk-high';
  if(r==='ปานกลาง') return 'badge risk-mid';
  if(r==='ต่ำ') return 'badge risk-low';
  return 'badge b-gray';
}
function destroyChart(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
function initials(name){
  const p=name.replace(/^(ด\.(ช|ญ)\.|นาย|นาง(สาว)?)\s*/,'').trim();
  return p.substring(0,2);
}
// ปรับปรุงฟังก์ชัน fixDriveUrl ให้รองรับ URL ที่อาจมี =S4000
function fixDriveUrl(url) {
  if (!url) return url;
  // ถ้าเป็นลิงก์ thumbnail จาก Google อยู่แล้ว
  if (url.includes('drive.google.com/thumbnail')) {
    // ลบ parameter =S4000 หรือ &sz=... ก่อน
    url = url.replace(/=S\d+/, '');
    url = url.replace(/&sz=w\d+/, '');
    return url + '&sz=w200';
  }
  let m = url.match(/[?&]id=([a-zA-Z0-9_\-]+)/);
  if (!m) {
    m = url.match(/\/d\/([a-zA-Z0-9_\-]+)/);
  }
  if (m && url.includes('drive.google.com')) {
    return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w200`;
  }
  return url;
}

function photoEl(s, cls='tbl-photo', fallbackCls='tbl-avatar'){
  const src = safeUrl(s.photoUrl ? fixDriveUrl(s.photoUrl) : '');
  if(src) {
    return `<img class="${cls}" src="${escHtml(src)}" alt="${escHtml(s.name)}" title="คลิกดูรูปเต็ม" ${lbAttrs(s.photoUrl, s.name)} onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="${fallbackCls}" style="display:none">${escHtml(initials(s.name||''))}</div>`;
  }
  return `<div class="${fallbackCls}">${escHtml(initials(s.name||''))}</div>`;
}
function getLatestGpa(s){
  // ถ้ามี semGpa และมี GPA จริง ให้ใช้ตัวล่าสุด
  if(s.semGpa && s.semGpa.length > 0) {
    const last = s.semGpa[s.semGpa.length - 1];
    if(last.gpa && last.gpa > 0) return last;
    // ถ้า gpa=0 ให้ fallback ไปหาตัวที่มี gpa
    const valid = s.semGpa.filter(g => g.gpa > 0);
    if(valid.length > 0) return valid[valid.length - 1];
  }
  // Fallback: ใช้ s.gpa โดยตรง
  return s.gpa || {};
}

// ============ NAV ============
