/* ============================================================
   45-mi-dashboard.js — Dashboard สรุปผลแววความสามารถพิเศษ (MI) + ความสอดคล้องกับอาชีพที่นักเรียนอยากเป็น
   ------------------------------------------------------------
   แหล่งข้อมูล: students[].mi (แบบสำรวจ MI) + แบบฟอร์มที่ 2 "ความคาดหวังด้านอาชีพ" (หมวดที่เลือก/ข้อความ)
   ความสอดคล้อง (รายคน):
     1) จับคู่อาชีพที่อยากเป็น (หมวดของแบบฟอร์มที่ 2) → สายอาชีพของแบบสำรวจ MI (ตาราง CAREER_TO_PATH)
     2) จัดอันดับสายอาชีพทั้ง 18 สายจากโปรไฟล์ MI ของนักเรียนคนนั้น
     3) ดูอันดับที่ดีที่สุดของสายที่นักเรียนอยากเป็น:
          อันดับ 1–3 = สอดคล้อง · 4–6 = ใกล้เคียง · 7 ขึ้นไป = ยังไม่สอดคล้อง
        อยากเป็น "ยังไม่แน่ใจ" หรือจับคู่ไม่ได้ = ยังไม่ชัดเจน (ใช้ผล MI ช่วยแนะแนว)
   ============================================================ */
(function () {
  'use strict';
  if (typeof MI === 'undefined') return;
  const E = v => (typeof escHtml === 'function') ? escHtml(v) : String(v ?? '');
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

  const CAREER_TO_PATH = {
    med: ['การแพทย์และวิทยาศาสตร์สุขภาพ'],
    vet: ['การแพทย์และวิทยาศาสตร์สุขภาพ', 'เกษตร อาหาร และสิ่งแวดล้อม'],
    teach: ['การศึกษาและพัฒนาคน'],
    eng: ['วิศวกรรมและเทคโนโลยี', 'สถาปัตยกรรมและการออกแบบพื้นที่'],
    it: ['คอมพิวเตอร์ ข้อมูล และ AI'],
    sec: ['กฎหมาย การปกครอง และรัฐกิจ', 'กีฬาและวิทยาศาสตร์การกีฬา'],
    gov: ['กฎหมาย การปกครอง และรัฐกิจ'],
    law: ['กฎหมาย การปกครอง และรัฐกิจ', 'การเงิน บัญชี และเศรษฐศาสตร์'],
    biz: ['ธุรกิจ การตลาด และผู้ประกอบการ', 'การเงิน บัญชี และเศรษฐศาสตร์'],
    art: ['ศิลปะ ดีไซน์ และสื่อดิจิทัล', 'การเขียนและสื่อสารมวลชน', 'ศิลปะการแสดงและบันเทิง', 'ดนตรีและเสียง'],
    sport: ['กีฬาและวิทยาศาสตร์การกีฬา'],
    svc: ['ภาษาต่างประเทศ ท่องเที่ยว และการบริการ', 'เกษตร อาหาร และสิ่งแวดล้อม'],
    tech: ['ช่างเทคนิคและอุตสาหกรรม', 'วิศวกรรมและเทคโนโลยี'],
    sci: ['นักวิทยาศาสตร์และนักวิจัย'],
    agri: ['เกษตร อาหาร และสิ่งแวดล้อม'],
    abroad: ['ภาษาต่างประเทศ ท่องเที่ยว และการบริการ']
  };
  const AL = {
    match: { t: 'สอดคล้อง', c: '#16A34A', d: 'สายที่อยากเป็นอยู่ใน 3 อันดับแรกของผล MI' },
    near: { t: 'ใกล้เคียง', c: '#3B82F6', d: 'สายที่อยากเป็นอยู่อันดับ 4–6' },
    low: { t: 'ยังไม่สอดคล้อง', c: '#F59E0B', d: 'สายที่อยากเป็นอยู่อันดับ 7 ขึ้นไป' },
    unsure: { t: 'ยังไม่ชัดเจน', c: '#A855F7', d: 'ยังไม่แน่ใจอาชีพ หรือระบุไม่ตรงหมวด' },
    nocar: { t: 'ยังไม่ระบุอาชีพ', c: '#64748B', d: 'มีผล MI แต่ยังไม่มีข้อมูลอาชีพในแบบฟอร์มที่ 2' },
    nomi: { t: 'ยังไม่ทำ MI', c: '#94A3B8', d: 'ยังไม่มีผลแบบสำรวจ' }
  };
  const st = { q: '', al: 'all' };

  function careerOf(s) {
    // ใช้ตัวรวบรวมของ Dashboard แบบฟอร์มที่ 2 (หมวดที่ติ๊ก + จับคำสำคัญ) — ภาคล่าสุดของแต่ละคน
    const rows = (window.Form2Insights && Form2Insights.collect) ? (careerOf._cache || (careerOf._cache = Form2Insights.collect())) : [];
    return rows.find(r => r.s === s) || null;
  }
  function analyze(s, idx) {
    const m = s.mi;
    const row = careerOf(s);
    const cats = row && row.career ? (row.careerCat || []) : [];
    const out = { s, idx, m, row, cats, text: row ? row.career : '', al: 'nomi', best: null, bestPath: '', ranks: [] };
    if (!m || !m.basic) return out;
    const p = {}; MI.DOMS.forEach(d => { p[d] = ((m.basic[d] && m.basic[d].p) || 0) / 100; });
    out.ranks = MI.rank(p);
    out.top = out.ranks.slice(0, 3);
    out.strong = MI.DOMS.filter(d => m.spec && m.spec[d] && m.spec[d].level === 2);
    if (!row || !row.career) { out.al = 'nocar'; return out; }
    const paths = [...new Set(cats.flatMap(k => CAREER_TO_PATH[k] || []))];
    if (!paths.length) { out.al = 'unsure'; return out; }
    let best = 99, bestPath = '';
    paths.forEach(n => { const r = out.ranks.findIndex(x => x.n === n) + 1; if (r && r < best) { best = r; bestPath = n; } });
    out.best = best; out.bestPath = bestPath; out.wantPaths = paths;
    out.al = best <= 3 ? 'match' : best <= 6 ? 'near' : 'low';
    return out;
  }

  function page() {
    let p = document.getElementById('page-midash');
    if (!p) {
      p = document.createElement('div'); p.id = 'page-midash'; p.className = 'page';
      const ref = document.getElementById('page-formtrack') || document.querySelector('.main .page:last-of-type');
      (ref ? ref.parentNode : document.querySelector('.main')).appendChild(p);
      bind(p);
    }
    return p;
  }

  function render() {
    const host = page();
    careerOf._cache = null;
    const all = (DB.students || []).map((s, i) => analyze(s, i));
    const N = all.length, withMi = all.filter(r => r.m && r.m.basic), withSpec = withMi.filter(r => Object.keys(r.m.spec || {}).length);
    const both = withMi.filter(r => ['match', 'near', 'low'].includes(r.al));
    const cnt = {}; Object.keys(AL).forEach(k => cnt[k] = all.filter(r => r.al === k).length);
    const strongN = withMi.filter(r => r.strong.length).length;

    // รายด้าน
    const dom = MI.DOMS.map(d => ({ d, pass: withMi.filter(r => r.m.basic[d] && r.m.basic[d].ok).length,
      l2: withMi.filter(r => r.m.spec && r.m.spec[d] && r.m.spec[d].level === 2).length,
      l1: withMi.filter(r => r.m.spec && r.m.spec[d] && r.m.spec[d].level === 1).length })).sort((a, b) => b.pass - a.pass);
    const maxPass = Math.max(1, ...dom.map(x => x.pass));
    // สายอาชีพ: MI อันดับ 1 vs อยากเป็น
    const pathNames = MI.rank(Object.fromEntries(MI.DOMS.map(d => [d, 0]))).map(x => x.n);
    const miTop = {}, want = {};
    withMi.forEach(r => { const n = r.top[0].n; miTop[n] = (miTop[n] || 0) + 1; });
    all.forEach(r => { if (r.row && r.row.career) [...new Set(r.cats.flatMap(k => CAREER_TO_PATH[k] || []))].forEach(n => want[n] = (want[n] || 0) + 1); });
    const pathRows = pathNames.map(n => ({ n, mi: miTop[n] || 0, w: want[n] || 0 })).filter(x => x.mi || x.w).sort((a, b) => (b.mi + b.w) - (a.mi + a.w));
    const maxP = Math.max(1, ...pathRows.map(x => Math.max(x.mi, x.w)));
    const icon = n => { try { return (PATHS.find(p => p.n === n) || {}).i || ''; } catch (e) { return ''; } };

    // โดนัทความสอดคล้อง
    const order = ['match', 'near', 'low', 'unsure', 'nocar', 'nomi'];
    let acc = 0; const tot = N || 1;
    const donut = order.filter(k => cnt[k]).map(k => { const a = acc / tot * 360; acc += cnt[k]; return `${AL[k].c} ${a}deg ${acc / tot * 360}deg`; }).join(',') || '#E2E8F0 0 360deg';

    // ข้อสังเกต
    const tips = [];
    if (withMi.length) tips.push(`ทำแบบสำรวจขั้นต้นแล้ว <b>${withMi.length}</b> จาก ${N} คน (${pct(withMi.length, N)}%)${N - withMi.length ? ` · ยังไม่ทำ ${N - withMi.length} คน` : ''}`);
    if (dom[0] && dom[0].pass) tips.push(`ด้านที่นักเรียนผ่านเกณฑ์ขั้นต้นมากที่สุด: <b>${E(MI.name(dom[0].d))}</b> (${dom[0].pass} คน)${dom[1] && dom[1].pass ? ` รองลงมาคือ ${E(MI.name(dom[1].d))} (${dom[1].pass} คน)` : ''}`);
    if (both.length) tips.push(`ในกลุ่มที่มีทั้งผล MI และอาชีพที่อยากเป็น (${both.length} คน): สอดคล้อง <b>${cnt.match}</b> คน (${pct(cnt.match, both.length)}%) · ใกล้เคียง ${cnt.near} · ยังไม่สอดคล้อง ${cnt.low}`);
    if (cnt.low) tips.push(`<b>${cnt.low} คนยังไม่สอดคล้อง</b> — ควรพูดคุยสำรวจความสนใจเพิ่ม ให้ข้อมูลสายอาชีพที่ตรงกับจุดเด่น หรือวางแผนพัฒนาทักษะที่จำเป็นสำหรับอาชีพที่อยากเป็น`);
    if (cnt.unsure) { const g = {}; all.filter(r => r.al === 'unsure').forEach(r => { const n = r.top[0].n; g[n] = (g[n] || 0) + 1; });
      const top = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, c]) => `${n} (${c})`);
      tips.push(`<b>${cnt.unsure} คนยังไม่ชัดเจนเรื่องอาชีพ</b> — ใช้ผล MI ช่วยแนะแนว: สายที่เด่นในกลุ่มนี้คือ ${E(top.join(', '))}`); }
    if (cnt.nocar) tips.push(`${cnt.nocar} คนมีผล MI แต่ยังไม่ระบุอาชีพในแบบฟอร์มที่ 2`);

    // ตาราง
    const q = st.q.trim().toLowerCase();
    const list = all.filter(r => (st.al === 'all' || r.al === st.al) && (!q || ((r.s.name || '') + (r.s.school_m1 || '') + (r.text || '')).toLowerCase().includes(q)))
      .sort((a, b) => order.indexOf(a.al) - order.indexOf(b.al) || (a.s.no || 0) - (b.s.no || 0));
    const chip = (k, t, n) => `<button type="button" class="md-chip ${st.al === k ? 'on' : ''}" data-md-al="${k}" ${k !== 'all' ? `style="--c:${AL[k].c}"` : ''}>${t} <b>${n}</b></button>`;
    const rowHtml = r => {
      const al = AL[r.al];
      const strong = r.m ? (r.strong.length ? r.strong : (r.m.passed || []).slice(0, 3)) : [];
      return `<tr><td class="n">${E(r.s.no ?? '')}</td>
        <td><div class="md-who">${typeof photoEl === 'function' ? photoEl(r.s) : ''}<div><b>${E(r.s.name || '')}</b><span>${E(r.s.school_m1 || '-')}</span></div></div></td>
        <td>${strong.map(d => `<span class="md-dom" style="--c:${MI.color(d)}">${E(MI.short(d))}${r.strong.includes(d) ? ' ★' : ''}</span>`).join('') || '<span class="md-dash">—</span>'}</td>
        <td>${r.top ? r.top.map((x, i) => `<div class="md-path${r.bestPath === x.n ? ' hit' : ''}">${i + 1}. ${icon(x.n)} ${E(x.n)}</div>`).join('') : '<span class="md-dash">—</span>'}</td>
        <td>${r.text ? `<div class="md-want">${E(r.text.length > 90 ? r.text.slice(0, 88) + '…' : r.text)}</div>` : '<span class="md-dash">—</span>'}</td>
        <td><span class="md-al" style="--c:${al.c}">${al.t}</span>${r.best && r.best < 99 ? `<small class="md-rank">${E(r.bestPath)} อยู่อันดับ ${r.best}</small>` : ''}</td>
        <td class="act"><button type="button" class="btn btn-sm" data-md-open="${r.idx}">ดูข้อมูล</button></td></tr>`;
    };

    host.innerHTML = `<div class="md">
      <header class="md-head"><div><span class="dv-kicker">แววความสามารถพิเศษ × อาชีพที่อยากเป็น</span><h2>สรุปผลการวัดแววความสามารถพิเศษ</h2>
        <p>จากแบบสำรวจ MI และ "ความคาดหวังด้านอาชีพ" ในแบบฟอร์มที่ 2 (ภาคล่าสุดของแต่ละคน)</p></div>
        <div class="md-tools"><button type="button" class="btn" data-md-sync>🧠 ดึงผลแบบสำรวจล่าสุด</button><button type="button" class="btn" data-md-csv>ส่งออก CSV</button></div></header>

      <section class="md-kpis">
        <div class="md-kpi"><span>ทำแบบสำรวจขั้นต้นแล้ว</span><b>${withMi.length}<small>/${N}</small></b><em>${pct(withMi.length, N)}% ของนักเรียนทั้งหมด</em></div>
        <div class="md-kpi"><span>ทำแบบเฉพาะด้านเพิ่ม</span><b>${withSpec.length}</b><em>คน · ยืนยันผลแม่นยำขึ้น</em></div>
        <div class="md-kpi"><span>มีแววความสามารถพิเศษ (ยืนยันแล้ว)</span><b>${strongN}</b><em>คน · อย่างน้อย 1 ด้าน</em></div>
        <div class="md-kpi ok"><span>อาชีพที่อยากเป็นสอดคล้องกับผล MI</span><b>${pct(cnt.match, both.length)}%</b><em>${cnt.match} จาก ${both.length} คนที่มีข้อมูลครบ</em></div>
      </section>

      <section class="md-grid">
        <article class="md-card"><h3>จุดเด่นรายด้าน (8 ด้าน)</h3><p class="md-sub">จำนวนนักเรียนที่ผ่านเกณฑ์ขั้นต้น · ★ ยืนยันว่ามีแววจากแบบเฉพาะด้าน</p>
          <ul class="md-doms">${dom.map(x => `<li><span class="md-dn"><i style="background:${MI.color(x.d)}"></i>${E(MI.name(x.d))}</span>
            <span class="md-bar"><span style="width:${(x.pass / maxPass * 100).toFixed(1)}%;background:${MI.color(x.d)}"></span></span>
            <span class="md-v"><b>${x.pass}</b> คน${x.l2 ? ` · ★${x.l2}` : ''}${x.l1 ? ` · ควรส่งเสริม ${x.l1}` : ''}</span></li>`).join('')}</ul></article>
        <article class="md-card"><h3>ความสอดคล้องรายคน</h3><p class="md-sub">อาชีพที่อยากเป็น เทียบกับอันดับสายอาชีพจากผล MI ของคนนั้น</p>
          <div class="md-donut-wrap"><div class="md-donut" style="background:conic-gradient(${donut})"><div><b>${pct(cnt.match, both.length)}%</b><span>สอดคล้อง</span></div></div>
            <ul class="md-legend">${order.map(k => `<li><i style="background:${AL[k].c}"></i><span title="${E(AL[k].d)}">${AL[k].t}</span><b>${cnt[k]}</b></li>`).join('')}</ul></div>
          <p class="md-note">สอดคล้อง = อันดับ 1–3 · ใกล้เคียง = 4–6 · ยังไม่สอดคล้อง = 7 ขึ้นไป (จาก 18 สายอาชีพ)</p></article>
      </section>

      <section class="md-card"><h3>สายอาชีพ: ผล MI แนะนำ เทียบกับที่นักเรียนอยากเป็น</h3>
        <p class="md-sub"><span class="md-key mi"></span>ผล MI แนะนำเป็นอันดับ 1 &nbsp; <span class="md-key w"></span>นักเรียนอยากเป็น (แบบฟอร์มที่ 2) — แท่งต่างกันมาก = ความต้องการกับจุดเด่นของกลุ่มยังไม่ตรงกัน</p>
        <ul class="md-paths">${pathRows.map(x => `<li><span class="md-pn">${icon(x.n)} ${E(x.n)}</span>
          <span class="md-dual"><span class="mi" style="width:${(x.mi / maxP * 100).toFixed(1)}%"></span><span class="w" style="width:${(x.w / maxP * 100).toFixed(1)}%"></span></span>
          <span class="md-pv">${x.mi} · ${x.w}</span></li>`).join('') || '<li class="md-dash">ยังไม่มีข้อมูล</li>'}</ul></section>

      ${tips.length ? `<section class="md-card md-tips"><h3>ข้อสังเกตและแนวทาง</h3><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul></section>` : ''}

      <section class="md-card md-list">
        <div class="md-ftools"><div class="md-chips">${chip('all', 'ทั้งหมด', N)}${order.map(k => chip(k, AL[k].t, cnt[k])).join('')}</div>
          <input type="search" class="md-q" placeholder="ค้นหาชื่อ โรงเรียน หรืออาชีพ" value="${E(st.q)}"></div>
        <div class="md-tw"><table class="md-table"><thead><tr><th>ลำดับ</th><th>นักเรียน</th><th>จุดเด่น (MI)</th><th>สายอาชีพที่เหมาะ (MI)</th><th>อาชีพที่อยากเป็น (แบบฟอร์มที่ 2)</th><th>ความสอดคล้อง</th><th></th></tr></thead>
          <tbody>${list.map(rowHtml).join('') || '<tr><td colspan="7" class="md-dash" style="text-align:center;padding:24px">ไม่พบนักเรียนตามเงื่อนไข</td></tr>'}</tbody></table></div>
      </section></div>`;
    host._rows = all;
    const qi = host.querySelector('.md-q'); if (render._keep != null && qi) { qi.focus(); qi.setSelectionRange(render._keep, render._keep); render._keep = null; }
  }

  function csv(rows) {
    const safe = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const head = ['ลำดับ', 'ชื่อ-สกุล', 'โรงเรียน', 'ทำ MI วันที่', 'ผ่านเกณฑ์ขั้นต้น', 'มีแวว (ยืนยัน)', 'สายอาชีพ MI อันดับ 1', 'อันดับ 2', 'อันดับ 3', 'อาชีพที่อยากเป็น', 'ความสอดคล้อง', 'อันดับของสายที่อยากเป็น'];
    const lines = [head.map(safe).join(',')].concat(rows.slice().sort((a, b) => (a.s.no || 0) - (b.s.no || 0)).map(r => [
      r.s.no, r.s.name, r.s.school_m1, r.m && r.m.updatedAt ? new Date(r.m.updatedAt).toLocaleDateString('th-TH') : '',
      r.m ? (r.m.passed || []).map(MI.name).join(' / ') : '', r.m ? r.strong.map(MI.name).join(' / ') : '',
      r.top ? r.top[0].n : '', r.top ? r.top[1].n : '', r.top ? r.top[2].n : '', r.text, AL[r.al].t, r.best && r.best < 99 ? `${r.bestPath} (อันดับ ${r.best})` : ''
    ].map(safe).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'สรุปผลแววความสามารถ_MI.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function bind(p) {
    p.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mdAl) { st.al = b.dataset.mdAl; render(); return; }
      if (b.dataset.mdOpen) { openStudentDetail(+b.dataset.mdOpen); setTimeout(() => { try { sdxShowGroup(2); document.getElementById('mi-card').scrollIntoView({ block: 'start' }); } catch (x) {} }, 200); return; }
      if (b.hasAttribute('data-md-csv')) { csv(p._rows || []); return; }
      if (b.hasAttribute('data-md-sync') && window.MISystem) MISystem.syncAll().then(render);
    });
    p.addEventListener('input', e => { if (e.target.classList.contains('md-q')) { st.q = e.target.value; render._keep = e.target.selectionStart; render(); } });
  }

  // เมนู + เชื่อม showPage
  if (typeof PAGE_META === 'object') PAGE_META.midash = { title: 'สรุปผลแววความสามารถ', sub: 'ผลแบบสำรวจแววความสามารถพิเศษ (MI) และความสอดคล้องกับอาชีพที่นักเรียนอยากเป็น' };
  const _show = window.showPage;
  window.showPage = function (p) { if (p === 'midash') page(); const r = _show.apply(this, arguments); if (p === 'midash') { try { render(); } catch (e) { console.warn(e); } } return r; };
  function addNav() {
    if (document.getElementById('midash-nav')) return;
    const after = document.getElementById('mi-nav'); if (!after) { setTimeout(addNav, 500); return; }
    const b = document.createElement('button'); b.className = 'nav-btn'; b.id = 'midash-nav'; b.type = 'button';
    b.setAttribute('onclick', "showPage('midash',this)");
    b.innerHTML = '<span class="nav-icon">🧭</span> สรุปผลแววความสามารถ';
    after.insertAdjacentElement('beforebegin', b);
    if (window.STUDENT_MODE) b.style.display = 'none';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(addNav, 300)); else setTimeout(addNav, 300);
  window.MIDashboard = { render, analyze, CAREER_TO_PATH };
})();
