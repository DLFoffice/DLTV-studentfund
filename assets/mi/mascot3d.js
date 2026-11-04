// น้องนักบินอวกาศ DLTV แบบ 3D (three.js)
// ใช้: const m = new Mascot(containerEl, { logoUrl });
//      m.play('wave' | 'jump' | 'happy' | 'sad' | 'nod' | 'shake' | 'spin'); m.burst(); m.setMood('happy'|'sad'|'idle'); m.setSignal(speed)
import * as THREE from 'three';

const YELLOW = 0xffc21a;
const WHITE = 0xf7fdff;
const PALETTE = ['#ffd23f', '#ff8a00', '#ff4fa3', '#a06bff', '#3de0ff', '#4ade80', '#ffffff'];

const ease = {
  outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  bell: (t) => Math.sin(Math.PI * Math.min(Math.max(t, 0), 1)),
};

// ---------- พื้นผิว / texture ที่วาดด้วย canvas ----------
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sparkleTex = () => canvasTex(128, (g, s) => {
  const h = s / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.85)'); gr.addColorStop(0.45, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,.95)';
  [[h, 4, 5, s - 8], [4, h, s - 8, 5]].forEach(([x, y, w, hh]) => { g.save(); g.translate(h, h); g.scale(w > hh ? 1 : 0.06, w > hh ? 0.06 : 1); g.beginPath(); g.arc(0, 0, h - 4, 0, 7); g.restore(); g.fill(); });
});
const glowTex = () => canvasTex(256, (g, s) => {
  const h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, 'rgba(255,214,90,.95)'); gr.addColorStop(0.35, 'rgba(255,90,170,.45)'); gr.addColorStop(0.65, 'rgba(110,90,255,.22)'); gr.addColorStop(1, 'rgba(60,200,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
const shadowTex = () => canvasTex(128, (g) => {
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(10,0,40,.5)'); gr.addColorStop(1, 'rgba(10,0,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});

function rainbowColors(geo, sat = 0.95, light = 0.6, offset = 0) {
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i)) / (Math.PI * 2) + 0.5;
    c.setHSL((a + offset) % 1, sat, light); col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo;
}

// ฉากสีสำหรับเงาสะท้อน (ทำให้ผิวมันวาวสะท้อนสีสัน)
function colorfulEnv(renderer) {
  const env = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(10, 32, 16);
  const cols = new Float32Array(skyGeo.attributes.position.count * 3), c = new THREE.Color(), top = new THREE.Color('#4a3cff'), mid = new THREE.Color('#1a1f6e'), bot = new THREE.Color('#ff3d9a');
  for (let i = 0; i < skyGeo.attributes.position.count; i++) {
    const y = skyGeo.attributes.position.getY(i) / 10;
    if (y > 0) c.copy(mid).lerp(top, y); else c.copy(mid).lerp(bot, -y * 0.8);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
  const panel = (color, k, x, y, z, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  panel('#ffffff', 6, 2, 6, 5, 5, 3);   // ไฟหลักด้านบน
  panel('#ffd23f', 3, 6, 1, 3, 3, 4);   // เหลือง DLTV
  panel('#ff4fa3', 3, -6, 2, 1, 3, 5);  // ชมพู
  panel('#3de0ff', 3, 2, -1, -7, 5, 3); // ฟ้า
  panel('#a06bff', 2.5, -4, 5, -4, 4, 3); // ม่วง
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.03).texture; pm.dispose();
  return tex;
}

export class Mascot {
  constructor(container, opts = {}) {
    this.el = container;
    this.opts = opts;
    this.pointer = new THREE.Vector2();
    this.drag = { on: false, moved: 0, x: 0, yaw: 0 };
    this.action = null;
    this.signalSpeed = 1;
    this.mood = 'idle';
    this.nextBlink = 1.5;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.environment = colorfulEnv(this.renderer);

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    this.camera.position.set(0, 1.8, 10);

    const key = new THREE.DirectionalLight(0xfff4e0, 1.7); key.position.set(3, 5, 6); this.scene.add(key);
    this.rimPink = new THREE.DirectionalLight(0xff4fa3, 1.3); this.rimPink.position.set(-5, 2, -3); this.scene.add(this.rimPink);
    this.rimCyan = new THREE.DirectionalLight(0x3de0ff, 1.6); this.rimCyan.position.set(5, 1, -3); this.scene.add(this.rimCyan);
    const fill = new THREE.DirectionalLight(0xa06bff, 0.8); fill.position.set(-3, -2, 5); this.scene.add(fill);
    this.scene.add(new THREE.HemisphereLight(0xe8ecff, 0x3a3a8a, 0.7));

    this.build();
    this.bind();
    this.resize();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
    this.play('wave');
  }

  // ================================================================ model
  build() {
    const white = new THREE.MeshPhysicalMaterial({ color: WHITE, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12, sheen: 0.6, sheenColor: new THREE.Color('#bfe9ff'), sheenRoughness: 0.4 });
    const yellow = new THREE.MeshPhysicalMaterial({ color: YELLOW, roughness: 0.3, clearcoat: 0.8, emissive: 0xff8a00, emissiveIntensity: 0.28 });
    const visor = new THREE.MeshPhysicalMaterial({ color: 0x2a2552, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03,
      iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 650] });
    const chrome = new THREE.MeshPhysicalMaterial({ color: 0xdfe6ff, roughness: 0.15, metalness: 0.9 });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd23f').multiplyScalar(1.4), toneMapped: false });
    const M = (g, m) => new THREE.Mesh(g, m);

    this.root = new THREE.Group(); this.scene.add(this.root);
    this.body = new THREE.Group(); this.root.add(this.body);

    // ขา + เท้า
    this.legs = [];
    [-1, 1].forEach((s) => {
      const leg = new THREE.Group(); leg.position.set(0.2 * s, 0.62, 0);
      const l = M(new THREE.CapsuleGeometry(0.16, 0.28, 8, 16), white); l.position.y = -0.24; leg.add(l);
      const boot = M(new THREE.TorusGeometry(0.16, 0.035, 8, 24), yellow); boot.rotation.x = Math.PI / 2; boot.position.y = -0.36; leg.add(boot);
      const foot = M(new THREE.SphereGeometry(0.2, 24, 16), white); foot.scale.set(1.05, 0.55, 1.35); foot.position.set(0, -0.5, 0.06); leg.add(foot);
      this.body.add(leg); this.legs.push(leg);
    });

    // ลำตัว
    const torso = M(new THREE.CapsuleGeometry(0.42, 0.42, 12, 32), white);
    torso.scale.set(1, 1, 0.86); torso.position.y = 1.0; this.body.add(torso);
    const belt = M(new THREE.TorusGeometry(0.405, 0.05, 12, 48), yellow);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.86, 1); belt.position.y = 0.74; this.body.add(belt);
    const collar = M(new THREE.TorusGeometry(0.3, 0.075, 16, 48), yellow);
    collar.rotation.x = Math.PI / 2; collar.position.y = 1.42; this.body.add(collar);
    // ไฟสถานะเล็ก ๆ ที่เข็มขัด
    this.leds = ['#ff4fa3', '#3de0ff', '#4ade80'].map((c, i) => {
      const led = M(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), toneMapped: false }));
      const a = -0.35 + i * 0.35; led.position.set(Math.sin(a) * 0.4, 0.74, Math.cos(a) * 0.36); this.body.add(led); return led;
    });

    // โลโก้ DLTV ที่หน้าอก
    if (this.opts.logoUrl) {
      new THREE.TextureLoader().load(this.opts.logoUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        const badge = M(new THREE.PlaneGeometry(0.36, 0.33),
          new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
        badge.position.set(0, 1.02, 0.372); badge.rotation.x = -0.05; this.body.add(badge);
      });
    }

    // แขน
    this.arms = [];
    [-1, 1].forEach((s) => {
      const pivot = new THREE.Group(); pivot.position.set(0.4 * s, 1.3, 0);
      pivot.rotation.order = 'ZXY'; // เอียงไปด้านหน้าก่อน แล้วค่อยยกแขนออกข้าง
      const arm = M(new THREE.CapsuleGeometry(0.12, 0.34, 8, 16), white); arm.position.y = -0.24; pivot.add(arm);
      const cuff = M(new THREE.TorusGeometry(0.12, 0.035, 8, 24), yellow); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.4; pivot.add(cuff);
      const hand = M(new THREE.SphereGeometry(0.15, 24, 16), white); hand.position.y = -0.52; pivot.add(hand);
      this.body.add(pivot); this.arms.push(pivot);
    });

    // หัว (หมวกนักบินอวกาศ)
    this.headPivot = new THREE.Group(); this.headPivot.position.y = 1.45; this.body.add(this.headPivot);
    const head = new THREE.Group(); head.position.y = 0.86; this.headPivot.add(head); this.head = head;
    const helmet = M(new THREE.SphereGeometry(0.95, 64, 48), white); helmet.scale.set(1.06, 0.96, 1); head.add(helmet);
    const vis = M(new THREE.SphereGeometry(1, 64, 48), visor); vis.scale.set(0.79, 0.66, 0.48); vis.position.z = 0.55; head.add(vis);
    // ขอบหมวกสีเหลือง
    const rim = M(new THREE.TorusGeometry(1, 0.035, 12, 64), yellow); rim.scale.set(0.79, 0.66, 1); rim.position.z = 0.64; head.add(rim);

    // ตา ปาก แก้มชมพู
    this.eyes = new THREE.Group(); head.add(this.eyes);
    [-1, 1].forEach((s) => {
      const e = M(new THREE.SphereGeometry(0.1, 24, 16), glow); e.scale.set(1, 1.05, 0.35); e.position.set(0.28 * s, 0.1, 1.0); this.eyes.add(e);
      const spark = M(new THREE.CircleGeometry(0.025, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      spark.position.set(0.28 * s + 0.035, 0.145, 1.04); this.eyes.add(spark);
      const blush = M(new THREE.CircleGeometry(0.08, 24), new THREE.MeshBasicMaterial({ color: '#ff5fae', transparent: true, opacity: 0.55, toneMapped: false }));
      blush.scale.set(1.3, 0.75, 1); blush.position.set(0.44 * s, -0.08, 0.92); blush.rotation.y = 0.45 * s; head.add(blush);
    });
    this.mouth = M(new THREE.CircleGeometry(0.17, 32, Math.PI, Math.PI), glow);
    this.mouth.position.set(0, -0.12, 1.035); this.mouth.rotation.x = -0.18; head.add(this.mouth);
    const tongue = M(new THREE.CircleGeometry(0.07, 20, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: '#ff6fa8', toneMapped: false }));
    tongue.position.set(0, -0.24, 1.04); tongue.rotation.x = -0.2; this.mouth.add(tongue); tongue.position.set(0, -0.085, 0.004); tongue.rotation.x = 0;
    this.mouthSad = M(new THREE.TorusGeometry(0.13, 0.03, 8, 24, Math.PI), glow);
    this.mouthSad.position.set(0, -0.28, 1.0); this.mouthSad.rotation.x = -0.2; this.mouthSad.visible = false; head.add(this.mouthSad);

    // แสงสะท้อนบนกระจก
    const shine = M(new THREE.TorusGeometry(0.55, 0.03, 8, 24, 0.55), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
    shine.position.z = 0.93; shine.rotation.z = 1.95; head.add(shine);
    const dot = M(new THREE.CircleGeometry(0.035, 12), shine.material); dot.position.set(-0.52, 0.2, 0.9); head.add(dot);

    // เสาอากาศ + คลื่นสัญญาณสีรุ้ง
    const ant = new THREE.Group();
    const dir = new THREE.Vector3(0.62, 0.72, 0.15).normalize();
    ant.position.copy(dir.clone().multiplyScalar(0.9));
    ant.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    ant.add(M(new THREE.CylinderGeometry(0.09, 0.11, 0.08, 20), chrome));
    const stick = M(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 12), chrome); stick.position.y = 0.15; ant.add(stick);
    this.antBall = M(new THREE.SphereGeometry(0.08, 20, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4fa3').multiplyScalar(1.5), toneMapped: false }));
    this.antBall.position.y = 0.31; ant.add(this.antBall);
    head.add(ant);

    this.waves = [];
    const waveOrigin = dir.clone().multiplyScalar(1.22);
    ['#ffd23f', '#ff8a00', '#ff4fa3'].forEach((c, i) => {
      const w = M(new THREE.TorusGeometry(0.22 + i * 0.17, 0.038, 8, 32, 1.5),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.3), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
      w.position.copy(waveOrigin); w.position.z = 0.2; w.rotation.z = -0.15;
      head.add(w); this.waves.push(w);
    });

    // ---------- เอฟเฟกต์รอบตัว ----------
    // แสงฟุ้งด้านหลัง
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.halo.position.set(0, 2.0, -1.5); this.halo.scale.set(3.4, 3.4, 1); this.scene.add(this.halo);

    // วงโคจรสีรุ้ง + ดาวเคราะห์จิ๋ว
    this.orbits = [];
    [[1.45, 1.32, 0.3, 0.0, '#3de0ff'], [1.7, 1.18, -0.45, 0.5, '#ff4fa3']].forEach(([r, tx, tz, off, pc], i) => {
      const g = new THREE.Group(); g.position.y = 1.05; g.rotation.set(tx, 0, tz);
      const ring = M(rainbowColors(new THREE.TorusGeometry(r, 0.014, 6, 160), 1, 0.62, off),
        new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, toneMapped: false }));
      g.add(ring);
      const planet = M(new THREE.SphereGeometry(i ? 0.09 : 0.11, 20, 16), new THREE.MeshPhysicalMaterial({ color: pc, emissive: pc, emissiveIntensity: 0.6, roughness: 0.3, clearcoat: 1 }));
      g.add(planet);
      this.root.add(g); this.orbits.push({ g, planet, r, speed: i ? -0.7 : 0.9, a: i * 2 });
    });

    // พื้นวงแหวนเรืองแสง
    this.pad = M(rainbowColors(new THREE.RingGeometry(0.72, 0.82, 96)), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.pad.rotation.x = -Math.PI / 2; this.pad.position.y = 0.012; this.scene.add(this.pad);
    this.shadow = M(new THREE.PlaneGeometry(1.8, 0.7), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.01; this.scene.add(this.shadow);

    // ประกายดาวระยิบระยับ
    this.sparkTex = sparkleTex();
    this.sparkles = [];
    for (let i = 0; i < 34; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkTex, color: PALETTE[i % PALETTE.length], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      const a = Math.random() * Math.PI * 2, r = 1.4 + Math.random() * 1.1;
      s.userData = { a, r, y: 0.2 + Math.random() * 3.3, sp: 0.1 + Math.random() * 0.25, tw: 1 + Math.random() * 3, ph: Math.random() * 6, size: 0.12 + Math.random() * 0.22 };
      this.scene.add(s); this.sparkles.push(s);
    }
    this.bursts = [];

    this.root.scale.setScalar(0.001); // โผล่ขึ้นมาตอนเริ่ม
    this.intro = 0;
  }

  // ================================================================ input
  bind() {
    const cvs = this.renderer.domElement;
    cvs.style.touchAction = 'pan-y';
    window.addEventListener('pointermove', (e) => {
      const r = cvs.getBoundingClientRect();
      this.pointer.set(
        THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.5, 1.5),
        THREE.MathUtils.clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1.5, 1.5));
      if (this.drag.on) { const dx = e.clientX - this.drag.x; this.drag.x = e.clientX; this.drag.moved += Math.abs(dx); this.drag.yaw += dx * 0.012; }
    }, { passive: true });
    cvs.addEventListener('pointerdown', (e) => { this.drag.on = true; this.drag.moved = 0; this.drag.x = e.clientX; });
    window.addEventListener('pointerup', () => {
      if (!this.drag.on) return;
      this.drag.on = false;
      if (this.drag.moved < 6) { this.play(Math.random() < 0.5 ? 'jump' : 'spin'); this.burst(14); } // แตะที่ตัวน้อง
    });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.el);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.renderer.setAnimationLoop(null);
      else { this.clock.getDelta(); this.renderer.setAnimationLoop(() => this.tick()); }
    });
  }

  resize() {
    const w = Math.max(this.el.clientWidth, 1), h = Math.max(this.el.clientHeight, 1);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    const T = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position.z = Math.max(4.1 / T, 4.0 / (T * this.camera.aspect)); // ให้ตัวน้อง+วงโคจรอยู่ในกรอบ
    this.camera.lookAt(0, 1.7, 0);
    this.camera.updateProjectionMatrix();
  }

  // ================================================================ api
  play(name) { this.action = { name, t: 0, dur: { wave: 1.8, jump: 0.8, happy: 2.6, sad: 2.2, nod: 0.6, shake: 0.7, spin: 1.1 }[name] || 1 }; }
  setSignal(speed) { this.signalSpeed = speed; }
  setMood(m) { this.mood = m; this.mouth.visible = m !== 'sad'; this.mouthSad.visible = m === 'sad'; }
  /** ระเบิดประกายดาวออกจากตัวน้อง */
  burst(n = 40) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkTex, color: PALETTE[(Math.random() * PALETTE.length) | 0], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      s.position.set(0, 2 + this.root.position.y, 0.3);
      const a = Math.random() * Math.PI * 2, up = Math.random();
      s.userData = { v: new THREE.Vector3(Math.cos(a) * (1.5 + Math.random() * 2.5), 1.5 + up * 3.5, Math.sin(a) * 1.5), life: 0, max: 1 + Math.random() * 0.6, size: 0.15 + Math.random() * 0.25 };
      this.scene.add(s); this.bursts.push(s);
    }
  }
  dispose() { this.renderer.setAnimationLoop(null); this.ro.disconnect(); this.renderer.dispose(); this.el.innerHTML = ''; }

  // ================================================================ loop
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const k = this.reduced ? 0.3 : 1;
    const L = (a, b, f) => a + (b - a) * (1 - Math.exp(-f * dt));

    if (this.intro < 1) { this.intro = Math.min(1, this.intro + dt / 0.9); this.root.scale.setScalar(Math.max(0.001, ease.outBack(this.intro))); }

    // ท่าพื้นฐาน (idle)
    let y = Math.sin(t * 2.2) * 0.05 * k, sx = 1, sy = 1, spin = 0;
    let headX = -this.pointer.y * 0.22, headY = this.pointer.x * 0.45, headZ = Math.sin(t * 1.1) * 0.04 * k;
    let armA = 0.28 + Math.sin(t * 2.2) * 0.05 * k, armB = 0.28 + Math.sin(t * 2.2 + 1) * 0.05 * k; // A = ขวาจอ, B = ซ้ายจอ
    let bodyZ = Math.sin(t * 1.3) * 0.03 * k, fwdA = 0, fwdB = 0;
    if (this.mood === 'sad') { headX = 0.32; armA = armB = 0.08; }

    const a = this.action;
    if (a) {
      a.t += dt; const p = Math.min(a.t / a.dur, 1);
      switch (a.name) {
        case 'wave': armA = 1.95 + Math.sin(a.t * 14) * 0.4; fwdA = -0.45; headZ = -0.12; headY = 0.15; break;
        case 'jump': { const h = ease.bell(p); y += h * 0.75; sy = 1 + (p < 0.15 ? -0.18 * ease.bell(p / 0.15) : 0.06 * h); sx = 2 - sy; armA = armB = 0.3 + h * 1.4; fwdA = fwdB = -0.3 * h; break; }
        case 'spin': y += ease.bell(p) * 0.45; spin = ease.inOut(p) * Math.PI * 2; armA = armB = 0.3 + ease.bell(p) * 1.2; break;
        case 'happy': {
          const hop = Math.abs(Math.sin(p * Math.PI * 3)); y += hop * 0.6;
          sy = 1 + (hop < 0.15 ? -0.12 : 0.04); sx = 2 - sy;
          spin = p > 0.33 && p < 0.66 ? ease.inOut((p - 0.33) / 0.33) * Math.PI * 2 : 0;
          armA = 1.9 + Math.sin(a.t * 16) * 0.3; armB = 1.9 + Math.sin(a.t * 16 + 1.5) * 0.3; fwdA = fwdB = -0.5; headX = -0.2; break;
        }
        case 'sad': headX = 0.38; headY = Math.sin(a.t * 9) * 0.25 * (1 - p); armA = armB = 0.05; y -= 0.05; break;
        case 'nod': headX = Math.sin(p * Math.PI * 2) * 0.28; break;
        case 'shake': headY = Math.sin(p * Math.PI * 4) * 0.45; headZ = 0; break;
      }
      if (p >= 1) this.action = null;
    }

    if (!this.drag.on) this.drag.yaw = L(this.drag.yaw, 0, 3);
    this.root.position.y = y;
    this.body.scale.set(L(this.body.scale.x, sx, 25), L(this.body.scale.y, sy, 25), L(this.body.scale.z, sx, 25));
    this.root.rotation.y = this.drag.yaw + spin;
    this.body.rotation.z = L(this.body.rotation.z, bodyZ, 6);
    this.headPivot.rotation.x = L(this.headPivot.rotation.x, headX, 8);
    this.headPivot.rotation.y = L(this.headPivot.rotation.y, headY, 8);
    this.headPivot.rotation.z = L(this.headPivot.rotation.z, headZ, 8);
    this.arms[1].rotation.z = L(this.arms[1].rotation.z, armA, 14);
    this.arms[0].rotation.z = L(this.arms[0].rotation.z, -armB, 14);
    this.arms[1].rotation.x = L(this.arms[1].rotation.x, fwdA, 10);
    this.arms[0].rotation.x = L(this.arms[0].rotation.x, fwdB, 10);

    // กะพริบตา
    this.nextBlink -= dt;
    let ey = 1;
    if (this.nextBlink < 0.12) ey = 0.12;
    if (this.nextBlink < 0) this.nextBlink = 2 + Math.random() * 3;
    if (this.mood === 'happy' || (a && a.name === 'happy')) ey = 0.45;
    this.eyes.scale.y = L(this.eyes.scale.y, ey, 30);

    // คลื่นสัญญาณ + ไฟ
    const sp = this.signalSpeed * 2.2;
    this.waves.forEach((w, i) => {
      const ph = (t * sp - i * 0.33) % 1;
      w.material.opacity = 0.15 + 0.85 * Math.max(0, Math.sin(ph * Math.PI));
      w.scale.setScalar(0.92 + 0.1 * ph);
    });
    this.antBall.material.color.setHSL((t * 0.15) % 1, 1, 0.62).multiplyScalar(1.4);
    this.antBall.scale.setScalar(1 + 0.2 * Math.max(0, Math.sin(t * sp * Math.PI * 2)));
    this.leds.forEach((l, i) => l.scale.setScalar(0.7 + 0.5 * Math.max(0, Math.sin(t * 5 + i * 2))));

    // ไฟสีวน ๆ รอบตัว
    this.rimPink.position.set(Math.cos(t * 0.6) * -5, 2 + Math.sin(t * 0.8), Math.sin(t * 0.6) * -4);
    this.rimCyan.position.set(Math.cos(t * 0.6 + 2) * 5, 1 + Math.sin(t * 0.7), Math.sin(t * 0.6 + 2) * -4);

    // วงโคจร / ฮาโล / พื้น
    this.orbits.forEach((o) => {
      o.a += dt * o.speed * (this.signalSpeed > 1 ? 2.5 : 1);
      o.planet.position.set(Math.cos(o.a) * o.r, Math.sin(o.a) * o.r, 0);
      o.g.rotation.y += dt * 0.15;
    });
    this.halo.material.opacity = 0.35 + 0.12 * Math.sin(t * 1.6);
    this.halo.material.rotation = t * 0.1;
    this.pad.rotation.z = t * 0.8;
    const s = 1 - Math.min(y, 0.8) * 0.5;
    this.shadow.scale.set(s, s, s); this.shadow.material.opacity = 0.9 * s;
    this.pad.material.opacity = 0.45 + 0.3 * s;

    // ประกายดาว
    this.sparkles.forEach((p) => {
      const u = p.userData; u.a += dt * u.sp;
      p.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.8 + u.ph) * 0.15, Math.sin(u.a) * u.r * 0.6 - 0.2);
      const tw = Math.max(0, Math.sin(t * u.tw + u.ph)); p.scale.setScalar(u.size * (0.3 + tw));
      p.material.opacity = 0.25 + 0.75 * tw;
    });
    this.bursts = this.bursts.filter((p) => {
      const u = p.userData; u.life += dt;
      u.v.y -= 6 * dt; p.position.addScaledVector(u.v, dt);
      const f = 1 - u.life / u.max; p.scale.setScalar(u.size * Math.max(f, 0) * (1 + 0.4 * Math.sin(u.life * 20)));
      p.material.opacity = Math.max(f, 0);
      if (u.life >= u.max) { this.scene.remove(p); p.material.dispose(); return false; }
      return true;
    });

    this.renderer.render(this.scene, this.camera);
  }
}
