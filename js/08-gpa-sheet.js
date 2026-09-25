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
  sel.innerHTML = '<option value="">ทุกภาคเรียน</option>' + gradeTermOptions(shown, shown.includes(cur)?cur:'', t=>`ภาคเรียนที่ ${t}`);
}

function renderGpaSheet(){
  populateGpsTermFilter();
  const q  = (document.getElementById('gps-search').value||'').toLowerCase();
  const fg = document.getElementById('gps-filter-grade').value;
  const ft = document.getElementById('gps-filter-term').value;

  // Build flat rows [{s, g, grade}]
  const rows = [];
  DB.students.forEach(s=>{
    (s.semGpa||[]).forEach(g=>{
      const grade = gradeFromTerm(g.term);
      if(fg && grade !== fg) return;
      if(ft && g.term !== ft) return;
      if(q && !(s.name+(s.school_m1||'')+(s.province||'')).toLowerCase().includes(q)) return;
      rows.push({s, g, grade});
    });
  });

  // Sort: grade → term → name
  rows.sort((a,b)=>{
    if(a.grade!==b.grade) return gradeCmp(a.grade,b.grade);
    if(a.g.term!==b.g.term) return String(a.g.term).localeCompare(String(b.g.term));
    return (a.s.name||'').localeCompare(b.s.name||'','th');
  });

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
  document.getElementById('gps-tbody').innerHTML = rows.map(({s,g,grade},i)=>{
    const idx = DB.students.indexOf(s);
    const delta = (s.gpa_p6&&g.gpa) ? (g.gpa-s.gpa_p6).toFixed(2) : null;
    const deltaHtml = delta!=null
      ? `<span style="font-weight:600;color:${parseFloat(delta)>=0?'var(--green)':'var(--red)'}">
           ${parseFloat(delta)>=0?'▲':'▼'} ${Math.abs(delta)}</span>`
      : '<span style="color:var(--text3)">—</span>';
    return `<tr>
      <td>${i+1}</td>
      <td class="photo-cell">${photoEl(s)}</td>
      <td style="font-weight:600">${s.name}<div style="font-size:11px;color:var(--text3)">${s.nickname||''}</div></td>
      <td><span class="badge b-blue">${grade}</span></td>
      <td style="font-size:12px;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.school_m1||'-'}</td>
      <td><span class="badge b-gray">${s.province||'-'}</span></td>
      <td><span class="badge b-teal">${g.term||'-'}</span></td>
      <td>
        <div style="font-weight:700;font-size:16px;color:${gpaColor(g.gpa)}">${g.gpa||'-'}</div>
        ${g.gpa?`<div class="gpa-bar"><div class="gpa-fill" style="width:${(g.gpa/4*100).toFixed(0)}%;background:${gpaColor(g.gpa)}"></div></div>`:''}
      </td>
      <td style="font-weight:600;color:${gpaColor(s.gpa_p6)}">${s.gpa_p6||'-'}</td>
      <td>${deltaHtml}</td>
      <td><span class="${CareGroup.compute(s).badgeClass}" title="${CareGroup.compute(s).note}">${CareGroup.compute(s).label}</span></td>
      <td>${(()=>{const sb=s.sdq&&s.sdq[g.term];const sr=(sb&&typeof window.SDQ==='object')?SDQ.compute(sb):null;return (sr&&sr.complete)?`<span class="badge ${sdqGroupBadge(sr.totalGroup)}">${sr.totalGroup}</span>`:'<span class="badge b-gray">ยังไม่ประเมิน</span>';})()}</td>
      <td style="font-size:12px;color:var(--red);max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.weakSubjects||'-'}</td>
      <td>
        <button class="btn btn-sm" onclick="openStudentDetail(${idx});setTimeout(()=>switchTabByName('📊 ประวัติ GPA'),200)">✏️ แก้ไข</button>
      </td>
    </tr>`;
  }).join('');
  document.getElementById('gps-footer').textContent = `แสดง ${rows.length} รายการ (${[...new Set(rows.map(r=>r.s.id||r.s.no))].length} คน)`;
  document.getElementById('gpa-sheet-count').textContent = `— ${rows.length} รายการ`;
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
      <div class="fg fg-full"><label>วิชาที่อ่อน</label>
        <input id="add-gpa-weak" placeholder="เช่น คณิตศาสตร์, ภาษาอังกฤษ">
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
      weakSubjects: document.getElementById('add-gpa-weak').value||'',
      schoolSupport:document.getElementById('add-gpa-support').value||''
    };
    if(!DB.students[idx].semGpa) DB.students[idx].semGpa=[];
    // check duplicate term
    const dupIdx = DB.students[idx].semGpa.findIndex(g=>g.term===term);
    if(dupIdx>=0){
      if(!confirm(`ภาคเรียน ${term} มีอยู่แล้ว ต้องการอัพเดตหรือไม่?`)) { window._addGpaMode=true; return; }
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
  const ft = document.getElementById('gps-filter-term').value;
  const rows=[];
  DB.students.forEach(s=>{
    (s.semGpa||[]).forEach(g=>{
      const grade=gradeFromTerm(g.term);
      if(fg&&grade!==fg) return;
      if(ft&&g.term!==ft) return;
      if(q&&!(s.name+(s.school_m1||'')+(s.province||'')).toLowerCase().includes(q)) return;
      rows.push({s,g,grade});
    });
  });
  const header='ลำดับ,ชื่อ-สกุล,ชั้น,โรงเรียน,จังหวัด,ภาคเรียน,GPA,GPA ป.6,Δ vs ป.6,กลุ่มการดูแล (วิเคราะห์อัตโนมัติ),ผล SDQ ภาคเรียนนี้,วิชาที่อ่อน,การช่วยเหลือโรงเรียน';
  const csv=[header,...rows.map(({s,g,grade},i)=>{
    const delta=(s.gpa_p6&&g.gpa)?(g.gpa-s.gpa_p6).toFixed(2):'';
    const cg=CareGroup.compute(s);
    const sb=s.sdq&&s.sdq[g.term];
    const sr=(sb&&typeof window.SDQ==='object')?SDQ.compute(sb):null;
    const sdqTxt=(sr&&sr.complete)?sr.totalGroup:'ยังไม่ประเมิน';
    return [i+1,s.name,grade,s.school_m1||'',s.province||'',g.term||'',g.gpa||'',s.gpa_p6||'',delta,cg.label,sdqTxt,g.weakSubjects||'',g.schoolSupport||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',');
  })].join('\n');
  const bom='\uFEFF';
  const blob=new Blob([bom+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`GPA_Sheet_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ============ PHOTO UPLOAD ============
