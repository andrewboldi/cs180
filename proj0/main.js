/* CS180 Project 0 — beige optics: brass lens rings, drifting dust,
   aperture-iris loader, ScrollSmoother + scroll-triggered reveals. */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

window.__animBooted = true;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || document.documentElement.classList.contains('print-mode');

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

/* ————————————————— three.js scene ————————————————— */

let rings = null;
let sceneApi = null;
const introScale = { v: 1 };

try {
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe9e1d0, 6.5, 13);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
  camera.position.set(0, 0, 6);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const keyLight = new THREE.DirectionalLight(0xfff1da, 1.4);
  keyLight.position.set(-3, 4, 5);
  scene.add(keyLight);
  scene.add(new THREE.AmbientLight(0xe9e1d0, 0.35));

  const matBrass = new THREE.MeshStandardMaterial({
    color: 0xb08d57, metalness: 0.92, roughness: 0.3,
    envMapIntensity: 1.2, transparent: true, opacity: 1,
  });
  const matBrassDark = new THREE.MeshStandardMaterial({
    color: 0x7c5e31, metalness: 0.88, roughness: 0.42,
    envMapIntensity: 1.0, transparent: true, opacity: 0.95,
  });
  const matBrassThin = new THREE.MeshStandardMaterial({
    color: 0xc4a36c, metalness: 0.9, roughness: 0.25,
    envMapIntensity: 1.25, transparent: true, opacity: 0.9,
  });
  const ringMats = [matBrass, matBrassDark, matBrassThin];
  const baseOpacity = ringMats.map((m) => m.opacity);

  rings = new THREE.Group();
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.052, 48, 220), matBrass);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.02, 32, 240), matBrassDark);
  const ring3 = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.014, 32, 200), matBrassThin);
  ring2.rotation.x = 0.22;
  ring3.rotation.y = 0.3;
  rings.add(ring1, ring2, ring3);
  rings.rotation.set(0.3, -0.3, 0.05);
  scene.add(rings);

  /* soft round sprite so dust reads as motes, not squares */
  const dustSprite = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  const makeDust = (count, spread, size, opacity) => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * spread.x;
      positions[i * 3 + 1] = (Math.random() - 0.5) * spread.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x8a6d40, size, sizeAttenuation: true, map: dustSprite,
      transparent: true, opacity, depthWrite: false,
    });
    return new THREE.Points(geo, mat);
  };

  const dustFar = makeDust(190, { x: 14, y: 9, z: 5 }, 0.055, 0.4);
  const dustNear = makeDust(90, { x: 10, y: 7, z: 3 }, 0.08, 0.26);
  dustFar.position.z = -2;
  scene.add(dustFar, dustNear);

  /* — a century of cameras at the centre of the rig — */
  const camMatBase = {
    leather: new THREE.MeshStandardMaterial({ color: 0x3b3227, metalness: 0.15, roughness: 0.75, transparent: true }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.92, roughness: 0.3, envMapIntensity: 1.2, transparent: true }),
    silver: new THREE.MeshStandardMaterial({ color: 0xd9d3c3, metalness: 0.95, roughness: 0.3, envMapIntensity: 1.1, transparent: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0x171209, metalness: 0.7, roughness: 0.12, envMapIntensity: 1.4, transparent: true }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x27211a, metalness: 0.55, roughness: 0.28, envMapIntensity: 1.1, transparent: true }),
  };

  const holder = new THREE.Group();
  rings.add(holder);
  const eras = [];

  const box = (g, mat, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const cyl = (g, mat, r, len, x, y, z, alongZ = true) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 40), mat);
    if (alongZ) m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };

  const buildEra = (builder) => {
    const kit = {};
    Object.entries(camMatBase).forEach(([k, m]) => { kit[k] = m.clone(); });
    const group = new THREE.Group();
    builder(group, kit);
    const mats = Object.values(kit);
    group.visible = eras.length === 0;
    eras.push({ group, mats, baseOp: mats.map((m) => m.opacity), fade: eras.length === 0 ? 1 : 0 });
    holder.add(group);
  };

  /* 1900s — field camera on a rail, leather bellows */
  buildEra((g, kit) => {
    box(g, kit.brass, 1.02, 0.05, 0.46, 0, -0.5, 0);
    box(g, kit.leather, 0.8, 0.8, 0.18, 0, 0.02, -0.38);
    box(g, kit.gloss, 0.86, 0.86, 0.05, 0, 0.02, -0.5);
    for (let i = 0; i < 6; i += 1) {
      const s = 0.66 - i * 0.05 + (i % 2 ? 0.05 : 0);
      box(g, kit.leather, s, s, 0.09, 0, 0.02, -0.24 + i * 0.105);
    }
    box(g, kit.gloss, 0.46, 0.46, 0.05, 0, 0.02, 0.42);
    cyl(g, kit.brass, 0.15, 0.18, 0, 0.02, 0.53);
    cyl(g, kit.glass, 0.11, 0.03, 0, 0.02, 0.63);
    cyl(g, kit.brass, 0.05, 0.06, 0.3, -0.26, 0.42, false);
  });

  /* 1950s — twin-lens reflex */
  buildEra((g, kit) => {
    box(g, kit.leather, 0.6, 1.0, 0.46, 0, 0, 0);
    box(g, kit.gloss, 0.5, 0.84, 0.05, 0, -0.04, 0.25);
    cyl(g, kit.brass, 0.13, 0.1, 0, 0.16, 0.31);
    cyl(g, kit.glass, 0.09, 0.03, 0, 0.16, 0.37);
    cyl(g, kit.brass, 0.16, 0.13, 0, -0.2, 0.32);
    cyl(g, kit.glass, 0.12, 0.03, 0, -0.2, 0.4);
    box(g, kit.leather, 0.46, 0.16, 0.4, 0, 0.58, -0.01);
    box(g, kit.brass, 0.22, 0.06, 0.03, 0, 0.42, 0.27);
    cyl(g, kit.brass, 0.07, 0.06, 0.33, 0.05, 0.02, false).rotation.z = Math.PI / 2;
    cyl(g, kit.brass, 0.055, 0.06, -0.33, -0.12, 0.02, false).rotation.z = Math.PI / 2;
  });

  /* 1970s — single-lens reflex */
  buildEra((g, kit) => {
    box(g, kit.leather, 1.1, 0.56, 0.34, 0, -0.06, 0);
    box(g, kit.silver, 1.1, 0.11, 0.3, 0, 0.275, 0);
    box(g, kit.silver, 0.34, 0.18, 0.26, 0, 0.41, 0);
    cyl(g, kit.silver, 0.27, 0.05, 0, -0.06, 0.2);
    cyl(g, kit.gloss, 0.22, 0.3, 0, -0.06, 0.37);
    const focusRing = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.02, 24, 60), kit.brass);
    focusRing.position.set(0, -0.06, 0.45);
    g.add(focusRing);
    cyl(g, kit.glass, 0.15, 0.03, 0, -0.06, 0.53);
    cyl(g, kit.brass, 0.04, 0.04, 0.42, 0.36, 0.02, false);
    cyl(g, kit.brass, 0.05, 0.05, -0.42, 0.36, 0, false);
  });

  /* today — the phone that shot this project */
  buildEra((g, kit) => {
    const slab = new THREE.Mesh(new RoundedBoxGeometry(0.54, 1.08, 0.06, 4, 0.05), kit.gloss);
    g.add(slab);
    const bump = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.34, 0.04, 3, 0.03), kit.leather);
    bump.position.set(-0.11, 0.31, 0.04);
    g.add(bump);
    cyl(g, kit.brass, 0.055, 0.025, -0.11, 0.385, 0.065);
    cyl(g, kit.glass, 0.04, 0.02, -0.11, 0.385, 0.082);
    cyl(g, kit.brass, 0.055, 0.025, -0.11, 0.235, 0.065);
    cyl(g, kit.glass, 0.04, 0.02, -0.11, 0.235, 0.082);
    cyl(g, kit.silver, 0.018, 0.02, -0.035, 0.385, 0.065);
    box(g, kit.silver, 0.5, 1.04, 0.006, 0, 0, -0.033);
  });

  let currentEra = 0;
  let swapTl = null;
  const setEra = (idx) => {
    if (idx === currentEra || !eras[idx]) return;
    const prev = eras[currentEra];
    const next = eras[idx];
    currentEra = idx;
    next.group.visible = true;
    if (reducedMotion) {
      eras.forEach((e, i) => { e.fade = i === idx ? 1 : 0; e.group.visible = i === idx; });
      return;
    }
    if (swapTl) swapTl.kill();
    swapTl = gsap.timeline({ onComplete: () => { if (prev !== next) prev.group.visible = false; } });
    swapTl.to(prev, { fade: 0, duration: 0.4, ease: 'power2.in' }, 0)
      .to(prev.group.rotation, { y: '+=1.5', duration: 0.45, ease: 'power2.in' }, 0)
      .fromTo(next, { fade: 0 }, { fade: 1, duration: 0.65, ease: 'power2.out' }, 0.32)
      .fromTo(next.group.rotation, { y: -1.1 }, { y: 0, duration: 0.85, ease: 'power3.out' }, 0.32)
      .fromTo(next.group.scale, { x: 0.55, y: 0.55, z: 0.55 }, { x: 1, y: 1, z: 1, duration: 0.85, ease: 'back.out(1.5)' }, 0.32);
  };

  /* — scroll choreography: the rig tours the whole page — */
  const pose = { x: 2.1, y: 0.45, s: 1, op: 1 };
  let marks = null;
  const computeMarks = () => {
    const vh = window.innerHeight;
    const p1 = document.getElementById('part-1');
    const p2 = document.getElementById('part-2');
    const p3 = document.getElementById('part-3');
    const col = document.querySelector('.colophon');
    if (!p1 || !p2 || !p3 || !col) return;
    /* pendulum: each swing lands on the opposite side and PARKS there for
       the whole section — one crossing per transition, during the gap
       before the next header (where the era morph also happens) */
    marks = {
      ways: [
        { at: 0, x: 2.1, y: 0.45, s: 1, op: 1 },
        { at: p1.offsetTop - vh * 0.55, x: -2.6, y: 0.5, s: 0.8, op: 0.9 },
        { at: p1.offsetTop + vh * 0.5, x: -2.35, y: -0.25, s: 0.62, op: 0.5 },
        /* part 1 → part 2: long swoop down through the centre */
        { at: p2.offsetTop - vh * 1.4, x: -2.35, y: -0.25, s: 0.62, op: 0.5 },
        { at: p2.offsetTop - vh * 0.85, x: 0, y: -0.55, s: 0.55, op: 0.5 },
        { at: p2.offsetTop - vh * 0.35, x: 2.45, y: 0.15, s: 0.8, op: 0.9 },
        { at: p2.offsetTop + vh * 0.5, x: 2.7, y: -0.25, s: 0.62, op: 0.5 },
        /* part 2 → part 3 */
        { at: p3.offsetTop - vh * 1.4, x: 2.7, y: -0.25, s: 0.62, op: 0.5 },
        { at: p3.offsetTop - vh * 0.85, x: 0, y: -0.55, s: 0.55, op: 0.5 },
        { at: p3.offsetTop - vh * 0.35, x: -2.6, y: 0.5, s: 0.8, op: 0.9 },
        { at: p3.offsetTop + vh * 0.5, x: -2.35, y: -0.2, s: 0.65, op: 0.55 },
        /* part 3 → colophon */
        { at: col.offsetTop - vh * 1.3, x: -2.35, y: -0.2, s: 0.65, op: 0.55 },
        { at: col.offsetTop - vh * 0.82, x: 0, y: -0.45, s: 0.6, op: 0.6 },
        { at: col.offsetTop - vh * 0.38, x: 2.05, y: 0.05, s: 0.95, op: 1 },
      ],
      eraAt: [p1.offsetTop - vh * 0.6, p2.offsetTop - vh * 0.7, p3.offsetTop - vh * 0.7],
    };
  };

  const smooth01 = (v) => v * v * (3 - 2 * v);
  const poseTarget = (yPos) => {
    const w = marks.ways;
    if (yPos <= w[0].at) return w[0];
    if (yPos >= w[w.length - 1].at) return w[w.length - 1];
    let i = 0;
    while (i < w.length - 2 && yPos > w[i + 1].at) i += 1;
    const a = w[i];
    const b = w[i + 1];
    const t = smooth01(Math.min(1, Math.max(0, (yPos - a.at) / Math.max(1, b.at - a.at))));
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      s: a.s + (b.s - a.s) * t,
      op: a.op + (b.op - a.op) * t,
    };
  };

  const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
  if (!reducedMotion) {
    window.addEventListener('pointermove', (e) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    });
  }

  let resp = { s: 0.8, xf: 1, yo: 0 };
  const layout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (w < 820) {
      resp = { s: 0.45, xf: 0.3, yo: 0.25 };
      camera.position.z = 6.9;
    } else {
      resp = { s: 0.8, xf: 1, yo: 0 };
      camera.position.z = 6;
    }
  };
  layout();
  window.addEventListener('resize', layout);

  const clock = new THREE.Clock();
  let rafId = null;

  let markTick = 0;
  const frame = () => {
    const t = clock.getElapsedTime();

    markTick += 1;
    if (!marks || markTick % 30 === 0) computeMarks();

    ring1.rotation.z = t * 0.05;
    ring1.rotation.x = Math.sin(t * 0.18) * 0.1;
    ring2.rotation.z = -t * 0.04;
    ring2.rotation.y = 0.2 + Math.sin(t * 0.14) * 0.12;
    ring3.rotation.z = t * 0.07;
    ring3.rotation.x = 0.5 + Math.sin(t * 0.11) * 0.08;

    dustFar.rotation.y = t * 0.012;
    dustNear.rotation.y = -t * 0.009;
    dustNear.position.y = Math.sin(t * 0.2) * 0.15;

    mouse.x += (mouse.tx - mouse.x) * 0.035;
    mouse.y += (mouse.ty - mouse.y) * 0.035;

    if (marks) {
      const yNow = window.scrollY || 0;
      const tgt = poseTarget(yNow);
      pose.x += (tgt.x - pose.x) * 0.022;
      pose.y += (tgt.y - pose.y) * 0.035;
      pose.s += (tgt.s - pose.s) * 0.04;
      pose.op += (tgt.op - pose.op) * 0.05;
      const want = marks.eraAt.reduce((acc, at) => acc + (yNow > at ? 1 : 0), 0);
      if (want !== currentEra) setEra(want);
    }

    rings.rotation.y = -0.3 + mouse.x * 0.14;
    rings.rotation.x = 0.28 - mouse.y * 0.1;
    rings.position.x = pose.x * resp.xf;
    rings.position.y = pose.y + resp.yo + Math.sin(t * 0.5) * 0.06;
    rings.scale.setScalar(pose.s * resp.s * introScale.v);
    holder.rotation.y = t * 0.14;

    ringMats.forEach((m, i) => { m.opacity = baseOpacity[i] * pose.op; });
    eras.forEach((e) => {
      if (!e.group.visible) return;
      e.mats.forEach((m, i) => { m.opacity = e.baseOp[i] * pose.op * e.fade; });
    });

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  };

  if (reducedMotion) {
    computeMarks();
    rings.position.set(pose.x * resp.xf, pose.y + resp.yo, 0);
    rings.scale.setScalar(pose.s * resp.s);
    renderer.render(scene, camera);
  } else {
    frame();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
        rafId = null;
      } else if (rafId === null) {
        clock.getDelta();
        frame();
      }
    });
  }
  sceneApi = { camera };
  window.__dbgRig = () => ({
    era: currentEra,
    x: rings.position.x,
    y: rings.position.y,
    s: rings.scale.x,
    op: pose.op,
    marks: !!marks,
  });
} catch (err) {
  console.warn('3D scene unavailable, continuing without it:', err);
}

/* ————————————————— gsap: smoother + transitions ————————————————— */

const nav = document.getElementById('nav');

if (reducedMotion) {
  document.documentElement.classList.add('no-anim');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
} else {
  const smoother = ScrollSmoother.create({
    wrapper: '#smooth-wrapper',
    content: '#smooth-content',
    smooth: 1.4,
    effects: true,
  });

  /* nav: frost when scrolled, tuck away when scrolling down */
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      nav.classList.toggle('scrolled', y > 60);
      if (y > 160 && self.direction === 1) {
        gsap.to(nav, { yPercent: -120, duration: 0.55, ease: 'power2.out', overwrite: 'auto' });
      } else {
        gsap.to(nav, { yPercent: 0, duration: 0.55, ease: 'power2.out', overwrite: 'auto' });
      }
    },
  });

  /* aperture-iris loader, then the hero settles in */
  const irisRadius = Math.hypot(window.innerWidth, window.innerHeight) * 0.55;
  gsap.set('.hero-sub', { y: 24 });

  const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
  intro
    .to('.loader-ring circle', {
      strokeDashoffset: 0, duration: 0.9, stagger: 0.18, ease: 'power2.inOut',
    })
    .to('.loader-mark', { opacity: 0, duration: 0.4, ease: 'power1.out' }, '+=0.1')
    .to('.iris-hole', { attr: { r: irisRadius }, duration: 1.25, ease: 'expo.inOut' }, '<0.05')
    .set('#loader', { display: 'none' })
    .to('.nav', { opacity: 1, duration: 0.9 }, '-=0.9')
    .to('.hero-eyebrow', { opacity: 1, duration: 0.8 }, '-=0.75')
    .to('.line', { y: 0, duration: 1.4, ease: 'power4.out', stagger: 0.14 }, '-=0.7')
    .to('.hero-sub', { opacity: 1, y: 0, duration: 1 }, '-=0.8')
    .to('.exif-strip', { opacity: 1, duration: 0.9 }, '-=0.6')
    .to('.scroll-cue', { opacity: 1, duration: 0.9 }, '-=0.5');

  if (rings) {
    intro.fromTo(introScale, { v: 0.82 }, { v: 1, duration: 1.8, ease: 'power2.out' }, 1.2);
  }

  /* generic reveals (headings get their own character treatment) */
  gsap.utils.toArray('.reveal').forEach((el) => {
    if (el.matches('h2, .colophon-title')) return;
    gsap.fromTo(el, { y: 44, opacity: 0 }, {
      y: 0,
      opacity: 1,
      duration: 1.3,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 86%' },
    });
  });

  /* headings rise character by character */
  gsap.utils.toArray('.part-head h2, .colophon-title').forEach((el) => {
    gsap.set(el, { opacity: 1 });
    const split = new SplitText(el, { type: 'chars', mask: 'chars' });
    gsap.from(split.chars, {
      yPercent: 115,
      duration: 0.9,
      ease: 'power4.out',
      stagger: 0.02,
      scrollTrigger: { trigger: el, start: 'top 86%' },
    });
  });

  /* protocol steps stagger in */
  gsap.fromTo('.protocol li', { y: 30, opacity: 0 }, {
    y: 0,
    opacity: 1,
    duration: 0.9,
    ease: 'power3.out',
    stagger: 0.12,
    scrollTrigger: { trigger: '.protocol', start: 'top 85%' },
  });

  /* hairlines draw themselves in */
  gsap.utils.toArray('.part, .colophon').forEach((sec) => {
    gsap.fromTo(sec, { '--rule-x': 0 }, {
      '--rule-x': 1,
      duration: 1.4,
      ease: 'power3.inOut',
      scrollTrigger: { trigger: sec, start: 'top 88%' },
    });
  });
  gsap.utils.toArray('.notes').forEach((n) => {
    gsap.fromTo(n, { '--rule-y': 0 }, {
      '--rule-y': 1,
      duration: 1.1,
      ease: 'power3.out',
      scrollTrigger: { trigger: n, start: 'top 85%' },
    });
  });

  /* frames: curtain reveal + slow settle */
  gsap.utils.toArray('.frame').forEach((el) => {
    const mask = el.querySelector('.frame-mask');
    const img = el.querySelector('img');
    const cap = el.querySelector('figcaption');
    const tl = gsap.timeline({
      scrollTrigger: { trigger: el, start: 'top 80%' },
    });
    tl.to(mask, { clipPath: 'inset(0% 0% 0% 0% round 18px)', duration: 1.4, ease: 'expo.inOut' })
      .fromTo(img, { scale: 1.08 }, { scale: 1, duration: 2.2, ease: 'power3.out' }, 0.15)
      .fromTo(cap, { opacity: 0, y: 12 }, {
        opacity: 1, y: 0, duration: 0.8, ease: 'power2.out', immediateRender: true,
      }, 0.9);
  });

  /* re-measure trigger positions once fonts and images have settled */
  window.addEventListener('load', () => ScrollTrigger.refresh());
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  /* smooth anchor scrolling */
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      smoother.scrollTo(target, true, 'top 90px');
    });
  });
}

/* ————————————————— camera extras: live EXIF, viewfinder HUD, capture, corners, vertigo ————————————————— */

(() => {
  const anim = !reducedMotion;
  const $ = (id) => document.getElementById(id);
  let frames = 0;

  /* — live EXIF strip: shutter follows scroll speed, focal follows page depth, f-stop follows the pointer — */
  const exif = {
    f: [$('exif-f'), $('hud-f')],
    shutter: [$('exif-shutter'), $('hud-shutter')],
    focal: [$('exif-focal'), $('hud-focal')],
    iso: [$('exif-iso')],
  };
  const setText = (list, text) => list.forEach((el) => { if (el) el.textContent = text; });

  const hour = new Date().getHours();
  setText(exif.iso, hour >= 7 && hour < 19 ? 'ISO 100' : 'ISO 800');

  const SHUTTERS = [[90, '1/60 s'], [450, '1/125 s'], [1200, '1/250 s'], [2800, '1/500 s'], [Infinity, '1/1000 s']];
  const FSTOPS = ['f/1.8', 'f/2.8', 'f/4', 'f/5.6', 'f/8'];
  let velo = 0;
  let pointerX = 0.2;
  window.addEventListener('pointermove', (e) => { pointerX = e.clientX / window.innerWidth; });

  if (anim) {
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => { velo = Math.abs(self.getVelocity()); },
    });
    let acc = 0;
    gsap.ticker.add((t, dt) => {
      acc += dt;
      if (acc < 160) return;
      acc = 0;
      velo *= 0.8;
      setText(exif.shutter, SHUTTERS.find(([v]) => velo < v)[1]);
      const max = Math.max(1, ScrollTrigger.maxScroll(window));
      const p = Math.min(1, Math.max(0, (window.scrollY || 0) / max));
      setText(exif.focal, `${Math.round(26 + p * 174)} mm`);
      setText(exif.f, FSTOPS[Math.min(FSTOPS.length - 1, Math.floor(pointerX * FSTOPS.length))]);
    });
  }

  /* — viewfinder HUD (press V) — */
  const hud = $('hud');
  const vfBtn = $('vf-toggle');
  const afEl = $('hud-af');
  let hudOn = false;
  let histoDone = false;

  const drawHisto = () => {
    if (histoDone) return;
    histoDone = true;
    const img = new Image();
    img.onload = () => {
      const w = 160;
      const h = Math.max(8, Math.round((img.naturalHeight / img.naturalWidth) * w));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const bins = new Array(32).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        bins[Math.min(31, y >> 3)] += 1;
      }
      const peak = Math.max(...bins);
      const out = $('hud-histo-canvas');
      if (!out || !peak) return;
      const octx = out.getContext('2d');
      octx.clearRect(0, 0, out.width, out.height);
      octx.fillStyle = '#7C5E31';
      bins.forEach((v, i) => {
        const bh = Math.max(1, Math.round((v / peak) * (out.height - 2)));
        octx.fillRect(i * 4, out.height - bh, 3, bh);
      });
    };
    img.src = 'media/part2-wide.jpg';
  };

  const afPos = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
  window.addEventListener('pointermove', (e) => { afPos.tx = e.clientX; afPos.ty = e.clientY; });
  const afTick = () => {
    const k = anim ? 0.16 : 1;
    afPos.x += (afPos.tx - afPos.x) * k;
    afPos.y += (afPos.ty - afPos.y) * k;
    afEl.style.transform = `translate(${afPos.x.toFixed(1)}px, ${afPos.y.toFixed(1)}px)`;
  };

  const setHud = (on) => {
    hudOn = on;
    vfBtn.setAttribute('aria-pressed', String(on));
    if (on) {
      hud.hidden = false;
      drawHisto();
      gsap.ticker.add(afTick);
      if (anim) {
        gsap.fromTo(hud, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'power2.out', overwrite: 'auto' });
        [['.c-tl', -26, -26], ['.c-tr', 26, -26], ['.c-bl', -26, 26], ['.c-br', 26, 26]].forEach(([sel, x, y]) => {
          gsap.fromTo(`.hud-corner${sel}`, { x, y }, { x: 0, y: 0, duration: 0.55, ease: 'power3.out', overwrite: 'auto' });
        });
      } else {
        hud.style.opacity = 1;
      }
    } else {
      gsap.ticker.remove(afTick);
      if (anim) {
        gsap.to(hud, { opacity: 0, duration: 0.3, ease: 'power1.out', overwrite: 'auto', onComplete: () => { hud.hidden = true; } });
      } else {
        hud.hidden = true;
      }
    }
  };

  /* — click a photo: shutter blink + film counter — */
  const blink = $('shutter-blink');
  const chip = $('film-chip');
  const bumpCounter = () => {
    frames += 1;
    const label = `FR ${String(frames).padStart(2, '0')}`;
    chip.hidden = false;
    chip.textContent = label;
    const hf = $('hud-frames');
    if (hf) hf.textContent = label;
    if (anim) gsap.fromTo(chip, { scale: 1.16 }, { scale: 1, duration: 0.45, ease: 'power2.out', overwrite: 'auto' });
  };

  document.querySelectorAll('.frame').forEach((fr) => {
    fr.addEventListener('click', () => {
      bumpCounter();
      if (anim) {
        gsap.timeline()
          .set(blink, { opacity: 0.92 })
          .to(blink, { opacity: 0, duration: 0.3, ease: 'power2.out' });
        gsap.fromTo(fr, { scale: 0.985 }, { scale: 1, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
      }
    });
  });

  /* — real Harris corner detection on the part-2 pair — */
  const harris = (img, topN) => {
    const W = 180;
    const H = Math.max(8, Math.round((img.naturalHeight / img.naturalWidth) * W));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);
    const g = new Float32Array(W * H);
    for (let i = 0; i < W * H; i += 1) {
      g[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    }
    const gx = new Float32Array(W * H);
    const gy = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y += 1) {
      for (let x = 1; x < W - 1; x += 1) {
        const i = y * W + x;
        gx[i] = g[i - W + 1] + 2 * g[i + 1] + g[i + W + 1] - g[i - W - 1] - 2 * g[i - 1] - g[i + W - 1];
        gy[i] = g[i + W - 1] + 2 * g[i + W] + g[i + W + 1] - g[i - W - 1] - 2 * g[i - W] - g[i - W + 1];
      }
    }
    const cand = [];
    for (let y = 4; y < H - 4; y += 1) {
      for (let x = 4; x < W - 4; x += 1) {
        let ixx = 0;
        let iyy = 0;
        let ixy = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const j = (y + dy) * W + (x + dx);
            ixx += gx[j] * gx[j];
            iyy += gy[j] * gy[j];
            ixy += gx[j] * gy[j];
          }
        }
        const tr = ixx + iyy;
        const r = ixx * iyy - ixy * ixy - 0.05 * tr * tr;
        if (r > 0) cand.push([r, x, y]);
      }
    }
    cand.sort((a, b) => b[0] - a[0]);
    const pts = [];
    for (const [, x, y] of cand) {
      if (pts.length >= topN) break;
      if (pts.every(([px, py]) => (px - x) ** 2 + (py - y) ** 2 > 36)) pts.push([x, y]);
    }
    return pts.map(([x, y]) => [x / W, y / H]);
  };

  const detectBtn = $('detect-btn');
  const detectNote = $('detect-note');
  let cornersOn = false;

  const clearCorners = () => document.querySelectorAll('.corner-layer').forEach((n) => n.remove());

  if (detectBtn) {
    detectBtn.addEventListener('click', () => {
      cornersOn = !cornersOn;
      detectBtn.setAttribute('aria-pressed', String(cornersOn));
      if (!cornersOn) {
        clearCorners();
        detectNote.textContent = '';
        return;
      }
      let total = 0;
      document.querySelectorAll('#part-2 .frame-mask img').forEach((img) => {
        const run = () => {
          const pts = harris(img, 14);
          total += pts.length;
          const layer = document.createElement('div');
          layer.className = 'corner-layer';
          pts.forEach(([x, y]) => {
            const dot = document.createElement('i');
            dot.className = 'cpt';
            dot.style.left = `${(x * 100).toFixed(2)}%`;
            dot.style.top = `${(y * 100).toFixed(2)}%`;
            layer.appendChild(dot);
          });
          img.parentElement.appendChild(layer);
          if (anim) {
            gsap.fromTo(layer.children, { scale: 0, opacity: 0 }, {
              scale: 1, opacity: 1, duration: 0.4, stagger: 0.035, ease: 'back.out(2.2)',
            });
          }
          detectNote.textContent = `${total} corners · harris · 3×3 sobel`;
        };
        if (img.complete && img.naturalWidth) run();
        else img.addEventListener('load', run, { once: true });
      });
    });
  }

  /* — type "180": the site performs its own dolly zoom — */
  let vertigoBusy = false;
  const wrapperEl = document.getElementById('smooth-wrapper');
  const vertigo = () => {
    if (vertigoBusy || !anim) return;
    vertigoBusy = true;
    const tl = gsap.timeline({
      onComplete: () => {
        vertigoBusy = false;
        gsap.set(wrapperEl, { clearProps: 'transform' });
        ScrollTrigger.refresh();
      },
    });
    tl.to(wrapperEl, { scale: 1.09, transformOrigin: '50% 42%', duration: 0.85, ease: 'power2.inOut' })
      .to(wrapperEl, { scale: 1, duration: 0.95, ease: 'power3.inOut' }, '>');
    if (sceneApi) {
      const cam = sceneApi.camera;
      const fov = { v: cam.fov };
      const apply = () => { cam.fov = fov.v; cam.updateProjectionMatrix(); };
      tl.to(fov, { v: 52, duration: 0.85, ease: 'power2.inOut', onUpdate: apply }, 0)
        .to(fov, { v: 35, duration: 0.95, ease: 'power3.inOut', onUpdate: apply }, '>');
    }
    const f = { v: 26 };
    const show = () => setText(exif.focal, `${Math.round(f.v)} mm`);
    tl.to(f, { v: 200, duration: 0.85, ease: 'power2.inOut', onUpdate: show }, 0)
      .to(f, { v: 26, duration: 0.95, ease: 'power3.inOut', onUpdate: show }, '>');
  };

  /* — wiring — */
  vfBtn.addEventListener('click', () => setHud(!hudOn));
  let keyBuffer = '';
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'v' || e.key === 'V') setHud(!hudOn);
    else if (e.key === 'Escape' && hudOn) setHud(false);
    keyBuffer = (keyBuffer + e.key).slice(-3);
    if (keyBuffer === '180') vertigo();
  });
})();
