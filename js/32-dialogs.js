/* ============================================================
   32-dialogs.js — กล่องแจ้งเตือน/ยืนยันกลางหน้าจอ (แทน confirm / alert / prompt ของเบราว์เซอร์)
   ------------------------------------------------------------
   เดิมใช้กล่องของเบราว์เซอร์ ซึ่งขึ้นมุมบน มีคำว่า "dlfoffice.github.io บอกว่า"
   และแยกไม่ออกว่าเรื่องไหนสำคัญหรืออันตราย
   ใหม่:
     UIDialog.confirm({ title, message, tone, confirmText, cancelText, details, onConfirm })
       → Promise<boolean>
       tone: 'info' | 'warning' | 'danger' | 'success'
       details: [{ label, value }] หรือ { from, to } (แสดงแบบ "จาก → เป็น")
       onConfirm: async () => ข้อความสำเร็จ (ถ้ามี จะแสดง "กำลังบันทึก…" → "สำเร็จ" / "ไม่สำเร็จ" ในกล่องเดียวกัน)
     UIDialog.alert({ title, message, tone })         → Promise<void>
     UIDialog.prompt({ title, message, value, placeholder, validate }) → Promise<string|null>
     uiAsk(message, opts)  ทางลัดสำหรับ confirm แบบสั้น (ใช้ใน onclick ได้)
   window.alert ถูกแทนด้วยกล่องนี้ทั้งระบบ (ไม่หยุดโค้ด — ทุกจุดที่เรียก alert ในระบบ return ทันทีอยู่แล้ว)
   ปุ่ม: Enter = ยืนยัน · Esc = ยกเลิก · Tab วนอยู่ในกล่อง
   ============================================================ */
(function () {
  'use strict';

  const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = {
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.5M12 17.5v.3"/></svg>',
    danger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>',
    success: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5"/></svg>',
    error: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
    term: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>'
  };
  const queue = [];
  let busy = false;

  function nl2p(text) {
    return String(text || '').split(/\n{2,}/).map(p => `<p>${E(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  function detailsHtml(d) {
    if (!d) return '';
    if (d.from !== undefined || d.to !== undefined) {
      return `<div class="uid-change">
        <div class="uid-change-box"><span>จาก</span><b>${E(d.from || '-')}</b></div>
        <div class="uid-change-arrow" aria-hidden="true">→</div>
        <div class="uid-change-box is-new"><span>เป็น</span><b>${E(d.to || '-')}</b></div>
      </div>`;
    }
    if (Array.isArray(d) && d.length) {
      return `<dl class="uid-details">${d.map(x => `<div><dt>${E(x.label)}</dt><dd>${E(x.value)}</dd></div>`).join('')}</dl>`;
    }
    return '';
  }

  function open(kind, opts) {
    return new Promise(resolve => {
      queue.push({ kind, opts: opts || {}, resolve });
      if (!busy) next();
    });
  }
  function next() {
    const job = queue.shift();
    if (!job) { busy = false; return; }
    busy = true;
    show(job);
  }

  function show({ kind, opts, resolve }) {
    const tone = opts.tone || (kind === 'alert' ? 'info' : 'warning');
    const icon = ICON[opts.icon] || ICON[tone] || ICON.info;
    const isConfirm = kind !== 'alert';
    const okText = opts.confirmText || (kind === 'alert' ? 'ตกลง' : kind === 'prompt' ? 'ตกลง' : 'ยืนยัน');
    const cancelText = opts.cancelText || 'ยกเลิก';
    const lastFocus = document.activeElement;

    const wrap = document.createElement('div');
    wrap.className = 'uid-backdrop';
    wrap.innerHTML = `<div class="uid uid-${tone}" role="${tone === 'danger' || tone === 'warning' ? 'alertdialog' : 'dialog'}"
        aria-modal="true" aria-labelledby="uid-title" aria-describedby="uid-msg">
      <div class="uid-icon">${icon}</div>
      <h2 class="uid-title" id="uid-title">${E(opts.title || (kind === 'alert' ? 'แจ้งเตือน' : 'ยืนยันการทำรายการ'))}</h2>
      <div class="uid-msg" id="uid-msg">${nl2p(opts.message)}</div>
      ${detailsHtml(opts.details)}
      ${kind === 'prompt' ? `<input class="uid-input" type="text" value="${E(opts.value || '')}" placeholder="${E(opts.placeholder || '')}" aria-label="${E(opts.title || 'กรอกข้อมูล')}">
        <div class="uid-error" role="alert"></div>` : ''}
      <div class="uid-status" aria-live="polite"></div>
      <div class="uid-actions">
        ${isConfirm ? `<button type="button" class="uid-btn uid-cancel">${E(cancelText)}</button>` : ''}
        <button type="button" class="uid-btn uid-ok">${E(okText)}</button>
      </div>
    </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));

    const box = wrap.querySelector('.uid');
    const okBtn = wrap.querySelector('.uid-ok');
    const cancelBtn = wrap.querySelector('.uid-cancel');
    const input = wrap.querySelector('.uid-input');
    const errEl = wrap.querySelector('.uid-error');
    const statusEl = wrap.querySelector('.uid-status');
    let done = false, working = false;

    function close(result) {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      wrap.classList.remove('in');
      wrap.classList.add('out');
      setTimeout(() => {
        wrap.remove();
        try { if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus(); } catch (e) {}
        resolve(result);
        next();
      }, 160);
    }
    function setState(state, text) {
      box.classList.remove('is-working', 'is-success', 'is-error');
      if (state) box.classList.add('is-' + state);
      if (state === 'success' || state === 'error') {
        wrap.querySelector('.uid-icon').innerHTML = state === 'success' ? ICON.success : ICON.error;
        box.className = box.className.replace(/uid-(info|warning|danger|success)\b/, 'uid-' + (state === 'success' ? 'success' : 'danger'));
      }
      statusEl.textContent = text || '';
    }

    async function confirmAction() {
      if (working) return;
      let value = true;
      if (kind === 'prompt') {
        value = input.value.trim();
        const msg = opts.validate ? opts.validate(value) : (value ? '' : 'กรุณากรอกข้อมูล');
        if (msg) { errEl.textContent = msg; input.classList.add('bad'); input.focus(); return; }
      }
      if (typeof opts.onConfirm !== 'function') { close(value); return; }
      // ขั้นตอนมีการบันทึก → แสดงสถานะในกล่องเดียวกัน
      working = true;
      setState('working', opts.workingText || 'กำลังบันทึก…');
      okBtn.disabled = true; if (cancelBtn) cancelBtn.disabled = true;
      okBtn.innerHTML = '<span class="uid-spin" aria-hidden="true"></span>' + E(opts.workingText || 'กำลังบันทึก…');
      try {
        const msg = await opts.onConfirm(value);
        setState('success', '');
        wrap.querySelector('.uid-title').textContent = (msg && msg.title) || opts.successTitle || 'เรียบร้อยแล้ว';
        wrap.querySelector('.uid-msg').innerHTML = nl2p((msg && msg.message) || (typeof msg === 'string' ? msg : '') || opts.successText || '');
        const det = wrap.querySelector('.uid-details, .uid-change'); if (det) det.remove();
        if (cancelBtn) cancelBtn.remove();
        okBtn.disabled = false; okBtn.textContent = 'ปิด';
        okBtn.onclick = () => close(value);
        working = false;
        okBtn.focus();
        setTimeout(() => close(value), opts.autoCloseMs || 2200);
      } catch (e) {
        working = false;
        setState('error', '');
        wrap.querySelector('.uid-title').textContent = opts.errorTitle || 'ทำรายการไม่สำเร็จ';
        wrap.querySelector('.uid-msg').innerHTML = nl2p((e && e.message) || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.textContent = 'ปิด'; cancelBtn.onclick = () => close(false); }
        okBtn.disabled = false; okBtn.textContent = 'ลองอีกครั้ง';
        okBtn.onclick = () => { setState(null, ''); confirmAction(); };
      }
    }

    okBtn.onclick = confirmAction;
    if (cancelBtn) cancelBtn.onclick = () => { if (!working) close(kind === 'prompt' ? null : false); };
    wrap.addEventListener('mousedown', e => {
      if (e.target === wrap && !working && kind === 'alert') close(undefined);
    });
    function onKey(e) {
      if (e.key === 'Escape' && !working) { e.preventDefault(); close(kind === 'alert' ? undefined : kind === 'prompt' ? null : false); }
      else if (e.key === 'Enter' && !working && (document.activeElement === input || !document.activeElement || !document.activeElement.classList.contains('uid-cancel'))) {
        e.preventDefault(); if (okBtn.onclick) okBtn.onclick();
      } else if (e.key === 'Tab') {
        const f = [...box.querySelectorAll('button:not([disabled]), input')];
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => {
      if (input) { input.focus(); input.select(); }
      else if (tone === 'danger' && cancelBtn) cancelBtn.focus();     // งานอันตราย: โฟกัสปุ่มยกเลิกก่อน
      else okBtn.focus();
    }, 30);
  }

  const UIDialog = {
    confirm: o => open('confirm', typeof o === 'string' ? { message: o } : o),
    alert: o => open('alert', typeof o === 'string' ? { message: o } : o),
    prompt: o => open('prompt', typeof o === 'string' ? { message: o } : o),
  };
  /** v37: กล่อง "กำลังทำงาน…" กลางจอ (ปิดด้วยฟังก์ชันที่คืนกลับ) */
  UIDialog.busy = function (title, message) {
    const w = document.createElement('div');
    w.className = 'uid-backdrop in';
    w.innerHTML = `<div class="uid uid-info" role="status" aria-live="polite">
      <div class="uid-icon"><span class="uid-spin uid-spin-lg" aria-hidden="true"></span></div>
      <h2 class="uid-title">${E(title || 'กำลังบันทึก…')}</h2>
      <div class="uid-msg"><p>${E(message || 'กรุณารอสักครู่ อย่าเพิ่งปิดหน้านี้')}</p></div></div>`;
    document.body.appendChild(w);
    return () => w.remove();
  };
  window.UIDialog = UIDialog;
  window.uiAsk = (message, opts) => UIDialog.confirm(Object.assign({ message }, opts || {}));

  // alert() ทั้งระบบ → กล่องกลางจอ (เดา tone จากอีโมจิ/คำนำหน้า)
  const _nativeAlert = window.alert.bind(window);
  window.alert = function (msg) {
    if (!document.body) return _nativeAlert(msg);
    let text = String(msg ?? ''), tone = 'info', title = 'แจ้งเตือน';
    if (/^\s*(❌|⚠️|⛔)/.test(text) || /ไม่ถูกต้อง|ไม่สำเร็จ|ผิดพลาด|ใหญ่เกิน/.test(text)) { tone = 'warning'; title = 'โปรดตรวจสอบ'; }
    if (/^\s*✅/.test(text)) { tone = 'success'; title = 'เรียบร้อยแล้ว'; }
    if (/^\s*กรุณา/.test(text)) { tone = 'warning'; title = 'ยังขาดข้อมูล'; }
    text = text.replace(/^\s*(❌|⚠️|⛔|✅)\s*/, '');
    UIDialog.alert({ title, message: text, tone });
  };
})();
