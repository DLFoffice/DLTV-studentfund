/* ============================================================
   18-firebase-bridge.js — เชื่อมแอปหลักกับ Cloud Firestore
   ------------------------------------------------------------
   ไฟล์นี้ต้องโหลด "หลังสุด" ใน index.html
   หน้าที่:
   1. ถ้ายังไม่ตั้งค่า firebase-config.js → ไม่ทำอะไรเลย
      (แอปทำงานแบบเดิมด้วย localStorage ทุกประการ)
   2. ถ้าตั้งค่าแล้ว → แสดงหน้าล็อกอินคลุมแอปจนกว่าจะเข้าสู่ระบบ
   3. หลังล็อกอิน:
      - โหลดนักเรียนทั้งหมดจาก Firestore มาแทน DB.students แล้ววาดใหม่
      - ถ้าคลาวด์ยังว่าง เสนออัปโหลดข้อมูลในเครื่องขึ้นไป
      - เฝ้าดูแบบ realtime: เครื่องอื่นแก้ → เครื่องนี้เห็นทันที
   4. ดักการบันทึก/ลบเดิมของแอป (saveToStorage / deleteStudent)
      ให้ส่งขึ้น Firestore อัตโนมัติ — ไม่ต้องแก้โค้ดส่วนอื่น
   5. ปิดการดึงข้อมูลนักเรียนจาก Google Sheet (กันข้อมูลตีกัน)
      แต่ "การส่งออก" ไป Sheet เช่นแบบฟอร์ม ยังทำงานตามเดิม
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 0) ตรวจความพร้อม ---------- */
  const cfg = window.FIREBASE_CONFIG;
  const configured = cfg && typeof firebase !== 'undefined'
    && cfg.projectId && cfg.projectId !== 'your-project-id'
    && String(cfg.apiKey).indexOf('ใส่ค่า') === -1;

  if (!configured) {
    console.log('☁️ Firebase ยังไม่ตั้งค่า — ใช้โหมด localStorage ตามเดิม '
      + '(ใส่ค่าจริงใน firebase/firebase-config.js เพื่อเปิดใช้คลาวด์)');
    return;
  }

  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const fsdb = firebase.firestore();
  const COL  = 'students';

  let fbReady   = false;   // ล็อกอิน + โหลดคลาวด์ครั้งแรกเสร็จแล้ว
  let unsubscribe = null;  // ตัวยกเลิก realtime listener
  let lastPushJson = '';   // ใช้กันการ re-render จาก echo ของตัวเอง

  /* ---------- helpers ---------- */
  // ตัดรูป base64 ออกก่อนส่งขึ้นคลาวด์ (Firestore จำกัด 1MB/document)
  function cleanForCloud(s) {
    const c = JSON.parse(JSON.stringify(s));
    if (c.photoUrl && c.photoUrl.startsWith('data:')) c.photoUrl = '';
    return c;
  }

  async function pushAllToCloud() {
    const students = DB.students.filter(s => s.id);
    lastPushJson = JSON.stringify(students.map(cleanForCloud));
    for (let i = 0; i < students.length; i += 450) {
      const batch = fsdb.batch();
      students.slice(i, i + 450).forEach(s => {
        batch.set(fsdb.collection(COL).doc(String(s.id)), cleanForCloud(s), { merge: false });
      });
      await batch.commit();
    }
  }

  function applyCloudStudents(students) {
    // normalize ด้วยฟังก์ชันเดิมของระบบถ้ามี (เติม semGpa/semPayments ฯลฯ)
    const normalized = students.map(s => {
      delete s._updatedAt;
      return (typeof normalizeStudent === 'function') ? normalizeStudent(s) : s;
    });
    normalized.sort((a, b) => (a.no || 0) - (b.no || 0));
    // เก็บรูป base64 ที่มีเฉพาะในเครื่องไว้ (คลาวด์ไม่เก็บรูป data:)
    const localPhotos = {};
    DB.students.forEach(s => {
      if (s.photoUrl && s.photoUrl.startsWith('data:')) localPhotos[String(s.id)] = s.photoUrl;
    });
    normalized.forEach(s => {
      if (!s.photoUrl && localPhotos[String(s.id)]) s.photoUrl = localPhotos[String(s.id)];
    });
    DB.students = normalized;
    renderDashboard(); renderStudents(); populateFilters();
    if (typeof renderGpaSheet === 'function' && document.getElementById('page-gpa-sheet')?.classList.contains('active')) renderGpaSheet();
  }

  /* ---------- 1) ดัก saveToStorage: บันทึกเครื่อง + คลาวด์ ---------- */
  const _origSaveToStorage = saveToStorage;
  let _pushTimer = null;
  saveToStorage = async function () {
    await _origSaveToStorage();                 // localStorage ตามเดิม (เป็น cache/offline)
    if (!fbReady) return;
    clearTimeout(_pushTimer);                   // debounce กันยิงถี่เกิน
    _pushTimer = setTimeout(async () => {
      try {
        await pushAllToCloud();
        if (typeof setSyncDot === 'function') setSyncDot('online');
      } catch (e) {
        console.warn('☁️ push ไป Firestore ไม่สำเร็จ:', e.message);
        if (typeof showStatus === 'function') showStatus('⚠️ บันทึกขึ้นคลาวด์ไม่สำเร็จ: ' + e.message, 'error');
      }
    }, 800);
  };

  /* ---------- 2) ดัก deleteStudent: ลบในคลาวด์ด้วย ---------- */
  const _origDeleteStudent = deleteStudent;
  deleteStudent = function (idx) {
    const before = DB.students.map(s => String(s.id));
    _origDeleteStudent(idx);                    // มี confirm อยู่ข้างในตามเดิม
    const after = new Set(DB.students.map(s => String(s.id)));
    before.filter(id => id && !after.has(id)).forEach(id => {
      if (!fbReady) return;
      fsdb.collection(COL).doc(id).delete()
        .catch(e => console.warn('☁️ ลบในคลาวด์ไม่สำเร็จ:', e.message));
    });
  };

  /* ---------- 3) ปิดการ "ดึง" นักเรียนจาก Google Sheet ---------- */
  if (typeof stopPolling === 'function') stopPolling();
  if (typeof loadFromSheet === 'function') {
    loadFromSheet = async function () {
      console.log('☁️ ข้าม loadFromSheet — ใช้ Firestore เป็นแหล่งข้อมูลหลักแล้ว');
    };
  }

  /* ---------- 4) หน้าล็อกอิน (สร้างด้วย JS ไม่ต้องแก้ HTML) ---------- */
  const overlay = document.createElement('div');
  overlay.id = 'fb-login-overlay';
  overlay.innerHTML = `
    <style>
      #fb-login-overlay{position:fixed;inset:0;z-index:99999;background:linear-gradient(135deg,#0f638a,#158674);
        display:flex;align-items:center;justify-content:center;font-family:'Sarabun',sans-serif}
      #fb-login-card{background:#fff;border-radius:16px;padding:32px;width:340px;box-shadow:0 8px 40px rgba(0,0,0,.3)}
      #fb-login-card h2{margin:0 0 4px;font-size:18px;color:#1A1D2E;font-family:'Noto Sans Thai',sans-serif}
      #fb-login-card p{margin:0 0 16px;font-size:13px;color:#5A6178}
      #fb-login-card input{width:100%;padding:11px;border:1px solid #ccc;border-radius:8px;margin:5px 0;
        box-sizing:border-box;font-size:14px;font-family:'Sarabun',sans-serif}
      #fb-login-card button{width:100%;margin-top:12px;background:#2563EB;color:#fff;border:none;
        padding:11px;border-radius:8px;font-size:15px;cursor:pointer;font-family:'Sarabun',sans-serif}
      #fb-login-card button:disabled{background:#9BA3BC}
      #fb-login-err{color:#DC2626;font-size:13px;margin-top:10px;min-height:18px}
      #fb-logout-btn{position:fixed;bottom:14px;right:14px;z-index:9000;background:rgba(26,29,46,.85);
        color:#fff;border:none;border-radius:20px;padding:7px 14px;font-size:12.5px;cursor:pointer;
        font-family:'Sarabun',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);display:none}
    </style>
    <div id="fb-login-card">
      <h2>🔐 เข้าสู่ระบบ</h2>
      <p>ระบบดูแลนักเรียนทุนการศึกษาพระราชทานฯ DLTV<br>ข้อมูลถูกจัดเก็บบน Cloud Firestore</p>
      <input id="fb-email" type="email" placeholder="อีเมล" autocomplete="username">
      <input id="fb-pass" type="password" placeholder="รหัสผ่าน" autocomplete="current-password">
      <button id="fb-login-btn">เข้าสู่ระบบ</button>
      <div id="fb-login-err"></div>
    </div>`;

  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'fb-logout-btn';
  logoutBtn.textContent = '☁️ ออกจากระบบ';
  logoutBtn.onclick = () => { if (confirm('ออกจากระบบคลาวด์?')) auth.signOut(); };

  function mountUI() {
    document.body.appendChild(overlay);
    document.body.appendChild(logoutBtn);
    const btn = document.getElementById('fb-login-btn');
    const err = document.getElementById('fb-login-err');
    const doLogin = async () => {
      err.textContent = '';
      btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';
      try {
        await auth.signInWithEmailAndPassword(
          document.getElementById('fb-email').value.trim(),
          document.getElementById('fb-pass').value
        );
      } catch (e) {
        err.textContent = ({
          'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
          'auth/user-not-found': 'ไม่พบผู้ใช้นี้ในระบบ',
          'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
          'auth/too-many-requests': 'ลองผิดหลายครั้ง กรุณารอสักครู่',
          'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้',
        })[e.code] || e.message;
      } finally {
        btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
      }
    };
    btn.onclick = doLogin;
    document.getElementById('fb-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }
  if (document.body) mountUI(); else document.addEventListener('DOMContentLoaded', mountUI);

  /* ---------- 5) เมื่อสถานะล็อกอินเปลี่ยน ---------- */
  auth.onAuthStateChanged(async user => {
    if (!user) {
      fbReady = false;
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      overlay.style.display = 'flex';
      logoutBtn.style.display = 'none';
      return;
    }

    overlay.style.display = 'none';
    logoutBtn.style.display = 'block';
    if (typeof showStatus === 'function') showStatus('☁️ กำลังโหลดข้อมูลจากคลาวด์...', 'info');

    try {
      const snap = await fsdb.collection(COL).get();
      const cloud = [];
      snap.forEach(d => cloud.push(d.data()));

      if (cloud.length > 0) {
        applyCloudStudents(cloud);
        fbReady = true;
        if (typeof showStatus === 'function') showStatus('☁️ โหลดข้อมูลจากคลาวด์แล้ว (' + cloud.length + ' คน)', 'success');
      } else {
        // คลาวด์ว่าง (ยังไม่ได้ migrate) — เสนออัปโหลดข้อมูลในเครื่อง
        fbReady = true;
        if (DB.students.length > 0 && confirm(
          'ยังไม่มีข้อมูลบน Firestore\nอัปโหลดข้อมูลในเครื่อง (' + DB.students.length + ' คน) ขึ้นคลาวด์เลยหรือไม่?')) {
          await pushAllToCloud();
          if (typeof showStatus === 'function') showStatus('☁️ อัปโหลดข้อมูลขึ้นคลาวด์ครบ ' + DB.students.length + ' คน', 'success');
        }
      }
      if (typeof setSyncDot === 'function') setSyncDot('online');

      /* ---- realtime: เครื่องอื่นแก้ → เครื่องนี้อัปเดตเอง ---- */
      unsubscribe = fsdb.collection(COL).onSnapshot(s => {
        if (s.metadata.hasPendingWrites) return;           // echo จากการเขียนของเราเอง
        const remote = [];
        s.forEach(d => remote.push(d.data()));
        const remoteJson = JSON.stringify(
          remote.slice().sort((a, b) => (a.no || 0) - (b.no || 0)).map(cleanForCloud));
        if (remoteJson === lastPushJson) return;            // ตรงกับที่เรา push ล่าสุด
        if (typeof window._isSaving !== 'undefined' && window._isSaving) return;
        lastPushJson = remoteJson;
        applyCloudStudents(remote);
        if (typeof flashSyncDot === 'function') flashSyncDot();
        if (typeof showStatus === 'function') showStatus('☁️ ข้อมูลอัปเดตจากคลาวด์', 'info');
      }, e => console.warn('☁️ realtime listener error:', e.message));

    } catch (e) {
      console.error('☁️ โหลดจากคลาวด์ไม่สำเร็จ:', e);
      if (typeof showStatus === 'function') {
        showStatus('⚠️ โหลดจากคลาวด์ไม่สำเร็จ: ' + e.message
          + (e.code === 'permission-denied' ? ' — ตรวจ Security Rules' : ''), 'error');
      }
    }
  });

  console.log('☁️ Firebase bridge เปิดใช้งานแล้ว (โปรเจกต์: ' + cfg.projectId + ')');
})();
