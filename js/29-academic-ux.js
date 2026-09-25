/* ============================================================
   29-academic-ux.js (v25) — หน้า "ผลการเรียน" แบ่งตามระดับชั้น + รายภาคเรียน
   เพื่อดูว่าผลการเรียน "เพิ่มขึ้น" หรือ "ลดลง"
   • การ์ดสรุป: GPA เฉลี่ยล่าสุด (+เทียบภาคก่อน), ดีขึ้น / ลดลง / คงที่, GPA < 2.00
   • ตารางสรุป ชั้น → ภาคเรียน: GPA เฉลี่ย, เปลี่ยนแปลงจากภาคก่อน, จำนวนดีขึ้น/คงที่/ลดลง, ต่ำกว่า 2.00
   • ตารางรายคน 1 คน = 1 แถว: GPA ป.6 → ทุกภาคเรียน (จัดกลุ่มตามชั้น) พร้อม ▲/▼ เทียบภาคก่อน,
     เฉลี่ยรายปี, เส้นแนวโน้ม และสรุป "ล่าสุดเทียบภาคก่อน"
   • เลือกภาคเรียนเดียว: ภาคก่อน → ภาคนี้ → เปลี่ยนแปลง + ผล SDQ
   • เรียงตาม: ลำดับ / ลดลงมากสุด / เพิ่มขึ้นมากสุด / GPA ต่ำสุด และกรองเฉพาะ ลดลง / ดีขึ้น / ต่ำกว่า 2.00
   โหลดหลัง 28-payments-ux.js
   ============================================================ */
(function () {
  'use strict';
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  const tkey = t => { const m = String(t || '').match(/(\d)\/(\d{4})/); return m ? +m[2] * 10 + +m[1] : 0; };
  const lvOf = t => (typeof gradeLevelOf === 'function') ? gradeLevelOf(t) : 1;
  const gName = lv => (typeof gradeName === 'function') ? gradeName(lv) : 'ม.' + lv;
  const gYear = lv => (typeof gradeYear === 'function') ? gradeYear(lv) : '';
  // สีตัวเลข GPA โทนเข้ม อ่านชัดบนพื้นขาว (ช่วงเดียวกับ gpaColor เดิม)
  const col = v => !(v > 0) ? 'var(--text3)' : v >= 3.5 ? '#15803D' : v >= 3.0 ? '#1D4ED8' : v >= 2.5 ? '#B45309' : v >= 2.0 ? '#C2410C' : '#B91C1C';
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const EPS = 0.005;   // ต่างกันน้อยกว่านี้ถือว่า "คงที่"

  /** GPA รายภาคเรียนของนักเรียน (เฉพาะที่มีค่า) เรียงตามเวลา */
  function series(s) {
    return (s.semGpa || []).filter(g => g && g.term && Number(g.gpa) > 0)
      .map(g => ({ term: g.term, gpa: Math.round(Number(g.gpa) * 100) / 100 }))
      .sort((a, b) => tkey(a.term) - tkey(b.term));
  }
  /** GPA ของภาคเรียน t และภาคก่อนหน้าที่มีข้อมูล */
  function at(ser, t) {
    const i = ser.findIndex(x => x.term === t);
    if (i < 0) {   // ภาคนี้ยังไม่มี GPA → ยังบอก "ภาคก่อนหน้า" ล่าสุดที่มี
      const before = ser.filter(x => tkey(x.term) < tkey(t)).pop();
      return { cur: null, prev: before ? before.gpa : null, prevTerm: before ? before.term : null };
    }
    return { cur: ser[i].gpa, prev: i > 0 ? ser[i - 1].gpa : null, prevTerm: i > 0 ? ser[i - 1].term : null };
  }
  const deltaOf = (cur, prev) => (cur != null && prev != null) ? Math.round((cur - prev) * 100) / 100 : null;
  function deltaHtml(d, o) {
    if (d == null) return `<span class="ac-d none">${(o && o.none) || '—'}</span>`;
    if (Math.abs(d) < EPS) return `<span class="ac-d same" title="เท่าเดิม">● 0.00</span>`;
    return d > 0 ? `<span class="ac-d up" title="เพิ่มขึ้น">▲ ${d.toFixed(2)}</span>` : `<span class="ac-d down" title="ลดลง">▼ ${Math.abs(d).toFixed(2)}</span>`;
  }
  function spark(ser) {
    if (ser.length < 2) return '';
    const w = 86, h = 26, p = 3;
    const xs = i => p + i * (w - 2 * p) / (ser.length - 1);
    const ys = v => h - p - (Math.max(0, Math.min(4, v)) / 4) * (h - 2 * p);
    const pts = ser.map((x, i) => `${xs(i).toFixed(1)},${ys(x.gpa).toFixed(1)}`).join(' ');
    const last = ser[ser.length - 1], prev = ser[ser.length - 2];
    const c = last.gpa > prev.gpa + EPS ? '#16A34A' : last.gpa < prev.gpa - EPS ? '#DC2626' : '#64748B';
    return `<svg class="ac-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      <polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      ${ser.map((x, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(x.gpa).toFixed(1)}" r="${i === ser.length - 1 ? 2.6 : 1.6}" fill="${i === ser.length - 1 ? c : '#94A3B8'}"/>`).join('')}
    </svg>`;
  }
  function sdqCell(s, t) {
    const b = s.sdq && s.sdq[t];
    let r = null; try { r = (b && b.__touched && window.SDQ) ? SDQ.compute(b) : null; } catch (e) {}
    if (r && r.complete) return `<span class="badge ${typeof sdqGroupBadge === 'function' ? sdqGroupBadge(r.totalGroup) : 'b-gray'}">${E(r.totalGroup)}</span>`;
    if (r) return `<span class="badge b-amber">กรอกบางส่วน (${r.totalAnswered}/25)</span>`;
    return `<span class="badge b-gray">ยังไม่ประเมิน</span>`;
  }
  function allTerms() {
    const set = new Set();
    DB.students.forEach(s => (s.semGpa || []).forEach(g => g && g.term && set.add(g.term)));
    return [...set].sort((a, b) => tkey(a) - tkey(b));
  }

  /* ---------- ตัวเลือกด้านบน + เครื่องมือเรียง/กรอง ---------- */
  populateGpaTerm = function () {
    const sel = document.getElementById('gpa-term-select'); if (!sel) return;
    const cur = sel.value; const terms = allTerms();
    const lvs = [...new Set(terms.map(lvOf))].sort((a, b) => a - b);
    sel.innerHTML = '<option value="">ภาพรวมทุกระดับชั้น</option>'
      + (lvs.length ? `<optgroup label="ทั้งปี (ตามระดับชั้น)">${lvs.map(lv => `<option value="grade:${lv}">${gName(lv)} — ปีการศึกษา ${gYear(lv)}</option>`).join('')}</optgroup>` : '')
      + ((typeof gradeTermOptions === 'function') ? gradeTermOptions(terms, '', t => `ภาคเรียนที่ ${t}`) : '');
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
    ensureTools();
  };
  function ensureTools() {
    const row = document.querySelector('#page-academic .search-row'); if (!row || document.getElementById('ac-sort')) return;
    const st = 'padding:7px 10px;border-radius:var(--rad);border:1px solid var(--border2);font-family:var(--font-body);font-size:13px;background:var(--bg4)';
    row.insertAdjacentHTML('beforeend', `
      <select id="ac-filter" style="${st}" onchange="renderAcademic()" aria-label="แสดงเฉพาะ">
        <option value="">ทุกคน</option><option value="down">เฉพาะผลการเรียนลดลง</option>
        <option value="up">เฉพาะผลการเรียนดีขึ้น</option><option value="low">เฉพาะ GPA ต่ำกว่า 2.00</option><option value="nodata">ยังไม่มี GPA</option>
      </select>
      <select id="ac-sort" style="${st}" onchange="renderAcademic()" aria-label="เรียงตาม">
        <option value="no">เรียงตามลำดับ</option><option value="down">ลดลงมากสุดก่อน</option>
        <option value="up">เพิ่มขึ้นมากสุดก่อน</option><option value="low">GPA ต่ำสุดก่อน</option><option value="high">GPA สูงสุดก่อน</option>
      </select>`);
    const inp = document.getElementById('gpa-search');
    if (inp) inp.placeholder = '🔍 ค้นหาชื่อ / โรงเรียน / จังหวัด / ลำดับ...';
  }

  /* ---------- วาดหน้า ---------- */
  renderAcademic = function () {
    const page = document.getElementById('page-academic'); if (!page) return;
    ensureTools();
    const sel = document.getElementById('gpa-term-select');
    const scope = sel ? sel.value : '';
    const q = (document.getElementById('gpa-search').value || '').trim().toLowerCase();
    const fSel = (document.getElementById('ac-filter') || {}).value || '';
    const sortBy = (document.getElementById('ac-sort') || {}).value || 'no';
    const terms = allTerms();
    const gm = /^grade:(\d+)$/.exec(scope);
    const showTerms = gm ? terms.filter(t => lvOf(t) === +gm[1]) : scope ? [scope] : terms;
    const lvs = [...new Set(showTerms.map(lvOf))].sort((a, b) => a - b);
    const students = DB.students.slice();
    const S = new Map(students.map(s => [s, series(s)]));

    // ข้อมูลเปรียบเทียบ "ภาคล่าสุดในช่วงที่เลือก เทียบภาคก่อน" ของแต่ละคน
    const last = new Map(students.map(s => {
      const ser = S.get(s).filter(x => showTerms.includes(x.term));
      if (!ser.length) return [s, { cur: null, prev: null, d: null, term: null }];
      const lt = ser[ser.length - 1].term; const a = at(S.get(s), lt);
      return [s, { cur: a.cur, prev: a.prev, prevTerm: a.prevTerm, d: deltaOf(a.cur, a.prev), term: lt }];
    }));

    /* ── การ์ดสรุป ── */
    const lastTerm = showTerms[showTerms.length - 1];
    const prevTermAll = lastTerm ? terms[terms.indexOf(lastTerm) - 1] : null;
    const gAt = t => students.map(s => (S.get(s).find(x => x.term === t) || {}).gpa).filter(v => v > 0);
    const avgNow = lastTerm ? avg(gAt(lastTerm)) : null;
    const avgPrev = prevTermAll ? avg(gAt(prevTermAll)) : null;
    const L = [...last.values()];
    const up = L.filter(x => x.d != null && x.d >= EPS).length, down = L.filter(x => x.d != null && x.d <= -EPS).length;
    const same = L.filter(x => x.d != null && Math.abs(x.d) < EPS).length;
    const low = L.filter(x => x.cur != null && x.cur < 2).length;
    const kpis = `<div class="ac-kpis">
      <div class="ac-kpi"><span>GPA เฉลี่ย ${lastTerm ? `ภาคเรียนที่ ${E(lastTerm)} (${E(gName(lvOf(lastTerm)))})` : ''}</span>
        <b style="color:${col(avgNow)}">${avgNow != null ? avgNow.toFixed(2) : '—'}</b>
        <small>${avgPrev != null && avgNow != null ? `เทียบภาค ${E(prevTermAll)}: ${deltaHtml(deltaOf(Math.round(avgNow * 100) / 100, Math.round(avgPrev * 100) / 100))}` : 'ยังไม่มีภาคก่อนหน้าให้เทียบ'}</small></div>
      <div class="ac-kpi up"><span>ผลการเรียนดีขึ้น</span><b>${up}</b><small>คน · เทียบภาคก่อน</small></div>
      <div class="ac-kpi down"><span>ผลการเรียนลดลง</span><b>${down}</b><small>คน · เทียบภาคก่อน</small></div>
      <div class="ac-kpi"><span>คงที่</span><b>${same}</b><small>คน</small></div>
      <div class="ac-kpi low"><span>GPA ล่าสุดต่ำกว่า 2.00</span><b>${low}</b><small>คน</small></div>
    </div>`;

    /* ── ตารางสรุป ชั้น → ภาคเรียน ── */
    const termStat = t => {
      const vals = []; let u = 0, dn = 0, sm = 0, lw = 0;
      students.forEach(s => { const a = at(S.get(s), t); if (a.cur == null) return; vals.push(a.cur); if (a.cur < 2) lw++;
        const d = deltaOf(a.cur, a.prev); if (d == null) return; if (d >= EPS) u++; else if (d <= -EPS) dn++; else sm++; });
      return { n: vals.length, a: avg(vals), u, dn, sm, lw };
    };
    let prevAvg = null, sumBody = '';
    const firstIdx = terms.indexOf(showTerms[0]);
    if (firstIdx > 0) { const pv = termStat(terms[firstIdx - 1]); prevAvg = pv.a; }
    let prevYear = null;
    if (lvs.length) { const pl = lvs[0] - 1; const pts = terms.filter(t => lvOf(t) === pl); if (pts.length) prevYear = avg(students.flatMap(s => S.get(s).filter(x => pts.includes(x.term)).map(x => x.gpa))); }
    lvs.forEach(lv => {
      const ts = showTerms.filter(t => lvOf(t) === lv);
      const allTs = terms.filter(t => lvOf(t) === lv);            // เฉลี่ยทั้งปีใช้ทุกภาคของชั้นนั้นเสมอ
      const yv = students.flatMap(s => S.get(s).filter(x => allTs.includes(x.term)).map(x => x.gpa));
      const ya = avg(yv);
      const yd = (ya != null && prevYear != null) ? deltaOf(Math.round(ya * 100) / 100, Math.round(prevYear * 100) / 100) : null;
      sumBody += `<tr class="ac-t-grade" data-scope="grade:${lv}"><td><b>${E(gName(lv))}</b> <span class="ac-yr">ปีการศึกษา ${gYear(lv)} · เฉลี่ยทั้งปี</span></td>
        <td class="num"><b style="color:${col(ya)}">${ya != null ? ya.toFixed(2) : '—'}</b></td><td class="num">${deltaHtml(yd, { none: 'ปีแรก' })}</td>
        <td class="num" colspan="5"></td></tr>`;
      prevYear = ya;
      ts.forEach(t => {
        const st = termStat(t);
        const d = (st.a != null && prevAvg != null) ? deltaOf(Math.round(st.a * 100) / 100, Math.round(prevAvg * 100) / 100) : null;
        sumBody += `<tr class="ac-t-term" data-scope="${E(t)}"><td><span class="ac-indent">ภาคเรียนที่ ${E(t)}</span></td>
          <td class="num"><b style="color:${col(st.a)}">${st.a != null ? st.a.toFixed(2) : '—'}</b></td>
          <td class="num">${deltaHtml(d, { none: 'ภาคแรก' })}</td>
          <td class="num">${st.n}</td>
          <td class="num up">${st.u ? '▲ ' + st.u : '0'}</td><td class="num">${st.sm}</td><td class="num down">${st.dn ? '▼ ' + st.dn : '0'}</td>
          <td class="num ${st.lw ? 'warn' : ''}">${st.lw}</td></tr>`;
        if (st.a != null) prevAvg = st.a;
      });
    });
    const summary = `<div class="ac-summary">${kpis}
      <div class="tbl-wrap ac-sum-wrap"><table class="ac-sum-table">
        <thead><tr><th>ระดับชั้น / ภาคเรียน</th><th class="num">GPA เฉลี่ย</th><th class="num">เทียบช่วงก่อน</th><th class="num">มีข้อมูล (คน)</th>
          <th class="num">ดีขึ้น</th><th class="num">คงที่</th><th class="num">ลดลง</th><th class="num">ต่ำกว่า 2.00</th></tr></thead>
        <tbody>${sumBody || '<tr><td colspan="8" class="ac-none">ยังไม่มีข้อมูล GPA</td></tr>'}</tbody></table></div>
      <div class="ac-sum-hint">"ดีขึ้น / ลดลง" เทียบกับภาคเรียนก่อนหน้าของนักเรียนคนเดียวกัน · กดที่แถวเพื่อดูรายคนเฉพาะชั้นหรือภาคเรียนนั้น</div>
    </div>`;

    /* ── ตารางรายคน ── */
    let list = students.filter(s => !q || [s.name, s.nickname, s.school_m1, s.province, s.no].join(' ').toLowerCase().includes(q));
    list = list.filter(s => { const x = last.get(s);
      if (fSel === 'down') return x.d != null && x.d <= -EPS;
      if (fSel === 'up') return x.d != null && x.d >= EPS;
      if (fSel === 'low') return x.cur != null && x.cur < 2;
      if (fSel === 'nodata') return x.cur == null;
      return true; });
    const big = v => v == null ? 99 : v;
    list.sort((a, b) => { const A = last.get(a), B = last.get(b);
      if (sortBy === 'down') return big(A.d) - big(B.d) || (+a.no || 0) - (+b.no || 0);
      if (sortBy === 'up') return (B.d ?? -99) - (A.d ?? -99) || (+a.no || 0) - (+b.no || 0);
      if (sortBy === 'low') return big(A.cur) - big(B.cur);
      if (sortBy === 'high') return (B.cur ?? -1) - (A.cur ?? -1);
      return (+a.no || 0) - (+b.no || 0); });

    const edit = idx => `<button class="btn btn-sm" onclick="openStudentDetail(${idx});setTimeout(()=>switchTabByName('📊 ประวัติ GPA'),150)">แก้ไข</button>`;
    let head = '', body = '';
    if (showTerms.length === 1) {
      const t = showTerms[0];
      head = `<tr><th>ลำดับ</th><th>ชื่อ-สกุล</th><th>จังหวัด</th><th class="num">ภาคก่อนหน้า</th><th class="num">ภาคเรียนที่ ${E(t)}</th><th class="num">เปลี่ยนแปลง</th><th>ผล SDQ</th><th></th></tr>`;
      body = list.map(s => { const idx = DB.students.indexOf(s); const a = at(S.get(s), t); const d = deltaOf(a.cur, a.prev);
        return `<tr class="${a.cur == null ? 'ac-norow' : ''}"><td>${E(s.no ?? '')}</td>
          <td class="ac-name">${E(s.name || '-')}<small>${E(s.school_m1 || '')}</small></td>
          <td><span class="badge b-blue">${E(s.province || '-')}</span></td>
          <td class="num">${a.prev != null ? `<span style="color:${col(a.prev)}">${a.prev.toFixed(2)}</span><small class="ac-pt">${E(a.prevTerm)}</small>` : '<span class="ac-none">—</span>'}</td>
          <td class="num">${a.cur != null ? `<b class="ac-big" style="color:${col(a.cur)}">${a.cur.toFixed(2)}</b>` : '<span class="ac-none">ยังไม่มี GPA</span>'}</td>
          <td class="num">${deltaHtml(d)}</td><td>${sdqCell(s, t)}</td><td>${edit(idx)}</td></tr>`; }).join('');
    } else {
      const lvCols = lvs.map(lv => ({ lv, ts: showTerms.filter(t => lvOf(t) === lv) }));
      head = `<tr><th rowspan="2">ลำดับ</th><th rowspan="2">ชื่อ-สกุล</th><th rowspan="2" class="num">GPA ป.6</th>`
        + lvCols.map(c => `<th colspan="${c.ts.length + 1}" class="ac-grp">${E(gName(c.lv))} · ${gYear(c.lv)}</th>`).join('')
        + `<th rowspan="2">แนวโน้ม</th><th rowspan="2" class="num">ล่าสุดเทียบภาคก่อน</th><th rowspan="2"></th></tr><tr>`
        + lvCols.map(c => c.ts.map(t => `<th class="num">ภาค ${E(t.split('/')[0])}</th>`).join('') + `<th class="num ac-sub">เฉลี่ยปี</th>`).join('') + '</tr>';
      body = list.map(s => { const idx = DB.students.indexOf(s); const ser = S.get(s); const x = last.get(s);
        const cells = lvCols.map(c => {
          const vals = [];
          const tds = c.ts.map(t => { const a = at(ser, t); if (a.cur == null) return `<td class="num ac-none">—</td>`; vals.push(a.cur);
            const d = deltaOf(a.cur, a.prev);
            return `<td class="num"><b style="color:${col(a.cur)}">${a.cur.toFixed(2)}</b><div>${d != null ? deltaHtml(d) : ''}</div></td>`; }).join('');
          const ya = avg(vals);
          return tds + `<td class="num ac-sub">${ya != null ? `<b style="color:${col(ya)}">${ya.toFixed(2)}</b>` : '—'}</td>`;
        }).join('');
        const p6 = Number(s.gpa_p6) > 0 ? Number(s.gpa_p6) : null;
        return `<tr><td>${E(s.no ?? '')}</td><td class="ac-name">${E(s.name || '-')}<small>${E(s.school_m1 || '')} · ${E(s.province || '')}</small></td>
          <td class="num" style="color:${col(p6)}">${p6 != null ? p6.toFixed(2) : '—'}</td>${cells}
          <td>${spark(p6 != null ? [{ term: 'ป.6', gpa: p6 }, ...ser.filter(v => showTerms.includes(v.term))] : ser.filter(v => showTerms.includes(v.term)))}</td>
          <td class="num">${x.cur != null ? deltaHtml(x.d, { none: 'ภาคแรก' }) : '<span class="ac-none">ยังไม่มี GPA</span>'}</td>
          <td>${edit(idx)}</td></tr>`; }).join('');
    }

    let host = document.getElementById('ac-summary-host');
    if (!host) {
      host = document.createElement('div'); host.id = 'ac-summary-host';
      page.insertBefore(host, page.querySelector('.search-row'));
      host.addEventListener('click', e => { const tr = e.target.closest('tr[data-scope]'); if (!tr || !sel) return;
        sel.value = tr.dataset.scope; renderAcademic();
        const t = page.querySelector('.tbl-wrap:not(.ac-sum-wrap)'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    }
    host.innerHTML = summary;
    const table = page.querySelector('.tbl-wrap:not(.ac-sum-wrap) table');
    if (table) {
      table.classList.add('ac-matrix');
      table.querySelector('thead').innerHTML = head;
      document.getElementById('academic-tbody').innerHTML = body || `<tr><td colspan="20" class="ac-none" style="text-align:center;padding:22px">ไม่พบนักเรียนตามเงื่อนไข</td></tr>`;
    }
    const scopeText = gm ? `${gName(+gm[1])} ปีการศึกษา ${gYear(+gm[1])}` : scope ? `ภาคเรียนที่ ${scope} (${gName(lvOf(scope))})` : 'ทุกระดับชั้น';
    document.getElementById('academic-footer').textContent = `${scopeText} • แสดง ${list.length} คน`;
  };
})();
