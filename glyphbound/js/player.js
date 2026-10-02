/* =====================================================================
 * player.js — FIRST-PERSON WIZARD: CAMERA, MOVEMENT, DRAW-TO-CAST, WANDLIGHT
 * ---------------------------------------------------------------------
 * Mouse (pointer lock):  move = look · hold LEFT button + move = draw a
 *                        glyph from the crosshair · release = cast
 * Without pointer lock (blocked by the browser or ?nolock): hold LEFT and
 *                        draw with the cursor · hold RIGHT and drag = look
 * Keys: WASD/arrows move · Shift sprint · E interact · L Wandlight
 * Touch PC: a finger draws · Phone/tablet: left thumb = move stick · right side = draw (👁 button switches it to look)
 *
 * Casting pipeline (docs/ART_GUIDE.md §10): recognition (worker) → chip →
 * wind-up (Perfect 60 / Great 110 / Good 170 ms) → spell leaves the wand →
 * recovery (80 / 120 / 160 ms). One stroke drawn during recovery is queued.
 * Requires: THREE, data.js, state.js, drawing.js, world.js (combat.js, ui.js at runtime)
 * ===================================================================== */
(function (global) {
  'use strict';
  const { SPELLS, CAST_RULES } = global.GameData;
  const S = global.GameState, SC = global.SpellCaster;
  const spellById = id => SPELLS.find(s => s.id === id);
  const MOBILE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  // touchscreen PC / laptop (mouse + touch): any finger on the screen draws a glyph
  const HYBRID = !MOBILE && typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in global);
  let THREE;

  const EYE = 1.65, WALK = 4.2, SPRINT = 6.5, SENS = 0.0022;

  const Player = {
    pos: null, yaw: 0, pitch: 0, keys: {}, locked: false, noLock: false, lookDrag: null,
    drawing: false, pen: { x: 0, y: 0 }, drawMode: true, touchMode: false, hybrid: HYBRID,
    wandTip: null, wandlightOn: false, wl: 0, wlFlash: { t: 0, mult: 1, color: 0xfff1d6, dur: 1 },
    readyAt: 0, pendingFire: null, buffered: null, recognizing: false, recoil: 0, recoilDur: 160, kick: 0,
    bob: 0, moving: false, knock: null, fovPunch: 0, orbColor: 0xfff1d6, cooldowns: {},
    touch: { moveId: null, lookId: null, drawId: null, start: null, vec: { x: 0, y: 0 }, last: null },

    init(canvas) {
      THREE = global.THREE;
      this.canvas = canvas;
      this.pos = new THREE.Vector3(0, 0, 0);
      this.wandTip = new THREE.Vector3();
      this._fwd = new THREE.Vector3(); this._tmp = new THREE.Vector3(); this._col = new THREE.Color(); this._col2 = new THREE.Color();
      this.noLock = /[?&]nolock/.test(global.location.search) || MOBILE;
      this.pad = new global.DrawPad(document.getElementById('draw-canvas'), {
        onStroke: pts => this.onStroke(pts),
        allowed: () => this.allowedIds(),
        showGhost: () => !S.player || S.player.showGhost !== false,
      });
      this.pad.enable();
      this.pad.canvas.style.pointerEvents = 'none';     // all pointer input comes through this module
      this.buildViewmodel();
      this.bindInput(canvas);
    },

    /* --------------------------- Viewmodel --------------------------- */
    buildViewmodel() {
      const M = global.Models;
      this.vmScene = new THREE.Scene();
      this.vmCamera = new THREE.PerspectiveCamera(60, global.innerWidth / global.innerHeight, 0.01, 10);
      this.vmScene.add(new THREE.HemisphereLight(0xb0a8d0, 0x302828, 1.6));
      const d = new THREE.DirectionalLight(0xffeedd, 0.8); d.position.set(1, 2, 1); this.vmScene.add(d);
      this.vmLight = new THREE.PointLight(0xfff1d6, 0, 2, 1.5); this.vmScene.add(this.vmLight);
      const g = new THREE.Group();
      const sleeve = M.mesh(new THREE.CylinderGeometry(0.06, 0.085, 0.36, 8), M.mat(0x2c4c9c), 0, -0.05, 0.12);
      sleeve.rotation.x = Math.PI / 2 - 0.25; g.add(sleeve);
      g.add(M.mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 14), M.mat(0xd4af37, { metalness: 0.5 }), 0, -0.01, -0.05));
      g.add(M.mesh(new THREE.SphereGeometry(0.05, 10, 8), M.mat(0xf0c8a0), 0, 0, -0.08));
      const wand = M.mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.38, 6), M.mat(0x5a3a1e), 0, 0.04, -0.27);
      this.wandMesh = wand;
      wand.rotation.x = -Math.PI / 2 + 0.25; g.add(wand);
      this.orb = M.mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }), 0, 0.085, -0.455); g.add(this.orb);
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const c = cv.getContext('2d'), grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grd; c.fillRect(0, 0, 64, 64);
      this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), color: 0xfff1d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.halo.scale.setScalar(0.06); this.halo.position.copy(this.orb.position); g.add(this.halo);
      g.scale.setScalar(0.62);                          // keep the hand small so it never hides the fight
      this.vm = g; this.vmBase = new THREE.Vector3(0.27, -0.26, -0.44);
      g.position.copy(this.vmBase);
      this.vmScene.add(g);
    },

    /* ------------------------------ Input ---------------------------- */
    bindInput(canvas) {
      const isTyping = e => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      global.addEventListener('keydown', e => {
        if (isTyping(e)) return;
        this.keys[e.code] = true;
        if (!this.active()) return;
        if (e.code === 'KeyE') global.World.interact();
        if (e.code === 'KeyL') this.toggleWandlight();
        if (e.code === 'Digit1') global.Combat.usePotion('health_potion');
        if (e.code === 'Digit2') global.Combat.usePotion('mana_potion');
      });
      global.addEventListener('keyup', e => { this.keys[e.code] = false; });
      global.addEventListener('blur', () => { this.keys = {}; this.cancelDraw(); });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === canvas;
        if (!this.locked) { this.cancelDraw(); if (global.Game && global.Game.onPointerUnlock) global.Game.onPointerUnlock(); }
      });
      document.addEventListener('pointerlockerror', () => {
        this.noLock = true;
        if (global.UI) global.UI.toast('Mouse capture is unavailable here: hold RIGHT mouse to look, LEFT to draw.', 'info');
      });
      canvas.addEventListener('mousedown', e => {
        if (!this.active()) return;
        if (!this.locked && !this.noLock) { this.requestLock(); return; }   // first click captures the mouse
        if (e.button === 0) this.beginDraw(this.locked ? global.innerWidth / 2 : e.clientX, this.locked ? global.innerHeight / 2 : e.clientY);
        if (e.button === 2 && !this.locked) this.lookDrag = { x: e.clientX, y: e.clientY };
      });
      document.addEventListener('mousemove', e => {
        if (this.locked) {
          if (this.drawing) {
            this.pen.x = Math.max(4, Math.min(global.innerWidth - 4, this.pen.x + e.movementX));
            this.pen.y = Math.max(4, Math.min(global.innerHeight - 4, this.pen.y + e.movementY));
            this.pad.moveVirtual(this.pen.x, this.pen.y);
          } else if (this.active()) this.look(e.movementX, e.movementY);
          return;
        }
        if (this.drawing) { this.pen.x = e.clientX; this.pen.y = e.clientY; this.pad.moveVirtual(e.clientX, e.clientY); }
        else if (this.lookDrag) { this.look(e.clientX - this.lookDrag.x, e.clientY - this.lookDrag.y); this.lookDrag = { x: e.clientX, y: e.clientY }; }
      });
      document.addEventListener('mouseup', e => {
        if (e.button === 0 && this.drawing && this.touch.drawId === null) this.endDraw();
        if (e.button === 2) this.lookDrag = null;
      });
      // ---- touch (on the game view or the "Click to play" card; buttons and panels keep normal taps)
      const gameTouch = e => e.target === canvas || (e.target.closest && e.target.closest('#click-play'));
      const onT = phase => e => { if (gameTouch(e)) this.onTouch(e, phase); };
      document.addEventListener('touchstart', onT('start'), { passive: false });
      document.addEventListener('touchmove', onT('move'), { passive: false });
      document.addEventListener('touchend', onT('end'), { passive: false });
      document.addEventListener('touchcancel', onT('end'), { passive: false });
      const drawBtn = document.getElementById('btn-draw');
      // phones/tablets: a finger on the right side draws by default; this button switches it to looking around
      if (drawBtn) drawBtn.addEventListener('click', () => { this.drawMode = !this.drawMode; drawBtn.textContent = this.drawMode ? '👁 Look' : '✋ Draw'; drawBtn.classList.toggle('on', !this.drawMode); });
      const lightBtn = document.getElementById('btn-light');
      if (lightBtn) lightBtn.addEventListener('click', () => this.toggleWandlight());
    },
    onTouch(e, phase) {
      if (!this.active()) return;
      e.preventDefault();
      const T = this.touch;
      if (!MOBILE) {                                  // touchscreen PC: one finger draws, keyboard moves, mouse looks
        if (!this.touchMode) {
          this.touchMode = true;
          if (global.UI) global.UI.toast('Touch: draw a glyph with your finger, lift to cast. Click with the mouse to look around.', 'info');
        }
        for (const t of e.changedTouches) {
          if (phase === 'start' && T.drawId === null) { T.drawId = t.identifier; this.beginDraw(t.clientX, t.clientY); if (!this.drawing) T.drawId = null; }
          else if (phase === 'move' && t.identifier === T.drawId) { this.pen.x = t.clientX; this.pen.y = t.clientY; this.pad.moveVirtual(t.clientX, t.clientY); }
          else if (phase === 'end' && t.identifier === T.drawId) { T.drawId = null; this.endDraw(); }
        }
        return;
      }
      for (const t of e.changedTouches) {
        if (phase === 'start') {
          if (t.clientX < global.innerWidth * 0.35 && T.moveId === null) { T.moveId = t.identifier; T.start = { x: t.clientX, y: t.clientY }; this.showStick(t.clientX, t.clientY); }
          else if (this.drawMode && T.drawId === null) { T.drawId = t.identifier; this.beginDraw(t.clientX, t.clientY); }
          else if (T.lookId === null) { T.lookId = t.identifier; T.last = { x: t.clientX, y: t.clientY }; }
        } else if (phase === 'move') {
          if (t.identifier === T.moveId) {
            const dx = t.clientX - T.start.x, dy = t.clientY - T.start.y, len = Math.hypot(dx, dy), max = 60, k = len > max ? max / len : 1;
            T.vec = { x: dx * k / max, y: dy * k / max }; this.moveStick(dx * k, dy * k);
          } else if (t.identifier === T.drawId) { this.pad.moveVirtual(t.clientX, t.clientY); }
          else if (t.identifier === T.lookId) { this.look((t.clientX - T.last.x) * 2.7, (t.clientY - T.last.y) * 2.7); T.last = { x: t.clientX, y: t.clientY }; }
        } else {
          if (t.identifier === T.moveId) { T.moveId = null; T.vec = { x: 0, y: 0 }; this.hideStick(); }
          if (t.identifier === T.drawId) { T.drawId = null; this.endDraw(); }
          if (t.identifier === T.lookId) T.lookId = null;
        }
      }
    },
    showStick(x, y) { const el = document.getElementById('stick'); if (!el) return; el.style.display = 'block'; el.style.left = (x - 50) + 'px'; el.style.top = (y - 50) + 'px'; this.moveStick(0, 0); },
    moveStick(dx, dy) { const k = document.getElementById('stick-knob'); if (k) k.style.transform = `translate(${dx}px, ${dy}px)`; },
    hideStick() { const el = document.getElementById('stick'); if (el) el.style.display = 'none'; },

    requestLock() {
      if (this.noLock || this.locked) return;
      try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { this.noLock = true; }); }
      catch (e) { this.noLock = true; }
    },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    look(dx, dy) {
      this.yaw -= dx * SENS;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * SENS));
    },
    /** True while the player controls the wizard (not in menus, not dead). */
    active() {
      const G = global.Game;
      return !!G && (G.mode === 'explore' || G.mode === 'duel') && !global.World.paused && !!global.Combat && global.Combat.playerAlive();
    },

    place(x, z, yaw) { this.pos.set(x, 0, z); this.yaw = yaw; this.pitch = 0; this.knock = null; },

    /* ------------------------- Draw → cast --------------------------- */
    allowedIds() {
      if (global.Combat && global.Combat.mode === 'duel') return SPELLS.filter(s => s.delivery !== 'toggle').map(s => s.id);
      if (!S.player) return [];
      const granted = S.grantedSpells().filter(id => !S.player.spells.includes(id));   // spells your staff lets you cast
      return granted.length ? S.player.spells.concat(granted) : S.player.spells;
    },
    canCast() {
      const C = global.Combat;
      return this.active() && C && !C.isDisabled(C.player);
    },
    beginDraw(x, y) {
      if (!this.canCast() || this.drawing) return;
      if (!this.pad.beginVirtual(x, y)) return;
      this.drawing = true; this.pen.x = x; this.pen.y = y;
      if (global.UI) global.UI.drawFocus(true);
    },
    endDraw() {
      if (!this.drawing) return;
      this.drawing = false;
      this.pad.endVirtual();       // → onStroke
      if (global.UI) global.UI.drawFocus(false);
    },
    cancelDraw() { if (this.drawing) { this.drawing = false; this.pad.cancel(); if (global.UI) global.UI.drawFocus(false); } },

    async onStroke(points) {
      if (!this.canCast()) return;
      const res = await SC.evaluateAsync(points, this.allowedIds());
      if (!res || !this.canCast()) return;
      this.handleResult(res);
    },

    handleResult(res) {
      const C = global.Combat, me = C.player, now = performance.now(), UI = global.UI;
      if (!res.success) {
        const lost = Math.min(me.mana, CAST_RULES.fizzleMana);
        me.mana -= lost;
        this.readyAt = Math.max(this.readyAt, now + CAST_RULES.recovery.Fizzle);
        this.flashWand(0xff6b6b, 0.4, 250);
        UI.castChip(res, { fizzle: true, lost });
        return;
      }
      const spell = res.spell;
      if (spell.delivery === 'toggle') { this.toggleWandlight(); UI.castChip(res, { toggle: true }); return; }
      const cd = this.cooldowns[spell.id] || 0;
      if (cd > now) { UI.castChip(res, { cooldown: Math.ceil((cd - now) / 1000) }); return; }
      const cost = SC.costFor(spell, res.quality);
      if (cost > me.mana) { UI.castChip(res, { noMana: true, cost }); return; }
      if (now < this.readyAt || this.pendingFire) {
        this.buffered = res;                           // one stroke is buffered and fires when ready (§10.5)
        UI.castChip(res, { cost, queued: true });
        return;
      }
      this.startCast(res);
    },

    startCast(res) {
      const C = global.Combat, me = C.player, spell = res.spell, now = performance.now();
      const cost = SC.costFor(spell, res.quality);
      if (cost > me.mana) { global.UI.castChip(res, { noMana: true, cost }); return; }
      me.mana -= cost;
      global.UI.castChip(res, { cost });
      if (S.player && C.mode === 'story') { S.player.stats.casts++; if (res.tier === 'Perfect') S.player.stats.perfects++; }
      const windup = CAST_RULES.windup[res.tier] || 170;
      this.flashWand(spell.color, { Perfect: 2.2, Great: 1.6, Good: 1.3 }[res.tier] || 1.3, { Perfect: 70, Great: 90, Good: 110 }[res.tier] + windup);
      this.orbColor = spell.color;
      this.pendingFire = { res, at: now + windup };
      this.readyAt = now + windup + (CAST_RULES.recovery[res.tier] || 160);
      if (spell.cooldown) this.cooldowns[spell.id] = now + spell.cooldown * 1000 * (C.mode === 'story' ? Math.max(0.4, 1 - S.bonus('cdr')) : 1);
    },

    fire(res) {
      const C = global.Combat;
      const dir = this.aimDir();
      C.castSpell(C.player, res.spell, res.quality, res.tier, this.wandTip.clone(), dir);
      this.recoil = { Perfect: 0.12, Great: 0.09, Good: 0.05 }[res.tier] || 0.05;
      this.recoilDur = { Perfect: 160, Great: 180, Good: 200 }[res.tier] || 200;
      if (res.tier === 'Perfect') this.kick = 0.014;
    },

    /** Forward view direction, nudged toward an enemy inside the aim-assist cone. */
    aimDir() {
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(global.World.camera.rotation);
      return global.Combat ? global.Combat.aimAssist(this.eyePos(), dir, MOBILE ? 8 : 4) : dir;
    },
    eyePos() { return this._tmp.set(this.pos.x, EYE, this.pos.z); },

    /* ---------------------------- Wandlight -------------------------- */
    toggleWandlight() {
      const learned = (global.Combat && global.Combat.mode === 'duel') || (S.player && S.player.spells.includes('wandlight'));
      if (!learned) { if (global.UI) global.UI.toast('You have not learned Wandlight yet.', 'info'); return; }
      this.wandlightOn = !this.wandlightOn;
      if (this.wandlightOn) this.flashWand(0xfff1d6, 1.2, 180);
      if (global.UI) global.UI.setWandlight(this.wandlightOn);
    },
    flashWand(color, mult, ms) { this.wlFlash = { t: performance.now(), mult, color, dur: ms }; },
    /** Equipped staff tints the wand (plain wood when none). */
    updateGearLook() {
      if (!this.wandMesh) return;
      const st = S.player && S.player.equipped && S.player.equipped.staff ? global.GameData.ITEMS[S.player.equipped.staff] : null;
      this.wandMesh.material.color.setHex(st && st.color ? st.color : 0x5a3a1e);
      this.wandMesh.material.emissive.setHex(st && st.color ? st.color : 0x000000);
      this.wandMesh.material.emissiveIntensity = st ? 0.35 : 0;
    },

    /* ----------------------------- Update ---------------------------- */
    update(dt, t) {
      const W = global.World, cam = W.camera, C = global.Combat;
      const now = performance.now();
      const act = this.active();
      // pending spell leaves the wand after its wind-up
      if (this.pendingFire && now >= this.pendingFire.at) {
        const pf = this.pendingFire; this.pendingFire = null;
        if (act) this.fire(pf.res);
      }
      if (this.buffered && !this.pendingFire && now >= this.readyAt && act) { const b = this.buffered; this.buffered = null; this.startCast(b); }
      if (!act && this.drawing && !(global.Game && global.Game.mode === 'lesson')) this.cancelDraw();

      // movement
      let fx = 0, fz = 0;
      if (act && !C.isRooted(C.player) && !C.stationary()) {      // arena battles: you stand your ground and only cast
        if (this.keys.KeyW || this.keys.ArrowUp) fz += 1;
        if (this.keys.KeyS || this.keys.ArrowDown) fz -= 1;
        if (this.keys.KeyA || this.keys.ArrowLeft) fx -= 1;
        if (this.keys.KeyD || this.keys.ArrowRight) fx += 1;
        fx += this.touch.vec.x; fz -= this.touch.vec.y;
      }
      const len = Math.hypot(fx, fz);
      this.moving = len > 0.1;
      if (this.moving && W.area) {
        let sp = (this.keys.ShiftLeft || this.keys.ShiftRight) && !this.drawing ? SPRINT : WALK;
        if (this.drawing) sp *= 0.6;                                 // strafe while casting
        sp *= C.speedMul(C.player) * Math.min(1, len);
        const sx = fx / len, sz = fz / len;
        const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw), rX = Math.cos(this.yaw), rZ = -Math.sin(this.yaw);
        this.pos.x += (fwdX * sz + rX * sx) * sp * dt;
        this.pos.z += (fwdZ * sz + rZ * sx) * sp * dt;
        this.bob += dt * sp * 2.6;
      }
      if (this.knock && C.stationary()) this.knock = null;
      if (this.knock && W.area) {                                     // knockback from gusts / dragons
        this.pos.x += this.knock.x * dt; this.pos.z += this.knock.z * dt;
        this.knock.x *= Math.pow(0.02, dt); this.knock.z *= Math.pow(0.02, dt);
        if (Math.hypot(this.knock.x, this.knock.z) < 0.2) this.knock = null;
      }
      if (W.area) W.collide(this.pos, 0.35);

      // camera
      const bobAmt = this.moving && act ? 0.025 * (S.player && S.player.headBob === 0 ? 0 : 1) : 0;
      const shake = C ? C.shakeOffset(now) : 0;
      const lev = C && C.player && C.player.statuses.levitate ? 1.3 : 0;      // Levitate lifts your view
      this.lift = (this.lift || 0) + (lev - (this.lift || 0)) * Math.min(1, dt * (lev ? 7 : 5));
      cam.position.set(this.pos.x, EYE + this.lift + Math.sin(this.bob) * bobAmt, this.pos.z);
      this.kick *= Math.pow(0.001, dt);
      cam.rotation.set(this.pitch + this.kick + shake * 0.6, this.yaw + shake * 0.4, 0);
      const fovTarget = 75 + this.fovPunch;
      this.fovPunch *= Math.pow(0.05, dt);
      if (Math.abs(cam.fov - fovTarget) > 0.05) { cam.fov += (fovTarget - cam.fov) * Math.min(1, dt * 8); cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld();

      // wand tip in world space (spells start here)
      this.wandTip.set(0.22, -0.2, -0.55).applyQuaternion(cam.quaternion).add(cam.position);

      // viewmodel: sway, walk bob, raise while drawing, recoil
      const vm = this.vm;
      if (vm) {
        const raise = this.drawing ? 0.06 : 0;
        this.recoil = Math.max(0, this.recoil - dt * (1000 / this.recoilDur) * 0.12);
        vm.position.set(this.vmBase.x + Math.sin(t * 1.2) * 0.004, this.vmBase.y + raise + (this.moving ? Math.sin(this.bob) * 0.012 : 0), this.vmBase.z + this.recoil * 0.5);
        vm.rotation.set(this.recoil * 1.2 + (this.drawing ? 0.15 : 0), 0, this.drawing ? (this.pen.x - global.innerWidth / 2) * -0.0004 : 0);
      }

      // Wandlight (§7): light at the tip, dims while drawing, flashes on cast
      const target = this.wandlightOn ? (this.drawing ? 0.55 : 1) : 0;
      this.wl += (target - this.wl) * Math.min(1, dt * (target > this.wl ? 10 : 14));
      const fl = this.wlFlash, fk = Math.max(0, 1 - (now - fl.t) / fl.dur);
      const flicker = 1 + Math.sin(t * 44) * 0.02 + Math.sin(t * 27) * 0.02;
      const L = W.wandLight;
      L.position.copy(this.wandTip);
      this._col.setHex(0xfff1d6);
      const guess = this.drawing && this.pad.guess && this.pad.guess.score > 0.6 ? spellById(this.pad.guess.id) : null;
      if (guess) this._col.lerp(this._col2.setHex(guess.color), 0.25);
      if (fk > 0) this._col.lerp(this._col2.setHex(fl.color), fk);
      L.color.copy(this._col);
      L.intensity = 6 * Math.max(this.wl, fk > 0 ? 0.6 : 0) * flicker * (1 + (fl.mult - 1) * fk);   // Wandlight / Lumos brightness
      this.vmLight.intensity = L.intensity * 0.2; this.vmLight.color.copy(this._col);
      this.vmLight.position.set(this.vmBase.x - 0.02, this.vmBase.y + 0.1, this.vmBase.z - 0.45);
      if (this.orb) {
        this.orb.material.color.copy(this._col);
        if (!this.wandlightOn && fk <= 0) this.orb.material.color.setHex(this.orbColor).multiplyScalar(0.6);
        this.halo.material.color.copy(this.orb.material.color);
        this.halo.scale.setScalar(0.05 + 0.08 * Math.max(this.wl, fk));
      }
      if (W.area && W.baseHemi !== undefined) {
        const boost = (W.area.dark ? 0.5 : 0.15) * this.wl;            // §7.3 hemisphere boost (much stronger in dark areas)
        W.hemi.intensity = W.baseHemi + boost;
        if (W.scene.fog) W.scene.fog.far = W.baseFog.far + 20 * this.wl * (W.area.dark ? 1 : 0);
      }
    },
  };

  global.Player = Player;
})(window);
