/* ============================================================
   mi-fx.js (v70) — ลูกเล่นธีมอวกาศของแบบสำรวจแววความสามารถ (mi.html)
   • น้อง DLTV 3D (three.js) ย้ายตำแหน่งตามหน้าจอ + พูดผ่านบับเบิล + ท่าทางตามการตอบ
   • ท้องฟ้าดาวกระพริบ + ดาวตก · พลุกระดาษเมื่อได้ผล · การ์ดคำถามพลิก 3D
   ห่อฟังก์ชันเดิมของหน้า (show / drawQ / answer / selectId / openResults) — ตรรกะการคิดคะแนนไม่เปลี่ยน
   ============================================================ */
const $ = (s) => document.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
let mascot = null;
const m = (fn, ...a) => { try { mascot && mascot[fn] && mascot[fn](...a); } catch (e) {} };

/* ---------- น้อง DLTV ---------- */
async function initMascot() {
  const stage = $('#stage'); if (!stage) return;
  try {
    const c = document.createElement('canvas');
    if (!(c.getContext('webgl2') || c.getContext('webgl'))) throw new Error('no webgl');
    const { Mascot } = await import('./mascot3d.js');
    mascot = new Mascot(stage, { logoUrl: 'assets/mi/dltv-logo.png' });
  } catch (e) {
    console.warn('3D not available, using image', e);
    const f = stage.querySelector('.stage-fallback'); if (f) f.hidden = false;
  }
}
let bubbleT;
function say(text, ms = 2600) {
  const b = $('#bubble'); if (!b) return;
  b.classList.remove('show'); void b.offsetWidth;
  b.textContent = text; b.classList.add('show');
  clearTimeout(bubbleT); bubbleT = setTimeout(() => b.classList.remove('show'), ms);
}

/* ---------- ห่อฟังก์ชันเดิม ---------- */
const orig = { show: window.show, drawQ: window.drawQ, answer: window.answer, selectId: window.selectId, openResults: window.openResults, startTest: window.startTest };
let cur = 'home';
window.show = function (id) {
  const prev = document.querySelector('.screen.on');
  const next = document.getElementById('s-' + id);
  document.body.dataset.screen = id;
  if (prev && next && prev !== next && !RM) {
    prev.classList.add('leaving');
    setTimeout(() => prev.classList.remove('leaving'), 320);
  }
  const r = orig.show.apply(this, arguments);
  if (id !== cur) react(id);
  cur = id;
  return r;
};
function react(id) {
  if (id === 'home') { m('setMood', 'idle'); setTimeout(() => say('อยากรู้ไหมว่าเราเก่งด้านไหน? มาสำรวจกัน 🚀'), 500); }
  else if (id === 'quiz') { m('setMood', 'idle'); m('play', 'wave'); setTimeout(() => say('ตอบตามความจริงนะครับ ไม่มีถูกไม่มีผิด ✨', 2400), 600); }
  else if (id === 'load') { m('play', 'spin'); m('setSignal', 3); say('กำลังส่งสัญญาณไปวิเคราะห์ผล… 🛰️', 1700); }
}
if (orig.drawQ) window.drawQ = function (dir = 0) {
  const r = orig.drawQ.apply(this, arguments);
  const card = $('#s-quiz .qcard');
  if (card && dir && !RM) { card.classList.remove('qin', 'back'); void card.offsetWidth; card.classList.add('qin'); if (dir < 0) card.classList.add('back'); }
  const big = $('#qno'); if (big && !RM) big.animate([{ transform: 'scale(.4)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  return r;
};
const CHEERS = ['เก่งมากครับ 👍', 'ไปได้สวย! ✨', 'ตั้งใจดีมาก 💪', 'อีกนิดเดียว สู้ ๆ 🚀', 'น้อง DLTV เชียร์อยู่นะ 💛'];
if (orig.answer) window.answer = function (v) {
  const before = (typeof T !== 'undefined' && T) ? T.ans.filter(x => x !== null).length : 0;
  const r = orig.answer.apply(this, arguments);
  m('play', v ? 'nod' : 'shake');
  const after = (typeof T !== 'undefined' && T) ? T.ans.filter(x => x !== null).length : 0;
  if (after > before && after % 10 === 0) say(CHEERS[(after / 10 - 1) % CHEERS.length], 1600);
  return r;
};
if (orig.selectId) window.selectId = async function (id) {
  const r = await orig.selectId.apply(this, arguments);
  try {
    const box = $('#miwho .nm');
    const nm = box && box.textContent.trim();
    if (nm && cur === 'home') { m('play', 'wave'); say('สวัสดีครับ ' + nm.replace(/^(เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นาย|นางสาว)\s*/, '') + ' 👋', 2800); }
  } catch (e) {}
  return r;
};
if (orig.openResults) window.openResults = function (celebrate) {
  const r = orig.openResults.apply(this, arguments);
  m('setSignal', 1);
  if (celebrate && document.body.dataset.screen === 'res') {
    m('setMood', 'happy'); m('play', 'happy');
    setTimeout(() => { confetti(); m('burst', 50); say('เยี่ยมมาก! นี่คือสายอาชีพที่เหมาะกับเรา 🎉', 3400); }, 500);
  } else if (document.body.dataset.screen === 'res') { say('ผลของเราอยู่ด้านล่างเลยครับ 👇', 2200); }
  return r;
};

/* ---------- พลุกระดาษ ---------- */
const cf = $('#confetti'), cx = cf && cf.getContext('2d'); let parts = [], cfRun = false;
function confetti() {
  if (!cf || RM) return;
  const W = (cf.width = innerWidth * devicePixelRatio), H = (cf.height = innerHeight * devicePixelRatio);
  const cols = ['#fbb900', '#ffd54a', '#ffffff', '#2dffc4', '#22d3ee', '#17b26a', '#788cff', '#ff8a00'];
  for (let i = 0; i < 160; i++) {
    const L = i % 2 === 0;
    parts.push({ x: L ? 0 : W, y: H * 0.75, vx: (8 + Math.random() * 14) * (L ? 1 : -1) * devicePixelRatio, vy: -(14 + Math.random() * 16) * devicePixelRatio,
      w: (6 + Math.random() * 6) * devicePixelRatio, h: (8 + Math.random() * 10) * devicePixelRatio, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], life: 0 });
  }
  if (!cfRun) { cfRun = true; requestAnimationFrame(cfTick); }
}
function cfTick() {
  cx.clearRect(0, 0, cf.width, cf.height);
  parts.forEach((p) => {
    p.life++; p.vy += 0.45 * devicePixelRatio; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.scale(1, Math.cos(p.life * 0.15)); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore();
  });
  parts = parts.filter((p) => p.y < cf.height + 40);
  if (parts.length) requestAnimationFrame(cfTick); else { cfRun = false; cx.clearRect(0, 0, cf.width, cf.height); }
}

/* ---------- ท้องฟ้าดาว ---------- */
(function sky() {
  const c = $('#sky'); if (!c || RM) return;
  const g = c.getContext('2d'); let W, H, stars = [], links = [], shoot = null, my = 0;
  const resize = () => {
    W = c.width = innerWidth * devicePixelRatio; H = c.height = innerHeight * devicePixelRatio;
    stars = Array.from({ length: Math.round((innerWidth * innerHeight) / 5000) }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: (Math.random() * 1.4 + 0.3) * devicePixelRatio, p: Math.random() * 6, s: 0.5 + Math.random() * 1.5, z: Math.random(),
      c: ['#ffffff', '#ffffff', '#ffffff', '#ffe27a', '#9ffff0', '#8be9ff', '#b9c6ff'][(Math.random() * 7) | 0] }));
    // v71: กลุ่มดาว — เส้นเชื่อมดาวสว่างที่อยู่ใกล้กัน (สื่อถึงการ "ค้นหาแวว")
    const big = stars.filter((s) => s.r > 1.2 * devicePixelRatio).slice(0, 40), maxD = 120 * devicePixelRatio;
    links = [];
    big.forEach((a, i) => big.slice(i + 1).forEach((b) => { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < maxD && links.length < 36) links.push([a, b, d / maxD]); }));
  };
  resize(); addEventListener('resize', resize);
  addEventListener('scroll', () => (my = scrollY), { passive: true });
  const loop = (t) => {
    if (document.hidden) { requestAnimationFrame(loop); return; }
    g.clearRect(0, 0, W, H);
    const yy = (s) => (s.y - my * s.z * 0.3 * devicePixelRatio + H * 4) % H;
    g.lineWidth = 0.8 * devicePixelRatio;
    links.forEach(([a, b, k]) => {
      const ya = yy(a), yb = yy(b); if (Math.abs(ya - yb) > H / 2) return;
      g.globalAlpha = (0.18 + 0.14 * Math.sin(t / 2400 + a.p)) * (1 - k * 0.6); g.strokeStyle = '#9ffff0';
      g.beginPath(); g.moveTo(a.x, ya); g.lineTo(b.x, yb); g.stroke();
    });
    stars.forEach((s) => {
      g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t / 1000 * s.s + s.p)); g.fillStyle = s.c;
      g.beginPath(); g.arc(s.x, (s.y - my * s.z * 0.3 * devicePixelRatio + H * 4) % H, s.r, 0, 7); g.fill();
    });
    if (!shoot && Math.random() < 0.004) shoot = { x: Math.random() * W * 0.7, y: Math.random() * H * 0.3, l: 0 };
    if (shoot) {
      shoot.l += 0.025; const len = 140 * devicePixelRatio, x = shoot.x + shoot.l * 500 * devicePixelRatio, y = shoot.y + shoot.l * 250 * devicePixelRatio;
      const gr = g.createLinearGradient(x, y, x - len, y - len / 2); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = 1 - shoot.l; g.strokeStyle = gr; g.lineWidth = 2 * devicePixelRatio; g.beginPath(); g.moveTo(x, y); g.lineTo(x - len, y - len / 2); g.stroke();
      if (shoot.l >= 1) shoot = null;
    }
    g.globalAlpha = 1; requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();

/* ---------- เริ่ม ---------- */
document.body.dataset.screen = (document.querySelector('.screen.on') || { id: 's-home' }).id.replace('s-', '');
cur = document.body.dataset.screen;
initMascot();
setTimeout(() => { if (cur === 'home') say('สวัสดีครับ! น้อง DLTV จะพาสำรวจแววความสามารถของเรา 🛰️', 3000); }, 900);
window.MIFX = { say, confetti, mascot: () => mascot };
