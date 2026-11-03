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
   5. คัดลอก Web app URL (ลงท้าย /exec) ไปวางที่ window.MAIL_SCRIPT_URL ใน js/mail-config.js

   v67 — ลืมรหัสผ่าน (อีเมลกู้คืน) ต้องตั้งค่าเพิ่ม 1 อย่าง: Service Account ของ Firebase
   1. Firebase Console → ⚙️ Project settings → Service accounts → Generate new private key → ได้ไฟล์ .json
   2. ใน Apps Script: ⚙️ Project Settings → Script Properties → Add script property
        Property: SERVICE_ACCOUNT_JSON   Value: วางเนื้อหาไฟล์ .json ทั้งไฟล์ → Save
   3. เลือกฟังก์ชัน testServiceAccount → Run (ต้องขึ้น ✅) → Deploy → Manage deployments → ✏️ → Version: New version → Deploy
   ⚠️ ไฟล์ .json คือกุญแจผู้ดูแลระบบของ Firebase — ห้ามส่งต่อ/อัปโหลดขึ้น GitHub ลบไฟล์ในเครื่องหลังวางเสร็จ

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
    // v67: อีเมลกู้คืนรหัสผ่าน — ผู้ใช้ทั่วไป (ไม่ต้องเป็นผู้ดูแล)
    switch (body.action) {
      case 'recoveryStart':  return json_(recoveryStart_(authorizeUser_(body.idToken), body));
      case 'recoveryVerify': return json_(recoveryVerify_(authorizeUser_(body.idToken), body));
      case 'recoveryStatus': return json_(recoveryStatus_(authorizeUser_(body.idToken)));
      case 'forgot':         return json_(forgot_(body));
    }
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


/* ════════════════════════════════════════════════════════════
   v67: อีเมลกู้คืนรหัสผ่าน (บัญชีชื่อผู้ใช้ dltv001 ฯลฯ)
   • ผูกอีเมล: ผู้ใช้ที่ล็อกอินอยู่ขอรหัสยืนยัน 6 หลักทางอีเมล → กรอกรหัส → บันทึก accounts/{uid}.recoveryEmail
   • ลืมรหัสผ่าน: กรอกชื่อผู้ใช้ หรืออีเมลกู้คืน → สร้างลิงก์ตั้งรหัสใหม่ของ Firebase แล้วส่งไปที่อีเมลกู้คืน
     (อีเมลครูไม่ถูกเปิดเผยในหน้าเว็บ · ตอบกลับข้อความเดียวกันเสมอ ไม่บอกว่าบัญชีมีอยู่หรือไม่)
   ════════════════════════════════════════════════════════════ */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/(default)/documents';

function authorizeUser_(idToken) {
  if (!idToken) throw new Error('ต้องเข้าสู่ระบบก่อน');
  const c = decodeJwt_(idToken), uid = c.user_id || c.sub;
  if (!uid || c.aud !== FIREBASE_PROJECT_ID) throw new Error('token ไม่ถูกต้อง');
  if (Number(c.exp || 0) * 1000 < Date.now()) throw new Error('token หมดอายุ กรุณาโหลดหน้าใหม่');
  const a = fsGet_('accounts/' + uid, idToken);          // Firestore ตรวจลายเซ็น token
  if (a.code === 401) throw new Error('token ไม่ถูกต้องหรือหมดอายุ');
  if (a.code !== 200) throw new Error('ไม่พบบัญชีผู้ใช้ในระบบ');
  const f = a.data.fields || {};
  return { uid, email: String(c.email || ''), username: val_(f.username), name: val_(f.name), recovery: val_(f.recoveryEmail) };
}

function limit_(key, max, seconds) {
  const c = CacheService.getScriptCache(), n = Number(c.get(key) || 0);
  if (n >= max) return false;
  c.put(key, String(n + 1), seconds); return true;
}

function recoveryStatus_(u) { return { status: 'ok', recoveryEmail: u.recovery || '' }; }

function recoveryStart_(u, b) {
  const email = String(b.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) throw new Error('อีเมลไม่ถูกต้อง');
  if (/@dltvfund\.(web\.app|local)$/.test(email)) throw new Error('ใช้อีเมลจริงของครู');
  if (!limit_('rs:' + u.uid, 5, 3600)) throw new Error('ขอรหัสบ่อยเกินไป ลองใหม่ในอีก 1 ชั่วโมง');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  CacheService.getScriptCache().put('rc:' + u.uid, JSON.stringify({ email, code, tries: 0 }), 15 * 60);
  MailApp.sendEmail({ to: email, name: SENDER_NAME, replyTo: SENDER_EMAIL,
    subject: 'รหัสยืนยันอีเมลกู้คืนรหัสผ่าน — ระบบดูแลนักเรียนทุน DLTV Fund',
    body: 'รหัสยืนยันของคุณคือ ' + code + ' (ใช้ได้ 15 นาที)\nบัญชี: ' + (u.username || '') + '\nถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร',
    htmlBody: shell_('ยืนยันอีเมลกู้คืนรหัสผ่าน',
      '<p style="margin:0 0 12px">มีการขอใช้อีเมลนี้เป็น "อีเมลกู้คืนรหัสผ่าน" ของบัญชี <b>' + esc_(u.username || '') + '</b>' + (u.name ? ' (' + esc_(u.name) + ')' : '') + '</p>' +
      '<div style="text-align:center;margin:18px 0"><span style="display:inline-block;font:700 30px/1 Consolas,Menlo,monospace;letter-spacing:8px;color:#1E3FD1;background:#F5F8FF;border:1px dashed #9DB4FF;border-radius:12px;padding:14px 22px">' + code + '</span></div>' +
      '<p style="margin:0;font-size:13.5px;color:#64748B">กรอกรหัสนี้ในหน้าระบบภายใน 15 นาที · ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร</p>') });
  return { status: 'ok', sentTo: email };
}

function recoveryVerify_(u, b) {
  const cache = CacheService.getScriptCache(), raw = cache.get('rc:' + u.uid);
  if (!raw) throw new Error('รหัสหมดอายุ กด "ส่งรหัสใหม่"');
  const r = JSON.parse(raw);
  if (String(b.code || '').trim() !== r.code) {
    r.tries++;
    if (r.tries >= 5) { cache.remove('rc:' + u.uid); throw new Error('กรอกรหัสผิดหลายครั้ง กด "ส่งรหัสใหม่"'); }
    cache.put('rc:' + u.uid, JSON.stringify(r), 15 * 60);
    throw new Error('รหัสไม่ถูกต้อง');
  }
  cache.remove('rc:' + u.uid);
  const now = new Date().toISOString();
  saFs_('PATCH', '/accounts/' + u.uid + '?updateMask.fieldPaths=recoveryEmail&updateMask.fieldPaths=recoveryVerifiedAt',
    { fields: { recoveryEmail: { stringValue: r.email }, recoveryVerifiedAt: { timestampValue: now } } });
  return { status: 'ok', recoveryEmail: r.email };
}

/** ลืมรหัสผ่าน — ตอบ ok เสมอ (ไม่บอกว่าบัญชี/อีเมลมีอยู่หรือไม่) */
function forgot_(b) {
  const login = String(b.login || '').trim().toLowerCase();
  const generic = { status: 'ok' };
  if (!login || login.length > 200) return generic;
  if (!limit_('fg:' + login, 3, 1800) || !limit_('fg:all', 200, 3600)) return generic;
  try {
    let acc = null;
    if (login.indexOf('@') < 0) {
      const un = saFs_('GET', '/usernames/' + encodeURIComponent(login));
      const authEmail = un && un.fields && un.fields.email && un.fields.email.stringValue;
      if (authEmail) acc = queryAccount_('email', authEmail);
    } else {
      acc = queryAccount_('recoveryEmail', login) || queryAccount_('email', login);
    }
    if (acc && acc.recoveryEmail && acc.authEmail) {
      const link = resetLink_(acc.authEmail);
      MailApp.sendEmail({ to: acc.recoveryEmail, name: SENDER_NAME, replyTo: SENDER_EMAIL,
        subject: 'ตั้งรหัสผ่านใหม่ — ระบบดูแลนักเรียนทุน DLTV Fund',
        body: 'กดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ของบัญชี ' + acc.username + '\n' + link + '\nถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสเดิมยังใช้ได้',
        htmlBody: shell_('ตั้งรหัสผ่านใหม่',
          '<p style="margin:0 0 12px">มีการขอตั้งรหัสผ่านใหม่ของบัญชี <b>' + esc_(acc.username) + '</b>' + (acc.name ? ' (' + esc_(acc.name) + ')' : '') + '</p>' +
          '<p style="text-align:center;margin:18px 0"><a href="' + link + '" style="display:inline-block;background:#1E3FD1;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:12px">ตั้งรหัสผ่านใหม่</a></p>' +
          '<p style="margin:0 0 8px;font-size:13.5px;color:#64748B">ตั้งรหัสใหม่แล้ว เข้าสู่ระบบด้วยชื่อผู้ใช้ <b>' + esc_(acc.username) + '</b> และรหัสผ่านใหม่ได้ที่ <a href="' + LOGIN_URL + '">หน้าเข้าสู่ระบบ</a></p>' +
          '<p style="margin:0;font-size:13.5px;color:#64748B">ลิงก์ใช้ได้ครั้งเดียวภายในเวลาจำกัด · ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสเดิมยังใช้ได้</p>') });
    } else if (acc && acc.authEmail && login.indexOf('@') > 0 && acc.authEmail.toLowerCase() === login && !/@dltvfund\./.test(login)) {
      resetLink_(acc.authEmail, true);   // บัญชีอีเมลจริง (เช่น เจ้าหน้าที่) → ให้ Firebase ส่งเอง
    }
  } catch (err) { console.warn('forgot', err); }
  return generic;
}

function queryAccount_(field, value) {
  const res = saFetch_('POST', FS_BASE + ':runQuery', { structuredQuery: { from: [{ collectionId: 'accounts' }],
    where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } }, limit: 1 } });
  const doc = (res || []).map(x => x.document).filter(Boolean)[0]; if (!doc) return null;
  const f = doc.fields || {};
  return { uid: doc.name.split('/').pop(), authEmail: val_(f.email), recoveryEmail: val_(f.recoveryEmail), username: val_(f.username), name: val_(f.name) };
}

/** สร้างลิงก์ตั้งรหัสผ่านใหม่ของ Firebase (สิทธิ์ผู้ดูแลผ่าน Service Account) */
function resetLink_(authEmail, letFirebaseSend) {
  const body = { requestType: 'PASSWORD_RESET', email: authEmail };
  if (!letFirebaseSend) body.returnOobLink = true;
  const r = saFetch_('POST', 'https://identitytoolkit.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/accounts:sendOobCode', body);
  if (letFirebaseSend) return '';
  if (!r || !r.oobLink) throw new Error('สร้างลิงก์ไม่สำเร็จ');
  return r.oobLink + (r.oobLink.indexOf('lang=') < 0 ? '&lang=th' : '');
}

/* ---------- Service Account → access token ---------- */
function saToken_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('sa_token'); if (hit) return hit;
  const raw = PropertiesService.getScriptProperties().getProperty('SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('ยังไม่ได้ตั้งค่า SERVICE_ACCOUNT_JSON ใน Script Properties');
  const sa = JSON.parse(raw), now = Math.floor(Date.now() / 1000);
  const enc = o => Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, '');
  const head = enc({ alg: 'RS256', typ: 'JWT' });
  const claim = enc({ iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform' });
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(head + '.' + claim, sa.private_key)).replace(/=+$/, '');
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig } });
  const j = JSON.parse(r.getContentText() || '{}');
  if (!j.access_token) throw new Error('ขอสิทธิ์ Service Account ไม่สำเร็จ: ' + (j.error_description || j.error || r.getResponseCode()));
  cache.put('sa_token', j.access_token, 3000);
  return j.access_token;
}
function saFetch_(method, url, body) {
  const o = { method: method.toLowerCase(), muteHttpExceptions: true, contentType: 'application/json', headers: { Authorization: 'Bearer ' + saToken_() } };
  if (body) o.payload = JSON.stringify(body);
  const r = UrlFetchApp.fetch(url, o), code = r.getResponseCode();
  let j = null; try { j = JSON.parse(r.getContentText() || 'null'); } catch (e) {}
  if (code === 404) return null;
  if (code >= 300) throw new Error('HTTP ' + code + ' ' + (j && j.error && j.error.message || ''));
  return j;
}
function saFs_(method, path, body) { return saFetch_(method, FS_BASE + path, body); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function shell_(title, inner) {
  return '<div style="background:#EEF3FF;padding:24px 12px;font-family:Sarabun,Tahoma,Arial,sans-serif">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #DCE5FF">' +
    '<div style="background:#1E3FD1;color:#fff;padding:20px 24px"><div style="font-size:13px;opacity:.8">ระบบดูแลนักเรียนทุน DLTV Fund</div>' +
    '<div style="font-size:20px;font-weight:700;margin-top:4px">' + esc_(title) + '</div></div>' +
    '<div style="padding:22px 24px;font-size:15px;line-height:1.7;color:#334155">' + inner + '</div>' +
    '<div style="padding:12px 24px;background:#F8FAFC;font-size:12px;color:#94A3B8">' + esc_(SENDER_NAME) + ' · อีเมลนี้ส่งอัตโนมัติ</div></div></div>';
}

/** กด Run เพื่อตรวจว่า Service Account ใช้งานได้ */
function testServiceAccount() {
  saToken_();
  const r = saFetch_('POST', FS_BASE + ':runQuery', { structuredQuery: { from: [{ collectionId: 'accounts' }], limit: 1 } });
  Logger.log('✅ Service Account ใช้ได้ · อ่านบัญชีได้ ' + (r || []).filter(x => x.document).length + ' รายการ (ทดสอบ 1)');
}
