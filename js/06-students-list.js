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
function stdQueryGroups(q){
  return String(q||'').split(/[,，|]/).map(stdQueryTokens).filter(g=>g.length);
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
  stdProvRender();   // v20: จังหวัดเป็นตัวเลือกหลายรายการ
  fill(document.getElementById('std-filter-org'),  [...new Set(DB.students.map(s=>String(s.org||'').trim()).filter(Boolean))].sort(byThai));
}

function filterStudents(){

  const fo=document.getElementById('std-filter-org').value;
  const fr=document.getElementById('std-filter-risk').value;
  const groups=stdQueryGroups(document.getElementById('std-search').value);
  return DB.students.filter(s=>{
    if(groups.length){
      const hay=stdHaystack(s);
      // คั่นด้วย , = "หรือ" / เว้นวรรค = "และ"  เช่น "ขอนแก่น, อุดรธานี"
      if(!groups.some(g=>g.every(t=>hay.includes(t)))) return false;
    }
    if(stdProvSel.size && !stdProvSel.has(stdProvKey(s.province))) return false;
    if(fo && String(s.org||'').trim()!==fo) return false;
    if(fr && CareGroup.compute(s).label!==fr) return false;
    return true;
  });
}
// พิมพ์ค้นหาใหม่ → กลับไปหน้าแรกของผลลัพธ์เสมอ (เดิมอาจค้างอยู่หน้า 2–3 แล้วดูเหมือนไม่เจอ)
function onStudentSearch(){ stdPage=1; renderStudents(); }

/* ---------- v20: เลือกได้หลายจังหวัด (ค้นหาในรายการได้) ---------- */
const stdProvSel = new Set();
function stdProvCounts(){
  const m = new Map();
  DB.students.forEach(s=>{ const k=stdProvKey(s.province); if(k) m.set(k,(m.get(k)||0)+1); });
  return [...m.entries()].sort((a,b)=>a[0].localeCompare(b[0],'th'));
}
function stdProvVisible(){
  const q = stdNorm(document.getElementById('std-prov-search')?.value||'').replace(STD_PREFIX_RE,'');
  return stdProvCounts().filter(([p])=>!q || stdNorm(p).includes(q));
}
function stdProvRender(){
  const all = stdProvCounts();
  // ตัดจังหวัดที่ไม่มีในข้อมูลแล้วออกจากที่เลือก
  [...stdProvSel].forEach(p=>{ if(!all.some(([k])=>k===p)) stdProvSel.delete(p); });
  const btn = document.getElementById('std-prov-btn');
  if(btn){
    const n = stdProvSel.size;
    btn.textContent = n===0 ? 'จังหวัด (ทั้งหมด)' : n===1 ? [...stdProvSel][0] : `จังหวัด (เลือก ${n})`;
    btn.classList.toggle('on', n>0);
  }
  const list = document.getElementById('std-prov-list');
  if(list){
    const vis = stdProvVisible();
    list.innerHTML = vis.length ? vis.map(([p,c])=>`<label class="ms-item" role="option" aria-selected="${stdProvSel.has(p)}">
        <input type="checkbox" value="${escHtml(p)}" ${stdProvSel.has(p)?'checked':''}>
        <span class="ms-name">${escHtml(p)}</span><span class="ms-count">${c}</span></label>`).join('')
      : '<div class="ms-empty">ไม่พบจังหวัดที่ค้นหา</div>';
  }
  const chips = document.getElementById('std-prov-chips');
  if(chips){
    const counts = new Map(all);
    chips.hidden = stdProvSel.size===0;
    const total = [...stdProvSel].reduce((t,p)=>t+(counts.get(p)||0),0);
    chips.innerHTML = stdProvSel.size ? `<span class="ms-chips-label">จังหวัดที่เลือก (${stdProvSel.size} จังหวัด · ${total} คน)</span>`
      + [...stdProvSel].sort((a,b)=>a.localeCompare(b,'th')).map(p=>`<span class="ms-chip">${escHtml(p)} <b>${counts.get(p)||0}</b><button type="button" data-ms-remove="${escHtml(p)}" aria-label="เอา ${escHtml(p)} ออก">×</button></span>`).join('')
      + `<button type="button" class="ms-chip-clear" data-ms-remove="*">ล้างทั้งหมด</button>` : '';
  }
}
function stdProvChanged(){ stdProvRender(); onStudentSearch(); }
function stdProvOpen(open){
  const pop=document.getElementById('std-prov-pop'), btn=document.getElementById('std-prov-btn');
  if(!pop||!btn) return;
  pop.hidden = !open; btn.setAttribute('aria-expanded', String(open));
  if(open){ const s=document.getElementById('std-prov-search'); s.value=''; stdProvRender(); setTimeout(()=>s.focus(),0); }
}
(function stdProvBind(){
  const init = () => {
    const root=document.getElementById('std-prov-ms'); if(!root || root.dataset.bound) return;
    root.dataset.bound='1';
    document.getElementById('std-prov-btn').addEventListener('click',()=>stdProvOpen(document.getElementById('std-prov-pop').hidden));
    document.getElementById('std-prov-search').addEventListener('input',stdProvRender);
    document.getElementById('std-prov-search').addEventListener('keydown',e=>{
      if(e.key==='Escape'){ stdProvOpen(false); document.getElementById('std-prov-btn').focus(); }
      if(e.key==='Enter'){ // Enter = เลือกจังหวัดแรกที่ตรง
        e.preventDefault(); const v=stdProvVisible(); if(v.length){ const p=v[0][0]; stdProvSel.has(p)?stdProvSel.delete(p):stdProvSel.add(p); e.target.value=''; stdProvChanged(); }
      }
    });
    document.getElementById('std-prov-list').addEventListener('change',e=>{
      const cb=e.target.closest('input[type=checkbox]'); if(!cb) return;
      cb.checked ? stdProvSel.add(cb.value) : stdProvSel.delete(cb.value); stdProvChanged();
    });
    root.querySelector('.ms-actions').addEventListener('click',e=>{
      const a=e.target.closest('[data-ms]'); if(!a) return;
      if(a.dataset.ms==='all') stdProvVisible().forEach(([p])=>stdProvSel.add(p)); else stdProvSel.clear();
      stdProvChanged();
    });
    document.getElementById('std-prov-chips').addEventListener('click',e=>{
      const b=e.target.closest('[data-ms-remove]'); if(!b) return;
      const p=b.getAttribute('data-ms-remove'); p==='*'?stdProvSel.clear():stdProvSel.delete(p); stdProvChanged();
    });
    document.addEventListener('click',e=>{ if(!root.contains(e.target)) stdProvOpen(false); });
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();

/* ---------- v22: ส่งออก "แฟ้มประวัติ" นักเรียนตามตัวกรองปัจจุบันเป็น PDF ----------
   • แบบ resume มีรูปนักเรียน A4 แนวตั้ง 2 คนต่อหน้า เรียงตามจังหวัด → ลำดับทุน
   • ข้อมูล: ลำดับทุน, ชื่อ-ชื่อเล่น, โรงเรียน, อำเภอ/จังหวัด, สังกัด, GPA ล่าสุด, กลุ่มการดูแล
     และตารางผู้ติดต่อ: นักเรียน / ผู้ปกครอง / ครูที่ปรึกษา / ผู้อำนวยการ (ชื่อ + เบอร์โทร)
   • หน้าแรกมีหัวเอกสาร: เงื่อนไขที่กรอง + สรุปจำนวนต่อจังหวัด/กลุ่มการดูแล
   • ไม่รวมเลขบัตร ปชช. / เลขบัญชีธนาคาร / ที่อยู่บ้าน (ข้อมูลอ่อนไหว)
   • รอให้รูปโหลดเสร็จก่อนเปิดหน้าต่างพิมพ์ (สูงสุด 6 วินาที) */
function stdContactsOf(s){
  const sa = s.school_m1_addr || {}, m = s.mentor || {};
  // ค่าในแบบฟอร์มภาคเรียนปัจจุบัน ใช้เป็นค่าสำรองเมื่อทะเบียนยังว่าง
  let f1 = {}, f2 = {};
  try { const b = window.Term && Term.bucket(s, Term.active()); if (b) { f1 = b.form1 || {}; f2 = b.form2 || {}; } } catch (e) {}
  const pick = (...v) => { for (const x of v) { const t = String(x ?? '').trim(); if (t) return t; } return ''; };
  const teacherName = pick([m.firstName, m.lastName].filter(Boolean).join(' '), sa.advisorM1, f2.teacher_name, f1.teacher_name);
  return {
    student:  { name: pick(s.nickname ? `${s.name} (${s.nickname})` : s.name), phone: pick(s.phone, f1.cur_phone) },
    parent:   { name: pick(s.parent), phone: pick(s.parentPhone, f1.guardian_phone) },
    teacher:  { name: teacherName, phone: pick(m.phone, sa.telAdvisorM1, f2.teacher_phone, f1.teacher_phone), extra: pick(m.position, f2.teacher_position, f1.teacher_position) },
    director: { name: pick(sa.directorM1, f2.director_name), phone: pick(sa.telDirectorM1) },
  };
}

function exportFilteredStudents(){
  const rows = filterStudents().slice();
  if(!rows.length){ if(typeof showStatus==='function') showStatus('ไม่มีรายชื่อตามตัวกรองนี้','info'); return; }
  const E = escHtml;
  const provOf = s => stdProvKey(s.province) || 'ไม่ระบุจังหวัด';
  rows.sort((a,b)=>{ const pa=provOf(a), pb=provOf(b);
    if(pa!==pb) return pa==='ไม่ระบุจังหวัด'?1:pb==='ไม่ระบุจังหวัด'?-1:pa.localeCompare(pb,'th');
    return (+a.no||0)-(+b.no||0); });

  const provCount = new Map(); rows.forEach(s=>provCount.set(provOf(s),(provCount.get(provOf(s))||0)+1));
  const CARE = ['ต้องดูแลเป็นพิเศษ','เฝ้าระวัง','ปกติ','รอข้อมูล'];
  const careOf = new Map(rows.map(s=>[s, CareGroup.compute(s)]));
  const careCls = l => l==='ต้องดูแลเป็นพิเศษ'?'red':l==='เฝ้าระวัง'?'amber':l==='ปกติ'?'green':'gray';

  const cond = [];
  if(stdProvSel.size) cond.push(['จังหวัด', [...stdProvSel].sort((a,b)=>a.localeCompare(b,'th')).join(', ')]);
  const q=(document.getElementById('std-search').value||'').trim(); if(q) cond.push(['คำค้นหา', q]);
  const fo=document.getElementById('std-filter-org').value; if(fo) cond.push(['สังกัด', fo]);
  const fr=document.getElementById('std-filter-risk').value; if(fr) cond.push(['กลุ่มการดูแล', fr]);

  const val = v => v ? E(v) : '<span class="rs-empty">ยังไม่มีข้อมูล</span>';
  const tel = v => v ? `<span class="rs-tel">${E(v)}</span>` : '<span class="rs-empty">—</span>';

  const cards = rows.map(s=>{
    const g = getLatestGpa(s)||{}; const cg = careOf.get(s); const sa = s.school_m1_addr||{};
    const c = stdContactsOf(s);
    const src = safeUrl(s.photoUrl ? fixDriveUrl(s.photoUrl) : '');
    const ini = E(initials(s.name||''));
    const photo = src
      ? `<img class="rs-photo" src="${E(src)}" alt="" onerror="this.outerHTML='<div class=&quot;rs-photo rs-noimg&quot;>${ini}</div>'">`
      : `<div class="rs-photo rs-noimg">${ini}</div>`;
    const gpa = Number(g.gpa)>0 ? g.gpa : '';
    return `<section class="rs-card">
      <div class="rs-side">
        ${photo}
        <div class="rs-no">ลำดับทุน <b>${E(s.no)}</b></div>
        <div class="rs-gpa"><span>GPA ล่าสุด</span><b>${gpa ? E(gpa) : '–'}</b><small>${gpa ? 'ภาคเรียน '+E(g.term||'') : 'ยังไม่มีข้อมูล'}</small></div>
        <div class="rs-care ${careCls(cg.label)}">${E(cg.label)}</div>
      </div>
      <div class="rs-main">
        <header class="rs-name">
          <h2>${E(s.name||'(ยังไม่ระบุชื่อ)')}</h2>
          <div class="rs-sub">${s.nickname?`ชื่อเล่น <b>${E(s.nickname)}</b> · `:''}จังหวัด<b> ${E(provOf(s))}</b></div>
        </header>
        <h3>ข้อมูลการศึกษา</h3>
        <dl class="rs-grid">
          <div class="w2"><dt>โรงเรียน</dt><dd>${val(s.school_m1)}</dd></div>
          <div><dt>อำเภอ</dt><dd>${val(sa.amphoe)}</dd></div>
          <div><dt>จังหวัด</dt><dd>${val(stdProvKey(s.province))}</dd></div>
          <div class="w2"><dt>สังกัด</dt><dd>${val(s.org)}</dd></div>
        </dl>
        <h3>ผู้ติดต่อ</h3>
        <table class="rs-contacts">
          <tbody>
            <tr><th>นักเรียน</th><td>${val(s.name)}</td><td>${tel(c.student.phone)}</td></tr>
            <tr><th>ผู้ปกครอง</th><td>${val(c.parent.name)}</td><td>${tel(c.parent.phone)}</td></tr>
            <tr><th>ครูที่ปรึกษา</th><td>${val(c.teacher.name)}${c.teacher.extra?`<div class="rs-role">${E(c.teacher.extra)}</div>`:''}</td><td>${tel(c.teacher.phone)}</td></tr>
            <tr><th>ผู้อำนวยการ</th><td>${val(c.director.name)}</td><td>${tel(c.director.phone)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>`;
  }).join('');

  const printed = new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const qs = v => String(v).replace(/["\\\n\r]/g,' ');
  const html = `<style>
      @page rsdoc { size: A4; margin: 12mm 13mm 13mm;
        @top-left { content: "แฟ้มประวัตินักเรียนทุน DLTV — ${qs(rows.length)} คน"; font-family: Sarabun,'Noto Sans Thai',sans-serif; font-size: 8.5pt; color: #64748B; }
        @bottom-left { content: "พิมพ์เมื่อ ${qs(printed)} · เอกสารใช้ภายใน"; font-family: Sarabun,'Noto Sans Thai',sans-serif; font-size: 8.5pt; color: #94A3B8; }
        @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font-family: Sarabun,'Noto Sans Thai',sans-serif; font-size: 8.5pt; color: #64748B; } }
    </style>
    <article class="rs-doc">
      <header class="pl-head">
        <div>
          <div class="pl-org">มูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์</div>
          <h1>แฟ้มประวัตินักเรียนทุนการศึกษา</h1>
          <div class="pl-cond">${cond.length ? cond.map(([k,v])=>`<span><b>${E(k)}:</b> ${E(v)}</span>`).join('') : '<span>นักเรียนทุกคน (ไม่ได้ใช้ตัวกรอง)</span>'}</div>
        </div>
        <div class="pl-total"><b>${rows.length}</b><span>คน · ${provCount.size} จังหวัด</span></div>
      </header>
      <div class="pl-summary">
        ${provCount.size>1?`<div class="pl-sumbox"><div class="pl-sumt">จำนวนตามจังหวัด</div>${[...provCount].map(([p,n])=>`<span>${E(p)} <b>${n}</b></span>`).join('')}</div>`:''}
        <div class="pl-sumbox"><div class="pl-sumt">กลุ่มการดูแล</div>${CARE.map(l=>`<span><i class="pl-dot ${careCls(l)}"></i>${E(l)} <b>${rows.filter(s=>careOf.get(s).label===l).length}</b></span>`).join('')}</div>
      </div>
      ${cards}
    </article>`;

  let area = document.getElementById('sf-print-area');
  if(!area){ area=document.createElement('div'); area.id='sf-print-area'; document.body.appendChild(area); }
  area.innerHTML = html;

  const oldTitle = document.title;
  const provPart = stdProvSel.size ? '-' + [...stdProvSel].sort((a,b)=>a.localeCompare(b,'th')).slice(0,3).join('-') + (stdProvSel.size>3?`-และอีก${stdProvSel.size-3}จังหวัด`:'') : '';
  document.title = `แฟ้มประวัตินักเรียนทุน${provPart}-${rows.length}คน`;
  const restore = () => { document.title = oldTitle; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);

  // รอรูปโหลด (รูปจาก Google Drive อาจช้า) แล้วค่อยเปิดหน้าต่างพิมพ์
  const imgs = [...area.querySelectorAll('img.rs-photo')];
  if(imgs.length && typeof showStatus==='function') showStatus(`⏳ กำลังโหลดรูปนักเรียน ${imgs.length} รูป...`,'info');
  const waitImg = img => img.complete ? Promise.resolve() : new Promise(r=>{ img.addEventListener('load',r,{once:true}); img.addEventListener('error',r,{once:true}); });
  Promise.race([Promise.all(imgs.map(waitImg)), new Promise(r=>setTimeout(r,6000))])
    .then(()=>setTimeout(()=>window.print(), 80));
}



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
