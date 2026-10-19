/* ============================================================
   drive-store.js — ตัวเชื่อมไปยัง Google Drive ผ่าน Apps Script (gas/DriveFiles.gs)
   ใส่ Web app URL ที่ได้จากการ Deploy ใน DRIVE_SCRIPT_URL ด้านล่าง
   ============================================================ */
// ↓↓ วาง "Web app URL" ที่ได้จาก Apps Script → Deploy (ขึ้นต้น https://script.google.com/macros/s/ และลงท้าย /exec)
//    ไม่ใช่ลิงก์โฟลเดอร์ Google Drive — ลิงก์โฟลเดอร์ตั้งไว้แล้วใน gas/DriveFiles.gs (ROOT_FOLDER_ID)
window.DRIVE_SCRIPT_URL = '';

(function () {
  'use strict';
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  const fromB64 = (b64, type) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
  const noOf = s => String((s && s.no) ?? 'x').replace(/[^\w-]/g, '');

  const validUrl = () => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(String(window.DRIVE_SCRIPT_URL || '').trim());
  function ready() {
    try { return validUrl() && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length && !!firebase.auth().currentUser; }
    catch (e) { return false; }
  }
  function why() {
    if (!window.DRIVE_SCRIPT_URL) return 'ยังไม่ได้ตั้งค่า DRIVE_SCRIPT_URL ใน js/drive-store.js (ดู README หัวข้อ v49)';
    if (/drive\.google\.com/.test(window.DRIVE_SCRIPT_URL)) return 'DRIVE_SCRIPT_URL เป็นลิงก์โฟลเดอร์ Drive — ต้องเป็น Web app URL ของ Apps Script (https://script.google.com/macros/s/…/exec)';
    if (!validUrl()) return 'DRIVE_SCRIPT_URL ไม่ถูกรูปแบบ — ต้องขึ้นต้น https://script.google.com/macros/s/ และลงท้าย /exec';
    return 'ต้องเข้าสู่ระบบและเชื่อมต่ออินเทอร์เน็ต';
  }
  async function call(body) {
    if (!ready()) throw new Error(why());
    const idToken = await firebase.auth().currentUser.getIdToken();
    const res = await fetch(String(window.DRIVE_SCRIPT_URL).trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({ idToken }, body)) });
    if (!res.ok) throw new Error('เชื่อมต่อ Google Drive ไม่สำเร็จ (HTTP ' + res.status + ')');
    const j = await res.json();
    if (j.status !== 'ok') throw new Error(j.message || 'Google Drive ตอบกลับผิดพลาด');
    return j;
  }
  async function upload(student, { term, kind, blob, fileName, mimeType, originalName }) {
    const data = await toB64(blob);
    // v50: ส่งชื่อ/โรงเรียน/ชื่อไฟล์เดิม ไปบันทึกในทะเบียนเอกสารแนบ (Google Sheet)
    return call({ action: 'driveUpload', studentNo: noOf(student), term, kind, fileName, mimeType: mimeType || blob.type, data,
      studentName: (student && student.name) || '', school: (student && student.school_m1) || '', originalName: originalName || fileName });
  }
  async function get(student, fileId) {
    const j = await call({ action: 'driveGet', studentNo: noOf(student), fileId });
    return { blob: fromB64(j.data, j.mimeType), name: j.name, type: j.mimeType };
  }
  async function remove(student, fileId) { return call({ action: 'driveDelete', studentNo: noOf(student), fileId }); }
  /** เปิดไฟล์ในแท็บใหม่ (เปิดแท็บก่อนเพื่อไม่ให้เบราว์เซอร์บล็อก popup) */
  async function open(student, fileId, name) {
    const w = window.open('', '_blank');
    if (w) w.document.write('<p style="font-family:sans-serif;padding:24px">กำลังเปิดไฟล์ ' + String(name || '').replace(/</g, '&lt;') + ' …</p>');
    try {
      const f = await get(student, fileId);
      const url = URL.createObjectURL(f.blob);
      if (w) w.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (w) w.close();
      UIDialog.alert({ tone: 'danger', title: 'เปิดไฟล์ไม่สำเร็จ', message: e.message || String(e) });
    }
  }
  window.DriveStore = { ready, why, upload, get, remove, open, call, noOf };
})();
