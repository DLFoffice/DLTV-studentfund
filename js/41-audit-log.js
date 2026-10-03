/* ============================================================
   41-audit-log.js — ประวัติการแก้ไขข้อมูล (ใครแก้อะไร เมื่อไร จากค่าใดเป็นค่าใด)
   ------------------------------------------------------------
   • สร้างอัตโนมัติทุกครั้งที่บันทึกขึ้นคลาวด์ (18-firebase-bridge เรียก AuditLog.build/write ใน batch เดียวกัน)
   • เทียบ "ค่าบนคลาวด์ก่อนบันทึก" กับ "ค่าใหม่" รายช่อง → เก็บที่ Firestore collection auditLogs
   • รวมการแก้ต่อเนื่องของคนเดิมกับนักเรียนคนเดิมภายใน 10 นาทีเป็นรายการเดียว (กันบันทึกถี่ระหว่างพิมพ์)
   • เลขบัตรประชาชน/เลขบัญชีเก็บแบบปิดบางส่วน · ข้อความยาวตัดเหลือ 140 ตัวอักษร
   • ดูได้จากปุ่ม "🕘 ประวัติการแก้ไข" ในหน้าต่างรายละเอียดนักเรียน (ผู้ดูแล/เจ้าหน้าที่)
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COL = 'auditLogs';
  const MERGE_MS = 10 * 60 * 1000;
  const MAX_CHANGES = 80;

  const TOP = {
    no: 'ลำดับ', name: 'ชื่อ-สกุล', nickname: 'ชื่อเล่น', id: 'เลขบัตรประชาชน', dob: 'วันเกิด', phone: 'โทรศัพท์นักเรียน',
    parent: 'ชื่อผู้ปกครอง', parentPhone: 'โทรศัพท์ผู้ปกครอง', school_m1: 'โรงเรียน', province: 'จังหวัด (โรงเรียน)', org: 'สังกัด',
    gpa_p6: 'GPA ป.6', behavior: 'บันทึกพฤติกรรม', photoUrl: 'รูปภาพ', email: 'อีเมล', status: 'สถานะ'
  };
  const SUB = {
    mentor: ['พี่เลี้ยง', { firstName: 'ชื่อ', lastName: 'สกุล', phone: 'เบอร์โทร', position: 'ตำแหน่ง' }],
    school_m1_addr: ['โรงเรียน', { advisorM1: 'ครูที่ปรึกษา', telAdvisorM1: 'โทรครูที่ปรึกษา', advisorPosM1: 'ตำแหน่งครูที่ปรึกษา',
      directorM1: 'ผู้อำนวยการ', telDirectorM1: 'โทรผู้อำนวยการ', amphoe: 'อำเภอ', district: 'ตำบล', lat: 'ละติจูด', lng: 'ลองจิจูด' }],
    bank: ['บัญชีธนาคาร', {}], addr: ['ที่อยู่', {}], schoolSince: ['สถานศึกษาปัจจุบัน', { term: 'เริ่มภาคเรียน', reason: 'เหตุผลที่ย้าย', note: 'หมายเหตุ' }]
  };
  const SKIP_TOP = new Set(['gpa', 'payment', 'updatedAt', 'createdAt', 'form1', 'form2']);
  const SENSITIVE = /^(id|.*acc(ount)?no.*|.*AccNo.*)$/i;
  const FORM_NAME = { form1: 'แบบฟอร์มที่ 1', form2: 'แบบฟอร์มที่ 2', m1: 'แบบฟอร์มที่ 1', m2: 'แบบฟอร์มที่ 2' };
  const SDQ_NAME = { grade: 'ระดับชั้น', evaluator: 'ผู้ประเมิน', date: 'วันที่ประเมิน', overall: 'ผลกระทบโดยรวม', distress: 'ความไม่สบายใจ', impact: 'ผลกระทบรายด้าน' };

  const short = (v, n = 140) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const mask = v => { const t = String(v || ''); return t.length > 4 ? t.slice(0, 1) + '•'.repeat(Math.max(3, t.length - 3)) + t.slice(-2) : t ? '•••' : ''; };
  const money = n => (typeof fmt === 'function') ? fmt(n) : String(n);
  function disp(v) {
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'boolean') return v ? 'ใช่' : 'ไม่';
    if (typeof v !== 'object') return short(v);
    if (Array.isArray(v)) {
      const rows = v.filter(r => r && (r.cells ? Object.values(r.cells).some(x => String(x || '').trim()) : true));
      return rows.length ? rows.length + ' แถว' : '';
    }
    if ('choice' in v) return short([v.choice, v.other].filter(Boolean).join(' · '));
    if ('selected' in v) return short([...(v.selected || []), v.other].filter(Boolean).join(', '));
    if ('cols' in v && 'values' in v) return 'ตาราง (' + (v.cols || []).length + ' คอลัมน์)';
    return short(JSON.stringify(v), 80);
  }
  const fieldLabel = (fk, id) => { try { const f = typeof sfFindField === 'function' && sfFindField(fk, id); return (f && (f.label || f.text)) || id; } catch (e) { return id; } };
  const sent = iso => { try { const d = new Date(iso); return 'ส่งแล้ว ' + d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return 'ส่งแล้ว'; } };

  /** แตกเอกสารนักเรียนเป็นรายการช่อง → Map(key → {label, cmp, d}) */
  function flatten(c) {
    const m = new Map();
    const put = (k, label, v, d) => { if (v === undefined) return; m.set(k, { label, cmp: JSON.stringify(v), d: d !== undefined ? d : disp(v) }); };
    Object.keys(c || {}).forEach(k => {
      if (k.startsWith('_') || SKIP_TOP.has(k)) return;
      const v = c[k];
      if (k === 'semGpa' && Array.isArray(v)) { v.forEach(g => g && g.term && put('semGpa.' + g.term, 'ผลการเรียน ' + g.term, g,
        (Number(g.gpa) > 0 ? 'GPA ' + Number(g.gpa).toFixed(2) : 'ไม่มี GPA') + (g.weakSubjects ? ' · วิชาที่ควรพัฒนา: ' + short(g.weakSubjects, 50) : ''))); return; }
      if (k === 'semPayments' && Array.isArray(v)) { v.forEach(p => p && p.term && put('semPayments.' + p.term, 'การเบิกจ่าย ' + p.term, p,
        `ส่วนที่ 1 ${money(Number(p.p1) || 0)} · ส่วนที่ 2 ${money(Number(p.p2) || 0)} บาท`)); return; }
      if (k === 'mi') { const mm = v || {}; put('mi', 'แบบสำรวจแววความสามารถพิเศษ (MI)', mm.answers || null,
        mm.updatedAt ? 'ผลวันที่ ' + new Date(mm.updatedAt).toLocaleDateString('th-TH') + (mm.passed && mm.passed.length && typeof MI !== 'undefined' ? ' · ผ่าน: ' + mm.passed.map(MI.name).join(', ') : '') : ''); return; }
      if (k === 'schoolHistory') { put(k, 'ประวัติสถานศึกษา', v, Array.isArray(v) ? v.length + ' โรงเรียนเดิม' : ''); return; }
      if (k === 'forms' && v && typeof v === 'object') {
        Object.keys(v).forEach(t => { const b = v[t] || {};
          Object.keys(b).forEach(fk => {
            const st = b[fk]; if (!st || typeof st !== 'object') return;
            if (fk === 'm1' || fk === 'm2') { put(`forms.${t}.${fk}`, `${FORM_NAME[fk]} ${t} · สถานะการส่ง`, st.submittedAt || '', st.submittedAt ? sent(st.submittedAt) : 'ยังไม่ส่ง'); return; }
            if (fk !== 'form1' && fk !== 'form2') return;
            Object.keys(st).forEach(fid => { if (fid.startsWith('_')) return;
              if (fid === 'attachments' && st[fid] && typeof st[fid] === 'object') {   // v48: เอกสารแนบ → รายการชื่อไฟล์
                Object.keys(st[fid]).forEach(kd => { const l = Array.isArray(st[fid][kd]) ? st[fid][kd] : [];
                  put(`forms.${t}.${fk}.attachments.${kd}`, `เอกสารแนบ ${t} · ${({ grades: 'ผลการเรียน', bankbook: 'สมุดบัญชี', other: 'อื่น ๆ' })[kd] || kd}`,
                    l.map(x => x.fileId || x.path || x.name), l.length ? l.map(x => x.name).join(', ') : ''); });
                return;
              }
              put(`forms.${t}.${fk}.${fid}`, `${FORM_NAME[fk]} ${t} · ${fieldLabel(fk, fid)}`, st[fid]); });
          }); });
        return;
      }
      if (k === 'sdq' && v && typeof v === 'object') {
        Object.keys(v).forEach(t => { const b = v[t] || {};
          Object.keys(b).forEach(f => { if (f.startsWith('_')) return;
            if (f === 'answers') { const n = Object.values(b.answers || {}).filter(x => x !== '' && x != null).length; put(`sdq.${t}.answers`, `SDQ ${t} · คำตอบ`, b.answers, n + '/25 ข้อ'); return; }
            if (f === 'submittedAt') { put(`sdq.${t}.submittedAt`, `SDQ ${t} · สถานะการส่ง`, b.submittedAt || '', b.submittedAt ? sent(b.submittedAt) : 'ยังไม่ส่ง'); return; }
            put(`sdq.${t}.${f}`, `SDQ ${t} · ${SDQ_NAME[f] || f}`, b[f]); }); });
        return;
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const [grp, names] = SUB[k] || [k, {}];
        Object.keys(v).forEach(sk => { if (sk.startsWith('_') || sk === 'advisorMigrated') return;
          const sv = v[sk];
          put(`${k}.${sk}`, `${grp}: ${names[sk] || sk}`, sv, SENSITIVE.test(sk) ? mask(sv) : disp(sv)); });
        return;
      }
      if (k === 'photoUrl') { put(k, TOP[k], v, v ? (String(v).includes('firebasestorage') ? 'รูปบนคลาวด์' : 'ลิงก์รูป') : ''); return; }
      put(k, TOP[k] || k, v, SENSITIVE.test(k) ? mask(v) : disp(v));
    });
    return m;
  }

  function who() {
    try {
      const u = firebase.auth().currentUser;
      const name = (window.STUDENT_MODE && (STUDENT_MODE.username || STUDENT_MODE.studentId)) || (u && (u.email || u.displayName)) || 'ไม่ทราบผู้ใช้';
      return { uid: u ? u.uid : '', name: String(name), role: window.STUDENT_MODE ? 'ครูผู้ดูแล (บัญชีนักเรียน)' : 'ผู้ดูแล/เจ้าหน้าที่' };
    } catch (e) { return { uid: '', name: 'ไม่ทราบผู้ใช้', role: '' }; }
  }

  function build(docId, s, oldC, newC) {
    const a = flatten(oldC), b = flatten(newC);
    const changes = [];
    new Set([...a.keys(), ...b.keys()]).forEach(k => {
      const x = a.get(k), y = b.get(k);
      if ((x && x.cmp) === (y && y.cmp)) return;
      const from = x ? x.d : '', to = y ? y.d : '';
      if (from === to && x && y) { changes.push({ k, label: (y || x).label, from, to: to + ' (แก้ไขรายละเอียด)' }); return; }
      if (!from && !to) return;
      changes.push({ k, label: (y || x).label, from: from || '', to: y ? to : '(ลบ)' });
    });
    if (!changes.length) return null;
    const u = who();
    return { docId, studentNo: s.no ?? '', studentName: s.name || '', byUid: u.uid, byName: u.name, byRole: u.role,
      at: new Date().toISOString(), changes };
  }

  // รวมการแก้ต่อเนื่อง (คนเดิม + นักเรียนเดิม ภายใน 10 นาที) เป็นเอกสารเดียว
  const open = new Map();
  function write(batch, db, e) {
    const key = e.docId + '|' + e.byUid;
    const prev = open.get(key);
    const now = Date.now();
    let docRef, doc;
    if (prev && now - prev.t < MERGE_MS) {
      const merged = new Map(prev.doc.changes.map(c => [c.k, c]));
      e.changes.forEach(c => {
        const p = merged.get(c.k);
        if (p) { const nc = { ...p, to: c.to }; if (nc.from === nc.to) merged.delete(c.k); else merged.set(c.k, nc); }
        else merged.set(c.k, c);
      });
      const all = [...merged.values()];
      doc = { ...prev.doc, studentName: e.studentName, updatedAt: e.at, changes: all.slice(0, MAX_CHANGES), more: Math.max(0, all.length - MAX_CHANGES) };
      docRef = db.collection(COL).doc(prev.id);
    } else {
      docRef = db.collection(COL).doc();
      doc = { ...e, updatedAt: e.at, changes: e.changes.slice(0, MAX_CHANGES), more: Math.max(0, e.changes.length - MAX_CHANGES) };
    }
    if (!doc.changes.length) return;
    batch.set(docRef, doc);
    open.set(key, { id: docRef.id, t: prev && now - prev.t < MERGE_MS ? prev.t : now, doc });
  }

  /* ---------- หน้าต่างดูประวัติ ---------- */
  const fmtAt = iso => { try { const d = new Date(iso); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.'; } catch (e) { return iso; } };
  const hm = iso => { try { return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  async function fetchLogs(docId) {
    const db = firebase.firestore();
    const snap = docId ? await db.collection(COL).where('docId', '==', docId).limit(300).get()
      : await db.collection(COL).orderBy('updatedAt', 'desc').limit(150).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  function view(idx) {
    const s = idx != null ? DB.students[idx] : null;
    const docId = s ? String(s._docId || s.id) : null;
    const w = document.createElement('div');
    w.className = 'uid-backdrop';
    w.innerHTML = `<div class="uid al-dlg" role="dialog" aria-modal="true" aria-labelledby="al-t">
      <div class="al-head"><div><h2 class="uid-title" id="al-t">ประวัติการแก้ไขข้อมูล</h2>
        <p>${s ? E(s.name || '') + ' · ลำดับ ' + E(s.no ?? '-') : 'ทุกคน (150 รายการล่าสุด)'}</p></div>
        <button type="button" class="al-x" aria-label="ปิด">✕</button></div>
      <div class="al-tools">
        ${s ? `<div class="al-tabs" role="tablist"><button class="on" data-al="one" role="tab">นักเรียนคนนี้</button><button data-al="all" role="tab">ทั้งระบบ</button></div>` : ''}
        <input type="search" class="al-q" placeholder="ค้นหา ชื่อผู้แก้ / ชื่อช่อง / ค่า">
      </div>
      <div class="al-body" aria-live="polite"><div class="al-loading"><span class="uid-spin uid-spin-lg"></span> กำลังโหลด…</div></div>
    </div>`;
    document.body.appendChild(w);
    requestAnimationFrame(() => w.classList.add('in'));
    const close = () => { w.classList.remove('in'); setTimeout(() => w.remove(), 160); document.removeEventListener('keydown', onKey, true); };
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    document.addEventListener('keydown', onKey, true);
    w.querySelector('.al-x').onclick = close;
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    const body = w.querySelector('.al-body'), q = w.querySelector('.al-q');
    let logs = [], scope = s ? 'one' : 'all';
    const render = () => {
      const t = q.value.trim().toLowerCase();
      const list = logs.filter(l => !t || JSON.stringify([l.byName, l.studentName, l.changes]).toLowerCase().includes(t));
      body.innerHTML = list.length ? list.map(l => `<article class="al-item">
          <header><b>${E(fmtAt(l.updatedAt || l.at))}</b><span>โดย <b>${E(l.byName || '-')}</b>${l.byRole ? ' · ' + E(l.byRole) : ''}</span>
            ${scope === 'all' ? `<span class="al-stu">${E(l.studentName || '')}${l.studentNo !== '' ? ' (ลำดับ ' + E(l.studentNo) + ')' : ''}</span>` : ''}
            <small>${l.changes.length + (l.more || 0)} รายการ${l.at && l.updatedAt && l.at !== l.updatedAt ? ' · แก้ต่อเนื่อง ' + E(hm(l.at)) + '–' + E(hm(l.updatedAt)) + ' น.' : ''}</small></header>
          <table><tbody>${l.changes.map(c => `<tr><th>${E(c.label)}</th><td class="from">${c.from ? E(c.from) : '<i>ว่าง</i>'}</td><td class="arr" aria-hidden="true">→</td><td class="to${c.to === '(ลบ)' ? ' del' : ''}">${c.to ? E(c.to) : '<i>ว่าง</i>'}</td></tr>`).join('')}
            ${l.more ? `<tr><td colspan="4" class="al-more">และอีก ${l.more} รายการ</td></tr>` : ''}</tbody></table></article>`).join('')
        : `<div class="al-empty">${logs.length ? 'ไม่พบรายการที่ตรงกับคำค้น' : 'ยังไม่มีประวัติการแก้ไข (เริ่มบันทึกตั้งแต่ติดตั้งระบบรุ่นนี้)'}</div>`;
    };
    const load = async () => {
      body.innerHTML = '<div class="al-loading"><span class="uid-spin uid-spin-lg"></span> กำลังโหลด…</div>';
      try {
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) throw new Error('ยังไม่ได้เชื่อมต่อคลาวด์ (โหมดในเครื่อง) — ประวัติการแก้ไขเก็บบน Firestore เท่านั้น');
        logs = await fetchLogs(scope === 'one' ? docId : null); render();
      } catch (e) {
        body.innerHTML = `<div class="al-empty">โหลดประวัติไม่สำเร็จ: ${E(e.code === 'permission-denied' ? 'ยังไม่ได้อัปเดต Firestore Rules ให้มี auditLogs (ดู README)' : (e.message || e))}</div>`;
      }
    };
    q.addEventListener('input', render);
    w.querySelectorAll('[data-al]').forEach(b => b.onclick = () => {
      scope = b.dataset.al; w.querySelectorAll('[data-al]').forEach(x => x.classList.toggle('on', x === b)); load(); });
    load();
  }

  // ปุ่มในหน้าต่างรายละเอียดนักเรียน (เฉพาะผู้ดูแล/เจ้าหน้าที่)
  const _open = window.openStudentDetail;
  if (typeof _open === 'function') {
    window.openStudentDetail = function (idx) {
      const r = _open.apply(this, arguments);
      try {
        const foot = document.querySelector('#student-modal .modal-footer');
        if (foot && !window.STUDENT_MODE) {
          let b = foot.querySelector('[data-al-open]');
          if (!b) { b = document.createElement('button'); b.className = 'btn'; b.setAttribute('data-al-open', ''); b.textContent = '🕘 ประวัติการแก้ไข'; foot.insertBefore(b, foot.firstChild); }
          b.onclick = () => view(idx);
        }
      } catch (e) {}
      return r;
    };
  }

  window.AuditLog = { build, write, flatten, view, committed: null };
})();
