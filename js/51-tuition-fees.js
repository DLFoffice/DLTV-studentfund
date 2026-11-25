/* ============================================================
   51-tuition-fees.js (v72) — แจ้งค่าเทอม (โรงเรียน) + ตรวจ/กำหนดยอดเบิก (ผู้ดูแล)
   ------------------------------------------------------------
   ข้อมูล (ต่อภาคเรียน):
     s.fees[term]      ← โรงเรียน/ครูกรอก  { items:[{id,label,amount,note}], note, files:[], submittedAt, by, updatedAt }
     s.feeReview[term] ← ผู้ดูแลกรอก       { approved:{itemId:amount}, rejected:bool, note, reviewedAt, reviewedBy }
     (บัญชีครูเขียนได้เฉพาะ fees — feeReview เขียนได้เฉพาะผู้ดูแล ตาม Firestore Rules)
   ส่งออก: Excel (.xlsx 3 แผ่นงาน) · PDF (รายงานสรุป / ใบสรุปรายคน ผ่านหน้าพิมพ์)
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CATS = [
    { id: 'tuition', label: 'ค่าบำรุงการศึกษา / ค่าธรรมเนียมการเรียน' },
    { id: 'books', label: 'ค่าหนังสือและอุปกรณ์การเรียน' },
    { id: 'uniform', label: 'ค่าเครื่องแบบนักเรียน' },
    { id: 'activity', label: 'ค่ากิจกรรมพัฒนาผู้เรียน' },
    { id: 'computer', label: 'ค่าคอมพิวเตอร์ / เทคโนโลยี' },
    { id: 'insurance', label: 'ค่าประกันอุบัติเหตุ' },
    { id: 'lunch', label: 'ค่าอาหารกลางวัน' },
    { id: 'dorm', label: 'ค่าหอพัก / ที่พัก' },
    { id: 'travel', label: 'ค่าเดินทาง' },
  ];
  const ST = { none: ['ยังไม่แจ้ง', 'none'], draft: ['ร่าง (ยังไม่ส่ง)', 'draft'], pending: ['รอตรวจ', 'pending'], full: ['อนุมัติเต็มจำนวน', 'full'], partial: ['อนุมัติบางส่วน', 'partial'], rejected: ['ไม่อนุมัติ', 'rejected'] };
  const isStaff = () => !window.STUDENT_MODE;
  const activeTerm = () => (window.Term && Term.active) ? Term.active() : '';
  // ชื่อภาคเรียนไม่ต่อท้ายชั้น (ระดับชั้นของค่าเทอมแสดงแยก — ผู้ดูแลกำหนดได้)
  const tlabel = t => ((window.Term && Term.label) ? Term.label(t) : String(t || '')).replace(/\s*\([^)]*\)\s*$/, '');
  const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };
  const baht = n => (Math.round(num(n) * 100) / 100).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const gradeOf = s => { try { const g = window.currentGradeOf ? currentGradeOf(s) : ''; return (g && typeof g === 'object') ? (g.grade || '') : (g || ''); } catch (e) { return ''; } };
  const who = () => { try { return (firebase.auth().currentUser || {}).email || ''; } catch (e) { return ''; } };
  /* v74: รอบแจ้งค่าเทอม (ผู้ดูแลกำหนด) — settings/feeRound { term, grade, open } */
  const GRADES = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6', 'ปวช.1', 'ปวช.2', 'ปวช.3', 'อุดมศึกษา ปี 1', 'อุดมศึกษา ปี 2', 'อุดมศึกษา ปี 3', 'อุดมศึกษา ปี 4'];
  const LS_ROUND = 'dltv.feeRound';
  let round = (() => { try { return Object.assign({ term: '', grade: '', open: true }, JSON.parse(localStorage.getItem(LS_ROUND) || '{}')); } catch (e) { return { term: '', grade: '', open: true }; } })();
  const roundTerm = () => (round.term && window.Term && Term.isValid(round.term)) ? round.term : activeTerm();
  const fsx = () => { try { return (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) ? firebase.firestore() : null; } catch (e) { return null; } };
  async function loadRound() {
    const db = fsx(); if (!db) return;
    try { const d = await db.collection('settings').doc('feeRound').get(); if (d.exists) { round = Object.assign({ term: '', grade: '', open: true }, d.data()); try { localStorage.setItem(LS_ROUND, JSON.stringify(round)); } catch (e) {} } } catch (e) {}
  }
  async function saveRound(r) {
    round = Object.assign({}, round, r, { at: new Date().toISOString(), by: who() });
    try { localStorage.setItem(LS_ROUND, JSON.stringify(round)); } catch (e) {}
    const db = fsx(); if (db) await db.collection('settings').doc('feeRound').set(round, { merge: true });
  }
  /** ระดับชั้นของรายการค่าเทอม: ผู้ดูแลกำหนดรายคน → ระดับชั้นของรอบ → ตามภาคเรียน */
  function gradeFor(s, t) {
    const r = s && s.feeReview && s.feeReview[t];
    if (r && r.grade) return r.grade;
    if (t === roundTerm() && round.grade) return round.grade;
    try { if (typeof gradeFromTerm === 'function' && t) return gradeFromTerm(t); } catch (e) {}
    return gradeOf(s);
  }
  const fmtD = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); };

  /* ---------- ข้อมูล ---------- */
  function feeOf(s, t) { return (s && s.fees && s.fees[t]) || null; }
  function revOf(s, t) { return (s && s.feeReview && s.feeReview[t]) || null; }
  function itemsOf(f) { return ((f && f.items) || []).filter(it => num(it.amount) > 0); }
  function requested(f) { return itemsOf(f).reduce((a, it) => a + num(it.amount), 0); }
  function approvedTotal(s, t) {
    const f = feeOf(s, t), r = revOf(s, t); if (!f || !r || r.rejected) return 0;
    return itemsOf(f).reduce((a, it) => a + num((r.approved || {})[it.id]), 0);
  }
  function status(s, t) {
    const f = feeOf(s, t), r = revOf(s, t);
    if (!f || !itemsOf(f).length) return 'none';
    if (!f.submittedAt) return 'draft';
    if (!r || !r.reviewedAt) return 'pending';
    if (r.rejected) return 'rejected';
    const a = approvedTotal(s, t), q = requested(f);
    return a >= q - 0.001 ? 'full' : 'partial';
  }
  async function persist() {
    try { if (typeof window.fbSaveNow === 'function') await window.fbSaveNow(); else saveToStorage(); } catch (e) { console.warn(e); throw e; }
  }

  /* ---------- หน้า + เมนู ---------- */
  const st = { term: '', idx: null, filter: 'all', q: '', review: null };
  function page() {
    let p = document.getElementById('page-fees');
    if (!p) {
      p = document.createElement('div'); p.id = 'page-fees'; p.className = 'page'; p.style.display = 'none';
      const ref = document.getElementById('page-formtrack');
      (ref ? ref.parentNode : document.querySelector('.main')).appendChild(p);
      p.addEventListener('click', onClick); p.addEventListener('input', onInput); p.addEventListener('change', onChange);
      p.addEventListener('keydown', e => {
        const r = e.target.closest && e.target.closest('tr[data-fe-review]');
        if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); }
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && st.review != null && p.isConnected && p.offsetParent && !document.querySelector('.fe-lb,.uid-backdrop,.lb-overlay,.lightbox.open')) { st.review = null; render(); }
      });
    }
    return p;
  }
  try { PAGE_META.fees = { title: 'ค่าเทอมนักเรียนทุน', sub: 'โรงเรียนแจ้งค่าเทอมแยกรายการ · มูลนิธิฯ ตรวจและกำหนดยอดเบิก' }; } catch (e) {}
  const _show = window.showPage;
  window.showPage = function (p) {
    if (p === 'fees') page();
    const r = _show.apply(this, arguments);
    if (p === 'fees') { try { PAGE_META.fees.title = isStaff() ? 'ค่าเทอมนักเรียนทุน (ตรวจ/เบิก)' : 'แจ้งค่าเทอม'; const tt = document.getElementById('topbar-title'); if (tt) tt.textContent = PAGE_META.fees.title; } catch (e) {} render(); }
    return r;
  };
  function addNav() {
    if (document.getElementById('fee-nav')) return;
    const ref = document.querySelector('#sidebar-nav .nav-btn[onclick*="\'formtrack\'"]');
    if (!ref) { setTimeout(addNav, 400); return; }
    const b = document.createElement('button'); b.className = 'nav-btn'; b.id = 'fee-nav'; b.type = 'button';
    b.setAttribute('onclick', "showPage('fees',this)");
    b.innerHTML = '<span class="nav-icon">💰</span> <span class="fee-nav-t">ค่าเทอมนักเรียน</span>';
    ref.insertAdjacentElement('afterend', b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(addNav, 200)); else setTimeout(addNav, 200);
  window.addEventListener('dltv:students-loaded', () => { addNav(); const t = document.querySelector('#fee-nav .fee-nav-t'); if (t) t.textContent = isStaff() ? 'ค่าเทอม (ตรวจ/เบิก)' : 'แจ้งค่าเทอม'; if (document.getElementById('page-fees')?.classList.contains('active')) render(); });

  let roundLoaded = false;
  function render() {
    if (!roundLoaded) { roundLoaded = true; loadRound().then(() => { if (document.getElementById('page-fees')?.classList.contains('active')) render(); }); }
    const p = page();
    const nt = document.querySelector('#fee-nav .fee-nav-t'); if (nt) nt.textContent = isStaff() ? 'ค่าเทอม (ตรวจ/เบิก)' : 'แจ้งค่าเทอม';
    if (!isStaff()) { p.innerHTML = userHtml(); return; }
    p.innerHTML = adminHtml();
    if (st.review != null) setTimeout(loadPreviews, 0);
  }

  /* ════════════ ฝั่งโรงเรียน (บัญชีครู) ════════════ */
  function userHtml() {
    const t = roundTerm(), list = DB.students || [];
    if (!list.length) return `<div class="fe-empty">ยังไม่มีข้อมูลนักเรียนในบัญชีนี้</div>`;
    if (st.idx == null && list.length === 1) st.idx = 0;
    if (st.idx == null) {
      return `<div class="fe-wrap">${introHtml(t)}<div class="fe-pick">${list.map((s, i) => {
        const k = status(s, t), f = feeOf(s, t);
        return `<button type="button" class="fe-pcard" data-fe-open="${i}"><b>${E(s.name || '-')}</b><span>${E(s.school_m1 || '')} · ${E(gradeFor(s, t))}</span>
          <span class="fe-chip ${ST[k][1]}">${ST[k][0]}</span>${f ? `<span class="fe-sum">แจ้ง ${baht(requested(f))} บาท</span>` : ''}</button>`;
      }).join('')}</div></div>`;
    }
    return `<div class="fe-wrap">${list.length > 1 ? `<button type="button" class="fe-back" data-fe-list>← เลือกนักเรียนคนอื่น</button>` : ''}${introHtml(t)}${editorHtml(list[st.idx], st.idx, t)}</div>`;
  }
  function introHtml(t) {
    return `<section class="fe-hero"><div><h2>แจ้งค่าเทอม ${E(tlabel(t))}</h2>
      ${round.grade ? `<p class="fe-hero-g">ระดับชั้น ${E(round.grade)}</p>` : ''}
      <p>กรอกค่าใช้จ่ายที่สถานศึกษาเรียกเก็บจริง <b>แยกตามรายการ</b> ระบบรวมยอดให้อัตโนมัติ แนบใบแจ้งหนี้/ใบเสร็จ (ถ้ามี) แล้วกด <b>ส่งข้อมูลให้มูลนิธิฯ</b> · มูลนิธิฯ จะตรวจและแจ้งยอดที่เบิกได้ในหน้านี้</p></div></section>`;
  }
  function editorHtml(s, idx, t) {
    // ยกสำเนาสมุดบัญชีจากภาคก่อนมาแสดง/ใช้ต่อ ถ้าภาคนี้ยังไม่แนบ
    const pf = prevBankFiles(s, t);
    if (pf.length && !((feeOf(s, t) || {}).files || []).some(x => x.kind === 'bank') && !(revOf(s, t) || {}).reviewedAt) {
      s.fees = s.fees || {}; s.fees[t] = s.fees[t] || {}; s.fees[t].files = (s.fees[t].files || []).concat(pf);
    }
    const f = feeOf(s, t) || {}, r = revOf(s, t), k = status(s, t);
    const closed = !round.open && !(r && r.reviewedAt);
    const locked = !!(r && r.reviewedAt) || closed;
    const map = {}; (f.items || []).forEach(it => { map[it.id] = it; });
    const custom = (f.items || []).filter(it => it.custom);
    const row = (id, label, it, isCustom) => {
      const ap = r && r.reviewedAt ? (r.rejected ? 0 : num((r.approved || {})[id])) : null;
      return `<tr data-fe-row="${E(id)}">
        <td>${isCustom ? `<input class="fe-in fe-lbl" data-fe-label="${E(id)}" value="${E(label)}" placeholder="ระบุรายการ" ${locked ? 'disabled' : ''}>` : E(label)}</td>
        <td class="n"><input class="fe-in fe-amt" inputmode="decimal" data-fe-amt="${E(id)}" value="${it && num(it.amount) ? E(it.amount) : ''}" placeholder="0" ${locked ? 'disabled' : ''}></td>
        <td><input class="fe-in" data-fe-note="${E(id)}" value="${E(it ? it.note || '' : '')}" placeholder="หมายเหตุ (ถ้ามี)" ${locked ? 'disabled' : ''}></td>
        ${ap != null ? `<td class="n fe-ap">${baht(ap)}</td>` : ''}
        ${isCustom && !locked ? `<td class="x"><button type="button" class="fe-x" data-fe-del="${E(id)}" aria-label="ลบรายการ">✕</button></td>` : (locked || r ? '' : '<td class="x"></td>')}
      </tr>`;
    };
    const showAp = !!(r && r.reviewedAt);
    const canAttach = !closed;   // v75c: ตรวจแล้วยังแนบเอกสารเพิ่มได้ (ไม่เปลี่ยนยอด)
    const req = f.editRequest;
    const files = Array.isArray(f.files) ? f.files : [];
    const bank = f.bank || prevBank(s, t) || {};
    const fileList = kind => files.map((x, i) => ({ x, i })).filter(o => (o.x.kind || 'invoice') === kind)
      .map(({ x, i }) => `<span class="fe-file"><button type="button" class="fe-link" data-fe-view="${i}">📎 ${E(x.name)}</button>${x.fromTerm ? `<small class="fe-dim">(จาก${E(tlabel(x.fromTerm))})</small>` : ''}${locked && !(canAttach && x.uploadedAt && r && x.uploadedAt > r.reviewedAt) ? '' : `<button type="button" class="fe-x" data-fe-rmfile="${i}" aria-label="ลบไฟล์">✕</button>`}</span>`).join('') || '<span class="fe-dim">ยังไม่มีไฟล์</span>';
    const bf = (k, label, ph) => `<label class="fe-f"><span>${label} <b class="req">*</b></span><input class="fe-in" data-fe-bank="${k}" value="${E(bank[k] || '')}" placeholder="${ph}" ${locked ? 'disabled' : ''} ${k === 'accNo' ? 'inputmode="numeric"' : ''}></label>`;
    return `<section class="fe-card" data-fe-idx="${idx}">
      <header class="fe-head"><div><h3>${E(s.name || '-')}</h3><p>ลำดับ ${E(s.no ?? '-')} · ${E(s.school_m1 || '-')} · ${E(gradeFor(s, t))} · ${E(tlabel(t))}</p></div>
        <span class="fe-chip ${ST[k][1]}">${ST[k][0]}</span></header>
      ${closed ? `<div class="fe-note warn">มูลนิธิฯ ปิดรับการแจ้งค่าเทอมรอบนี้แล้ว — ดูข้อมูลได้อย่างเดียว</div>` : ''}
      ${locked && !closed ? `<div class="fe-note ok">มูลนิธิฯ ตรวจแล้วเมื่อ ${E(fmtD(r.reviewedAt))} — <b>ยอดที่เบิกได้ ${baht(approvedTotal(s, t))} บาท</b>${r.note ? `<br>หมายเหตุจากมูลนิธิฯ: ${E(r.note)}` : ''}<br><small>ต้องการแก้ไขข้อมูล ติดต่อเจ้าหน้าที่มูลนิธิฯ</small></div>`
        : closed ? '' : f.submittedAt ? `<div class="fe-note">ส่งข้อมูลแล้วเมื่อ ${E(fmtD(f.submittedAt))} — รอมูลนิธิฯ ตรวจ (ยังแก้ไขและส่งใหม่ได้)</div>` : ''}
      <div class="fe-tw"><table class="fe-t"><thead><tr><th>รายการ</th><th class="n">จำนวนเงิน (บาท)</th><th>หมายเหตุ</th>${showAp ? '<th class="n">เบิกได้</th>' : ''}${locked ? '' : '<th></th>'}</tr></thead>
        <tbody>${CATS.map(c => row(c.id, c.label, map[c.id], false)).join('')}${custom.map(it => row(it.id, it.label, it, true)).join('')}</tbody>
        <tfoot><tr><th>รวมทั้งสิ้น</th><th class="n" id="fe-total">${baht(requested(f))}</th><th></th>${showAp ? `<th class="n fe-ap">${baht(approvedTotal(s, t))}</th>` : ''}${locked ? '' : '<th></th>'}</tr></tfoot></table></div>
      ${locked ? '' : `<button type="button" class="fe-add" data-fe-addrow>+ เพิ่มรายการอื่น</button>`}
      <section class="fe-bank">
        <h4>🏦 บัญชีธนาคารของสถานศึกษา (สำหรับโอนเงินค่าเทอม)</h4>
        ${!f.bank && bank.accNo ? `<p class="fe-dim">ระบบเติมข้อมูลบัญชีจากภาคเรียนก่อนให้แล้ว — ตรวจให้ถูกต้อง</p>` : ''}
        <div class="fe-bgrid">${bf('bankName', 'ธนาคาร', 'เช่น ธ.กรุงไทย')}${bf('branch', 'สาขา', 'เช่น สาขาโกสุมพิสัย').replace(' <b class="req">*</b>', '')}${bf('accName', 'ชื่อบัญชี', 'ชื่อบัญชีตามสมุดบัญชี')}${bf('accNo', 'เลขที่บัญชี', 'ตัวเลข 10–12 หลัก')}</div>
        <div class="fe-f"><span>สำเนาหน้าสมุดบัญชีธนาคาร <b class="req">*</b></span>
          <div class="fe-files">${fileList('bank')}</div>
          ${!canAttach ? '' : `<label class="fe-up"><input type="file" accept="application/pdf,image/*" data-fe-file="bank" hidden>⬆ แนบสำเนาสมุดบัญชี (PDF/รูป ≤10MB)</label>`}</div>
      </section>
      <div class="fe-grid">
        <label class="fe-f"><span>หมายเหตุถึงมูลนิธิฯ</span><textarea class="fe-in" rows="2" data-fe-gnote ${locked ? 'disabled' : ''}>${E(f.note || '')}</textarea></label>
        <div class="fe-f"><span>ใบแจ้งค่าเทอม / ใบเสร็จ (ถ้ามี)</span>
          <div class="fe-files">${fileList('invoice')}</div>
          ${!canAttach ? '' : `<label class="fe-up"><input type="file" accept="application/pdf,image/*" data-fe-file="invoice" hidden>⬆ แนบไฟล์ (PDF/รูป ≤10MB)</label>`}</div>
      </div>
      ${locked && !closed ? `<div class="fe-lock">
          <div class="fe-lock-ic">🔒</div>
          <div><b>แก้ไขรายการ/บัญชีไม่ได้ เพราะมูลนิธิฯ ตรวจและกำหนดยอดเบิกแล้ว</b>
            <p>ยังแนบเอกสารเพิ่มได้ (เช่น สำเนาสมุดบัญชี ใบเสร็จ) · ถ้าต้องแก้ไขจำนวนเงินหรือบัญชี กด "ขอแก้ไขข้อมูล" แล้วมูลนิธิฯ จะเปิดให้แก้ไข</p>
            ${req && req.at ? `<p class="fe-lock-sent">✋ ส่งคำขอแก้ไขแล้วเมื่อ ${E(fmtD(req.at))}${req.reason ? ` — “${E(req.reason)}”` : ''} · รอมูลนิธิฯ เปิดให้แก้ไข</p>` : ''}</div>
          <button type="button" class="btn ${req && req.at ? 'btn-outline' : 'btn-primary'}" data-fe-askedit>${req && req.at ? 'ส่งคำขออีกครั้ง' : '✋ ขอแก้ไขข้อมูล'}</button>
        </div>` : ''}
      ${locked ? '' : `<div class="fe-acts"><button type="button" class="btn btn-outline" data-fe-save>💾 บันทึกร่าง</button><button type="button" class="btn btn-primary" data-fe-submit>📤 ${f.submittedAt ? 'ส่งข้อมูลอีกครั้ง' : 'ส่งข้อมูลให้มูลนิธิฯ'}</button></div>`}
    </section>`;
  }
  // อ่านค่าจากฟอร์มกลับเข้าข้อมูล
  function collect(card, s, t) {
    s.fees = s.fees || {}; const f = s.fees[t] = s.fees[t] || {};
    const prev = {}; (f.items || []).forEach(it => { prev[it.id] = it; });
    const items = [];
    card.querySelectorAll('[data-fe-row]').forEach(tr => {
      const id = tr.getAttribute('data-fe-row'), cat = CATS.find(c => c.id === id);
      const amt = tr.querySelector('[data-fe-amt]').value.trim(), note = tr.querySelector('[data-fe-note]').value.trim();
      const lbl = cat ? cat.label : (tr.querySelector('[data-fe-label]') || {}).value || '';
      if (!cat || num(amt) > 0 || note) items.push({ id, label: lbl.trim(), amount: amt ? String(num(amt)) : '', note, custom: !cat || undefined });
    });
    items.forEach(it => { if (!it.custom) delete it.custom; });
    f.items = items;
    const g = card.querySelector('[data-fe-gnote]'); f.note = g ? g.value.trim() : '';
    const bk = {}; card.querySelectorAll('[data-fe-bank]').forEach(i => { bk[i.getAttribute('data-fe-bank')] = i.value.trim(); });
    if (Object.values(bk).some(Boolean)) f.bank = bk;
    // ใช้ไฟล์สมุดบัญชีจากภาคก่อนได้ ถ้าภาคนี้ยังไม่แนบ
    f.files = Array.isArray(f.files) ? f.files : [];
    if (!f.files.some(x => x.kind === 'bank')) { const pf = prevBankFiles(s, t); if (pf.length) f.files = f.files.concat(pf); }
    f.updatedAt = new Date().toISOString(); f.by = who();
    return f;
  }
  /** ข้อมูลบัญชี/ไฟล์สมุดบัญชีจากภาคเรียนล่าสุดก่อนหน้า (โรงเรียนเดิมใช้บัญชีเดิม) */
  function prevTerms(s, t) { return Object.keys(s.fees || {}).filter(x => x !== t && window.Term && Term.isValid(x) && Term.cmp(x, t) < 0).sort(Term.cmp).reverse(); }
  function prevBank(s, t) { const x = prevTerms(s, t).find(k => s.fees[k] && s.fees[k].bank && s.fees[k].bank.accNo); return x ? Object.assign({}, s.fees[x].bank) : null; }
  function prevBankFiles(s, t) {
    for (const k of prevTerms(s, t)) { const fs = ((s.fees[k] || {}).files || []).filter(x => x.kind === 'bank'); if (fs.length) return fs.map(x => Object.assign({}, x, { fromTerm: x.fromTerm || k })); }
    return [];
  }
  function liveTotal(card) {
    let n = 0; card.querySelectorAll('[data-fe-amt]').forEach(i => { n += num(i.value); });
    const el = card.querySelector('#fe-total'); if (el) el.textContent = baht(n);
  }

  /* ════════════ ฝั่งผู้ดูแล ════════════ */
  function termsWithData() {
    const set = new Set([activeTerm(), roundTerm()]);
    (DB.students || []).forEach(s => { if (s.fees) Object.keys(s.fees).forEach(t => set.add(t)); });
    return [...set].filter(t => window.Term && Term.isValid(t)).sort(Term.cmp).reverse();
  }
  function roundTermOptions() {
    const set = new Set(termsWithData()); let x = activeTerm();
    for (let i = 0; i < 3 && window.Term && Term.next; i++) { x = Term.next(x); if (x) set.add(x); }
    return [...set].filter(t => window.Term && Term.isValid(t)).sort(Term.cmp).reverse();
  }
  const isReq = r => !!(r.f && r.f.editRequest && (revOf(r.s, st.term || roundTerm()) || {}).reviewedAt);
  function rows(t) {
    return (DB.students || []).map((s, i) => {
      const f = feeOf(s, t), k = status(s, t);
      return { s, i, k, f, req: f ? requested(f) : 0, ap: approvedTotal(s, t) };
    });
  }
  function adminHtml() {
    const t = st.term || roundTerm(), all = rows(t);
    if (st.review != null && DB.students[st.review]) return detailHtml(DB.students[st.review], st.review, t, all);
    const sent = all.filter(r => !['none', 'draft'].includes(r.k));
    const tot = { req: sent.reduce((a, r) => a + r.req, 0), ap: all.reduce((a, r) => a + r.ap, 0) };
    const cnt = k => all.filter(r => r.k === k).length;
    const q = st.q.trim().toLowerCase();
    let list = all.filter(r => st.filter === 'all' ? true : st.filter === 'req' ? isReq(r) : st.filter === 'done' ? ['full', 'partial', 'rejected'].includes(r.k) : st.filter === 'none' ? ['none', 'draft'].includes(r.k) : r.k === st.filter);
    if (q) list = list.filter(r => [r.s.name, r.s.school_m1, r.s.province, r.s.no].join(' ').toLowerCase().includes(q));
    const chip = (k, l, n) => `<button type="button" class="fe-fchip ${st.filter === k ? 'on' : ''}" data-fe-filter="${k}">${l} <b>${n}</b></button>`;
    return `<div class="fe-wrap">
      <section class="fe-top">
        <div><h2>ค่าเทอมนักเรียนทุน</h2>
          <label class="fe-termsel"><span>ภาคเรียน</span><select data-fe-term>${termsWithData().map(x => `<option value="${E(x)}" ${x === t ? 'selected' : ''}>${E(tlabel(x))}${x === roundTerm() ? ' (รอบที่เปิด)' : x === activeTerm() ? ' (ปัจจุบัน)' : ''}</option>`).join('')}</select></label></div>
        <div class="fe-exp"><button type="button" class="btn btn-outline" data-fe-xlsx>📊 ส่งออก Excel</button><button type="button" class="btn btn-outline" data-fe-pdf>🖨 รายงาน PDF</button></div>
      </section>
      <section class="fe-round">
        <div class="fe-round-t"><b>📌 รอบแจ้งค่าเทอมของโรงเรียน</b><span class="fe-chip ${round.open ? 'full' : 'rejected'}">${round.open ? 'เปิดรับ' : 'ปิดรับ'}</span>
          <span class="fe-dim">โรงเรียนจะแจ้งค่าเทอมของ <b>${E(tlabel(roundTerm()))}</b>${round.grade ? ` · ระดับชั้น <b>${E(round.grade)}</b>` : ''}</span></div>
        <div class="fe-round-f">
          <label><span>ภาคเรียน</span><select data-fe-rterm>${roundTermOptions().map(x => `<option value="${E(x)}" ${x === roundTerm() ? 'selected' : ''}>${E(tlabel(x))}${x === activeTerm() ? ' (ปัจจุบัน)' : ''}</option>`).join('')}</select></label>
          <label><span>ระดับชั้น</span><select data-fe-rgrade><option value="">ตามภาคเรียน (อัตโนมัติ)</option>${GRADES.map(g => `<option ${g === round.grade ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
          <label><span>สถานะ</span><select data-fe-ropen><option value="1" ${round.open ? 'selected' : ''}>เปิดรับการแจ้ง</option><option value="0" ${!round.open ? 'selected' : ''}>ปิดรับการแจ้ง</option></select></label>
          <button type="button" class="btn btn-primary btn-sm" data-fe-rsave>บันทึกรอบ</button>
        </div>
      </section>
      <section class="fe-kpis">
        <div class="fe-kpi"><span>แจ้งแล้ว</span><b>${sent.length}<small>/${all.length} คน</small></b></div>
        <div class="fe-kpi"><span>ยอดที่โรงเรียนแจ้ง</span><b>${baht(tot.req)}<small> บาท</small></b></div>
        <div class="fe-kpi ok"><span>ยอดเบิกได้ (ตรวจแล้ว)</span><b>${baht(tot.ap)}<small> บาท</small></b></div>
        <div class="fe-kpi warn"><span>รอตรวจ</span><b>${cnt('pending')}<small> คน</small></b></div>
      </section>
      <section class="fe-card">
        <div class="fe-bar">${chip('all', 'ทั้งหมด', all.length)}${chip('pending', 'รอตรวจ', cnt('pending'))}${chip('done', 'ตรวจแล้ว', cnt('full') + cnt('partial') + cnt('rejected'))}${chip('none', 'ยังไม่แจ้ง/ร่าง', cnt('none') + cnt('draft'))}${(n => n ? chip('req', '✋ ขอแก้ไข', n) : '')(all.filter(isReq).length)}
          <input class="fe-in fe-q" data-fe-q placeholder="ค้นหาชื่อ โรงเรียน จังหวัด หรือลำดับ" value="${E(st.q)}"></div>
        <div class="fe-tw"><table class="fe-t fe-list"><thead><tr><th>ลำดับ</th><th>นักเรียน</th><th>ชั้น</th><th class="n">ยอดที่แจ้ง</th><th class="n">เบิกได้</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>${list.map(r => `<tr class="fe-row" data-fe-review="${r.i}" tabindex="0" role="button" aria-label="เปิดค่าเทอมของ ${E(r.s.name || '')}">
            <td>${E(r.s.no ?? '-')}</td><td><div class="fe-who">${avatar(r.s)}<div><b>${E(r.s.name || '-')}</b><div class="fe-dim">${E(r.s.school_m1 || '')}${r.s.province ? ' · ' + E(r.s.province) : ''}</div></div></div></td>
            <td>${E(gradeFor(r.s, t))}</td><td class="n">${r.f && r.req ? baht(r.req) : '–'}</td><td class="n fe-ap">${['full', 'partial', 'rejected'].includes(r.k) ? baht(r.ap) : '–'}</td>
            <td><span class="fe-chip ${ST[r.k][1]}">${ST[r.k][0]}</span>${r.f && r.f.editRequest && revOf(r.s, t) && revOf(r.s, t).reviewedAt ? '<span class="fe-chip fe-req">✋ ขอแก้ไข</span>' : ''}${r.f && r.f.submittedAt ? `<div class="fe-dim">แจ้ง ${E(fmtD(r.f.submittedAt))}</div>` : ''}</td>
            <td class="act"><span class="fe-go ${r.k === 'pending' ? 'hot' : ''}">${r.k === 'pending' ? 'ตรวจ/กำหนดยอด' : r.f && itemsOf(r.f).length ? 'ดู/แก้ไข' : 'ดูข้อมูล'} ›</span></td></tr>`).join('')
            || '<tr><td colspan="7" class="fe-empty">ไม่มีรายการ</td></tr>'}</tbody></table></div>
      </section>
    </div>`;
  }
  const avatar = (s, big) => (typeof photoEl === 'function') ? `<span class="fe-av${big ? ' big' : ''}">${photoEl(s, 'fe-av-img', 'fe-av-fb')}</span>` : '';
  /* ---------- หน้ารายละเอียด/ตรวจ (เต็มหน้า) ---------- */
  function detailHtml(s, idx, t, all) {
    const f = feeOf(s, t) || {}, r = revOf(s, t) || {}, items = itemsOf(f), k = status(s, t);
    const reviewed = !!r.reviewedAt;
    // ยังไม่ตรวจ → เติมยอดเบิก = ยอดที่แจ้ง ให้ปรับลดเฉพาะรายการที่ต้องการ
    const ap = id => (r.approved && r.approved[id] != null) ? r.approved[id] : (reviewed ? '' : (items.find(x => x.id === id) || {}).amount || '');
    const files = Array.isArray(f.files) ? f.files : [];
    const pos = all.findIndex(x => x.i === idx), prev = all[pos - 1], next = all[pos + 1];
    const apNow = items.reduce((a, it) => a + num(ap(it.id)), 0), req = requested(f);
    const bank = f.bank || prevBank(s, t);
    const doc = (x, i) => {
      const isImg = /^image\//.test(x.type || '') || /\.(jpe?g|png|gif|webp|heic)$/i.test(x.name || '');
      const isPdf = /pdf/i.test(x.type || '') || /\.pdf$/i.test(x.name || '');
      return `<figure class="fe-doc ${x.kind === 'bank' ? 'bank' : ''}" data-fe-prev="${i}" data-kind="${isImg ? 'img' : isPdf ? 'pdf' : 'file'}">
        <div class="fe-doc-view"><div class="fe-doc-load">${isImg ? '🖼' : isPdf ? '📄' : '📎'}<span>กำลังโหลดตัวอย่าง…</span></div></div>
        <figcaption><span class="fe-doc-tag">${x.kind === 'bank' ? '🏦 สมุดบัญชี' : '🧾 ใบแจ้ง/ใบเสร็จ'}</span><span class="fe-doc-name" title="${E(x.name)}">${E(x.name)}</span>
          <button type="button" class="fe-link" data-fe-rview="${i}">เปิดเต็ม ↗</button>
          <button type="button" class="fe-link del" data-fe-rdel="${i}" title="ลบไฟล์นี้" aria-label="ลบไฟล์ ${E(x.name)}">🗑 ลบ</button></figcaption></figure>`;
    };
    return `<div class="fe-wrap fe-detail" data-fe-ridx="${idx}">
      <nav class="fe-dnav"><button type="button" class="fe-back" data-fe-close>← กลับรายชื่อ</button>
        <span class="fe-dim">${pos + 1} / ${all.length} คน · ${E(tlabel(t))}</span>
        <span class="fe-dnav-r"><button type="button" class="btn btn-sm btn-outline" ${prev ? `data-fe-review="${prev.i}"` : 'disabled'}>‹ ก่อนหน้า</button><button type="button" class="btn btn-sm btn-outline" ${next ? `data-fe-review="${next.i}"` : 'disabled'}>ถัดไป ›</button></span></nav>
      <section class="fe-dhero">
        ${avatar(s, true)}
        <div class="fe-dhero-t"><span class="fe-chip ${ST[k][1]}">${ST[k][0]}</span><h2>${E(s.name || '-')}</h2>
          <p>ลำดับ ${E(s.no ?? '-')} · ${E(s.school_m1 || '-')}${s.province ? ' · จ.' + E(s.province) : ''}</p>
          <p class="fe-dim">${E(gradeFor(s, t))} · ${E(tlabel(t))}${f.submittedAt ? ' · โรงเรียนแจ้งเมื่อ ' + E(fmtD(f.submittedAt)) : ''}${reviewed ? ' · ตรวจเมื่อ ' + E(fmtD(r.reviewedAt)) + (r.reviewedBy ? ' โดย ' + E(r.reviewedBy) : '') : ''}</p></div>
        <div class="fe-dstats"><div><span>ยอดที่แจ้ง</span><b>${baht(req)}</b></div><div class="ok"><span>เบิกได้</span><b id="fe-aptotal2">${baht(apNow)}</b></div><div class="${req - apNow > 0.001 ? 'cut' : ''}"><span>ส่วนต่าง</span><b id="fe-apdiff">${baht(req - apNow)}</b></div></div>
      </section>
      ${f.editRequest && reviewed ? `<section class="fe-reqbar"><div>✋ <b>โรงเรียนขอแก้ไขข้อมูล</b> เมื่อ ${E(fmtD(f.editRequest.at))}${f.editRequest.reason ? ` — “${E(f.editRequest.reason)}”` : ''}</div>
        <button type="button" class="btn btn-primary" data-fe-unlock>↩ เปิดให้โรงเรียนแก้ไข</button></section>` : ''}
      ${!items.length ? `<section class="fe-card fe-emptyc"><div class="fe-empty-ic">🗂</div><h3>${k === 'draft' ? 'โรงเรียนบันทึกร่างไว้ แต่ยังไม่ได้ส่ง' : 'โรงเรียนยังไม่ได้แจ้งค่าเทอม'}</h3><p class="fe-dim">${E(tlabel(t))} · เมื่อโรงเรียนกด "ส่งข้อมูลให้มูลนิธิฯ" รายการจะแสดงที่นี่</p></section>` : `
      <div class="fe-dgrid">
        <section class="fe-card">
          <h3 class="fe-h">💰 รายการค่าเทอมและยอดเบิก</h3>
          <div class="fe-tw"><table class="fe-t"><thead><tr><th>รายการที่โรงเรียนแจ้ง</th><th class="n">แจ้ง (บาท)</th><th class="n">เบิกได้ (บาท)</th></tr></thead>
            <tbody>${items.map(it => `<tr><td>${E(it.label)}${it.note ? `<div class="fe-dim">📝 ${E(it.note)}</div>` : ''}</td><td class="n">${baht(it.amount)}</td>
              <td class="n"><input class="fe-in fe-amt ${reviewed || ap(it.id) === '' ? '' : 'pre'}" inputmode="decimal" data-fe-ap="${E(it.id)}" data-req="${num(it.amount)}" value="${E(ap(it.id))}" placeholder="0"></td></tr>`).join('')}</tbody>
            <tfoot><tr><th>รวม</th><th class="n">${baht(req)}</th><th class="n fe-ap" id="fe-aptotal">${baht(apNow)}</th></tr></tfoot></table></div>
          ${reviewed ? '' : `<p class="fe-dim">ระบบเติมยอดเบิกเท่ายอดที่แจ้งไว้ให้ — แก้เฉพาะรายการที่ต้องปรับลด แล้วกด "บันทึกยอดเบิก"</p>`}
          <div class="fe-quick"><button type="button" class="btn btn-sm btn-outline" data-fe-fill>เบิกได้เต็มจำนวนทุกรายการ</button><button type="button" class="btn btn-sm btn-outline" data-fe-clear>ล้างยอดเบิก</button></div>
          ${f.note ? `<div class="fe-note">💬 หมายเหตุจากโรงเรียน: ${E(f.note)}</div>` : ''}
          <div class="fe-two">
            <label class="fe-f"><span>ระดับชั้น (ในเอกสารค่าเทอมนี้)</span><select class="fe-in" data-fe-grade><option value="">${E(gradeFor(s, t))} (อัตโนมัติ)</option>${GRADES.map(g => `<option ${r.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
            <label class="fe-f"><span>หมายเหตุถึงโรงเรียน (เช่น เหตุผลที่ปรับลด)</span><textarea class="fe-in" rows="2" data-fe-rnote>${E(r.note || '')}</textarea></label>
          </div>
          <p class="fe-dim">💡 บันทึกแล้ว ยอดเบิกได้รวมจะเป็น <b>รายการเบิกจ่าย ${E(tlabel(t))} ส่วนที่ 1 (ค่าบำรุงการศึกษา)</b> ของนักเรียนอัตโนมัติ</p>
          <div class="fe-acts">
            ${reviewed ? `<button type="button" class="btn btn-outline" data-fe-unlock title="ยกเลิกผลการตรวจ ให้โรงเรียนแก้ไขข้อมูลได้อีกครั้ง">↩ เปิดให้โรงเรียนแก้ไข</button>` : ''}
            <button type="button" class="btn btn-outline" data-fe-slip>🖨 ใบสรุป (PDF)</button>
            <button type="button" class="btn btn-danger" data-fe-reject>ไม่อนุมัติ</button>
            <button type="button" class="btn btn-primary" data-fe-approve>✅ บันทึกยอดเบิก</button>
          </div>
        </section>
        <aside class="fe-side">
          <section class="fe-bankcard ${bank && bank.accNo ? '' : 'empty'}">
            <div class="fe-bankcard-top"><span>🏦 บัญชีสำหรับโอนเงิน</span>${bank && bank.accNo && !f.bank ? '<small>(จากภาคก่อน)</small>' : ''}</div>
            ${bank && bank.accNo ? `<div class="fe-bankcard-no">${E(bank.accNo)}</div><div class="fe-bankcard-name">${E(bank.accName || '-')}</div>
              <div class="fe-bankcard-b">${E(bank.bankName || '-')}${bank.branch ? ' · สาขา' + E(bank.branch) : ''}</div>
              <button type="button" class="fe-copy" data-fe-copy="${E(bank.accNo)}">คัดลอกเลขบัญชี</button>` : '<div class="fe-bankcard-name">⚠️ โรงเรียนยังไม่ได้กรอกบัญชีธนาคาร</div>'}
          </section>
          <section class="fe-card">
            <h3 class="fe-h">📎 เอกสารแนบ <small class="fe-dim">${files.length} ไฟล์</small></h3>
            ${files.length ? `<div class="fe-docs">${files.map(doc).join('')}</div>` : '<p class="fe-dim">ไม่มีไฟล์แนบ</p>'}
          </section>
        </aside>
      </div>`}
    </div>`;
  }
  /* ตัวอย่างเอกสาร: โหลดไฟล์จาก Drive มาแสดงในหน้า (รูป → ภาพ · PDF → ตัวอย่างหน้าแรก) */
  const blobCache = new Map();
  async function loadPreviews() {
    const box = document.querySelector('.fe-detail'); if (!box) return;
    const s = DB.students[+box.dataset.feRidx], t = st.term || roundTerm(), files = (feeOf(s, t) || {}).files || [];
    for (const el of box.querySelectorAll('[data-fe-prev]')) {
      const x = files[+el.dataset.fePrev], view = el.querySelector('.fe-doc-view'); if (!x || !view) continue;
      const fail = msg => { view.innerHTML = `<div class="fe-doc-load">⚠️<span>${E(msg)}</span></div>`; };
      if (!window.DriveStore || !DriveStore.ready()) { fail('ดูตัวอย่างไม่ได้ — ' + (window.DriveStore ? DriveStore.why() : 'ระบบไฟล์ยังไม่พร้อม')); continue; }
      try {
        let u = blobCache.get(x.fileId);
        if (!u) { const g = await DriveStore.get(s, x.fileId); u = { url: URL.createObjectURL(g.blob), type: g.type || x.type || '' }; blobCache.set(x.fileId, u); }
        if (!el.isConnected) return;
        if (/^image\//.test(u.type)) view.innerHTML = `<img src="${u.url}" alt="${E(x.name)}" data-fe-zoom="${u.url}" title="คลิกเพื่อขยาย">`;
        else if (/pdf/.test(u.type)) view.innerHTML = `<iframe src="${u.url}#toolbar=0&view=FitH" title="${E(x.name)}" loading="lazy"></iframe>`;
        else view.innerHTML = `<div class="fe-doc-load">📎<span>ไฟล์ ${E(u.type || '')} — กด "เปิดเต็ม"</span></div>`;
      } catch (e) { fail('โหลดไม่สำเร็จ: ' + (e.message || e)); }
    }
  }
  function askReason() {
    return new Promise(res => {
      const o = document.createElement('div'); o.className = 'fe-ask';
      o.innerHTML = `<div class="fe-ask-box" role="dialog" aria-modal="true"><h3>✋ ขอแก้ไขข้อมูลค่าเทอม</h3>
        <p class="fe-dim">บอกมูลนิธิฯ ว่าต้องการแก้ไขอะไร (เช่น จำนวนเงินค่าหนังสือผิด เปลี่ยนบัญชีธนาคาร)</p>
        <textarea class="fe-in" rows="3" maxlength="300" placeholder="รายละเอียดที่ต้องการแก้ไข"></textarea>
        <div class="fe-acts"><button type="button" class="btn btn-outline" data-x>ยกเลิก</button><button type="button" class="btn btn-primary" data-ok>ส่งคำขอ</button></div></div>`;
      const done = v => { o.remove(); res(v); };
      o.addEventListener('click', e => { if (e.target === o || e.target.hasAttribute('data-x')) done(null); else if (e.target.hasAttribute('data-ok')) done(o.querySelector('textarea').value.trim()); });
      document.body.appendChild(o); setTimeout(() => o.querySelector('textarea').focus(), 30);
    });
  }
  function zoom(src) {
    const o = document.createElement('div'); o.className = 'fe-lb'; o.innerHTML = `<img src="${src}" alt=""><button type="button" aria-label="ปิด">✕</button>`;
    const close = () => { o.remove(); document.removeEventListener('keydown', esc); }; const esc = e => { if (e.key === 'Escape') close(); };
    o.addEventListener('click', close); document.addEventListener('keydown', esc); document.body.appendChild(o);
  }
  function readReview(box) {
    const approved = {}; let n = 0;
    box.querySelectorAll('[data-fe-ap]').forEach(i => { const v = i.value.trim(); if (v !== '') { approved[i.getAttribute('data-fe-ap')] = String(num(v)); n += num(v); } });
    return { approved, total: n, note: (box.querySelector('[data-fe-rnote]') || {}).value || '', grade: (box.querySelector('[data-fe-grade]') || {}).value || '' };
  }

  /* ---------- เหตุการณ์ ---------- */
  async function onClick(e) {
    const t0 = e.target.closest('[data-fe-open],[data-fe-list],[data-fe-addrow],[data-fe-del],[data-fe-save],[data-fe-submit],[data-fe-view],[data-fe-rmfile],[data-fe-filter],[data-fe-review],[data-fe-close],[data-fe-fill],[data-fe-clear],[data-fe-approve],[data-fe-reject],[data-fe-unlock],[data-fe-slip],[data-fe-xlsx],[data-fe-pdf],[data-fe-rview],[data-fe-rsave],[data-fe-zoom],[data-fe-copy],[data-fe-rdel],[data-fe-askedit]');
    if (!t0) return;
    const d = t0.dataset, t = isStaff() ? (st.term || roundTerm()) : roundTerm();
    if (d.feOpen != null) { st.idx = +d.feOpen; render(); return; }
    if (d.feList != null) { st.idx = null; render(); return; }
    if (d.feFilter) { st.filter = d.feFilter; render(); return; }
    if (d.feReview != null) { if (e.target.closest('.fe-av') && e.target.closest('img')) return; st.review = +d.feReview; render(); try { page().scrollIntoView({ block: 'start' }); window.scrollTo({ top: 0 }); } catch (er) {} return; }
    if (d.feZoom) { zoom(d.feZoom); return; }
    if (d.feCopy) { try { await navigator.clipboard.writeText(d.feCopy); t0.textContent = '✓ คัดลอกแล้ว'; setTimeout(() => { t0.textContent = 'คัดลอกเลขบัญชี'; }, 1500); } catch (er) {} return; }
    if (d.feClose != null) { st.review = null; render(); return; }
    if (d.feXlsx != null) { exportXlsx(t); return; }
    if (d.feRsave != null) {
      const pg = t0.closest('.fe-round');
      const r = { term: pg.querySelector('[data-fe-rterm]').value, grade: pg.querySelector('[data-fe-rgrade]').value, open: pg.querySelector('[data-fe-ropen]').value === '1' };
      if (!(await uiAsk(`ให้โรงเรียนแจ้งค่าเทอมของ ${tlabel(r.term)}${r.grade ? ' ระดับชั้น ' + r.grade : ''} · ${r.open ? 'เปิดรับ' : 'ปิดรับ'}การแจ้ง?`, { title: 'บันทึกรอบแจ้งค่าเทอม', confirmText: 'บันทึก' }))) return;
      try { await saveRound(r); st.term = ''; render(); } catch (er) { UIDialog.alert({ tone: 'danger', title: 'บันทึกไม่สำเร็จ', message: er.message || String(er) }); }
      return;
    }
    if (d.fePdf != null) { printReport(t); return; }
    const card = t0.closest('.fe-card[data-fe-idx]');
    if (card) {
      const idx = +card.dataset.feIdx, s = DB.students[idx];
      if (d.feAskedit != null) {
        const reason = await askReason();
        if (reason == null) return;
        s.fees[t].editRequest = { at: new Date().toISOString(), by: who(), reason: reason.slice(0, 300) };
        try { await persist(); } catch (er) { UIDialog.alert({ tone: 'danger', title: 'ส่งไม่สำเร็จ', message: er.message || String(er) }); return; }
        render(); UIDialog.alert({ tone: 'success', title: 'ส่งคำขอแล้ว', message: 'มูลนิธิฯ จะเห็นคำขอในหน้าตรวจ และเปิดให้แก้ไขข้อมูล' }); return;
      }
      if (d.feAddrow != null) { collect(card, s, t); s.fees[t].items.push({ id: 'c' + Date.now().toString(36), label: '', amount: '', note: '', custom: true }); render(); return; }
      if (d.feDel) { collect(card, s, t); s.fees[t].items = s.fees[t].items.filter(it => it.id !== d.feDel); render(); return; }
      if (d.feView != null) { const x = (feeOf(s, t).files || [])[+d.feView]; if (x && window.DriveStore) DriveStore.open(s, x.fileId, x.name); return; }
      if (d.feRmfile != null) {
        const x = (feeOf(s, t).files || [])[+d.feRmfile]; if (!x) return;
        if (!(await uiAsk(`ลบไฟล์ ${x.name}?`, { tone: 'danger', title: 'ลบไฟล์แนบ', confirmText: 'ลบ' }))) return;
        if (!((revOf(s, t) || {}).reviewedAt)) collect(card, s, t); s.fees[t].files.splice(+d.feRmfile, 1);
        try { if (!x.fromTerm && window.DriveStore && DriveStore.ready()) await DriveStore.remove(s, x.fileId); } catch (er) {}
        await persist(); render(); return;
      }
      if (d.feSave != null || d.feSubmit != null) {
        const f = collect(card, s, t);
        if (d.feSubmit != null) {
          if (!itemsOf(f).length || requested(f) <= 0) { UIDialog.alert({ tone: 'warning', title: 'ยังไม่มีจำนวนเงิน', message: 'กรอกจำนวนเงินอย่างน้อย 1 รายการก่อนส่ง' }); return; }
          const bad = f.items.filter(it => it.custom && num(it.amount) > 0 && !it.label);
          if (bad.length) { UIDialog.alert({ tone: 'warning', title: 'ระบุชื่อรายการ', message: 'รายการที่เพิ่มเองต้องระบุชื่อรายการ' }); return; }
          const b = f.bank || {};
          if (!b.bankName || !b.accName || !b.accNo) { UIDialog.alert({ tone: 'warning', title: 'กรอกบัญชีธนาคาร', message: 'กรอกธนาคาร ชื่อบัญชี และเลขที่บัญชีของสถานศึกษา สำหรับโอนเงินค่าเทอม' }); return; }
          if (!/^\d[\d-]{8,18}\d$/.test(b.accNo.replace(/\s/g, ''))) { UIDialog.alert({ tone: 'warning', title: 'เลขที่บัญชีไม่ถูกต้อง', message: 'เลขที่บัญชีควรเป็นตัวเลข 10–12 หลัก' }); return; }
          if (!f.files.some(x => x.kind === 'bank')) {
            if (window.DriveStore && DriveStore.ready()) { UIDialog.alert({ tone: 'warning', title: 'แนบสำเนาสมุดบัญชี', message: 'แนบสำเนาหน้าสมุดบัญชีธนาคารของสถานศึกษา เพื่อใช้เป็นเอกสารประกอบการโอนเงิน' }); return; }
            if (!(await uiAsk('ยังแนบสำเนาสมุดบัญชีไม่ได้ (ระบบแนบไฟล์ไม่พร้อม) — ส่งข้อมูลไปก่อน แล้วส่งสำเนาให้มูลนิธิฯ ภายหลัง?', { tone: 'warning', title: 'ยังไม่มีสำเนาสมุดบัญชี', confirmText: 'ส่งไปก่อน' }))) return;
          }
          if (!(await uiAsk(`ส่งค่าเทอม ${tlabel(t)} ของ ${s.name} รวม ${baht(requested(f))} บาท ให้มูลนิธิฯ ตรวจ?`, { title: 'ส่งข้อมูลค่าเทอม', confirmText: 'ส่งข้อมูล' }))) return;
          f.submittedAt = new Date().toISOString();
        }
        const close = UIDialog.busy ? UIDialog.busy('กำลังบันทึก…') : () => {};
        try { await persist(); close(); } catch (er) { close(); UIDialog.alert({ tone: 'danger', title: 'บันทึกไม่สำเร็จ', message: er.message || String(er) }); return; }
        render();
        if (d.feSubmit != null) UIDialog.alert({ tone: 'success', title: 'ส่งข้อมูลแล้ว', message: 'มูลนิธิฯ จะตรวจและแจ้งยอดที่เบิกได้ในหน้านี้' });
        return;
      }
    }
    const box = t0.closest('[data-fe-ridx]');
    if (box) {
      const idx = +box.dataset.feRidx, s = DB.students[idx];
      if (d.feRview != null) { const x = (feeOf(s, t).files || [])[+d.feRview]; if (x && window.DriveStore) DriveStore.open(s, x.fileId, x.name); return; }
      if (d.feRdel != null) {
        const f = feeOf(s, t), x = (f && f.files || [])[+d.feRdel]; if (!x) return;
        const kind = x.kind === 'bank' ? 'สำเนาสมุดบัญชี' : 'ใบแจ้งหนี้/ใบเสร็จ';
        if (!(await uiAsk(`ลบ${kind} "${x.name}" ของ ${s.name}?${x.fromTerm ? '\n(ไฟล์นี้ใช้ต่อจากภาคเรียนก่อน — ลบออกจากภาคเรียนนี้เท่านั้น)' : '\nไฟล์จะถูกลบออกจากที่เก็บไฟล์ด้วย และกู้คืนไม่ได้'}`, { tone: 'danger', title: 'ลบเอกสารแนบ', confirmText: 'ลบไฟล์' }))) return;
        const close = UIDialog.busy ? UIDialog.busy('กำลังลบ…') : () => {};
        try {
          const shared = Object.keys(s.fees || {}).some(k => k !== t && ((s.fees[k] || {}).files || []).some(y => y.fileId === x.fileId));
          if (!x.fromTerm && !shared && window.DriveStore && DriveStore.ready()) { try { await DriveStore.remove(s, x.fileId); } catch (er) { console.warn('drive remove', er); } }
          f.files.splice(+d.feRdel, 1);
          const u = blobCache.get(x.fileId); if (u) { URL.revokeObjectURL(u.url); blobCache.delete(x.fileId); }
          await persist(); close();
        } catch (er) { close(); UIDialog.alert({ tone: 'danger', title: 'ลบไม่สำเร็จ', message: er.message || String(er) }); return; }
        render(); return;
      }
      if (d.feFill != null) { box.querySelectorAll('[data-fe-ap]').forEach(i => { i.value = i.dataset.req; }); apTotal(box); return; }
      if (d.feClear != null) { box.querySelectorAll('[data-fe-ap]').forEach(i => { i.value = ''; }); apTotal(box); return; }
      if (d.feSlip != null) { printSlip(s, t, readReview(box)); return; }
      if (d.feUnlock != null) {
        if (!(await uiAsk('ยกเลิกผลการตรวจ และเปิดให้โรงเรียนแก้ไขข้อมูลค่าเทอมได้อีกครั้ง?', { title: 'เปิดให้แก้ไข', confirmText: 'เปิดให้แก้ไข' }))) return;
        const r = s.feeReview && s.feeReview[t]; if (r) { delete r.reviewedAt; delete r.rejected; }
        if (s.fees && s.fees[t]) delete s.fees[t].editRequest;
        await persist(); render(); return;
      }
      if (d.feApprove != null || d.feReject != null) {
        const rv = readReview(box), f = feeOf(s, t), rej = d.feReject != null;
        if (!rej) {
          const missing = itemsOf(f).filter(it => !(it.id in rv.approved));
          if (missing.length && !(await uiAsk(`ยังไม่กรอกยอดเบิก ${missing.length} รายการ — ถือว่าเบิกได้ 0 บาทสำหรับรายการเหล่านั้น?`, { tone: 'warning', title: 'ยอดเบิกไม่ครบ', confirmText: 'บันทึกต่อ' }))) return;
          const over = itemsOf(f).filter(it => num(rv.approved[it.id]) > num(it.amount));
          if (over.length && !(await uiAsk(`ยอดเบิกบางรายการสูงกว่ายอดที่โรงเรียนแจ้ง (${over.map(x => x.label).join(', ')}) — ยืนยัน?`, { tone: 'warning', title: 'ยอดเบิกสูงกว่ายอดที่แจ้ง', confirmText: 'ยืนยัน' }))) return;
        } else if (!(await uiAsk(`ไม่อนุมัติค่าเทอมของ ${s.name}? (ใส่เหตุผลในหมายเหตุถึงโรงเรียน)`, { tone: 'danger', title: 'ไม่อนุมัติ', confirmText: 'ไม่อนุมัติ' }))) return;
        // v73: ยอดเบิกได้ → รายการเบิกจ่ายของนักเรียน (ส่วนที่ 1) ของภาคเรียนนี้
        const newP1 = rej ? 0 : itemsOf(f).reduce((a, it) => a + num(rv.approved[it.id]), 0);
        const ex = (s.semPayments || []).find(p => p && p.term === t);
        if (ex && num(ex.p1) > 0 && !ex.feeSync && !/^ค่าเทอม/.test(ex.item1 || '') && Math.abs(num(ex.p1) - newP1) > 0.001
          && !(await uiAsk(`ภาคเรียน ${tlabel(t)} มีการเบิกจ่ายส่วนที่ 1 บันทึกไว้แล้ว ${baht(ex.p1)} บาท — เปลี่ยนเป็นยอดเบิกค่าเทอม ${baht(newP1)} บาท?`,
            { tone: 'warning', title: 'แทนยอดเบิกจ่ายส่วนที่ 1', confirmText: 'แทนยอดเดิม' }))) return;
        s.feeReview = s.feeReview || {};
        s.feeReview[t] = { approved: rej ? {} : rv.approved, rejected: rej || undefined, note: rv.note.trim(), reviewedAt: new Date().toISOString(), reviewedBy: who() };
        if (rv.grade) s.feeReview[t].grade = rv.grade;
        if (!rej) delete s.feeReview[t].rejected;
        const pay = syncPayment(s, t);
        const close = UIDialog.busy ? UIDialog.busy('กำลังบันทึก…') : () => {};
        try { await persist(); close(); } catch (er) { close(); UIDialog.alert({ tone: 'danger', title: 'บันทึกไม่สำเร็จ', message: er.message || String(er) }); return; }
        try { if (typeof saveStudentToSheet === 'function') saveStudentToSheet(idx); } catch (er) { console.warn(er); }
        try { if (typeof renderDashboard === 'function') renderDashboard(); if (typeof populateTermFilter === 'function') populateTermFilter(); } catch (er) {}
        st.review = null; render();
        if (pay) UIDialog.alert({ tone: 'success', title: 'บันทึกยอดเบิกแล้ว', message: `บันทึกเป็นรายการเบิกจ่ายภาคเรียน ${tlabel(t)} ส่วนที่ 1 (ค่าบำรุงการศึกษา) ${baht(pay.p1)} บาท ในหน้าข้อมูลนักเรียนแล้ว` });
      }
    }
  }
  /** v73: ยอดเบิกได้ของภาคเรียน t → s.semPayments[term=t].p1 (ส่วนที่ 1) · ส่วนที่ 2 คงเดิม */
  function syncPayment(s, t) {
    const r = revOf(s, t), f = feeOf(s, t); if (!r || !r.reviewedAt || !f) return null;
    const total = approvedTotal(s, t);
    const detail = r.rejected ? 'ไม่อนุมัติ' : itemsOf(f).filter(it => num((r.approved || {})[it.id]) > 0)
      .map(it => `${it.label.split(' / ')[0]} ${baht((r.approved || {})[it.id])}`).join(' · ');
    s.semPayments = Array.isArray(s.semPayments) ? s.semPayments : [];
    let p = s.semPayments.find(x => x && x.term === t);
    if (!p) {
      p = { term: t, p1: 0, p2: 0, item1: 'ค่าเงินบำรุงการศึกษา', item2: 'ค่าใช้จ่ายในการเรียน' };
      s.semPayments.push(p);
      try { s.semPayments.sort((a, b) => Term.cmp(a.term, b.term)); } catch (e) {}
    }
    p.p1 = total;
    p.item1 = 'ค่าเทอม' + (detail ? ` (${detail})` : '');
    p.feeSync = true; p.feeSyncedAt = new Date().toISOString();
    return p;
  }
  function apTotal(box) {
    let n = 0, q = 0; box.querySelectorAll('[data-fe-ap]').forEach(i => { n += num(i.value); q += num(i.dataset.req); i.classList.remove('pre'); });
    const set = (id, v) => { const el = box.querySelector('#' + id); if (el) el.textContent = baht(v); };
    set('fe-aptotal', n); set('fe-aptotal2', n); set('fe-apdiff', q - n);
    const dd = box.querySelector('#fe-apdiff'); if (dd) dd.parentElement.classList.toggle('cut', q - n > 0.001);
  }
  function onInput(e) {
    if (e.target.matches('[data-fe-amt]') && e.target.closest('.fe-card[data-fe-idx]')) liveTotal(e.target.closest('.fe-card'));
    if (e.target.matches('[data-fe-ap]')) apTotal(e.target.closest('[data-fe-ridx]'));
    if (e.target.matches('[data-fe-q]')) { st.q = e.target.value; const pos = e.target.selectionStart; render(); const q = document.querySelector('[data-fe-q]'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }
  }
  async function onChange(e) {
    if (e.target.matches('[data-fe-term]')) { st.term = e.target.value === roundTerm() ? '' : e.target.value; st.review = null; render(); return; }
    if (e.target.matches('[data-fe-file]')) {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const card = e.target.closest('.fe-card[data-fe-idx]'), idx = +card.dataset.feIdx, s = DB.students[idx], t = roundTerm();
      const kind = e.target.getAttribute('data-fe-file') === 'bank' ? 'bank' : 'invoice';
      if (file.size > 10 * 1024 * 1024) { UIDialog.alert({ tone: 'warning', title: 'ไฟล์ใหญ่เกินไป', message: 'ไฟล์ละไม่เกิน 10 MB' }); return; }
      if (!window.DriveStore || !DriveStore.ready()) { UIDialog.alert({ tone: 'warning', title: 'แนบไฟล์ไม่ได้', message: window.DriveStore ? DriveStore.why() : 'ระบบแนบไฟล์ยังไม่พร้อม' }); return; }
      const rv0 = revOf(s, t), f = (rv0 && rv0.reviewedAt) ? (s.fees[t] = s.fees[t] || {}) : collect(card, s, t);
      const close = UIDialog.busy ? UIDialog.busy('กำลังอัปโหลดไฟล์…', file.name) : () => {};
      try {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        if (kind === 'bank') f.files = (f.files || []).filter(x => !(x.kind === 'bank' && x.fromTerm));   // แทนไฟล์ที่ยกมาจากภาคก่อน
        const r = await DriveStore.upload(s, { term: t, kind: kind === 'bank' ? 'feeBank' : 'fee', blob: file, mimeType: file.type, fileName: `${kind === 'bank' ? 'สมุดบัญชีโรงเรียน' : 'ค่าเทอม'}-${String(t).replace('/', '-')}.${ext}`, originalName: file.name });
        f.files = (Array.isArray(f.files) ? f.files : []).concat({ kind, name: file.name, fileId: r.fileId, url: r.url, type: file.type, size: file.size, uploadedAt: new Date().toISOString(), by: who() });
        await persist(); close(); render();
      } catch (er) { close(); UIDialog.alert({ tone: 'danger', title: 'อัปโหลดไม่สำเร็จ', message: er.message || String(er) }); }
    }
  }

  /* ════════════ ส่งออก ════════════ */
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      sc.onload = () => window.XLSX ? res(window.XLSX) : rej(new Error('โหลดตัวสร้าง Excel ไม่สำเร็จ'));
      sc.onerror = () => rej(new Error('โหลดตัวสร้าง Excel ไม่สำเร็จ (ตรวจอินเทอร์เน็ต)'));
      document.head.appendChild(sc);
    });
  }
  function dataFor(t) {
    const all = rows(t).filter(r => r.f && itemsOf(r.f).length);
    const summary = all.map(r => ({
      'ลำดับ': num(r.s.no) || r.s.no || '', 'ชื่อ-สกุล': r.s.name || '', 'โรงเรียน': r.s.school_m1 || '', 'จังหวัด': r.s.province || '', 'ระดับชั้น': gradeFor(r.s, t),
      'ยอดที่แจ้ง (บาท)': r.req, 'ยอดเบิกได้ (บาท)': ['full', 'partial', 'rejected'].includes(r.k) ? r.ap : '', 'ส่วนต่าง (บาท)': ['full', 'partial', 'rejected'].includes(r.k) ? r.req - r.ap : '',
      'ธนาคาร': (r.f.bank || {}).bankName || '', 'สาขา': (r.f.bank || {}).branch || '', 'ชื่อบัญชี': (r.f.bank || {}).accName || '', 'เลขที่บัญชี': (r.f.bank || {}).accNo || '',
      'สถานะ': ST[r.k][0], 'วันที่แจ้ง': fmtD(r.f.submittedAt), 'วันที่ตรวจ': fmtD((revOf(r.s, t) || {}).reviewedAt), 'หมายเหตุโรงเรียน': r.f.note || '', 'หมายเหตุมูลนิธิฯ': (revOf(r.s, t) || {}).note || '' }));
    const items = [];
    all.forEach(r => { const rv = revOf(r.s, t); itemsOf(r.f).forEach(it => items.push({
      'ลำดับ': num(r.s.no) || r.s.no || '', 'ชื่อ-สกุล': r.s.name || '', 'โรงเรียน': r.s.school_m1 || '', 'รายการ': it.label, 'ยอดที่แจ้ง (บาท)': num(it.amount),
      'ยอดเบิกได้ (บาท)': rv && rv.reviewedAt ? (rv.rejected ? 0 : num((rv.approved || {})[it.id])) : '', 'หมายเหตุ': it.note || '' })); });
    const cats = {};
    items.forEach(x => { const k = x['รายการ']; cats[k] = cats[k] || { 'รายการ': k, 'จำนวนนักเรียน': 0, 'ยอดที่แจ้งรวม (บาท)': 0, 'ยอดเบิกได้รวม (บาท)': 0 };
      cats[k]['จำนวนนักเรียน']++; cats[k]['ยอดที่แจ้งรวม (บาท)'] += x['ยอดที่แจ้ง (บาท)']; cats[k]['ยอดเบิกได้รวม (บาท)'] += num(x['ยอดเบิกได้ (บาท)']); });
    const byCat = Object.values(cats);
    return { all, summary, items, byCat };
  }
  async function exportXlsx(t) {
    const d = dataFor(t);
    if (!d.all.length) { UIDialog.alert({ tone: 'info', title: 'ยังไม่มีข้อมูล', message: `ยังไม่มีโรงเรียนแจ้งค่าเทอมใน${tlabel(t)}` }); return; }
    const close = UIDialog.busy ? UIDialog.busy('กำลังสร้างไฟล์ Excel…') : () => {};
    try {
      const X = await loadXlsx();
      const tot = (arr, cols) => { const o = {}; Object.keys(arr[0] || {}).forEach((k, i) => { o[k] = i === 0 ? 'รวม' : ''; }); cols.forEach(c => { o[c] = arr.reduce((a, r) => a + num(r[c]), 0); }); return o; };
      const wb = X.utils.book_new();
      const add = (arr, name, sumCols, widths) => {
        const ws = X.utils.json_to_sheet(arr.concat(arr.length ? [tot(arr, sumCols)] : []));
        ws['!cols'] = widths.map(w => ({ wch: w }));
        X.utils.book_append_sheet(wb, ws, name);
      };
      add(d.summary, 'สรุปรายคน', ['ยอดที่แจ้ง (บาท)', 'ยอดเบิกได้ (บาท)', 'ส่วนต่าง (บาท)'], [7, 26, 28, 14, 9, 15, 15, 14, 16, 18, 28, 16, 16, 12, 12, 26, 26]);
      add(d.items, 'แยกรายการ', ['ยอดที่แจ้ง (บาท)', 'ยอดเบิกได้ (บาท)'], [7, 26, 28, 36, 15, 15, 26]);
      add(d.byCat, 'สรุปตามหมวด', ['จำนวนนักเรียน', 'ยอดที่แจ้งรวม (บาท)', 'ยอดเบิกได้รวม (บาท)'], [36, 14, 20, 20]);
      X.writeFile(wb, `ค่าเทอมนักเรียนทุน_${String(t).replace('/', '-')}.xlsx`);
      close();
    } catch (e) {
      close();
      // สำรอง: ส่งออก CSV (เปิดใน Excel ได้) ถ้าโหลดตัวสร้าง .xlsx ไม่ได้
      if (await uiAsk((e.message || String(e)) + ' — ส่งออกเป็นไฟล์ CSV (เปิดด้วย Excel ได้) แทนไหม?', { tone: 'warning', title: 'สร้าง .xlsx ไม่สำเร็จ', confirmText: 'ส่งออก CSV' })) exportCsv(t, d);
    }
  }
  function exportCsv(t, d) {
    const esc = v => { const x = String(v ?? ''); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const toCsv = arr => arr.length ? [Object.keys(arr[0]).map(esc).join(',')].concat(arr.map(r => Object.values(r).map(esc).join(','))).join('\r\n') : '';
    const blob = new Blob(['\ufeff' + toCsv(d.summary) + '\r\n\r\n' + toCsv(d.items)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ค่าเทอมนักเรียนทุน_${String(t).replace('/', '-')}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  // โลโก้ฝังเป็น data URI (หน้าพิมพ์เป็น about:blank — ไม่ต้องพึ่งการโหลดไฟล์)
  let logos = null;
  async function getLogos() {
    if (logos) return logos;
    const toData = async u => { try { const b = await (await fetch(u)).blob(); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(''); fr.readAsDataURL(b); }); } catch (e) { return ''; } };
    const [a, b] = await Promise.all([toData('assets/mi/foundation-logo.png'), toData('assets/mi/dltv-logo.png')]);
    return (logos = { found: a, dltv: b });
  }
  async function printWin(title, body) {
    const w = window.open('', '_blank'); if (!w) { UIDialog.alert({ tone: 'warning', title: 'เปิดหน้าพิมพ์ไม่ได้', message: 'อนุญาตป๊อปอัปสำหรับเว็บนี้ แล้วลองอีกครั้ง' }); return; }
    w.document.write('<p style="font-family:sans-serif;padding:24px">กำลังเตรียมเอกสาร…</p>');
    const L = await getLogos();
    w.document.open();
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${E(title)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>@page{size:A4;margin:14mm}body{font-family:Sarabun,sans-serif;color:#111;font-size:13px;margin:0}
      h1{font-size:18px;margin:0 0 2px;text-align:center}.sub{text-align:center;color:#444;margin:0 0 12px}
      table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border:1px solid #999;padding:5px 7px;vertical-align:top}th{background:#eef1fb}
      td.n,th.n{text-align:right;white-space:nowrap}tfoot th{background:#f6f7fb}.kv{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 16px;margin:8px 0}
      .sig{display:flex;justify-content:space-around;margin-top:46px;text-align:center}.sig div{width:40%}.note{margin:8px 0;padding:6px 8px;border:1px dashed #aaa}
      .foot{margin-top:14px;color:#666;font-size:11px;text-align:right}@media print{.noprint{display:none}}
      .lh{display:flex;align-items:center;gap:12px;padding-bottom:8px;margin-bottom:10px;border-bottom:2px solid #2b3990}
      .lh img{height:64px;width:auto}.lh .lt{flex:1;text-align:center}.lh .lt b{display:block;font-size:15px;color:#2b3990}.lh .lt span{font-size:12px;color:#444}
      .lh img.r{height:46px}.bank{margin:8px 0;padding:6px 8px;border:1px solid #c9d2f0;background:#f6f8ff}</style></head>
      <body><div class="lh">${L.found ? `<img src="${L.found}" alt="">` : ''}
        <div class="lt"><b>มูลนิธิการศึกษาทางไกลผ่านดาวเทียม</b><span>ในพระบรมราชูปถัมภ์</span></div>
        ${L.dltv ? `<img class="r" src="${L.dltv}" alt="">` : ''}</div>${body}<p class="foot">พิมพ์เมื่อ ${new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      <script>Promise.all([document.fonts?document.fonts.ready:0].concat([...document.images].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r})))).then(()=>setTimeout(()=>print(),300))<\/script></body></html>`);
    w.document.close();
  }
  function printReport(t) {
    const d = dataFor(t);
    if (!d.all.length) { UIDialog.alert({ tone: 'info', title: 'ยังไม่มีข้อมูล', message: `ยังไม่มีโรงเรียนแจ้งค่าเทอมใน${tlabel(t)}` }); return; }
    const sum = (a, k) => a.reduce((x, r) => x + num(r[k]), 0);
    printWin('รายงานค่าเทอม ' + tlabel(t), `
      <h1>รายงานค่าเทอมนักเรียนทุนการศึกษา</h1><p class="sub">${E(tlabel(t))}${t === roundTerm() && round.grade ? ' · ระดับชั้น ' + E(round.grade) : ''}</p>
      <table><thead><tr><th>ลำดับ</th><th>ชื่อ-สกุล</th><th>โรงเรียน</th><th>ชั้น</th><th class="n">ยอดที่แจ้ง</th><th class="n">เบิกได้</th><th>สถานะ</th></tr></thead>
      <tbody>${d.summary.map(r => `<tr><td>${E(r['ลำดับ'])}</td><td>${E(r['ชื่อ-สกุล'])}</td><td>${E(r['โรงเรียน'])}</td><td>${E(r['ระดับชั้น'])}</td>
        <td class="n">${baht(r['ยอดที่แจ้ง (บาท)'])}</td><td class="n">${r['ยอดเบิกได้ (บาท)'] === '' ? '–' : baht(r['ยอดเบิกได้ (บาท)'])}</td><td>${E(r['สถานะ'])}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="4">รวม ${d.summary.length} คน</th><th class="n">${baht(sum(d.summary, 'ยอดที่แจ้ง (บาท)'))}</th><th class="n">${baht(sum(d.summary, 'ยอดเบิกได้ (บาท)'))}</th><th></th></tr></tfoot></table>
      <h1 style="font-size:15px;text-align:left;margin-top:16px">สรุปตามหมวดรายการ</h1>
      <table><thead><tr><th>รายการ</th><th class="n">จำนวนนักเรียน</th><th class="n">ยอดที่แจ้งรวม</th><th class="n">ยอดเบิกได้รวม</th></tr></thead>
      <tbody>${d.byCat.map(c => `<tr><td>${E(c['รายการ'])}</td><td class="n">${c['จำนวนนักเรียน']}</td><td class="n">${baht(c['ยอดที่แจ้งรวม (บาท)'])}</td><td class="n">${baht(c['ยอดเบิกได้รวม (บาท)'])}</td></tr>`).join('')}</tbody></table>
      <div class="sig"><div>ลงชื่อ ................................................<br>(................................................)<br>ผู้จัดทำ</div><div>ลงชื่อ ................................................<br>(................................................)<br>ผู้อนุมัติ</div></div>`);
  }
  function printSlip(s, t, rv) {
    const f = feeOf(s, t) || {}, items = itemsOf(f), saved = revOf(s, t) || {};
    const ap = it => rv ? rv.approved[it.id] : (saved.approved || {})[it.id];
    const apSum = items.reduce((a, it) => a + num(ap(it)), 0);
    printWin('ใบสรุปค่าเทอม ' + (s.name || ''), `
      <h1>ใบสรุปค่าเทอมนักเรียนทุนการศึกษา</h1><p class="sub">${E(tlabel(t))}</p>
      <div class="kv"><div><b>ชื่อ-สกุล:</b> ${E(s.name || '-')}</div><div><b>ลำดับผู้รับทุน:</b> ${E(s.no ?? '-')}</div>
        <div><b>โรงเรียน:</b> ${E(s.school_m1 || '-')}</div><div><b>ระดับชั้น:</b> ${E((rv && rv.grade) || gradeFor(s, t) || '-')}</div>
        <div><b>วันที่โรงเรียนแจ้ง:</b> ${E(fmtD(f.submittedAt) || '-')}</div><div><b>จังหวัด:</b> ${E(s.province || '-')}</div></div>
      <table><thead><tr><th style="width:44px">ที่</th><th>รายการ</th><th class="n">ยอดที่แจ้ง (บาท)</th><th class="n">เบิกได้ (บาท)</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${items.map((it, i) => `<tr><td>${i + 1}</td><td>${E(it.label)}</td><td class="n">${baht(it.amount)}</td><td class="n">${ap(it) == null || ap(it) === '' ? '–' : baht(ap(it))}</td><td>${E(it.note || '')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="2">รวมทั้งสิ้น</th><th class="n">${baht(requested(f))}</th><th class="n">${baht(apSum)}</th><th></th></tr></tfoot></table>
      ${f.bank && f.bank.accNo ? `<div class="bank"><b>บัญชีสถานศึกษาสำหรับโอนเงิน:</b> ${E(f.bank.bankName || '')}${f.bank.branch ? ' สาขา' + E(f.bank.branch) : ''} · ชื่อบัญชี ${E(f.bank.accName || '')} · เลขที่บัญชี <b>${E(f.bank.accNo)}</b></div>` : ''}
      ${f.note ? `<div class="note"><b>หมายเหตุจากโรงเรียน:</b> ${E(f.note)}</div>` : ''}
      ${(rv ? rv.note : saved.note) ? `<div class="note"><b>หมายเหตุจากมูลนิธิฯ:</b> ${E(rv ? rv.note : saved.note)}</div>` : ''}
      <div class="sig"><div>ลงชื่อ ................................................<br>(................................................)<br>ผู้ตรวจสอบ</div><div>ลงชื่อ ................................................<br>(................................................)<br>ผู้อนุมัติ</div></div>`);
  }

  window.TuitionFees = { render, status, requested, approvedTotal, CATS, exportXlsx, printReport, syncPayment, round: () => round, gradeFor };
})();
