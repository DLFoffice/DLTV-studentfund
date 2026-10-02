/* ============================================================
   42-attachments.js — เอกสารแนบประจำภาคเรียน (ผลการเรียน / สำเนาสมุดบัญชี / อื่น ๆ)
   ------------------------------------------------------------
   • อยู่ในแบบฟอร์มที่ 2 ส่วน "เอกสารแนบ" (ช่อง type:'files') → ไฟล์ผูกกับภาคเรียนเหมือนข้อมูลแบบฟอร์ม
   • ไฟล์เก็บที่ Firebase Storage: studentDocs/<ลำดับนักเรียน>/<ภาค-ปี>_<ประเภท>_<สุ่ม>.<นามสกุล>
     (ไม่ใช้เลขบัตรประชาชนในชื่อไฟล์) · ข้อมูลไฟล์ (ชื่อ ลิงก์ ขนาด ผู้อัปโหลด เวลา) เก็บในแบบฟอร์ม
   • รองรับ PDF / JPG / PNG / WEBP / HEIC(ถ้าเบราว์เซอร์อ่านได้) ไฟล์ละ ≤ 10 MB · รูปถูกย่อด้านยาว ≤ 2000px (ยังอ่านตัวหนังสือได้ชัด)
   • ครูผู้ดูแล (บัญชีนักเรียน) อัปโหลด/ลบได้เมื่อแบบฟอร์มที่ 2 เปิดรับ · ผู้ดูแล/เจ้าหน้าที่ทำได้เสมอ
   • หน้ารายละเอียดนักเรียน (แท็บพี่เลี้ยง & แบบฟอร์ม) แสดงเอกสารแนบทุกภาคเรียน
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX = 10 * 1024 * 1024, IMG_SIDE = 2000;
  const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';
  const busy = new Set();          // kind ที่กำลังอัปโหลด
  const sizeTxt = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const when = iso => { try { const d = new Date(iso); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const isImg = f => /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|gif)$/i.test(f.name || '');

  function ready() {
    try { return typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length && typeof firebase.storage === 'function' && firebase.auth().currentUser; }
    catch (e) { return false; }
  }
  function canEdit() {
    if (!window.STUDENT_MODE) return true;
    try { return !(window.Term && Term.isFormOpen) || Term.isFormOpen('form2'); } catch (e) { return true; }
  }
  const field = () => (typeof sfFindField === 'function') ? sfFindField('form2', 'attachments') : null;
  function value() {
    const v = sfGetValue('form2', 'attachments', field());
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  }
  function setValue(v) {
    const s = sfGetStudent(); if (!s) return;
    const store = s.form2 || (s.form2 = {});
    store.attachments = v; store.__touched = true;
    if (typeof sfPersist === 'function') sfPersist(); else saveToStorage();
  }

  /* ---------- วาดในแบบฟอร์ม ---------- */
  function itemHtml(kind, f, i, edit) {
    const ic = isImg(f) ? '🖼️' : /pdf/i.test(f.type || f.name) ? '📄' : '📎';
    return `<li class="at-file">
      ${isImg(f) ? `<a class="at-thumb" href="${E(f.url)}" target="_blank" rel="noopener"><img src="${E(f.url)}" alt="" loading="lazy"></a>` : `<span class="at-ic" aria-hidden="true">${ic}</span>`}
      <div class="at-meta"><a href="${E(f.url)}" target="_blank" rel="noopener" class="at-name">${E(f.name)}</a>
        <span>${sizeTxt(f.size || 0)} · ${E(when(f.uploadedAt))}${f.by ? ' · ' + E(f.by) : ''}</span></div>
      <a class="at-btn" href="${E(f.url)}" target="_blank" rel="noopener">เปิดดู</a>
      ${edit ? `<button type="button" class="at-btn danger" data-at-del="${kind}:${i}" aria-label="ลบไฟล์ ${E(f.name)}">ลบ</button>` : ''}
    </li>`;
  }
  function kindHtml(k, v, edit) {
    const list = Array.isArray(v[k.id]) ? v[k.id] : [];
    const up = busy.has(k.id);
    const ok = list.length > 0;
    return `<section class="at-kind ${ok ? 'is-ok' : k.required ? 'is-need' : ''}" data-at-kind="${k.id}">
      <header><div><h5>${E(k.label)} ${k.required ? '<em>จำเป็น</em>' : ''}</h5><p>${E(k.hint || '')}</p></div>
        <span class="at-state">${ok ? `✓ แนบแล้ว ${list.length} ไฟล์` : k.required ? 'ยังไม่แนบ' : 'ไม่บังคับ'}</span></header>
      ${list.length ? `<ul class="at-list">${list.map((f, i) => itemHtml(k.id, f, i, edit)).join('')}</ul>` : ''}
      ${edit ? `<label class="at-drop${up ? ' is-busy' : ''}" data-at-drop="${k.id}">
          <input type="file" accept="${ACCEPT}" multiple data-at-input="${k.id}" ${up ? 'disabled' : ''}>
          ${up ? `<span class="at-prog"><span data-at-bar="${k.id}" style="width:0%"></span></span><span data-at-ptxt="${k.id}">กำลังอัปโหลด…</span>`
               : `<span class="at-drop-ic" aria-hidden="true">⬆️</span><span><b>เลือกไฟล์</b> หรือลากไฟล์มาวาง · PDF / รูปภาพ ไม่เกิน 10 MB</span>`}
        </label>` : ''}
    </section>`;
  }
  window.sfRenderFiles = function (formKey, f) {
    const v = value();
    const edit = canEdit();
    const missing = (f.kinds || []).filter(k => k.required && !(v[k.id] || []).length).length;
    return `<div class="sf-item full at-wrap" id="at-root">
      <div class="at-summary ${missing ? 'warn' : 'ok'}">${missing ? `ยังขาดเอกสารจำเป็น ${missing} รายการ` : '✓ แนบเอกสารจำเป็นครบแล้ว'}
        ${!ready() ? '<span class="at-off">· ต้องเชื่อมต่อคลาวด์จึงจะอัปโหลดได้</span>' : ''}${!edit ? '<span class="at-off">· แบบฟอร์มปิดรับ (ดูได้อย่างเดียว)</span>' : ''}</div>
      ${(f.kinds || []).map(k => kindHtml(k, v, edit)).join('')}
    </div>`;
  };
  function rerender() {
    const root = document.getElementById('at-root'); const f = field();
    if (!root || !f) return;
    const tmp = document.createElement('div'); tmp.innerHTML = window.sfRenderFiles('form2', f);
    root.replaceWith(tmp.firstElementChild);
  }

  /* ---------- อัปโหลด ---------- */
  function shrinkImage(file) {
    return new Promise(resolve => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve({ blob: file, type: file.type, ext: (file.name.split('.').pop() || 'jpg').toLowerCase() });
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, IMG_SIDE / Math.max(img.width, img.height));
        if (k === 1 && file.size < 1.5 * 1048576) { URL.revokeObjectURL(url); return resolve({ blob: file, type: file.type, ext: file.type.split('/')[1].replace('jpeg', 'jpg') }); }
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => resolve(b ? { blob: b, type: 'image/jpeg', ext: 'jpg' } : { blob: file, type: file.type, ext: 'jpg' }), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ blob: file, type: file.type, ext: 'jpg' }); };
      img.src = url;
    });
  }
  function who() {
    try { return (window.STUDENT_MODE && (STUDENT_MODE.username || 'ครูผู้ดูแล')) || firebase.auth().currentUser.email || ''; } catch (e) { return ''; }
  }
  async function upload(kind, files) {
    files = [...(files || [])];
    if (!files.length) return;
    if (!canEdit()) { UIDialog.alert({ tone: 'warning', title: 'แบบฟอร์มปิดรับแล้ว', message: 'ติดต่อผู้ดูแลระบบหากต้องการแนบเอกสารเพิ่ม' }); return; }
    if (!ready()) { UIDialog.alert({ tone: 'warning', title: 'ยังอัปโหลดไม่ได้', message: 'ต้องเชื่อมต่ออินเทอร์เน็ตและเปิดใช้ Firebase Storage ก่อน (ดู README)' }); return; }
    const bad = files.filter(f => !(/pdf/i.test(f.type) || /^image\//.test(f.type) || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name)));
    const big = files.filter(f => f.size > MAX);
    if (bad.length || big.length) {
      UIDialog.alert({ tone: 'warning', title: 'มีไฟล์ที่อัปโหลดไม่ได้',
        message: [bad.length ? 'ชนิดไฟล์ไม่รองรับ: ' + bad.map(f => f.name).join(', ') : '', big.length ? 'ใหญ่เกิน 10 MB: ' + big.map(f => f.name).join(', ') : ''].filter(Boolean).join('\n') });
      files = files.filter(f => !bad.includes(f) && !big.includes(f));
      if (!files.length) return;
    }
    const s = sfGetStudent(); if (!s) return;
    const term = (window.Term && Term.active) ? Term.active() : 'term';
    const no = String(s.no ?? 'x').replace(/[^\w-]/g, '');
    busy.add(kind); rerender();
    const done = [], failed = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        let { blob, type, ext } = await shrinkImage(f);
        if (!type) type = /\.pdf$/i.test(f.name) ? 'application/pdf' : /\.png$/i.test(f.name) ? 'image/png' : /\.(heic|heif)$/i.test(f.name) ? 'image/heic' : 'image/jpeg';
        const path = `studentDocs/${no}/${term.replace('/', '-')}_${kind}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const task = firebase.storage().ref(path).put(blob, { contentType: type || 'application/octet-stream',
          customMetadata: { studentNo: no, term, kind, originalName: f.name.slice(0, 120) } });
        await new Promise((res, rej) => task.on('state_changed', snap => {
          const p = Math.round((i + snap.bytesTransferred / Math.max(1, snap.totalBytes)) / files.length * 100);
          const bar = document.querySelector(`[data-at-bar="${kind}"]`), t = document.querySelector(`[data-at-ptxt="${kind}"]`);
          if (bar) bar.style.width = p + '%'; if (t) t.textContent = `กำลังอัปโหลด ${i + 1}/${files.length} · ${p}%`;
        }, rej, res));
        const url = await task.snapshot.ref.getDownloadURL();
        done.push({ name: f.name, url, path, type: type || f.type, size: blob.size, uploadedAt: new Date().toISOString(), by: who() });
      } catch (e) { console.warn('upload', e); failed.push(f.name + (e.code === 'storage/unauthorized' ? ' (ไม่มีสิทธิ์)' : '')); }
    }
    busy.delete(kind);
    if (done.length) {
      const v = value(); v[kind] = (Array.isArray(v[kind]) ? v[kind] : []).concat(done); setValue(v);
      try { if (typeof window.fbSaveNow === 'function') await window.fbSaveNow(); } catch (e) {}
    }
    rerender();
    if (failed.length) UIDialog.alert({ tone: 'danger', title: 'อัปโหลดไม่สำเร็จบางไฟล์', message: failed.join('\n') + '\n\nตรวจอินเทอร์เน็ต แล้วลองอีกครั้ง (ถ้าขึ้น "ไม่มีสิทธิ์" ให้ผู้ดูแลตรวจ Storage Rules)' });
  }
  async function remove(kind, i) {
    const v = value(); const list = Array.isArray(v[kind]) ? v[kind] : []; const f = list[i]; if (!f) return;
    const ok = await uiAsk('ไฟล์นี้จะถูกลบออกจากเอกสารแนบของภาคเรียนนี้ และกู้คืนไม่ได้', { tone: 'danger', title: 'ลบไฟล์แนบ?', details: [{ label: 'ไฟล์', value: f.name }], confirmText: 'ลบไฟล์' });
    if (!ok) return;
    try { if (ready() && f.path) await firebase.storage().ref(f.path).delete(); } catch (e) { if (e.code !== 'storage/object-not-found') console.warn('delete file', e); }
    list.splice(i, 1); v[kind] = list; setValue(v);
    try { if (typeof window.fbSaveNow === 'function') await window.fbSaveNow(); } catch (e) {}
    rerender();
  }

  document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.atInput) { const k = t.dataset.atInput; const fs = t.files; upload(k, fs); t.value = ''; } });
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-at-del]'); if (!b) return; const [k, i] = b.dataset.atDel.split(':'); remove(k, +i); });
  ['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest('[data-at-drop]'); if (d) { e.preventDefault(); d.classList.add('is-over'); } }));
  document.addEventListener('dragleave', e => { const d = e.target.closest && e.target.closest('[data-at-drop]'); if (d) d.classList.remove('is-over'); });
  document.addEventListener('drop', e => { const d = e.target.closest && e.target.closest('[data-at-drop]'); if (!d) return; e.preventDefault(); d.classList.remove('is-over'); upload(d.dataset.atDrop, e.dataTransfer.files); });

  /* ---------- หน้ารายละเอียดนักเรียน: เอกสารแนบทุกภาคเรียน ---------- */
  const KINDS = () => ((field() || {}).kinds || []);
  function detailHtml(s) {
    const terms = Object.keys(s.forms || {}).filter(t => /\d\/\d{4}/.test(t)).sort((a, b) => { const k = t => { const m = t.match(/(\d)\/(\d{4})/); return +m[2] * 10 + +m[1]; }; return k(b) - k(a); });
    const rows = terms.map(t => {
      const v = (s.forms[t].form2 && s.forms[t].form2.attachments) || {};
      const cells = KINDS().map(k => { const list = v[k.id] || [];
        return `<td>${list.length ? list.map(f => `<a href="${E(f.url)}" target="_blank" rel="noopener" class="at-chip">${isImg(f) ? '🖼️' : '📄'} ${E(f.name.length > 22 ? f.name.slice(0, 20) + '…' : f.name)}</a>`).join('')
          : k.required ? '<span class="at-miss">ยังไม่แนบ</span>' : '<span class="at-dash">—</span>'}</td>`; }).join('');
      return `<tr><th>${E(t)}</th>${cells}</tr>`;
    }).join('');
    return `<div class="form-section at-detail" id="at-detail"><div class="form-section-title">📎 เอกสารแนบรายภาคเรียน</div>
      ${rows ? `<div class="at-tw"><table class="at-table"><thead><tr><th>ภาคเรียน</th>${KINDS().map(k => `<th>${E(k.short || k.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
        : '<p class="at-dash">ยังไม่มีเอกสารแนบ — แนบได้ในแบบฟอร์มที่ 2 ส่วน "เอกสารแนบ"</p>'}</div>`;
  }
  const _open = window.openStudentDetail;
  if (typeof _open === 'function') {
    window.openStudentDetail = function (idx) {
      const r = _open.apply(this, arguments);
      try {
        const p = document.getElementById('st-panel-1'); const s = DB.students[idx];
        if (p && s) { const old = p.querySelector('#at-detail'); if (old) old.remove(); p.insertAdjacentHTML('beforeend', detailHtml(s)); }
      } catch (e) {}
      return r;
    };
  }
  window.Attachments = { detailHtml, kinds: KINDS };
})();
