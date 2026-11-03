/* ============================================================
   50-recovery-email.js (v67) — ผูก "อีเมลกู้คืนรหัสผ่าน" ของบัญชีครู/นักเรียน (dltv001 ฯลฯ)
   ------------------------------------------------------------
   • หลังเข้าระบบ ถ้าบัญชียังไม่ผูกอีเมล → หน้าต่างชวนผูก (ข้ามได้ ขึ้นใหม่ทุกครั้งที่เข้าระบบ)
   • ขั้นตอน: กรอกอีเมล → ระบบส่งรหัส 6 หลัก (gas/MailCodes.gs) → กรอกรหัส → บันทึก accounts/{uid}.recoveryEmail
   • เปลี่ยนอีเมลภายหลังได้จากแบนเนอร์หน้า "งานของฉัน" หรือ RecoveryEmail.open()
   • ใช้คู่กับ "ลืมรหัสผ่าน?" ในหน้าเข้าสู่ระบบ — ลิงก์ตั้งรหัสใหม่ส่งไปที่อีเมลนี้
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SNOOZE = 'dltv.recovery.snooze';
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} } };
  const acct = () => window.STUDENT_MODE || null;
  const current = () => (acct() && acct().recoveryEmail) || '';
  const isFake = e => /@dltvfund\.(web\.app|local)$/i.test(String(e || ''));

  async function call(body) {
    const u = firebase.auth().currentUser; if (!u) throw new Error('ต้องเข้าสู่ระบบก่อน');
    return window.mailScriptCall(Object.assign({ idToken: await u.getIdToken() }, body));
  }

  let el = null, pending = '';
  function close() { if (el) { el.remove(); el = null; } document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') skip(); }
  function skip() { ss.set(SNOOZE, '1'); close(); }

  function open(opts) {
    opts = opts || {};
    if (!window.mailScriptReady || !window.mailScriptReady()) {
      if (opts.manual && window.UIDialog) UIDialog.alert({ tone: 'warning', title: 'ยังไม่เปิดใช้งาน', message: 'ผู้ดูแลระบบยังไม่ได้ตั้งค่าการส่งอีเมล (js/mail-config.js)' });
      return;
    }
    close();
    el = document.createElement('div');
    el.className = 'rv-bg';
    el.innerHTML = `<div class="rv" role="dialog" aria-modal="true" aria-labelledby="rv-t">
      <div class="rv-ic" aria-hidden="true">🔐</div>
      <h3 id="rv-t">${current() ? 'เปลี่ยนอีเมลกู้คืนรหัสผ่าน' : 'ผูกอีเมลกู้คืนรหัสผ่าน'}</h3>
      <p class="rv-lead">ถ้าลืมรหัสผ่าน กด "ลืมรหัสผ่าน?" ที่หน้าเข้าสู่ระบบ ระบบจะส่งลิงก์ตั้งรหัสใหม่ไปที่อีเมลนี้ <b>ไม่ต้องรอผู้ดูแลระบบ</b></p>
      ${current() ? `<p class="rv-cur">อีเมลปัจจุบัน: <b>${E(current())}</b></p>` : ''}
      <div class="rv-step" data-rv-step="1">
        <label for="rv-email">อีเมลของครู (ที่เปิดอ่านได้จริง)</label>
        <input id="rv-email" type="email" autocomplete="email" placeholder="เช่น somchai@school.ac.th" value="${E(pending)}">
        <div class="rv-msg" id="rv-msg1" role="status"></div>
        <div class="rv-acts">
          <button type="button" class="rv-btn ghost" data-rv="skip">${current() ? 'ยกเลิก' : 'ไว้ทีหลัง'}</button>
          <button type="button" class="rv-btn primary" data-rv="send">ส่งรหัสยืนยัน</button>
        </div>
      </div>
      <div class="rv-step" data-rv-step="2" hidden>
        <label for="rv-code">รหัสยืนยัน 6 หลัก ที่ส่งไปที่ <b id="rv-to"></b></label>
        <input id="rv-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" class="rv-code">
        <div class="rv-msg" id="rv-msg2" role="status">ไม่พบอีเมล? ตรวจถังขยะ/สแปม · รหัสใช้ได้ 15 นาที</div>
        <div class="rv-acts">
          <button type="button" class="rv-btn ghost" data-rv="back">← แก้อีเมล / ส่งรหัสใหม่</button>
          <button type="button" class="rv-btn primary" data-rv="verify">ยืนยัน</button>
        </div>
      </div>
      <div class="rv-step" data-rv-step="3" hidden>
        <div class="rv-ok">✓ ผูกอีเมลกู้คืนเรียบร้อย</div>
        <p class="rv-lead" id="rv-done"></p>
        <div class="rv-acts"><button type="button" class="rv-btn primary" data-rv="close">เสร็จสิ้น</button></div>
      </div>
    </div>`;
    document.body.appendChild(el);
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', onClick);
    el.querySelector('#rv-email').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    el.querySelector('#rv-code').addEventListener('keydown', e => { if (e.key === 'Enter') verify(); });
    setTimeout(() => { const i = el && el.querySelector('#rv-email'); if (i) i.focus(); }, 50);
  }
  function step(n) { el.querySelectorAll('[data-rv-step]').forEach(s => { s.hidden = s.getAttribute('data-rv-step') !== String(n); }); }
  function msg(id, t, tone) { const m = el && el.querySelector('#' + id); if (m) { m.textContent = t; m.dataset.tone = tone || ''; } }
  async function busy(btn, fn) { btn.disabled = true; const t = btn.textContent; btn.textContent = 'กำลังดำเนินการ…'; try { await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = t; } } }

  async function send() {
    const btn = el.querySelector('[data-rv="send"]');
    const email = el.querySelector('#rv-email').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg('rv-msg1', 'กรอกอีเมลให้ถูกต้อง', 'err'); return; }
    if (isFake(email)) { msg('rv-msg1', 'ใช้อีเมลจริงของครูที่เปิดอ่านได้', 'err'); return; }
    pending = email;
    await busy(btn, async () => {
      try { await call({ action: 'recoveryStart', email }); el.querySelector('#rv-to').textContent = email; step(2); setTimeout(() => el.querySelector('#rv-code').focus(), 30); }
      catch (e) { msg('rv-msg1', e.message || String(e), 'err'); }
    });
  }
  async function verify() {
    const btn = el.querySelector('[data-rv="verify"]');
    const code = el.querySelector('#rv-code').value.replace(/\D/g, '');
    if (code.length !== 6) { msg('rv-msg2', 'กรอกรหัส 6 หลัก', 'err'); return; }
    await busy(btn, async () => {
      try {
        const r = await call({ action: 'recoveryVerify', code });
        if (acct()) acct().recoveryEmail = r.recoveryEmail;
        el.querySelector('#rv-done').innerHTML = `ครั้งต่อไปถ้าลืมรหัสผ่าน ลิงก์ตั้งรหัสใหม่จะส่งไปที่ <b>${E(r.recoveryEmail)}</b>`;
        step(3); pending = '';
        try { if (typeof sfRenderPage === 'function' && document.querySelector('#sf-root .hx-user')) sfRenderPage(); } catch (e) {}
      } catch (e) { msg('rv-msg2', e.message || String(e), 'err'); }
    });
  }
  function onClick(e) {
    if (e.target === el) { skip(); return; }
    const b = e.target.closest('[data-rv]'); if (!b) return;
    const a = b.getAttribute('data-rv');
    if (a === 'skip') skip();
    else if (a === 'send') send();
    else if (a === 'verify') verify();
    else if (a === 'back') { step(1); msg('rv-msg1', ''); }
    else if (a === 'close') close();
  }

  /* ---------- ชวนผูกหลังเข้าระบบ ---------- */
  function maybePrompt() {
    const a = acct();
    if (!a || a.recoveryEmail || ss.get(SNOOZE) || el) return;
    if (!window.mailScriptReady || !window.mailScriptReady()) return;
    const pm = document.getElementById('fb-pass-modal');
    if ((pm && pm.classList.contains('open')) || document.querySelector('.uid-backdrop, .sf-modal-overlay')) { setTimeout(maybePrompt, 1500); return; }
    open();
  }
  window.addEventListener('dltv:students-loaded', () => setTimeout(maybePrompt, 1200));

  /* ---------- ลิงก์ในแบนเนอร์ "งานของฉัน" ---------- */
  if (typeof sfRenderPicker === 'function') {
    const _p = sfRenderPicker;
    sfRenderPicker = function () {
      const html = _p.apply(this, arguments);
      const a = acct(); if (!a || !window.mailScriptReady || !window.mailScriptReady()) return html;
      const chip = a.recoveryEmail
        ? `<button type="button" class="hx-rec" data-rv-open title="เปลี่ยนอีเมลกู้คืนรหัสผ่าน">🔐 อีเมลกู้คืน: ${E(a.recoveryEmail)} · เปลี่ยน</button>`
        : `<button type="button" class="hx-rec warn" data-rv-open>⚠️ ยังไม่ได้ผูกอีเมลกู้คืนรหัสผ่าน — ผูกตอนนี้</button>`;
      return html.replace('<div class="hx-actions">', chip + '<div class="hx-actions">');
    };
  }
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-rv-open]')) open({ manual: true }); });

  window.RecoveryEmail = { open: () => open({ manual: true }), prompt: maybePrompt };
})();
