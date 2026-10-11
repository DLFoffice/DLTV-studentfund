/* ============================================================
   47-user-home.js (v57)
   1) แบนเนอร์ต้อนรับฝั่งผู้ใช้ (บัญชีครู/นักเรียน · STUDENT_MODE) บนหน้า "งานของฉัน"
      — ดีไซน์เดียวกับแบนเนอร์ Dashboard ของผู้ดูแล (.hx) + ปุ่มลัดไปงานแต่ละงาน
   2) คำชี้แจงการกรอกข้อมูล (FormGuide) สำหรับ แบบฟอร์มที่ 2 และ แบบประเมิน SDQ
      — กล่องพับ/กางได้ จำสถานะไว้ในเบราว์เซอร์
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const activeTerm = () => (window.Term && Term.active) ? Term.active() : '';
  function greet() { const h = new Date().getHours(); return h < 12 ? 'อรุณสวัสดิ์' : h < 17 ? 'สวัสดียามบ่าย' : 'สวัสดียามเย็น'; }
  function themeCssReady() {
    try { return getComputedStyle(document.documentElement).getPropertyValue('--lg-ease').trim() !== ''; } catch (e) { return false; }
  }
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  /* ══════════ 1) แบนเนอร์ผู้ใช้ ══════════ */
  function userHeroHtml() {
    if (!window.STUDENT_MODE || !themeCssReady() || !window.Worklist) return '';
    const t = activeTerm();
    const list = (DB.students || []).map((s, idx) => ({ s, idx, sum: Worklist.summary(s, t) }));
    if (!list.length) return '';
    let done = 0, total = 0;
    list.forEach(r => { done += r.sum.doneCount; total += r.sum.tasks.length; });
    const pct = total ? Math.round(done / total * 100) : 0;
    const single = list.length === 1;
    const acct = ((document.querySelector('.sidebar-user-name') || {}).textContent || '').trim();
    const name = acct || (single ? (list[0].s.name || '') : '');
    const today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const termTxt = t && window.Term ? 'ภาคเรียนที่ใช้งาน: <b>' + E(Term.label(t)) + '</b> · ' : '';

    let line, actions;
    if (single) {
      const r = list[0], left = r.sum.tasks.length - r.sum.doneCount;
      line = termTxt + (left ? `เหลืออีก <b>${left}</b> งานที่ต้องส่ง` : 'ส่งครบทุกงานแล้ว ขอบคุณครับ/ค่ะ');
      const nx = r.sum.next;
      actions = (nx ? `<button type="button" class="hx-btn primary" data-wl-next="${r.idx}">▶ ทำงานถัดไป: ${E(nx.title)}</button>`
                    : `<span class="hx-btn primary is-static">✓ ส่งครบ 3 งานแล้ว</span>`)
        + r.sum.tasks.map(tk => {
          const ok = tk.state === 'submitted' || tk.state === 'done';
          return `<button type="button" class="hx-btn${ok ? ' is-done' : ''}" data-wl-open="${tk.key}" data-wl-idx="${r.idx}" ${tk.state === 'locked' ? 'disabled title="ยังไม่เปิดให้กรอก"' : ''}>${ok ? '✓ ' : tk.state === 'locked' ? '🔒 ' : ''}${E(tk.title)}</button>`;
        }).join('');
    } else {
      const todo = list.filter(r => r.sum.group !== 'done').length;
      line = termTxt + `นักเรียนในความดูแล ${list.length} คน · ยังส่งไม่ครบ <b>${todo}</b> คน`;
      const firstOpen = list.find(r => r.sum.next);
      actions = (firstOpen ? `<button type="button" class="hx-btn primary" data-wl-next="${firstOpen.idx}">▶ ทำงานที่ค้างต่อ (${E(firstOpen.s.name || 'นักเรียน')})</button>` : '')
        + `<button type="button" class="hx-btn" data-wl-filter="todo">ยังไม่เริ่ม</button>`
        + `<button type="button" class="hx-btn" data-wl-filter="doing">ส่งแล้วบางงาน</button>`
        + `<button type="button" class="hx-btn" data-wl-filter="all">ดูทั้งหมด</button>`;
    }
    actions += `<a class="hx-btn" href="manual.html?role=user" target="_blank" rel="noopener">📘 คู่มือการใช้งาน</a>`;

    return `<section class="hx hx-user" data-hx-pct-to="${pct}">
      <div class="hx-stars" aria-hidden="true"></div>
      <div class="hx-orbit" aria-hidden="true"><span class="r1"><i></i></span><span class="r2"><i></i></span><span class="core"></span></div>
      <div class="hx-main">
        <div class="hx-date">${E(today)}</div>
        <h2>${greet()}${name ? ', <span>' + E(name) + '</span>' : ''}</h2>
        <p>${line}</p>
        <div class="hx-actions">${actions}</div>
      </div>
      <div class="hx-prog" role="img" aria-label="ส่งงานภาคเรียนนี้แล้ว ${pct}%">
        <svg viewBox="0 0 120 120" width="138" height="138" aria-hidden="true"><circle cx="60" cy="60" r="50" class="bgc"/>
          <circle cx="60" cy="60" r="50" class="fgc" style="stroke-dasharray:314.16;stroke-dashoffset:314.16"/></svg>
        <div class="hx-prog-in"><b data-hx-pct>0%</b><span>ส่งงานแล้ว</span><small>${done}/${total} งาน</small></div>
      </div>
    </section>`;
  }
  let lastPct = null;
  function animateHero() {
    const el = document.querySelector('#sf-root .hx-user'); if (!el) return;
    const to = +el.getAttribute('data-hx-pct-to') || 0;
    const fg = el.querySelector('.fgc'), num = el.querySelector('[data-hx-pct]');
    // วาดซ้ำ (เช่นกดตัวกรอง) ด้วยค่าเดิม → แสดงค่าทันที ไม่ต้องเล่นแอนิเมชันใหม่
    if (reduce() || lastPct === to) { fg.style.transition = 'none'; fg.style.strokeDashoffset = String(314.16 * (1 - to / 100)); num.textContent = to + '%'; lastPct = to; return; }
    lastPct = to;
    requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.strokeDashoffset = String(314.16 * (1 - to / 100)); }));
    const t0 = performance.now();
    (function tick(n) { const k = Math.min(1, (n - t0) / 1100), e = 1 - Math.pow(1 - k, 3);
      num.textContent = Math.round(to * e) + '%'; if (k < 1) requestAnimationFrame(tick); })(t0);
  }
  if (typeof sfRenderPicker === 'function') {
    const _pick = sfRenderPicker;
    sfRenderPicker = function () {
      const html = _pick.apply(this, arguments);
      let hero = '';
      try { hero = userHeroHtml(); } catch (e) { console.warn(e); }
      if (hero) setTimeout(animateHero, 0);
      return hero + html;
    };
  }

  /* ══════════ 2) คำชี้แจงการกรอกข้อมูล ══════════ */
  const GUIDES = {
    form2: {
      title: 'คำชี้แจงการกรอกแบบฟอร์มที่ 2',
      sub: 'รายงานผลการเรียน ความประพฤติ และการใช้จ่ายเงินทุน ประจำภาคเรียน',
      intro: 'แบบฟอร์มนี้ใช้ติดตามความก้าวหน้าของนักเรียนทุนในแต่ละภาคเรียน ให้<b>ครูที่ปรึกษาหรือครูผู้ดูแลนักเรียนทุน</b>เป็นผู้กรอก (สอบถามข้อมูลจากนักเรียนประกอบได้) โปรดกรอกตามข้อเท็จจริงและเอกสารหลักฐานของภาคเรียนนี้',
      steps: [
        ['ข้อมูลทั่วไป', 'ระบบดึงชื่อ เลขประจำตัวประชาชน โรงเรียน และระดับชั้นมาให้แล้ว ตรวจความถูกต้อง ถ้าไม่ตรงแก้ไขได้ทันที'],
        ['ผลการเรียน', 'กรอกผลการเรียนเฉลี่ยตามใบรายงานผลการเรียน (ทศนิยม 2 ตำแหน่ง เช่น 3.25) แล้วเลือกหมวด "ปัญหาอุปสรรคที่ส่งผลต่อการเรียน" ที่ตรงกับนักเรียน และอธิบายรายละเอียดเพิ่มเติม'],
        ['ช่วยเหลือ/คาดหวัง', 'ระบุการช่วยเหลือที่โรงเรียนจัดให้ จากนั้น<b>ติ๊กเลือกหมวด</b>ความต้องการเพิ่มเติม ความคาดหวังด้านการศึกษา และด้านอาชีพ (เลือกได้หลายข้อ) แล้วเขียนรายละเอียดสั้น ๆ ในช่องด้านล่าง'],
        ['ความประพฤติ', 'บันทึกการเข้าร่วมกิจกรรม งานที่ช่วยครอบครัว และกิจกรรมเพื่อชุมชน แล้วเขียนสรุปความประพฤติในภาพรวม'],
        ['การเงิน', 'ตรวจข้อมูลบัญชีธนาคาร กรอกรายการรับเงินทุนและการใช้จ่ายแยก 3 ส่วน (สถานศึกษาเรียกเก็บ / ค่าครองชีพ / กรณีพิเศษ) ยอดคงเหลือควรเท่ากับยอดรับรวมลบยอดเบิกจ่าย พร้อมข้อคิดเห็นและการรับรองของครู'],
        ['เอกสารแนบ', '<b>ต้องแนบ 2 รายการ</b> คือ ผลการเรียนของภาคเรียนนี้ และสำเนาสมุดบัญชีเงินฝาก (หน้าแรก) เป็นไฟล์ PDF หรือรูปภาพ ไฟล์ละไม่เกิน 10 MB'],
      ],
      tips: [
        'ระบบ<b>บันทึกร่างให้อัตโนมัติ</b>ระหว่างกรอก ปิดหน้าแล้วกลับมากรอกต่อได้',
        'ตัวเลขในเมนู "ส่วนของแบบฟอร์ม" ด้านซ้ายบอกจำนวนช่องที่กรอกแล้ว กดปุ่ม "ไปช่องที่ยังว่าง" เพื่อข้ามไปช่องที่ยังไม่กรอก',
        'กรอกครบแล้วกด <b>💾 บันทึกและส่งข้อมูล</b> งานจึงจะนับว่า "ส่งแล้ว" ระหว่างที่ฟอร์มยังเปิดรับ แก้ไขแล้วกดส่งซ้ำได้',
        'กด "ดูตัวอย่าง / PDF" เพื่อตรวจทานหรือพิมพ์เอกสารเสนอลงนาม',
      ],
    },
    sdq: {
      title: 'คำชี้แจงการกรอกแบบประเมิน SDQ',
      sub: 'แบบประเมินจุดแข็งและจุดอ่อน (Strengths and Difficulties Questionnaire) ฉบับครูประเมินนักเรียน',
      intro: 'แบบประเมินนี้ใช้<b>คัดกรองพฤติกรรมเบื้องต้น</b> เพื่อวางแผนดูแลช่วยเหลือนักเรียนทุน ผู้ประเมินควรเป็น<b>ครูที่ปรึกษาหรือครูที่รู้จักนักเรียนดี</b> ไม่ใช่ให้นักเรียนประเมินตนเอง',
      steps: [
        ['ข้อมูลผู้ประเมิน', 'กรอกระดับชั้น ชื่อ-สกุลครูผู้ประเมิน และวันที่ประเมิน'],
        ['ตอบ 25 ข้อ', 'พิจารณาพฤติกรรมของนักเรียน<b>ในช่วง 6 เดือนที่ผ่านมา</b> แล้วเลือก 1 คำตอบต่อข้อ: <i>ไม่จริง</i> · <i>ค่อนข้างจริง</i> · <i>จริง</i> ควรตอบให้ครบทุกข้อ ถ้าไม่แน่ใจให้เลือกคำตอบที่ใกล้เคียงที่สุด'],
        ['ข้อความเชิงบวก', 'บางข้อเป็นพฤติกรรมด้านดี (เช่น ข้อ 1 "ห่วงใยความรู้สึกของคนอื่น") ให้ตอบตามจริงได้เลย ระบบกลับค่าคะแนนให้อัตโนมัติ'],
        ['ดูผลทันที', 'ระบบคำนวณคะแนน 5 ด้าน คือ อารมณ์ ความประพฤติ สมาธิสั้น/ไม่อยู่นิ่ง ความสัมพันธ์กับเพื่อน และสัมพันธภาพทางสังคม (จุดแข็ง) แล้วแปลผลเป็น ปกติ / เสี่ยง / มีปัญหา'],
        ['ส่วนเสริม (ไม่บังคับ)', 'ถ้านักเรียนมีปัญหา ให้ระบุผลกระทบต่อชีวิตประจำวันเพิ่มเติม ช่วยให้วางแผนช่วยเหลือได้ตรงจุด'],
      ],
      tips: [
        'ผล SDQ เป็นการ<b>คัดกรอง ไม่ใช่การวินิจฉัย</b> นักเรียนกลุ่มเสี่ยง/มีปัญหาควรได้รับการพูดคุยติดตามหรือส่งต่อผู้เชี่ยวชาญ',
        'ข้อมูลเป็น<b>ความลับ</b> ใช้เพื่อการดูแลช่วยเหลือนักเรียนเท่านั้น',
        'ระบบบันทึกร่างให้อัตโนมัติ ตอบครบแล้วกด <b>💾 บันทึกและส่งผลการประเมิน</b> งานจึงจะนับว่า "ส่งแล้ว"',
      ],
    },
  };
  const KEY = k => 'dltv.guide.' + k + '.closed';
  function guideHtml(key) {
    const g = GUIDES[key]; if (!g) return '';
    const open = store.get(KEY(key)) !== '1';
    return `<details class="gd gd-${key}" data-gd="${key}" ${open ? 'open' : ''}>
      <summary><span class="gd-ic" aria-hidden="true">i</span><span class="gd-t"><b>${g.title}</b><small>${g.sub}</small></span>
        <span class="gd-tg" aria-hidden="true"></span></summary>
      <div class="gd-body">
        <p class="gd-intro">${g.intro}</p>
        <ol class="gd-steps">${g.steps.map(([h, d], i) => `<li><span class="gd-n">${i + 1}</span><div><b>${h}</b><p>${d}</p></div></li>`).join('')}</ol>
        <ul class="gd-tips">${g.tips.map(t => `<li>${t}</li>`).join('')}</ul>
        <div class="gd-foot"><button type="button" class="gd-close" data-gd-close="${key}">เข้าใจแล้ว ซ่อนคำชี้แจง</button></div>
      </div>
    </details>`;
  }
  document.addEventListener('toggle', e => {
    const d = e.target; if (!d || !d.matches || !d.matches('details[data-gd]')) return;
    store.set(KEY(d.getAttribute('data-gd')), d.open ? '0' : '1');
  }, true);
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-gd-close]'); if (!b) return;
    const d = b.closest('details'); if (d) { d.open = false; store.set(KEY(b.getAttribute('data-gd-close')), '1'); d.scrollIntoView({ block: 'nearest' }); }
  });
  window.FormGuide = { html: guideHtml, GUIDES };

  // แบบฟอร์มที่ 2: แทรกคำชี้แจงใต้แถบเลือกแบบฟอร์ม (แสดงทุกส่วนของฟอร์ม)
  const _ed = window.sfRenderEditor;
  if (typeof _ed === 'function') {
    window.sfRenderEditor = function () {
      const html = _ed.apply(this, arguments);
      if (sfState.formKey !== 'form2') return html;
      return html.replace('<div class="sfx-body">', guideHtml('form2') + '<div class="sfx-body">');
    };
    try { sfRenderEditor = window.sfRenderEditor; } catch (e) {}
  }
})();
