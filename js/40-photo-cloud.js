/* ============================================================
   40-photo-cloud.js — เก็บรูปนักเรียนบนคลาวด์ (Google Drive ผ่าน Apps Script · v49)
   ------------------------------------------------------------
   เดิม: รูปที่อัปโหลดจากเครื่องเก็บเป็น data: ใน localStorage ของเครื่องนั้นเท่านั้น
   ใหม่:
     • อัปโหลดรูป → ย่อด้านยาว ≤ 800px (JPEG) → เก็บที่โฟลเดอร์ Drive ของมูลนิธิฯ
       "ลำดับ <n>/รูปนักเรียน" (แชร์แบบมีลิงก์ดูได้ เพื่อแสดงในหน้าเว็บ) → บันทึกลิงก์ลง s.photoUrl
     • ลบ/เปลี่ยนรูป → ย้ายไฟล์เดิมไปถังขยะ Drive (เฉพาะไฟล์ที่อยู่ในโฟลเดอร์ของนักเรียนคนนั้น)
     • ปุ่ม "อัปโหลดรูปในเครื่องขึ้นคลาวด์" (หน้ารายชื่อ) ย้ายรูปที่ค้างในเครื่องขึ้น Drive ครั้งเดียว
     • ยังไม่ตั้งค่า / ออฟไลน์ → เก็บในเครื่องแบบเดิมพร้อมแจ้ง
   ============================================================ */
(function () {
  'use strict';
  const MAX_SIDE = 800, QUALITY = 0.82;

  function storageReady() { return !window.STUDENT_MODE && window.DriveStore && DriveStore.ready(); }
  function toBlob(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => b ? resolve(b) : reject(new Error('แปลงรูปไม่สำเร็จ')), 'image/jpeg', QUALITY);
      };
      img.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
      img.src = src;
    });
  }
  const readFile = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file); });
  const rand = () => Math.random().toString(36).slice(2, 10);
  const driveId = u => { const m = String(u || '').match(/drive\.google\.com\/(?:file\/d\/|thumbnail\?id=|open\?id=|uc\?id=)([\w-]+)/); return m ? m[1] : ''; };

  async function uploadBlob(s, blob) {
    const r = await DriveStore.upload(s, { term: '', kind: 'photo', blob, fileName: `รูป-ลำดับ${s.no ?? ''}-${Date.now()}.jpg`, mimeType: 'image/jpeg' });
    return r.url;
  }
  async function deleteCloud(s, url) {
    const id = driveId(url); if (!id || !storageReady() || !s) return;
    try { await DriveStore.remove(s, id); } catch (e) { console.warn('ย้ายรูปเดิมไปถังขยะไม่สำเร็จ (อาจเป็นรูปนอกโฟลเดอร์ของระบบ):', e.message); }
  }

  async function handle(file, idx) {
    if (!file || !String(file.type).startsWith('image/')) { UIDialog.alert({ tone: 'warning', title: 'ไฟล์ไม่ใช่รูปภาพ', message: 'เลือกไฟล์ .jpg .png หรือ .webp' }); return; }
    if (file.size > 10 * 1024 * 1024) { UIDialog.alert({ tone: 'warning', title: 'ไฟล์ใหญ่เกินไป', message: 'เลือกรูปที่ไม่เกิน 10MB (ระบบจะย่อให้อัตโนมัติ)' }); return; }
    const s = DB.students[idx]; if (!s) return;
    const dataUrl = await readFile(file);
    if (!storageReady()) {
      setPhotoUrl(idx, dataUrl);   // แบบเดิม: เก็บในเครื่อง
      UIDialog.alert({ tone: 'warning', title: 'บันทึกรูปไว้ในเครื่องนี้เท่านั้น',
        message: 'ยังเชื่อมต่อ Google Drive ไม่ได้ (' + (window.DriveStore ? DriveStore.why() : 'ยังไม่ได้ตั้งค่า') + ') เครื่องอื่นจะยังไม่เห็นรูปนี้\nกดปุ่ม "อัปโหลดรูปในเครื่องขึ้นคลาวด์" ในหน้ารายชื่อภายหลังได้' });
      return;
    }
    const close = UIDialog.busy('กำลังอัปโหลดรูป…', 'ระบบย่อรูปและเก็บใน Google Drive ของมูลนิธิฯ');
    try {
      const old = s.photoUrl;
      const url = await uploadBlob(s, await toBlob(dataUrl));
      setPhotoUrl(idx, url);
      if (typeof window.fbSaveNow === 'function') await window.fbSaveNow();
      close();
      deleteCloud(s, old);
    } catch (e) {
      close();
      UIDialog.alert({ tone: 'danger', title: 'อัปโหลดรูปไม่สำเร็จ',
        message: e.message || String(e) });
    }
  }

  window.handlePhotoFile = function (input, idx) { const f = input.files && input.files[0]; input.value = ''; handle(f, idx); };
  window.handlePhotoDrop = function (event, idx) {
    event.preventDefault(); if (event.currentTarget) event.currentTarget.style.borderColor = '';
    handle(event.dataTransfer.files[0], idx);
  };
  const _remove = window.removePhoto;
  window.removePhoto = function (idx) {
    const s = DB.students[idx]; const old = s && s.photoUrl;
    const r = _remove ? _remove.apply(this, arguments) : setPhotoUrl(idx, '');
    deleteCloud(s, old);
    return r;
  };

  /* ---------- ย้ายรูปที่ค้างในเครื่องขึ้นคลาวด์ ---------- */
  const localOnes = () => (DB.students || []).filter(s => s.photoUrl && String(s.photoUrl).startsWith('data:'));
  async function migrate() {
    const list = localOnes();
    if (!list.length) return;
    if (!storageReady()) { UIDialog.alert({ tone: 'warning', title: 'ยังเชื่อมต่อ Google Drive ไม่ได้', message: window.DriveStore ? DriveStore.why() : 'ยังไม่ได้ตั้งค่า' }); return; }
    const ok = await uiAsk(`รูปที่อยู่เฉพาะในเครื่องนี้ ${list.length} รูป จะถูกย่อและอัปโหลดขึ้นคลาวด์ ทุกเครื่องจะเห็นรูปเหล่านี้ (เก็บใน Google Drive ของมูลนิธิฯ)`,
      { tone: 'info', title: 'อัปโหลดรูปในเครื่องขึ้นคลาวด์?', confirmText: 'อัปโหลด ' + list.length + ' รูป' });
    if (!ok) return;
    const close = UIDialog.busy('กำลังอัปโหลดรูป…', `0 / ${list.length}`);
    let done = 0, fail = 0;
    for (const s of list) {
      try { s.photoUrl = await uploadBlob(s, await toBlob(s.photoUrl)); done++; }
      catch (e) { fail++; console.warn('อัปโหลดรูปไม่สำเร็จ', s.no, e); }
      const m = document.querySelector('.uid-backdrop:last-child .uid-msg p'); if (m) m.textContent = `${done + fail} / ${list.length}`;
    }
    try { if (typeof window.fbSaveNow === 'function') await window.fbSaveNow(); else saveToStorage(); } catch (e) {}
    close();
    try { renderStudents(); } catch (e) {}
    UIDialog.alert(fail ? { tone: 'warning', title: 'อัปโหลดได้บางส่วน', message: `สำเร็จ ${done} รูป · ไม่สำเร็จ ${fail} รูป (ลองใหม่ได้)` }
      : { tone: 'success', title: 'อัปโหลดรูปขึ้นคลาวด์แล้ว', message: `${done} รูป · ทุกเครื่องจะเห็นรูปเหล่านี้` });
    placeButton();
  }
  function placeButton() {
    const bar = document.querySelector('#page-students .toolbar'); if (!bar) return;
    let b = document.getElementById('photo-migrate-btn');
    const n = localOnes().length;
    if (!n || window.STUDENT_MODE) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('button'); b.id = 'photo-migrate-btn'; b.className = 'btn'; b.onclick = migrate; bar.appendChild(b); }
    b.textContent = `☁️ อัปโหลดรูปในเครื่องขึ้นคลาวด์ (${n})`;
    b.title = 'รูปเหล่านี้เก็บเฉพาะในเครื่องนี้ เครื่องอื่นมองไม่เห็น';
  }
  const _rs = window.renderStudents;
  if (typeof _rs === 'function') window.renderStudents = function () { const r = _rs.apply(this, arguments); try { placeButton(); } catch (e) {} return r; };

  window.PhotoCloud = { migrate, storageReady };
})();
