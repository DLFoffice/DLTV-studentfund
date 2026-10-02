/* ============================================================
   43-form-ui-v2.js — หน้ากรอกแบบฟอร์มที่ 1 และ 2 รูปแบบใหม่ (อ่านง่าย ใช้ง่าย)
   ------------------------------------------------------------
   แทน sfRenderEditor เดิม (14) — ใช้ data-sf-action เดิมทั้งหมด ระบบบันทึก/ตรวจ/ส่งข้อมูลจึงทำงานเหมือนเดิม
   • หัวหน้า: รูป + ชื่อนักเรียน + ลำดับ/โรงเรียน/ภาคเรียน (เลขบัตรแสดงแบบปิดบางส่วน) + สถานะบันทึก + ปุ่มหลัก
   • การ์ดเลือกแบบฟอร์ม 2 ใบ: กรอกแล้วกี่ % · ส่งแล้ว/ยังไม่ส่ง
   • แถบซ้าย "ส่วนของแบบฟอร์ม": ทุกส่วนพร้อมสถานะ (ครบ ✓ / กรอกแล้ว x จาก y) กดข้ามไปส่วนใดก็ได้
     (มือถือ: กลายเป็นแถบเลื่อนแนวนอนด้านบน)
   • คำอธิบายสั้น ๆ ใต้หัวแต่ละส่วน ว่าต้องกรอกอะไร · ปุ่ม "ไปช่องที่ยังว่าง"
   • แถบล่างติดจอ: ← ย้อนกลับ · ส่วน x จาก y · ถัดไป: <ชื่อส่วน> → (ส่วนสุดท้าย = บันทึกและส่งข้อมูล)
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof sfEscapeHtml === 'function') ? sfEscapeHtml(v) : String(v ?? '');
  const DESC = {
    form1: {
      school: 'ข้อมูลโรงเรียนที่นักเรียนศึกษาอยู่ ส่วนใหญ่ระบบเติมจากทะเบียนให้แล้ว ตรวจให้ถูกต้อง',
      personal: 'ข้อมูลตัวนักเรียน วันเกิด ที่อยู่ และช่องทางติดต่อ',
      health: 'สุขภาพกาย โรคประจำตัว และการดูแลสุขภาพของนักเรียน',
      family: 'ข้อมูลบิดา มารดา ผู้ปกครอง และสภาพความเป็นอยู่ของครอบครัว',
      relations: 'ความสัมพันธ์และบรรยากาศในครอบครัว',
      study: 'การเรียน ความสามารถพิเศษ และความสนใจของนักเรียน',
      support: 'การดูแลช่วยเหลือที่โรงเรียนดำเนินการให้นักเรียนอยู่แล้ว',
      needs: 'ความต้องการเพิ่มเติมและกิจกรรมที่นักเรียนเข้าร่วม',
      finance: 'ข้อมูลบัญชีรับเงินทุน ลายมือชื่อและวันที่รับรองของครูและผู้อำนวยการ'
    },
    form2: {
      general: 'ข้อมูลพื้นฐานของนักเรียนในภาคเรียนนี้',
      grades: 'เกรดเฉลี่ยรายภาค (ใช้ข้อมูลเดียวกับเมนูผลการเรียน) และปัญหาอุปสรรคที่ส่งผลต่อการเรียน',
      assistance: 'การช่วยเหลือที่ได้รับ ความต้องการเพิ่มเติม และความคาดหวังด้านการศึกษา/อาชีพ — เลือกหมวดแล้วอธิบายเพิ่มเติม',
      behavior: 'ความประพฤติ การเข้าร่วมกิจกรรม และสรุปรายงานความประพฤติ (ใช้ในเอกสารสรุป)',
      finance: 'การใช้จ่ายเงินทุนในภาคเรียนนี้ ความเห็นครูที่ปรึกษา และการรับรอง',
      attachments: 'แนบผลการเรียนและสำเนาสมุดบัญชีของภาคเรียนนี้ (PDF หรือรูปถ่าย)'
    }
  };
  const FORM = {
    form1: { name: 'แบบฟอร์มที่ 1', sub: 'ข้อมูลรายบุคคล', icon: '🧑‍🎓' },
    form2: { name: 'แบบฟอร์มที่ 2', sub: 'ผลการเรียน · ความประพฤติ · การใช้จ่าย', icon: '📊' }
  };
  const maskId = v => { const t = String(v || ''); return t.length >= 13 ? t[0] + '-xxxx-xxxxx-' + t.slice(-3, -1) + '-' + t.slice(-1) : (t ? '•••' : ''); };
  const pctOf = (fk, s, t) => { try { return Math.round(Term.progress(s, fk, t) * 100); } catch (e) { return 0; } };

  function counts(fk, section) {
    let total = 0, filled = 0;
    section.fields.forEach(f => {
      if (['heading', 'note', 'table', 'matrix', 'files'].includes(f.type) || f.optional) return;
      if (f.showIf) { const dep = sfGetValue(fk, f.showIf.field, { type: 'radio' }); if (((dep && typeof dep === 'object') ? dep.choice : dep) !== f.showIf.equals) return; }
      total++;
      const v = sfGetValue(fk, f.id, f);
      if (f.type === 'radio') { if (v && v.choice) filled++; }
      else if (f.type === 'checkboxgroup') { if (v && ((v.selected && v.selected.length) || v.other)) filled++; }
      else if (v !== '' && v !== null && v !== undefined) filled++;
    });
    return { total, filled };
  }

  function formCard(fk, s, term) {
    const on = sfState.formKey === fk, f = FORM[fk];
    const sent = window.Term && Term.state(s, fk, term) === 'submitted';
    const at = sent ? ((Term.meta(s, fk, term) || {}).submittedAt || '') : '';
    const p = pctOf(fk, s, term);
    const when = at ? new Date(at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
    return `<button type="button" class="sfx-fcard${on ? ' on' : ''}" data-sf-action="switch-form" data-sf-form="${fk}" aria-pressed="${on}">
      <span class="sfx-ring" style="--p:${p}" aria-hidden="true"><span>${p}%</span></span>
      <span class="sfx-ftxt"><b>${f.icon} ${f.name}</b><small>${f.sub}</small>
        <em class="${sent ? 'ok' : ''}">${sent ? '✓ ส่งแล้ว' + (when ? ' ' + when : '') : 'ยังไม่ส่ง · กรอกแล้ว ' + p + '%'}</em></span>
    </button>`;
  }

  function sideNav(fk, sections) {
    const items = sections.map((sec, i) => {
      const c = counts(fk, sec);
      const done = c.total ? c.filled >= c.total : true;
      const on = i === sfState.sectionIndex;
      return `<li><button type="button" class="sfx-nav-item${on ? ' on' : ''}${done && c.total ? ' done' : ''}" data-sf-action="go-section" data-sf-idx="${i}" ${on ? 'aria-current="step"' : ''}>
        <span class="sfx-nav-no">${done && c.total && !on ? '✓' : i + 1}</span>
        <span class="sfx-nav-txt"><b>${E(sec.title)}</b><small>${c.total ? `กรอกแล้ว ${c.filled}/${c.total}` : 'ไม่มีช่องบังคับ'}</small></span>
      </button></li>`;
    }).join('');
    return `<aside class="sfx-nav" aria-label="ส่วนของแบบฟอร์ม"><div class="sfx-nav-head">ส่วนของแบบฟอร์ม</div><ol>${items}</ol>
      <div class="sfx-tip">💡 ระบบบันทึกร่างให้อัตโนมัติระหว่างกรอก ปิดหน้าแล้วกลับมาทำต่อได้ · ช่องที่ไม่มีข้อมูลเว้นว่างได้ · กด "บันทึกและส่งข้อมูล" เมื่อกรอกเสร็จ</div></aside>`;
  }

  window.sfRenderEditor = function () {
    const s = sfGetStudent();
    const fk = sfState.formKey;
    const sections = sfGetSections(fk);
    const i = sfState.sectionIndex, n = sections.length;
    const term = (window.Term && Term.active) ? Term.active() : '';
    const sec = sections[i];
    const saveTxt = sfState.saveStatus === 'saving' ? 'กำลังบันทึก…' : sfState.saveStatus === 'saved' ? 'บันทึกร่างแล้ว' : 'บันทึกร่างอัตโนมัติ';
    const photo = typeof photoEl === 'function' ? photoEl(s) : '';
    let content = sfRenderSectionContent(fk, i);
    const desc = (DESC[fk] || {})[sec.id];
    const c = counts(fk, sec);
    const tools = `<div class="sfx-sec-intro">${desc ? `<p>${E(desc)}</p>` : '<p></p>'}
      ${c.total && c.filled < c.total ? `<button type="button" class="sfx-jump" data-sfx-jump>ไปช่องที่ยังว่าง (${c.total - c.filled}) ↓</button>` : ''}</div>`;
    content = content.replace('<div class="sf-sec-body">', tools + '<div class="sf-sec-body">');
    const next = sections[i + 1];
    const backLbl = window.STUDENT_MODE ? '← งานของฉัน' : '← รายชื่อนักเรียน';
    return `<div class="sf-editor sf-theme-${fk} sfx">
      <header class="sfx-head">
        <button type="button" class="sfx-back" data-sf-action="go-picker">${backLbl}</button>
        <div class="sfx-who">${photo}<div><h2 class="sf-student-chip-name">${E(s.name || '(ยังไม่ระบุชื่อ)')}</h2>
          <p>${s.no != null ? 'ลำดับ ' + E(s.no) + ' · ' : ''}${E(s.school_m1 || '-')}${term && window.Term ? ' · ' + E(Term.label(term)) : ''}${s.id ? ' · ' + E(maskId(s.id)) : ''}</p></div></div>
        <div class="sfx-actions">
          <span class="sfx-save ${sfState.saveStatus || ''}" aria-live="polite"><i aria-hidden="true"></i>${saveTxt}</span>
          <button type="button" class="sfx-btn" data-sf-action="print">👁️ ดูตัวอย่าง / PDF</button>
          <button type="button" class="sfx-btn primary" data-sf-action="send-sheet">💾 บันทึกและส่งข้อมูล</button>
        </div>
      </header>
      <div class="sfx-forms sf-tabs">${formCard('form1', s, term)}${formCard('form2', s, term)}</div>
      <div class="sfx-body">
        ${sideNav(fk, sections)}
        <main class="sfx-main">
          ${content}
          <div class="sfx-bottom">
            <button type="button" class="sfx-btn" data-sf-action="prev-section" ${i === 0 ? 'disabled' : ''}>← ย้อนกลับ</button>
            <span class="sfx-count">ส่วนที่ ${i + 1} จาก ${n}<span class="sfx-mini"><span style="width:${((i + 1) / n * 100).toFixed(1)}%"></span></span></span>
            ${next ? `<button type="button" class="sfx-btn primary" data-sf-action="next-section">ถัดไป: ${E(next.short || next.title)} →</button>`
                   : `<button type="button" class="sfx-btn primary" data-sf-action="send-sheet">💾 บันทึกและส่งข้อมูล</button>`}
          </div>
        </main>
      </div>
    </div>`;
  };

  // อัปเดตตัวนับในแถบซ้ายแบบสดขณะพิมพ์ (ไม่วาดทั้งหน้า)
  const _persist = window.sfPersist;
  if (typeof _persist === 'function') {
    let t = null;
    window.sfPersist = function () {
      const r = _persist.apply(this, arguments);
      clearTimeout(t);
      t = setTimeout(() => {
        try {
          const fk = sfState.formKey, i = sfState.sectionIndex, sec = sfGetSections(fk)[i];
          const item = document.querySelector(`.sfx-nav-item[data-sf-idx="${i}"]`); if (!item || !sec) return;
          const c = counts(fk, sec);
          const sm = item.querySelector('small'); if (sm) sm.textContent = c.total ? `กรอกแล้ว ${c.filled}/${c.total}` : 'ไม่มีช่องบังคับ';
          item.classList.toggle('done', !!c.total && c.filled >= c.total);
          const j = document.querySelector('[data-sfx-jump]');
          if (j) { if (c.filled >= c.total) j.remove(); else j.textContent = `ไปช่องที่ยังว่าง (${c.total - c.filled}) ↓`; }
        } catch (e) {}
      }, 250);
      return r;
    };
  }

  // ไปช่องที่ยังว่าง (ช่องบังคับแรกที่ยังไม่มีข้อมูลในส่วนนี้)
  document.addEventListener('click', e => {
    if (!(e.target.closest && e.target.closest('[data-sfx-jump]'))) return;
    const fk = sfState.formKey, sec = sfGetSections(fk)[sfState.sectionIndex];
    for (const f of sec.fields) {
      if (['heading', 'note', 'table', 'matrix', 'files'].includes(f.type) || f.optional) continue;
      const v = sfGetValue(fk, f.id, f);
      const empty = f.type === 'radio' ? !(v && v.choice) : f.type === 'checkboxgroup' ? !(v && ((v.selected || []).length || v.other)) : (v === '' || v == null);
      if (!empty) continue;
      const el = document.querySelector(`#sf-root [data-sf-field="${f.id}"]`);
      if (!el) continue;
      const box = el.closest('.sf-item') || el;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      box.classList.remove('sfx-flash'); void box.offsetWidth; box.classList.add('sfx-flash');
      setTimeout(() => { const w = box.querySelector('.thdp-input') || el; try { w.focus({ preventScroll: true }); } catch (x) {} }, 350);
      return;
    }
  });
  // เปลี่ยนส่วน → เลื่อนขึ้นต้นส่วน
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.sfx [data-sf-action="go-section"], .sfx [data-sf-action="next-section"], .sfx [data-sf-action="prev-section"], .sfx [data-sf-action="switch-form"]');
    if (!b) return;
    setTimeout(() => { const t = document.querySelector('.sfx-body'); const m = document.querySelector('.main'); if (t && m) m.scrollTo({ top: Math.max(0, t.offsetTop - 70), behavior: 'smooth' }); }, 30);
  });
})();
