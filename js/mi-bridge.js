/* ============================================================
   mi-bridge.js — เชื่อมหน้าแบบสำรวจแววความสามารถพิเศษ (mi.html) กับระบบดูแลนักเรียนทุน
   ------------------------------------------------------------
   • ถ้าเข้าสู่ระบบอยู่ (ใช้ล็อกอินเดียวกับระบบหลัก เพราะอยู่โดเมนเดียวกัน)
       - บัญชีครูผู้ดูแล/นักเรียน: กรอกลำดับให้อัตโนมัติและล็อกไว้ (ทำได้เฉพาะของตัวเอง)
       - ผู้ดูแล/เจ้าหน้าที่: พิมพ์ลำดับ → แสดงชื่อ-โรงเรียนของนักเรียนลำดับนั้นให้ตรวจก่อนทำ
       - ทำแบบสำรวจเสร็จ (หรือเปิดลำดับที่เคยทำไว้) → บันทึกสรุปผลลงข้อมูลนักเรียน (students/{id}.mi)
   • ถ้ายังไม่เข้าสู่ระบบ: ทำได้ตามเดิม ผลบันทึกใน Google Sheet ของแบบสำรวจ
       แล้วผู้ดูแลกด "ดึงผลแบบสำรวจ MI" ในระบบหลักเพื่อนำเข้าข้อมูลนักเรียนภายหลัง
   ============================================================ */
(function () {
  'use strict';
  if (typeof firebase === 'undefined' || !window.FIREBASE_CONFIG) return;
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = firebase.auth(), db = firebase.firestore();
  const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  let ctx = { user: null, role: '', no: '', docId: '' };
  const cache = {};   // no → {docId, name, school, mi}

  /* ---------- UI ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .mib{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;padding:10px 14px;border-radius:12px;font-size:14px;
    background:color-mix(in srgb,var(--pri) 9%,var(--paper));border:1px solid color-mix(in srgb,var(--pri) 25%,var(--line));color:var(--ink)}
  .mib.off{background:var(--soft);border-color:var(--line);color:var(--dim)}
  .mib b{color:var(--pri)} .mib a{color:var(--pri);font-weight:600}
  .mib .dot{width:9px;height:9px;border-radius:50%;background:var(--ok);flex:none}
  .mib.off .dot{background:var(--dim)}
  .miwho{display:none;margin-top:12px;padding:12px 14px;border-radius:12px;border:1px dashed var(--line);font-size:15px}
  .miwho.on{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .miwho .nm{font-family:var(--display);font-weight:700;font-size:17px;color:var(--ink)}
  .miwho .sc{color:var(--dim);font-size:14px}
  .miwho .tag{font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;background:color-mix(in srgb,var(--ok) 15%,transparent);color:var(--ok)}
  .miwho.warn .tag{background:color-mix(in srgb,var(--warn) 15%,transparent);color:var(--warn)}
  #sid[readonly]{background:var(--soft);cursor:not-allowed}
  .misave{font-size:13px;color:var(--ok);margin-top:6px;min-height:18px}`;
  document.head.appendChild(css);
  const who = document.querySelector('.who');
  const bar = document.createElement('div'); bar.className = 'mib off'; bar.innerHTML = '<span class="dot"></span>กำลังตรวจสอบการเข้าสู่ระบบ…';
  const box = document.createElement('div'); box.className = 'miwho'; box.id = 'miwho';
  const saved = document.createElement('div'); saved.className = 'misave'; saved.id = 'misave';
  if (who) { who.insertBefore(bar, who.querySelector('h2') ? who.querySelector('h2').nextSibling : who.firstChild); const row = who.querySelector('.idrow'); if (row) row.insertAdjacentElement('afterend', box); box.insertAdjacentElement('afterend', saved); }

  function showWho(no, info) {
    if (!info) { box.className = 'miwho on warn'; box.innerHTML = `<span class="tag">ไม่พบ</span><span>ไม่พบนักเรียนลำดับ ${E(no)} ในระบบ — ตรวจเลขลำดับอีกครั้ง</span>`; return; }
    box.className = 'miwho on';
    box.innerHTML = `<span class="tag">ลำดับ ${E(no)}</span><span class="nm">${E(info.name || '(ไม่ระบุชื่อ)')}</span><span class="sc">${E(info.school || '')}</span>`
      + (info.mi && info.mi.updatedAt ? `<span class="sc">· มีผลในระบบแล้ว (อัปเดต ${E(new Date(info.mi.updatedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }))})</span>` : '');
  }

  /* ---------- ค้นนักเรียนจากลำดับ ---------- */
  async function lookup(no) {
    no = String(no);
    if (cache[no]) return cache[no];
    let doc = null;
    if (ctx.role === 'student') {
      if (no !== String(ctx.no)) return null;
      const d = await db.collection('students').doc(ctx.docId).get(); doc = d.exists ? d : null;
    } else {
      for (const v of [Number(no), no]) {
        const q = await db.collection('students').where('no', '==', v).limit(1).get();
        if (!q.empty) { doc = q.docs[0]; break; }
      }
    }
    if (!doc) return (cache[no] = null);
    const x = doc.data();
    return (cache[no] = { docId: doc.id, name: x.name || '', school: x.school_m1 || '', mi: x.mi || null });
  }

  /* ---------- บันทึกสรุปผลลงข้อมูลนักเรียน ---------- */
  let saving = null;
  async function pushResult(reason) {
    try {
      if (!ctx.user || typeof S === 'undefined' || !S || !S.p || !S.p.id || !S.basic) return;
      const info = await lookup(S.p.id); if (!info) return;
      const sum = MI.summarize({ basicAns: S.basic, specAns: S.spec, at: S.at, respondent: (typeof RESP !== 'undefined' && RESP[S.p.resp]) || '', source: 'mi' });
      if (!sum) return;
      // ไม่เขียนซ้ำถ้าคำตอบเหมือนที่มีในระบบแล้ว
      if (info.mi && JSON.stringify(info.mi.answers || {}) === JSON.stringify(sum.answers)) return;
      sum.by = ctx.user.email || ctx.no || '';
      await (saving = db.collection('students').doc(info.docId).update({ mi: sum }));
      info.mi = sum;
      saved.textContent = `✓ บันทึกผลลงข้อมูลของ ${info.name || 'นักเรียน'} ในระบบดูแลนักเรียนทุนแล้ว`;
      setTimeout(() => { if (saved.textContent.startsWith('✓')) saved.textContent = ''; }, 6000);
    } catch (e) {
      console.warn('บันทึกผล MI ลงระบบไม่สำเร็จ', e);
      saved.style.color = 'var(--bad)';
      saved.textContent = 'บันทึกลงข้อมูลนักเรียนไม่สำเร็จ (' + (e.code || e.message) + ') — ผลยังอยู่ใน Google Sheet ผู้ดูแลดึงเข้าภายหลังได้';
    }
  }
  if (typeof sendResult === 'function') {
    const _send = sendResult;
    window.sendResult = async function () { const r = await _send.apply(this, arguments); pushResult('finish'); return r; };
  }
  if (typeof selectId === 'function') {
    const _sel = selectId;
    window.selectId = async function (id) {
      const r = await _sel.apply(this, arguments);
      if (ctx.user) {
        try { showWho(id, await lookup(id)); } catch (e) { console.warn(e); }
        pushResult('open');   // เคยทำไว้แล้ว (ผลจาก Sheet) → นำเข้าระบบด้วย
      }
      return r;
    };
  }

  // หน้าผลลัพธ์: แสดงชื่อนักเรียนต่อจาก "ลำดับผู้รับทุนที่ n"
  if (typeof renderResults === 'function') {
    const _rr = renderResults;
    window.renderResults = function () {
      const r = _rr.apply(this, arguments);
      try { const id = S && S.p && S.p.id, c = cache[String(id)], el = $('r-who');
        if (el && c && c.name && !el.dataset.named) { el.textContent = el.textContent.replace('ลำดับผู้รับทุนที่ ' + id, 'ลำดับผู้รับทุนที่ ' + id + ' · ' + c.name); } } catch (e) {}
      return r;
    };
  }

  /* ---------- ตรวจผู้ใช้ ---------- */
  auth.onAuthStateChanged(async u => {
    if (!u) {
      ctx = { user: null, role: '', no: '', docId: '' };
      bar.className = 'mib off';
      bar.innerHTML = `<span class="dot"></span><span>ยังไม่ได้เข้าสู่ระบบ — ทำแบบสำรวจได้ตามปกติ ผลบันทึกในระบบแบบสำรวจ
        · <a href="login.html?next=mi.html">เข้าสู่ระบบ</a> เพื่อให้ระบบแสดงชื่อและบันทึกผลลงข้อมูลนักเรียนทันที</span>`;
      return;
    }
    ctx.user = u;
    try {
      const adm = await db.collection('admins').doc(u.email || '-').get().catch(() => null);
      if (adm && adm.exists) ctx.role = 'admin';
      else {
        const a = await db.collection('accounts').doc(u.uid).get();
        const x = a.exists ? a.data() : {};
        ctx.role = x.role || 'student'; ctx.no = x.no != null ? String(x.no) : ''; ctx.docId = x.studentId || '';
      }
    } catch (e) { console.warn(e); }
    if (ctx.role === 'student' && ctx.no) {
      const info = await lookup(ctx.no).catch(() => null);
      bar.className = 'mib';
      bar.innerHTML = `<span class="dot"></span><span>เข้าสู่ระบบแล้ว · ทำแบบสำรวจของ <b>${E(info ? info.name : 'ลำดับ ' + ctx.no)}</b> — ผลจะบันทึกลงข้อมูลนักเรียนอัตโนมัติ</span>`;
      const inp = $('sid');
      if (inp) {
        inp.value = ctx.no; inp.readOnly = true; inp.title = 'บัญชีนี้ทำแบบสำรวจได้เฉพาะลำดับของตัวเอง';
        try { lastValid = ctx.no; } catch (e) {}
        if (!S || !S.p || S.p.id !== ctx.no || !S.checked) window.selectId(ctx.no, true);
        else showWho(ctx.no, info);
      }
      const reset = document.querySelector('.reset'); if (reset) reset.style.display = 'none';
    } else {
      bar.className = 'mib';
      bar.innerHTML = `<span class="dot"></span><span>เข้าสู่ระบบในฐานะ<b>${ctx.role === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่'}</b> · พิมพ์ลำดับแล้วระบบจะแสดงชื่อนักเรียนให้ตรวจ · ผลบันทึกลงข้อมูลนักเรียนอัตโนมัติ</span>`;
      if (S && S.p && S.p.id) lookup(S.p.id).then(i => showWho(S.p.id, i)).catch(() => {});
    }
  });
  window.MIBridge = { pushResult, lookup };
})();
