/* =====================================================================
 * models.js — PROCEDURAL 3D MODELS & LABELS (effects live in fx.js)
 * ---------------------------------------------------------------------
 * Everything is built from Three.js primitives; no external assets.
 * THREE is read lazily from window.THREE (set by the boot script).
 * All models face +Z.
 * ===================================================================== */
(function (global) {
  'use strict';
  const T = () => global.THREE;

  function mat(color, opts = {}) {
    const THREE = T();
    return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.05 }, opts));
  }
  /** Cheap lit material for static scenery (ART_GUIDE §9.2): Lambert, no specular. Ignores PBR-only options. */
  function matLite(color, opts = {}) {
    const THREE = T();
    const o = Object.assign({}, opts); delete o.roughness; delete o.metalness;
    return new THREE.MeshLambertMaterial(Object.assign({ color }, o));
  }
  let haloTexture = null;
  function haloTex() {
    if (haloTexture) return haloTexture;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    return (haloTexture = new (T().CanvasTexture)(cv));
  }
  let shadowTex = null;
  /** Soft round contact shadow under a character (cheap: one transparent quad). */
  function shadowBlob(r) {
    const THREE = T();
    if (!shadowTex) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
      shadowTex = new THREE.CanvasTexture(cv);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.025; m.renderOrder = 1; m.userData.isShadow = true;
    return m;
  }
  function glowMat(color, intensity = 1.6) { return mat(color, { emissive: color, emissiveIntensity: intensity }); }
  function rot(m, axis, v) { m.rotation[axis] = v; return m; }
  function mesh(geo, material, x = 0, y = 0, z = 0) { const m = new (T().Mesh)(geo, material); m.position.set(x, y, z); return m; }

  const Models = {
    mat, matLite, glowMat, mesh,

    /* ----------------------------- Wizard ---------------------------- */
    wizard(look = {}) {
      const THREE = T();
      const g = new THREE.Group();
      const opt = look.ghost ? { transparent: true, opacity: 0.55, emissive: look.robe || 0xaaccff, emissiveIntensity: 0.4 } : {};
      const robeM = mat(look.robe || 0x3050a0, Object.assign({ roughness: 0.85 }, opt));
      const robeDark = mat(new THREE.Color(look.robe || 0x3050a0).multiplyScalar(0.6).getHex(), Object.assign({ roughness: 0.9 }, opt));
      const hatM = mat(look.hat || 0x203070, Object.assign({ roughness: 0.8 }, opt));
      const trimM = mat(look.trim || 0xd4af37, Object.assign({ metalness: 0.5, roughness: 0.4 }, opt));
      const skinM = mat(look.skin || 0xf0c8a0, Object.assign({ roughness: 0.7 }, opt));
      // robe: smooth flared silhouette (lathe) with a darker inner hem
      const prof = [[0.01, 0], [0.62, 0], [0.6, 0.08], [0.5, 0.45], [0.38, 0.9], [0.3, 1.2], [0.33, 1.38], [0.24, 1.5], [0.01, 1.52]].map(([x, y]) => new THREE.Vector2(x, y));
      const robe = mesh(new THREE.LatheGeometry(prof, 22), robeM, 0, 0, 0); g.add(robe);
      g.add(rot(mesh(new THREE.TorusGeometry(0.6, 0.045, 8, 26), trimM, 0, 0.06, 0), 'x', Math.PI / 2));
      const panel = mesh(new THREE.BoxGeometry(0.22, 1.05, 0.04), robeDark, 0, 0.55, 0.42); panel.rotation.x = -0.18; g.add(panel);   // front panel
      g.add(rot(mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 20), trimM, 0, 1.0, 0), 'x', Math.PI / 2));   // belt
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 0.04), trimM, 0, 1.0, 0.33));                          // buckle
      // shoulder mantle + collar
      g.add(mesh(new THREE.ConeGeometry(0.46, 0.32, 18, 1, true), hatM, 0, 1.38, 0));
      g.add(rot(mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 16), trimM, 0, 1.5, 0), 'x', Math.PI / 2));
      // sleeves with hands; right hand holds the staff
      const armL = new THREE.Group(), armR = new THREE.Group();
      [[armL, -1], [armR, 1]].forEach(([arm, sd]) => {
        arm.position.set(sd * 0.32, 1.38, 0);
        const sleeve = mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.6, 10), robeM, 0, -0.28, 0); arm.add(sleeve);
        arm.add(rot(mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 14), trimM, 0, -0.57, 0), 'x', Math.PI / 2));
        arm.add(mesh(new THREE.SphereGeometry(0.075, 10, 8), skinM, 0, -0.64, 0));
        arm.rotation.z = sd * 0.25; arm.rotation.x = -0.35;
        g.add(arm);
      });
      // head: face with eyes, brows and nose
      const head = new THREE.Group(); head.position.set(0, 1.72, 0); g.add(head);
      const skull = mesh(new THREE.SphereGeometry(0.22, 18, 14), skinM, 0, 0, 0); skull.scale.set(1, 1.08, 1); head.add(skull);
      const white = mat(0xf8f8f0, opt), pupil = mat(0x1a1410, opt), browM = mat(look.beard || 0x4a3020, opt);
      for (const sd of [-1, 1]) {
        head.add(mesh(new THREE.SphereGeometry(0.042, 8, 6), white, sd * 0.075, 0.03, 0.185));
        head.add(mesh(new THREE.SphereGeometry(0.022, 6, 6), pupil, sd * 0.075, 0.03, 0.222));
        head.add(rot(mesh(new THREE.BoxGeometry(0.08, 0.018, 0.02), browM, sd * 0.078, 0.09, 0.2), 'z', sd * -0.15));
      }
      head.add(rot(mesh(new THREE.ConeGeometry(0.03, 0.09, 6), skinM, 0, -0.02, 0.235), 'x', Math.PI / 2));
      head.add(mesh(new THREE.BoxGeometry(0.07, 0.012, 0.01), mat(0x8a4a3a, opt), 0, -0.09, 0.205));
      if (look.beard) {
        const bm = mat(look.beard, opt);
        head.add(rot(mesh(new THREE.ConeGeometry(0.15, 0.5, 12), bm, 0, -0.33, 0.1), 'x', Math.PI));
        head.add(rot(mesh(new THREE.CapsuleGeometry(0.025, 0.12, 4, 8), bm, -0.05, -0.06, 0.21), 'z', 1.2));
        head.add(rot(mesh(new THREE.CapsuleGeometry(0.025, 0.12, 4, 8), bm, 0.05, -0.06, 0.21), 'z', -1.2));
      }
      // hat: wide brim, crooked two-part cone, band with a glowing star
      const hat = new THREE.Group(); hat.position.set(0, 0.17, 0); head.add(hat);
      hat.add(mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.035, 24), hatM, 0, 0, 0));
      const lower = mesh(new THREE.ConeGeometry(0.27, 0.45, 18, 1, true), hatM, 0, 0.22, 0); hat.add(lower);
      const tip = new THREE.Group(); tip.position.set(0, 0.42, 0); tip.rotation.z = -0.45; tip.rotation.x = -0.15; hat.add(tip);
      tip.add(mesh(new THREE.ConeGeometry(0.135, 0.42, 14), hatM, 0, 0.19, 0));
      hat.add(rot(mesh(new THREE.TorusGeometry(0.255, 0.03, 6, 20), trimM, 0, 0.05, 0), 'x', Math.PI / 2));
      hat.add(mesh(new THREE.OctahedronGeometry(0.045), glowMat(look.trim || 0xd4af37, 1.6), 0, 0.06, 0.27));
      // staff: gnarled shaft, crook and a glowing crystal
      const staff = new THREE.Group();
      const wood = mat(0x5a3a1e, Object.assign({ roughness: 0.9 }, opt));
      staff.add(mesh(new THREE.CylinderGeometry(0.03, 0.045, 1.9, 7), wood, 0, 0.95, 0));
      staff.add(rot(mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 10, Math.PI * 1.2), wood, 0.06, 1.95, 0), 'z', 0.4));
      const orb = mesh(new THREE.OctahedronGeometry(0.09), glowMat(look.staffGlow || look.trim || 0x9fe8ff, 2.2), 0, 2.02, 0);
      staff.add(orb);
      staff.position.set(0.42, 0, 0.18);
      g.add(staff);
      const shadow = shadowBlob(0.7); g.add(shadow);
      g.userData = { staff, orb, head, baseY: look.ghost ? 0.3 : 0, lift: 0 };
      g.position.y = g.userData.baseY;
      g.userData.anim = (t, moving) => {
        const bob = moving ? Math.abs(Math.sin(t * 9)) * 0.08 : 0;
        g.position.y = g.userData.baseY + g.userData.lift + bob + (look.ghost ? Math.sin(t * 1.5) * 0.15 : 0);
        shadow.position.y = 0.025 - g.position.y;
        robe.scale.set(1 + Math.sin(t * 1.6) * 0.012, 1, 1 + Math.sin(t * 1.6) * 0.012);     // breathing
        head.rotation.y = Math.sin(t * 0.5) * 0.25; head.rotation.z = Math.sin(t * 0.7) * 0.04;
        armL.rotation.x = -0.35 + (moving ? Math.sin(t * 9) * 0.4 : Math.sin(t * 1.2) * 0.05);
        armR.rotation.x = -0.35 + (moving ? -Math.sin(t * 9) * 0.2 : 0);
        staff.rotation.x = moving ? Math.sin(t * 9) * 0.12 : 0;
        orb.rotation.y = t * 1.5; orb.material.emissiveIntensity = 1.8 + Math.sin(t * 3) * 0.5;
      };
      return g;
    },

    /* ----------------------------- Enemies --------------------------- */
    enemy(look) {
      if (look.shape === 'dragon') return Models.dragon(look);
      const THREE = T();
      const g = new THREE.Group();
      const body = mat(look.color), glow = glowMat(look.glow, 2.2);
      const eyes = (y, z, spread = 0.1, r = 0.05) => {
        g.add(mesh(new THREE.SphereGeometry(r, 8, 6), glow, -spread, y, z));
        g.add(mesh(new THREE.SphereGeometry(r, 8, 6), glow, spread, y, z));
      };
      let anim = () => {};
      switch (look.shape) {
        case 'sprite': {
          const core = mesh(new THREE.IcosahedronGeometry(0.38, 0), mat(look.color, { emissive: look.glow, emissiveIntensity: 0.8, flatShading: true }), 0, 1.2, 0);
          g.add(core); eyes(1.25, 0.3, 0.12, 0.06);
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: look.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
          halo.scale.setScalar(1.6); halo.position.y = 1.2; g.add(halo);
          const motes = [];
          for (let i = 0; i < 4; i++) { const m = mesh(new THREE.SphereGeometry(0.07, 6, 6), glow); g.add(m); motes.push(m); }
          anim = t => { core.rotation.y = t * 1.5; core.position.y = 1.2 + Math.sin(t * 3) * 0.15; halo.position.y = core.position.y; halo.material.opacity = 0.45 + Math.sin(t * 5) * 0.15;
            motes.forEach((m, i) => { const a = t * 2 + i * Math.PI / 2; m.position.set(Math.cos(a) * 0.65, 1.2 + Math.sin(a * 1.5) * 0.25, Math.sin(a) * 0.65); }); };
          break;
        }
        case 'dummy': {          // training dummy: post, straw sack, painted target
          const wood = mat(0x6a4628), straw = mat(look.color, { roughness: 0.95 });
          g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.9, 8), wood, 0, 0.95, 0));
          g.add(mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.06, 16), wood, 0, 0.03, 0));
          const sway = new THREE.Group(); g.add(sway);
          const sack = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.9, 12), straw, 0, 1.25, 0); sway.add(sack);
          sway.add(mesh(new THREE.SphereGeometry(0.24, 12, 10), straw, 0, 1.92, 0));
          const arms = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), wood, 0, 1.5, 0); arms.rotation.z = Math.PI / 2; sway.add(arms);
          const red = mat(0xc8302a, { emissive: look.glow, emissiveIntensity: 0.25 }), white = mat(0xf0e8d8);
          [[0.22, red], [0.15, white], [0.08, red]].forEach(([r, m], i) => sway.add(mesh(new THREE.CircleGeometry(r, 20), m, 0, 1.3, 0.35 + i * 0.002)));
          eyes(1.97, 0.21, 0.08, 0.035);
          anim = t => { sway.rotation.z = Math.sin(t * 1.3) * 0.04; };
          break;
        }
        case 'beast': {
          const b = mesh(new THREE.SphereGeometry(0.5, 14, 10), body, 0, 0.4, 0); b.scale.set(0.8, 0.65, 1.3); g.add(b);
          g.add(mesh(new THREE.SphereGeometry(0.27, 12, 10), body, 0, 0.5, 0.65));
          g.add(mesh(new THREE.ConeGeometry(0.1, 0.18, 6), body, -0.14, 0.75, 0.6));
          g.add(mesh(new THREE.ConeGeometry(0.1, 0.18, 6), body, 0.14, 0.75, 0.6));
          g.add(mesh(new THREE.SphereGeometry(0.05, 6, 6), mat(0xffa0a0), 0, 0.45, 0.92));
          const pink = mat(0xe89aa0);
          g.add(mesh(new THREE.CircleGeometry(0.07, 10), pink, -0.14, 0.76, 0.66), mesh(new THREE.CircleGeometry(0.07, 10), pink, 0.14, 0.76, 0.66));
          const whisk = new THREE.LineBasicMaterial({ color: 0xdddddd });
          for (const sd of [-1, 1]) for (const dy of [-0.02, 0.02]) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sd * 0.05, 0.45 + dy, 0.88), new THREE.Vector3(sd * 0.32, 0.47 + dy * 3, 0.8)]), whisk));
          for (const sd of [-1, 1]) for (const z of [0.35, -0.35]) g.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), body, sd * 0.25, 0.08, z));
          eyes(0.58, 0.86, 0.1, 0.045);
          const tail = mesh(new THREE.CylinderGeometry(0.03, 0.05, 1, 6), mat(0xc09080), 0, 0.35, -0.95); tail.rotation.x = Math.PI / 2.4; g.add(tail);
          anim = (t, m) => { tail.rotation.z = Math.sin(t * 6) * 0.4; b.scale.y = 0.65 + (m ? Math.abs(Math.sin(t * 12)) * 0.05 : 0); };
          break;
        }
        case 'imp': {
          const b = mesh(new THREE.SphereGeometry(0.42, 14, 10), body, 0, 0.6, 0); g.add(b);
          const h = mesh(new THREE.SphereGeometry(0.32, 14, 10), body, 0, 1.15, 0.05); g.add(h);
          g.add(rot(mesh(new THREE.ConeGeometry(0.08, 0.35, 6), body, -0.3, 1.35, 0), 'z', 0.9));
          const e2 = mesh(new THREE.ConeGeometry(0.08, 0.35, 6), body, 0.3, 1.35, 0); e2.rotation.z = -0.9; g.add(e2);
          eyes(1.2, 0.3, 0.11, 0.06);
          g.add(rot(mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 10, Math.PI), mat(0x200000), 0, 1.03, 0.29), 'z', Math.PI));
          const wingM = mat(new THREE.Color(look.color).multiplyScalar(0.6).getHex(), { side: THREE.DoubleSide });
          const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0); wingShape.lineTo(0.55, 0.25); wingShape.lineTo(0.45, -0.05); wingShape.lineTo(0.5, -0.3); wingShape.lineTo(0, -0.15);
          const wL = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), wingM), wR = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), wingM);
          wL.position.set(-0.2, 0.8, -0.3); wL.scale.x = -1; wR.position.set(0.2, 0.8, -0.3); g.add(wL, wR);
          const teeth = mat(0xffffff); g.add(mesh(new THREE.ConeGeometry(0.02, 0.06, 4), teeth, -0.05, 1.0, 0.31), mesh(new THREE.ConeGeometry(0.02, 0.06, 4), teeth, 0.05, 1.0, 0.31));
          const flap = t => { wL.rotation.y = 0.4 + Math.sin(t * 14) * 0.5; wR.rotation.y = -0.4 - Math.sin(t * 14) * 0.5; };
          anim = t => { flap(t); b.position.y = 0.6 + Math.sin(t * 8) * 0.04; h.position.y = 1.15 + Math.sin(t * 8 + 1) * 0.04; h.rotation.z = Math.sin(t * 2) * 0.15; };
          break;
        }
        case 'spider': {
          g.add(mesh(new THREE.SphereGeometry(0.35, 14, 10), body, 0, 0.55, 0.3));
          const ab = mesh(new THREE.SphereGeometry(0.55, 14, 10), body, 0, 0.7, -0.45); g.add(ab);
          g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), glow, 0, 0.95, -0.6));
          eyes(0.65, 0.6, 0.12, 0.05); eyes(0.72, 0.57, 0.06, 0.035);
          const legs = [];
          for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 4; i++) {
            const leg = new THREE.Group();
            const upper = mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.8, 5), body, 0, 0, 0.4); upper.rotation.x = Math.PI / 2;
            leg.add(upper);
            leg.position.set(s * 0.25, 0.55, 0.3 - i * 0.2);
            leg.rotation.y = s > 0 ? (Math.PI / 2 - 0.6 + i * 0.4) : -(Math.PI / 2 - 0.6 + i * 0.4);
            leg.rotation.x = 0.5;
            g.add(leg); legs.push(leg);
          }
          anim = (t, m) => { legs.forEach((l, i) => { l.rotation.x = 0.5 + Math.sin(t * (m ? 14 : 2) + i) * 0.15; }); ab.scale.setScalar(1 + Math.sin(t * 3) * 0.03); };
          break;
        }
        case 'armor': case 'warden': {
          const metal = mat(look.color, { metalness: 0.7, roughness: 0.35 });
          const isW = look.shape === 'warden';
          g.add(mesh(new THREE.BoxGeometry(0.8, 0.9, 0.45), metal, 0, 1.35, 0));
          g.add(mesh(new THREE.BoxGeometry(0.6, 0.35, 0.4), metal, 0, 0.8, 0));
          const head = isW ? mesh(new THREE.SphereGeometry(0.3, 12, 10), mat(0xd8d0c0), 0, 2.05, 0)
                           : mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.5, 10), metal, 0, 2.05, 0);
          g.add(head);
          g.add(mesh(new THREE.BoxGeometry(isW ? 0.36 : 0.32, 0.07, 0.05), glow, 0, 2.08, isW ? 0.26 : 0.27));
          if (isW) {
            g.add(mesh(new THREE.SphereGeometry(0.18, 10, 8), glowMat(look.glow, 3), 0, 1.4, 0.24));
            for (let i = 0; i < 2; i++) g.add(mesh(new THREE.ConeGeometry(0.07, 0.4, 6), mat(0xd8d0c0), i ? 0.2 : -0.2, 2.35, 0));
          }
          const armL = mesh(new THREE.BoxGeometry(0.22, 0.85, 0.22), metal, -0.55, 1.3, 0); g.add(armL);
          for (const sd of [-1, 1]) { const p2 = mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal, sd * 0.52, 1.72, 0); p2.scale.set(1, 0.7, 1); g.add(p2); }
          g.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.48), mat(0x6a3a22), 0, 0.95, 0));                         // belt
          if (!isW) { const plume = mesh(new THREE.ConeGeometry(0.08, 0.5, 8), mat(0xb02a2a), 0, 2.45, -0.05); plume.rotation.x = -0.5; g.add(plume); }
          const shieldM = mat(new THREE.Color(look.color).multiplyScalar(0.8).getHex(), { metalness: 0.6, roughness: 0.4 });
          const shieldG = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 16), shieldM, -0.7, 1.25, 0.18); shieldG.rotation.z = Math.PI / 2; shieldG.rotation.y = 0.3; g.add(shieldG);
          g.add(rot(mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), glow, -0.73, 1.25, 0.18), 'y', Math.PI / 2 + 0.3));
          const armR = new THREE.Group(); armR.position.set(0.55, 1.7, 0);
          armR.add(mesh(new THREE.BoxGeometry(0.22, 0.85, 0.22), metal, 0, -0.4, 0));
          armR.add(rot(mesh(new THREE.BoxGeometry(0.08, 1.3, 0.04), mat(0xcfd6dd, { metalness: 0.9, roughness: 0.2 }), 0, -0.3, 0.5), 'x', Math.PI / 2));
          g.add(armR);
          g.add(mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), metal, -0.18, 0.38, 0));
          g.add(mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), metal, 0.18, 0.38, 0));
          anim = (t, m) => { armR.rotation.x = Math.sin(t * (m ? 6 : 1.5)) * 0.3; head.rotation.y = Math.sin(t * 0.8) * 0.3; };
          break;
        }
        case 'wraith': {
          const cloak = mesh(new THREE.ConeGeometry(0.6, 1.9, 12, 1, true), mat(look.color, { transparent: true, opacity: 0.6, side: 2, emissive: look.glow, emissiveIntensity: 0.25 }), 0, 1.2, 0);
          g.add(cloak);
          g.add(mesh(new THREE.SphereGeometry(0.32, 12, 10), mat(0x101018, { transparent: true, opacity: 0.85 }), 0, 2.1, 0));
          eyes(2.12, 0.26, 0.1, 0.05);
          const hood = mesh(new THREE.ConeGeometry(0.42, 0.7, 12, 1, true), mat(look.color, { transparent: true, opacity: 0.7, side: 2 }), 0, 2.35, -0.02); g.add(hood);
          const hands = [-1, 1].map(sd => { const h = mesh(new THREE.ConeGeometry(0.06, 0.35, 5), mat(0xd8e0f0, { transparent: true, opacity: 0.8, emissive: look.glow, emissiveIntensity: 0.3 }), sd * 0.5, 1.5, 0.25); h.rotation.x = Math.PI / 2 + 0.4; g.add(h); return h; });
          const tatters = [];
          for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const tt = mesh(new THREE.ConeGeometry(0.1, 0.4, 4), mat(look.color, { transparent: true, opacity: 0.5 }), Math.cos(a) * 0.5, 0.15, Math.sin(a) * 0.5); tt.rotation.x = Math.PI; g.add(tt); tatters.push(tt); }
          anim = t => { g.position.y = 0.3 + Math.sin(t * 2) * 0.15; cloak.rotation.y = t * 0.5;
            hands.forEach((h, i) => { h.position.y = 1.5 + Math.sin(t * 2.5 + i) * 0.08; }); tatters.forEach((tt, i) => { tt.scale.y = 1 + Math.sin(t * 4 + i) * 0.25; }); };
          break;
        }
        case 'lizard': {
          const b = mesh(new THREE.CapsuleGeometry(0.35, 1.1, 6, 12), body, 0, 0.45, 0); b.rotation.x = Math.PI / 2; g.add(b);
          g.add(mesh(new THREE.SphereGeometry(0.3, 12, 10), body, 0, 0.55, 0.85));
          eyes(0.68, 1.05, 0.14, 0.05);
          const tail = mesh(new THREE.ConeGeometry(0.25, 1.2, 8), body, 0, 0.4, -1.3); tail.rotation.x = -Math.PI / 2; g.add(tail);
          for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.08, 6, 6), glow, (i % 2 ? 0.15 : -0.15), 0.78, 0.5 - i * 0.3));
          for (let s = -1; s <= 1; s += 2) for (let z of [0.4, -0.4]) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 6), body, s * 0.38, 0.2, z));
          anim = t => { tail.rotation.y = Math.sin(t * 4) * 0.4; };
          break;
        }
        case 'gargoyle': {
          const stone = mat(look.color, { flatShading: true });
          g.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 0.6), stone, 0, 1.0, 0));
          g.add(mesh(new THREE.BoxGeometry(0.55, 0.5, 0.5), stone, 0, 1.7, 0.1));
          eyes(1.75, 0.36, 0.13, 0.06);
          g.add(mesh(new THREE.ConeGeometry(0.07, 0.35, 5), stone, -0.2, 2.05, 0.05));
          g.add(mesh(new THREE.ConeGeometry(0.07, 0.35, 5), stone, 0.2, 2.05, 0.05));
          const wingL = mesh(new THREE.BoxGeometry(1.1, 0.7, 0.06), stone, -0.8, 1.4, -0.3);
          const wingR = mesh(new THREE.BoxGeometry(1.1, 0.7, 0.06), stone, 0.8, 1.4, -0.3);
          g.add(wingL, wingR);
          g.add(mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), stone, -0.25, 0.3, 0));
          g.add(mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), stone, 0.25, 0.3, 0));
          anim = t => { wingL.rotation.y = 0.3 + Math.sin(t * 2) * 0.2; wingR.rotation.y = -0.3 - Math.sin(t * 2) * 0.2; };
          break;
        }
        default:
          g.add(mesh(new THREE.BoxGeometry(1, 1, 1), body, 0, 0.5, 0));
      }
      g.scale.setScalar(look.scale || 1);
      const shadow = shadowBlob(look.shape === 'spider' || look.shape === 'lizard' ? 0.9 : look.shape === 'gargoyle' || look.shape === 'armor' || look.shape === 'warden' ? 0.75 : 0.6);
      g.add(shadow);
      g.userData.anim = (t, moving) => {
        anim(t, moving);
        shadow.position.y = 0.025 - g.position.y / (look.scale || 1);          // stays on the ground when the body floats
      };
      return g;
    },

    /* ------------------------------ Dragons -------------------------- */
    /**
     * Shared procedural dragon rig (docs/ART_GUIDE.md §3.4.1): tapering spine, neck,
     * head with a glowing throat (breath tell), membrane wings, 0/2/4 legs.
     * userData: throat (mesh), wings [L, R], head, anim(t, moving, flap)
     */
    dragon(look) {
      const THREE = T();
      const g = new THREE.Group();
      const body = mat(look.body, { flatShading: true }), belly = mat(look.belly, { flatShading: true });
      const glow = glowMat(look.glow, 2.4);
      const spine = [];
      for (let i = 0; i < 10; i++) {
        const r = 0.9 - i * 0.07;
        const seg = mesh(new THREE.SphereGeometry(r, 10, 8), i < 3 ? belly : body, 0, 1.1 - i * 0.05, -i * 0.62);
        seg.scale.set(1, 0.85, 1.1); g.add(seg); spine.push(seg);
      }
      const tailBlade = mesh(new THREE.ConeGeometry(0.35, 0.9, 4), body, 0, 0.7, -6.6); tailBlade.rotation.x = -Math.PI / 2; g.add(tailBlade);
      // neck + head
      const neck = [];
      for (let i = 0; i < 3; i++) { const n = mesh(new THREE.SphereGeometry(0.45 - i * 0.05, 10, 8), body, 0, 1.5 + i * 0.35, 0.6 + i * 0.4); g.add(n); neck.push(n); }
      const head = new THREE.Group(); head.position.set(0, 2.5, 1.9); g.add(head);
      head.add(mesh(new THREE.BoxGeometry(0.75, 0.55, 1.3), body, 0, 0, 0.3));
      head.add(mesh(new THREE.BoxGeometry(0.6, 0.18, 1.0), belly, 0, -0.32, 0.35));   // jaw
      [-1, 1].forEach(sx => {
        head.add(rot(mesh(new THREE.ConeGeometry(0.1, 0.7, 5), belly, sx * 0.25, 0.4, -0.3), 'x', -0.9));
        head.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), glow, sx * 0.26, 0.12, 0.7));
      });
      if (look.crown) for (let i = 0; i < 5; i++) head.add(rot(mesh(new THREE.ConeGeometry(0.08, 0.6, 5), belly, -0.3 + i * 0.15, 0.55, -0.1), 'x', -0.5));
      // throat glow (ramps up before breath attacks)
      const throat = mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(look.glow, { emissive: look.glow, emissiveIntensity: 0, transparent: true, opacity: 0.9 }), 0, 1.95, 1.25);
      g.add(throat);
      // wings
      const wingGeo = new THREE.BufferGeometry();
      const v = [0, 0, 0, 3.4, 0.7, -0.3, 2.8, 0.2, -1.5,   0, 0, 0, 2.8, 0.2, -1.5, 1.8, 0, -2.3,   0, 0, 0, 1.8, 0, -2.3, 0.5, 0, -1.6];
      wingGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      wingGeo.computeVertexNormals();
      const memb = mat(look.membrane, { side: THREE.DoubleSide, transparent: look.shape === 'dragon' && look.legs === 2, opacity: 0.85 });
      const wings = [-1, 1].map(sx => {
        const w = new THREE.Group(); w.position.set(sx * 0.5, 1.7, -0.4);
        const m = new THREE.Mesh(wingGeo, memb); m.scale.x = sx; w.add(m);
        w.add(rot(mesh(new THREE.CylinderGeometry(0.06, 0.04, 3.4, 5), body, sx * 1.7, 0.35, -0.15), 'z', sx * -1.35));
        g.add(w); return w;
      });
      if (look.legs === 0) wings.forEach(w => w.scale.setScalar(0.55));   // storm wyrm: fin-wings
      // legs
      const legPos = look.legs === 4 ? [[0.6, 0.5], [0.6, -1.9]] : look.legs === 2 ? [[0.6, -1.0]] : [];
      legPos.forEach(([x, z]) => [-1, 1].forEach(sx => {
        g.add(mesh(new THREE.CylinderGeometry(0.18, 0.14, 1.0, 6), body, sx * x, 0.5, z));
        g.add(rot(mesh(new THREE.ConeGeometry(0.12, 0.3, 4), belly, sx * x, 0.05, z + 0.2), 'x', Math.PI / 2));
      }));
      g.scale.setScalar(look.scale || 1);
      g.userData = { throat, wings, head, spine, flapSpeed: 1.5,
        anim: (t, moving) => {
          const f = g.userData.flapSpeed;
          wings[0].rotation.z = -0.25 - Math.sin(t * f * 2) * 0.5; wings[1].rotation.z = 0.25 + Math.sin(t * f * 2) * 0.5;
          for (let i = 3; i < spine.length; i++) spine[i].position.x = Math.sin(t * 2 + i * 0.6) * 0.04 * i;
          tailBlade.position.x = spine[spine.length - 1].position.x;
          head.position.y = 2.5 + Math.sin(t * 1.5) * 0.08;
        } };
      return g;
    },

    /** World-space nameplate: name + HP bar + status icons. set(name, hpFrac, icons, color) */
    nameplate(name, color = '#ffb0b0') {
      const THREE = T();
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sprite.scale.set(2.4, 0.6, 1); sprite.renderOrder = 10;
      let last = '';
      sprite.userData.set = (n, frac, icons = '', col = color) => {
        const key = n + '|' + Math.round(frac * 100) + '|' + icons + '|' + col;
        if (key === last) return;           // redraw only when something changed
        last = key;
        const c = canvas.getContext('2d');
        c.clearRect(0, 0, 512, 128);
        c.font = 'bold 32px Georgia'; c.textAlign = 'center'; c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.fillStyle = col;
        c.strokeText(n, 256, 40); c.fillText(n, 256, 40);
        c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(96, 58, 320, 22);
        c.fillStyle = frac > 0.5 ? '#e8414a' : frac > 0.25 ? '#ff8a3a' : '#ffd84a'; c.fillRect(99, 61, 314 * Math.max(0, Math.min(1, frac)), 16);
        if (icons) { c.font = '26px sans-serif'; c.lineWidth = 5; c.strokeText(icons, 256, 116); c.fillStyle = '#ffe9a0'; c.fillText(icons, 256, 116); }
        tex.needsUpdate = true;
      };
      sprite.userData.set(name, 1);
      return sprite;
    },

    /* ------------------------------ Labels --------------------------- */
    /** Billboard text sprite. Call label.userData.setText(text, marker) to update. */
    label(text, color = '#ffffff') {
      const THREE = T();
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sprite.scale.set(3.2, 1, 1);
      sprite.renderOrder = 10;
      sprite.userData.setText = (t, marker = '') => {
        const c = canvas.getContext('2d');
        c.clearRect(0, 0, 512, 160);
        if (marker) {
          c.font = 'bold 80px Georgia'; c.textAlign = 'center';
          c.fillStyle = marker === '?' ? '#7dff7d' : '#ffd84a';
          c.strokeStyle = '#000'; c.lineWidth = 8;
          c.strokeText(marker, 256, 72); c.fillText(marker, 256, 72);
        }
        c.font = 'bold 34px Georgia'; c.textAlign = 'center';
        c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.fillStyle = color;
        c.strokeText(t, 256, 138); c.fillText(t, 256, 138);
        tex.needsUpdate = true;
      };
      sprite.userData.setText(text);
      return sprite;
    },
  };

  global.Models = Models;
})(window);
