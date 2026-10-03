/* ============================================================
   DriveFiles.gs — Apps Script Web App สำหรับเก็บไฟล์ของระบบ DLTV Fund ใน Google Drive
   ------------------------------------------------------------
   ใช้กับ: เอกสารแนบ (ผลการเรียน / สำเนาสมุดบัญชี / อื่น ๆ) และรูปนักเรียน
   เป็นโปรเจกต์ Apps Script "แยก" จากสคริปต์ Google Sheet เดิม (ไม่กระทบของเดิม)

   วิธีติดตั้ง (ครั้งเดียว) — ดูรายละเอียดใน README หัวข้อ v49
   1. เปิด https://script.google.com → New project → ตั้งชื่อ "DLTV Fund – Files"
   2. ลบโค้ดเดิม วางไฟล์นี้ทั้งไฟล์ → บันทึก
   3. Deploy → New deployment → Web app
        Execute as: Me (บัญชีที่เป็นเจ้าของ/แก้ไขโฟลเดอร์ Drive ได้)
        Who has access: Anyone
   4. อนุญาตสิทธิ์ (Authorize) → คัดลอก Web app URL ไปใส่ js/drive-config.js

   ความปลอดภัย
   • ทุกคำขอต้องแนบ Firebase ID token ของผู้ใช้ที่ล็อกอินอยู่ — สคริปต์ตรวจสิทธิ์จาก Firestore ด้วย token นั้น
     (Firestore ตรวจลายเซ็น token ให้ · token ปลอม/หมดอายุ = ถูกปฏิเสธ)
     - ผู้ดูแล (admins/{email}) หรือเจ้าหน้าที่ (accounts/{uid}.role = staff) → ทุกนักเรียน
     - ครูผู้ดูแล (accounts/{uid}.role = student) → เฉพาะลำดับนักเรียนของตัวเอง (accounts/{uid}.no)
   • เอกสารแนบเป็นไฟล์ส่วนตัว (ไม่แชร์สาธารณะ) — เปิดดูผ่านสคริปต์นี้ หรือในโฟลเดอร์ Drive สำหรับผู้ที่มีสิทธิ์
   • รูปนักเรียนแชร์แบบ "ทุกคนที่มีลิงก์ดูได้" เพื่อแสดงในหน้าเว็บ (ลิงก์สุ่ม เดาไม่ได้)
   ============================================================ */

const ROOT_FOLDER_ID = '168r2gFuXdKlRpq3hWaXEllr7hxq7xHf4';   // โฟลเดอร์ปลายทางของมูลนิธิฯ

/* v50: ทะเบียนเอกสารแนบใน Google Sheet
   วาง ID ของสเปรดชีต "สำเนา ปพ.สมุดบัญชี" (ส่วนของลิงก์ระหว่าง /d/ กับ /edit) ด้านล่าง
   ถ้าเว้นว่าง: สคริปต์จะหาไฟล์ชื่อ LOG_SHEET_NAME ในโฟลเดอร์ปลายทาง ไม่พบจะสร้างให้ใหม่ */
const LOG_SHEET_ID = '1vwJAeat2YKqMD21Q2wEFfZKA2Wn9OOvv15WVDHFN58A';   // สำเนา ปพ.สมุดบัญชี
const LOG_SHEET_NAME = 'สำเนา ปพ.สมุดบัญชี';
const LOG_TAB = 'ทะเบียนไฟล์';
const SUMMARY_TAB = 'สรุปรายภาคเรียน';
const LOG_HEAD = ['วันเวลาอัปโหลด', 'ลำดับ', 'ชื่อ-สกุล', 'โรงเรียน', 'ภาคเรียน', 'ประเภทเอกสาร', 'ชื่อไฟล์', 'ขนาด (KB)',
  'เปิดไฟล์', 'File ID', 'ผู้อัปโหลด', 'บทบาท', 'สถานะ', 'วันเวลาที่ลบ', 'ผู้ลบ'];
const KIND_TH = { grades: 'ผลการเรียน', bankbook: 'สำเนาสมุดบัญชี', other: 'เอกสารอื่น ๆ' };
const FIREBASE_PROJECT_ID = 'dltvfund';
const MAX_BYTES = 12 * 1024 * 1024;
const KIND_FOLDER = { grades: 'ผลการเรียน', bankbook: 'สมุดบัญชี', other: 'เอกสารอื่น', photo: 'รูปนักเรียน' };

function doGet() { return json_({ status: 'ok', service: 'DLTV Fund Files', time: new Date().toISOString() }); }

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const user = authorize_(body.idToken);
    switch (body.action) {
      case 'driveUpload': return json_(upload_(user, body));
      case 'driveGet':    return json_(getFile_(user, body));
      case 'driveDelete': return json_(remove_(user, body));
      case 'drivePing':   return json_({ status: 'ok', role: user.role, no: user.no || '' });
      default:            return json_({ status: 'error', message: 'unknown action' });
    }
  } catch (err) {
    return json_({ status: 'error', message: String(err && err.message || err) });
  }
}

/* ---------- ตรวจสิทธิ์จาก Firebase ---------- */
function authorize_(idToken) {
  if (!idToken) throw new Error('ต้องเข้าสู่ระบบก่อน');
  const claims = decodeJwt_(idToken);
  const uid = claims.user_id || claims.sub, email = String(claims.email || '');
  if (!uid) throw new Error('token ไม่ถูกต้อง');
  if (claims.aud !== FIREBASE_PROJECT_ID) throw new Error('token ไม่ใช่ของโปรเจกต์นี้');
  if (Number(claims.exp || 0) * 1000 < Date.now()) throw new Error('token หมดอายุ กรุณาโหลดหน้าใหม่');
  // ผู้ดูแล: admins/{email} (Rules อนุญาตให้อ่านเอกสารของอีเมลตัวเอง)
  if (email) {
    const a = fsGet_('admins/' + encodeURIComponent(email), idToken);
    if (a.code === 200) return { uid, email, role: 'admin' };
    if (a.code === 401) throw new Error('token ไม่ถูกต้องหรือหมดอายุ');
  }
  const acc = fsGet_('accounts/' + uid, idToken);
  if (acc.code === 401) throw new Error('token ไม่ถูกต้องหรือหมดอายุ');
  if (acc.code !== 200) throw new Error('ไม่พบบัญชีผู้ใช้ในระบบ');
  const f = acc.data.fields || {};
  const role = val_(f.role);
  if (role === 'staff') return { uid, email, role: 'staff' };
  if (role === 'student') return { uid, email, role: 'student', no: String(val_(f.no)) };
  throw new Error('บัญชีนี้ไม่มีสิทธิ์จัดการไฟล์');
}
function canAccess_(user, studentNo) {
  if (user.role === 'admin' || user.role === 'staff') return true;
  return user.role === 'student' && String(studentNo) === String(user.no);
}
function decodeJwt_(t) {
  const p = String(t).split('.')[1];
  if (!p) throw new Error('token ไม่ถูกต้อง');
  const s = Utilities.newBlob(Utilities.base64DecodeWebSafe(p + '==='.slice((p.length + 3) % 4))).getDataAsString();
  return JSON.parse(s);
}
function fsGet_(path, idToken) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/' + path;
  const r = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + idToken } });
  let data = {}; try { data = JSON.parse(r.getContentText() || '{}'); } catch (e) {}
  return { code: r.getResponseCode(), data };
}
function val_(v) { if (!v) return ''; return v.stringValue != null ? v.stringValue : v.integerValue != null ? v.integerValue : v.doubleValue != null ? v.doubleValue : ''; }

/* ---------- โฟลเดอร์ ---------- */
function sub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function studentFolder_(no) {
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  return sub_(root, 'ลำดับ ' + String(no).replace(/[^\w-]/g, ''));
}
function inStudentFolder_(file, no) {
  // ไฟล์ต้องอยู่ใต้โฟลเดอร์ "ลำดับ <no>" (ลึกได้ไม่เกิน 4 ชั้น) — กันลบ/เปิดไฟล์อื่นใน Drive
  const target = studentFolder_(no).getId();
  let level = [];
  const ps = file.getParents(); while (ps.hasNext()) level.push(ps.next());
  for (let d = 0; d < 4 && level.length; d++) {
    if (level.some(f => f.getId() === target)) return true;
    const next = [];
    level.forEach(f => { const it = f.getParents(); while (it.hasNext()) next.push(it.next()); });
    level = next;
  }
  return false;
}

/* ---------- คำสั่ง ---------- */
function upload_(user, b) {
  if (!canAccess_(user, b.studentNo)) throw new Error('ไม่มีสิทธิ์อัปโหลดไฟล์ของนักเรียนคนนี้');
  const kind = KIND_FOLDER[b.kind] ? b.kind : 'other';
  if (kind === 'photo' && user.role === 'student') throw new Error('อัปโหลดรูปนักเรียนได้เฉพาะผู้ดูแล');
  const bytes = Utilities.base64Decode(String(b.data || ''));
  if (!bytes.length) throw new Error('ไฟล์ว่าง');
  if (bytes.length > MAX_BYTES) throw new Error('ไฟล์ใหญ่เกิน 12 MB');
  const mime = String(b.mimeType || 'application/octet-stream');
  if (!/^image\//.test(mime) && mime !== 'application/pdf') throw new Error('รองรับเฉพาะ PDF และรูปภาพ');
  const term = String(b.term || 'ไม่ระบุภาค').replace('/', '-');
  let folder = studentFolder_(b.studentNo);
  folder = kind === 'photo' ? sub_(folder, KIND_FOLDER.photo) : sub_(sub_(folder, 'ภาคเรียน ' + term), KIND_FOLDER[kind]);
  const safe = String(b.fileName || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  const file = folder.createFile(Utilities.newBlob(bytes, mime, safe));
  file.setDescription('DLTV Fund · ลำดับ ' + b.studentNo + ' · ' + term + ' · ' + kind + ' · โดย ' + (user.email || user.role) + ' · ' + new Date().toISOString());
  if (kind === 'photo') file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  else { try { logUpload_(user, b, kind, file); } catch (e) { console.warn('log', e); } }   // v50: บันทึกลงทะเบียน (ไม่ทำให้การอัปโหลดล้ม)
  return { status: 'ok', fileId: file.getId(), name: file.getName(), size: file.getSize(), mimeType: mime,
    url: 'https://drive.google.com/file/d/' + file.getId() + '/view' };
}
function getFile_(user, b) {
  if (!canAccess_(user, b.studentNo)) throw new Error('ไม่มีสิทธิ์เปิดไฟล์นี้');
  const file = DriveApp.getFileById(String(b.fileId));
  if (!inStudentFolder_(file, b.studentNo)) throw new Error('ไฟล์ไม่ได้อยู่ในโฟลเดอร์ของนักเรียนคนนี้');
  const blob = file.getBlob();
  return { status: 'ok', name: file.getName(), mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}
function remove_(user, b) {
  if (!canAccess_(user, b.studentNo)) throw new Error('ไม่มีสิทธิ์ลบไฟล์นี้');
  let file;
  try { file = DriveApp.getFileById(String(b.fileId)); } catch (e) { return { status: 'ok', missing: true }; }
  if (!inStudentFolder_(file, b.studentNo)) throw new Error('ไฟล์ไม่ได้อยู่ในโฟลเดอร์ของนักเรียนคนนี้');
  file.setTrashed(true);   // ย้ายไปถังขยะ (กู้คืนได้ 30 วัน)
  try { logDelete_(user, String(b.fileId)); } catch (e) { console.warn('log', e); }
  return { status: 'ok' };
}

/* ---------- v50: ทะเบียนเอกสารแนบ (Google Sheet) ---------- */
function logBook_() {
  let ss;
  if (LOG_SHEET_ID) ss = SpreadsheetApp.openById(LOG_SHEET_ID);
  else {
    const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const it = root.getFilesByName(LOG_SHEET_NAME);
    if (it.hasNext()) ss = SpreadsheetApp.open(it.next());
    else { ss = SpreadsheetApp.create(LOG_SHEET_NAME); DriveApp.getFileById(ss.getId()).moveTo(root); }
  }
  let sh = ss.getSheetByName(LOG_TAB);
  if (!sh) {
    sh = ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0 ? ss.getSheets()[0].setName(LOG_TAB) : ss.insertSheet(LOG_TAB, 0);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(LOG_HEAD);
    sh.getRange(1, 1, 1, LOG_HEAD.length).setFontWeight('bold').setBackground('#1E3FD1').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    [150, 55, 190, 190, 80, 120, 220, 75, 80, 120, 170, 120, 80, 150, 170].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  }
  return { ss, sh };
}
function logUpload_(user, b, kind, file) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const { ss, sh } = logBook_();
    const url = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    sh.appendRow([new Date(), String(b.studentNo), String(b.studentName || ''), String(b.school || ''), String(b.term || ''),
      KIND_TH[kind] || kind, String(b.originalName || file.getName()), Math.round(file.getSize() / 1024),
      '=HYPERLINK("' + url + '","เปิดไฟล์")', file.getId(), user.email || '(บัญชีครูผู้ดูแล)',
      user.role === 'student' ? 'ครูผู้ดูแล' : user.role === 'staff' ? 'เจ้าหน้าที่' : 'ผู้ดูแลระบบ', 'ใช้งาน', '', '']);
    rebuildSummary_(ss, sh);
  } finally { lock.releaseLock(); }
}
function logDelete_(user, fileId) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const { ss, sh } = logBook_();
    const n = sh.getLastRow(); if (n < 2) return;
    const ids = sh.getRange(2, 10, n - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === fileId) {
        sh.getRange(i + 2, 13, 1, 3).setValues([['ลบแล้ว', new Date(), user.email || '(บัญชีครูผู้ดูแล)']]);
        sh.getRange(i + 2, 1, 1, LOG_HEAD.length).setFontColor('#94A3B8');
      }
    }
    rebuildSummary_(ss, sh);
  } finally { lock.releaseLock(); }
}
/** แท็บสรุป: 1 แถว = นักเรียน 1 คนต่อ 1 ภาคเรียน · ผลการเรียน / สมุดบัญชี แนบแล้วหรือยัง */
function rebuildSummary_(ss, sh) {
  const n = sh.getLastRow();
  const rows = n > 1 ? sh.getRange(2, 1, n - 1, LOG_HEAD.length).getValues() : [];
  const map = {};
  rows.forEach(r => {
    if (r[12] !== 'ใช้งาน') return;
    const key = r[4] + '|' + r[1];
    const m = map[key] || (map[key] = { term: r[4], no: r[1], name: r[2], school: r[3], g: 0, bk: 0, o: 0, last: r[0] });
    if (r[5] === KIND_TH.grades) m.g++; else if (r[5] === KIND_TH.bankbook) m.bk++; else m.o++;
    if (r[2]) m.name = r[2]; if (r[3]) m.school = r[3];
    if (r[0] > m.last) m.last = r[0];
  });
  const tk = t => { const x = String(t).match(/(\d)\/(\d{4})/); return x ? +x[2] * 10 + +x[1] : 0; };
  const list = Object.keys(map).map(k => map[k]).sort((a, b) => tk(b.term) - tk(a.term) || Number(a.no) - Number(b.no));
  let su = ss.getSheetByName(SUMMARY_TAB) || ss.insertSheet(SUMMARY_TAB);
  su.clear();
  const head = ['ภาคเรียน', 'ลำดับ', 'ชื่อ-สกุล', 'โรงเรียน', 'ผลการเรียน', 'สำเนาสมุดบัญชี', 'เอกสารอื่น', 'ครบ (จำเป็น 2 อย่าง)', 'อัปโหลดล่าสุด'];
  const out = [head].concat(list.map(m => [m.term, m.no, m.name, m.school,
    m.g ? '✓ ' + m.g + ' ไฟล์' : '✗ ยังไม่แนบ', m.bk ? '✓ ' + m.bk + ' ไฟล์' : '✗ ยังไม่แนบ', m.o || '',
    m.g && m.bk ? 'ครบ' : 'ยังไม่ครบ', m.last]));
  su.getRange(1, 1, out.length, head.length).setValues(out);
  su.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#16A34A').setFontColor('#ffffff');
  su.setFrozenRows(1);
  if (out.length > 1) {
    su.getRange(2, 9, out.length - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
    const rng = su.getRange(2, 8, out.length - 1, 1);
    su.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('ครบ').setBackground('#DCFCE7').setFontColor('#166534').setRanges([rng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('ยังไม่ครบ').setBackground('#FEF3C7').setFontColor('#92400E').setRanges([rng]).build()]);
  }
  [80, 55, 190, 190, 110, 120, 80, 130, 140].forEach((w, i) => su.setColumnWidth(i + 1, w));
}
/** กด Run ด้วยมือได้ถ้าต้องการสร้างแท็บสรุปใหม่ */
function rebuildSummary() { const { ss, sh } = logBook_(); rebuildSummary_(ss, sh); }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** กด Run ฟังก์ชันนี้ 1 ครั้งในหน้า Apps Script เพื่อขอสิทธิ์และตรวจว่าเข้าถึงโฟลเดอร์ได้ */
function testSetup() {
  const f = DriveApp.getFolderById(ROOT_FOLDER_ID);
  Logger.log('โฟลเดอร์: ' + f.getName() + ' · เข้าถึงได้');
  UrlFetchApp.fetch('https://firestore.googleapis.com', { muteHttpExceptions: true });
  Logger.log('เชื่อม Firestore ได้');
  const { ss } = logBook_();
  Logger.log('ทะเบียนเอกสารแนบ: ' + ss.getUrl());
}
