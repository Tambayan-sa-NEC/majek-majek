/* =====================================================================
 * fx.js — POOLED SPELL & PARTICLE EFFECTS
 * ---------------------------------------------------------------------
 * Everything is created ONCE and reused, so rapid spell-spam never
 * allocates GPU objects mid-fight (docs/ART_GUIDE.md §6.2, §9.6):
 *   - all particles live in ONE THREE.Points (one draw call), simulated
 *     in typed arrays, faded out near the camera
 *   - projectile orbs, rings, beams, lightning lines come from small pools
 *   - a fixed set of FX point lights is always in the scene (intensity 0
 *     when unused) so the light count never changes (no shader recompiles)
 * Public API (unchanged from the old models.js FX):
 *   setScene, clear, update(dt, camera, pxHeight), burst, projectile,
 *   beam, lightning, ring, rise, stream, bomb
 * Requires: window.THREE (read lazily on first use)
 * ===================================================================== */
(function (global) {
  'use strict';
  let THREE = null;

  const MOBILE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const CAP = MOBILE ? 1000 : 3000;          // particle pool size
  const COUNT_SCALE = MOBILE ? 0.45 : 1;     // fewer particles per effect on phones
  const POOL = { orbs: 40, rings: 20, beams: 4, lines: 4, lights: MOBILE ? 0 : 2 };   // phones: no effect lights, halos only

  const VERT = `
    attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
    uniform float uScale; varying float vAlpha; varying vec3 vColor;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float dist = -mv.z;
      vAlpha = aAlpha * smoothstep(0.25, 0.9, dist);    // fade particles that get too close to the camera
      vColor = aColor;
      gl_PointSize = (dist > 0.0 && aAlpha > 0.0) ? clamp(aSize * uScale / dist, 0.0, 96.0) : 0.0;
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    varying float vAlpha; varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5 || vAlpha <= 0.001) discard;
      float a = smoothstep(0.5, 0.0, d) * vAlpha;
      vec3 c = mix(vColor, vec3(1.0), smoothstep(0.22, 0.0, d) * 0.55);  // white-hot core
      gl_FragColor = vec4(c * a, a);
    }`;

  // scratch objects (never allocate per frame)
  let _v1, _v2, _v3;

  const FX = {
    ready: false, scene: null, root: null,
    actors: [], cursor: 0,
    countScale: COUNT_SCALE, capacity: CAP,
    stats: { activeParticles: 0, activeActors: 0 },

    init() {
      if (this.ready) return;
      THREE = global.THREE;
      _v1 = new THREE.Vector3(); _v2 = new THREE.Vector3(); _v3 = new THREE.Vector3();
      this.root = new THREE.Group();
      this.root.name = 'FXRoot';

      // ---- particles
      this.p = {
        pos: new Float32Array(CAP * 3), vel: new Float32Array(CAP * 3), col: new Float32Array(CAP * 3),
        size: new Float32Array(CAP), size0: new Float32Array(CAP), grow: new Float32Array(CAP),
        alpha: new Float32Array(CAP), life: new Float32Array(CAP), age: new Float32Array(CAP),
        grav: new Float32Array(CAP), drag: new Float32Array(CAP), color2: new Float32Array(CAP * 3), shift: new Uint8Array(CAP),
      };
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(this.p.pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aColor', new THREE.BufferAttribute(this.p.col, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aSize', new THREE.BufferAttribute(this.p.size, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.p.alpha, 1).setUsage(THREE.DynamicDrawUsage));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);   // never frustum-culled
      this.pMat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 400 } }, vertexShader: VERT, fragmentShader: FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.points = new THREE.Points(geo, this.pMat);
      this.points.frustumCulled = false;
      this.points.renderOrder = 5;
      this.root.add(this.points);

      // ---- pooled meshes
      const add = (THREE.AdditiveBlending);
      const orbGeo = new THREE.SphereGeometry(1, 14, 10);
      this.orbs = [];
      for (let i = 0; i < POOL.orbs; i++) {
        const g = new THREE.Group();
        const core = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
        const halo = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, blending: add, depthWrite: false }));
        halo.scale.setScalar(1.8);
        g.add(core, halo); g.visible = false; g.userData = { core, halo, busy: false };
        this.root.add(g); this.orbs.push(g);
      }
      const ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 32);
      this.rings = [];
      for (let i = 0; i < POOL.rings; i++) {
        const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: add, depthWrite: false }));
        r.rotation.x = Math.PI / 2; r.visible = false; r.userData.busy = false;
        this.root.add(r); this.rings.push(r);
      }
      const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
      beamGeo.rotateX(Math.PI / 2); beamGeo.translate(0, 0, 0.5);           // unit length along +z
      this.beams = [];
      for (let i = 0; i < POOL.beams; i++) {
        const g = new THREE.Group();
        const core = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
        const outer = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: add, depthWrite: false }));
        g.add(core, outer); g.visible = false; g.userData = { core, outer, busy: false };
        this.root.add(g); this.beams.push(g);
      }
      this.lines = [];
      for (let i = 0; i < POOL.lines; i++) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(13 * 3), 3).setUsage(THREE.DynamicDrawUsage));
        const l = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
        l.frustumCulled = false; l.visible = false; l.userData.busy = false;
        this.root.add(l); this.lines.push(l);
      }
      // fixed light slots — always present so the scene's light count never changes
      this.lights = [];
      for (let i = 0; i < POOL.lights; i++) {
        const L = new THREE.PointLight(0xffffff, 0, 10, 1.5);
        L.userData.busy = false; this.root.add(L); this.lights.push(L);
      }
      this.ready = true;
    },

    /** Move the whole effect pool into another scene (world ↔ arena). */
    setScene(s) {
      this.init();
      this.clear();
      if (this.root.parent) this.root.parent.remove(this.root);
      this.scene = s;
      if (s) s.add(this.root);
    },

    /** Stop every effect immediately (callbacks are dropped, like before). */
    clear() {
      if (!this.ready) return;
      this.actors.length = 0;
      this.p.alpha.fill(0); this.p.life.fill(0); this.p.size.fill(0);
      [...this.orbs, ...this.rings, ...this.beams, ...this.lines].forEach(o => { o.visible = false; o.userData.busy = false; });
      this.lights.forEach(L => { L.intensity = 0; L.userData.busy = false; });
      this.markDirty();
    },

    /* ----------------------------- pools ------------------------------ */
    take(list) {
      for (const o of list) if (!o.userData.busy) { o.userData.busy = true; o.visible = true; return o; }
      // Pool exhausted: finish the oldest effect that owns one of these objects RIGHT NOW
      // (its onDone runs, so any combat code waiting for its hit is never left hanging).
      const idx = this.actors.findIndex(a => a.owns && a.owns.some(o => list.includes(o)));
      if (idx >= 0) {
        const a = this.actors[idx];
        this.actors.splice(idx, 1);
        if (a.update) a.update(1, 0);
        if (a.onDone) a.onDone();
        for (const o of list) if (!o.userData.busy) { o.userData.busy = true; o.visible = true; return o; }
      }
      const o = list[0]; o.userData.busy = true; o.visible = true; return o;   // last resort (should not happen)
    },
    give(o) { if (o) { o.userData.busy = false; o.visible = false; } },
    takeLight(color, distance) {
      const L = this.lights.find(l => !l.userData.busy);
      if (!L) return null;
      L.userData.busy = true; L.color.setHex(color); L.distance = distance; L.intensity = 0;
      return L;
    },
    giveLight(L) { if (L) { L.intensity = 0; L.userData.busy = false; } },

    /** Register a timed effect. update(k, dt) gets 0..1 progress. */
    actor(life, update, onDone, owns) {
      const a = { life, age: 0, update, onDone, owns };
      this.actors.push(a);
      return a;
    },

    /* --------------------------- particles ---------------------------- */
    emit(x, y, z, vx, vy, vz, color, size, life, gravity = 0, grow = 0, drag = 0, color2 = -1) {
      const p = this.p, i = this.cursor;
      this.cursor = (this.cursor + 1) % CAP;          // ring buffer: oldest particle is reused
      const i3 = i * 3;
      p.pos[i3] = x; p.pos[i3 + 1] = y; p.pos[i3 + 2] = z;
      p.vel[i3] = vx; p.vel[i3 + 1] = vy; p.vel[i3 + 2] = vz;
      p.col[i3] = ((color >> 16) & 255) / 255; p.col[i3 + 1] = ((color >> 8) & 255) / 255; p.col[i3 + 2] = (color & 255) / 255;
      if (color2 >= 0) { p.shift[i] = 1; p.color2[i3] = ((color2 >> 16) & 255) / 255; p.color2[i3 + 1] = ((color2 >> 8) & 255) / 255; p.color2[i3 + 2] = (color2 & 255) / 255; }
      else p.shift[i] = 0;
      p.size[i] = size; p.size0[i] = size; p.grow[i] = grow;
      p.alpha[i] = 1; p.life[i] = life; p.age[i] = 0; p.grav[i] = gravity; p.drag[i] = drag;
    },
    n(count) { return Math.max(1, Math.round(count * this.countScale)); },
    markDirty() {
      const a = this.points.geometry.attributes;
      a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
    },

    /* ----------------------------- update ----------------------------- */
    update(dt, camera, pxHeight) {
      if (!this.ready) return;
      if (camera && camera.isPerspectiveCamera) {
        // same size convention as THREE.PointsMaterial (size in world units, scale = buffer height / 2)
        this.pMat.uniforms.uScale.value = (pxHeight || 800) * 0.5;
      }
      // actors (iterate backwards so removal is safe)
      for (let i = this.actors.length - 1; i >= 0; i--) {
        const a = this.actors[i];
        if (!a) continue;
        a.age += dt;
        const k = Math.min(1, a.age / a.life);
        if (a.update) a.update(k, dt);
        if (k >= 1) { this.actors.splice(i, 1); if (a.onDone) a.onDone(); }
      }
      // particles
      const p = this.p; let active = 0;
      for (let i = 0; i < CAP; i++) {
        if (p.life[i] <= 0) continue;
        p.age[i] += dt;
        const k = p.age[i] / p.life[i];
        if (k >= 1) { p.life[i] = 0; p.alpha[i] = 0; p.size[i] = 0; continue; }
        active++;
        const i3 = i * 3, dr = 1 - p.drag[i] * dt;
        p.vel[i3 + 1] += p.grav[i] * dt;
        p.vel[i3] *= dr; p.vel[i3 + 1] *= dr; p.vel[i3 + 2] *= dr;
        p.pos[i3] += p.vel[i3] * dt; p.pos[i3 + 1] += p.vel[i3 + 1] * dt; p.pos[i3 + 2] += p.vel[i3 + 2] * dt;
        p.alpha[i] = 1 - k * k;
        p.size[i] = p.size0[i] * (1 + p.grow[i] * k);
        if (p.shift[i] && k > 0.5) { p.col[i3] = p.color2[i3]; p.col[i3 + 1] = p.color2[i3 + 1]; p.col[i3 + 2] = p.color2[i3 + 2]; p.shift[i] = 0; }
      }
      this.stats.activeParticles = active;
      this.stats.activeActors = this.actors.length;
      this.markDirty();
    },

    /* ============================ EFFECTS ============================= */
    /** Particle burst at pos. */
    burst(pos, color, count = 40, speed = 4, life = 0.8, size = 0.18, gravity = -2) {
      this.init();
      const n = this.n(count);
      for (let i = 0; i < n; i++) {
        // random direction, biased slightly upward
        let x = Math.random() - 0.5, y = Math.random() - 0.3, z = Math.random() - 0.5;
        const l = Math.hypot(x, y, z) || 1, s = speed * (0.4 + Math.random() * 0.8) / l;
        this.emit(pos.x, pos.y, pos.z, x * s, y * s, z * s, color, size * 1.15, life * (0.7 + Math.random() * 0.5), gravity);
      }
    },

    /** Glowing orb that flies from -> to, then calls onHit. */
    projectile(from, to, color, size = 0.3, duration = 0.6, onHit) {
      this.init();
      const g = this.take(this.orbs), { core, halo } = g.userData;
      core.material.color.setHex(0xffffff); halo.material.color.setHex(color);
      core.scale.setScalar(size * 0.55); halo.scale.setScalar(size * 1.8);
      const L = this.takeLight(color, 8);
      const a0 = from.clone(), b0 = to.clone();       // two small allocations per cast (not per frame)
      let trail = 0;
      g.position.copy(a0);
      this.actor(duration, (k, dt) => {
        g.position.lerpVectors(a0, b0, k); g.position.y += Math.sin(k * Math.PI) * 0.8;
        const pulse = 1 + Math.sin(k * 40) * 0.15;
        halo.scale.setScalar(size * 1.8 * pulse);
        if (L) { L.position.copy(g.position); L.intensity = 3; }
        trail += dt;
        if (trail > 0.03) { trail = 0; this.emit(g.position.x, g.position.y, g.position.z, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, color, size * 0.6, 0.35); }
      }, () => {
        this.give(g); this.giveLight(L);
        this.burst(b0, color, 50, 5, 0.9, 0.22);
        if (onHit) onHit();
      }, [g]);
    },

    /** Straight beam between two points. */
    beam(from, to, color, width = 0.35, duration = 1.0, onHit) {
      this.init();
      const g = this.take(this.beams), { core, outer } = g.userData;
      outer.material.color.setHex(color);
      const len = from.distanceTo(to);
      g.position.copy(from); g.lookAt(to);
      const L = this.takeLight(color, 12);
      const hitPos = to.clone();
      let hit = false, sparks = 0;
      this.actor(duration, (k, dt) => {
        const grow = Math.min(1, k * 4), w = width * (1 - k * 0.5);
        core.scale.set(w, w, len * grow); outer.scale.set(w * 2.2, w * 2.2, len * grow);
        outer.material.opacity = 0.5 * (1 - k); core.material.opacity = 1 - k;
        if (L) { L.position.copy(hitPos); L.intensity = 4 * (1 - k); }
        if (!hit && k > 0.3) { hit = true; this.burst(hitPos, color, 70, 6, 1, 0.25); if (onHit) onHit(); }
        sparks += dt;
        if (hit && sparks > 0.05) { sparks = 0; this.burst(hitPos, color, 6, 3, 0.4, 0.15, 0); }
      }, () => { this.give(g); this.giveLight(L); }, [g]);
    },

    /** Jagged lightning from the sky to pos. */
    lightning(pos, color = 0xfff04d, onHit) {
      this.init();
      const l = this.take(this.lines);
      l.material.color.setHex(color);
      const arr = l.geometry.attributes.position.array;
      const jitter = () => {
        for (let i = 0; i <= 12; i++) {
          const t = i / 12, edge = i > 0 && i < 12;
          arr[i * 3] = pos.x + (edge ? (Math.random() - 0.5) * 1.2 : 0);
          arr[i * 3 + 1] = pos.y + 12 * (1 - t);
          arr[i * 3 + 2] = pos.z + (edge ? (Math.random() - 0.5) * 1.2 : 0);
        }
        l.geometry.attributes.position.needsUpdate = true;
      };
      jitter();
      const L = this.takeLight(color, 25);
      const p0 = pos.clone();
      this.burst(p0, color, 60, 6, 0.7, 0.2);
      if (onHit) onHit();
      let t = 0;
      this.actor(0.5, (k, dt) => {
        t += dt; if (t > 0.04 && k < 0.5) { t = 0; jitter(); }
        l.material.opacity = (1 - k) * (Math.random() > 0.3 ? 1 : 0.2);
        if (L) { L.position.set(p0.x, p0.y + 2, p0.z); L.intensity = 15 * (1 - k); }
      }, () => { this.give(l); this.giveLight(L); }, [l]);
    },

    /** Expanding ring (wind, shockwave). */
    ring(pos, color, maxR = 3, duration = 0.7) {
      this.init();
      const r = this.take(this.rings);
      r.material.color.setHex(color);
      const p0 = pos.clone();
      this.actor(duration, k => {
        r.scale.setScalar(0.2 + k * maxR); r.material.opacity = 1 - k;
        r.position.set(p0.x, p0.y + k * 0.8, p0.z);
      }, () => this.give(r), [r]);
    },

    /** Particles spiralling up around pos (heal, buffs). */
    rise(pos, color, count = 40, duration = 1.2) {
      this.init();
      const n = this.n(count), p0 = pos.clone();
      let emitted = 0;
      this.actor(duration, k => {
        const target = Math.min(n, Math.ceil(n * Math.min(1, k / 0.6)));
        for (; emitted < target; emitted++) {
          const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.6;
          // tangential + upward velocity gives a loose spiral
          this.emit(p0.x + Math.cos(a) * r, p0.y, p0.z + Math.sin(a) * r,
            -Math.sin(a) * 0.8, 2.2 + Math.random() * 0.6, Math.cos(a) * 0.8, color, 0.22, duration * 0.8);
        }
      });
    },

    /** Cone of particle puffs from -> to (dragon breath). */
    stream(from, to, color, duration = 1.2, onHit) {
      this.init();
      const a0 = from.clone(), dir = to.clone().sub(from).normalize().multiplyScalar(9);
      let t = 0, hit = false;
      this.actor(duration, (k, dt) => {
        t += dt;
        if (t > 0.03 && k < 0.8) {
          t = 0;
          for (let i = 0; i < this.n(10); i++) {
            this.emit(a0.x, a0.y, a0.z, dir.x + (Math.random() - 0.5) * 3, dir.y + (Math.random() - 0.5) * 2, dir.z + (Math.random() - 0.5) * 3,
              color, 0.45, 0.8, 0, 1.33, 0, 0xff3010);
          }
        }
        if (!hit && k > 0.35) { hit = true; if (onHit) onHit(); }
      });
    },

    /** Big orb that grows above `from`, then slams into `to`. */
    bomb(from, to, color, onHit) {
      this.init();
      const g = this.take(this.orbs), { core, halo } = g.userData;
      core.material.color.setHex(color); halo.material.color.setHex(0xffffff);
      const start = from.clone(); start.y += 5;
      const end = to.clone();
      const L = this.takeLight(color, 20);
      let hit = false;
      this.actor(1.8, k => {
        if (k < 0.55) { const s = 0.1 + (k / 0.55) * 1.6; g.position.copy(start); core.scale.setScalar(s); halo.scale.setScalar(s * 1.25); }
        else { const t = (k - 0.55) / 0.45; g.position.lerpVectors(start, end, t * t); }
        if (L) { L.position.copy(g.position); L.intensity = 6; }
        if (!hit && k > 0.97) { hit = true; this.burst(end, color, 120, 9, 1.2, 0.3); this.ring(end, color, 6, 0.9); if (onHit) onHit(); }
      }, () => { this.give(g); this.giveLight(L); }, [g]);
    },
  };

  global.FX = FX;
})(window);
