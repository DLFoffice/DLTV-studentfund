/* ============================================================
   46-gpa-trend.js — "แนวโน้ม GPA เทียบภาคก่อน" ใช้ร่วมกันทั้งระบบ + กดดูรายชื่อได้
   ------------------------------------------------------------
   เกณฑ์เดียวกันทุกหน้า (Dashboard / ผลการเรียน):
     ดีขึ้น          ต่างจากภาคก่อน > +0.05
     ใกล้เคียงเดิม   −0.05 ถึง +0.05
     ลดลงเล็กน้อย    ลดลงมากกว่า 0.05 แต่น้อยกว่า 0.30
     ลดลงตั้งแต่ 0.30 (ควรติดตาม)
   + GPA ต่ำกว่า 2.00 (ดูจาก GPA ภาคนั้น)
   GpaTrend.rows(term?)  → รายคน (ไม่ส่ง term = GPA ล่าสุดของแต่ละคนเทียบภาคก่อนหน้า)
   GpaTrend.cardHtml(rows, opts) → แถบสัดส่วน + แถวกดได้ · GpaTrend.open(cat, term) → หน้าต่างรายชื่อ
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  const tkey = t => { const m = String(t || '').match(/(\d)\/(\d{4})/); return m ? +m[2] * 10 + +m[1] : 0; };
  const r2 = v => Math.round(Number(v) * 100) / 100;
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const col = v => !(v > 0) ? 'var(--text3)' : v >= 3.5 ? '#15803D' : v >= 3.0 ? '#1D4ED8' : v >= 2.5 ? '#B45309' : v >= 2.0 ? '#C2410C' : '#B91C1C';
  const CATS = {
    up:   { t: 'ดีขึ้น', sub: '> +0.05', c: '#16A34A' },
    same: { t: 'ใกล้เคียงเดิม', sub: '±0.05', c: '#94A3B8' },
    down: { t: 'ลดลงเล็กน้อย', sub: '−0.05 ถึง −0.30', c: '#F59E0B' },
    drop: { t: 'ลดลงตั้งแต่ 0.30', sub: 'ควรติดตาม', c: '#DC2626' },
    low:  { t: 'GPA ต่ำกว่า 2.00', sub: 'ภาคนี้', c: '#7F1D1D' }
  };
  const ORDER = ['up', 'same', 'down', 'drop'];
  const classify = d => d == null ? null : d > 0.05 ? 'up' : d >= -0.05 ? 'same' : d > -0.30 ? 'down' : 'drop';

  function series(s) {
    return (s.semGpa || []).filter(g => g && g.term && Number(g.gpa) > 0)
      .map(g => ({ term: g.term, gpa: r2(g.gpa) })).sort((a, b) => tkey(a.term) - tkey(b.term));
  }
  /** รายคน: term = null → ภาคล่าสุดของแต่ละคน */
  function rows(term) {
    return (DB.students || []).map((s, idx) => {
      const ser = series(s);
      let i = term ? ser.findIndex(x => x.term === term) : ser.length - 1;
      const cur = i >= 0 ? ser[i] : null, prev = i > 0 ? ser[i - 1] : null;
      const d = cur && prev ? r2(cur.gpa - prev.gpa) : null;
      return { s, idx, cur: cur ? cur.gpa : null, curTerm: cur ? cur.term : null, prev: prev ? prev.gpa : null, prevTerm: prev ? prev.term : null,
        d, cat: classify(d), low: !!(cur && cur.gpa < 2) };
    });
  }
  function counts(list) {
    const c = { up: 0, same: 0, down: 0, drop: 0, low: 0, one: 0, none: 0 };
    list.forEach(r => { if (r.cat) c[r.cat]++; else if (r.cur != null) c.one++; else c.none++; if (r.low) c.low++; });
    c.cmp = c.up + c.same + c.down + c.drop;
    return c;
  }

  /** การ์ดแนวโน้ม (ใช้บน Dashboard และหน้าผลการเรียน) */
  function cardHtml(list, opts) {
    opts = opts || {};
    const c = counts(list), term = opts.term || '';
    const bar = ORDER.map(k => c[k] ? `<button type="button" class="gt-seg" style="flex:${c[k]};background:${CATS[k].c}" data-gt-open="${k}" data-gt-term="${E(term)}"
        title="${CATS[k].t} ${c[k]} คน — กดดูรายชื่อ" aria-label="${CATS[k].t} ${c[k]} คน"></button>` : '').join('');
    const row = k => `<li><button type="button" class="gt-row" data-gt-open="${k}" data-gt-term="${E(term)}" ${c[k] ? '' : 'disabled'}>
        <i style="background:${CATS[k].c}"></i><span class="gt-l">${CATS[k].t}<small>${CATS[k].sub}</small></span>
        <b>${c[k]}</b><small class="gt-p">${k === 'low' ? '' : pct(c[k], c.cmp) + '%'}</small><span class="gt-go" aria-hidden="true">›</span></button></li>`;
    const drops = list.filter(r => r.cat === 'drop').sort((a, b) => a.d - b.d);
    return `<div class="gt">
      <div class="gt-bar">${bar || '<span class="gt-empty"></span>'}</div>
      <ul class="gt-rows">${ORDER.map(row).join('')}${opts.withLow ? row('low') : ''}</ul>
      <p class="gt-note">${c.cmp ? `เทียบได้ ${c.cmp} คน` : 'ยังไม่มีนักเรียนที่มี GPA 2 ภาคเรียนขึ้นไป'}${c.one ? ` · มี GPA ภาคเดียว ${c.one} คน` : ''}${opts.scopeLabel ? ' · ' + E(opts.scopeLabel) : ''} · กดแต่ละแถวเพื่อดูรายชื่อ</p>
      ${drops.length ? `<div class="gt-drops">${drops.slice(0, 4).map(r => `<button type="button" onclick="openStudentDetail(${r.idx})">${E(r.s.name || '')} <b>▼ ${Math.abs(r.d).toFixed(2)}</b></button>`).join('')}</div>` : ''}
    </div>`;
  }

  /* ---------- หน้าต่างรายชื่อ ---------- */
  function open(cat, term) {
    term = term || null;
    const all = rows(term);
    const c = counts(all);
    const w = document.createElement('div');
    w.className = 'uid-backdrop';
    const scope = term ? 'ภาคเรียนที่ ' + term + ' เทียบภาคก่อนหน้า' : 'GPA ล่าสุดของแต่ละคน เทียบภาคก่อนหน้า';
    w.innerHTML = `<div class="uid gt-dlg" role="dialog" aria-modal="true" aria-labelledby="gt-t">
      <div class="gt-dhead"><div><h2 class="uid-title" id="gt-t">แนวโน้ม GPA เทียบภาคก่อน</h2><p>${E(scope)}</p></div>
        <button type="button" class="al-x" aria-label="ปิด">✕</button></div>
      <div class="gt-tabs" role="tablist">${[...ORDER, 'low'].map(k => `<button type="button" role="tab" data-gt-tab="${k}" style="--c:${CATS[k].c}">${CATS[k].t} <b>${c[k]}</b></button>`).join('')}</div>
      <div class="gt-body"></div></div>`;
    document.body.appendChild(w);
    requestAnimationFrame(() => w.classList.add('in'));
    const close = () => { w.classList.remove('in'); setTimeout(() => w.remove(), 160); document.removeEventListener('keydown', onKey, true); };
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    document.addEventListener('keydown', onKey, true);
    w.querySelector('.al-x').onclick = close;
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    const body = w.querySelector('.gt-body');
    const show = k => {
      w.querySelectorAll('[data-gt-tab]').forEach(b => { const on = b.dataset.gtTab === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      const list = all.filter(r => k === 'low' ? r.low : r.cat === k).sort((a, b) => k === 'up' ? b.d - a.d : k === 'low' ? a.cur - b.cur : (a.d ?? 0) - (b.d ?? 0));
      body.innerHTML = list.length ? `<table class="gt-table"><thead><tr><th>ลำดับ</th><th>นักเรียน</th><th class="num">ภาคก่อน</th><th class="num">ภาคนี้</th><th class="num">เปลี่ยนแปลง</th><th></th></tr></thead><tbody>
        ${list.map(r => `<tr><td class="n">${E(r.s.no ?? '')}</td>
          <td><b>${E(r.s.name || '')}</b><small>${E(r.s.school_m1 || '-')}${r.s.province ? ' · ' + E(r.s.province) : ''}</small></td>
          <td class="num">${r.prev != null ? `<span style="color:${col(r.prev)}">${r.prev.toFixed(2)}</span><small>${E(r.prevTerm)}</small>` : '—'}</td>
          <td class="num"><b style="color:${col(r.cur)}">${r.cur != null ? r.cur.toFixed(2) : '—'}</b><small>${E(r.curTerm || '')}</small></td>
          <td class="num">${r.d == null ? '—' : r.d > 0 ? `<span class="gt-d up">▲ ${r.d.toFixed(2)}</span>` : r.d < 0 ? `<span class="gt-d down">▼ ${Math.abs(r.d).toFixed(2)}</span>` : '<span class="gt-d">● 0.00</span>'}</td>
          <td class="act"><button type="button" class="btn btn-sm" data-gt-detail="${r.idx}">ดูข้อมูล</button></td></tr>`).join('')}</tbody></table>`
        : `<div class="al-empty">ไม่มีนักเรียนในกลุ่มนี้</div>`;
    };
    w.querySelectorAll('[data-gt-tab]').forEach(b => b.onclick = () => show(b.dataset.gtTab));
    body.addEventListener('click', e => { const b = e.target.closest('[data-gt-detail]'); if (!b) return; close(); openStudentDetail(+b.dataset.gtDetail); });
    show(cat in CATS ? cat : 'up');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-gt-open]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    open(b.dataset.gtOpen, b.dataset.gtTerm || null);
  }, true);

  /* ---------- หน้าผลการเรียน: การ์ดสรุป + ตารางสรุปกดได้ (เกณฑ์เดียวกับ Dashboard) ---------- */
  function allTerms() {
    const set = new Set(); (DB.students || []).forEach(s => (s.semGpa || []).forEach(g => g && g.term && Number(g.gpa) > 0 && set.add(g.term)));
    return [...set].sort((a, b) => tkey(a) - tkey(b));
  }
  function patchAcademic() {
    const page = document.getElementById('page-academic'); if (!page) return;
    const kp = page.querySelector('.ac-kpis'); if (!kp) return;
    const sel = document.getElementById('gpa-term-select'); const scope = sel ? sel.value : '';
    const terms = allTerms(); const gm = /^grade:(\d+)$/.exec(scope);
    const lvOf = t => (typeof gradeLevelOf === 'function') ? gradeLevelOf(t) : 1;
    const show = gm ? terms.filter(t => lvOf(t) === +gm[1]) : scope ? [scope] : terms;
    const last = show[show.length - 1];
    if (!last) return;
    const list = rows(last);
    const first = kp.querySelector('.ac-kpi');                // การ์ด GPA เฉลี่ยเดิม (เก็บไว้)
    kp.innerHTML = '';
    if (first) kp.appendChild(first);
    const card = document.createElement('div');
    card.className = 'ac-kpi gt-kpi';
    card.innerHTML = `<span>แนวโน้ม GPA เทียบภาคก่อน · ภาคเรียนที่ ${E(last)}</span>${cardHtml(list, { term: last, withLow: true })}`;
    kp.appendChild(card);
    kp.classList.add('gt-kpis');
    // ตารางสรุปรายภาค: ตัวเลขเกณฑ์เดียวกัน + กดดูรายชื่อ
    const th = page.querySelectorAll('.ac-sum-table thead th');
    if (th.length >= 8) { th[4].textContent = 'ดีขึ้น'; th[5].textContent = 'ใกล้เคียงเดิม'; th[6].textContent = 'ลดลง'; th[7].textContent = 'ต่ำกว่า 2.00'; }
    page.querySelectorAll('.ac-sum-table tr.ac-t-term').forEach(tr => {
      const t = tr.dataset.scope, tds = tr.children; if (!t || tds.length < 8) return;
      const c = counts(rows(t));
      const btn = (k, v, cls, txt) => v ? `<button type="button" class="gt-cell ${cls}" data-gt-open="${k}" data-gt-term="${E(t)}" title="กดดูรายชื่อ">${txt}</button>` : '<span class="gt-zero">0</span>';
      tds[4].innerHTML = btn('up', c.up, 'up', '▲ ' + c.up);
      tds[5].innerHTML = btn('same', c.same, '', String(c.same));
      tds[6].innerHTML = c.down + c.drop ? `<button type="button" class="gt-cell down" data-gt-open="${c.drop ? 'drop' : 'down'}" data-gt-term="${E(t)}" title="กดดูรายชื่อ">▼ ${c.down + c.drop}${c.drop ? ` <small>(≥0.30: ${c.drop})</small>` : ''}</button>` : '<span class="gt-zero">0</span>';
      tds[7].innerHTML = btn('low', c.low, 'warn', String(c.low));
    });
    const hint = page.querySelector('.ac-sum-hint');
    if (hint) hint.textContent = '"ดีขึ้น / ใกล้เคียงเดิม / ลดลง" เทียบภาคเรียนก่อนหน้าของนักเรียนคนเดียวกัน (เกณฑ์ ±0.05 เดียวกับ Dashboard) · กดตัวเลขเพื่อดูรายชื่อ · กดแถวเพื่อกรองตารางรายคน';
  }
  const _ra = window.renderAcademic;
  if (typeof _ra === 'function') window.renderAcademic = function () { const r = _ra.apply(this, arguments); try { patchAcademic(); } catch (e) { console.warn('gpa trend', e); } return r; };

  window.GpaTrend = { rows, counts, cardHtml, open, classify, CATS };
})();
