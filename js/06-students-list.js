/* ============================================================
   06-students-list.js — รายชื่อนักเรียน: filter, ค้นหา, การ์ด/ตาราง, pagination
   (แยกมาจาก index.html เดิม บรรทัด 1791-1897 โดยรักษาลำดับโค้ดเดิม)
   ============================================================ */
/* ---------- v19: ค้นหาแบบทนต่อการพิมพ์ภาษาไทย ----------
   ปัญหาเดิม: ช่องค้นหาดูแค่ ชื่อ+ชื่อเล่น+เลขบัตร+โรงเรียน → พิมพ์ชื่อจังหวัดถูกแต่ไม่เจอ
   ตอนนี้ค้นได้ทั้ง ชื่อ ชื่อเล่น ลำดับ เลขบัตร โรงเรียน จังหวัด (ทั้งจังหวัดโรงเรียนและที่อยู่บ้าน)
   อำเภอ ตำบล สังกัด เบอร์โทร และชื่อผู้ปกครอง
   • ไม่สนช่องว่าง/อักขระซ่อน, "จ." "จังหวัด" "อ." "อำเภอ" "ต." "ตำบล" นำหน้า
   • ํา (นิคหิต+สระอา) = ำ, กทม = กรุงเทพ
   • พิมพ์หลายคำคั่นด้วยเว้นวรรค = ต้องเจอทุกคำ เช่น "ขอนแก่น บ้านไผ่" */
function stdNorm(v){
  return String(v ?? '').normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .replace(/\u0E4D\u0E32/g,'\u0E33')          // ํ + า → ำ
    .toLowerCase().replace(/\s+/g,'');
}
const STD_PREFIX_RE = /^(จังหวัด|จ\.|อำเภอ|อ\.|เขต|ตำบล|ต\.|แขวง)/;
const STD_ALIAS = { 'กทม':'กรุงเทพ', 'กทม.':'กรุงเทพ', 'bkk':'กรุงเทพ' };
function stdQueryTokens(q){
  return String(q||'').split(/\s+/).map(t=>{
    let n = stdNorm(t);
    if(STD_ALIAS[n]) n = STD_ALIAS[n];
    return n.replace(STD_PREFIX_RE,'');   // คำนำหน้าล้วน ๆ (เช่น "จังหวัด" แล้วเว้นวรรค) → ตัดทิ้ง
  }).filter(Boolean);
}
function stdHaystack(s){
  const a = s.addr||{}, sa = s.school_m1_addr||{};
  return [s.no, s.name, s.nickname, s.id, s.school_m1, s.school_m3, s.school,
    s.province, a.province, a.amphoe, a.tambon, sa.amphoe, sa.district, sa.province,
    s.org, s.phone, s.parent, s.parentPhone]
    .map(stdNorm).join('|');
}
// ค่าจังหวัดสำหรับตัวกรอง — ตัด "จ." / ช่องว่างเกินให้กลุ่มเดียวกันไม่แตกเป็นหลายตัวเลือก
function stdProvKey(v){ return String(v ?? '').replace(/^\s*(จังหวัด|จ\.)\s*/,'').trim(); }

function populateFilters(){
  const fill = (sel, values) => {
    if(!sel) return;
    const cur = sel.value;
    const first = sel.options[0] ? sel.options[0].outerHTML : '<option value="">ทั้งหมด</option>';
    // สร้างใหม่ทุกครั้ง — เดิมเติมแค่ครั้งแรก ข้อมูลที่มาจากคลาวด์ทีหลังจึงไม่มีในรายการ
    sel.innerHTML = first + values.map(v=>`<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
    if(cur && values.includes(cur)) sel.value = cur;
  };
  const byThai = (a,b)=>a.localeCompare(b,'th');
  fill(document.getElementById('std-filter-prov'), [...new Set(DB.students.map(s=>stdProvKey(s.province)).filter(Boolean))].sort(byThai));
  fill(document.getElementById('std-filter-org'),  [...new Set(DB.students.map(s=>String(s.org||'').trim()).filter(Boolean))].sort(byThai));
}

function filterStudents(){
  const tokens=stdQueryTokens(document.getElementById('std-search').value);
  const fp=document.getElementById('std-filter-prov').value;
  const fo=document.getElementById('std-filter-org').value;
  const fr=document.getElementById('std-filter-risk').value;
  return DB.students.filter(s=>{
    if(tokens.length){
      const hay=stdHaystack(s);
      if(!tokens.every(t=>hay.includes(t))) return false;
    }
    if(fp && stdProvKey(s.province)!==fp) return false;
    if(fo && String(s.org||'').trim()!==fo) return false;
    if(fr && CareGroup.compute(s).label!==fr) return false;
    return true;
  });
}
// พิมพ์ค้นหาใหม่ → กลับไปหน้าแรกของผลลัพธ์เสมอ (เดิมอาจค้างอยู่หน้า 2–3 แล้วดูเหมือนไม่เจอ)
function onStudentSearch(){ stdPage=1; renderStudents(); }

function renderStudents(){
  const filtered=filterStudents();
  document.getElementById('std-count').textContent=`(${filtered.length} คน)`;
  const total=filtered.length;
  const pages=Math.ceil(total/STD_PER_PAGE);
  if(stdPage>pages) stdPage=1;

  if(currentView==='card'){
    document.getElementById('students-card-grid').innerHTML=filtered.map(s=>{
      const idx=DB.students.indexOf(s);
      const g=getLatestGpa(s);
      const gv=g.gpa||0;
      const cg=CareGroup.compute(s);
      const sdqBadge=cg.hasSdq?`<span class="badge ${sdqGroupBadge(cg.sdqGroup)}" style="font-size:10px" title="ผลประเมิน SDQ รวม 4 ด้าน (ภาคเรียน ${escHtml(cg.sdqTerm)})">SDQ: ${escHtml(cg.sdqGroup)}</span>`:'';
      return `<div class="student-card" onclick="openStudentDetail(${idx})">
        <div class="card-photo-wrap">
          ${safeUrl(s.photoUrl)
            ? `<img class="card-photo" src="${escHtml(safeUrl(fixDriveUrl(s.photoUrl)))}" alt="${escHtml(s.name)}" ${lbAttrs(s.photoUrl, s.name)} onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="card-avatar" style="display:none">${escHtml(initials(s.name||''))}</div><div class="card-photo-zoom-icon">🔍</div>`
            : `<div class="card-avatar">${escHtml(initials(s.name||''))}</div>`}
          <div class="card-no">#${escHtml(s.no)}</div>
          <div class="card-risk-badge"><span class="${escHtml(cg.badgeClass)}" title="${escHtml(cg.note)}">${escHtml(cg.label)}</span></div>
        </div>
        <div class="card-body">
          <div class="card-name">${escHtml(s.name||'(ยังไม่ระบุชื่อ)')}</div>
          <div class="card-nickname">"${escHtml(s.nickname)}"</div>
          <div class="card-school">🏫 ${escHtml(s.school_m1)}</div>
          ${gv>0?`<div class="card-gpa-row">
            <div>
              <div class="card-gpa-val" style="color:${gpaColor(gv)}">${escHtml(gv)}</div>
              <div class="card-gpa-lbl">GPA</div>
            </div>
            <div class="card-bar"><div class="card-bar-fill" style="width:${(gv/4*100).toFixed(0)}%;background:${gpaColor(gv)}"></div></div>
          </div>`:'<div style="font-size:12px;color:var(--text3);margin-top:4px">ยังไม่มีข้อมูล GPA</div>'}
        </div>
        <div class="card-footer">
          <div class="card-province">📍 ${escHtml(s.province)}</div>
          ${sdqBadge}
        </div>
      </div>`;
    }).join('');
  } else {
    const slice=filtered.slice((stdPage-1)*STD_PER_PAGE,stdPage*STD_PER_PAGE);
    document.getElementById('students-tbody').innerHTML=slice.map(s=>{
      const idx=DB.students.indexOf(s);
      const g=getLatestGpa(s);
      const gv=g.gpa||0;
      const cg=CareGroup.compute(s);
      const latestTerm=s.semGpa&&s.semGpa.length>0?s.semGpa[s.semGpa.length-1].term:'';
      return`<tr>
        <td style="color:var(--text2)">${escHtml(s.no)}</td>
        <td class="photo-cell">${photoEl(s)}</td>
        <td><div style="font-weight:600">${escHtml(s.name||'(ยังไม่ระบุชื่อ)')}</div><div style="font-size:11px;color:var(--text3)">${escHtml(s.nickname)}</div></td>
        <td style="font-family:'Noto Sans Thai',monospace;font-size:11px">${escHtml(maskId(s.id))}</td>
        <td style="font-size:12px">${escHtml(s.dob||'-')}<div style="font-size:11px;color:var(--blue);font-weight:600">${escHtml(calcAge(s.dob))}</div></td>
        <td style="font-size:12px">${escHtml(s.phone||'-')}</td>
        <td style="font-size:12px">${escHtml(s.school_m1)}</td>
        <td><span class="badge b-blue">${escHtml(s.province)}</span></td>
        <td>${gv?`<span style="font-weight:700;color:${gpaColor(gv)}">${escHtml(gv)}</span>`:'-'} ${latestTerm?`<div style="font-size:10px;color:var(--text3)">${escHtml(latestTerm)}</div>`:''}</td>
        <td style="font-weight:600;color:${gpaColor(s.gpa_p6)}">${escHtml(s.gpa_p6||'-')}</td>
        <td><span class="${escHtml(cg.badgeClass)}" title="${escHtml(cg.note)}">${escHtml(cg.label)}</span></td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-sm" onclick="openStudentDetail(${idx});event.stopPropagation()">ดูข้อมูล</button>
          <button class="btn btn-sm btn-danger" onclick="deleteStudent(${idx});event.stopPropagation()">ลบ</button>
        </div></td>
      </tr>`;
    }).join('');
    document.getElementById('students-footer').textContent=`แสดง ${(stdPage-1)*STD_PER_PAGE+1}–${Math.min(stdPage*STD_PER_PAGE,total)} จาก ${total} รายการ`;
    // Pagination
    const pag=document.getElementById('students-pagination');
    let h='';
    if(pages>1){
      h+=`<button class="page-btn" onclick="goPage(${stdPage-1})" ${stdPage===1?'disabled':''}>←</button>`;
      for(let p=1;p<=pages;p++){
        if(p===1||p===pages||Math.abs(p-stdPage)<=1) h+=`<button class="page-btn ${p===stdPage?'active':''}" onclick="goPage(${p})">${p}</button>`;
        else if(Math.abs(p-stdPage)===2) h+='<span style="padding:4px 6px;color:var(--text3)">…</span>';
      }
      h+=`<button class="page-btn" onclick="goPage(${stdPage+1})" ${stdPage===pages?'disabled':''}>→</button>`;
    }
    pag.innerHTML=h;
  }
}
function goPage(p){if(p<1)return;stdPage=p;renderStudents();}
function openNewStudent(){
  const _no=DB.students.length+1;
  const ns={_docId:'no-'+_no,no:_no,id:'',name:'',nickname:'',dob:'',phone:'',parent:'',parentPhone:'',gpa_p6:0,school_p6:'',school_m1:'',province:'',org:'',photoUrl:'',addr:{},bank:{},payment:{p1:0,p2:0,term:'1/2568',item1:'ค่าเงินบำรุงการศึกษา',item2:'ค่าใช้จ่ายในการเรียน'},gpa:{gpa:0,weakSubjects:'',schoolSupport:''},semPayments:[{term:'1/2568',p1:0,p2:0,item1:'ค่าเงินบำรุงการศึกษา',item2:'ค่าใช้จ่ายในการเรียน'}],semGpa:[{term:'1/2568',gpa:0,weakSubjects:'',schoolSupport:''}]};
  DB.students.push(ns);
  openStudentDetail(DB.students.length-1);
}

// ============ STUDENT DETAIL MODAL ============
