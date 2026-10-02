/* =====================================================================
 * combat.js — REAL-TIME COMBAT (story + practice duel vs CPU wizards)
 * ---------------------------------------------------------------------
 * No turns: every entity acts on its own clock.
 *   entities    player, enemies (incl. dragons), summons, duel bots
 *   projectiles bolts / enemy shots / bombs, simulated per frame with
 *               collision against entities and walls
 *   channels    beams and cones that tick damage over time
 *   zones       dragon telegraphs: red ground decal + eye-level curtain,
 *               then the attack fires (≥ 600 ms warning, ART_GUIDE §3.4.3)
 * Statuses last seconds; burn/poison deal damage every second.
 * Requires: THREE, data.js, state.js, quests.js, models.js, fx.js,
 *           drawing.js, world.js, player.js (ui.js for feedback)
 * ===================================================================== */
(function (global) {
  'use strict';
  const { SPELLS, STATUSES, ENEMIES, CAST_RULES, DUEL_RULES, PROGRESSION } = global.GameData;
  const S = global.GameState, Q = global.Quests, M = global.Models, FX = global.FX, SC = global.SpellCaster;
  let THREE;
  const rand = (a, b) => a + Math.random() * (b - a);
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  const ENEMY_CORE = 0x1a0a12, ENEMY_RIM = 0xff3b2f;
  const UI = () => global.UI;

  const Combat = {
    mode: null, player: null, entities: [], projectiles: [], channels: [], zones: [],
    hitStopUntil: 0, shakeStart: 0, shakeUntil: 0, shakeAmp: 0, lastHurt: 0, duel: null,
    defeated: new Set(),      // spawn keys beaten in an arena during this visit (cleared when you take a door)
    graceUntil: 0,            // enemies ignore you until then (after winning or fleeing a battle)
    arenaClearing: false,

    init() {
      THREE = global.THREE;
      this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3();
      this.geo = {
        circle: new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
        ring: new THREE.RingGeometry(0.93, 1, 40).rotateX(-Math.PI / 2),
        curtain: new THREE.CylinderGeometry(1, 1, 1.5, 40, 1, true).translate(0, 0.75, 0),
        cones: {},
      };
      const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64;
      const c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g; c.fillRect(0, 0, 4, 64);
      this.curtainTex = new THREE.CanvasTexture(cv);
    },
    coneGeo(angleDeg) {
      if (this.geo.cones[angleDeg]) return this.geo.cones[angleDeg];
      const half = angleDeg * Math.PI / 360, v = [], n = 20;
      for (let i = 0; i < n; i++) {
        const a0 = -half + (i / n) * 2 * half, a1 = -half + ((i + 1) / n) * 2 * half;
        v.push(0, 0, 0, Math.sin(a1), 0, Math.cos(a1), Math.sin(a0), 0, Math.cos(a0));
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      return (this.geo.cones[angleDeg] = geo);
    },

    /* --------------------------- helpers ----------------------------- */
    timeScale() { return performance.now() < this.hitStopUntil ? 0.05 : 1; },
    hitStop(ms) { if (ms > 0) this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + ms); },
    shake(amp, ms) {
      const scale = S.player && S.player.shake !== undefined ? S.player.shake : 1;
      if (amp * scale <= this.shakeAmp && performance.now() < this.shakeUntil) return;
      this.shakeAmp = amp * scale; this.shakeStart = performance.now(); this.shakeUntil = this.shakeStart + ms;
    },
    shakeOffset(now) {
      if (now >= this.shakeUntil) return 0;
      const k = 1 - (now - this.shakeStart) / (this.shakeUntil - this.shakeStart);
      return Math.sin(now * 0.19) * this.shakeAmp * k;
    },
    playerAlive() { return !!this.player && this.player.hp > 0; },
    isDisabled(e) { return !!(e && (e.statuses.stun || e.statuses.sleep)); },
    isRooted(e) { return !!(e && (e.statuses.stun || e.statuses.sleep || e.statuses.bound)); },
    speedMul(e) { return e && e.statuses.chilled ? 0.7 : 1; },
    chest(e, out) { return (out || this._v).set(e.pos.x, e.pos.y + e.h * 0.6, e.pos.z); },
    hostile(a, b) { return a.team !== b.team; },
    /** True during a story battle in the arena. Out in the world, enemies that spot you start a battle instead of fighting. */
    inArena() { return this.mode === 'story' && !!global.World.area && !!global.World.area.arena; },
    /** Arena battles and the practice duel: nobody walks — you and your foes stand your ground and only cast. */
    stationary() { return this.inArena() || this.mode === 'duel'; },
    /** World only: a hostile noticed (or was hit by) the player → teleport into a battle. */
    engage(e, force) {
      if (this.mode !== 'story' || this.inArena() || e.dead || !this.onEngage) return false;
      if (!force && performance.now() < this.graceUntil) return false;
      if (!this.pendingEngage) this.pendingEngage = e;      // handled at the end of update() (never mid-loop)
      return true;
    },

    /* ------------------------------ setup ---------------------------- */
    makePlayer(o) {
      return Object.assign({ id: 'player', kind: 'player', name: 'You', team: 0, pos: global.Player.pos, r: 0.4, h: 1.75,
        statuses: {}, power: 1, regen: 20, hp: 100, maxHp: 100, mana: 100, maxMana: 100, isPlayer: true }, o);
    },
    startStory() {
      this.reset();
      this.mode = 'story';
      const P = S.player;
      this.player = this.makePlayer({ hp: Math.max(1, Math.min(P.hp, S.maxHp())), maxHp: S.maxHp(), mana: Math.min(P.mana, S.maxMana()), maxMana: S.maxMana(),
        power: S.power(), regen: S.manaRegen() });
      this.entities = [this.player];
    },
    /** Level-ups and resting change the save; mirror them into the live player. */
    syncPlayerFromSave() {
      if (!this.player || this.mode !== 'story') return;
      const P = S.player;
      const wasHp = this.player.hp;
      this.player.maxHp = S.maxHp(); this.player.maxMana = S.maxMana(); this.player.power = S.power();
      this.player.regen = S.manaRegen();
      this.player.hp = Math.min(this.player.maxHp, Math.max(wasHp, P.hp)); this.player.mana = Math.min(this.player.maxMana, Math.max(this.player.mana, P.mana));
    },
    /** Equipment changed: update max HP/mana, power and regen (never heals you). */
    applyGear() {
      if (!this.player || this.mode !== 'story') return;
      const me = this.player;
      me.maxHp = S.maxHp(); me.maxMana = S.maxMana(); me.power = S.power(); me.regen = S.manaRegen();
      me.hp = Math.min(me.hp, me.maxHp); me.mana = Math.min(me.mana, me.maxMana);
    },
    saveToState() {
      if (this.mode !== 'story' || !this.player || !S.player) return;
      S.player.hp = Math.max(1, Math.round(this.player.hp)); S.player.mana = Math.round(this.player.mana);
    },
    reset() {
      this.clearArea();
      this.mode = null; this.player = null; this.entities = []; this.duel = null; this.defeated.clear(); this.graceUntil = 0;
      this.hitStopUntil = 0; this.shakeUntil = 0;
    },
    /** Called by World before an area is disposed (meshes are freed by World). */
    clearArea() {
      this.projectiles.forEach(p => this.releaseProjectile(p));
      this.projectiles = []; this.channels = []; this.zones.forEach(z => this.removeZone(z)); this.zones = [];
      this.entities = this.player ? [this.player] : [];
      this.arenaClearing = false; this.pendingEngage = null;
      if (UI()) UI().bossBar(null);
    },

    /** Spawn the area's enemies (quest monsters only while their quest needs them). */
    spawnAreaEnemies(def) {
      def.enemies.forEach((e, i) => {
        if (e.requiresQuest) {
          if (Q.stateOf(e.requiresQuest) !== 'active') return;
          const q = Q.get(e.requiresQuest), oi = q.objectives.findIndex(o => o.type === 'kill' && o.target === e.type);
          if (oi >= 0 && Q.progressOf(q, oi) >= q.objectives[oi].count) return;     // already slain
        }
        const key = `${global.World.areaId}:${i}`;
        if (this.defeated.has(key)) return;                                           // beaten in the arena this visit
        this.spawnEnemy(e.type, e.x, e.z, key);
      });
    },

    spawnEnemy(type, x, z, key) {
      const def = ENEMIES[type];
      const mesh = M.enemy(def.look);
      const scale = def.look.scale || 1;
      const ent = { id: key, kind: 'enemy', type, def, name: def.name, team: 1, mesh,
        pos: mesh.position, home: new THREE.Vector3(x, 0, z), r: def.dragon ? 1.4 * scale : 0.55 * scale, h: 1.6 * scale,
        hp: def.hp, maxHp: def.hp, statuses: {}, power: 1, flying: !!(def.dragon && def.flying),
        ai: { state: 'idle', cd: rand(0.5, 1.5), wait: rand(0, 2), wander: new THREE.Vector3(x, 0, z), windup: 0, move: null, alerted: false, phase: Math.random() * 6 },
        flashUntil: 0, rimU: { value: 0 } };
      mesh.position.set(x, ent.flying ? 5 : 0, z);
      this.prepareMaterials(ent);
      global.World.areaGroup.add(mesh);
      ent.plate = M.nameplate(`${def.name}  Lv${def.level}`, def.boss || def.dragon ? '#ff9a7a' : '#ffb0b0');
      const EL = global.GameData.ELEMENTS;
      ent.weakText = (def.weak || []).length ? 'Weak ' + def.weak.map(w => (EL[w] || ['?'])[0]).join('') : '';
      global.World.areaGroup.add(ent.plate);
      this.entities.push(ent);
      return ent;
    },

    /** Gather materials for hit flashes and add the Wandlight rim (ART_GUIDE §7.4). */
    prepareMaterials(ent) {
      ent.mats = [];
      ent.rimU = ent.rimU || { value: 0 };
      ent.mesh.traverse(o => {
        if (!o.material || !o.material.emissive) return;
        const m = o.material;
        ent.mats.push({ m, e: m.emissive.getHex(), i: m.emissiveIntensity });
        m.onBeforeCompile = sh => {
          sh.uniforms.wandRim = ent.rimU;
          sh.fragmentShader = 'uniform float wandRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.945, 0.84) * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0) * wandRim;');
        };
        m.customProgramCacheKey = () => 'wandrim';
      });
    },

    /* ------------------------------ update --------------------------- */
    update(dt, t) {
      if (!this.mode || !this.player) return;
      const now = performance.now();
      const P = this.player;
      // player regeneration: mana always; HP slowly after 5 s without damage (story)
      if (P.hp > 0) {
        P.mana = Math.min(P.maxMana, P.mana + P.regen * dt);
        if (this.mode === 'story' && now - this.lastHurt > 5000) P.hp = Math.min(P.maxHp, P.hp + PROGRESSION.hpRegen(S.player.level) * dt);
      }
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const e = this.entities[i];
        if (!e) continue;
        this.tickStatuses(e, dt);
        if (e.dead) { this.updateDeath(e, dt, i); continue; }
        if (e.kind === 'enemy') this.enemyAI(e, dt, t, now);
        else if (e.kind === 'summon') this.summonAI(e, dt, t, now);
        else if (e.kind === 'wizard') this.botAI(e, dt, t, now);
        if (e.mesh && e.mesh.userData.anim) e.mesh.userData.anim(t, e.moving);
        this.updateVisuals(e, now);
      }
      for (let i = this.projectiles.length - 1; i >= 0; i--) this.updateProjectile(this.projectiles[i], dt, i);
      for (let i = this.channels.length - 1; i >= 0; i--) { const c = this.channels[i]; c.t += dt; c.update(c, dt); if (c.t >= c.dur) this.channels.splice(i, 1); }
      for (let i = this.zones.length - 1; i >= 0; i--) this.updateZone(this.zones[i], now, i);
      if (P.hp <= 0 && !P.downed) { P.downed = true; if (this.onPlayerDeath) this.onPlayerDeath(); }
      if (this.mode === 'duel') this.checkDuelEnd();
      if (this.pendingEngage) {
        const pe = this.pendingEngage; this.pendingEngage = null;
        if (!pe.dead && P.hp > 0 && !this.inArena()) { this.onEngage(pe); return; }
      }
      if (this.inArena() && !this.arenaClearing && P.hp > 0 && !this.entities.some(e => e.kind === 'enemy' && !e.dead)) {
        this.arenaClearing = true;
        if (this.onArenaCleared) this.onArenaCleared();
      }
      this.updateBossBar();
    },

    tickStatuses(e, dt) {
      const st = e.statuses;
      for (const k in st) {
        const s = st[k];
        s.secs -= dt;
        if ((k === 'burn' || k === 'poison') && !e.dead) {
          s.acc = (s.acc || 0) + dt;
          if (s.acc >= 1) { s.acc -= 1; this.damage(e, s.value || 4, k === 'burn' ? 'fire' : 'poison', s.src, { dot: true }); }
        }
        if (s.secs <= 0 || (k === 'shield' && s.value <= 0)) delete st[k];
      }
    },

    updateVisuals(e, now) {
      if (e.mats) {
        const flash = now < e.flashUntil;
        if (flash !== e._flashing) {
          e._flashing = flash;
          e.mats.forEach(o => { if (flash) { o.m.emissive.setHex(0xffffff); o.m.emissiveIntensity = 0.9; } else { o.m.emissive.setHex(o.e); o.m.emissiveIntensity = o.i; } });
        }
      }
      if (e.rimU && global.Player) {
        const d = e.pos.distanceTo(global.Player.pos);
        e.rimU.value = global.Player.wandlightOn ? 0.6 * Math.max(0, Math.min(1, (22 - d) / 10)) : 0;
      }
      if (e.kind === 'enemy' && e.def.look.shape === 'wraith') {   // wraiths are easier to see in Wandlight
        const op = 0.6 + (e.rimU.value > 0 ? 0.25 : 0);
        e.mesh.traverse(o => { if (o.material && o.material.transparent) o.material.opacity = op; });
      }
      if (e.kind === 'wizard') {                       // CPU wizards visibly float while levitating
        const y = e.statuses.levitate ? 1.2 : 0;
        e.pos.y += (y - e.pos.y) * 0.15;
      }
      if (e.plate) {
        const top = (e.def ? (e.def.dragon ? 3.6 : 2.4) * (e.def.look.scale || 1) : 2.6) + 0.3;
        e.plate.position.set(e.pos.x, e.pos.y + top, e.pos.z);
        const icons = Object.keys(e.statuses).filter(k => STATUSES[k]).map(k => STATUSES[k].icon).slice(0, 4).join('');
        const line = [e.weakText, icons].filter(Boolean).join('   ');
        e.plate.userData.set(e.plateName || `${e.def.name}  Lv${e.def.level}`, e.hp / e.maxHp, line);
        const dist = global.Player ? e.pos.distanceTo(global.Player.pos) : 0;
        e.plate.visible = dist < 22;
        const k = Math.max(0.22, Math.min(1, dist / 9));          // shrink up close so the plate never fills the screen
        e.plate.scale.set(2.4 * k, 0.6 * k, 1);
      }
    },

    updateDeath(e, dt, i) {
      e.deathT = (e.deathT || 0) + dt;
      if (e.mesh) { const k = Math.max(0.01, 1 - e.deathT / 0.45); e.mesh.scale.setScalar((e.baseScale || 1) * k); e.mesh.position.y -= dt * 0.8; }
      if (e.plate) e.plate.visible = false;
      if (e.deathT >= 0.45) {
        if (e.mesh && e.mesh.parent) { e.mesh.parent.remove(e.mesh); global.World.disposeObject(e.mesh); }
        if (e.plate && e.plate.parent) { e.plate.parent.remove(e.plate); global.World.disposeObject(e.plate); }
        this.entities.splice(i, 1);
      }
    },

    /* ------------------------------ targets -------------------------- */
    nearestHostile(from, maxD) {
      let best = null, bd = maxD;
      for (const e of this.entities) {
        if (e === from || !this.hostile(from, e) || e.dead || e.hp <= 0) continue;
        const d = from.pos.distanceTo(e.pos);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    /** Bend an aim direction toward the closest enemy inside a small cone (soft aim assist, ART_GUIDE §6.1). */
    aimAssist(origin, dir, deg) {
      let best = null, bestDot = Math.cos(deg * Math.PI / 180);
      if (!this.player) return dir;
      for (const e of this.entities) {
        if (e === this.player || e.dead || !this.hostile(this.player, e)) continue;
        const c = this.chest(e, this._v2).sub(origin), d = c.length();
        if (d > 40 || d < 0.5) continue;
        const dot = c.dot(dir) / d;
        if (dot > bestDot) { bestDot = dot; best = c.clone().normalize(); }
      }
      return best || dir;
    },
    /** First hostile entity along a ray (within `pad` of it), for strikes and beams. */
    rayEntity(caster, origin, dir, range, pad = 0.8) {
      let best = null, bestT = range;
      for (const e of this.entities) {
        if (e === caster || e.dead || !this.hostile(caster, e)) continue;
        const c = this.chest(e, this._v2).sub(origin);
        const tproj = c.dot(dir);
        if (tproj < 0 || tproj > bestT) continue;
        const perp = c.addScaledVector(dir, -tproj).length();
        if (perp < e.r + pad) { best = e; bestT = tproj; }
      }
      return best ? { e: best, t: bestT } : null;
    },

    /* ============================ CASTING ============================= */
    /**
     * Cast a spell for any caster (player, bot, summon). origin/dir in world space.
     * q = quality 0..1, tier = 'Perfect' | 'Great' | 'Good'.
     */
    castSpell(caster, spell, q, tier, origin, dir) {
      const mult = SC.powerFor(q) * caster.power * (caster.statuses.fear ? 0.6 : 1);
      const ctx = { caster, spell, q, tier, mult, origin, dir: dir.clone().normalize(), crit: 0 };
      if (caster.isPlayer && this.mode === 'story') {           // equipment: staff/hat boosts
        ctx.mult *= 1 + S.boostFor(spell.id) + (spell.kind === 'heal' ? S.bonus('heal') : 0);
        ctx.crit = S.bonus('crit');
      }
      switch (spell.delivery) {
        case 'bolt': return this.launchBolt(ctx);
        case 'strike': return this.castStrike(ctx);
        case 'beam': return this.castBeam(ctx);
        case 'cone': return this.castCone(ctx);
        case 'bomb': return this.castBomb(ctx);
        case 'line': return this.castLine(ctx);
        case 'self': return this.castSelf(ctx);
        case 'summon': return this.castSummon(ctx);
        default: return null;
      }
    },

    hitPower(ctx, target) {
      const { spell, q, mult } = ctx;
      let dmg = spell.power * mult * rand(0.9, 1.1), note = '';
      const def = target.def;
      if (def && def.weak.includes(spell.element)) { dmg *= 1.5; note = 'WEAK!'; }
      else if (def && def.resist.includes(spell.element)) { dmg *= 0.5; note = 'Resisted'; }
      if (spell.element === 'lightning' && target.statuses.soaked) { dmg *= 1.5; note = 'CONDUCTED!'; }
      if (target.flying && target.statuses.bound) dmg *= 1.5;
      if (q >= 1 && Math.random() < CAST_RULES.perfectCrit + (ctx.crit || 0)) { dmg *= 1.5; note = 'CRITICAL!'; }
      return { dmg: Math.round(dmg), note };
    },
    /** Apply a spell's hit to one target (damage + status + feedback). */
    spellHit(ctx, target, scale = 1) {
      if (!target || target.dead) return;
      if (ctx.spell.power > 0) {
        const { dmg, note } = this.hitPower(ctx, target);
        if (note && scale >= 0.5) this.float(target, note, '#ffd84a', 1.0, 0.6);
        this.damage(target, Math.max(1, Math.round(dmg * scale)), ctx.spell.element, ctx.caster, { tier: ctx.tier, spell: ctx.spell });
      }
      if (target.dead) return;
      if (ctx.spell.element === 'water' && target.statuses.burn) delete target.statuses.burn;
      if (ctx.spell.status && (scale >= 1 || !target.statuses[ctx.spell.status.id])) this.applyStatus(target, ctx.spell.status, ctx.caster);
      if (ctx.spell.knockback && !(target.def && (target.def.dragon || target.def.boss))) this.knockback(target, ctx.dir, ctx.spell.knockback);
      if (target.ai) target.ai.alerted = true;
    },

    /* ------------------------------ bolts ---------------------------- */
    launchBolt(ctx) {
      const { spell, tier, caster } = ctx;
      const speed = spell.speed * (CAST_RULES.speedMul[tier] || 0.8);
      return this.makeProjectile({ ctx, team: caster.team, owner: caster, pos: ctx.origin.clone(), vel: ctx.dir.clone().multiplyScalar(speed),
        radius: spell.radius, ttl: 2.5, color: spell.color, size: { Perfect: 0.3, Great: 0.26, Good: 0.22 }[tier] || 0.24, friendly: true,
        scaleDist: spell.id === 'gust' ? 2.2 : spell.id === 'sleep' ? 1.8 : 1 });
    },
    makeProjectile(o) {
      const orb = FX.take(FX.orbs);
      const { core, halo } = orb.userData;
      if (o.friendly) { core.material.color.setHex(0xffffff); halo.material.color.setHex(o.color); }
      else { core.material.color.setHex(ENEMY_CORE); halo.material.color.setHex(ENEMY_RIM); }   // foe rule: dark core, red rim
      const s = o.size * (o.scaleDist || 1);
      core.scale.setScalar(s * 0.55); halo.scale.setScalar(s * 1.8);
      orb.position.copy(o.pos);
      const p = Object.assign({ orb, age: 0, trail: 0 }, o);
      this.projectiles.push(p);
      return p;
    },
    releaseProjectile(p) { if (p.orb) FX.give(p.orb); p.orb = null; },
    updateProjectile(p, dt, i) {
      if (!p.orb) { this.projectiles.splice(i, 1); return; }
      p.age += dt;
      if (p.charging) {          // spirit bomb grows in front of / above the caster
        const k = Math.min(1, p.age / p.chargeT);
        if (p.owner.isPlayer) p.pos.copy(global.Player.wandTip).addScaledVector(global.Player.aimDir(), 1.8).add(this._v.set(0, 0.8, 0));
        const sc = 0.1 + k * 0.9;
        p.orb.userData.core.scale.setScalar(sc); p.orb.userData.halo.scale.setScalar(sc * 1.4);
        p.orb.position.copy(p.pos);
        for (let j = 0; j < 2; j++) {                  // sparks stream inward from around the orb
          const ox = rand(-3, 3), oy = rand(-1.5, 2), oz = rand(-3, 3);
          FX.emit(p.pos.x + ox, p.pos.y + oy, p.pos.z + oz, -ox * 3, -oy * 3, -oz * 3, 0x8fb8ff, 0.12, 0.3);
        }
        if (k >= 1) { p.charging = false; p.vel = (p.owner.isPlayer ? global.Player.aimDir() : p.dir).clone().multiplyScalar(p.speed); p.age = 0; p.radius = 1.0; }
        return;
      }
      // move in small sub-steps so fast bolts never tunnel through targets or thin doors at low frame rates
      const steps = Math.max(1, Math.ceil(p.vel.length() * dt / 0.4)), sdt = dt / steps;
      for (let k = 0; k < steps; k++) {
        p.pos.addScaledVector(p.vel, sdt);
        for (const e of this.entities) {
          if (e === p.owner || e.dead || e.team === p.team || e.statuses.levitate) continue;   // floats over the shot
          const c = this.chest(e, this._v2);
          const rr = p.radius + e.r * (e.def && e.def.dragon ? 1.3 : 1);
          if (c.distanceToSquared(p.pos) < rr * rr) { this.projectiles.splice(i, 1); this.explode(p, e); return; }
        }
        if (global.World.blocked(p.pos.x, p.pos.y, p.pos.z, true)) { this.projectiles.splice(i, 1); this.explode(p, null); return; }
      }
      p.orb.position.copy(p.pos);
      p.trail += dt;
      if (p.trail > 0.025) { p.trail = 0; FX.emit(p.pos.x, p.pos.y, p.pos.z, rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3), p.friendly ? p.color : ENEMY_RIM, p.size * 0.7, 0.3); }
      if (p.age > p.ttl) { this.projectiles.splice(i, 1); this.explode(p, null); }
    },
    explode(p, target) {
      const pos = p.pos;
      this.releaseProjectile(p);
      if (p.ctx) {          // player / bot / summon spell
        const spell = p.ctx.spell;
        FX.burst(pos, spell.color, p.ctx.tier === 'Perfect' ? 60 : 40, 5, 0.8, 0.22);
        FX.ring(pos, spell.color, 1.6, 0.4);
        if (p.aoe) {
          FX.burst(pos, spell.color, 120, 9, 1.2, 0.3); FX.ring(pos, spell.color, p.aoe + 1, 0.9);
          for (const e of this.entities) if (!e.dead && this.hostile(p.owner, e) && e.pos.distanceTo(pos) < p.aoe + e.r) this.spellHit(p.ctx, e, 1 - 0.4 * Math.min(1, e.pos.distanceTo(pos) / p.aoe));
          this.shake(0.02, 300); this.hitStop(120);
        } else if (target) this.spellHit(p.ctx, target);
        global.World.spellHit(pos, spell.id);
        if (spell.id === 'poison') FX.burst(pos, 0x3e8f1e, 30, 1.2, 2.2, 0.5, 0.2);
      } else if (p.enemy) {  // enemy shot
        FX.burst(pos, ENEMY_RIM, 25, 3, 0.5, 0.18);
        if (target) this.enemyHit(p.enemy, p.move, target);
      }
    },

    /* ------------------------------ strikes -------------------------- */
    castStrike(ctx) {
      const { spell, caster, origin, dir, tier } = ctx;
      const hit = this.rayEntity(caster, origin, dir, spell.range, 1.2);
      const dist = hit ? hit.t : global.World.rayDistance(origin, dir, spell.range);
      const point = hit ? this.chest(hit.e, new THREE.Vector3()) : origin.clone().addScaledVector(dir, dist);
      const ground = point.clone(); ground.y = hit ? hit.e.pos.y : Math.max(0, point.y - 1.2);
      const delay = { Perfect: 120, Great: 160, Good: 200 }[tier] || 180;
      FX.burst(this._v.copy(point).add(this._v2.set(0, 1.2, 0)), spell.color, 14, 1.5, delay / 1000 + 0.1, 0.12, 0);   // spark crown
      setTimeout(() => {
        if (!this.mode) return;
        if (spell.id === 'dragon_bind') { FX.ring(ground, spell.color, 2.2, 0.5); FX.burst(point, spell.color, 50, 3); FX.burst(point, 0xe8243c, 20, 2); }
        else { FX.lightning(ground, spell.color); this.shake(0.012, 140); }
        const targetE = hit && hit.e;
        for (const e of this.entities) {
          if (e.dead || !this.hostile(caster, e)) continue;
          const d = Math.hypot(e.pos.x - ground.x, e.pos.z - ground.z);
          if (e === targetE || d < spell.aoe + e.r) this.spellHit(ctx, e);
        }
        global.World.spellHit(ground, spell.id);
      }, delay);
    },

    /* ------------------------- beams & cones ------------------------- */
    castBeam(ctx) {
      const { spell, caster } = ctx;
      FX.rise(ctx.origin, spell.color, 40, spell.charge + 0.2);
      const chargeMs = spell.charge * 1000 + ({ Perfect: 0, Great: 100, Good: 200 }[ctx.tier] || 0);
      setTimeout(() => {
        if (!this.mode || caster.dead || caster.hp <= 0) return;
        const origin = caster.isPlayer ? global.Player.wandTip.clone() : ctx.origin;
        const dir = caster.isPlayer ? global.Player.aimDir() : ctx.dir;
        const dist = global.World.rayDistance(origin, dir, spell.range);
        const end = origin.clone().addScaledVector(dir, dist);
        FX.beam(origin, end, spell.color, 0.35, spell.hold + 0.3);
        this.shake(0.01, spell.hold * 1000);
        const per = spell.hold / spell.ticks;
        this.channels.push({ t: 0, dur: spell.hold, next: 0, update: (c) => {
          if (c.t < c.next) return;
          c.next += per;
          for (const e of this.entities) {
            if (e.dead || !this.hostile(caster, e)) continue;
            const rel = this.chest(e, this._v2).sub(origin), tproj = rel.dot(dir);
            if (tproj < 0 || tproj > dist + 1) continue;
            if (rel.addScaledVector(dir, -tproj).length() < 0.9 + e.r) this.spellHit(ctx, e, 1 / spell.ticks);
          }
        } });
      }, chargeMs);
    },
    castCone(ctx) {
      const { spell, caster } = ctx;
      const half = spell.angle * Math.PI / 360;
      const per = spell.hold / spell.ticks;
      const range = this.stationary() ? Math.max(spell.range, 24) : spell.range;   // arena: nobody can walk closer, so the cone reaches across
      const sp = 9 * range / spell.range;
      let lastFx = -1;
      this.channels.push({ t: 0, dur: spell.hold, next: 0, update: (c) => {
        if (caster.dead || caster.hp <= 0) return;
        const origin = caster.isPlayer ? global.Player.wandTip : ctx.origin;
        const dir = caster.isPlayer ? global.Player.aimDir() : ctx.dir;
        if (c.t - lastFx > 0.05) {     // puffs follow your aim and start 0.8 m ahead (§6.1)
          lastFx = c.t;
          const o = this._v3.copy(origin).addScaledVector(dir, 0.8);
          for (let i = 0; i < FX.n(10); i++) FX.emit(o.x, o.y, o.z, dir.x * sp + rand(-1.5, 1.5), dir.y * sp + rand(-1, 1), dir.z * sp + rand(-1.5, 1.5), spell.color, 0.45, 0.8, 0, 1.33, 0, 0x3a2a20);
        }
        if (c.t < c.next) return;
        c.next += per;
        for (const e of this.entities) {
          if (e.dead || !this.hostile(caster, e)) continue;
          const rel = this.chest(e, this._v2).sub(origin), d = rel.length();
          if (d > range + e.r) continue;
          if (rel.dot(dir) / (d || 1) > Math.cos(half) || d < e.r + 0.5) this.spellHit(ctx, e, 1 / spell.ticks);
        }
      } });
    },
    castBomb(ctx) {
      const { spell, caster } = ctx;
      const chargeT = spell.charge + ({ Perfect: 0, Great: 0.1, Good: 0.2 }[ctx.tier] || 0);
      const p = this.makeProjectile({ ctx, team: caster.team, owner: caster, pos: ctx.origin.clone().add(new THREE.Vector3(0, 0.9, 0)), vel: new THREE.Vector3(),
        radius: 0.5, ttl: 3, color: spell.color, size: 1, friendly: true, aoe: spell.aoe, charging: true, chargeT, dir: ctx.dir, speed: spell.speed });
      p.orb.userData.core.material.color.setHex(spell.color); p.orb.userData.halo.material.color.setHex(0xffffff);
    },
    castLine(ctx) {
      const { spell, caster, origin, dir } = ctx;
      const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      const start = origin.clone();
      this.shake(0.03, 1400);
      if (UI()) UI().screenFlash('#e8243c', 0.25, 300);
      const hitSet = new Set();
      this.channels.push({ t: 0, dur: 1.3, update: (c) => {
        const k = Math.min(1, c.t / 1.3), along = k * spell.range;
        const p = this._v.copy(start).addScaledVector(flat, along); p.y = 3 + Math.sin(k * Math.PI) * 2;
        for (let i = 0; i < FX.n(14); i++) FX.emit(p.x + rand(-2, 2), p.y + rand(-1, 1), p.z + rand(-2, 2), rand(-1, 1), -4, rand(-1, 1), i % 3 ? spell.color : 0xffffff, 0.8, 0.9, -3, 0.8);
        for (const e of this.entities) {
          if (e.dead || hitSet.has(e) || !this.hostile(caster, e)) continue;
          const rel = this._v2.copy(e.pos).sub(start); rel.y = 0;
          const tproj = rel.dot(flat);
          if (tproj < 0 || tproj > along) continue;
          if (rel.addScaledVector(flat, -tproj).length() < spell.width + e.r) { hitSet.add(e); this.spellHit(ctx, e); FX.burst(this.chest(e, this._v3), 0xffd36b, 60, 6); this.hitStop(140); }
        }
      } });
    },

    /* ----------------------------- self ------------------------------ */
    castSelf(ctx) {
      const { spell, caster, mult } = ctx;
      const feet = new THREE.Vector3(caster.pos.x, caster.pos.y + 0.2, caster.pos.z);
      if (spell.kind === 'heal') {
        const amt = Math.round(spell.power * mult);
        caster.hp = Math.min(caster.maxHp, caster.hp + amt);
        delete caster.statuses.poison; delete caster.statuses.burn;
        FX.rise(feet, spell.color, 60, 1.2);
        this.float(caster, `+${amt}`, '#3dff8e', 1.2);
        if (caster.isPlayer && UI()) UI().screenFlash('#3dff8e', 0.18, 300);
      } else if (spell.id === 'levitate') {
        caster.statuses.levitate = { secs: spell.duration };
        FX.ring(feet, spell.color, 2, 0.5); FX.rise(feet, spell.color, 40, 1.2);
        this.float(caster, 'LEVITATE', '#bfe6ff', 1);
      } else if (spell.id === 'shield') {
        const sb = caster.isPlayer && this.mode === 'story' ? 1 + S.bonus('shield') : 1;
        caster.statuses.shield = { secs: spell.duration, value: Math.round(spell.power * mult * sb) };
        FX.ring(feet, spell.color, 2.5, 0.5); FX.rise(feet, spell.color, 30, 0.8);
        this.float(caster, `SHIELD ${caster.statuses.shield.value}`, '#2ee6c3', 1);
      } else if (spell.id === 'dragon_ward') {
        caster.statuses.ward = { secs: spell.duration };
        FX.ring(feet, spell.color, 2.5, 0.5); FX.ring(feet, 0x2ee6c3, 1.8, 0.6);
        this.float(caster, 'DRAGON WARD', '#e8243c', 1);
      }
    },

    /* ---------------------------- summons ---------------------------- */
    castSummon(ctx) {
      const { spell, caster, mult } = ctx;
      const isWyrm = spell.id === 'summon_wyrmling';
      const mesh = isWyrm ? M.dragon({ body: 0xc23a4a, belly: 0xf2c08a, membrane: 0x8a2a3a, glow: 0x4af2ff, scale: 0.42, legs: 4 })
                          : M.wizard({ ghost: true, robe: 0xdce9ff, hat: 0x8fa6c8, trim: 0xffffff });
      if (!isWyrm) mesh.scale.setScalar(0.75);
      const yaw = caster.isPlayer ? global.Player.yaw : (caster.mesh ? caster.mesh.rotation.y + Math.PI : 0);
      const pos = caster.pos.clone().add(new THREE.Vector3(Math.cos(yaw) * 1.4, 0, -Math.sin(yaw) * 1.4));
      mesh.position.copy(pos);
      global.World.areaGroup.add(mesh);
      FX.burst(new THREE.Vector3(pos.x, 1, pos.z), spell.color, 50, 2);
      this.entities.push({ id: 'summon' + Math.random(), kind: 'summon', name: isWyrm ? 'Wyrmling' : 'Ghost', team: caster.team, owner: caster,
        mesh, pos: mesh.position, r: 0.45, h: isWyrm ? 1.0 : 1.4, hp: 80, maxHp: 80, statuses: {}, power: mult,
        life: spell.duration, every: spell.every, cd: 0.4, spell, wyrm: isWyrm, baseScale: mesh.scale.x });
    },
    summonAI(s, dt, t) {
      s.life -= dt;
      if (s.life <= 0 || s.owner.dead || s.owner.hp <= 0) { s.dead = true; s.deathT = 0; s.baseScale = s.mesh.scale.x; return; }
      const o = s.owner;
      const yaw = o.isPlayer ? global.Player.yaw : (o.mesh ? o.mesh.rotation.y + Math.PI : 0);
      const want = this._v.set(o.pos.x + Math.cos(yaw) * 1.4 - Math.sin(yaw) * 0.8, 0, o.pos.z - Math.sin(yaw) * 1.4 - Math.cos(yaw) * 0.8);
      s.moving = s.pos.distanceTo(want) > 0.3;
      if (s.moving) { s.pos.x += (want.x - s.pos.x) * Math.min(1, dt * 4); s.pos.z += (want.z - s.pos.z) * Math.min(1, dt * 4); }
      s.pos.y = s.wyrm ? 0 : 0.3 + Math.sin(t * 2) * 0.12;
      const target = this.nearestHostile(s, 18);
      if (target) s.mesh.rotation.y = Math.atan2(target.pos.x - s.pos.x, target.pos.z - s.pos.z);
      s.cd -= dt;
      if (target && s.cd <= 0) {
        s.cd = s.every;
        const origin = this.chest(s, new THREE.Vector3());
        const dir = this.chest(target, new THREE.Vector3()).sub(origin).normalize();
        const fake = s.wyrm ? { id: 'wyrm_fire', power: s.spell.power, element: 'fire', color: 0xff7a2a, status: { id: 'burn', chance: 0.3, secs: 3, value: 4 } }
                            : { id: 'ghost_bolt', power: s.spell.power, element: 'spirit', color: 0xdce9ff };
        const ctx = { caster: s, spell: fake, q: 0.8, tier: 'Great', mult: s.power, origin, dir };
        this.makeProjectile({ ctx, team: s.team, owner: s, pos: origin, vel: dir.clone().multiplyScalar(30), radius: 0.4, ttl: 1.5, color: fake.color, size: 0.2, friendly: true });
      }
    },

    /* --------------------------- damage ------------------------------ */
    damage(target, amount, element, source, opts = {}) {
      if (!target || target.dead || target.hp <= 0) return;
      if (this.mode === 'story' && !this.inArena() && target.kind === 'enemy') {   // out in the world nobody fights: walk up and press E
        if (source && source.team === 0 && !opts.dot && performance.now() - (target._hintAt || 0) > 1500) { target._hintAt = performance.now(); this.float(target, 'Press E to fight', '#ffd84a', 0.8, 0.6); }
        return;
      }
      const st = target.statuses;
      if (target.isPlayer && source && source.def && source.def.training) amount = Math.min(amount, Math.max(0, target.hp - 1));   // the dummy never knocks you out
      if (st.levitate && source && source !== target && !opts.dot) { this.float(target, 'DODGED', '#bfe6ff', 0.9, 0.4); return; }
      if (st.ward && source) {
        if (source.def && source.def.dragon) amount *= 0.2; else if (element === 'fire') amount *= 0.5;
      }
      if (st.shield && !opts.dot) {
        const absorbed = Math.min(st.shield.value, amount);
        st.shield.value -= absorbed; amount -= absorbed;
        if (absorbed > 0) this.float(target, `🛡${Math.round(absorbed)}`, '#2ee6c3', 0.8, 0.3);
        if (st.shield.value <= 0) { delete st.shield; if (target.isPlayer) this.float(target, 'Shield broken!', '#2ee6c3', 0.9); }
      }
      amount = Math.round(amount);
      if (amount <= 0) return;
      target.hp = Math.max(0, target.hp - amount);
      target.flashUntil = performance.now() + 60;
      if (st.sleep && !opts.dot) delete st.sleep;
      const big = opts.tier === 'Perfect' ? 1.4 : opts.tier === 'Great' ? 1.15 : 1;
      if (!target.isPlayer) this.float(target, `-${amount}`, opts.dot ? '#ffa060' : '#ffffff', big);
      if (target.ai) { target.ai.alerted = true; }
      if (target.isPlayer) {
        this.lastHurt = performance.now();
        if (source && source.pos && UI()) UI().damageDirection(source.pos);
        if (UI()) UI().playerHurt(amount);
        if (!opts.dot) this.shake(0.012, 140);
      } else if (opts.tier && source === this.player) {
        this.hitStop(CAST_RULES.hitStop[opts.tier] || 0);
        if (opts.tier === 'Perfect') this.shake(0.014, 140); else if (opts.tier === 'Great') this.shake(0.007, 100);
      }
      if (target.hp > 0 && target.ai && target.ai.state === 'windup' && source && source.team === 0 && (opts.tier === 'Perfect' || opts.tier === 'Great')
          && !(target.def && (target.def.boss || target.def.dragon))) {
        this.cancelWindup(target); target.ai.cd = Math.max(target.ai.cd, (target.def ? target.def.cd : 1.5) * 0.6);
        this.float(target, 'INTERRUPTED!', '#9fe8ff', 1.0, 0.9);
      }
      if (target.hp <= 0) this.kill(target, source);
    },
    kill(e, source) {
      if (e.isPlayer) return;           // handled by update → onPlayerDeath
      e.dead = true; e.deathT = 0; e.baseScale = e.mesh ? e.mesh.scale.x : 1;
      FX.burst(this.chest(e, this._v), e.def ? e.def.look.glow || 0xffffff : (e.color || 0xffffff), 40, 4);
      if (e.kind === 'enemy' && this.mode === 'story') {
        this.saveToState();               // live HP/mana into the save first, so the sync below never 'heals' to an old value
        S.player.stats.kills++;
        Q.onKill(e.type);
        if (e.def.xp) S.addXp(e.def.xp);
        const gold = e.def.gold !== undefined ? e.def.gold : Math.round(e.def.xp * 0.6 + Math.random() * e.def.level * 4);
        if (gold > 0) { S.addGold(gold); FX.burst(this.chest(e, new THREE.Vector3()), 0xffd84a, 25, 3, 0.6, 0.15); }
        if (e.def.training && UI()) UI().toast('Training complete! The dummy springs back up — come back any time.', 'quest');
        this.syncPlayerFromSave();
        global.World.refreshPickups();
        if (e.def.dragon || e.def.boss) { this.shake(0.03, 600); if (UI()) UI().toast(`${e.def.name} is defeated!`, 'quest'); }
        this.rollLoot(e);
      }
      if (e.kind === 'wizard' && UI()) UI().toast(`${e.name} is out!`, 'info');
    },
    /** Drink a potion (hotkeys 1 / 2, or from the Inventory). Story mode only. */
    usePotion(itemId) {
      const it = global.GameData.ITEMS[itemId], me = this.player, now = performance.now();
      if (!it || !it.use || this.mode !== 'story' || !me || me.hp <= 0) return false;
      if (!S.owns(itemId)) { if (UI()) UI().toast(`No ${it.name} left. Tilly sells them in the Great Hall.`, 'info'); return false; }
      if (now < (this.potionReadyAt || 0)) return false;
      this.potionReadyAt = now + 800;
      S.addItem(itemId, -1);
      const feet = new THREE.Vector3(me.pos.x, 0.2, me.pos.z);
      if (it.use.hp) { me.hp = Math.min(me.maxHp, me.hp + it.use.hp); this.float(me, `+${it.use.hp} HP`, '#3dff8e', 1); FX.rise(feet, 0x3dff8e, 40, 1); }
      if (it.use.mana) { me.mana = Math.min(me.maxMana, me.mana + it.use.mana); this.float(me, `+${it.use.mana} MP`, '#4a9bff', 1, 0.3); FX.rise(feet, 0x4a9bff, 40, 1); }
      S.Events.emit('quests'); S.save();
      return true;
    },
    /** Loot from DROPS (data.js). Items you already own never drop again. */
    rollLoot(e) {
      const table = (global.GameData.DROPS[e.type] || []).filter(d => !S.owns(d.item));
      for (const d of table) {
        if (Math.random() >= d.chance) continue;
        const it = global.GameData.ITEMS[d.item];
        S.addItem(d.item);
        FX.burst(this.chest(e, new THREE.Vector3()), 0xffd84a, 60, 5, 0.9, 0.3);
        S.Events.emit('toast', { text: `Loot: ${it.icon} ${it.name}! Press I to equip.`, kind: 'loot' });
        S.Events.emit('quests');
        S.save();
        return d.item;
      }
      return null;
    },
    applyStatus(target, s, source) {
      if (target.def && target.def.immune.includes(s.id)) { this.float(target, 'IMMUNE', '#aaaaaa', 0.8, 0.5); return; }
      if (Math.random() > (s.chance === undefined ? 0.9 : s.chance)) return;
      target.statuses[s.id] = { secs: s.secs, value: s.value || 0, src: source };
      this.float(target, STATUSES[s.id].name.toUpperCase(), hex(STATUSES[s.id].color), 0.8, 0.7);
      if (s.id === 'bound' && target.flying) { target.groundedUntil = performance.now() + s.secs * 1000; this.shake(0.02, 300); }
    },
    knockback(target, dir, dist) {
      if (this.stationary()) return;      // everyone holds their position in the arena
      if (target.isPlayer) { global.Player.knock = { x: dir.x * dist * 3, z: dir.z * dist * 3 }; return; }
      target.pos.x += dir.x * dist; target.pos.z += dir.z * dist;
      global.World.collide(target.pos, Math.min(target.r, 1.2));
    },
    float(target, text, color, size = 1, dy = 0) {
      if (UI()) UI().floatText(this.chest(target, new THREE.Vector3()).add(this._v.set(0, 0.5 + dy, 0)), text, color, size);
    },

    /* ============================ ENEMY AI ============================ */
    enemyAI(e, dt, t, now) {
      const def = e.def, ai = e.ai, st = e.statuses;
      if (def.dragon) return this.dragonAI(e, dt, t, now);
      e.moving = false;
      if (st.stun || st.sleep || st.bound) { if (ai.state === 'windup') this.cancelWindup(e); return; }
      const target = this.nearestHostile(e, ai.alerted ? 30 : 14);
      const homeD = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
      if (!target || homeD > 30) {
        // wander near home, or walk back after a long chase
        if (homeD > 30) ai.alerted = false;
        if (ai.state === 'windup') this.cancelWindup(e);
        const goal = homeD > 30 ? e.home : ai.wander;
        if (Math.hypot(e.pos.x - goal.x, e.pos.z - goal.z) < 0.4) { ai.wait -= dt; if (ai.wait <= 0) { ai.wait = rand(1, 3); ai.wander.set(e.home.x + rand(-3.5, 3.5), 0, e.home.z + rand(-3.5, 3.5)); } }
        else this.moveToward(e, goal, def.speed * 0.5, dt);
        if (homeD > 30) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1 * dt);
        return;
      }
      if (this.mode === 'story' && !this.inArena()) {        // out in the world: they just watch you (press E near one to fight)
        this.face(e, target.pos);
        return;
      }
      ai.alerted = true;
      const tpos = target.pos, d = Math.hypot(tpos.x - e.pos.x, tpos.z - e.pos.z);
      const still = this.stationary();
      if (st.fear) { if (ai.state === 'windup') this.cancelWindup(e); if (!still) this.moveAway(e, tpos, def.speed, dt); return; }
      this.face(e, tpos);
      ai.cd -= dt;
      if (ai.state === 'windup') {
        ai.windup -= dt;
        e.mesh.scale.setScalar((def.look.scale || 1) * (1 + 0.08 * Math.abs(Math.sin(ai.windup * 30))));
        if (ai.windup <= 0) {
          this.cancelWindup(e);
          ai.cd = def.cd * rand(0.85, 1.15);
          this.executeMove(e, ai.move, target);
        }
        return;
      }
      const ranged = !!def.proj || still;          // in the arena every foe attacks from where it stands
      if ((d <= def.range || still) && ai.cd <= 0) {
        const move = this.pickMove(e);
        ai.move = move; ai.state = 'windup'; ai.windup = def.tell / 1000;
        if (!ranged && move.type !== 'heal' && move.type !== 'shield') {   // melee tell: red ring at reach
          const ring = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial({ color: ENEMY_RIM, transparent: true, opacity: 0.6, depthWrite: false }));
          ring.position.set(e.pos.x, 0.03, e.pos.z); ring.scale.setScalar(def.range + 0.4);
          global.World.areaGroup.add(ring); ai.ring = ring;
        }
        return;
      }
      if (still) return;
      const want = ranged ? def.range * 0.7 : def.range * 0.8;
      if (d > want) this.moveToward(e, tpos, def.speed, dt);
      else if (ranged && d < def.range * 0.4) this.moveAway(e, tpos, def.speed * 0.6, dt);
      this.face(e, tpos);
    },
    cancelWindup(e) {
      const ai = e.ai;
      ai.state = 'chase';
      e.mesh.scale.setScalar(e.def.look.scale || 1);
      if (ai.ring) { if (ai.ring.parent) ai.ring.parent.remove(ai.ring); ai.ring.material.dispose(); ai.ring = null; }
    },
    pickMove(e) {
      let moves = e.def.moves.slice();
      if (e.hp > e.maxHp * 0.5) moves = moves.filter(m => m.type !== 'heal');
      if (e.statuses.shield) moves = moves.filter(m => m.type !== 'shield');
      if (!moves.length) moves = e.def.moves.filter(m => m.type === 'attack');
      const total = moves.reduce((a, m) => a + m.weight, 0);
      let r = Math.random() * total;
      for (const m of moves) { r -= m.weight; if (r <= 0) return m; }
      return moves[0];
    },
    executeMove(e, move, target) {
      const def = e.def;
      if (move.type === 'heal') { e.hp = Math.min(e.maxHp, e.hp + move.power); FX.rise(new THREE.Vector3(e.pos.x, 0.2, e.pos.z), 0x3dff8e, 30, 1); this.float(e, `+${move.power}`, '#3dff8e'); return; }
      if (move.type === 'shield') { e.statuses.shield = { secs: 6, value: move.power }; FX.ring(new THREE.Vector3(e.pos.x, 0.2, e.pos.z), 0x2ee6c3, 2, 0.5); return; }
      if (target.dead || target.hp <= 0) return;
      if (def.proj || this.stationary()) {        // ranged (or any foe in the arena): dark-core projectile
        const origin = this.chest(e, new THREE.Vector3());
        const aim = this.chest(target, new THREE.Vector3());
        if (target.isPlayer && global.Player.moving) aim.addScaledVector(this.playerVelocity(), origin.distanceTo(aim) / def.proj * 0.5);
        if (Math.random() < (e.statuses.blind ? 0.35 : 0)) aim.add(this._v.set(rand(-2.5, 2.5), rand(-1, 1), rand(-2.5, 2.5)));
        const vel = aim.sub(origin).normalize().multiplyScalar(def.proj || 13);
        this.makeProjectile({ team: e.team, owner: e, enemy: e, move, pos: origin, vel, radius: 0.35, ttl: 3, color: def.look.glow, size: 0.22, friendly: false });
        return;
      }
      const d = Math.hypot(target.pos.x - e.pos.x, target.pos.z - e.pos.z);
      if (d > def.range + 0.7) { this.float(target, 'MISS', '#cccccc', 0.8); return; }   // you stepped out of reach
      if (Math.random() > def.acc - (e.statuses.blind ? 0.35 : 0)) { this.float(target, 'MISS', '#cccccc', 0.8); return; }
      FX.burst(this.chest(target, this._v), def.look.glow, 20, 3);
      this.enemyHit(e, move, target);
    },
    enemyHit(e, move, target) {
      if (target.dead || target.hp <= 0) return;
      const def = e.def;
      const fear = e.statuses.fear ? 0.6 : 1;
      if (move.type === 'attack' || move.type === 'drain' || move.power) {
        this.damage(target, rand(def.atk[0], def.atk[1]) * (move.power || 1) * fear, def.element || 'physical', e);
      }
      if (move.type === 'drain' && target.mana !== undefined) { const m = Math.min(target.mana, move.mana); target.mana -= m; this.float(target, `-${Math.round(m)} MP`, '#4a9bff', 0.8, 0.4); }
      if (move.type === 'status') this.applyStatus(target, { id: move.status, secs: move.secs, value: move.value, chance: move.chance === undefined ? 0.85 : move.chance }, e);
    },
    playerVelocity() {
      const P = global.Player;
      if (!P.moving) return this._v3.set(0, 0, 0);
      return this._v3.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)).multiplyScalar(4.2);
    },
    moveToward(e, goal, speed, dt) {
      const vx = goal.x - e.pos.x, vz = goal.z - e.pos.z, d = Math.hypot(vx, vz);
      if (d < 0.05) return;
      const step = Math.min(d, speed * this.speedMul(e) * dt) / d;
      e.pos.x += vx * step; e.pos.z += vz * step; e.moving = true;
      e.mesh.rotation.y = Math.atan2(vx, vz);
      global.World.collide(e.pos, Math.min(e.r, 1.2));
    },
    moveAway(e, from, speed, dt) {
      this.moveToward(e, this._v2.set(e.pos.x * 2 - from.x, 0, e.pos.z * 2 - from.z), speed, dt);
    },
    face(e, p) { e.mesh.rotation.y = Math.atan2(p.x - e.pos.x, p.z - e.pos.z); },

    /* ============================ DRAGONS ============================= */
    dragonAI(e, dt, t, now) {
      const def = e.def, ai = e.ai, st = e.statuses;
      e.moving = false;
      if (e.flying) {          // hover high unless Dragon Bind drags it down
        const grounded = e.groundedUntil && now < e.groundedUntil;
        const targetY = grounded ? 0 : 5 + Math.sin(t * 0.8);
        e.pos.y += (targetY - e.pos.y) * Math.min(1, dt * (grounded ? 6 : 1.5));
        e.mesh.userData.flapSpeed = grounded ? 0.4 : 2;
      }
      if (st.stun || st.sleep || st.bound) return;
      const target = this.nearestHostile(e, ai.alerted ? 40 : 22);
      if (!target) { if (Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z) > 1) this.moveToward(e, e.home, def.speed * 0.6, dt); return; }
      if (this.mode === 'story' && !this.inArena()) { this.face(e, target.pos); return; }   // fights start only when you press E
      if (!ai.alerted) { ai.alerted = true; if (target.isPlayer) { global.Player.fovPunch = 5; this.shake(0.02, 250); if (UI()) UI().toast(`${def.name} attacks!`, 'quest'); } }
      const d = Math.hypot(target.pos.x - e.pos.x, target.pos.z - e.pos.z);
      ai.cd -= dt;
      if (ai.busy) { this.face(e, target.pos); return; }
      const still = this.stationary();
      if (still) { /* hold position */ }
      else if (e.flying && !(e.groundedUntil && now < e.groundedUntil)) {        // circle the target from the air
        ai.phase += dt * 0.4;
        this.moveToward(e, this._v2.set(target.pos.x + Math.cos(ai.phase) * 11, 0, target.pos.z + Math.sin(ai.phase) * 11), def.speed, dt);
      } else if (d > def.range * 0.75) this.moveToward(e, target.pos, def.speed, dt);
      this.face(e, target.pos);
      if (ai.cd > 0) return;
      const opts = still ? def.abilities.filter(a => a === 'breath' || a === 'lightning' || a === 'meteors')
        : def.abilities.filter(a => (a === 'tail' ? d < 6 : a === 'gust' ? d < 7.5 : a === 'breath' ? d < def.range + 2 : true));
      if (!opts.length) return;
      ai.cd = def.cd * rand(0.9, 1.2);
      this.dragonAbility(e, opts[Math.floor(Math.random() * opts.length)], target, now);
    },
    dragonAbility(e, ab, target, now) {
      const def = e.def, tell = def.tells[ab] || 800, ai = e.ai;
      const s = def.look.scale || 1;
      if (ab === 'breath') {
        ai.busy = true;
        const dirC = new THREE.Vector3(target.pos.x - e.pos.x, 0, target.pos.z - e.pos.z).normalize();
        const origin = e.pos.clone(); origin.y = 0;
        const throat = e.mesh.userData.throat;
        const reach = Math.max(def.range + 1.5, Math.hypot(target.pos.x - e.pos.x, target.pos.z - e.pos.z) + 2);   // arena: the flame reaches you
        this.addZone({ shape: 'cone', pos: origin, dir: dirC, radius: reach, angle: 38, tell, start: now,
          onTick: k => { if (throat) throat.material.emissiveIntensity = 4 * k; },
          onFire: () => {
            if (throat) throat.material.emissiveIntensity = 0;
            if (e.dead) { ai.busy = false; return; }
            const mouth = new THREE.Vector3(e.pos.x, e.pos.y + 2.1 * s, e.pos.z).addScaledVector(dirC, 2.4 * s);
            const end = mouth.clone().addScaledVector(dirC, reach - 0.5); end.y = 0.8;
            FX.stream(mouth, end, def.look.glow, 1.0);
            let ticks = 0;
            this.channels.push({ t: 0, dur: 1.0, next: 0, update: (c) => {
              if (c.t < c.next) return; c.next += 0.2; ticks++;
              for (const x of this.entities) {
                if (x.dead || !this.hostile(e, x)) continue;
                const rx = x.pos.x - origin.x, rz = x.pos.z - origin.z, dd = Math.hypot(rx, rz);
                if (dd < reach && (rx * dirC.x + rz * dirC.z) / (dd || 1) > Math.cos(19 * Math.PI / 180)) {
                  this.damage(x, rand(def.atk[0], def.atk[1]) * 0.45, def.element, e);
                  if (def.breathStatus && ticks === 2) this.applyStatus(x, Object.assign({ chance: 1 }, def.breathStatus), e);
                }
              }
            } });
            setTimeout(() => { ai.busy = false; }, 1000);
          } });
      } else if (ab === 'tail' || ab === 'gust') {
        ai.busy = true;
        const R = ab === 'tail' ? 5.5 : 7.5;
        this.addZone({ shape: 'circle', pos: new THREE.Vector3(e.pos.x, 0, e.pos.z), radius: R, tell, start: now, follow: e,
          onTick: k => { if (ab === 'gust') e.mesh.userData.flapSpeed = 1.5 + 3 * k; },
          onFire: () => {
            e.mesh.userData.flapSpeed = 1.5; ai.busy = false;
            if (e.dead) return;
            const c = new THREE.Vector3(e.pos.x, 0.3, e.pos.z);
            FX.ring(c, ab === 'gust' ? 0xf2d49b : ENEMY_RIM, R, 0.6); FX.burst(c, ab === 'gust' ? 0xf2d49b : def.look.glow, 60, 7, 0.7, 0.3);
            this.shake(0.02, 300);
            for (const x of this.entities) {
              if (x.dead || !this.hostile(e, x)) continue;
              const dx = x.pos.x - e.pos.x, dz = x.pos.z - e.pos.z, dd = Math.hypot(dx, dz);
              if (dd > R + x.r) continue;
              this.damage(x, rand(def.atk[0], def.atk[1]) * (ab === 'tail' ? 1.2 : 0.5), 'physical', e);
              if (ab === 'gust') this.knockback(x, this._v2.set(dx / (dd || 1), 0, dz / (dd || 1)), 4);
            }
          } });
      } else if (ab === 'lightning' || ab === 'meteors') {
        const n = ab === 'lightning' ? 3 : 5, R = ab === 'lightning' ? 2.4 : 2.8;
        for (let i = 0; i < n; i++) {
          const p = new THREE.Vector3(target.pos.x + (i === 0 ? 0 : rand(-4, 4)), 0, target.pos.z + (i === 0 ? 0 : rand(-4, 4)));
          this.addZone({ shape: 'circle', pos: p, radius: R, tell: tell + i * 150, start: now, color: ab === 'lightning' ? 0xfff04d : ENEMY_RIM,
            onFire: () => {
              if (ab === 'lightning') FX.lightning(p, 0xfff04d); else { FX.burst(new THREE.Vector3(p.x, 0.5, p.z), 0xff4a1c, 80, 7, 1, 0.3); FX.ring(p, 0xff4a1c, R + 1, 0.6); }
              this.shake(0.015, 200);
              for (const x of this.entities) {
                if (x.dead || !this.hostile(e, x)) continue;
                if (Math.hypot(x.pos.x - p.x, x.pos.z - p.z) < R + x.r) this.damage(x, rand(def.atk[0], def.atk[1]) * 0.9, ab === 'lightning' ? 'lightning' : 'fire', e);
              }
            } });
        }
      }
    },
    /** Telegraph zone: red decal fills over `tell` ms (+ eye-level curtain for circles), then fires. */
    addZone(z) {
      const color = z.color || ENEMY_RIM;
      const g = new THREE.Group();
      const geo = z.shape === 'cone' ? this.coneGeo(z.angle) : this.geo.circle;
      const base = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
      const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
      base.scale.setScalar(z.radius); fill.scale.setScalar(0.01); base.position.y = 0.03; fill.position.y = 0.04;
      g.add(base, fill);
      if (z.shape === 'circle') {
        const curtain = new THREE.Mesh(this.geo.curtain, new THREE.MeshBasicMaterial({ color, map: this.curtainTex, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        curtain.scale.set(z.radius, 1, z.radius); g.add(curtain); z.curtain = curtain;
      } else g.rotation.y = Math.atan2(z.dir.x, z.dir.z);
      g.position.set(z.pos.x, 0, z.pos.z);
      global.World.areaGroup.add(g);
      z.group = g; z.fill = fill;
      this.zones.push(z);
    },
    updateZone(z, now, i) {
      const k = Math.min(1, (now - z.start) / z.tell);
      if (z.follow && !z.follow.dead) { z.pos.set(z.follow.pos.x, 0, z.follow.pos.z); z.group.position.set(z.pos.x, 0, z.pos.z); }
      z.fill.scale.setScalar(Math.max(0.01, z.radius * k));
      if (z.curtain) z.curtain.material.opacity = 0.25 + 0.35 * k + Math.sin(now * 0.03) * 0.08;
      if (z.onTick) z.onTick(k);
      if (k >= 1) { this.zones.splice(i, 1); this.removeZone(z); if (this.mode && z.onFire) z.onFire(); }
    },
    removeZone(z) {
      if (!z.group) return;
      if (z.group.parent) z.group.parent.remove(z.group);
      z.group.traverse(o => { if (o.material) o.material.dispose(); });   // geometries are shared
      z.group = null;
    },
    updateBossBar() {
      if (!UI()) return;
      let boss = null;
      for (const e of this.entities) if (e.kind === 'enemy' && !e.dead && (e.def.boss || e.def.dragon) && e.ai.alerted) boss = e;
      UI().bossBar(boss);
    },

    /* ========================= PRACTICE DUEL ========================== */
    startDuel(opponents) {
      this.reset();
      this.mode = 'duel';
      this.player = this.makePlayer({ hp: DUEL_RULES.hp, maxHp: DUEL_RULES.hp, mana: DUEL_RULES.mana, maxMana: DUEL_RULES.mana, regen: DUEL_RULES.manaRegen, power: DUEL_RULES.spellPower });
      this.entities = [this.player];
      global.World.loadArea('duel_arena', [0, 11]);   // default facing: toward the centre
      const n = Math.max(1, Math.min(DUEL_RULES.maxOpponents, opponents));
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + ((i + 1) / (n + 1)) * Math.PI * 2;   // spread around the circle, the player stands at the south
        const x = Math.cos(a) * 10, z = Math.sin(a) * 10;
        const color = DUEL_RULES.colors[i + 1];
        const mesh = M.wizard({ robe: color, hat: new THREE.Color(color).multiplyScalar(0.6).getHex(), trim: 0xffffff, staffGlow: color });
        mesh.position.set(x, 0, z);
        global.World.areaGroup.add(mesh);
        const bot = { id: 'bot' + i, kind: 'wizard', name: DUEL_RULES.names[i + 1], team: i + 1, mesh, pos: mesh.position, r: 0.45, h: 1.8,
          hp: DUEL_RULES.hp, maxHp: DUEL_RULES.hp, mana: DUEL_RULES.mana, maxMana: DUEL_RULES.mana, regen: DUEL_RULES.manaRegen, power: DUEL_RULES.spellPower,
          statuses: {}, color, plateName: DUEL_RULES.names[i + 1],
          ai: { cd: rand(1.5, 2.5), strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 3), pending: null } };
        bot.plate = M.nameplate(bot.name, hex(color));
        global.World.areaGroup.add(bot.plate);
        this.prepareMaterials(bot);
        this.entities.push(bot);
      }
      this.duel = { over: false, start: performance.now() };
    },
    botAI(b, dt, t, now) {
      b.mana = Math.min(b.maxMana, b.mana + b.regen * dt);
      b.moving = false;
      if (this.isDisabled(b)) { b.ai.pending = null; return; }
      // pick a target every few seconds: usually you (it is your practice duel), sometimes the nearest rival
      b.ai.retarget = (b.ai.retarget || 0) - dt;
      const f = b.ai.focus;
      if (!f || f.dead || f.hp <= 0 || b.ai.retarget <= 0) {
        b.ai.retarget = rand(3, 6);
        b.ai.focus = this.player.hp > 0 && Math.random() < 0.7 ? this.player : this.nearestHostile(b, 60);
      }
      const target = b.ai.focus;
      if (!target) return;
      const d = Math.hypot(target.pos.x - b.pos.x, target.pos.z - b.pos.z);
      b.ai.strafeT -= dt; if (b.ai.strafeT <= 0) { b.ai.strafeT = rand(1, 3); b.ai.strafe *= -1; }
      if (!b.statuses.bound && !this.stationary()) {           // keep 8–14 m away and strafe (never in the duel arena)
        const tx = (target.pos.x - b.pos.x) / (d || 1), tz = (target.pos.z - b.pos.z) / (d || 1);
        const radial = d > 14 ? 1 : d < 8 ? -1 : 0;
        this.moveToward(b, this._v.set(b.pos.x - tz * b.ai.strafe * 2 + tx * radial * 2, 0, b.pos.z + tx * b.ai.strafe * 2 + tz * radial * 2), 3.2, dt);
      }
      this.face(b, target.pos);
      if (b.ai.pending) { if (now >= b.ai.pending.at) { const p = b.ai.pending; b.ai.pending = null; this.botFire(b, p, target); } return; }
      b.ai.cd -= dt;
      if (b.ai.cd > 0) return;
      const choices = SPELLS.filter(s => s.delivery !== 'toggle' && s.delivery !== 'line' && SC.costFor(s, 0.5) <= b.mana && (
        s.kind === 'heal' ? b.hp < b.maxHp * 0.45 : s.id === 'shield' ? !b.statuses.shield : s.kind === 'summon' ? !this.entities.some(x => x.owner === b && !x.dead) :
        s.id === 'dragon_ward' ? false : s.id === 'levitate' ? Math.random() < 0.12 : s.delivery === 'cone' ? (d < 8 || this.stationary()) : true));
      if (!choices.length) { b.ai.cd = 0.8; return; }
      const spell = choices[Math.floor(Math.random() * choices.length)];
      const q = rand(0.25, 1), tier = q >= 1 ? 'Perfect' : q >= 0.5 ? 'Great' : 'Good';
      b.mana -= SC.costFor(spell, q);
      b.ai.pending = { spell, q, tier, at: now + (CAST_RULES.windup[tier] || 150) + 250 };
      b.ai.cd = rand(1.1, 2.0);
      FX.burst(this.chest(b, this._v), spell.color, 12, 1.5, 0.4, 0.15, 0);   // cast tell at the bot's wand
    },
    botFire(b, p, target) {
      if (target.dead || target.hp <= 0) target = this.nearestHostile(b, 60);
      if (!target) return;
      const origin = this.chest(b, new THREE.Vector3()); origin.y += 0.2;
      const aim = this.chest(target, new THREE.Vector3());
      const spread = (1 - p.q) * 2.2;                     // sloppier bots aim worse
      aim.add(this._v.set(rand(-spread, spread), rand(-spread * 0.4, spread * 0.4), rand(-spread, spread)));
      this.castSpell(b, p.spell, p.q, p.tier, origin, aim.sub(origin).normalize());
    },
    checkDuelEnd() {
      if (!this.duel || this.duel.over) return;
      const bots = this.entities.filter(e => e.kind === 'wizard' && e.hp > 0 && !e.dead);
      if (this.player.hp > 0 && bots.length === 0) { this.duel.over = true; if (this.onDuelEnd) this.onDuelEnd(true); }
      else if (this.player.hp <= 0) { this.duel.over = true; if (this.onDuelEnd) this.onDuelEnd(false); }
    },
  };

  global.Combat = Combat;
})(window);
