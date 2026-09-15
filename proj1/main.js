/* CS180 Project 1 — beige optics, second movement: three tinted glass
   plates drift over the page and settle into registration, like the
   channels they represent. Aperture loader, ScrollSmoother, reveals. */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

window.__animBooted = true;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || document.documentElement.classList.contains('print-mode');

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

/* ————————————————— three.js scene ————————————————— */

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

  const keyLight = new THREE.DirectionalLight(0xfff1da, 1.3);
  keyLight.position.set(-3, 4, 5);
  scene.add(keyLight);
  scene.add(new THREE.AmbientLight(0xe9e1d0, 0.4));

  /* soft round dust sprite */
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

  /* — the three glass plates — */
  const rig = new THREE.Group();
  scene.add(rig);

  /* each plate carries one grayscale channel of the cathedral, tinted —
     only when the three register does the photograph appear */
  const PLATE_W = 1.42;
  const PLATE_H = 1.24;
  const texLoader = new THREE.TextureLoader();
  const plateSpecs = [
    { tint: 0x3d55f2, z: 0.16, tex: 'media/plate_ch_b.jpg' },
    { tint: 0x3bd23b, z: 0, tex: 'media/plate_ch_g.jpg' },
    { tint: 0xf23520, z: -0.16, tex: 'media/plate_ch_r.jpg' },
  ];
  const plates = [];
  const plateMats = [];

  /* the projection screen: a dark pane the three records sum onto,
     like Prokudin-Gorskii's triple projector */
  const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(PLATE_W * 1.34, PLATE_H * 1.34),
    new THREE.MeshBasicMaterial({ color: 0x1d1810, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  backing.position.z = -0.26;
  rig.add(backing);
  const backingEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(PLATE_W * 1.34, PLATE_H * 1.34, 0.02)),
    new THREE.LineBasicMaterial({ color: 0xb08d57, transparent: true, opacity: 0.6 }),
  );
  backingEdges.position.z = -0.26;
  rig.add(backingEdges);
  plateMats.push(backing.material, backingEdges.material);

  plateSpecs.forEach((spec, i) => {
    const g = new THREE.Group();
    const tex = texLoader.load(spec.tex);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, color: spec.tint,
      transparent: true, opacity: 0.78,
      blending: THREE.AdditiveBlending, fog: false,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(PLATE_W, PLATE_H), mat);
    g.add(glass);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xb08d57, transparent: true, opacity: 0.85 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(PLATE_W, PLATE_H, 0.02)), edgeMat);
    g.add(edges);
    g.position.z = spec.z;
    g.userData.home = { x: 0, y: 0, z: spec.z };
    g.userData.phase = i * 2.1;
    rig.add(g);
    plates.push(g);
    plateMats.push(mat, edgeMat);
  });
  const baseOpacity = plateMats.map((m) => m.opacity);
  rig.rotation.set(0.16, -0.42, 0.03);

  const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
  if (!reducedMotion) {
    window.addEventListener('pointermove', (e) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    });
  }

  let resp = { s: 1, xf: 1, yo: 0 };
  const layout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (w < 820) {
      resp = { s: 0.55, xf: 0.3, yo: 0.25 };
      camera.position.z = 6.9;
    } else {
      resp = { s: 1, xf: 1, yo: 0 };
      camera.position.z = 6;
    }
  };
  layout();
  window.addEventListener('resize', layout);

  /* scroll choreography — pendulum with parked sides, like project 0 */
  const pose = { x: 2.1, y: 0.35, s: 1, op: 1 };
  let marks = null;
  const computeMarks = () => {
    const vh = window.innerHeight;
    const el = (id) => document.getElementById(id);
    const story = el('story');
    const p1 = el('part-1');
    const p2 = el('part-2');
    const p3 = el('part-3');
    const p4 = el('part-4');
    const col = document.querySelector('.colophon');
    if (!story || !p1 || !p2 || !p3 || !p4 || !col) return;
    marks = {
      ways: [
        { at: 0, x: 2.1, y: 0.35, s: 1, op: 1 },
        { at: story.offsetTop - vh * 0.55, x: -2.5, y: 0.45, s: 0.8, op: 0.9 },
        { at: story.offsetTop + vh * 0.5, x: -2.35, y: -0.2, s: 0.62, op: 0.5 },
        { at: p1.offsetTop - vh * 1.15, x: -2.35, y: -0.2, s: 0.62, op: 0.5 },
        { at: p1.offsetTop - vh * 0.72, x: 0, y: -0.55, s: 0.55, op: 0.5 },
        { at: p1.offsetTop - vh * 0.35, x: 2.45, y: 0.2, s: 0.8, op: 0.9 },
        { at: p1.offsetTop + vh * 0.5, x: 2.6, y: -0.25, s: 0.6, op: 0.45 },
        { at: p2.offsetTop - vh * 1.3, x: 2.6, y: -0.25, s: 0.6, op: 0.45 },
        { at: p2.offsetTop - vh * 0.8, x: 0, y: -0.55, s: 0.55, op: 0.5 },
        { at: p2.offsetTop - vh * 0.35, x: -2.5, y: 0.4, s: 0.8, op: 0.9 },
        { at: p2.offsetTop + vh * 0.5, x: -2.6, y: -0.25, s: 0.6, op: 0.45 },
        { at: p3.offsetTop - vh * 1.3, x: -2.6, y: -0.25, s: 0.6, op: 0.45 },
        { at: p3.offsetTop - vh * 0.8, x: 0, y: -0.55, s: 0.55, op: 0.5 },
        { at: p3.offsetTop - vh * 0.35, x: 2.45, y: 0.2, s: 0.8, op: 0.9 },
        { at: p3.offsetTop + vh * 0.5, x: 2.6, y: -0.25, s: 0.6, op: 0.45 },
        { at: p4.offsetTop - vh * 1.3, x: 2.6, y: -0.25, s: 0.6, op: 0.45 },
        { at: p4.offsetTop - vh * 0.8, x: 0, y: -0.55, s: 0.55, op: 0.5 },
        { at: p4.offsetTop - vh * 0.35, x: -2.5, y: 0.35, s: 0.8, op: 0.9 },
        { at: p4.offsetTop + vh * 0.5, x: -2.5, y: -0.25, s: 0.6, op: 0.45 },
        { at: col.offsetTop - vh * 1.3, x: -2.5, y: -0.25, s: 0.6, op: 0.45 },
        { at: col.offsetTop - vh * 0.8, x: 0, y: -0.5, s: 0.6, op: 0.6 },
        { at: col.offsetTop - vh * 0.4, x: 2.05, y: 0.05, s: 0.95, op: 1 },
      ],
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

  /* misregistration breathes: 0 = perfectly stacked, 1 = drifted apart */
  const drift = { v: 1 };

  const clock = new THREE.Clock();
  let rafId = null;
  let markTick = 0;

  const frame = () => {
    const t = clock.getElapsedTime();

    markTick += 1;
    if (!marks || markTick % 30 === 0) computeMarks();

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
    }

    /* plates breathe in and out of register */
    const breathe = reducedMotion ? 0 : (0.5 + 0.5 * Math.sin(t * 0.24));
    const d = drift.v * (0.12 + 0.88 * breathe);
    plates.forEach((p, i) => {
      const ph = p.userData.phase;
      p.position.x = p.userData.home.x + d * 0.16 * Math.sin(t * 0.4 + ph);
      p.position.y = p.userData.home.y + d * 0.2 * Math.cos(t * 0.31 + ph * 1.4);
      p.rotation.z = d * 0.1 * Math.sin(t * 0.22 + ph);
      p.rotation.y = d * 0.12 * Math.sin(t * 0.18 + ph * 0.8);
    });

    rig.rotation.y = -0.42 + mouse.x * 0.16;
    rig.rotation.x = 0.16 - mouse.y * 0.12;
    rig.position.x = pose.x * resp.xf;
    rig.position.y = pose.y + resp.yo + Math.sin(t * 0.5) * 0.06;
    rig.scale.setScalar(pose.s * resp.s * introScale.v);

    plateMats.forEach((m, i) => { m.opacity = baseOpacity[i] * pose.op; });

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  };

  if (reducedMotion) {
    computeMarks();
    rig.position.set(pose.x * resp.xf, pose.y + resp.yo, 0);
    rig.scale.setScalar(pose.s * resp.s);
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

  sceneApi = { camera, plates, drift, rig };
  window.__dbgRig = () => ({ x: rig.position.x, y: rig.position.y, s: rig.scale.x, op: pose.op, marks: !!marks });
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

  if (sceneApi) {
    intro.fromTo(introScale, { v: 0.82 }, { v: 1, duration: 1.8, ease: 'power2.out' }, 1.2);
    intro.fromTo(sceneApi.drift, { v: 2.6 }, { v: 1, duration: 2.4, ease: 'power2.out' }, 1.0);
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

/* ————————————————— plate extras: sliders, ticker, rgb egg ————————————————— */

(() => {
  const anim = !reducedMotion;

  /* — comparison sliders — */
  document.querySelectorAll('.compare').forEach((box) => {
    const set = (clientX) => {
      const r = box.getBoundingClientRect();
      const p = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
      box.style.setProperty('--split', `${p.toFixed(2)}%`);
    };
    box.addEventListener('pointerdown', (e) => {
      box.setPointerCapture(e.pointerId);
      set(e.clientX);
    });
    box.addEventListener('pointermove', (e) => {
      if (e.pressure > 0 || e.buttons > 0) set(e.clientX);
    });
    if (anim) {
      gsap.fromTo(box, { '--split': '8%' }, {
        '--split': '55%',
        duration: 1.8,
        ease: 'power3.inOut',
        scrollTrigger: { trigger: box, start: 'top 75%' },
      });
    } else {
      box.style.setProperty('--split', '55%');
    }
  });

  /* — live offsets ticker in the hero strip — */
  const data = window.OFFSETS || {};
  const names = Object.keys(data);
  const elName = document.getElementById('tick-name');
  const elG = document.getElementById('tick-g');
  const elR = document.getElementById('tick-r');
  const pretty = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const fmt = (pair) => `(${pair[1] >= 0 ? '+' : ''}${pair[1]}, ${pair[0] >= 0 ? '+' : ''}${pair[0]})`;
  if (anim && names.length && elName && elG && elR) {
    let i = 0;
    setInterval(() => {
      i = (i + 1) % names.length;
      const n = names[i];
      const m = data[n].ncc || data[n].euclidean;
      if (!m) return;
      const swap = () => {
        elName.textContent = pretty(n);
        elG.textContent = `G ${fmt(m.g)}`;
        elR.textContent = `R ${fmt(m.r)}`;
      };
      gsap.to([elName, elG, elR], {
        opacity: 0,
        duration: 0.35,
        ease: 'power1.in',
        onComplete: () => {
          swap();
          gsap.to([elName, elG, elR], { opacity: 1, duration: 0.5, ease: 'power1.out' });
        },
      });
    }, 3000);
  }

  /* — type "rgb": the plates scatter and re-register — */
  let busy = false;
  const shuffle = () => {
    if (busy || !anim || !sceneApi) return;
    busy = true;
    const tl = gsap.timeline({ onComplete: () => { busy = false; } });
    tl.to(sceneApi.drift, { v: 5, duration: 0.7, ease: 'power2.out' })
      .to(sceneApi.drift, { v: 1, duration: 1.6, ease: 'power3.inOut' }, '>+0.2');
    sceneApi.plates.forEach((p, i) => {
      tl.to(p.rotation, {
        y: `+=${(i - 1) * 2.4 + 1.2}`,
        duration: 2.4,
        ease: 'power3.inOut',
      }, 0);
    });
  };
  let keyBuffer = '';
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    keyBuffer = (keyBuffer + e.key.toLowerCase()).slice(-3);
    if (keyBuffer === 'rgb') shuffle();
  });
})();

/* ————————————————— zoom lightbox + TeX equations ————————————————— */

(() => {
  const anim = !reducedMotion;

  /* KaTeX display equations (fallback text stays if KaTeX never arrives) */
  const renderTex = () => {
    if (!window.katex) return false;
    document.querySelectorAll('[data-tex]').forEach((el) => {
      try {
        katex.render(el.dataset.tex, el, { throwOnError: false, displayMode: true });
      } catch (e) { /* keep fallback text */ }
    });
    return true;
  };
  if (!renderTex()) window.addEventListener('load', renderTex);

  /* lightbox */
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  const stage = document.getElementById('lb-stage');
  const img = document.getElementById('lb-img');
  const titleEl = document.getElementById('lb-title');
  const offEl = document.getElementById('lb-off');
  const toggle = document.getElementById('lb-toggle');
  const resetBtn = document.getElementById('lb-zoom-reset');

  let view = { s: 1, x: 0, y: 0 };
  let sources = { before: null, after: null, mode: 'after' };
  let opener = null;
  let dragging = null;

  const apply = () => {
    img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    resetBtn.textContent = `${Math.round(view.s * 100)}%`;
  };
  const reset = () => { view = { s: 1, x: 0, y: 0 }; apply(); };

  const zoomAt = (factor, cx, cy) => {
    const ns = Math.min(9, Math.max(0.4, view.s * factor));
    const k = ns / view.s;
    const r = stage.getBoundingClientRect();
    const px = cx - (r.left + r.width / 2);
    const py = cy - (r.top + r.height / 2);
    view.x = px - (px - view.x) * k;
    view.y = py - (py - view.y) * k;
    view.s = ns;
    apply();
  };
  const zoomCenter = (factor) => {
    const r = stage.getBoundingClientRect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  };

  const setMode = (m) => {
    sources.mode = m;
    img.src = m === 'before' && sources.before ? sources.before : sources.after;
    toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.view === m));
  };

  const open = (frame) => {
    const src = frame.querySelector('img');
    if (!src) return;
    opener = frame;
    sources = { before: frame.dataset.before || null, after: src.currentSrc || src.src, mode: 'after' };
    const cap = frame.querySelector('figcaption');
    titleEl.textContent = cap ? (cap.childNodes[0].textContent || '').trim() : '';
    const off = cap && cap.querySelector('.off');
    offEl.textContent = off
      ? off.innerHTML.replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      : '';
    toggle.hidden = !sources.before;
    setMode('after');
    reset();
    lb.hidden = false;
    if (window.ScrollSmoother && ScrollSmoother.get()) ScrollSmoother.get().paused(true);
    if (anim && window.gsap) {
      gsap.fromTo(lb, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' });
    }
  };

  const close = () => {
    const done = () => { lb.hidden = true; img.src = ''; };
    if (anim && window.gsap) {
      gsap.to(lb, {
        opacity: 0, duration: 0.28, ease: 'power1.out',
        onComplete: () => { gsap.set(lb, { opacity: 1 }); done(); },
      });
    } else {
      done();
    }
    if (window.ScrollSmoother && ScrollSmoother.get()) ScrollSmoother.get().paused(false);
    if (opener) { opener.focus(); opener = null; }
  };

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY);
  }, { passive: false });

  stage.addEventListener('pointerdown', (e) => {
    dragging = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: 0, tgt: e.target };
    img.classList.add('dragging');
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.px;
    const dy = e.clientY - dragging.py;
    dragging.moved = Math.max(dragging.moved, Math.abs(dx) + Math.abs(dy));
    view.x = dragging.vx + dx;
    view.y = dragging.vy + dy;
    apply();
  });
  const endDrag = (e) => {
    if (dragging && e.type === 'pointerup' && dragging.moved < 5 && dragging.tgt === stage) close();
    dragging = null;
    img.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dblclick', (e) => zoomAt(view.s < 2 ? 2.4 / view.s : 1 / view.s, e.clientX, e.clientY));

  document.getElementById('lb-zoom-in').addEventListener('click', () => zoomCenter(1.4));
  document.getElementById('lb-zoom-out').addEventListener('click', () => zoomCenter(1 / 1.4));
  resetBtn.addEventListener('click', reset);
  document.getElementById('lb-close').addEventListener('click', close);
  toggle.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.view)));

  window.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === '+' || e.key === '=') zoomCenter(1.4);
    else if (e.key === '-') zoomCenter(1 / 1.4);
  });

  /* every framed image opens the viewer */
  document.querySelectorAll('.frame').forEach((frame) => {
    frame.setAttribute('tabindex', '0');
    frame.setAttribute('role', 'button');
    frame.addEventListener('click', () => open(frame));
    frame.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(frame); }
    });
  });
})();
