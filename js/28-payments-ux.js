/* ============================================================
   28-payments-ux.js (v24)
   1) หน้า "การเงิน" สรุปตามระดับชั้น + รายภาคเรียน (แทนตารางยาว 1 แถวต่อ 1 ภาคเรียน)
      • ตารางสรุป: ชั้น → ภาคเรียน (จำนวนคน, ส่วนที่ 1, ส่วนที่ 2, รวม, เฉลี่ยต่อคน, ยังไม่เบิก)
      • ตารางรายคน: 1 คน = 1 แถว มีคอลัมน์ภาคเรียนจัดกลุ่มตามชั้น + รวมรายชั้น + รวมทั้งหมด
   2) แท็บการเงินในหน้ารายละเอียด: พิมพ์แล้วกด Tab ไม่หุบ/ไม่เด้งออกอีก
      (เดิมทุกช่องสั่งวาดใหม่ทั้งแผง → ภาคเรียนที่เปิดอยู่ปิดเอง และเคอร์เซอร์หาย)
   3) กด Esc ปิดหน้าต่าง (modal) ได้
   4) ป๊อปอัปผลการบันทึก ไอคอนใหญ่กลางจอ (เขียว = สำเร็จ / แดง = ไม่สำเร็จ)
   โหลดหลัง 27-print-layout.js
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  const money = v => (typeof fmt === 'function') ? fmt(v) : String(v);
  const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const payTotal = p => num(p.p1) + num(p.p2);
  const tkey = t => { const m = String(t || '').match(/(\d)\/(\d{4})/); return m ? +m[2] * 10 + +m[1] : 0; };

  /* ══════════ 4) ป๊อปอัปผลการบันทึก ══════════ */
  let _popTimer = null;
  function showSaveResult(ok, title, detail) {
    let el = document.getElementById('save-pop');
    if (!el) {
      el = document.createElement('div'); el.id = 'save-pop'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'assertive');
      el.addEventListener('click', () => hide());
      document.body.appendChild(el);
    }
    const icon = ok
      ? '<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27 l7 7 l15 -16"/></svg>'
      : '<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M18 18 l16 16 M34 18 l-16 16"/></svg>';
    el.className = ok ? 'ok' : 'err';
    el.innerHTML = `<div class="save-pop-card">${icon}<div class="save-pop-title">${E(title)}</div>${detail ? `<div class="save-pop-detail">${E(detail)}</div>` : ''}
      ${ok ? '' : '<div class="save-pop-hint">แตะที่ใดก็ได้เพื่อปิด</div>'}</div>`;
    // ปิดป๊อปอัปสถานะแบบเดิม (showStatus) ที่อาจซ้อนอยู่ — ให้เหลือผลการบันทึกอันเดียว
    const w = document.getElementById('status-pop-wrap'); if (w) w.innerHTML = '';
    _popShownAt = Date.now();
    void el.offsetWidth; el.classList.add('show');
    clearTimeout(_popTimer);
    if (ok) _popTimer = setTimeout(hide, 1700);
    function hide() { el.classList.remove('show'); }
  }
  window.showSaveResult = showSaveResult;
  // ระหว่างที่ป๊อปอัปผลการบันทึกแสดงอยู่ ไม่ต้องเด้งข้อความ "สำเร็จ" ซ้ำจาก showStatus
  let _popShownAt = 0;
  if (typeof showStatus === 'function') {
    const _os = showStatus;
    showStatus = function (msg, type) {
      if ((type === undefined || type === 'success') && Date.now() - _popShownAt < 2500) return;
      return _os.apply(this, arguments);
    };
  }

  /** บันทึกทันที แล้วแสดงผล — ใช้ได้ทั้งโหมด Firebase และโหมดเครื่อง */
  async function saveWithFeedback(what) {
    try {
      if (typeof window.fbSaveNow === 'function') {
        const r = await window.fbSaveNow();
        if (r.ok) showSaveResult(true, 'บันทึกเรียบร้อย', r.cloud ? `${what || 'ข้อมูล'} ถูกบันทึกขึ้นระบบคลาวด์แล้ว` : `${what || 'ข้อมูล'} ถูกบันทึกในเครื่องแล้ว`);
        else showSaveResult(false, 'บันทึกไม่สำเร็จ', (r.error && r.error.code === 'permission-denied')
          ? 'บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลส่วนนี้' : 'ตรวจสอบอินเทอร์เน็ตแล้วลองกดบันทึกอีกครั้ง');
        return r.ok;
      }
      await saveToStorage();
      showSaveResult(true, 'บันทึกเรียบร้อย', `${what || 'ข้อมูล'} ถูกบันทึกแล้ว`);
      return true;
    } catch (e) {
      showSaveResult(false, 'บันทึกไม่สำเร็จ', e && e.message ? e.message : 'เกิดข้อผิดพลาด');
      return false;
    }
  }
  window.saveWithFeedback = saveWithFeedback;

  // ปุ่ม 💾 บันทึก ในหน้าต่างข้อมูลนักเรียน / เพิ่มภาคเรียน + ปุ่ม Save ที่แถบซ้าย
  if (typeof saveAndRefresh === 'function') {
    const _o = saveAndRefresh;
    saveAndRefresh = function () { const r = _o.apply(this, arguments); saveWithFeedback('ข้อมูลนักเรียน'); return r; };
  }
  if (typeof window.saveSemData === 'function') {
    const _o = window.saveSemData;
    window.saveSemData = function () { const r = _o.apply(this, arguments); saveWithFeedback('ข้อมูลภาคเรียน'); return r; };
  }
  if (window.FB_NO_LOCAL_STUDENT_CACHE && typeof saveAllToSheet === 'function') {
    saveAllToSheet = function () { return saveWithFeedback('ข้อมูลทั้งหมด'); };
  }

  /* ══════════ 3) Esc ปิดหน้าต่าง ══════════ */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const pop = document.getElementById('save-pop');
    if (pop && pop.classList.contains('show')) { pop.classList.remove('show'); return; }
    const lb = document.getElementById('lightbox-overlay');
    if (lb && (lb.classList.contains('open') || lb.classList.contains('show') || getComputedStyle(lb).display !== 'none')) return; // ให้ lightbox ปิดก่อน
    if (document.querySelector('.sf-modal-overlay.open, #sf-modal-overlay.open')) return;             // ตัวอย่างก่อนพิมพ์มี Esc ของตัวเอง
    const ms = document.getElementById('std-prov-pop'); if (ms && !ms.hidden) return;
    const open = [...document.querySelectorAll('.modal-overlay.open')];
    if (!open.length) return;
    const top = open[open.length - 1];
    e.preventDefault();
    if (document.activeElement && top.contains(document.activeElement)) {
      // ให้ช่องที่กำลังพิมพ์ commit ค่า (onchange) ก่อนปิด
      try { document.activeElement.dispatchEvent(new Event('change', { bubbles: true })); } catch (er) {}
    }
    if (typeof closeModal === 'function') closeModal(top.id); else top.classList.remove('open');
  });

  /* ══════════ 2) แท็บการเงินในหน้ารายละเอียด — ไม่วาดใหม่ทั้งแผงเมื่อพิมพ์ ══════════ */
  const openState = new WeakMap();          // student → Set ของ index ภาคเรียนที่เปิดอยู่
  const openOf = s => { if (!openState.has(s)) openState.set(s, new Set()); return openState.get(s); };
  let _lastLen = new WeakMap();

  function recBodyHtml(idx, p, pi) {
    const total = payTotal(p);
    const pct = v => total > 0 ? Math.round(num(v) / total * 100) : 0;
    return `<div class="pay-sum2">
        <div class="pay-part p1"><div class="pay-part-t">ส่วนที่ 1 (ค่าบำรุงฯ)</div><div class="pay-part-v" data-live="p1">${money(num(p.p1))}</div>
          <div class="pay-part-s"><span data-live="pct1">${pct(p.p1)}</span>% · <span data-live="item1">${E(p.item1 || '-')}</span></div></div>
        <div class="pay-part p2"><div class="pay-part-t">ส่วนที่ 2 (ค่าใช้จ่าย)</div><div class="pay-part-v" data-live="p2">${money(num(p.p2))}</div>
          <div class="pay-part-s"><span data-live="pct2">${pct(p.p2)}</span>% · <span data-live="item2">${E(p.item2 || '-')}</span></div></div>
      </div>
      <div class="form-grid" style="padding:14px">
        <div class="fg"><label>ภาคเรียน</label><input data-pay="term" data-pi="${pi}" value="${E(p.term || '')}" placeholder="เช่น 1/2569"></div>
        <div class="fg"><label>ส่วนที่ 1 (บาท) — ค่าบำรุงการศึกษา</label><input data-pay="p1" data-pi="${pi}" type="text" inputmode="decimal" value="${num(p.p1) || ''}" placeholder="0"></div>
        <div class="fg"><label>รายการส่วนที่ 1</label><input data-pay="item1" data-pi="${pi}" value="${E(p.item1 || '')}"></div>
        <div class="fg"><label>ส่วนที่ 2 (บาท) — ค่าใช้จ่ายในการเรียน</label><input data-pay="p2" data-pi="${pi}" type="text" inputmode="decimal" value="${num(p.p2) || ''}" placeholder="0"></div>
        <div class="fg"><label>รายการส่วนที่ 2</label><input data-pay="item2" data-pi="${pi}" value="${E(p.item2 || '')}"></div>
        <div class="fg" style="align-self:end"><button type="button" class="btn btn-danger btn-sm" data-pay-del="${pi}">🗑 ลบภาคเรียน</button></div>
      </div>
      <div class="pay-rec-foot">รวมภาคเรียนนี้: <strong data-live="total">${money(total)} บาท</strong>
        <span class="pay-rec-hint">พิมพ์ตัวเลขแล้วกด Tab ไปช่องถัดไปได้เลย — ระบบบันทึกให้อัตโนมัติ</span></div>`;
  }

  function renderPaymentPanelStable(idx) {
    const s = DB.students[idx]; if (!s) return;
    const host = document.getElementById('st-panel-4'); if (!host) return;
    const recs = s.semPayments || (s.semPayments = []);
    const open = openOf(s);
    // เพิ่มภาคเรียนใหม่ → เปิดอันใหม่อัตโนมัติ
    const prevLen = _lastLen.get(s);
    if (prevLen != null && recs.length > prevLen) open.add(recs.length - 1);
    _lastLen.set(s, recs.length);

    const grand = recs.reduce((a, p) => a + payTotal(p), 0);
    const sum1 = recs.reduce((a, p) => a + num(p.p1), 0), sum2 = recs.reduce((a, p) => a + num(p.p2), 0);
    // เรียงแสดงตามภาคเรียน แต่คง index เดิมของข้อมูล
    const order = recs.map((p, pi) => pi).sort((a, b) => tkey(recs[a].term) - tkey(recs[b].term));
    let html = recs.length ? `<div class="pay-grand">
        <div><div class="pay-grand-t">💰 ยอดรวมทุกภาคเรียน</div><div class="pay-grand-v" data-live="grand">${money(grand)} บาท</div></div>
        <div class="pay-grand-r"><div>${recs.length} ภาคเรียน</div><div data-live="grand-split">ส่วนที่ 1: ${money(sum1)} + ส่วนที่ 2: ${money(sum2)}</div></div>
      </div>` : '<div class="pay-empty">ยังไม่มีรายการเบิกจ่าย กดปุ่มด้านล่างเพื่อเพิ่มภาคเรียน</div>';
    let lastLv = null;
    html += '<div class="sem-records">' + order.map(pi => {
      const p = recs[pi];
      const lv = (typeof gradeLevelOf === 'function' && p.term) ? gradeLevelOf(p.term) : null;
      const head = (lv && lv !== lastLv) ? `<div class="pay-grade-sep">${E(gradeName(lv))} · ปีการศึกษา ${gradeYear(lv)}</div>` : '';
      lastLv = lv;
      return head + `<div class="sem-record" data-pi="${pi}">
        <div class="sem-record-header" data-pay-toggle="${pi}" role="button" tabindex="0" aria-expanded="${open.has(pi)}">
          <div class="pay-dot"></div>
          <div class="sem-record-term">ภาคเรียน <strong>${E(typeof termWithGrade === 'function' ? termWithGrade(p.term) : p.term)}</strong></div>
          <div class="pay-rec-total" data-live="head-total">${money(payTotal(p))} บาท</div>
          <div class="pay-caret">▾</div>
        </div>
        <div class="sem-record-body${open.has(pi) ? ' open' : ''}">${recBodyHtml(idx, p, pi)}</div>
      </div>`;
    }).join('') + '</div>';
    html += `<button type="button" class="sem-add-btn" style="margin-top:10px" data-pay-add>+ เพิ่มข้อมูลภาคเรียนใหม่</button>`;
    host.innerHTML = html;
    host.dataset.payIdx = idx;
    bindPanel(host);
  }

  function liveUpdate(host, s, pi) {
    const p = s.semPayments[pi]; if (!p) return;
    const rec = host.querySelector(`.sem-record[data-pi="${pi}"]`); if (!rec) return;
    const total = payTotal(p);
    const set = (k, v) => { const el = rec.querySelector(`[data-live="${k}"]`); if (el) el.textContent = v; };
    set('p1', money(num(p.p1))); set('p2', money(num(p.p2)));
    set('pct1', total > 0 ? Math.round(num(p.p1) / total * 100) : 0);
    set('pct2', total > 0 ? Math.round(num(p.p2) / total * 100) : 0);
    set('item1', p.item1 || '-'); set('item2', p.item2 || '-');
    set('total', money(total) + ' บาท'); set('head-total', money(total) + ' บาท');
    const recs = s.semPayments;
    const g = host.querySelector('[data-live="grand"]'); if (g) g.textContent = money(recs.reduce((a, x) => a + payTotal(x), 0)) + ' บาท';
    const gs = host.querySelector('[data-live="grand-split"]');
    if (gs) gs.textContent = `ส่วนที่ 1: ${money(recs.reduce((a, x) => a + num(x.p1), 0))} + ส่วนที่ 2: ${money(recs.reduce((a, x) => a + num(x.p2), 0))}`;
  }

  function bindPanel(host) {
    if (host.dataset.payBound) return;
    host.dataset.payBound = '1';
    const cur = () => { const idx = +host.dataset.payIdx; return { idx, s: DB.students[idx] }; };
    host.addEventListener('input', e => {
      const inp = e.target.closest('[data-pay]'); if (!inp) return;
      const { s } = cur(); if (!s) return;
      const pi = +inp.dataset.pi, k = inp.dataset.pay, p = s.semPayments[pi]; if (!p) return;
      if (k === 'p1' || k === 'p2') p[k] = num(inp.value);
      else if (k === 'item1' || k === 'item2') p[k] = inp.value;
      else return;                                                      // ภาคเรียน: รอ change
      liveUpdate(host, s, pi);
    });
    host.addEventListener('change', e => {
      const inp = e.target.closest('[data-pay]'); if (!inp) return;
      const { idx, s } = cur(); if (!s) return;
      const pi = +inp.dataset.pi, k = inp.dataset.pay, p = s.semPayments[pi]; if (!p) return;
      if (k === 'p1' || k === 'p2') { p[k] = num(inp.value); inp.value = p[k] || ''; }   // "010000" → 10000
      if (k === 'term') {
        const t = inp.value.trim();
        if (t && !/^[12]\/\d{4}$/.test(t)) { showSaveResult(false, 'รูปแบบภาคเรียนไม่ถูกต้อง', 'ใช้รูปแบบ ภาค/ปี เช่น 1/2569'); inp.value = p.term || ''; return; }
        p.term = t;
        // จัดลำดับ/หัวชั้นใหม่ แต่คงภาคเรียนที่เปิดไว้ และคืนเคอร์เซอร์ไปช่องถัดไป
        renderPaymentPanelStable(idx);
        const nx = host.querySelector(`[data-pay="p1"][data-pi="${pi}"]`); if (nx) nx.focus();
        try { populateTermFilter(); } catch (er) {}
      }
      try { renderDashboard(); } catch (er) {}
      if (typeof debouncedSave === 'function') debouncedSave(idx); else saveToStorage();
    });
    host.addEventListener('click', e => {
      const tg = e.target.closest('[data-pay-toggle]');
      if (tg) { toggle(tg); return; }
      const del = e.target.closest('[data-pay-del]');
      if (del) {
        const { idx, s } = cur(); const pi = +del.dataset.payDel; const p = s.semPayments[pi];
        if (!confirm(`ลบข้อมูลการเบิกจ่ายภาคเรียน ${p && p.term || ''} ?`)) return;
        s.semPayments.splice(pi, 1);
        const open = openOf(s); const next = new Set(); open.forEach(i => { if (i < pi) next.add(i); else if (i > pi) next.add(i - 1); });
        openState.set(s, next); _lastLen.set(s, s.semPayments.length);
        renderPaymentPanelStable(idx);
        saveWithFeedback('การลบภาคเรียน');
        return;
      }
      if (e.target.closest('[data-pay-add]')) { const { idx } = cur(); addSemPayment(idx); }
    });
    host.addEventListener('keydown', e => {
      const tg = e.target.closest('[data-pay-toggle]');
      if (tg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(tg); }
    });
    function toggle(tg) {
      const { s } = cur(); const pi = +tg.dataset.payToggle; const open = openOf(s);
      const body = tg.nextElementSibling;
      const willOpen = !body.classList.contains('open');
      body.classList.toggle('open', willOpen); tg.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) open.add(pi); else open.delete(pi);
    }
  }

  if (typeof renderPaymentPanel === 'function') {
    renderPaymentPanel = function (idx) { renderPaymentPanelStable(idx); };
  }
  if (typeof addSemPayment === 'function') {
    addSemPayment = function (idx) {
      const s = DB.students[idx]; if (!s) return;
      if (!s.semPayments) s.semPayments = [];
      const existing = s.semPayments.map(p => p.term).filter(Boolean);
      const t = (typeof nextTermAfter === 'function') ? nextTermAfter(existing) : '';
      s.semPayments.push({ term: t, p1: 0, p2: 0, item1: 'ค่าเงินบำรุงการศึกษา', item2: 'ค่าใช้จ่ายในการเรียน' });
      renderPaymentPanelStable(idx);
      saveToStorage();
      // เคอร์เซอร์ไปที่ช่อง "ส่วนที่ 1" ของภาคเรียนใหม่ทันที
      const pi = s.semPayments.length - 1;
      const host = document.getElementById('st-panel-4');
      const f = host && host.querySelector(`[data-pay="p1"][data-pi="${pi}"]`);
      if (f) { f.focus(); f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    };
  }

  /* ══════════ 1) หน้า "การเงิน" — สรุปตามระดับชั้น + รายภาคเรียน ══════════ */
  function allPayTerms() {
    const set = new Set();
    DB.students.forEach(s => (s.semPayments || []).forEach(p => p.term && set.add(p.term)));
    return [...set].sort((a, b) => tkey(a) - tkey(b));
  }
  const lvOf = t => (typeof gradeLevelOf === 'function') ? gradeLevelOf(t) : 1;
  const gName = lv => (typeof gradeName === 'function') ? gradeName(lv) : 'ม.' + lv;
  const gYear = lv => (typeof gradeYear === 'function') ? gradeYear(lv) : '';

  populateTermFilter = function () {
    const sel = document.getElementById('pay-filter-term'); if (!sel) return;
    const cur = sel.value;
    const terms = allPayTerms();
    const lvs = [...new Set(terms.map(lvOf))].sort((a, b) => a - b);
    sel.innerHTML = `<option value="">ภาพรวมทุกระดับชั้น</option>`
      + (lvs.length ? `<optgroup label="ทั้งปี (ตามระดับชั้น)">${lvs.map(lv => `<option value="grade:${lv}">${gName(lv)} — ทั้งปีการศึกษา ${gYear(lv)}</option>`).join('')}</optgroup>` : '')
      + ((typeof gradeTermOptions === 'function') ? gradeTermOptions(terms, '', t => `ภาคเรียนที่ ${t}`) : terms.map(t => `<option value="${t}">${t}</option>`).join(''));
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  };

  window.renderPayment = function () {
    const page = document.getElementById('page-payment'); if (!page) return;
    const sel = document.getElementById('pay-filter-term');
    const scope = sel ? sel.value : '';
    const q = (document.getElementById('pay-search').value || '').trim().toLowerCase();
    const terms = allPayTerms();
    const gm = /^grade:(\d+)$/.exec(scope);
    const showTerms = gm ? terms.filter(t => lvOf(t) === +gm[1]) : scope ? [scope] : terms;
    const students = DB.students.slice().sort((a, b) => (+a.no || 0) - (+b.no || 0));
    const payOf = (s, t) => (s.semPayments || []).find(p => p.term === t);

    // ---- ตารางสรุป ชั้น → ภาคเรียน (คำนวณจากนักเรียนทุกคน ไม่ขึ้นกับช่องค้นหา) ----
    const lvs = [...new Set(showTerms.map(lvOf))].sort((a, b) => a - b);
    const agg = ts => {
      let c = 0, a1 = 0, a2 = 0; const paid = new Set();
      students.forEach(s => ts.forEach(t => { const p = payOf(s, t); if (p && payTotal(p) > 0) { paid.add(s); a1 += num(p.p1); a2 += num(p.p2); c++; } }));
      return { n: paid.size, rec: c, a1, a2, tot: a1 + a2 };
    };
    const rowSum = (label, ts, cls, extra) => {
      const r = agg(ts); const miss = students.length - r.n;
      return `<tr class="${cls}" ${extra || ''}><td>${label}</td>
        <td class="num">${r.n} <small>/ ${students.length}</small></td>
        <td class="num">${money(r.a1)}</td><td class="num">${money(r.a2)}</td>
        <td class="num"><b>${money(r.tot)}</b></td>
        <td class="num">${r.n ? money(Math.round(r.tot / r.n)) : '—'}</td>
        <td class="num ${miss && cls === 'pay-t-term' ? 'warn' : ''}">${cls === 'pay-t-term' ? miss : '—'}</td></tr>`;
    };
    let sumBody = '';
    lvs.forEach(lv => {
      const ts = showTerms.filter(t => lvOf(t) === lv);
      sumBody += rowSum(`<b>${E(gName(lv))}</b> <span class="pay-yr">ปีการศึกษา ${gYear(lv)}</span>`, ts, 'pay-t-grade', `data-scope="grade:${lv}"`);
      ts.forEach(t => { sumBody += rowSum(`<span class="pay-indent">ภาคเรียนที่ ${E(t)}</span>`, [t], 'pay-t-term', `data-scope="${E(t)}"`); });
    });
    const all = agg(showTerms);
    const summary = `<div class="pay-summary">
      <div class="pay-kpis">
        <div class="pay-kpi"><span>ยอดเบิกจ่ายรวม</span><b>${money(all.tot)}</b><small>บาท</small></div>
        <div class="pay-kpi"><span>ส่วนที่ 1 ค่าบำรุงการศึกษา</span><b>${money(all.a1)}</b><small>บาท</small></div>
        <div class="pay-kpi"><span>ส่วนที่ 2 ค่าใช้จ่ายในการเรียน</span><b>${money(all.a2)}</b><small>บาท</small></div>
        <div class="pay-kpi"><span>นักเรียนที่ได้รับเงิน</span><b>${all.n}</b><small>จาก ${students.length} คน</small></div>
      </div>
      <div class="tbl-wrap pay-sum-wrap"><table class="pay-sum-table">
        <thead><tr><th>ระดับชั้น / ภาคเรียน</th><th class="num">นักเรียนที่เบิก</th><th class="num">ส่วนที่ 1 (บาท)</th><th class="num">ส่วนที่ 2 (บาท)</th>
          <th class="num">รวม (บาท)</th><th class="num">เฉลี่ยต่อคน</th><th class="num">ยังไม่มีรายการ</th></tr></thead>
        <tbody>${sumBody || '<tr><td colspan="7" class="pay-none">ยังไม่มีรายการเบิกจ่าย</td></tr>'}</tbody>
        ${lvs.length > 1 ? `<tfoot><tr><td>รวมทุกระดับชั้น</td><td class="num">${all.n} <small>/ ${students.length}</small></td><td class="num">${money(all.a1)}</td><td class="num">${money(all.a2)}</td><td class="num"><b>${money(all.tot)}</b></td><td class="num">${all.n ? money(Math.round(all.tot / all.n)) : '—'}</td><td></td></tr></tfoot>` : ''}
      </table></div>
      <div class="pay-sum-hint">กดที่แถวชั้นหรือภาคเรียนเพื่อดูรายคนเฉพาะช่วงนั้น</div>
    </div>`;

    // ---- ตารางรายคน: 1 คน = 1 แถว ----
    const list = students.filter(s => !q || [s.name, s.nickname, s.school_m1, s.province, s.no].join(' ').toLowerCase().includes(q));
    let head1 = '', head2 = '', bodyRows = '';
    const single = showTerms.length === 1;
    if (single) {
      head1 = `<tr><th rowspan="1">ลำดับ</th><th>ชื่อ-สกุล</th><th>จังหวัด</th><th class="num">ส่วนที่ 1 ค่าบำรุงฯ</th><th class="num">ส่วนที่ 2 ค่าใช้จ่าย</th><th class="num">รวม (บาท)</th><th></th></tr>`;
      const t = showTerms[0];
      bodyRows = list.map(s => {
        const idx = DB.students.indexOf(s); const p = payOf(s, t);
        return `<tr class="${p ? '' : 'pay-norow'}"><td>${E(s.no ?? '')}</td>
          <td class="pay-name">${E(s.name || '-')}<small>${E(s.school_m1 || '')}</small></td>
          <td><span class="badge b-blue">${E(s.province || '-')}</span></td>
          ${p ? `<td class="num">${money(num(p.p1))}</td><td class="num">${money(num(p.p2))}</td><td class="num"><b>${money(payTotal(p))}</b></td>`
              : `<td colspan="3" class="pay-none">ยังไม่มีรายการภาคเรียนนี้</td>`}
          <td><button class="btn btn-sm" onclick="openStudentDetail(${idx});switchTabByName('การเงิน')">${p ? 'แก้ไข' : 'เพิ่ม'}</button></td></tr>`;
      }).join('');
    } else {
      const lvCols = lvs.map(lv => ({ lv, ts: showTerms.filter(t => lvOf(t) === lv) }));
      head1 = `<tr><th rowspan="2">ลำดับ</th><th rowspan="2">ชื่อ-สกุล</th><th rowspan="2">จังหวัด</th>`
        + lvCols.map(c => `<th colspan="${c.ts.length + 1}" class="pay-grp">${E(gName(c.lv))} · ${gYear(c.lv)}</th>`).join('')
        + `<th rowspan="2" class="num pay-grand-col">รวมทั้งหมด</th><th rowspan="2"></th></tr>`;
      head2 = '<tr>' + lvCols.map(c => c.ts.map(t => `<th class="num">ภาค ${E(t.split('/')[0])}</th>`).join('') + `<th class="num pay-sub">รวม ${E(gName(c.lv))}</th>`).join('') + '</tr>';
      bodyRows = list.map(s => {
        const idx = DB.students.indexOf(s); let grand = 0;
        const cells = lvCols.map(c => {
          let sub = 0;
          const tds = c.ts.map(t => { const p = payOf(s, t); if (!p) return `<td class="num pay-none" title="ยังไม่มีรายการ">—</td>`; const v = payTotal(p); sub += v;
            return `<td class="num" title="ส่วนที่ 1: ${money(num(p.p1))} + ส่วนที่ 2: ${money(num(p.p2))}">${money(v)}</td>`; }).join('');
          grand += sub;
          return tds + `<td class="num pay-sub">${sub ? money(sub) : '—'}</td>`;
        }).join('');
        return `<tr><td>${E(s.no ?? '')}</td><td class="pay-name">${E(s.name || '-')}<small>${E(s.school_m1 || '')}</small></td>
          <td><span class="badge b-blue">${E(s.province || '-')}</span></td>${cells}
          <td class="num pay-grand-col"><b>${grand ? money(grand) : '—'}</b></td>
          <td><button class="btn btn-sm" onclick="openStudentDetail(${idx});switchTabByName('การเงิน')">แก้ไข</button></td></tr>`;
      }).join('');
    }

    // ---- วางลงหน้า ----
    let sumHost = document.getElementById('pay-summary-host');
    if (!sumHost) {
      sumHost = document.createElement('div'); sumHost.id = 'pay-summary-host';
      page.insertBefore(sumHost, page.querySelector('.search-row'));
      sumHost.addEventListener('click', e => {
        const tr = e.target.closest('tr[data-scope]'); if (!tr || !sel) return;
        sel.value = tr.dataset.scope; renderPayment();
        const tbl = page.querySelector('.tbl-wrap:not(.pay-sum-wrap)'); if (tbl) tbl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    sumHost.innerHTML = summary;
    const table = page.querySelector('.tbl-wrap:not(.pay-sum-wrap) table');
    if (table) {
      table.classList.add('pay-matrix');
      table.querySelector('thead').innerHTML = head1 + head2;
      document.getElementById('payment-tbody').innerHTML = bodyRows || `<tr><td colspan="20" class="pay-none" style="text-align:center;padding:22px">ไม่พบนักเรียนตามคำค้นหา</td></tr>`;
    }
    const scopeText = gm ? `${gName(+gm[1])} ทั้งปีการศึกษา ${gYear(+gm[1])}` : scope ? `ภาคเรียนที่ ${scope} (${gName(lvOf(scope))})` : 'ทุกระดับชั้น';
    const listTot = list.reduce((a, s) => a + showTerms.reduce((b, t) => { const p = payOf(s, t); return b + (p ? payTotal(p) : 0); }, 0), 0);
    document.getElementById('payment-footer').textContent = `${scopeText} • แสดง ${list.length} คน • รวม ${money(listTot)} บาท`;
  };
})();
