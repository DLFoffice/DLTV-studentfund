/* ============================================================
   18-firebase-bridge.js (v2) — เชื่อมแอปหลักกับ Cloud Firestore
   ------------------------------------------------------------
   สิ่งที่เปลี่ยนจาก v1:
   • แก้ popup "ข้อมูลอัปเดตจากคลาวด์" เด้งรัว:
     เทียบข้อมูลแบบ canonical (เรียง key ก่อน stringify) — echo จาก
     การบันทึกของเราเองจะถูกมองว่า "เหมือนเดิม" และถูกข้ามแบบเงียบๆ
     การอัปเดตจากเครื่องอื่นจะวาดหน้าจอใหม่โดยไม่มี popup (กะพริบจุด sync แทน)
   • ยังไม่ล็อกอิน → พาไปหน้า login.html (ดีไซน์ใหม่) แทน overlay เดิม
   • เมนูบัญชีมุมล่างขวา: เปลี่ยนรหัสผ่าน / จัดการบัญชี (เฉพาะแอดมิน) / ออกจากระบบ
   • บังคับเปลี่ยนรหัสผ่านครั้งแรก ถ้าบัญชีถูกตั้งค่า mustChangePassword
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 0) ตรวจความพร้อม ---------- */
  const cfg = window.FIREBASE_CONFIG;
  const configured = cfg && typeof firebase !== 'undefined'
    && cfg.projectId && cfg.projectId !== 'your-project-id'
    && String(cfg.apiKey).indexOf('ใส่ค่า') === -1;

  if (!configured) {
    console.log('☁️ Firebase ยังไม่ตั้งค่า — ใช้โหมด localStorage ตามเดิม');
    return;
  }

  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const fsdb = firebase.firestore();
  const COL  = 'students';

  let fbReady = false;
  let unsubscribe = null;
  let pushPending = false;   // มีการบันทึกที่ยังไม่ขึ้นคลาวด์ → ห้าม snapshot ทับ
  let isAdmin = false;

  /* ---------- helpers ---------- */
  function cleanForCloud(s) {
    const c = JSON.parse(JSON.stringify(s));
    delete c._updatedAt;
    if (c.photoUrl && String(c.photoUrl).startsWith('data:')) c.photoUrl = '';
    return c;
  }

  // stringify แบบเรียง key ทุกชั้น — ทำให้เทียบข้อมูลได้แม้ Firestore คืน key คนละลำดับ
  function stableStringify(v) {
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
  }
  function canon(students) {
    return stableStringify(
      students.slice().sort((a, b) => (a.no || 0) - (b.no || 0)).map(cleanForCloud)
    );
  }

  async function pushAllToCloud() {
    const students = DB.students.filter(s => s.id);
    for (let i = 0; i < students.length; i += 450) {
      const batch = fsdb.batch();
      students.slice(i, i + 450).forEach(s => {
        batch.set(fsdb.collection(COL).doc(String(s.id)), cleanForCloud(s), { merge: false });
      });
      await batch.commit();
    }
  }

  // แปลงข้อมูลดิบจากคลาวด์ให้อยู่ในรูปเดียวกับ DB (เติมฟิลด์ที่ระบบต้องมี)
  function prepareCloudStudents(students) {
    const normalized = students.map(raw => {
      const s = JSON.parse(JSON.stringify(raw));
      delete s._updatedAt;
      return (typeof normalizeStudent === 'function') ? normalizeStudent(s) : s;
    });
    normalized.sort((a, b) => (a.no || 0) - (b.no || 0));
    return normalized;
  }

  function applyCloudStudents(students) {
    const normalized = prepareCloudStudents(students);
    // คงรูป base64 ที่มีเฉพาะในเครื่อง (คลาวด์ไม่เก็บรูป data:)
    const localPhotos = {};
    DB.students.forEach(s => {
      if (s.photoUrl && String(s.photoUrl).startsWith('data:')) localPhotos[String(s.id)] = s.photoUrl;
    });
    normalized.forEach(s => {
      if (!s.photoUrl && localPhotos[String(s.id)]) s.photoUrl = localPhotos[String(s.id)];
    });
    DB.students = normalized;
    renderDashboard(); renderStudents(); populateFilters();
    if (typeof renderGpaSheet === 'function' && document.getElementById('page-gpa-sheet')?.classList.contains('active')) renderGpaSheet();
  }

  /* ---------- 1) ดัก saveToStorage ---------- */
  const _origSaveToStorage = saveToStorage;
  let _pushTimer = null;
  saveToStorage = async function () {
    await _origSaveToStorage();
    if (!fbReady) return;
    pushPending = true;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(async () => {
      try {
        await pushAllToCloud();
        if (typeof setSyncDot === 'function') setSyncDot('online');
      } catch (e) {
        console.warn('☁️ push ไป Firestore ไม่สำเร็จ:', e.message);
        if (typeof showStatus === 'function') showStatus('⚠️ บันทึกขึ้นคลาวด์ไม่สำเร็จ: ' + e.message, 'error');
      } finally {
        pushPending = false;
      }
    }, 800);
  };

  /* ---------- 2) ดัก deleteStudent ---------- */
  const _origDeleteStudent = deleteStudent;
  deleteStudent = function (idx) {
    const before = DB.students.map(s => String(s.id));
    _origDeleteStudent(idx);
    const after = new Set(DB.students.map(s => String(s.id)));
    before.filter(id => id && id !== 'undefined' && !after.has(id)).forEach(id => {
      if (!fbReady) return;
      fsdb.collection(COL).doc(id).delete()
        .catch(e => console.warn('☁️ ลบในคลาวด์ไม่สำเร็จ:', e.message));
    });
  };

  /* ---------- 3) ปิดการดึงรายชื่อจาก Google Sheet ---------- */
  if (typeof stopPolling === 'function') stopPolling();
  if (typeof loadFromSheet === 'function') {
    loadFromSheet = async function () {};
  }

  /* ---------- 4) เมนูบัญชี + modal เปลี่ยนรหัสผ่าน ---------- */
  const ui = document.createElement('div');
  ui.innerHTML = `
    <style>
      .fb-menu{position:fixed;bottom:14px;right:14px;z-index:9000;display:none;flex-direction:column;
        align-items:flex-end;gap:8px;font-family:'Sarabun',sans-serif}
      .fb-menu button{border:none;border-radius:20px;padding:8px 15px;font-size:12.5px;cursor:pointer;
        font-family:'Sarabun',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);color:#fff}
      .fb-menu .fb-items{display:none;flex-direction:column;gap:8px;align-items:flex-end}
      .fb-menu.open .fb-items{display:flex}
      #fb-main-btn{background:linear-gradient(90deg,#F5A623,#F08C00)}
      .fb-items button{background:rgba(26,29,46,.9)}
      #fb-pass-modal{position:fixed;inset:0;background:rgba(20,18,10,.5);z-index:99998;display:none;
        align-items:center;justify-content:center;font-family:'Sarabun',sans-serif}
      #fb-pass-modal.open{display:flex}
      #fb-pass-card{width:min(380px,92%);background:#fff;border-radius:16px;padding:26px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
      #fb-pass-card h3{margin:0 0 4px;font-family:'Noto Sans Thai',sans-serif;font-size:17px;color:#1A1D2E}
      #fb-pass-card p{margin:0 0 14px;font-size:12.5px;color:#8A8F9E;line-height:1.6}
      .fb-field{position:relative;margin-bottom:9px}
      .fb-field input{width:100%;padding:11px 40px 11px 12px;border:1.5px solid #E5E0D4;border-radius:10px;
        font-size:14px;font-family:'Sarabun',sans-serif;box-sizing:border-box}
      .fb-field input:focus{outline:none;border-color:#F5A623;box-shadow:0 0 0 3px rgba(245,166,35,.18)}
      .fb-eye{position:absolute;right:5px;top:50%;transform:translateY(-50%);border:none;background:none;
        cursor:pointer;padding:7px;font-size:15px;opacity:.6;border-radius:8px}
      .fb-eye:hover{opacity:1}
      #fb-pass-err{color:#DC2626;font-size:12.5px;min-height:17px;margin-top:4px}
      .fb-actions{display:flex;gap:10px;margin-top:12px}
      .fb-actions button{flex:1;padding:10px;border-radius:10px;font-family:'Noto Sans Thai',sans-serif;
        font-weight:700;font-size:14px;cursor:pointer}
      #fb-pass-cancel{border:1.5px solid #E5E0D4;background:#fff;color:#5A5F6E}
      #fb-pass-save{border:none;background:linear-gradient(90deg,#F5A623,#F08C00);color:#fff}
      #fb-pass-save:disabled{opacity:.6}
    </style>
    <div class="fb-menu" id="fb-menu">
      <div class="fb-items">
        <button id="fb-chpass-btn">🔑 เปลี่ยนรหัสผ่าน</button>
        <button id="fb-admin-btn" style="display:none">👥 จัดการบัญชีผู้ใช้</button>
        <button id="fb-logout-btn">🚪 ออกจากระบบ</button>
      </div>
      <button id="fb-main-btn">☁️ บัญชี</button>
    </div>
    <div id="fb-pass-modal">
      <div id="fb-pass-card">
        <h3>🔑 เปลี่ยนรหัสผ่าน</h3>
        <p id="fb-pass-note">รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร</p>
        <div class="fb-field"><input id="fb-old" type="password" placeholder="รหัสผ่านปัจจุบัน" autocomplete="current-password">
          <button type="button" class="fb-eye" data-for="fb-old">👁️</button></div>
        <div class="fb-field"><input id="fb-new1" type="password" placeholder="รหัสผ่านใหม่" autocomplete="new-password">
          <button type="button" class="fb-eye" data-for="fb-new1">👁️</button></div>
        <div class="fb-field"><input id="fb-new2" type="password" placeholder="ยืนยันรหัสผ่านใหม่" autocomplete="new-password">
          <button type="button" class="fb-eye" data-for="fb-new2">👁️</button></div>
        <div id="fb-pass-err"></div>
        <div class="fb-actions">
          <button id="fb-pass-cancel">ยกเลิก</button>
          <button id="fb-pass-save">บันทึกรหัสใหม่</button>
        </div>
      </div>
    </div>`;

  function mountUI() {
    document.body.appendChild(ui);
    const menu = document.getElementById('fb-menu');
    document.getElementById('fb-main-btn').onclick = () => menu.classList.toggle('open');
    document.getElementById('fb-logout-btn').onclick = () => {
      if (confirm('ออกจากระบบ?')) auth.signOut();
    };
    document.getElementById('fb-admin-btn').onclick = () => location.href = 'accounts.html';
    document.getElementById('fb-chpass-btn').onclick = () => openPassModal(false);

    // ตาดูรหัสในทุกช่อง
    ui.querySelectorAll('.fb-eye').forEach(b => {
      b.onclick = () => {
        const inp = document.getElementById(b.dataset.for);
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.textContent = show ? '🙈' : '👁️';
      };
    });

    const modal = document.getElementById('fb-pass-modal');
    document.getElementById('fb-pass-cancel').onclick = () => {
      if (modal.dataset.forced === '1') { alert('กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน'); return; }
      modal.classList.remove('open');
    };
    document.getElementById('fb-pass-save').onclick = doChangePassword;
  }
  if (document.body) mountUI(); else document.addEventListener('DOMContentLoaded', mountUI);

  function openPassModal(forced) {
    const modal = document.getElementById('fb-pass-modal');
    modal.dataset.forced = forced ? '1' : '0';
    document.getElementById('fb-pass-note').textContent = forced
      ? 'เพื่อความปลอดภัย กรุณาตั้งรหัสผ่านใหม่แทนรหัสเริ่มต้นก่อนใช้งาน (อย่างน้อย 6 ตัวอักษร)'
      : 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร';
    document.getElementById('fb-pass-err').textContent = '';
    ['fb-old','fb-new1','fb-new2'].forEach(id => document.getElementById(id).value = '');
    modal.classList.add('open');
    document.getElementById('fb-old').focus();
  }

  async function doChangePassword() {
    const errEl = document.getElementById('fb-pass-err');
    const oldP = document.getElementById('fb-old').value;
    const n1 = document.getElementById('fb-new1').value;
    const n2 = document.getElementById('fb-new2').value;
    errEl.textContent = '';
    if (!oldP || !n1 || !n2) { errEl.textContent = 'กรอกให้ครบทุกช่อง'; return; }
    if (n1.length < 6) { errEl.textContent = 'รหัสใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร'; return; }
    if (n1 !== n2) { errEl.textContent = 'รหัสผ่านใหม่สองช่องไม่ตรงกัน'; return; }
    if (n1 === oldP) { errEl.textContent = 'รหัสใหม่ต้องต่างจากรหัสเดิม'; return; }
    const btn = document.getElementById('fb-pass-save');
    btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
    try {
      const user = auth.currentUser;
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, oldP);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(n1);
      await fsdb.collection('accounts').doc(user.uid)
        .set({ mustChangePassword: false, passwordChangedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
        .catch(() => {});
      document.getElementById('fb-pass-modal').classList.remove('open');
      if (typeof showStatus === 'function') showStatus('✅ เปลี่ยนรหัสผ่านเรียบร้อย', 'success');
    } catch (e) {
      errEl.textContent = ({
        'auth/invalid-credential': 'รหัสผ่านปัจจุบันไม่ถูกต้อง',
        'auth/wrong-password': 'รหัสผ่านปัจจุบันไม่ถูกต้อง',
        'auth/weak-password': 'รหัสใหม่ง่ายเกินไป',
        'auth/too-many-requests': 'ลองหลายครั้งเกินไป กรุณารอสักครู่',
      })[e.code] || e.message;
    } finally {
      btn.disabled = false; btn.textContent = 'บันทึกรหัสใหม่';
    }
  }

  /* ---------- 5) สถานะล็อกอิน ---------- */
  auth.onAuthStateChanged(async user => {
    if (!user) {
      fbReady = false;
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      location.replace('login.html');      // → หน้า login ดีไซน์ใหม่
      return;
    }

    const menu = document.getElementById('fb-menu');
    if (menu) menu.style.display = 'flex';

    // แอดมิน? → โชว์ปุ่มจัดการบัญชี
    try {
      const adm = await fsdb.collection('admins').doc(user.email).get();
      isAdmin = adm.exists;
      const ab = document.getElementById('fb-admin-btn');
      if (ab && isAdmin) ab.style.display = 'block';
    } catch (e) { /* ไม่มีสิทธิ์อ่าน = ไม่ใช่แอดมิน */ }

    // บังคับเปลี่ยนรหัสครั้งแรก
    try {
      const acc = await fsdb.collection('accounts').doc(user.uid).get();
      if (acc.exists && acc.data().mustChangePassword) openPassModal(true);
    } catch (e) { /* ข้าม */ }

    /* ---- โหลดข้อมูลครั้งแรก ---- */
    try {
      const snap = await fsdb.collection(COL).get();
      const cloud = [];
      snap.forEach(d => cloud.push(d.data()));

      if (cloud.length > 0) {
        applyCloudStudents(cloud);
        fbReady = true;
        if (typeof showStatus === 'function') showStatus('☁️ โหลดข้อมูลจากคลาวด์แล้ว (' + cloud.length + ' คน)', 'success');
      } else {
        fbReady = true;
        if (DB.students.length > 0 && confirm(
          'ยังไม่มีข้อมูลบน Firestore\nอัปโหลดข้อมูลในเครื่อง (' + DB.students.length + ' คน) ขึ้นคลาวด์เลยหรือไม่?')) {
          await pushAllToCloud();
          if (typeof showStatus === 'function') showStatus('☁️ อัปโหลดข้อมูลขึ้นคลาวด์ครบแล้ว', 'success');
        }
      }
      if (typeof setSyncDot === 'function') setSyncDot('online');

      /* ---- realtime (เงียบ: ไม่มี popup รัวอีก) ---- */
      unsubscribe = fsdb.collection(COL).onSnapshot(s => {
        if (s.metadata.hasPendingWrites) return;         // echo ระหว่างเขียนของเราเอง
        if (pushPending) return;                         // เรามีของใหม่กว่ารอส่งอยู่
        const remote = [];
        s.forEach(d => remote.push(d.data()));
        const prepared = prepareCloudStudents(remote);   // normalize ให้รูปเดียวกับ DB ก่อนเทียบ
        if (canon(prepared) === canon(DB.students)) {    // ข้อมูลเหมือนเดิมทุกประการ
          if (typeof setSyncDot === 'function') setSyncDot('online');
          return;                                        // → เงียบ ไม่วาดใหม่ ไม่เด้งอะไร
        }
        applyCloudStudents(prepared);                    // มีของใหม่จากเครื่องอื่นจริงๆ
        if (typeof flashSyncDot === 'function') flashSyncDot();  // กะพริบจุดเล็กๆ พอ
      }, e => console.warn('☁️ realtime listener error:', e.message));

    } catch (e) {
      console.error('☁️ โหลดจากคลาวด์ไม่สำเร็จ:', e);
      if (typeof showStatus === 'function') {
        showStatus('⚠️ โหลดจากคลาวด์ไม่สำเร็จ: ' + e.message
          + (e.code === 'permission-denied' ? ' — ตรวจ Security Rules' : ''), 'error');
      }
    }
  });

  console.log('☁️ Firebase bridge v2 เปิดใช้งาน (โปรเจกต์: ' + cfg.projectId + ')');
})();
