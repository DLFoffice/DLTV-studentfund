/* ============================================================
   MailCodes.gs — Apps Script Web App ส่งอีเมลแจ้งรหัสเข้าใช้ระบบ DLTV Fund ให้ครู
   ------------------------------------------------------------
   ใช้กับ: หน้า "จัดการบัญชี" (accounts.html) → คำขอรับรหัสจากครู → ✅ อนุมัติ & ส่งอีเมล
   ผู้ส่ง:  บัญชีที่ Deploy สคริปต์นี้ (ตั้งไว้: adipong@school.dltv.ac.th)

   วิธีติดตั้ง (ครั้งเดียว) — ต้องล็อกอิน Google ด้วย adipong@school.dltv.ac.th
   1. เปิด https://script.google.com → New project → ตั้งชื่อ "DLTV Fund – Mail"
   2. ลบโค้ดเดิม วางไฟล์นี้ทั้งไฟล์ → บันทึก
   3. เลือกฟังก์ชัน testSetup → Run → อนุญาตสิทธิ์ (ส่งอีเมล + เชื่อมต่อภายนอก)
      ระบบจะส่งอีเมลทดสอบเข้า SENDER_EMAIL 1 ฉบับ
   4. Deploy → New deployment → Web app
        Execute as: Me (adipong@school.dltv.ac.th)
        Who has access: Anyone
   5. คัดลอก Web app URL (ลงท้าย /exec) ไปวางที่ MAIL_SCRIPT_URL ใน accounts.html

   ความปลอดภัย
   • ทุกคำขอต้องแนบ Firebase ID token — สคริปต์ตรวจกับ Firestore ว่าเป็น "ผู้ดูแลระบบ" (admins/{email}) เท่านั้น
   • อีเมลผู้รับ ชื่อครู และข้อมูลนักเรียน อ่านจากคำขอใน Firestore (codeRequests/{id}) ไม่ใช้ค่าที่ส่งมาจากหน้าเว็บ
     จึงส่งได้เฉพาะถึงครูที่ยื่นคำขอจริงเท่านั้น
   ============================================================ */

const SENDER_EMAIL = 'adipong@school.dltv.ac.th';
const SENDER_NAME = 'ระบบดูแลนักเรียนทุน DLTV Fund';
const FIREBASE_PROJECT_ID = 'dltvfund';
const LOGIN_URL = 'https://dlfoffice.github.io/DLTV-studentfund/login.html';

function doGet() {
  return json_({ status: 'ok', service: 'DLTV Fund Mail', quota: MailApp.getRemainingDailyQuota(), time: new Date().toISOString() });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const admin = authorizeAdmin_(body.idToken);
    switch (body.action) {
      case 'mailPing': return json_({ status: 'ok', quota: MailApp.getRemainingDailyQuota(), admin: admin.email });
      case 'sendCode': return json_(sendCode_(admin, body));
      default:         return json_({ status: 'error', message: 'unknown action' });
    }
  } catch (err) {
    return json_({ status: 'error', message: String(err && err.message || err) });
  }
}

/* ---------- ส่งรหัสให้ครู ---------- */
function sendCode_(admin, b) {
  const id = String(b.requestId || '');
  if (!/^[A-Za-z0-9_-]{5,64}$/.test(id)) throw new Error('requestId ไม่ถูกต้อง');
  const username = String(b.username || '').trim(), password = String(b.password || '').trim();
  if (!username || !password || username.length > 80 || password.length > 80) throw new Error('ไม่มีชื่อผู้ใช้หรือรหัสผ่านที่จะส่ง');

  const r = fsGet_('codeRequests/' + id, b.idToken);
  if (r.code !== 200) throw new Error('ไม่พบคำขอในระบบ (' + r.code + ')');
  const f = r.data.fields || {};
  const req = { email: String(val_(f.email)).trim(), teacher: val_(f.teacherName), no: val_(f.no),
    student: val_(f.studentName), school: val_(f.school), status: val_(f.status), issued: val_(f.issuedUsername) };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(req.email)) throw new Error('อีเมลในคำขอไม่ถูกต้อง');
  if (req.status === 'rejected') throw new Error('คำขอนี้ถูกปฏิเสธแล้ว');
  if (req.issued && String(req.issued) !== username) throw new Error('ชื่อผู้ใช้ไม่ตรงกับที่อนุมัติไว้ในคำขอ');
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('โควตาส่งอีเมลของวันนี้หมดแล้ว ลองใหม่พรุ่งนี้');

  const subject = 'รหัสเข้าใช้งานระบบดูแลนักเรียนทุน DLTV Fund — นักเรียนทุนลำดับ ' + req.no;
  const text =
    'เรียน คุณครู' + req.teacher + '\n\n' +
    'มูลนิธิฯ อนุมัติคำขอรับรหัสเข้าใช้งานระบบดูแลนักเรียนทุนแล้ว\n\n' +
    'นักเรียนทุนลำดับ: ' + req.no + '\nชื่อ-สกุล: ' + req.student + '\nโรงเรียน: ' + req.school + '\n\n' +
    'ชื่อผู้ใช้ (username): ' + username + '\nรหัสผ่าน: ' + password + '\n\n' +
    'เข้าสู่ระบบที่: ' + LOGIN_URL + '\n' +
    'แนะนำให้เปลี่ยนรหัสผ่านหลังเข้าใช้ครั้งแรก และเก็บรหัสนี้เป็นความลับ\n\n' +
    SENDER_NAME + '\n(อีเมลนี้ส่งอัตโนมัติ หากมีข้อสงสัยตอบกลับอีเมลนี้ได้)';

  MailApp.sendEmail({
    to: req.email, subject: subject, body: text, htmlBody: html_(req, username, password),
    name: SENDER_NAME, replyTo: SENDER_EMAIL,
  });
  return { status: 'ok', to: req.email, quota: MailApp.getRemainingDailyQuota(), sentAt: new Date().toISOString() };
}

function html_(q, user, pass) {
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const row = (k, v, mono) => '<tr><td style="padding:6px 12px 6px 0;color:#64748B;white-space:nowrap">' + k + '</td><td style="padding:6px 0;color:#0F172A;font-weight:600' +
    (mono ? ';font-family:Consolas,Menlo,monospace;font-size:16px;letter-spacing:.5px' : '') + '">' + e(v) + '</td></tr>';
  return '<div style="background:#EEF3FF;padding:24px 12px;font-family:Sarabun,Tahoma,Arial,sans-serif">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #DCE5FF">' +
    '<div style="background:#1E3FD1;color:#fff;padding:20px 24px"><div style="font-size:13px;opacity:.8">มูลนิธิการศึกษาทางไกลผ่านดาวเทียม</div>' +
    '<div style="font-size:20px;font-weight:700;margin-top:4px">รหัสเข้าใช้งานระบบดูแลนักเรียนทุน</div></div>' +
    '<div style="padding:22px 24px;font-size:15px;line-height:1.7;color:#334155">' +
    '<p style="margin:0 0 12px">เรียน คุณครู' + e(q.teacher) + '</p>' +
    '<p style="margin:0 0 14px">มูลนิธิฯ อนุมัติคำขอรับรหัสเข้าใช้งานแล้ว สำหรับนักเรียนทุนต่อไปนี้</p>' +
    '<table style="border-collapse:collapse;margin-bottom:14px">' + row('ลำดับ', q.no) + row('ชื่อ-สกุล', q.student) + row('โรงเรียน', q.school) + '</table>' +
    '<div style="background:#F5F8FF;border:1px dashed #9DB4FF;border-radius:12px;padding:12px 16px;margin-bottom:18px"><table style="border-collapse:collapse">' +
    row('ชื่อผู้ใช้', user, true) + row('รหัสผ่าน', pass, true) + '</table></div>' +
    '<p style="text-align:center;margin:0 0 18px"><a href="' + LOGIN_URL + '" style="display:inline-block;background:#1E3FD1;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:12px">เข้าสู่ระบบ</a></p>' +
    '<p style="margin:0;font-size:13.5px;color:#64748B">แนะนำให้เปลี่ยนรหัสผ่านหลังเข้าใช้ครั้งแรก และเก็บรหัสนี้เป็นความลับ · หลังเข้าสู่ระบบ ดูวิธีใช้ได้ที่เมนู "คู่มือการใช้งานระบบ"</p>' +
    '</div><div style="padding:12px 24px;background:#F8FAFC;font-size:12px;color:#94A3B8">' + e(SENDER_NAME) + ' · อีเมลนี้ส่งอัตโนมัติ หากมีข้อสงสัยตอบกลับอีเมลนี้ได้</div></div></div>';
}

/* ---------- ตรวจสิทธิ์: ผู้ดูแลระบบเท่านั้น ---------- */
function authorizeAdmin_(idToken) {
  if (!idToken) throw new Error('ต้องเข้าสู่ระบบก่อน');
  const claims = decodeJwt_(idToken);
  const email = String(claims.email || '');
  if (claims.aud !== FIREBASE_PROJECT_ID) throw new Error('token ไม่ใช่ของโปรเจกต์นี้');
  if (Number(claims.exp || 0) * 1000 < Date.now()) throw new Error('token หมดอายุ กรุณาโหลดหน้าใหม่');
  if (!email) throw new Error('บัญชีนี้ไม่มีสิทธิ์ส่งอีเมล');
  const a = fsGet_('admins/' + encodeURIComponent(email), idToken);   // Firestore ตรวจลายเซ็น token ให้
  if (a.code === 401) throw new Error('token ไม่ถูกต้องหรือหมดอายุ');
  if (a.code !== 200) throw new Error('เฉพาะผู้ดูแลระบบเท่านั้นที่ส่งอีเมลแจ้งรหัสได้');
  return { email };
}
function decodeJwt_(t) {
  const p = String(t).split('.')[1];
  if (!p) throw new Error('token ไม่ถูกต้อง');
  return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p + '==='.slice((p.length + 3) % 4))).getDataAsString());
}
function fsGet_(path, idToken) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents/' + path;
  const r = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + idToken } });
  let data = {}; try { data = JSON.parse(r.getContentText() || '{}'); } catch (e) {}
  return { code: r.getResponseCode(), data };
}
function val_(v) { if (!v) return ''; return v.stringValue != null ? v.stringValue : v.integerValue != null ? v.integerValue : v.doubleValue != null ? v.doubleValue : ''; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** กด Run 1 ครั้ง: ขอสิทธิ์ + ส่งอีเมลตัวอย่างเข้า SENDER_EMAIL เพื่อดูหน้าตา */
function testSetup() {
  const sample = { teacher: 'ทดสอบ ระบบ', no: 0, student: 'เด็กชายตัวอย่าง ใจดี', school: 'โรงเรียนตัวอย่าง' };
  MailApp.sendEmail({ to: SENDER_EMAIL, subject: '[ทดสอบ] รหัสเข้าใช้งานระบบดูแลนักเรียนทุน DLTV Fund',
    body: 'อีเมลทดสอบจาก MailCodes.gs', htmlBody: html_(sample, 'dltv0000', 'Ab12-Cd34'), name: SENDER_NAME });
  Logger.log('ส่งอีเมลทดสอบแล้ว · โควตาคงเหลือวันนี้: ' + MailApp.getRemainingDailyQuota());
}
