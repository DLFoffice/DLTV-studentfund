/* ============================================================
   08-gpa-sheet.js — หน้าตารางผลการเรียน (GPA Sheet) + export
   (แยกมาจาก index.html เดิม บรรทัด 2490-2829 โดยรักษาลำดับโค้ดเดิม)
   ============================================================ */
/* ============================================================
   v23: ระดับชั้นผูกกับปีการศึกษา — ใช้ร่วมกันทุกหน้าที่มีภาคเรียน
     ปีการศึกษา 2568 (ภาค 1, 2) = ม.1
     ปีการศึกษา 2569 (ภาค 1, 2) = ม.2   … ต่อไปเรื่อย ๆ จนถึง ม.6
     หลังจาก ม.6 = อุดมศึกษา ปี 1, 2, …  (ทุนต่อเนื่องถึงปริญญาตรี)
   เปลี่ยนปีเริ่มต้นได้ที่ GRADE_BASE_YEAR ที่เดียว
   ============================================================ */
const BASE_YEAR = 2568;              // ปีการศึกษาที่นักเรียนทุนรุ่นนี้เรียน ม.1 (คงชื่อเดิมไว้ให้โค้ดเก่า)
const GRADE_BASE_YEAR = BASE_YEAR;
function gradeLevelOf(term){
  const m = String(term || '').match(/(\d+)\/(\d{4})/);
  if(!m) return 1;
  return Math.max(1, parseInt(m[2], 10) - GRADE_BASE_YEAR + 1);
}
function gradeName(level){
  const n = Math.max(1, level|0);
  return n <= 6 ? `ม.${n}` : `อุดมศึกษา ปี ${n - 6}`;
}
function gradeStage(level){ return level <= 3 ? 'มัธยมศึกษาตอนต้น' : level <= 6 ? 'มัธยมศึกษาตอนปลาย' : 'อุดมศึกษา'; }
function gradeYear(level){ return GRADE_BASE_YEAR + Math.max(1, level|0) - 1; }
function gradeTerms(level){ const y = gradeYear(level); return [`1/${y}`, `2/${y}`]; }
function gradeFromTerm(term){ return gradeName(gradeLevelOf(term)); }
/** เรียงชื่อชั้นตามลำดับจริง (ม.2 ก่อน ม.10 / ม.6 ก่อน อุดมศึกษา) */
function gradeCmp(a, b){
  const lv = g => { const m = String(g).match(/^ม\.(\d+)/); if(m) return +m[1]; const u = String(g).match(/อุดมศึกษา ปี (\d+)/); return u ? 6 + (+u[1]) : 99; };
  return lv(a) - lv(b);
}
/** <option> ของภาคเรียน จัดกลุ่ม <optgroup> ตามระดับชั้น */
function gradeTermOptions(terms, cur, labelFn){
  const byLv = new Map();
  [...new Set(terms)].forEach(t => { const lv = gradeLevelOf(t); if(!byLv.has(lv)) byLv.set(lv, []); byLv.get(lv).push(t); });
  const lab = labelFn || (t => `ภาคเรียนที่ ${t}`);
  return [...byLv.keys()].sort((a,b)=>a-b).map(lv => {
    const ts = byLv.get(lv).sort((a,b)=>{ const pa=a.split('/'), pb=b.split('/'); return (+pa[1]-+pb[1]) || (+pa[0]-+pb[0]); });
    return `<optgroup label="${gradeName(lv)} — ปีการศึกษา ${gradeYear(lv)}">`
      + ts.map(t=>`<option value="${t}" ${t===cur?'selected':''}>${lab(t)}</option>`).join('') + '</optgroup>';
  }).join('');
}
/** "1/2568 (ม.1)" — ใช้ทุกที่ที่แสดงภาคเรียนแบบย่อ */
function termWithGrade(t){ return t ? `${t} (${gradeFromTerm(t)})` : '-'; }
window.GradeLevel = { base: GRADE_BASE_YEAR, of: gradeLevelOf, name: gradeName, fromTerm: gradeFromTerm,
  stage: gradeStage, year: gradeYear, terms: gradeTerms, cmp: gradeCmp, termOptions: gradeTermOptions };

function getAllTermsSorted(){
  const terms = new Set();
  DB.students.forEach(s=>(s.semGpa||[]).forEach(g=>{ if(g.term) terms.add(g.term); }));
  return [...terms].sort((a,b)=>{
    const pa=String(a).match(/(\d+)\/(\d+)/), pb=String(b).match(/(\d+)\/(\d+)/);
    if(!pa||!pb) return String(a).localeCompare(String(b));
    return (parseInt(pa[2])*10+parseInt(pa[1])) - (parseInt(pb[2])*10+parseInt(pb[1]));
  });
}

function populateGpsTermFilter(){
  const terms = getAllTermsSorted();
  // v23: ตัวกรองระดับชั้นสร้างจากข้อมูลจริง (ม.1 … ชั้นล่าสุด) + ภาคเรียนจัดกลุ่มตามชั้น
  const gSel = document.getElementById('gps-filter-grade');
  if (gSel) {
    const curG = gSel.value;
    const maxLv = Math.max(1, ...terms.map(gradeLevelOf), (window.Term && Term.active) ? gradeLevelOf(Term.active()) : 1);
    gSel.innerHTML = '<option value="">ทุกชั้น</option>' + Array.from({length:maxLv},(_,i)=>{
      const nm = gradeName(i+1); return `<option value="${nm}" ${nm===curG?'selected':''}>${nm} (ปีการศึกษา ${gradeYear(i+1)})</option>`; }).join('');
  }
  const sel = document.getElementById('gps-filter-term');
  const cur = sel.value;
  const fg = gSel ? gSel.value : '';
  const shown = fg ? terms.filter(t=>gradeFromTerm(t)===fg) : terms;
  sel.innerHTML = '<option value="">ภาคเรียนล่าสุดของแต่ละคน</option>' + gradeTermOptions(shown, shown.includes(cur)?cur:'', t=>`ภาคเรียนที่ ${t}`);
}

/* v56: 1 แถว = นักเรียน 1 คน · ใช้ "ภาคเรียนล่าสุด" (หรือภาคที่กรอง) เทียบภาคก่อนหน้า + ค่าเฉลี่ยปีการศึกษาล่าสุดเทียบปีก่อน
   (เดิมแสดงทุกภาคของทุกคนและเทียบกับ GPA ป.6) */
const E8 = v => (typeof escHtml === 'function') ? escHtml(v ?? '') : String(v ?? '');
const gpsTkey = t => { const m = String(t||'').match(/(\d)\/(\d{4})/); return m ? +m[2]*10 + +m[1] : 0; };
function gpsYearAvg(ser, year){ const v = ser.filter(x=>String(x.term).split('/')[1]===String(year)).map(x=>x.gpa); return v.length ? Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100 : null; }
function gpsRows(){
  const q  = (document.getElementById('gps-search').value||'').toLowerCase();
  const fg = document.getElementById('gps-filter-grade').value;
  const ft = document.getElementById('gps-filter-term').value;
  const rows = [];
  DB.students.forEach(s=>{
    if(q && !((s.name||'')+(s.school_m1||'')+(s.province||'')+(s.no??'')).toLowerCase().includes(q)) return;
    const full = (s.semGpa||[]).filter(g=>g && g.term && Number(g.gpa)>0)
      .map(g=>Object.assign({}, g, {gpa: Math.round(Number(g.gpa)*100)/100})).sort((a,b)=>gpsTkey(a.term)-gpsTkey(b.term));
    const scope = full.filter(g=>(!fg || gradeFromTerm(g.term)===fg) && (!ft || g.term===ft));
    const g = scope[scope.length-1];
    if(!g) return;
    const i = full.findIndex(x=>x.term===g.term), prev = i>0 ? full[i-1] : null;
    const d = prev ? Math.round((g.gpa-prev.gpa)*100)/100 : null;
    const year = String(g.term).split('/')[1], yAvg = gpsYearAvg(full, year), pyAvg = gpsYearAvg(full, +year-1);
    rows.push({s, g, grade: gradeFromTerm(g.term), prev, d, cat: window.GpaTrend ? GpaTrend.classify(d) : null,
      year, yAvg, pyAvg, yd: (yAvg!=null && pyAvg!=null) ? Math.round((yAvg-pyAvg)*100)/100 : null});
  });
  rows.sort((a,b)=>(+a.s.no||0)-(+b.s.no||0));
  return rows;
}
function gpsDelta(d, cat){
  if(d==null) return '<span style="color:var(--text3)">—</span>';
  const C = (window.GpaTrend && cat) ? GpaTrend.CATS[cat] : null;
  const c = d>0.05 ? '#15803D' : d < -0.05 ? (d <= -0.30 ? '#B91C1C' : '#B45309') : '#64748B';
  return `<span style="font-weight:700;color:${c}">${d>0?'▲':d<0?'▼':'●'} ${Math.abs(d).toFixed(2)}</span>${C?`<div style="font-size:11px;color:${c}">${C.t}</div>`:''}`;
}
function renderGpaSheet(){
  populateGpsTermFilter();
  const ft = document.getElementById('gps-filter-term').value;
  const fg = document.getElementById('gps-filter-grade').value;
  const rows = gpsRows();

  // ── KPI ──
  const gpas = rows.map(r=>r.g.gpa||0).filter(v=>v>0);
  const avg  = gpas.length ? (gpas.reduce((a,b)=>a+b,0)/gpas.length).toFixed(2) : '-';
  const mx   = gpas.length ? Math.max(...gpas).toFixed(2) : '-';
  const mn   = gpas.length ? Math.min(...gpas).toFixed(2) : '-';
  const uniqStudents = [...new Set(rows.map(r=>r.s))];
  const needCare = uniqStudents.filter(s=>CareGroup.compute(s).severity===2).length;
  const watching = uniqStudents.filter(s=>CareGroup.compute(s).severity===1).length;
  document.getElementById('gps-kpi').innerHTML = `
    <div class="metric mv-blue" style="--metric-accent:var(--blue)">
      <div class="metric-icon">📊</div>
      <div class="metric-lbl">รายการ GPA</div>
      <div class="metric-val">${rows.length}</div>
      <div class="metric-sub">รายการทั้งหมด</div>
    </div>
    <div class="metric mv-teal">
      <div class="metric-icon">🎯</div>
      <div class="metric-lbl">GPA เฉลี่ย</div>
      <div class="metric-val">${avg}</div>
      <div class="metric-sub">ค่าเฉลี่ยกลุ่ม</div>
    </div>
    <div class="metric mv-green">
      <div class="metric-icon">⬆️</div>
      <div class="metric-lbl">GPA สูงสุด</div>
      <div class="metric-val">${mx}</div>
      <div class="metric-sub">ในกลุ่มที่เลือก</div>
    </div>
    <div class="metric mv-amber">
      <div class="metric-icon">⬇️</div>
      <div class="metric-lbl">GPA ต่ำสุด</div>
      <div class="metric-val">${mn}</div>
      <div class="metric-sub">ในกลุ่มที่เลือก</div>
    </div>
    <div class="metric mv-red">
      <div class="metric-icon">🔴</div>
      <div class="metric-lbl">ต้องดูแลเป็นพิเศษ</div>
      <div class="metric-val">${needCare}</div>
      <div class="metric-sub">คน · จาก GPA+SDQ</div>
    </div>
    <div class="metric mv-amber">
      <div class="metric-icon">🟠</div>
      <div class="metric-lbl">กลุ่มเฝ้าระวัง</div>
      <div class="metric-val">${watching}</div>
      <div class="metric-sub">คน · จาก GPA+SDQ</div>
    </div>`;

  // ── Summary Table: ระดับชั้น × ภาคเรียน (v23: 1 ชั้น = 1 ปีการศึกษา = ภาค 1 + ภาค 2) ──
  const allTerms = getAllTermsSorted();
  const levels = [...new Set(allTerms.map(gradeLevelOf))].sort((a,b)=>a-b);
  const grades = (fg ? [fg] : levels.map(gradeName));
  const gMap = {};
  grades.forEach(gr=>{ gMap[gr]={}; });
  rows.forEach(r=>{ if(gMap[r.grade] && r.g.gpa>0) (gMap[r.grade][r.g.term]=gMap[r.grade][r.g.term]||[]).push(r.g.gpa); });
  const avgOf = v => v.length ? (v.reduce((x,y)=>x+y,0)/v.length) : null;
  const cellOf = (vals) => {
    if(!vals || !vals.length) return `<td style="color:var(--text3)">—</td>`;
    const a = avgOf(vals).toFixed(2);
    return `<td><span style="font-weight:700;color:${gpaColor(parseFloat(a))}">${a}</span><div style="font-size:10px;color:var(--text3)">${vals.length} คน</div></td>`;
  };
  document.getElementById('gps-summary-head').innerHTML =
    `<tr><th style="text-align:left">ระดับชั้น</th><th>ปีการศึกษา</th><th>ภาคเรียนที่ 1</th><th>ภาคเรียนที่ 2</th><th>เฉลี่ยทั้งปี</th></tr>`;
  document.getElementById('gps-summary-body').innerHTML = grades.map(gr=>{
    const lv = levels.find(l=>gradeName(l)===gr) || 1;
    const [t1, t2] = gradeTerms(lv);
    const useT = ft ? [ft] : [t1, t2];
    const all = useT.flatMap(t=>gMap[gr][t]||[]);
    const rowAvg = all.length ? avgOf(all).toFixed(2) : '-';
    return `<tr>
      <td style="font-weight:700;font-family:var(--font-heading)">${gr}<div style="font-size:10.5px;color:var(--text3);font-weight:400">${gradeStage(lv)}</div></td>
      <td>${gradeYear(lv)}</td>
      ${(!ft || ft===t1) ? cellOf(gMap[gr][t1]) : '<td style="color:var(--text3)">—</td>'}
      ${(!ft || ft===t2) ? cellOf(gMap[gr][t2]) : '<td style="color:var(--text3)">—</td>'}
      <td style="font-weight:700;color:${gpaColor(parseFloat(rowAvg))};font-size:15px">${rowAvg}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:18px">ยังไม่มีข้อมูล GPA</td></tr>`;

  // ── Charts ──
  // 1) Trend: GPA เฉลี่ยทุกภาคเรียน เรียงตามเวลา — ป้ายกำกับบอกชั้นด้วย เช่น "1/2568 (ม.1)"
  destroyChart('gpsChartTrend');
  const displayTerms = (ft ? [ft] : allTerms).filter(t => !fg || gradeFromTerm(t)===fg);
  const trendLabels = displayTerms.map(t=>`${t} (${gradeFromTerm(t)})`);
  const trendDatasets = [{
    label: 'GPA เฉลี่ย',
    data: displayTerms.map(t=>{ const v=rows.filter(r=>r.g.term===t && r.g.gpa>0).map(r=>+r.g.gpa); return v.length?avgOf(v).toFixed(2):null; }),
    borderColor: '#2563EB', backgroundColor: '#2563EB22',
    tension:0.3, fill:true, pointRadius:5, pointHoverRadius:7, borderWidth:2.5, spanGaps:true
  }];
  charts['gpsChartTrend'] = new Chart(document.getElementById('gpsChartTrend'),{
    type:'line',
    data:{labels:trendLabels, datasets:trendDatasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'top',labels:{font:{family:'Noto Sans Thai',size:12},boxWidth:12}}},
      scales:{
        y:{min:0,max:4,ticks:{stepSize:0.5},title:{display:true,text:'GPA',font:{family:'Noto Sans Thai'}}},
        x:{ticks:{font:{family:'Noto Sans Thai',size:11}}}
      }
    }
  });

  // 2) Grade bar: avg per grade
  destroyChart('gpsChartGrade');
  const gradeAvgs = grades.map(gr=>{ const v=Object.values(gMap[gr]).flat(); return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(2):0; });
  const gradeColors = {'ม.1':'#2563EB','ม.2':'#0F766E','ม.3':'#92400E','ม.4':'#7C3AED','ม.5':'#DB2777','ม.6':'#0891B2'};
  charts['gpsChartGrade'] = new Chart(document.getElementById('gpsChartGrade'),{
    type:'bar',
    data:{labels:grades, datasets:[{
      label:'GPA เฉลี่ย',
      data:gradeAvgs,
      backgroundColor:grades.map(gr=>(gradeColors[gr]||'#64748B')+'CC'),
      borderColor:grades.map(gr=>gradeColors[gr]||'#64748B'),
      borderWidth:2, borderRadius:6
    }]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{y:{min:0,max:4,ticks:{stepSize:0.5}},x:{ticks:{font:{family:'Noto Sans Thai',size:13}}}}
    }
  });

  // 3) Histogram: distribution of GPA in filtered set
  destroyChart('gpsChartDist');
  const buckets={'<2.0':0,'2.0–2.49':0,'2.5–2.99':0,'3.0–3.49':0,'3.5–4.0':0};
  gpas.forEach(v=>{
    if(v<2.0)       buckets['<2.0']++;
    else if(v<2.5)  buckets['2.0–2.49']++;
    else if(v<3.0)  buckets['2.5–2.99']++;
    else if(v<3.5)  buckets['3.0–3.49']++;
    else            buckets['3.5–4.0']++;
  });
  charts['gpsChartDist'] = new Chart(document.getElementById('gpsChartDist'),{
    type:'bar',
    data:{labels:Object.keys(buckets), datasets:[{
      label:'จำนวน',
      data:Object.values(buckets),
      backgroundColor:['#DC2626CC','#EE4E4ECC','#E9C46ACC','#41B06ECC','#15803DCC'],
      borderRadius:5, borderWidth:0
    }]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{ticks:{font:{family:'Noto Sans Thai',size:11}}}}
    }
  });

  // ── Detail Table ──
  const newest = rows.reduce((m,r)=>gpsTkey(r.g.term)>gpsTkey(m)?r.g.term:m,'');
  document.getElementById('gps-tbody').innerHTML = rows.map((r,i)=>{
    const {s,g,grade,prev,d,cat,year,yAvg,pyAvg,yd} = r;
    const idx = DB.students.indexOf(s);
    const cg = CareGroup.compute(s);
    const sq = cg.sdq;
    return `<tr>
      <td>${E8(s.no ?? i+1)}</td>
      <td class="photo-cell">${photoEl(s)}</td>
      <td style="font-weight:600">${E8(s.name)}<div style="font-size:11px;color:var(--text3)">${E8(s.nickname||'')}</div></td>
      <td><span class="badge b-blue">${E8(grade)}</span></td>
      <td style="font-size:12px;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${E8(s.school_m1||'-')}</td>
      <td><span class="badge b-gray">${E8(s.province||'-')}</span></td>
      <td><span class="badge ${!ft && g.term!==newest ? 'b-gray' : 'b-teal'}">${E8(g.term)}</span>${!ft && newest && g.term!==newest ? `<div style="font-size:10.5px;color:#B45309">ยังไม่มี GPA ${E8(newest)}</div>` : ''}</td>
      <td>
        <div style="font-weight:700;font-size:16px;color:${gpaColor(g.gpa)}">${g.gpa.toFixed(2)}</div>
        <div class="gpa-bar"><div class="gpa-fill" style="width:${(g.gpa/4*100).toFixed(0)}%;background:${gpaColor(g.gpa)}"></div></div>
      </td>
      <td>${prev?`<span style="font-weight:600;color:${gpaColor(prev.gpa)}">${prev.gpa.toFixed(2)}</span><div style="font-size:11px;color:var(--text3)">${E8(prev.term)}</div>`:'<span style="color:var(--text3)">ภาคแรก</span>'}</td>
      <td>${gpsDelta(d,cat)}</td>
      <td>${yAvg!=null?`<span style="font-weight:700;color:${gpaColor(yAvg)}">${yAvg.toFixed(2)}</span><div style="font-size:11px;color:var(--text3)">ปี ${E8(year)}${yd!=null?` · <span style="color:${yd>0.05?'#15803D':yd<-0.05?'#B91C1C':'#64748B'}">${yd>0?'▲':yd<0?'▼':'●'} ${Math.abs(yd).toFixed(2)} จากปี ${+year-1}</span>`:''}</div>`:'—'}</td>
      <td><span class="${cg.badgeClass}" title="${E8(cg.note)}">${cg.label}</span></td>
      <td>${sq?`<span class="badge ${sdqGroupBadge(sq.group)}">${E8(sq.group)}</span><div style="font-size:10.5px;color:var(--text3)">${E8(sq.term)}</div>`:'<span class="badge b-gray">ยังไม่ประเมิน</span>'}</td>
      <td>
        <button class="btn btn-sm" onclick="openStudentDetail(${idx});setTimeout(()=>switchTabByName('📊 ประวัติ GPA'),200)">✏️ แก้ไข</button>
      </td>
    </tr>`;
  }).join('');
  document.getElementById('gps-footer').textContent = `แสดง ${rows.length} คน · ใช้ GPA ${ft ? 'ภาคเรียนที่ '+ft : 'ภาคเรียนล่าสุดของแต่ละคน'} เทียบภาคก่อนหน้า และเฉลี่ยปีการศึกษาเทียบปีก่อน`;
  document.getElementById('gpa-sheet-count').textContent = `— ${rows.length} คน`;
}

function openAddGpaRecord(){
  // เปิด modal เพิ่ม GPA: ให้เลือกนักเรียนก่อน
  const names = DB.students.map((s,i)=>`<option value="${i}">${s.no}. ${s.name} (${s.nickname||''})</option>`).join('');
  const terms = getAllTermsSorted();
  const termOpts = terms.map(t=>`<option>${t}</option>`).join('');
  const suggestTerm = terms.length ? '' : '1/2568';
  document.getElementById('sem-modal-title').textContent = '+ เพิ่มข้อมูล GPA';
  document.getElementById('sem-modal-type').innerHTML = '';
  document.getElementById('sem-modal-body').innerHTML = `
    <div class="form-grid">
      <div class="fg fg-full"><label>นักเรียน</label>
        <select id="add-gpa-student"><option value="">-- เลือกนักเรียน --</option>${names}</select>
      </div>
      <div class="fg"><label>ภาคเรียน</label>
        <input id="add-gpa-term" list="add-gpa-term-list" placeholder="เช่น 1/2568" value="${suggestTerm}">
        <datalist id="add-gpa-term-list">${termOpts}</datalist>
      </div>
      <div class="fg"><label>GPA</label>
        <input type="number" id="add-gpa-val" step="0.01" min="0" max="4" placeholder="0.00–4.00">
      </div>
      <div class="fg fg-full"><label>การช่วยเหลือของโรงเรียน</label>
        <input id="add-gpa-support" placeholder="เช่น ติวเสริม, ครูที่ปรึกษา">
      </div>
      <div class="fg fg-full" style="font-size:12px;color:var(--text3)">
        ℹ️ กลุ่มการดูแล (ปกติ/เฝ้าระวัง/ต้องดูแลเป็นพิเศษ) จะคำนวณอัตโนมัติจาก GPA นี้ + ผลประเมิน SDQ ของนักเรียนคนนี้ ไม่ต้องเลือกเอง
      </div>
    </div>`;
  // override saveSemData for this context
  window._addGpaMode = true;
  document.getElementById('sem-modal').classList.add('open');
}

// override saveSemData to handle add-gpa mode
const _origSaveSemData = window.saveSemData;
window.saveSemData = function(){
  if(window._addGpaMode){
    window._addGpaMode = false;
    const idx = parseInt(document.getElementById('add-gpa-student').value);
    if(isNaN(idx)||idx<0||idx>=DB.students.length){ alert('กรุณาเลือกนักเรียน'); window._addGpaMode=true; return; }
    const term = (document.getElementById('add-gpa-term').value||'').trim();
    if(!term){ alert('กรุณากรอกภาคเรียน'); window._addGpaMode=true; return; }
    const gpa  = parseFloat(document.getElementById('add-gpa-val').value)||0;
    const rec = {
      term, gpa,
      weakSubjects: (document.getElementById('add-gpa-weak')||{}).value||'',
      schoolSupport:document.getElementById('add-gpa-support').value||''
    };
    if(!DB.students[idx].semGpa) DB.students[idx].semGpa=[];
    // check duplicate term
    const dupIdx = DB.students[idx].semGpa.findIndex(g=>g.term===term);
    if(dupIdx>=0 && !window._gpaDupOk){
      window._addGpaMode=true;
      uiAsk('นักเรียนคนนี้มีผลการเรียนของภาคเรียนนี้อยู่แล้ว ต้องการแทนที่ด้วยค่าใหม่หรือไม่?', { tone:'warning', title:'มีข้อมูลภาคเรียนนี้แล้ว',
        details:[{label:'ภาคเรียน',value:term},{label:'GPA เดิม',value:String(DB.students[idx].semGpa[dupIdx].gpa??'-')},{label:'GPA ใหม่',value:String(gpa)}], confirmText:'แทนที่' })
      .then(ok=>{ if(ok){ window._gpaDupOk=true; try{ window.saveSemData(); } finally { window._gpaDupOk=false; } } });
      return;
    }
    if(dupIdx>=0){
      DB.students[idx].semGpa[dupIdx]=rec;
    } else {
      DB.students[idx].semGpa.push(rec);
    }
    // sync gpa object
    DB.students[idx].gpa = {...rec};
    saveToStorage();
    closeModal('sem-modal');
    renderGpaSheet();
    showStatus('✅ เพิ่มข้อมูล GPA สำเร็จ','success');
    return;
  }
  if(_origSaveSemData) _origSaveSemData();
};

function exportGpaSheet(){
  const q  = (document.getElementById('gps-search').value||'').toLowerCase();
  const fg = document.getElementById('gps-filter-grade').value;
  const rows = gpsRows();
  const safe = v => { let x = String(v ?? ''); if (/^[=+\-@\t\r]/.test(x)) x = "'" + x; return '"' + x.replace(/"/g,'""') + '"'; };
  const header=['ลำดับ','ชื่อ-สกุล','ชั้น','โรงเรียน','จังหวัด','ภาคเรียนล่าสุด','GPA','ภาคก่อน','GPA ภาคก่อน','เปลี่ยนแปลง','แนวโน้ม','ปีการศึกษา','เฉลี่ยปี','เฉลี่ยปีก่อน','กลุ่มการดูแล (วิเคราะห์อัตโนมัติ)','SDQ ล่าสุด','การช่วยเหลือโรงเรียน'].map(safe).join(',');
  const csv=[header,...rows.map(r=>{
    const cg=CareGroup.compute(r.s), sq=cg.sdq;
    return [r.s.no??'',r.s.name,r.grade,r.s.school_m1||'',r.s.province||'',r.g.term,r.g.gpa.toFixed(2),r.prev?r.prev.term:'',r.prev?r.prev.gpa.toFixed(2):'',
      r.d!=null?r.d.toFixed(2):'',r.cat&&window.GpaTrend?GpaTrend.CATS[r.cat].t:'',r.year,r.yAvg!=null?r.yAvg.toFixed(2):'',r.pyAvg!=null?r.pyAvg.toFixed(2):'',
      cg.label,sq?sq.group+' ('+sq.term+')':'ยังไม่ประเมิน',r.g.schoolSupport||''].map(safe).join(',');
  })].join('\n');
  const bom='\uFEFF';
  const blob=new Blob([bom+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`GPA_Sheet_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ============ PHOTO UPLOAD ============
