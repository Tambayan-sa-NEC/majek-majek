/* =====================================================================
 * world.js — RENDERER, CASTLE AREAS, DOORS & THE MAIN LOOP
 * ---------------------------------------------------------------------
 * First-person, real-time edition. The camera belongs to player.js;
 * fights happen right here in the world (combat.js), no separate arena.
 * Main loop:  Player.update → Combat.update (with hit-stop time scale)
 *             → world animations → FX → render world, then the wand
 *             viewmodel on top.
 * Performance rules (docs/ART_GUIDE.md §9.6):
 *   - each area's meshes live in one group, fully disposed on travel
 *   - fixed light count: hemisphere, sun, 3 torch slots, Wandlight, FX pool
 *   - repeated props are InstancedMeshes; no allocation in per-frame code
 * Requires: THREE, data.js, state.js, quests.js, models.js, fx.js, drawing.js
 * ===================================================================== */
(function (global) {
  'use strict';
  const { AREAS, NPCS, ITEMS, SECRETS, SPELLS, QUESTS, SHRINES } = global.GameData;
  const S = global.GameState, Q = global.Quests, M = global.Models, FX = global.FX;
  let THREE;

  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
  const MOBILE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const ENV_LIGHTS = MOBILE ? 2 : 3;
  const spellById = id => SPELLS.find(s => s.id === id);

  /** Free GPU memory of everything under obj. */
  function disposeTree(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }

  /* Door dimensions per type: opening width, height. */
  const DOOR_TYPES = { oak: { w: 1.4, h: 2.6 }, cell: { w: 1.4, h: 2.6 }, portcullis: { w: 3.0, h: 3.4 } };
  const STATE_COLORS = { closed: 0xe8b860, locked: 0xffc23d, boss: 0x7a5cff };

  const World = {
    renderer: null, clock: null, scene: null, camera: null,
    area: null, areaId: null, areaGroup: null,
    colliders: [], interactables: [], gates: [], npcMeshes: {}, animated: [], hiddenThings: [],
    paused: true, current: null, onInteractPrompt: null, onAreaChange: null, onTalk: null, onSecret: null,

    init(canvas) {
      THREE = global.THREE;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(MOBILE ? 1.5 : 2, global.devicePixelRatio || 1));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.autoClear = false;              // world, then the wand viewmodel on top
      this.clock = new THREE.Clock();
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 90);
      this.camera.rotation.order = 'YXZ';
      // permanent lights (values change per area, the count never does)
      this.hemi = new THREE.HemisphereLight(0xffffff, 0x302828, 1.5); this.scene.add(this.hemi);
      this.sun = new THREE.DirectionalLight(0xffffff, 1); this.sun.position.set(10, 20, 8); this.scene.add(this.sun);
      this.envLights = [];
      for (let i = 0; i < ENV_LIGHTS; i++) { const L = new THREE.PointLight(0xffffff, 0, 10, 1.5); L.userData.used = false; this.scene.add(L); this.envLights.push(L); }
      this.wandLight = new THREE.PointLight(0xfff1d6, 0, 26, 1.1); this.scene.add(this.wandLight);   // Wandlight slot (§7.3)
      this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._dummy = new THREE.Object3D();
      FX.setScene(this.scene);
      global.addEventListener('resize', () => this.resize());
      this.resize();
      // adaptive resolution: weak GPUs drop the pixel ratio so spell spam stays smooth
      const maxPR = this.renderer.getPixelRatio(), perf = { acc: 0, n: 0, pr: maxPR };
      let loopErrors = 0;
      const loop = () => {
        requestAnimationFrame(loop);              // schedule first: one bad frame must never freeze the game
        try { frame(); } catch (err) { if (loopErrors++ < 5) console.error(err); }
      };
      const frame = () => {
        const raw = this.clock.getDelta(), dt = Math.min(0.05, raw);
        perf.acc += raw; perf.n++;
        if (perf.acc >= 1.5 && perf.n >= 10) {
          const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
          const next = avg > 0.026 ? Math.max(0.6, perf.pr - 0.15) : avg < 0.018 ? Math.min(maxPR, perf.pr + 0.05) : perf.pr;
          if (Math.abs(next - perf.pr) > 0.01) { perf.pr = next; this.renderer.setPixelRatio(next); this.resize(); }
        }
        const t = this.clock.elapsedTime;
        const ts = global.Combat ? global.Combat.timeScale() : 1;
        if (global.Player) global.Player.update(dt, t);
        if (!this.paused && global.Combat) global.Combat.update(dt * ts, t);
        this.updateWorld(dt, t);
        FX.update(dt * ts, this.camera, this.renderer.domElement.height);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        if (global.Player && global.Player.vmScene) { this.renderer.clearDepth(); this.renderer.render(global.Player.vmScene, global.Player.vmCamera); }
      };
      requestAnimationFrame(loop);
    },

    resize() {
      const w = global.innerWidth, h = global.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      if (global.Player && global.Player.vmCamera) { global.Player.vmCamera.aspect = w / h; global.Player.vmCamera.updateProjectionMatrix(); }
    },

    /* --------------------------- Area loading ------------------------ */
    /** Load an area by id (or a ready-made area definition with an `id`, used for battle arenas). */
    loadArea(id, spawn, yaw) {
      const def = typeof id === 'object' ? id : AREAS[id];
      if (!def) { console.error('Unknown area', id); return; }
      if (typeof id === 'object') id = def.id;
      if (global.Combat) global.Combat.clearArea();
      this.disposeArea();
      this.areaGroup = new THREE.Group(); this.areaGroup.name = 'Area';
      this.scene.add(this.areaGroup);
      this.envLights.forEach(L => { L.intensity = 0; L.userData.used = false; L.position.set(0, -100, 0); });
      this._inst = { trees: [], pillars: {} };
      this.colliders = []; this.interactables = []; this.gates = []; this.npcMeshes = {}; this.animated = []; this.hiddenThings = [];
      this.pickupIds = new Set();
      FX.setScene(this.scene);
      this.area = def; this.areaId = id;
      if (S.player && !def.arena) S.player.area = id;

      const [W, D] = def.size;
      this.scene.background = new THREE.Color(def.sky || def.fog[0]);
      this.scene.fog = new THREE.Fog(def.fog[0], def.fog[1], def.fog[2]);
      this.baseFog = { color: def.fog[0], far: def.fog[2] };
      this.hemi.color.setHex(def.ambient); this.hemi.groundColor.setHex(0x302828);
      // dark areas are tuned around Wandlight (§7.4): enemies' eyes stay visible without it
      this.baseHemi = def.dark ? (id === 'dungeon' ? 1.0 : 1.2) : (def.outdoor ? 1.4 : 1.9);
      this.hemi.intensity = this.baseHemi;
      this.sun.color.setHex(def.outdoor ? 0xfff0d0 : 0xffd8a0); this.sun.intensity = def.outdoor ? 1.2 : 0.45;

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, D + 40), M.matLite(def.floor));
      floor.rotation.x = -Math.PI / 2; this.areaGroup.add(floor);
      if (id === 'forest') this.buildTreeWall(def); else this.buildWalls(def, def.wallHeight || 7);
      if (def.ceiling) {
        const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.matLite(0x2a2630));
        ceil.rotation.x = Math.PI / 2; ceil.position.y = def.ceiling; this.areaGroup.add(ceil);
      }
      def.doors.forEach(d => this.addPassage(d));
      (def.gates || []).forEach(g => this.addGate(g));
      const builder = this.props[def.props];
      if (builder) builder.call(this, def);
      this.flushInstances();

      if (def.rest) this.interactables.push({ pos: new THREE.Vector3(def.rest[0], 0, def.rest[1]), radius: 3, label: 'Rest by the hearth', kind: 'rest',
        action: () => { S.restoreFull(); if (global.Combat) global.Combat.syncPlayerFromSave(); S.save(); S.Events.emit('toast', { text: 'You feel rested. HP & Mana restored. Game saved.', kind: 'info' }); } });
      if (!def.arena) Object.entries(NPCS).filter(([, n]) => n.area === id).forEach(([nid, n]) => this.addNpc(nid, n));
      this.refreshPickups();
      (def.chests || []).forEach(c => this.addChest(c));
      def.secrets.forEach(s => this.addSecret(s));
      if (!def.arena) Object.entries(SHRINES).filter(([, sh]) => sh.area === id).forEach(([sid, sh]) => this.addShrine(sid, sh));
      this.beacon = null; this.guide = null;

      const sp = spawn || def.spawn;
      let face = yaw;
      if (face === undefined) {
        face = Math.hypot(sp[0], sp[1]) > 1 ? Math.atan2(-sp[0], -sp[1]) : Math.PI;
        if (W / D > 3) face = sp[0] > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      if (global.Player) global.Player.place(sp[0], sp[1], face + Math.PI);
      if (global.Combat && !def.arena) global.Combat.spawnAreaEnemies(def);
      if (this.onAreaChange) this.onAreaChange(def);
      if (S.player && !def.arena) S.save();
    },

    /** Free one object (and its children) that combat removed from the area. */
    disposeObject(o) { if (!o) return; if (o.parent) o.parent.remove(o); disposeTree(o); },

    disposeArea() {
      if (!this.areaGroup) return;
      this.scene.remove(this.areaGroup);
      disposeTree(this.areaGroup);
      this.areaGroup = null;
    },

    /**
     * Build a battle arena that looks like the area `srcId` (same floor, walls, fog, darkness).
     * size: arena width in metres (dragons get a bigger one). canFlee: adds a flee portal behind you.
     */
    loadArena(srcId, size, canFlee) {
      const src = AREAS[srcId];
      const def = Object.assign({}, AREAS.battle_arena, {
        id: 'battle_arena', name: `${src.name} · Battle`, theme: srcId, size: [size, size], canFlee,
        floor: src.floor, wall: src.wall, ambient: src.ambient, sky: src.sky || src.fog[0],
        fog: [src.fog[0], Math.max(18, src.fog[1]), Math.max(size * 2, src.fog[2])],
        outdoor: !!src.outdoor, dark: !!src.dark, wallHeight: src.outdoor ? 4 : 7,
      });
      this.loadArea(def, [0, size / 2 - 4]);
      return def;
    },

    travel(areaId, spawn) {
      if (global.Combat && global.Combat.defeated) {
        global.Combat.defeated.clear();                                              // new visit: enemies are back
        global.Combat.graceUntil = Math.max(global.Combat.graceUntil, performance.now() + 1500);   // a moment to look around after a door
      }
      if (S.player) S.player.pos = spawn;
      this.loadArea(areaId, spawn);
    },

    /* ------------------------- Light slots --------------------------- */
    requestLight(color, intensity, distance, decay, x, y, z) {
      const L = this.envLights.find(l => !l.userData.used);
      if (!L) return null;
      L.userData.used = true; L.color.setHex(color); L.intensity = intensity; L.distance = distance; L.decay = decay;
      L.position.set(x, y, z);
      return L;
    },
    releaseLight(L) { if (L) { L.intensity = 0; L.userData.used = false; L.position.set(0, -100, 0); } },

    /* --------------------------- Instancing -------------------------- */
    instanced(geo, mat, items) {
      if (!items.length) { geo.dispose(); mat.dispose(); return null; }
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      const d = this._dummy;
      items.forEach((it, i) => {
        d.position.set(it.x, it.y || 0, it.z); d.rotation.set(0, it.ry || 0, 0);
        d.scale.set(it.sx || it.s || 1, it.sy || it.s || 1, it.sz || it.s || 1); d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        if (it.color !== undefined) im.setColorAt(i, (this._c || (this._c = new THREE.Color())).setHex(it.color));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.areaGroup.add(im);
      return im;
    },
    flushInstances() {
      const T = this._inst.trees;
      if (T.length) {
        this.instanced(new THREE.CylinderGeometry(0.2, 0.3, 2, 7), M.matLite(0x4a3220), T.map(t => ({ x: t.x, y: t.s, z: t.z, ry: t.ry, s: t.s })));
        this.instanced(new THREE.ConeGeometry(1.4, 2.4, 8), M.matLite(0xffffff, { flatShading: true }), T.map(t => ({ x: t.x, y: 2.6 * t.s + 0.6, z: t.z, ry: t.ry, s: t.s, color: t.leaf })));
        this.instanced(new THREE.ConeGeometry(1.0, 1.8, 8), M.matLite(0xffffff, { flatShading: true }), T.map(t => ({ x: t.x, y: 3.6 * t.s + 0.6, z: t.z, ry: t.ry, s: t.s, color: t.leaf })));
      }
      Object.values(this._inst.pillars).forEach(({ h, color, list }) => {
        this.instanced(new THREE.CylinderGeometry(0.5, 0.6, h, 10), M.matLite(color), list.map(p => ({ x: p.x, y: h / 2, z: p.z })));
      });
      this._inst = { trees: [], pillars: {} };
    },

    /* ---------------------------- Builders --------------------------- */
    buildWalls(def, height) {
      const [W, D] = def.size, t = 1;
      const wm = M.matLite(def.wall);
      const gaps = def.doors.map(d => ({ x: d.x, z: d.z, w: 3.6 }));
      const seg = (x1, z1, x2, z2) => {
        const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.1) return;
        const horiz = Math.abs(z2 - z1) < 0.01;
        const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : t, height, horiz ? t : len), wm);
        m.position.set((x1 + x2) / 2, height / 2, (z1 + z2) / 2); this.areaGroup.add(m);
      };
      const sides = [
        { fixed: -D / 2, axis: 'x', from: -W / 2, to: W / 2 }, { fixed: D / 2, axis: 'x', from: -W / 2, to: W / 2 },
        { fixed: -W / 2, axis: 'z', from: -D / 2, to: D / 2 }, { fixed: W / 2, axis: 'z', from: -D / 2, to: D / 2 },
      ];
      sides.forEach(sd => {
        const holes = gaps.filter(g => sd.axis === 'x' ? Math.abs(g.z - sd.fixed) < 0.5 : Math.abs(g.x - sd.fixed) < 0.5)
          .map(g => sd.axis === 'x' ? g.x : g.z).sort((a, b) => a - b);
        let cur = sd.from;
        holes.forEach(h => { this._seg(seg, sd, cur, h - 1.8); cur = h + 1.8; });
        this._seg(seg, sd, cur, sd.to);
      });
      if (def.outdoor) {
        const items = [];
        for (let x = -W / 2; x <= W / 2; x += 2) [-D / 2, D / 2].forEach(z => {
          if (!gaps.some(g => Math.abs(g.z - z) < 0.5 && Math.abs(g.x - x) < 2.5)) items.push({ x, y: height + 0.4, z });
        });
        this.instanced(new THREE.BoxGeometry(0.9, 0.8, 1.1), M.matLite(def.wall), items);
      }
    },
    _seg(fn, sd, a, b) { if (b - a < 0.1) return; if (sd.axis === 'x') fn(a, sd.fixed, b, sd.fixed); else fn(sd.fixed, a, sd.fixed, b); },

    buildTreeWall(def) {
      const [W, D] = def.size, r = rng(99);
      for (let i = 0; i < 160; i++) {
        const side = i % 4, t = r() * 2 - 1;
        const x = side < 2 ? t * W / 2 : (side === 2 ? -W / 2 : W / 2) + (r() - 0.5) * 3;
        const z = side >= 2 ? t * D / 2 : (side === 0 ? -D / 2 : D / 2) + (r() - 0.5) * 3;
        if (def.doors.some(d => Math.hypot(d.x - x, d.z - z) < 4)) continue;
        this.addTree(x, z, 1.2 + r() * 0.8, r, false);
      }
    },
    addTree(x, z, s, r, collide = true) {
      this._inst.trees.push({ x, z, s, leaf: r() > 0.5 ? 0x1f4a24 : 0x2a5a2a, ry: r() * 6 });
      if (collide) this.colliders.push({ x, z, r: 0.5 * s });
    },
    addBox(x, z, w, d, h, color, collide = true, y = 0) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.matLite(color));
      m.position.set(x, y + h / 2, z); this.areaGroup.add(m);
      if (collide) this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      return m;
    },
    addPillar(x, z, h = 7, color = 0x7a7064) {
      const key = h + ':' + color;
      (this._inst.pillars[key] = this._inst.pillars[key] || { h, color, list: [] }).list.push({ x, z });
      this.colliders.push({ x, z, r: 0.6 });
    },
    addTorch(x, z, y = 3, withLight = true) {
      this.areaGroup.add(M.mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6), M.matLite(0x3a2a1a), x, y, z));
      const flame = M.mesh(new THREE.ConeGeometry(0.14, 0.35, 8), M.glowMat(0xff9030, 3), x, y + 0.45, z); this.areaGroup.add(flame);
      const light = withLight ? this.requestLight(0xff9a40, 1.6, 12, 1.5, x, y + 0.8, z) : null;
      const seed = Math.random() * 10;
      this.animated.push(t => { flame.scale.y = 1 + Math.sin(t * 15 + seed) * 0.2; if (light) light.intensity = 1.5 + Math.sin(t * 11 + seed) * 0.3; });
    },
    addStars(count = 300, height = 30) {
      const geo = new THREE.BufferGeometry(), p = new Float32Array(count * 3), r = rng(5);
      for (let i = 0; i < count; i++) p.set([(r() - 0.5) * 120, height + r() * 20, (r() - 0.5) * 120], i * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.areaGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, fog: false })));
    },
    rune(color, intensity = 1) {
      return M.mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 6), M.glowMat(color, intensity));
    },

    /** Area transition: stone arch + shimmering veil + destination name (§1.3). */
    addPassage(d) {
      const g = new THREE.Group();
      const stone = M.matLite(0x8a8070);
      g.add(M.mesh(new THREE.BoxGeometry(0.5, 4, 0.8), stone, -1.8, 2, 0));
      g.add(M.mesh(new THREE.BoxGeometry(0.5, 4, 0.8), stone, 1.8, 2, 0));
      g.add(M.mesh(new THREE.BoxGeometry(4.1, 0.6, 0.8), stone, 0, 4.2, 0));
      const veil = M.mesh(new THREE.PlaneGeometry(3.1, 3.9), new THREE.MeshBasicMaterial({ color: 0xbfd8e8, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }), 0, 1.95, 0);
      g.add(veil);
      const r = this.rune(d.tint || 0xbfd8e8, 1.2); r.position.set(0, 4.2, 0.45); g.add(r);
      // highlight: glowing frame edges + floor glow so doors stand out from far away
      const tint = d.tint || 0xbfd8e8, edge = M.glowMat(tint, 1.8);
      g.add(M.mesh(new THREE.BoxGeometry(0.08, 3.9, 0.9), edge, -1.53, 1.95, 0));
      g.add(M.mesh(new THREE.BoxGeometry(0.08, 3.9, 0.9), edge, 1.53, 1.95, 0));
      g.add(M.mesh(new THREE.BoxGeometry(3.14, 0.08, 0.9), edge, 0, 3.9, 0));
      const glowFloor = M.mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0.03, 0);
      glowFloor.rotation.x = -Math.PI / 2; g.add(glowFloor);
      g.position.set(d.x, 0, d.z);
      if (Math.abs(d.x) > Math.abs(d.z) * (this.area.size[1] / this.area.size[0])) g.rotation.y = Math.PI / 2;
      this.areaGroup.add(g);
      const lab = M.label(`🚪 ${d.label}`, '#bfe6ff'); lab.scale.set(2.4, 0.75, 1); lab.position.set(d.x, 4.9, d.z); this.areaGroup.add(lab);
      const pos = new THREE.Vector3(d.x, 0, d.z);
      this.animated.push(t => {
        const dist = global.Player ? global.Player.pos.distanceTo(pos) : 10;
        const near = Math.max(0, 1 - dist / 4);
        veil.material.opacity = 0.2 + Math.sin(t * 2) * 0.06 + near * 0.15;
        edge.emissiveIntensity = 1.4 + Math.sin(t * 2.5) * 0.5;
        glowFloor.material.opacity = 0.18 + Math.sin(t * 2.5) * 0.08;
        const k = Math.max(0.7, Math.min(2.4, dist / 9));          // label keeps a readable size at any distance
        lab.scale.set(2.4 * k, 0.75 * k, 1);
      });
      this.interactables.push({ pos, radius: 3, label: `Enter: ${d.label}`, kind: 'door', action: () => this.travel(d.to, d.spawn) });
    },

    /* ----------------------------- Shrines --------------------------- */
    /** Quick-travel shrine: touch once to attune, then use it (or the map) to travel. */
    addShrine(id, sh) {
      const attuned = () => S.player && (S.player.shrines || []).includes(id);
      const g = new THREE.Group(); g.position.set(sh.x, 0, sh.z);
      const stone = M.matLite(0x8a8aa0);
      g.add(M.mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.35, 8), stone, 0, 0.17, 0));
      g.add(M.mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.0, 8), stone, 0, 0.85, 0));
      g.add(M.mesh(new THREE.CylinderGeometry(0.6, 0.45, 0.15, 8), stone, 0, 1.4, 0));
      const crystalM = M.glowMat(0xb88aff, 0.6);
      const crystal = M.mesh(new THREE.OctahedronGeometry(0.32), crystalM, 0, 2.1, 0); crystal.scale.y = 1.6; g.add(crystal);
      const ring = M.mesh(new THREE.RingGeometry(1.3, 1.45, 40), new THREE.MeshBasicMaterial({ color: 0xb88aff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }), 0, 0.04, 0);
      ring.rotation.x = -Math.PI / 2; g.add(ring);
      this.areaGroup.add(g);
      this.colliders.push({ x: sh.x, z: sh.z, r: 0.9 });
      this.animated.push(t => {
        const on = attuned();
        crystal.rotation.y = t * (on ? 1.2 : 0.3); crystal.position.y = 2.1 + Math.sin(t * 2) * 0.08;
        crystalM.emissiveIntensity = on ? 2.2 + Math.sin(t * 3) * 0.4 : 0.5;
        ring.material.opacity = on ? 0.45 + Math.sin(t * 3) * 0.1 : 0.15;
      });
      const entry = { pos: new THREE.Vector3(sh.x, 0, sh.z), radius: 2.6, kind: 'shrine', shrine: id,
        get label() { return attuned() ? `✦ Quick travel (${sh.name})` : `✦ Attune to ${sh.name}`; },
        action: () => {
          if (!attuned()) {
            (S.player.shrines = S.player.shrines || []).push(id); S.save();
            FX.rise(this._v1.set(sh.x, 0.5, sh.z), 0xb88aff, 80, 2); FX.ring(this._v1.set(sh.x, 0.2, sh.z), 0xb88aff, 2.5, 0.6);
            S.Events.emit('toast', { text: `${sh.name} attuned! Travel here from any shrine or the map (M).`, kind: 'spell' });
            S.Events.emit('shrines');
          } else if (this.onShrine) this.onShrine(id);
        } };
      this.interactables.push(entry);
    },
    /** Teleport to an attuned shrine (lands a couple of metres in front of it). */
    teleportToShrine(id) {
      const sh = SHRINES[id];
      if (!sh || !(S.player.shrines || []).includes(id)) return false;
      const A = AREAS[sh.area], dz = sh.z > 0 ? -2.2 : 2.2;
      this.travel(sh.area, [sh.x, Math.max(-A.size[1] / 2 + 1, Math.min(A.size[1] / 2 - 1, sh.z + dz))]);
      FX.rise(this._v1.set(global.Player.pos.x, 0.3, global.Player.pos.z), 0xb88aff, 80, 2);
      return true;
    },

    /* --------------------------- Quest beacon ------------------------- */
    /** Show a light pillar at {x, z} in this area (or hide it with null). */
    setGuide(target) {
      this.guide = target;
      if (!this.areaGroup) return;
      if (!this.beacon) {
        const g = new THREE.Group();
        const beam = M.mesh(new THREE.CylinderGeometry(0.35, 0.35, 30, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }), 0, 15, 0);
        const ring = M.mesh(new THREE.RingGeometry(0.7, 0.95, 32), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }), 0, 0.05, 0);
        ring.rotation.x = -Math.PI / 2;
        const gem = M.mesh(new THREE.OctahedronGeometry(0.25), M.glowMat(0xffd84a, 2.5), 0, 3.4, 0);
        g.add(beam, ring, gem);
        this.areaGroup.add(g);
        this.beacon = { g, beam, ring, gem };
        this.animated.push(t => {
          if (!this.beacon || this.beacon.g !== g) return;
          const P = global.Player, near = this.guide && P ? Math.hypot(P.pos.x - this.guide.x, P.pos.z - this.guide.z) < 2.5 : false;
          g.visible = !!this.guide && !near;
          if (this.guide) g.position.set(this.guide.x, 0, this.guide.z);
          ring.scale.setScalar(1 + (t * 0.8 % 1) * 0.8); ring.material.opacity = 0.6 * (1 - (t * 0.8 % 1));
          gem.rotation.y = t * 2; gem.position.y = 3.4 + Math.sin(t * 2.5) * 0.2;
        });
      }
    },

    /* ------------------------------ Gates ---------------------------- */
    /** Physical door with a state: closed / locked / sealed / boss / decor (§1.3.2). */
    addGate(gd) {
      const T = DOOR_TYPES[gd.type] || DOOR_TYPES.oak;
      const g = new THREE.Group(); g.position.set(gd.x, 0, gd.z); g.rotation.y = gd.rot || 0;
      const stone = M.matLite(0x8a8070);
      // frame
      g.add(M.mesh(new THREE.BoxGeometry(0.25, T.h + 0.25, 0.5), stone, -T.w / 2 - 0.12, (T.h + 0.25) / 2, 0));
      g.add(M.mesh(new THREE.BoxGeometry(0.25, T.h + 0.25, 0.5), stone, T.w / 2 + 0.12, (T.h + 0.25) / 2, 0));
      g.add(M.mesh(new THREE.BoxGeometry(T.w + 0.5, 0.25, 0.5), stone, 0, T.h + 0.12, 0));
      // leaf (pivot at the hinge for swinging doors)
      const leaf = new THREE.Group();
      const iron = M.mat(0x2a2a2e, { metalness: 0.8, roughness: 0.4 });
      if (gd.type === 'oak') {
        leaf.position.set(-T.w / 2, 0, 0);
        leaf.add(M.mesh(new THREE.BoxGeometry(T.w, T.h, 0.12), M.matLite(0x4a3220), T.w / 2, T.h / 2, 0));
        for (const y of [0.5, 1.3, 2.1]) leaf.add(M.mesh(new THREE.BoxGeometry(T.w + 0.02, 0.08, 0.14), iron, T.w / 2, y, 0));
        leaf.add(M.mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12), iron, T.w - 0.2, 1.2, 0.09));
      } else if (gd.type === 'cell') {
        leaf.position.set(-T.w / 2, 0, 0);
        for (let i = 0; i < 6; i++) leaf.add(M.mesh(new THREE.CylinderGeometry(0.03, 0.03, T.h, 5), iron, 0.1 + i * 0.24, T.h / 2, 0));
        for (const y of [0.15, T.h / 2, T.h - 0.15]) leaf.add(M.mesh(new THREE.BoxGeometry(T.w, 0.06, 0.06), iron, T.w / 2, y, 0));
        if (gd.state === 'locked') {
          leaf.add(M.mesh(new THREE.BoxGeometry(0.12, 0.14, 0.06), M.mat(0xc8a040, { metalness: 0.7 }), T.w - 0.2, 1.2, 0.06));
        }
      } else {   // portcullis
        for (let i = 0; i <= 12; i++) leaf.add(M.mesh(new THREE.CylinderGeometry(0.035, 0.035, T.h, 5), iron, -T.w / 2 + i * T.w / 12, T.h / 2, 0));
        for (let j = 1; j < 5; j++) leaf.add(M.mesh(new THREE.BoxGeometry(T.w, 0.05, 0.05), iron, 0, j * T.h / 5, 0));
      }
      g.add(leaf);
      // state indicators
      let runeColor = STATE_COLORS[gd.state];
      let seal = null;
      if (gd.state === 'sealed') {
        const spell = spellById(gd.spell);
        runeColor = spell.color;
        const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
        global.drawThumb(cv, spell);
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        seal = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        seal.position.set(0, 1.4, 0.12); g.add(seal);
      }
      if (gd.state !== 'decor') {        // highlight usable doors: glowing frame in the state's colour
        const edge = M.glowMat(runeColor || 0xe8b860, 1.4);
        g.add(M.mesh(new THREE.BoxGeometry(0.06, T.h, 0.56), edge, -T.w / 2 - 0.02, T.h / 2, 0));
        g.add(M.mesh(new THREE.BoxGeometry(0.06, T.h, 0.56), edge, T.w / 2 + 0.02, T.h / 2, 0));
        g.add(M.mesh(new THREE.BoxGeometry(T.w + 0.1, 0.06, 0.56), edge, 0, T.h + 0.01, 0));
        this.animated.push(t => { edge.emissiveIntensity = 1.1 + Math.sin(t * 2.5) * 0.4; });
      }
      if (gd.state === 'boss') {
        const chainM = M.mat(0x3a3a3a, { metalness: 0.8 });
        [-1, 1].forEach(s => { const c = M.mesh(new THREE.BoxGeometry(T.w * 1.2, 0.08, 0.08), chainM, 0, T.h / 2, 0.15); c.rotation.z = s * 0.8; g.add(c); });
      }
      let rune = null;
      if (runeColor !== undefined) { rune = this.rune(runeColor, 1.4); rune.position.set(0, T.h + 0.45, 0.28); g.add(rune); }
      this.areaGroup.add(g);

      const gate = { def: gd, group: g, leaf, rune, seal, T, open: false, anim: 0, collider: null,
        pos: new THREE.Vector3(gd.x, 0, gd.z) };
      // closed doors block movement and projectiles
      const c = Math.abs(Math.cos(gd.rot || 0)) > 0.5;   // door runs along x when rot ≈ 0 / π
      gate.collider = c ? { minX: gd.x - T.w / 2, maxX: gd.x + T.w / 2, minZ: gd.z - 0.15, maxZ: gd.z + 0.15, gate: true }
                        : { minX: gd.x - 0.15, maxX: gd.x + 0.15, minZ: gd.z - T.w / 2, maxZ: gd.z + T.w / 2, gate: true };
      this.colliders.push(gate.collider);
      this.gates.push(gate);
      // boss doors open while the quest is in progress or done
      if (gd.state === 'boss' && gd.quest && ['active', 'ready', 'done'].includes(Q.stateOf(gd.quest))) this.openGate(gate, true);
      if (S.player && S.player.openedGates && S.player.openedGates.includes(gd.id)) this.openGate(gate, true);

      if (gd.state !== 'decor') {
        const entry = { pos: gate.pos.clone(), radius: 2.6, kind: 'gate', gate };
        Object.defineProperty(entry, 'label', { get: () => this.gateLabel(gate) });
        entry.action = () => this.useGate(gate);
        this.interactables.push(entry);
      }
      this.animated.push(t => {
        if (gate.rune) gate.rune.rotation.z = t * 0.4;
        if (gate.seal && !gate.open) gate.seal.material.opacity = 0.65 + Math.sin(t * 3.9) * 0.3;   // 1.6 s pulse
        const target = gate.open ? 1 : 0;
        if (gate.anim !== target) {
          gate.anim += Math.sign(target - gate.anim) * Math.min(Math.abs(target - gate.anim), 1 / 0.45 * (1 / 60));
          const k = 1 - Math.pow(1 - gate.anim, 3);   // ease-out
          if (gd.type === 'portcullis') gate.leaf.position.y = k * (T.h - 0.3);
          else gate.leaf.rotation.y = -k * 1.66;       // ~95°
        }
      });
    },
    gateLabel(gate) {
      const gd = gate.def;
      if (gate.open) return gd.state === 'closed' ? 'Close door' : null;
      switch (gd.state) {
        case 'closed': return 'Open door';
        case 'locked': return S.itemCount(gd.key) ? `Unlock with ${ITEMS[gd.key].name}` : `🔒 Locked: needs ${ITEMS[gd.key].name}`;
        case 'sealed': return `✎ Sealed: hit it with ${spellById(gd.spell).name}`;
        case 'boss': return '⛓ Sealed by the Headmistress';
        default: return null;
      }
    },
    useGate(gate) {
      const gd = gate.def;
      if (gd.state === 'closed') { gate.open ? this.closeGate(gate) : this.openGate(gate); return; }
      if (gate.open) return;
      if (gd.state === 'locked') {
        if (S.itemCount(gd.key)) { this.openGate(gate); S.Events.emit('toast', { text: `Unlocked with the ${ITEMS[gd.key].name}.`, kind: 'item' }); }
        else S.Events.emit('toast', { text: `Locked. You need the ${ITEMS[gd.key].name}.`, kind: 'info' });
      } else if (gd.state === 'sealed') S.Events.emit('toast', { text: `A magic seal. Break it with ${spellById(gd.spell).name}.`, kind: 'info' });
      else if (gd.state === 'boss') S.Events.emit('toast', { text: 'Headmistress Vane has sealed this gate.', kind: 'info' });
    },
    openGate(gate, instant) {
      if (gate.open) return;
      gate.open = true;
      this.colliders = this.colliders.filter(c => c !== gate.collider);
      if (instant) gate.anim = 0.999;
      if (gate.rune) gate.rune.visible = gate.def.state === 'closed';
      if (gate.seal) gate.seal.visible = false;
      if (!instant && S.player && gate.def.state !== 'closed') {
        S.player.openedGates = S.player.openedGates || [];
        if (!S.player.openedGates.includes(gate.def.id)) S.player.openedGates.push(gate.def.id);
      }
    },
    closeGate(gate) {
      if (!gate.open) return;
      gate.open = false;
      if (global.Player && Math.hypot(global.Player.pos.x - gate.pos.x, global.Player.pos.z - gate.pos.z) < 0.8) { gate.open = true; return; }  // don't trap the player
      this.colliders.push(gate.collider);
    },
    /** Called by combat when a spell hits near pos: breaks matching seals. */
    spellHit(pos, spellId) {
      for (const gate of this.gates) {
        if (gate.def.state !== 'sealed' || gate.open) continue;
        if (Math.hypot(pos.x - gate.pos.x, pos.z - gate.pos.z) > 2.2) continue;
        if (spellId === gate.def.spell) {
          FX.burst(gate.seal.getWorldPosition(this._v1), spellById(spellId).color, 50, 4);
          this.openGate(gate);
          S.Events.emit('toast', { text: 'The seal shatters!', kind: 'spell' });
          S.save();
        } else S.Events.emit('toast', { text: `The seal resists. It needs ${spellById(gate.def.spell).name}.`, kind: 'info' });
      }
    },

    /* -------------------------- NPCs & items ------------------------- */
    addNpc(id, n) {
      const mesh = M.wizard(Object.assign({ beard: id === 'quill' || id === 'hob' ? 0xdddddd : null, ghost: !!n.ghost }, n.look));
      mesh.position.set(n.pos[0], mesh.position.y, n.pos[1]);
      this.areaGroup.add(mesh);
      const lab = M.label(n.name, n.ghost ? '#cfe9ff' : '#ffe9b0'); lab.position.set(n.pos[0], 2.9, n.pos[1]); this.areaGroup.add(lab);
      this.npcMeshes[id] = { mesh, lab };
      this.colliders.push({ x: n.pos[0], z: n.pos[1], r: 0.7 });
      this.interactables.push({ pos: new THREE.Vector3(n.pos[0], 0, n.pos[1]), radius: 3.2, label: `Talk to ${n.name}`, kind: 'npc', npc: id,
        action: () => { if (this.onTalk) this.onTalk(id); } });
    },
    refreshMarkers() {
      Object.entries(this.npcMeshes).forEach(([id, o]) => o.lab.userData.setText(NPCS[id].name, Q.markerFor(id)));
    },

    pickupVisible(p) {
      if (S.player.collected.includes(p.id) || this.pickupIds.has(p.id)) return false;
      if (p.always) return true;
      if (Q.stateOf(p.quest) !== 'active') return false;
      if (p.requiresKill) {
        const q = Q.get(p.quest), i = q.objectives.findIndex(o => o.type === 'kill' && o.target === p.requiresKill);
        if (i >= 0 && Q.progressOf(q, i) < q.objectives[i].count) return false;
      }
      return true;
    },
    /** Add any pickups that became available (e.g. the egg after its guardian dies). */
    refreshPickups() {
      if (!this.area || !S.player) return;
      (this.area.pickups || []).forEach(p => { if (this.pickupVisible(p)) this.addPickup(p); });
    },
    addPickup(p) {
      const it = ITEMS[p.item];
      this.pickupIds.add(p.id);
      const g = new THREE.Group();
      const color = { moonpetal: 0x9fd8ff, dragon_egg: 0xff8a3a, cell_key: 0xd8b860 }[p.item] || 0xffb040;
      if (p.item === 'moonpetal') {
        for (let i = 0; i < 5; i++) { const petal = M.mesh(new THREE.SphereGeometry(0.18, 8, 6), M.glowMat(color, 1.5)); petal.scale.set(1, 0.3, 0.5); petal.position.set(Math.cos(i * 1.256) * 0.2, 0, Math.sin(i * 1.256) * 0.2); petal.rotation.y = -i * 1.256; g.add(petal); }
      } else if (p.item === 'dragon_egg') {
        const egg = M.mesh(new THREE.SphereGeometry(0.3, 14, 10), M.mat(0x8a2a1a, { emissive: 0xff5a1a, emissiveIntensity: 0.6 })); egg.scale.set(1, 1.3, 1); g.add(egg);
      } else if (p.item === 'cell_key') {
        g.add(M.mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), M.mat(color, { metalness: 0.8, emissive: 0x403010 }), 0, 0.12, 0));
        g.add(M.mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), M.mat(color, { metalness: 0.8, emissive: 0x403010 }), 0, -0.08, 0));
      } else {
        g.add(M.mesh(new THREE.BoxGeometry(0.35, 0.45, 0.35), M.matLite(0x3a2a1a)));
        g.add(M.mesh(new THREE.SphereGeometry(0.15, 8, 8), M.glowMat(color, 3)));
      }
      let light = p.hidden ? null : this.requestLight(color, 1.5, 6, 2, p.x, 1, p.z);
      g.position.set(p.x, 0.9, p.z); this.areaGroup.add(g);
      this.animated.push(t => { g.rotation.y = t; g.position.y = 0.9 + Math.sin(t * 2) * 0.12; });
      const entry = { pos: new THREE.Vector3(p.x, 0, p.z), radius: 2, label: `Pick up ${it.name}`, kind: 'pickup' };
      if (p.hidden) {          // only Wandlight reveals it (fades in within 5 m)
        g.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0; } });
        const mats = []; g.traverse(o => { if (o.material) mats.push(o.material); });
        const proxy = { get opacity() { return mats[0].opacity; }, set opacity(v) { mats.forEach(m => { m.opacity = v; }); } };
        entry.hidden = true;
        this.hiddenThings.push({ entry, mat: proxy, pos: new THREE.Vector3(p.x, 1, p.z) });
      }
      entry.action = () => {
        S.player.collected.push(p.id); this.areaGroup.remove(g); disposeTree(g); this.releaseLight(light);
        FX.burst(g.position, color, 40, 3);
        this.interactables = this.interactables.filter(x => x !== entry);
        Q.onCollect(p.item);
      };
      this.interactables.push(entry);
    },
    addChest(c) {
      if (S.player.collected.includes(c.id)) return;
      const g = new THREE.Group();
      g.add(M.mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), M.matLite(0x6a4628), 0, 0.25, 0));
      const lid = M.mesh(new THREE.BoxGeometry(0.92, 0.18, 0.62), M.matLite(0x5a3a20), 0, 0.6, 0); g.add(lid);
      g.add(M.mesh(new THREE.BoxGeometry(0.15, 0.15, 0.05), M.mat(0xd4af37, { metalness: 0.6, emissive: 0x302000 }), 0, 0.45, 0.32));
      g.position.set(c.x, 0, c.z); this.areaGroup.add(g);
      this.colliders.push({ x: c.x, z: c.z, r: 0.5 });
      const entry = { pos: new THREE.Vector3(c.x, 0, c.z), radius: 2, label: 'Open chest', kind: 'chest' };
      entry.action = () => {
        S.player.collected.push(c.id); lid.rotation.x = -1.2; lid.position.set(0, 0.75, -0.25);
        FX.burst(this._v1.set(c.x, 0.8, c.z), 0xffd84a, 40, 3);
        this.interactables = this.interactables.filter(x => x !== entry);
        S.Events.emit('toast', { text: c.text, kind: 'item' });
        S.addXp(c.xp); if (c.gold) S.addGold(c.gold); S.save();
      };
      this.interactables.push(entry);
    },
    addSecret(s) {
      const sec = SECRETS[s.id];
      const found = S.player && S.player.secrets.includes(s.id);
      const color = s.id === 'starfall_altar' ? 0xbfe0ff : 0x7fb0ff;
      const g = new THREE.Group();
      let gem;
      if (s.id === 'starfall_altar') {
        g.add(M.mesh(new THREE.CylinderGeometry(1, 1.2, 0.8, 8), M.matLite(0x8a8a9a), 0, 0.4, 0));
        gem = M.mesh(new THREE.OctahedronGeometry(0.35), M.glowMat(color, found ? 0.5 : 2), 0, 1.4, 0); g.add(gem);
        this.colliders.push({ x: s.x, z: s.z, r: 1.2 });
        // landmark: thin beam of light above the canopy (§1.9)
        if (!found) g.add(M.mesh(new THREE.CylinderGeometry(0.15, 0.15, 40, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 0, 20, 0));
      } else {
        gem = M.mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 5), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: found ? 0.5 : 0 }), 0, 1.8, 0);
        gem.rotation.y = Math.PI / 2; g.add(gem);
      }
      g.position.set(s.x, 0, s.z); this.areaGroup.add(g);
      this.animated.push(t => { gem.rotation.z = t * 0.5; if (s.id === 'starfall_altar') { gem.rotation.y = t; gem.position.y = 1.4 + Math.sin(t) * 0.1; } });
      const entry = { pos: new THREE.Vector3(s.x, 0, s.z), radius: 2.6, label: `Examine ${sec.name}`, kind: 'secret',
        action: () => { const res = Q.discoverSecret(s.id); if (res.discovered) FX.rise(this._v1.set(s.x, 0.5, s.z), color, 80, 2); if (this.onSecret) this.onSecret(sec.name, res.text); } };
      if (sec.hidden && !found) { entry.hidden = true; this.hiddenThings.push({ entry, mat: gem.material, pos: new THREE.Vector3(s.x, 1.8, s.z) }); }
      this.interactables.push(entry);
    },

    /* --------------------------- Per frame --------------------------- */
    updateWorld(dt, t) {
      for (let i = 0; i < this.animated.length; i++) this.animated[i](t);
      const P = global.Player;
      if (!P || !this.areaGroup) return;
      // NPCs face the player when close
      for (const id in this.npcMeshes) {
        const { mesh, lab } = this.npcMeshes[id];
        mesh.userData.anim(t, false);
        const dx = P.pos.x - mesh.position.x, dz = P.pos.z - mesh.position.z;
        if (dx * dx + dz * dz < 36) mesh.rotation.y = Math.atan2(dx, dz);
        const k = Math.max(0.3, Math.min(1, Math.hypot(dx, dz) / 8));       // name labels shrink up close
        lab.scale.set(3.2 * k, k, 1);
      }
      // Wandlight reveals hidden runes within 5 m (§7.4)
      const tip = P.wandTip;
      for (const h of this.hiddenThings) {
        const d = tip.distanceTo(h.pos);
        const vis = P.wandlightOn ? Math.max(0, Math.min(1, (5 - d) / 2.5)) : 0;
        h.mat.opacity += (vis - h.mat.opacity) * Math.min(1, dt * 6);
        h.revealed = h.mat.opacity > 0.25;
      }
      // interaction target: nearest interactable in front of you
      let best = null, bestD = Infinity;
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      for (const it of this.interactables) {
        if (it.hidden && !this.hiddenThings.some(h => h.entry === it && h.revealed)) continue;
        if (it.kind === 'gate' && !this.gateLabel(it.gate)) continue;
        const dx = it.pos.x - P.pos.x, dz = it.pos.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d > it.radius) continue;
        const facing = d < 1.2 || (dx * fx + dz * fz) / (d || 1) > 0.45;
        if (facing && d < bestD) { best = it; bestD = d; }
      }
      // enemies: walk up to one and press E to start a battle (story only, never automatic)
      const C = global.Combat;
      if (C && C.mode === 'story' && this.area && !this.area.arena) {
        for (const e of C.entities) {
          if (e.kind !== 'enemy' || e.dead) continue;
          const reach = e.def.dragon ? 7 : 3.4;
          const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
          if (d > reach) continue;
          const facing = d < 1.5 || (dx * fx + dz * fz) / (d || 1) > 0.6;
          if (!facing || d >= bestD) continue;
          e._fight = e._fight || { kind: 'enemy', label: `⚔ ${e.def.training ? 'Train with' : 'Fight'} ${e.def.name} (Lv ${e.def.level})${e.weakText ? ' · ' + e.weakText : ''}`, action: () => C.engage(e, true) };
          best = e._fight; bestD = d;
        }
      }
      this.current = this.paused ? null : best;
      if (this.onInteractPrompt) this.onInteractPrompt(this.current);
    },
    interact() { if (this.current && !this.paused) this.current.action(); },

    /* --------------------------- Collision --------------------------- */
    collide(p, R = 0.35) {
      const [W, D] = this.area.size;
      p.x = Math.max(-W / 2 + R + 0.5, Math.min(W / 2 - R - 0.5, p.x));
      p.z = Math.max(-D / 2 + R + 0.5, Math.min(D / 2 - R - 0.5, p.z));
      for (const c of this.colliders) {
        if (c.r !== undefined) {
          const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + R;
          if (d < min && d > 1e-4) { p.x = c.x + dx / d * min; p.z = c.z + dz / d * min; }
        } else if (p.x > c.minX - R && p.x < c.maxX + R && p.z > c.minZ - R && p.z < c.maxZ + R) {
          const pen = [p.x - (c.minX - R), (c.maxX + R) - p.x, p.z - (c.minZ - R), (c.maxZ + R) - p.z];
          const m = Math.min(pen[0], pen[1], pen[2], pen[3]);
          if (m === pen[0]) p.x = c.minX - R; else if (m === pen[1]) p.x = c.maxX + R; else if (m === pen[2]) p.z = c.minZ - R; else p.z = c.maxZ + R;
        }
      }
    },
    /** True if a point is inside a wall, collider, the floor or the ceiling (for projectiles and aiming). */
    blocked(x, y, z, skipCircles) {
      if (!this.area) return true;
      const [W, D] = this.area.size;
      if (y < 0 || x < -W / 2 + 0.5 || x > W / 2 - 0.5 || z < -D / 2 + 0.5 || z > D / 2 - 0.5) return true;
      if (this.area.ceiling && y > this.area.ceiling) return true;
      for (const c of this.colliders) {
        if (c.r !== undefined) { if (!skipCircles && y < 3 && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true; }
        else if (y < 3.2 && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
      }
      return false;
    },
    /** March a ray until it hits geometry. Returns the distance (≤ max). */
    rayDistance(origin, dir, max) {
      for (let d = 0.3; d < max; d += 0.25) {
        if (this.blocked(origin.x + dir.x * d, origin.y + dir.y * d, origin.z + dir.z * d)) return d;
      }
      return max;
    },

    /* --------------------------- Area props -------------------------- */
    props: {
      great_hall() {
        this.addStars(400, 14);
        [-10, -4, 4, 10].forEach(x => {
          this.addBox(x, 2, 2.2, 12, 0.8, 0x6a4628);
          this.addBox(x - 1.7, 2, 0.6, 12, 0.45, 0x5a3a20);
          this.addBox(x + 1.7, 2, 0.6, 12, 0.45, 0x5a3a20);
        });
        const plates = [];
        [-10, -4, 4, 10].forEach(x => { for (let z = -3; z <= 7; z += 2.5) plates.push({ x, y: 0.85, z }); });
        this.instanced(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8), M.mat(0xd4af37, { metalness: 0.6 }), plates);
        this.addBox(0, -6, 14, 1.4, 0.8, 0x7a5030);
        const fl = this.requestLight(0xff8030, 3, 14, 2, -15.5, 1.5, 0);
        this.requestLight(0xffc070, 2, 30, 2, 0, 6, 0);
        // floating golden orrery above the head table (landmark, §1.5)
        const orrery = new THREE.Group(); orrery.position.set(0, 6.5, -7);
        const gold = M.mat(0xd4af37, { metalness: 0.7, roughness: 0.3 });
        const rings = [1.2, 1.8, 2.4].map((r, i) => { const m = M.mesh(new THREE.TorusGeometry(r, 0.05, 6, 40), gold); m.rotation.x = 0.4 + i * 0.5; orrery.add(m); return m; });
        orrery.add(M.mesh(new THREE.SphereGeometry(0.4, 16, 12), M.glowMat(0xffd9a0, 1.5)));
        this.areaGroup.add(orrery);
        this.animated.push(t => rings.forEach((m, i) => { m.rotation.y = t * (0.1 + i * 0.1); }));
        const r = rng(3), cand = [];
        for (let i = 0; i < 40; i++) cand.push({ x: (r() - 0.5) * 32, z: (r() - 0.5) * 20, y: 4.5 + r() * 2.5, s: r() * 6 });
        const bodies = this.instanced(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 6), M.matLite(0xf8f0d8), cand);
        const flames = this.instanced(new THREE.SphereGeometry(0.06, 6, 6), M.glowMat(0xffb040, 3), cand.map(c => ({ x: c.x, y: c.y + 0.24, z: c.z })));
        const d = this._dummy;
        this.animated.push(t => {
          for (let i = 0; i < cand.length; i++) {
            const c = cand[i], y = c.y + Math.sin(t + c.s) * 0.15;
            d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
            d.position.set(c.x, y, c.z); d.updateMatrix(); bodies.setMatrixAt(i, d.matrix);
            d.position.y = y + 0.24; d.updateMatrix(); flames.setMatrixAt(i, d.matrix);
          }
          bodies.instanceMatrix.needsUpdate = true; flames.instanceMatrix.needsUpdate = true;
        });
        [0x8a1c1c, 0x1c4a8a, 0x1c7a3a, 0xa08a1c].forEach((col, i) => this.areaGroup.add(M.mesh(new THREE.PlaneGeometry(2, 5), M.matLite(col, { side: THREE.DoubleSide }), -12 + i * 8, 6, -11.4)));
        this.addBox(-17, 0, 1.2, 4, 3.2, 0x6a5a4a);
        const fire = M.mesh(new THREE.ConeGeometry(0.7, 1.4, 8), M.glowMat(0xff7020, 3), -16.1, 0.7, 0); this.areaGroup.add(fire);
        this.animated.push(t => { fire.scale.set(1 + Math.sin(t * 9) * 0.1, 1 + Math.sin(t * 13) * 0.2, 1); if (fl) fl.intensity = 2.6 + Math.sin(t * 17) * 0.5; });
        [-16, 16].forEach(x => [-4, 4].forEach(z => this.addPillar(x, z, 12)));
      },
      corridor(def) {
        for (let x = -27; x <= 27; x += 6) { this.addPillar(x, -4, def.ceiling); this.addPillar(x, 4, def.ceiling); }
        // vault arches between the pillars
        const arches = [];
        for (let x = -27; x <= 27; x += 6) arches.push({ x, y: def.ceiling - 4, z: 0 });   // ribs spring from the pillars, peak at the ceiling
        const archGeo = new THREE.TorusGeometry(4, 0.25, 6, 12, Math.PI); archGeo.rotateY(Math.PI / 2);
        this.instanced(archGeo, M.matLite(0x6a645c), arches);
        this.areaGroup.add(M.mesh(new THREE.BoxGeometry(56, 0.02, 2), M.matLite(0x7a1c24), 0, 0.01, 0));
        [-24, -12, 0, 12, 24].forEach((x, i) => this.addTorch(x + 3, -4.4, 2.4, i % 2 === 0));
        const pr = rng(11);
        // paintings on the south wall at eye level, facing into the corridor
        for (let x = -24; x <= 24; x += 12) {
          this.areaGroup.add(M.mesh(new THREE.BoxGeometry(2.4, 1.8, 0.1), M.matLite(0xb08a3a), x, 2.4, 4.45));
          const art = M.mesh(new THREE.PlaneGeometry(2, 1.4), M.matLite(new THREE.Color().setHSL(pr(), 0.35, 0.35).getHex()), x, 2.4, 4.38);
          art.rotation.y = Math.PI; this.areaGroup.add(art);
        }
        // landmark: moonlit stained-glass window at the far east end (visible down the whole corridor)
        const win = M.mesh(new THREE.PlaneGeometry(3, 5), new THREE.MeshBasicMaterial({ color: 0x8a90d0 }), 29.45, 3.4, 2.6);
        win.rotation.y = -Math.PI / 2; this.areaGroup.add(win);
        this.addBox(-17.5, -3, 1.4, 1, 1, 0x6a4a2a);
        this.addBox(16.5, -3, 2, 1, 0.6, 0xd8d8e0);
      },
      courtyard() {
        this.areaGroup.add(M.mesh(new THREE.BoxGeometry(4, 0.03, 44), M.matLite(0x9a9080), 0, 0.02, 0));
        this.areaGroup.add(M.mesh(new THREE.BoxGeometry(44, 0.03, 4), M.matLite(0x9a9080), 0, 0.02, 0));
        this.areaGroup.add(M.mesh(new THREE.CylinderGeometry(3, 3.2, 0.8, 20), M.matLite(0xa8a090), 0, 0.4, 0));
        const water = M.mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.1, 20), M.matLite(0x3a80b8, { emissive: 0x103050 }), 0, 0.75, 0); this.areaGroup.add(water);
        this.areaGroup.add(M.mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.2, 10), M.matLite(0xa8a090), 0, 1.4, 0));
        this.colliders.push({ x: 0, z: 0, r: 3.3 });
        this.animated.push(t => { water.position.y = 0.75 + Math.sin(t * 2) * 0.03; });
        this.areaGroup.add(M.mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), M.matLite(0x8a8070, { side: THREE.DoubleSide }), -14, 0.5, -12));
        this.colliders.push({ x: -14, z: -12, r: 1.1 });
        // landmark: clock tower beyond the north wall
        this.areaGroup.add(M.mesh(new THREE.BoxGeometry(4, 20, 4), M.matLite(0x7a7468), 12, 10, -25));
        this.areaGroup.add(M.mesh(new THREE.ConeGeometry(3.2, 5, 4), M.matLite(0x3a3040), 12, 22.5, -25));
        this.areaGroup.add(M.mesh(new THREE.CircleGeometry(1.2, 24), M.glowMat(0xffe9b0, 1.0), 12, 16, -22.95));
        const r = rng(21);
        [[-16, 6], [-8, 16], [16, -14], [12, 8], [-18, -4], [17, 17], [-17, 17], [6, 16]].forEach(([x, z]) => this.addTree(x, z, 0.9 + r() * 0.4, r));
        this.addStars(100, 40);
      },
      forest() {
        this.requestLight(0x8fb0ff, 1.5, 80, 2, 0, 25, 0);
        const r = rng(42);
        // clearings: paths, quest spots, dragon nest (radius 8), storm wyrm circle
        const keep = [[-28, 0, 4], [-20, 20, 4], [10, 8, 4], [-4, -28, 4], [26, -27, 4], [-25, -25, 4], [22, 22, 5], [-2, 23, 9], [4, 0, 7]];
        for (let i = 0; i < 90; i++) {
          const x = (r() - 0.5) * 58, z = (r() - 0.5) * 58;
          if (keep.some(([kx, kz, kr]) => Math.hypot(kx - x, kz - z) < kr) || (Math.abs(z) < 2.5 && x < -10)) continue;
          this.addTree(x, z, 0.8 + r() * 0.7, r);
        }
        const shrooms = [];
        for (let i = 0; i < 30; i++) shrooms.push({ x: (r() - 0.5) * 58, z: (r() - 0.5) * 58, cap: r() > 0.5 ? 0x60d0b0 : 0x9070c0 });
        this.instanced(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), M.matLite(0xe8e0d0), shrooms.map(m => ({ x: m.x, y: 0.15, z: m.z })));
        this.instanced(new THREE.SphereGeometry(0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }),
          shrooms.map(m => ({ x: m.x, y: 0.28, z: m.z, color: m.cap })));
        const n = MOBILE ? 40 : 80, geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), seeds = [];
        for (let i = 0; i < n; i++) seeds.push([(r() - 0.5) * 60, (r() - 0.5) * 60, r() * 6]);
        geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
        this.areaGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8ff70, size: 0.15, transparent: true, blending: THREE.AdditiveBlending })));
        this.animated.push(t => { for (let i = 0; i < n; i++) { const [x, z, s] = seeds[i]; p[i * 3] = x + Math.sin(t * 0.5 + s) * 2; p[i * 3 + 1] = 1.6 + Math.sin(t * 0.8 + s * 2) * 0.8; p[i * 3 + 2] = z + Math.cos(t * 0.4 + s) * 2; } geo.attributes.position.needsUpdate = true; });
        for (let i = 0; i < 4; i++) this.areaGroup.add(M.mesh(new THREE.CircleGeometry(1.2, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3 }), 22 + i * 2, 1.5, -24 - (i % 2) * 2));
        // dragon nest: jagged rock ring + scorched ground + bones (§1.9)
        const rocks = [];
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (Math.abs(a - Math.PI * 1.5) < 0.4) continue; rocks.push({ x: -2 + Math.cos(a) * 8, y: 0.6, z: 23 + Math.sin(a) * 8, s: 0.8 + r() * 0.8, ry: r() * 6 }); }
        this.instanced(new THREE.DodecahedronGeometry(1), M.matLite(0x3a3430, { flatShading: true }), rocks);
        const scorch = M.mesh(new THREE.CircleGeometry(7, 24), M.matLite(0x1a1210), -2, 0.015, 23); scorch.rotation.x = -Math.PI / 2; this.areaGroup.add(scorch);
        this.instanced(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 5), M.matLite(0xd8d0c0), Array.from({ length: 10 }, () => ({ x: -2 + (r() - 0.5) * 10, y: 0.05, z: 23 + (r() - 0.5) * 10, ry: r() * 6 })));
        this.addStars(200, 40);
      },
      dungeon(def) {
        const H = def.wallHeight;
        for (let x = -16; x <= 16; x += 8) { this.addPillar(x, -6, H, 0x4a4444); this.addPillar(x, 6, H, 0x4a4444); }
        this.instanced(new THREE.BoxGeometry(44, 0.4, 0.5), M.matLite(0x2e2a2a), [-14, -10, -6, -2, 2, 6, 10, 14].map(z => ({ x: 0, y: H - 0.2, z })));
        // cell bars along the north wall, with gaps for the gates
        const gateXs = (def.gates || []).filter(g => Math.abs(g.z + 14) < 0.5).map(g => ({ x: g.x, half: (DOOR_TYPES[g.type] || DOOR_TYPES.oak).w / 2 + 0.25 }));
        const bars = [];
        for (let x = -21; x <= 21; x += 0.6) { if (gateXs.some(g => Math.abs(x - g.x) < g.half)) continue; bars.push({ x, y: 2, z: -14 }); }
        this.instanced(new THREE.CylinderGeometry(0.04, 0.04, 4, 5), M.mat(0x2a2a2a, { metalness: 0.8, roughness: 0.4 }), bars);
        // bar wall collider, split around the gates
        let cur = -22;
        gateXs.sort((a, b) => a.x - b.x).forEach(g => { this.colliders.push({ minX: cur, maxX: g.x - g.half, minZ: -14.3, maxZ: -13.7 }); cur = g.x + g.half; });
        this.colliders.push({ minX: cur, maxX: 22, minZ: -14.3, maxZ: -13.7 });
        [-18, -6, 6, 18].forEach((x, i) => this.addTorch(x, 17.4, 2.6, i === 0));
        this.addTorch(-21.4, -6, 2.6, true);
        // landmark: the Warden's violet glow behind the boss portcullis
        this.requestLight(0x7a5cff, 1.2, 10, 2, 15, 1.5, -16);
        this.addBox(-10, 12, 3, 1.5, 1.2, 0x4a3a2a); this.addBox(10, -2, 1.2, 1.2, 1, 0x4a3a2a);
        const pool = M.mesh(new THREE.CircleGeometry(1.4, 16), M.glowMat(0x3a6a5a, 0.3), 19, 0.02, -16.5); pool.rotation.x = -Math.PI / 2; this.areaGroup.add(pool);
      },
      battle_arena(def) {
        const R = def.size[0] / 2 - 2.5, theme = def.theme;
        this.requestLight(def.dark ? 0xb0a0ff : 0xfff0d0, def.dark ? 1.1 : 0.8, R * 3, 2, 0, R, 0);
        this.areaGroup.add(M.mesh(new THREE.CylinderGeometry(R, R + 0.4, 0.25, 48), M.matLite(new THREE.Color(def.floor).multiplyScalar(1.25).getHex()), 0, 0.12, 0));
        const ring = M.mesh(new THREE.TorusGeometry(R - 0.6, 0.07, 6, 64), M.glowMat(0xff6a4a, 1.1), 0, 0.27, 0); ring.rotation.x = Math.PI / 2; this.areaGroup.add(ring);
        const n = Math.round(R * 0.9);
        for (let i = 0; i < n; i++) {
          const a = (i + 0.5) / n * Math.PI * 2, x = Math.cos(a) * (R + 1.6), z = Math.sin(a) * (R + 1.6);
          if (theme === 'forest') this.addTree(x, z, 1.1 + (i % 3) * 0.2, rng(i * 97 + 13), true);
          else if (theme === 'dungeon' || theme === 'corridor' || theme === 'great_hall') { this.addPillar(x, z, def.wallHeight, new THREE.Color(def.wall).multiplyScalar(1.2).getHex()); if (i % 3 === 0) this.addTorch(x * 0.94, z * 0.94, 2.6, false); }
          else this.addPillar(x, z, 3.2, 0x8a8478);
        }
        if (def.outdoor) this.addStars(200, 30);
      },
      duel_arena() {
        this.requestLight(0x9fa8ff, 1.5, 60, 2, 0, 18, 0);
        this.areaGroup.add(M.mesh(new THREE.CylinderGeometry(15, 15.5, 0.4, 48), M.matLite(0x5a5468), 0, 0.2, 0));
        const ring = M.mesh(new THREE.TorusGeometry(13, 0.08, 6, 64), M.glowMat(0x7fb8ff, 1.2), 0, 0.42, 0); ring.rotation.x = Math.PI / 2; this.areaGroup.add(ring);
        const pillars = [];
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; pillars.push({ x: Math.cos(a) * 9, z: Math.sin(a) * 9 }); }
        pillars.forEach(p => { this.addPillar(p.x, p.z, 3.5, 0x6a6460); });
        this.addStars(250, 30);
      },
    },
  };

  global.World = World;
})(window);
