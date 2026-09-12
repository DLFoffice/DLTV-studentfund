/* ============================================================
   05-dashboard.js — หน้าแดชบอร์ดสรุปภาพรวม + Chart.js
   (แยกมาจาก index.html เดิม บรรทัด 1657-1790 โดยรักษาลำดับโค้ดเดิม)
   ============================================================ */
function renderDashboard(){
  const total=DB.students.length;
  const withGpa=DB.students.filter(s=>{const g=getLatestGpa(s);return g&&g.gpa>0;});
  const avgGpaArr=withGpa.map(s=>{const g=getLatestGpa(s);return g.gpa||0;}).filter(g=>g>0);
  const avgGpa=avgGpaArr.length?(avgGpaArr.reduce((a,b)=>a+b,0)/avgGpaArr.length).toFixed(2):'-';
  const totalPay=DB.students.reduce((a,s)=>{
    if(s.semPayments) return a+s.semPayments.reduce((b,p)=>b+(p.p1||0)+(p.p2||0),0);
    return a+(s.payment.p1||0)+(s.payment.p2||0);
  },0);
  // กลุ่มการดูแล วิเคราะห์อัตโนมัติจาก GPA + ผลประเมิน SDQ (แทนการเลือกความเสี่ยง/อุปสรรคด้วยมือ)
  const careGroups=DB.students.map(s=>({s,cg:CareGroup.compute(s)}));
  const needCare=careGroups.filter(x=>x.cg.severity===2).length;
  const watching=careGroups.filter(x=>x.cg.severity===1).length;
  const terms=new Set();
  DB.students.forEach(s=>s.semGpa&&s.semGpa.forEach(g=>terms.add(g.term)));

  const needCarePct = total>0?Math.round(needCare/total*100):0;
  document.getElementById('dash-metrics').innerHTML=`
    <div class="metric mv-blue">
      <div class="metric-icon">🎓</div>
      <div class="metric-lbl">นักเรียนทุน</div>
      <div class="metric-val">${total}</div>
      <div class="metric-sub">คน ในระบบ</div>
    </div>
    <div class="metric mv-teal">
      <div class="metric-icon">📊</div>
      <div class="metric-lbl">GPA เฉลี่ย</div>
      <div class="metric-val">${avgGpa}</div>
      <div class="metric-sub">ข้อมูลล่าสุด</div>
    </div>
    <div class="metric mv-amber">
      <div class="metric-icon">💰</div>
      <div class="metric-lbl">เบิกจ่ายรวม</div>
      <div class="metric-val" style="font-size:22px;letter-spacing:-0.5px">${fmt(totalPay)}</div>
      <div class="metric-sub">บาท</div>
    </div>
    <div class="metric mv-red">
      <div class="metric-icon">🔴</div>
      <div class="metric-lbl">ต้องดูแลเป็นพิเศษ</div>
      <div class="metric-val">${needCare}</div>
      <div class="metric-sub">${needCarePct}% ของนักเรียนทั้งหมด · จาก GPA+SDQ</div>
    </div>
    <div class="metric mv-amber">
      <div class="metric-icon">🟠</div>
      <div class="metric-lbl">กลุ่มเฝ้าระวัง</div>
      <div class="metric-val">${watching}</div>
      <div class="metric-sub">คน · วิเคราะห์จาก GPA+SDQ</div>
    </div>
    <div class="metric mv-green">
      <div class="metric-icon">📅</div>
      <div class="metric-lbl">ภาคเรียน</div>
      <div class="metric-val">${terms.size}</div>
      <div class="metric-sub">ภาคเรียนที่บันทึก</div>
    </div>
  `;

  // GPA distribution
  const gBuckets={'2.00-2.49':0,'2.50-2.99':0,'3.00-3.49':0,'3.50-4.00':0};
  withGpa.forEach(s=>{const g=getLatestGpa(s).gpa||0;
    if(g>=3.5) gBuckets['3.50-4.00']++;
    else if(g>=3.0) gBuckets['3.00-3.49']++;
    else if(g>=2.5) gBuckets['2.50-2.99']++;
    else if(g>=2.0) gBuckets['2.00-2.49']++;
  });
  destroyChart('chartGPA');
  charts['chartGPA']=new Chart(document.getElementById('chartGPA'),{
    type:'doughnut',
    data:{labels:Object.keys(gBuckets),datasets:[{data:Object.values(gBuckets),backgroundColor:['#EE4E4E','#E9C46A','#ADD899','#41B06E'],borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}
  });
  document.getElementById('legend-gpa').innerHTML=Object.entries(gBuckets).map(([k,v],i)=>`<span class="legend-item"><span class="legend-sq" style="background:${['#9E2B2B','#D85A30','#1A5FA8','#3A6A10'][i]}"></span>${k}: ${v}</span>`).join('');

  // กลุ่มการดูแล (แทนกราฟ "ระดับความเสี่ยง" แบบเลือกเองเดิม)
  const careCount={};
  careGroups.forEach(x=>{const l=x.cg.label;careCount[l]=(careCount[l]||0)+1;});
  const careColors={'ปกติ':'#41A67E','เฝ้าระวัง':'#F7AD45','ต้องดูแลเป็นพิเศษ':'#DC143C','รอข้อมูล':'#9CA3AF'};
  const careOrder=['ปกติ','เฝ้าระวัง','ต้องดูแลเป็นพิเศษ','รอข้อมูล'].filter(k=>careCount[k]);
  destroyChart('chartRisk');
  charts['chartRisk']=new Chart(document.getElementById('chartRisk'),{
    type:'doughnut',
    data:{labels:careOrder,datasets:[{data:careOrder.map(k=>careCount[k]),backgroundColor:careOrder.map(k=>careColors[k]),borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}
  });
  document.getElementById('legend-risk').innerHTML=careOrder.map(k=>`<span class="legend-item"><span class="legend-sq" style="background:${careColors[k]}"></span>${k}: ${careCount[k]}</span>`).join('');

  // SDQ: ด้านที่พบปัญหามากที่สุด (แทนกราฟ "อุปสรรคที่พบ" แบบกรอกเองเดิม)
  const domainStats=(window.CareGroup?CareGroup.domainProblemCounts():[]);
  destroyChart('chartObstacle');
  charts['chartObstacle']=new Chart(document.getElementById('chartObstacle'),{
    type:'bar',
    data:{labels:domainStats.map(d=>d.label),datasets:[{data:domainStats.map(d=>d.count),backgroundColor:'rgba(37,99,235,0.6)',borderColor:'rgba(37,99,235,0.5)',borderWidth:1,borderRadius:6}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(15,17,35,0.04)'},ticks:{font:{size:10}}},y:{grid:{display:false},ticks:{font:{size:10},color:'#5A6178'}}}}
  });

  // Bank
  const bankCount={};
  DB.students.forEach(s=>{const b=s.bank&&s.bank.bankSt?s.bank.bankSt:'-';bankCount[b]=(bankCount[b]||0)+1;});
  const bankTop=Object.entries(bankCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  destroyChart('chartBank');
  charts['chartBank']=new Chart(document.getElementById('chartBank'),{
    type:'bar',
    data:{labels:bankTop.map(x=>x[0]),datasets:[{data:bankTop.map(x=>x[1]),backgroundColor:['#F75270','#5EABD6','#7E1891','#41B3A2','#E9C46A'],borderRadius:6,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{grid:{color:'rgba(15,17,35,0.04)'},ticks:{font:{size:10}}},x:{grid:{display:false},ticks:{font:{size:10},color:'#5A6178'}}}}
  });

  // GPA bar
  const gpaStudents=DB.students.filter(s=>getLatestGpa(s).gpa>0).sort((a,b)=>(getLatestGpa(a).gpa||0)-(getLatestGpa(b).gpa||0));
  destroyChart('chartGPABar');
  charts['chartGPABar']=new Chart(document.getElementById('chartGPABar'),{
    type:'bar',
    data:{labels:gpaStudents.map(s=>s.nickname||s.name.substring(0,6)),datasets:[{data:gpaStudents.map(s=>getLatestGpa(s).gpa),backgroundColor:gpaStudents.map(s=>gpaColor(getLatestGpa(s).gpa)),borderRadius:3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`GPA: ${ctx.parsed.y}`}}},scales:{y:{min:2,max:4,grid:{color:'rgba(15,17,35,0.04)'},ticks:{font:{size:10}}},x:{grid:{display:false},ticks:{font:{size:9},maxRotation:60,autoSkip:true,color:'#9BA3BC'}}}}
  });

  // Watch list — ใช้กลุ่มการดูแลที่วิเคราะห์แล้ว (เฝ้าระวังขึ้นไป)
  const watchList=careGroups.filter(x=>x.cg.severity>=1).map(x=>x.s).sort((a,b)=>(getLatestGpa(a).gpa||0)-(getLatestGpa(b).gpa||0));
  const wc=document.getElementById('watch-count');
  if(wc) wc.textContent=watchList.length+' คน';
  const gb=document.getElementById('gpa-bar-count');
  if(gb) gb.textContent=gpaStudents.length+' คน';
  document.getElementById('watch-tbody').innerHTML=watchList.map(s=>{const g=getLatestGpa(s);const cg=CareGroup.compute(s);return`<tr>
    <td>${s.no}</td>
    <td style="width:46px">${photoEl(s)}</td>
    <td style="font-weight:600">${s.name}<br><span style="font-size:11px;color:var(--text3)">${s.nickname}</span></td>
    <td style="font-size:12px">${s.school_m1}</td>
    <td><span class="badge b-blue">${s.province}</span></td>
    <td><span style="font-weight:700;font-size:15px;color:${gpaColor(g.gpa)}">${g.gpa||'-'}</span></td>
    <td><span class="${cg.badgeClass}" title="${cg.note}">${cg.label}</span></td>
    <td style="font-size:12px">${cg.sdqGroup?('SDQ ('+cg.sdqTerm+'): '+cg.sdqGroup):'ยังไม่ประเมิน SDQ'}</td>
  </tr>`;}).join('');
}


// ============ STUDENTS ============
