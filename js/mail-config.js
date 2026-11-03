/* ============================================================
   mail-config.js — Web app URL ของ gas/MailCodes.gs (ใช้ร่วมกัน: login.html, index.html, accounts.html)
   ใช้กับ: ส่งรหัสให้ครู (หน้าจัดการบัญชี) · ผูกอีเมลกู้คืน · ลืมรหัสผ่าน
   วาง URL ที่ลงท้าย /exec ด้านล่าง (ไฟล์นี้ไฟล์เดียว)
   ============================================================ */
window.MAIL_SCRIPT_URL = '';
window.mailScriptReady = () => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(String(window.MAIL_SCRIPT_URL || '').trim());
window.mailScriptCall = async function (body) {
  if (!window.mailScriptReady()) throw new Error('ยังไม่ได้ตั้งค่า MAIL_SCRIPT_URL ใน js/mail-config.js');
  const res = await fetch(String(window.MAIL_SCRIPT_URL).trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('เชื่อมต่อ Apps Script ไม่สำเร็จ (HTTP ' + res.status + ')');
  const j = await res.json();
  if (j.status !== 'ok') throw new Error(j.message || 'Apps Script ตอบกลับผิดพลาด');
  return j;
};
