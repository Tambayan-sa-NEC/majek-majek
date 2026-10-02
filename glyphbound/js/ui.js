/* =====================================================================
 * ui.js — FIRST-PERSON HUD, DIALOGUE, QUEST LOG, SPELLBOOK, LESSONS, MENUS
 * ---------------------------------------------------------------------
 * Pure DOM. Panels are plain elements in index.html toggled with the
 * 'hidden' class. UI.isBlocking() tells the game to pause the world.
 * The HUD (bars, statuses, quick-glyph strip, threat arrows, floating
 * numbers) is refreshed every animation frame by UI.frame().
 * Requires: THREE, data.js, state.js, quests.js, drawing.js
 *           (world.js, player.js, combat.js at runtime)
 * ===================================================================== */
(function (global) {
  'use strict';
  const { SPELLS, QUESTS, NPCS, ITEMS, STATUSES, CAST_RULES, DUEL_RULES, AREAS, SHOPS, ELEMENTS, SHRINES, WORLD_MAP } = global.GameData;
  const S = global.GameState, Q = global.Quests, SC = global.SpellCaster;
  const $ = id => document.getElementById(id);
  const spellById = id => SPELLS.find(s => s.id === id);
  const isShown = id => !$(id).classList.contains('hidden');
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  const BLOCKING = ['dialogue', 'questlog', 'spellbook', 'inventory', 'shop', 'map', 'lesson', 'pause', 'menu', 'duel-setup', 'duel-result', 'how-to'];
  const RARITY = { common: '#d8d0c0', rare: '#6ab8ff', epic: '#c86aff', legendary: '#ffb040' };
  const MOBILE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  /** Show/hide a panel. Opening a blocking panel frees the mouse so it can be clicked. */
  function show(id, on = true) {
    $(id).classList.toggle('hidden', !on);
    if (on && BLOCKING.includes(id) && global.Player) global.Player.releaseLock();
  }
  /** Set a style/text only when it changed (keeps per-frame DOM work tiny). */
  function setW(el, pct) { const v = Math.max(0, Math.min(100, pct)).toFixed(1) + '%'; if (el._w !== v) { el._w = v; el.style.width = v; } }
  function setT(el, txt) { if (el._t !== txt) { el._t = txt; el.textContent = txt; } }

  const UI = {
    lessonPad: null, floats: [], dmgArcs: [], chipTimer: 0, quickKey: '', bossRef: null, duelRows: [],

    init() {
      if (MOBILE) document.body.classList.add('touch');
      // HUD buttons
      $('btn-quests').onclick = () => this.toggleQuestLog();
      $('btn-book').onclick = () => this.toggleSpellbook();
      $('btn-inv').onclick = () => this.toggleInventory();
      $('btn-map').onclick = () => this.toggleMap();
      $('questlog-body').addEventListener('click', e => { const b = e.target.closest('[data-track]'); if (b) { S.player.tracked = b.dataset.track; S.save(); this.renderQuestLog(); this._guideKey = ''; } });
      $('btn-pause').onclick = () => this.togglePause();
      $('btn-flee').onclick = () => global.Game.exitArena(false);
      $('prompt').onclick = () => global.World.interact();
      $('click-play').onclick = () => global.Player.requestLock();
      if (global.Player && global.Player.hybrid) $('click-play').querySelector('small').textContent = 'Mouse looks · hold LEFT mouse or touch the screen and draw a glyph to cast · Esc pauses';
      document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { show(b.dataset.close, false); this.afterModal(); });
      global.addEventListener('keydown', e => {
        if (e.target && e.target.tagName === 'INPUT') return;
        const G = global.Game;
        if (G.mode !== 'explore' && G.mode !== 'duel') return;
        if (isShown('dialogue')) { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); this.advanceDialogue(); } return; }
        if (isShown('lesson') || isShown('duel-result')) return;
        if (e.code === 'Escape') {
          if (isShown('questlog')) { show('questlog', false); this.afterModal(); }
          else if (isShown('spellbook')) { show('spellbook', false); this.afterModal(); }
          else if (isShown('inventory')) { show('inventory', false); this.afterModal(); }
          else if (isShown('shop')) { show('shop', false); this.afterModal(); }
          else if (isShown('map')) { show('map', false); this.afterModal(); }
          else this.togglePause();
          return;
        }
        if (G.mode !== 'explore') return;         // the duel has no quest log / spellbook
        if (e.code === 'KeyQ' || e.code === 'KeyJ') this.toggleQuestLog();
        if (e.code === 'KeyB') this.toggleSpellbook();
        if (e.code === 'KeyI') this.toggleInventory();
        if (e.code === 'KeyM') this.toggleMap();
        if (e.code === 'KeyF' && G.arena && !G.arena.solo) G.exitArena(false);
      });

      // lesson draw pad
      this.lessonPad = new global.DrawPad($('lesson-canvas'), {
        onStroke: pts => this.lessonStroke(pts),
        allowed: () => this.lesson ? [this.lesson.spell.id] : null,
        showGhost: () => true,
      });
      this.lessonPad.disable();
      $('lesson-replay').onclick = () => { if (this.lesson) this.lessonPad.demo(this.lesson.spell); };
      $('lesson-close').onclick = () => this.endLesson(false);

      // pause menu
      $('pm-resume').onclick = () => { this.togglePause(); global.Player.requestLock(); };
      $('pm-save').onclick = () => { global.Game.saveNow(); this.toast('Game saved.', 'info'); };
      $('pm-ghost').onclick = () => { S.player.showGhost = !S.player.showGhost; this.renderPause(); S.save(); };
      $('pm-shake').onclick = () => { S.player.shake = S.player.shake === 0 ? 1 : 0; this.renderPause(); S.save(); };
      $('pm-bob').onclick = () => { S.player.headBob = S.player.headBob === 0 ? 1 : 0; this.renderPause(); S.save(); };
      $('pm-menu').onclick = () => { show('pause', false); global.Game.toMenu(); };

      // events
      const E = S.Events;
      E.on('toast', t => this.toast(t.text, t.kind));
      E.on('stats', () => this.renderHud());
      E.on('quests', () => { this.renderHud(); if (isShown('questlog')) this.renderQuestLog(); if (isShown('inventory')) this.renderInventory(); global.World.refreshMarkers(); });
      E.on('gear', () => { this.quickKey = ''; if (isShown('inventory')) this.renderInventory(); if (isShown('shop')) this.renderShop(); });
      E.on('gold', () => { this.renderGold(); if (isShown('shop')) this.renderShop(); if (isShown('inventory')) this.renderInventory(); });
      E.on('levelup', d => this.levelUp(d.level));
      E.on('lessons', () => global.Game.processLessons());
      E.on('saved', () => { const el = $('save-ind'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); });

      this._v = new global.THREE.Vector3();
      const loop = () => { try { this.frame(); } catch (err) { console.error(err); } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },

    isBlocking() { return BLOCKING.some(isShown); },
    afterModal() { global.Game.processLessons(); },
    playing() { const m = global.Game.mode; return m === 'explore' || m === 'duel'; },

    /* --------------------------- Static HUD -------------------------- */
    renderHud() {
      if (!S.player) return;
      const P = S.player;
      $('hud-level').textContent = `Level ${P.level}`;
      this.renderGold();
      setW($('hud-xp').querySelector('i'), 100 * P.xp / S.xpToNext());
      $('hud-xp').querySelector('span').textContent = `${P.xp}/${S.xpToNext()} XP`;
      const active = QUESTS.filter(q => Q.isActive(q.id));
      $('hud-tracker').innerHTML = active.slice(0, 3).map(q => {
        const ready = Q.stateOf(q.id) === 'ready';
        return `<div class="trk"><b>${q.title}</b>${ready ? `<div class="ready">✔ Return to ${NPCS[q.turnIn].name}</div>` :
          q.objectives.map((o, i) => `<div>${o.text} ${o.type === 'talk' ? '' : `${Q.progressOf(q, i)}/${o.count}`}</div>`).join('')}</div>`;
      }).join('');
    },
    /** Switch the HUD between story and practice-duel layouts. */
    setHudMode(mode) {
      show('hud', mode === 'explore' || mode === 'duel');
      document.body.classList.toggle('duel', mode === 'duel');
      this.quickKey = '';
      if (mode === 'explore') this.renderHud();
    },
    renderGold() { if (S.player) $('hud-gold').textContent = `🪙 ${S.player.gold || 0}`; },
    setArea(name) { const el = $('area-name'); el.textContent = name; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); },
    setPrompt(it) {
      const el = $('prompt');
      if (!it || this.isBlocking()) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      const html = `<kbd>E</kbd> ${esc(it.label)}`;
      if (el._h !== html) { el._h = html; el.innerHTML = html; }
    },
    setWandlight(on) {
      $('btn-light').classList.toggle('on', on);
      const b = $('btn-light-touch'); if (b) b.classList.toggle('on', on);
    },
    drawFocus(on) { document.body.classList.toggle('drawing', !!on); },

    toast(text, kind = 'info') {
      const box = $('toasts');
      while (box.children.length > 5) box.firstChild.remove();
      const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text;
      box.appendChild(el);
      setTimeout(() => el.classList.add('out'), 3200);
      setTimeout(() => el.remove(), 3800);
    },
    levelUp(level) {
      const el = $('levelup');
      el.innerHTML = `LEVEL UP!<small>Level ${level} · HP & Mana restored and increased</small>`;
      el.classList.remove('hidden', 'pop'); void el.offsetWidth; el.classList.add('pop');
      setTimeout(() => el.classList.add('hidden'), 2600);
    },

    /* ----------------------- Combat feedback ------------------------- */
    /** Small result chip under the crosshair after every stroke. */
    castChip(res, o = {}) {
      const el = $('cast-chip');
      const sp = res.spell;
      let cls = 'ok', html;
      if (o.fizzle) { cls = 'bad'; html = `<b>Fizzle</b> ${res.pct}%${sp ? ` <span>(${esc(sp.name)}?)</span>` : ''}${o.lost ? ` · −${o.lost} MP` : ''}`; }
      else if (o.toggle) { html = `<b>${esc(sp.name)}</b> ${global.Player.wandlightOn ? 'ON' : 'OFF'}`; }
      else if (o.cooldown) { cls = 'warn'; html = `<b>${esc(sp.name)}</b> recharging · ${o.cooldown}s`; }
      else if (o.noMana) { cls = 'warn'; html = `<b>${esc(sp.name)}</b> needs ${o.cost} MP`; }
      else html = `<b style="color:${hex(sp.color)}">${esc(sp.name)}</b> <span class="tier-${res.tier}">${res.tier.toUpperCase()}</span> ${res.pct}%${o.queued ? ' · queued' : ''}`;
      el.className = 'chip ' + cls;
      el.innerHTML = html;
      void el.offsetWidth; el.classList.add('pop');
      clearTimeout(this.chipTimer);
      this.chipTimer = setTimeout(() => { el.className = 'chip hidden'; }, 1100);
    },
    floatText(pos, text, color = '#fff', size = 1) {
      if (this.floats.length > 40) { const f = this.floats.shift(); f.el.remove(); }
      const el = document.createElement('div'); el.className = 'floater'; el.textContent = text;
      el.style.color = typeof color === 'number' ? hex(color) : color; el.style.fontSize = Math.round(22 * size) + 'px';
      $('floaters').appendChild(el);
      this.floats.push({ el, pos: pos.clone(), t0: performance.now(), dur: 900, dx: (Math.random() - 0.5) * 30 });
    },
    damageDirection(src) {
      const P = global.Player; if (!P || !src) return;
      const sa = Math.atan2(src.x - P.pos.x, src.z - P.pos.z), fa = Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw));
      const el = document.createElement('div'); el.className = 'dmg-arc';
      el.style.transform = `rotate(${fa - sa}rad)`;
      el.innerHTML = '<i></i>';
      $('dmg-dir').appendChild(el);
      setTimeout(() => el.remove(), 900);
    },
    playerHurt(amount) {
      const el = $('vignette');
      el.style.opacity = Math.min(0.85, 0.35 + amount / 60);
      clearTimeout(this._vig); this._vig = setTimeout(() => { el.style.opacity = 0; }, 120);
    },
    screenFlash(color, alpha, ms) {
      const el = $('flash');
      el.style.transition = 'none'; el.style.background = color; el.style.opacity = alpha;
      void el.offsetWidth;
      el.style.transition = `opacity ${ms}ms ease-out`; el.style.opacity = 0;
    },
    /** Called every frame by Combat with the alerted boss/dragon (or null). */
    bossBar(e) {
      if (e !== this.bossRef) {
        this.bossRef = e;
        show('boss-bar', !!e);
        if (e) $('boss-name').textContent = e.def ? `${e.def.name} · Lv ${e.def.level}` : e.name;
      }
      if (e) setW($('boss-fill'), 100 * e.hp / e.maxHp);
    },
    showDeath(on, text) { show('death', on); if (text) $('death-text').textContent = text; },

    /* ----------------------------- Per frame ------------------------- */
    frame() {
      const C = global.Combat, P = global.Player, W = global.World, now = performance.now();
      const playing = this.playing() && C && C.player;
      // click-to-play overlay: shown when the mouse is not captured in pointer-lock mode
      const needClick = playing && !P.locked && !P.noLock && !P.touchMode && !this.isBlocking() && global.Game.mode !== 'dead';
      if (needClick !== this._needClick) { this._needClick = needClick; $('click-play').classList.toggle('hidden', !needClick); }
      const canFlee = !!(global.Game.arena && !global.Game.arena.solo && global.Game.mode === 'explore');
      if (canFlee !== this._canFlee) { this._canFlee = canFlee; $('btn-flee').classList.toggle('hidden', !canFlee); }
      if (playing) {
        const me = C.player;
        setW($('hud-hp-fill'), 100 * me.hp / me.maxHp); setT($('hud-hp-txt'), `${Math.ceil(Math.max(0, me.hp))} / ${me.maxHp} HP`);
        setW($('hud-mp-fill'), 100 * me.mana / me.maxMana); setT($('hud-mp-txt'), `${Math.floor(me.mana)} / ${me.maxMana} MP`);
        $('hud-hp').classList.toggle('low', me.hp < me.maxHp * 0.3);
        const st = Object.keys(me.statuses).map(k => { const d = STATUSES[k]; return d ? `${d.icon}${Math.ceil(me.statuses[k].secs)}` : ''; }).join(' ');
        setT($('hud-status'), st);
        this.renderQuick(me, now);
        this.renderThreats(C, P, W);
        if (C.mode === 'duel') this.renderDuelBars(C);
        this.renderFoeInfo(C);
        if (now - (this._mmAt || 0) > 100) { this._mmAt = now; this.updateGuide(C, P, W); this.drawAreaMap($('minimap'), false); }
      }
      // floating numbers follow their world position
      if (this.floats.length && W && W.camera) {
        const w = global.innerWidth, h = global.innerHeight;
        for (let i = this.floats.length - 1; i >= 0; i--) {
          const f = this.floats[i], k = (now - f.t0) / f.dur;
          if (k >= 1) { f.el.remove(); this.floats.splice(i, 1); continue; }
          let x, y;
          if (f.pos.distanceTo(W.camera.position) < 2.5) {            // about you (heals, potions, shields): just below the crosshair
            x = w / 2 + f.dx * 2; y = h * 0.62 - 50 * k;
          } else {
            const v = this._v.copy(f.pos).project(W.camera);
            if (v.z > 1) { f.el.style.opacity = 0; continue; }
            x = (v.x * 0.5 + 0.5) * w + f.dx * k; y = (-v.y * 0.5 + 0.5) * h - 50 * k;
          }
          f.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(k < 0.15 ? 0.6 + k * 4 : 1).toFixed(2)})`;
          f.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
        }
      }
    },

    /** Quick-glyph strip: every castable spell with cost, cooldown and affordability. */
    renderQuick(me, now) {
      const C = global.Combat, P = global.Player;
      const ids = global.Player.allowedIds();     // learned spells + spells granted by your staff (duel: all)
      const key = ids.join(',');
      const bar = $('quickbar');
      if (key !== this.quickKey) {
        this.quickKey = key;
        bar.innerHTML = '';
        this.quickSlots = ids.map(id => {
          const s = spellById(id);
          const d = document.createElement('div'); d.className = 'qslot'; d.title = `${s.name} · ${s.cost} MP · ${s.shapeName}`;
          const cv = document.createElement('canvas'); cv.width = cv.height = 48; global.drawThumb(cv, s);
          const cost = document.createElement('span'); cost.className = 'qcost'; cost.textContent = s.cost || '';
          const cd = document.createElement('i'); cd.className = 'qcd';
          d.append(cv, cost, cd); bar.appendChild(d);
          return { s, d, cd };
        });
      }
      for (const q of this.quickSlots || []) {
        const until = P.cooldowns[q.s.id] || 0;
        const cdLeft = until > now ? (until - now) / 1000 : 0;
        q.d.classList.toggle('poor', q.s.cost > me.mana);
        q.d.classList.toggle('lit', q.s.id === 'wandlight' && P.wandlightOn);
        setW(q.cd, cdLeft > 0 ? 100 * cdLeft / (q.s.cooldown || 1) : 0);
      }
    },

    /** Edge arrows for alerted enemies you cannot see. */
    renderThreats(C, P, W) {
      if (!this.arrows) {
        this.arrows = [];
        for (let i = 0; i < 5; i++) { const a = document.createElement('div'); a.className = 'threat hidden'; $('threats').appendChild(a); this.arrows.push(a); }
      }
      let n = 0;
      const w = global.innerWidth, h = global.innerHeight, R = Math.min(w, h) * 0.4;
      const fa = Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw));
      for (const e of C.entities) {
        if (n >= this.arrows.length) break;
        if (e.isPlayer || e.dead || e.team === 0 || !(e.kind === 'wizard' || (e.ai && e.ai.alerted))) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        if (dx * dx + dz * dz > 900) continue;
        const v = this._v.set(e.pos.x, e.pos.y + 1, e.pos.z).project(W.camera);
        if (v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95) continue;     // on screen
        const rot = fa - Math.atan2(dx, dz);
        const a = this.arrows[n++];
        a.classList.remove('hidden');
        a.style.transform = `translate(${(w / 2 + Math.sin(rot) * R).toFixed(0)}px, ${(h / 2 - Math.cos(rot) * R).toFixed(0)}px) rotate(${rot.toFixed(2)}rad)`;
        a.classList.toggle('boss', !!(e.def && (e.def.boss || e.def.dragon)));
      }
      for (let i = n; i < this.arrows.length; i++) if (!this.arrows[i].classList.contains('hidden')) this.arrows[i].classList.add('hidden');
    },

    /** Arena: what the foe is weak to, and which of your spells use that element. */
    renderFoeInfo(C) {
      const foe = C.inArena() ? C.entities.find(e => e.kind === 'enemy' && !e.dead) : null;
      const key = foe ? foe.id + ':' + global.Player.allowedIds().join(',') : '';
      if (key === this._foeKey) return;
      this._foeKey = key;
      const el = $('foe-info');
      if (!foe) { el.classList.add('hidden'); return; }
      const d = foe.def, name = w => (ELEMENTS[w] ? ELEMENTS[w].join(' ') : w);
      const good = global.Player.allowedIds().map(spellById).filter(sp => sp && sp.power > 0 && d.weak.includes(sp.element)).map(sp => sp.name);
      el.innerHTML = (d.weak.length ? `<span class="wk">Weak to ${d.weak.map(name).join(', ')}</span>` : '<span class="muted">No weakness</span>') +
        (d.resist.length ? ` · <span class="rs">Resists ${d.resist.map(name).join(', ')}</span>` : '') +
        (good.length ? `<div class="try">Try: ${good.map(esc).join(', ')}</div>` : (d.weak.length ? `<div class="muted">You know no ${d.weak.map(name).join(' / ')} spell yet.</div>` : ''));
      el.classList.remove('hidden');
    },

    /* ------------------------- Guide & maps -------------------------- */
    /** Work out where the tracked quest wants you to go; drives the compass, the beacon and the map star. */
    updateGuide(C, P, W) {
      const Q = global.Quests, el = $('guide');
      let target = null, text = '', title = '';
      if (C.mode === 'story' && W.area && !W.area.arena && S.player) {
        const q = Q.guideQuest(), g = Q.guideFor(q);
        if (q && g) {
          title = q.title;
          if (g.area === W.areaId) { target = { x: g.x, z: g.z }; text = g.text; }
          else if (g.area) {
            const d = Q.routeDoor(W.areaId, g.area);
            if (d) { target = { x: d.x, z: d.z, door: true }; text = `${g.text} — go to ${AREAS[g.area].name} (door: ${d.label})`; }
          } else text = g.text;
        }
      }
      this.guideTarget = target;
      W.setGuide(target);
      if (!title) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      let arrow = '';
      if (target) {
        const dx = target.x - P.pos.x, dz = target.z - P.pos.z, dist = Math.hypot(dx, dz);
        const rot = Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw)) - Math.atan2(dx, dz);
        arrow = `<span class="garrow" style="transform:rotate(${rot.toFixed(2)}rad)">➤</span> <span class="gdist">${Math.round(dist)} m</span>`;
      }
      const html = `<span class="gtitle">📜 ${esc(title)}</span> ${esc(text)} ${arrow}`;
      if (el._h !== html) { el._h = html; el.innerHTML = html; }
    },
    /** Top-down map of the current area. big = the full map window (adds labels). */
    drawAreaMap(cv, big) {
      const W = global.World, def = W.area, C = global.Combat, P = global.Player, Q = global.Quests;
      if (!cv || !def) return;
      const dpr = Math.min(2, global.devicePixelRatio || 1), cw = cv.clientWidth || cv.width, ch = cv.clientHeight || cv.height;
      if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch);
      const [AW, AD] = def.size, sc = Math.min((cw - 16) / AW, (ch - 16) / AD), ox = cw / 2, oy = ch / 2;
      const X = x => ox + x * sc, Y = z => oy + z * sc;
      c.fillStyle = 'rgba(10,6,20,0.75)'; c.fillRect(0, 0, cw, ch);
      c.fillStyle = '#' + new global.THREE.Color(def.floor).multiplyScalar(1.4).getHexString();
      if (def.arena) { c.beginPath(); c.arc(ox, oy, (AW / 2 - 2.5) * sc, 0, Math.PI * 2); c.fill(); }
      else c.fillRect(X(-AW / 2), Y(-AD / 2), AW * sc, AD * sc);
      c.strokeStyle = '#a68b4f'; c.lineWidth = 2; c.strokeRect(X(-AW / 2), Y(-AD / 2), AW * sc, AD * sc);
      const font = big ? 13 : 9;
      c.font = `${font}px Georgia`; c.textAlign = 'center';
      const label = (txt, x, y) => { const hw = c.measureText(txt).width / 2 + 4; c.fillText(txt, Math.max(hw, Math.min(cw - hw, x)), Math.max(12, Math.min(ch - 4, y))); };
      // doors
      (def.doors || []).forEach(d => {
        c.fillStyle = '#7fe0ff'; c.fillRect(X(d.x) - 5, Y(d.z) - 5, 10, 10);
        if (big) { c.fillStyle = '#bff2ff'; label('🚪 ' + d.label, X(d.x), Y(d.z) + (d.z > 0 ? -10 : 18)); }
      });
      (def.gates || []).filter(gd => gd.state !== 'decor').forEach(gd => {
        const open = W.gates.find(x => x.def.id === gd.id && x.open);
        c.fillStyle = open ? '#7dff9a' : gd.state === 'locked' ? '#ffc23d' : gd.state === 'sealed' ? '#4ab8ff' : gd.state === 'boss' ? '#a07aff' : '#e8b860';
        c.fillRect(X(gd.x) - 4, Y(gd.z) - 3, 8, 6);
      });
      // shrines
      Object.entries(SHRINES).filter(([, sh]) => sh.area === W.areaId && !def.arena).forEach(([id, sh]) => {
        const on = (S.player.shrines || []).includes(id);
        c.fillStyle = on ? '#c89aff' : 'rgba(200,154,255,0.35)';
        c.beginPath(); c.moveTo(X(sh.x), Y(sh.z) - 6); c.lineTo(X(sh.x) + 5, Y(sh.z)); c.lineTo(X(sh.x), Y(sh.z) + 6); c.lineTo(X(sh.x) - 5, Y(sh.z)); c.fill();
        if (big) { c.fillStyle = '#e0c8ff'; label(sh.name + (on ? '' : ' (not attuned)'), X(sh.x), Y(sh.z) - 9); }
      });
      // NPCs with quest markers
      if (!def.arena) Object.entries(NPCS).filter(([, n]) => n.area === W.areaId).forEach(([id, n]) => {
        c.fillStyle = '#ffe9b0'; c.beginPath(); c.arc(X(n.pos[0]), Y(n.pos[1]), big ? 5 : 3.5, 0, Math.PI * 2); c.fill();
        const mk = Q.markerFor(id);
        if (mk) { c.fillStyle = mk === '?' ? '#7dff7d' : '#ffd84a'; c.font = `bold ${font + 4}px Georgia`; c.fillText(mk, X(n.pos[0]), Y(n.pos[1]) - 6); c.font = `${font}px Georgia`; }
        if (big) { c.fillStyle = '#ffe9b0'; label(n.name, X(n.pos[0]), Y(n.pos[1]) + 16); }
      });
      // enemies
      for (const e of C.entities) {
        if (e.dead || !(e.kind === 'enemy' || e.kind === 'wizard')) continue;
        const boss = e.def && (e.def.boss || e.def.dragon);
        c.fillStyle = e.def && e.def.training ? '#ffb070' : '#ff5a4a';
        c.beginPath(); c.arc(X(e.pos.x), Y(e.pos.z), boss ? 6 : 3, 0, Math.PI * 2); c.fill();
      }
      // quest target
      if (this.guideTarget) {
        const gx = X(this.guideTarget.x), gy = Y(this.guideTarget.z);
        c.fillStyle = '#ffd84a'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
        c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.5 : 8; c.lineTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke();
      }
      // you
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), px = X(P.pos.x), py = Y(P.pos.z), ang = Math.atan2(fz, fx);
      c.save(); c.translate(px, py); c.rotate(ang);
      c.fillStyle = '#ffffff'; c.strokeStyle = '#1a1030'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(8, 0); c.lineTo(-5, -5); c.lineTo(-2, 0); c.lineTo(-5, 5); c.closePath(); c.fill(); c.stroke();
      c.restore();
      if (!big) { c.fillStyle = '#ffe9b0'; c.font = '10px Georgia'; c.textAlign = 'left'; c.fillText(def.name, 6, ch - 6); }
    },
    /** World map: castle areas and how their doors connect. */
    drawWorldMap(cv) {
      const W = global.World, Q = global.Quests;
      const dpr = Math.min(2, global.devicePixelRatio || 1), cw = cv.clientWidth, ch = cv.clientHeight;
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch);
      const xs = Object.values(WORLD_MAP).map(v => v[0]), ys = Object.values(WORLD_MAP).map(v => v[1]);
      const minX = Math.min(...xs), minY = Math.min(...ys), cols = Math.max(...xs) - minX + 1, rows = Math.max(...ys) - minY + 1, bw = cw / cols, bh = ch / rows;
      const center = id => { const [gx, gy] = WORLD_MAP[id]; return [(gx - minX) * bw + bw / 2, (gy - minY) * bh + bh / 2]; };
      const g = Q.guideFor(Q.guideQuest()), cur = (W.area && W.area.arena) ? global.Game.arena && global.Game.arena.srcId : W.areaId;
      c.strokeStyle = '#7fe0ff'; c.lineWidth = 3;
      Object.keys(WORLD_MAP).forEach(id => AREAS[id].doors.forEach(d => { if (!WORLD_MAP[d.to]) return; const [x1, y1] = center(id), [x2, y2] = center(d.to); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }));
      Object.keys(WORLD_MAP).forEach(id => {
        const [x, y] = center(id), w = bw * 0.78, h = bh * 0.62;
        c.fillStyle = '#' + new global.THREE.Color(AREAS[id].floor).multiplyScalar(1.3).getHexString();
        c.strokeStyle = id === cur ? '#ffffff' : '#a68b4f'; c.lineWidth = id === cur ? 3 : 1.5;
        c.fillRect(x - w / 2, y - h / 2, w, h); c.strokeRect(x - w / 2, y - h / 2, w, h);
        c.fillStyle = '#fff6e0'; c.font = 'bold 13px Georgia'; c.textAlign = 'center'; c.fillText(AREAS[id].name, x, y - 4);
        const sh = Object.entries(SHRINES).find(([, s2]) => s2.area === id);
        if (sh) { const on = (S.player.shrines || []).includes(sh[0]); c.fillStyle = on ? '#c89aff' : 'rgba(200,154,255,.4)'; c.font = '12px Georgia'; c.fillText(on ? '✦ shrine' : '✦ (not attuned)', x, y + 14); }
        if (id === cur) { c.fillStyle = '#ffffff'; c.font = '12px Georgia'; c.fillText('▼ you are here', x, y - h / 2 - 4); }
        if (g && g.area === id) { c.fillStyle = '#ffd84a'; c.font = 'bold 18px Georgia'; c.fillText('★', x + w / 2 - 12, y - h / 2 + 18); }
      });
    },
    toggleMap() { if (isShown('map')) { show('map', false); this.afterModal(); } else this.openMap(); },
    openMap() {
      if (global.Game.mode !== 'explore') return;
      show('map');
      const q = global.Quests.guideQuest(), g = global.Quests.guideFor(q);
      $('map-quest').innerHTML = q && g ? `📜 <b>${esc(q.title)}</b>: ${esc(g.text)}${g.area ? ` <span class="muted">(${AREAS[g.area].name})</span>` : ''} <span class="muted">— the ★ marks it</span>` : '<span class="muted">No quest to follow right now.</span>';
      const inBattle = !!global.Game.arena;
      $('map-travel').innerHTML = '<h3>✦ Quick travel</h3>' + Object.entries(SHRINES).map(([id, sh]) => {
        const on = (S.player.shrines || []).includes(id);
        return `<div class="trow ${on ? '' : 'off'}"><span>✦ ${esc(sh.name)} <span class="muted">${AREAS[sh.area].name}</span></span>` +
          (on ? `<button data-travel="${id}" ${inBattle ? 'disabled' : ''}>Travel</button>` : '<span class="muted">touch it first</span>') + '</div>';
      }).join('') + (inBattle ? '<p class="muted">You cannot travel during a battle.</p>' : '');
      $('map-travel').querySelectorAll('[data-travel]').forEach(b => b.onclick = () => { show('map', false); global.World.teleportToShrine(b.dataset.travel); this.toast(`Travelled to ${SHRINES[b.dataset.travel].name}.`, 'spell'); this.afterModal(); });
      requestAnimationFrame(() => { this.drawWorldMap($('worldmap')); this.drawAreaMap($('areamap'), true); });
    },

    /* ------------------------- Practice duel ------------------------- */
    duelStart() {
      const box = $('duel-bars'); box.innerHTML = '';
      this.duelRows = global.Combat.entities.filter(e => e.kind === 'wizard').map(b => {
        const d = document.createElement('div'); d.className = 'dbar';
        d.innerHTML = `<span style="color:${hex(b.color)}">${esc(b.name)}</span><div class="bar hp"><i></i></div>`;
        box.appendChild(d);
        return { b, d, fill: d.querySelector('i') };
      });
    },
    renderDuelBars() {
      for (const r of this.duelRows) { setW(r.fill, 100 * Math.max(0, r.b.hp) / r.b.maxHp); r.d.classList.toggle('dead', r.b.hp <= 0); }
    },
    showDuelSetup() {
      show('duel-setup');
      const sel = $('duel-count');
      if (!sel.options.length) for (let i = 1; i <= DUEL_RULES.maxOpponents; i++) sel.add(new Option(`${i} CPU wizard${i > 1 ? 's' : ''}`, i));
      $('duel-start').onclick = () => { show('duel-setup', false); global.Game.startDuel(+sel.value); };
      $('duel-back').onclick = () => { show('duel-setup', false); this.showMenu(); };
    },
    showDuelResult(won, secs) {
      $('result-title').textContent = won ? '🏆 Victory!' : '💀 Defeated';
      $('result-body').textContent = won ? `You defeated every CPU wizard in ${secs}s.` : `You lasted ${secs}s. Draw faster, keep moving, and shield the big hits.`;
      show('duel-result');
      $('result-again').onclick = () => { show('duel-result', false); global.Game.startDuel(global.Game.duelCount); };
      $('result-menu').onclick = () => { show('duel-result', false); global.Game.toMenu(); };
    },

    /* ----------------------------- Dialogue -------------------------- */
    openDialogue(dlg) {
      this.dlg = Object.assign({ page: 0 }, dlg);
      show('dialogue');
      this.renderDialogue();
    },
    renderDialogue() {
      const d = this.dlg;
      $('dlg-name').textContent = d.speaker;
      $('dlg-text').textContent = d.pages[d.page];
      const ch = $('dlg-choices'); ch.innerHTML = '';
      if (d.page < d.pages.length - 1) {
        const b = document.createElement('button'); b.textContent = 'Continue ▸'; b.onclick = () => this.advanceDialogue(); ch.appendChild(b);
      } else {
        (d.choices || [{ text: 'Close', action: null }]).forEach(c => {
          const b = document.createElement('button'); b.textContent = c.text;
          b.onclick = () => { show('dialogue', false); if (c.action) c.action(); global.World.refreshMarkers(); this.renderHud(); this.afterModal(); };
          ch.appendChild(b);
        });
      }
    },
    advanceDialogue() {
      const d = this.dlg; if (!d) return;
      if (d.page < d.pages.length - 1) { d.page++; this.renderDialogue(); }
      else if (!d.choices || d.choices.length === 1) { $('dlg-choices').querySelector('button').click(); }
    },

    /* ----------------------------- Quest log ------------------------- */
    toggleQuestLog() { show('questlog', !isShown('questlog')); if (isShown('questlog')) this.renderQuestLog(); else this.afterModal(); },
    renderQuestLog() {
      const sec = (title, list, fn) => `<h3>${title}</h3>` + (list.length ? list.map(fn).join('') : '<p class="muted">None.</p>');
      const active = QUESTS.filter(q => Q.isActive(q.id));
      const avail = QUESTS.filter(q => Q.stateOf(q.id) === 'available');
      const done = QUESTS.filter(q => Q.stateOf(q.id) === 'done');
      const rewardSpells = q => SPELLS.filter(s => s.unlock.type === 'quest' && s.unlock.quest === q.id).map(s => s.name);
      const rewardItems = q => (q.rewards.items || []).map(id => `${ITEMS[id].icon} ${ITEMS[id].name}`);
      const reward = q => `<div class="muted">Reward: ${q.rewards.xp} XP${rewardSpells(q).length ? ' · Spell: ' + rewardSpells(q).join(', ') : ''}${rewardItems(q).length ? ' · Item: ' + rewardItems(q).join(', ') : ''}</div>`;
      $('questlog-body').innerHTML =
        sec('Active', active, q => `<div class="quest"><b>${q.title}</b> <span class="muted">from ${NPCS[q.giver].name}</span> ` +
          (global.Quests.guideQuest() === q ? '<span class="ready">📍 Tracking</span>' : `<button class="mini" data-track="${q.id}">📍 Track</button>`) + `<p>${q.summary}</p>` +
          (Q.stateOf(q.id) === 'ready' ? `<div class="ready">✔ Objectives complete — return to ${NPCS[q.turnIn].name}</div>` :
            q.objectives.map((o, i) => `<div>☐ ${o.text}${o.type === 'talk' ? '' : ` (${Q.progressOf(q, i)}/${o.count})`}</div>`).join('')) + reward(q) + '</div>') +
        sec('Available', avail, q => `<div class="quest dim"><b>${q.title}</b> <span class="muted">— talk to ${NPCS[q.giver].name} (${AREAS[NPCS[q.giver].area].name})</span></div>`) +
        sec('Completed', done, q => `<div class="quest done">✔ <b>${q.title}</b></div>`) +
        `<h3>Quest items</h3>` + (this.questItems().length ? this.questItems().map(([k, n]) => `<span class="item">${ITEMS[k].icon} ${ITEMS[k].name} ×${n}</span>`).join(' ') : '<p class="muted">None.</p>') +
        `<p class="muted">Staffs and hats are in your Inventory (I).</p>`;
    },
    questItems() { return Object.entries(S.player.inventory).filter(([k]) => ITEMS[k] && !ITEMS[k].slot && !ITEMS[k].use && S.player.inventory[k] > 0); },

    /** Green/red differences of an item against what you wear in that slot. */
    compareHtml(itemId) {
      const it = ITEMS[itemId]; if (!it || !it.slot) return '';
      const curId = (S.player.equipped || {})[it.slot];
      if (curId === itemId) return '<div class="cmp muted">Currently equipped</div>';
      const cur = curId ? ITEMS[curId] : null, a = it.stats || {}, b = (cur && cur.stats) || {};
      const out = [], add = (d, text) => out.push(`<span class="${d > 0 ? 'up' : 'down'}">${text}</span>`);
      const pct = (k, label) => { const d = (a[k] || 0) - (b[k] || 0); if (Math.abs(d) > 1e-9) add(d, `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}% ${label}`); };
      const flat = (k, label) => { const d = (a[k] || 0) - (b[k] || 0); if (Math.abs(d) > 1e-9) add(d, `${d > 0 ? '+' : '−'}${Math.abs(d)} ${label}`); };
      pct('power', 'spell power'); flat('maxHp', 'max HP'); flat('maxMana', 'max mana'); flat('regen', 'mana/sec');
      pct('shield', 'Shield'); pct('heal', 'healing'); pct('cdr', 'cooldown cut'); pct('crit', 'crit');
      const ids = new Set([...Object.keys(a.boost || {}), ...Object.keys(b.boost || {})]);
      ids.forEach(id => { const d = ((a.boost || {})[id] || 0) - ((b.boost || {})[id] || 0), sp = spellById(id); if (sp && Math.abs(d) > 1e-9) add(d, `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}% ${sp.name}`); });
      (a.grants || []).filter(x => !(b.grants || []).includes(x)).forEach(id => add(1, `gain ${spellById(id).name}`));
      (b.grants || []).filter(x => !(a.grants || []).includes(x)).forEach(id => add(-1, `lose ${spellById(id).name}`));
      return `<div class="cmp">vs ${cur ? esc(cur.name) : 'no ' + it.slot}: ${out.length ? out.join(' ') : '<span class="muted">same stats</span>'}</div>`;
    },

    /* ------------------------------- Shop ---------------------------- */
    openShop(npcId) { this.shopNpc = npcId; show('shop'); this.renderShop(); },
    renderShop() {
      const P = S.player, stock = SHOPS[this.shopNpc] || [];
      $('shop-title').textContent = `🛒 ${NPCS[this.shopNpc] ? NPCS[this.shopNpc].name : 'Shop'}`;
      $('shop-gold').textContent = `🪙 ${P.gold || 0} gold`;
      const buyCard = e => {
        const it = ITEMS[e.item], price = S.priceOf(e.item, e.price), owned = it.slot && S.owns(e.item), poor = (P.gold || 0) < price;
        return `<div class="icard${owned ? ' on' : ''}"><div class="iicon">${it.icon}</div><div class="ibody">
          <b style="color:${RARITY[it.rarity] || '#fff'}">${esc(it.name)}</b> <span class="muted">${it.slot ? it.rarity + ' ' + it.slot : 'potion · you have ' + S.itemCount(e.item)}</span>
          <div class="istats">${it.stats ? this.statLines(it.stats).map(esc).join(' · ') : esc(it.desc)}</div>${it.slot && !owned ? this.compareHtml(e.item) : ''}
          ${owned ? '<span class="ready">✔ Owned</span>' : `<button class="${poor ? '' : 'glow'}" data-buy="${e.item}" data-price="${price}" ${poor ? 'disabled' : ''}>Buy · 🪙 ${price}</button>`}</div></div>`;
      };
      const sellable = Object.keys(P.inventory).filter(k => ITEMS[k] && ITEMS[k].slot && P.inventory[k] > 0 && !Object.values(P.equipped || {}).includes(k));
      $('shop-body').innerHTML = `<h3>For sale</h3><div class="igrid">${stock.map(buyCard).join('')}</div>` +
        `<h3>Sell your gear</h3>` + (sellable.length ? `<div class="igrid">${sellable.map(k => `<div class="icard"><div class="iicon">${ITEMS[k].icon}</div><div class="ibody"><b style="color:${RARITY[ITEMS[k].rarity]}">${esc(ITEMS[k].name)}</b>
          <div class="istats">${this.statLines(ITEMS[k].stats).map(esc).join(' · ')}</div><button data-sell="${k}">Sell · 🪙 ${S.sellPrice(k)}</button></div></div>`).join('')}</div>` : '<p class="muted">Nothing to sell (equipped items can\'t be sold).</p>');
      $('shop-body').querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
        const r = S.buy(b.dataset.buy, +b.dataset.price);
        this.toast(r === 'ok' ? `Bought ${ITEMS[b.dataset.buy].name}.` : r === 'poor' ? 'Not enough gold.' : 'You already own that.', r === 'ok' ? 'item' : 'info');
        this.renderShop();
      });
      $('shop-body').querySelectorAll('[data-sell]').forEach(b => b.onclick = () => { const id = b.dataset.sell; if (S.sell(id)) this.toast(`Sold ${ITEMS[id].name}.`, 'gold'); this.renderShop(); });
    },

    /* ----------------------------- Inventory ------------------------- */
    toggleInventory() { show('inventory', !isShown('inventory')); if (isShown('inventory')) this.renderInventory(); else this.afterModal(); },
    /** Human-readable stat lines for an item (or the sum of equipped items). */
    statLines(st) {
      const pct = v => `+${Math.round(v * 100)}%`, out = [];
      if (st.power) out.push(`${pct(st.power)} spell power`);
      Object.entries(st.boost || {}).forEach(([id, v]) => { const sp = spellById(id); if (sp) out.push(`${pct(v)} ${sp.name}`); });
      if (st.maxHp) out.push(`+${st.maxHp} max HP`);
      if (st.maxMana) out.push(`+${st.maxMana} max mana`);
      if (st.regen) out.push(`+${st.regen} mana/sec`);
      if (st.shield) out.push(`${pct(st.shield)} Shield strength`);
      if (st.heal) out.push(`${pct(st.heal)} healing`);
      if (st.cdr) out.push(`−${Math.round(st.cdr * 100)}% cooldowns`);
      if (st.crit) out.push(`${pct(st.crit)} crit chance`);
      (st.grants || []).forEach(id => { const sp = spellById(id); if (sp) out.push(`Grants spell: ${sp.name}`); });
      return out;
    },
    renderInventory() {
      const P = S.player, eq = P.equipped || {};
      const card = (id, slot) => {
        const it = ITEMS[id];
        const on = eq[it.slot] === id;
        return `<div class="icard${on ? ' on' : ''}"><div class="iicon">${it.icon}</div><div class="ibody">
          <b style="color:${RARITY[it.rarity] || '#fff'}">${esc(it.name)}</b> <span class="muted">${it.rarity} ${it.slot}</span>
          <div class="istats">${this.statLines(it.stats).map(esc).join(' · ')}</div>${!on && !slot ? this.compareHtml(id) : ''}<div class="muted">${esc(it.desc || '')}</div>
          ${slot ? `<button data-unequip="${it.slot}">Unequip</button>` : on ? '<span class="ready">✔ Equipped</span>' : `<button class="glow" data-equip="${id}">Equip</button>`}</div></div>`;
      };
      const slotBox = sl => eq[sl] && ITEMS[eq[sl]] ? card(eq[sl], true)
        : `<div class="icard empty"><div class="iicon">${sl === 'staff' ? '🪄' : '🎩'}</div><div class="ibody"><b>No ${sl}</b><div class="muted">Find ${sl === 'staff' ? 'staffs' : 'hats'} from enemies, quests and hidden spots.</div></div></div>`;
      const gear = Object.keys(P.inventory).filter(k => ITEMS[k] && ITEMS[k].slot);
      const sum = {};
      S.gear().forEach(it => Object.entries(it.stats).forEach(([k, v]) => {
        if (k === 'boost') { sum.boost = sum.boost || {}; Object.entries(v).forEach(([b, x]) => { sum.boost[b] = (sum.boost[b] || 0) + x; }); }
        else if (k === 'grants') sum.grants = (sum.grants || []).concat(v);
        else sum[k] = (sum[k] || 0) + v;
      }));
      const totals = this.statLines(sum);
      const potions = Object.keys(ITEMS).filter(k => ITEMS[k].use);
      $('inventory-body').innerHTML =
        `<p class="gold-line">🪙 ${P.gold || 0} gold</p>` +
        `<h3>Equipped</h3><div class="igrid">${slotBox('staff')}${slotBox('hat')}</div>` +
        `<p class="muted">Total bonus: ${totals.length ? totals.map(esc).join(' · ') : 'none yet'}</p>` +
        `<h3>Equipment (${gear.length})</h3>` + (gear.length ? `<div class="igrid">${gear.map(id => card(id, false)).join('')}</div>` : '<p class="muted">Nothing yet. Beaten enemies sometimes drop staffs and hats, quests reward them, and some are hidden (try your Wandlight).</p>') +
        `<h3>Potions</h3><div class="row left">${potions.map(k => `<span class="item">${ITEMS[k].icon} ${ITEMS[k].name} ×${S.itemCount(k)} <button data-use="${k}" ${S.itemCount(k) ? '' : 'disabled'}>Use</button></span>`).join(' ')}</div>` +
        `<h3>Quest items</h3>` + (this.questItems().length ? this.questItems().map(([k, n]) => `<span class="item">${ITEMS[k].icon} ${ITEMS[k].name} ×${n}</span>`).join(' ') : '<p class="muted">None.</p>');
      $('inventory-body').querySelectorAll('[data-use]').forEach(b => b.onclick = () => { global.Combat.usePotion(b.dataset.use); this.renderInventory(); });
      $('inventory-body').querySelectorAll('[data-equip]').forEach(b => b.onclick = () => { S.equip(b.dataset.equip); this.toast(`Equipped ${ITEMS[b.dataset.equip].name}.`, 'item'); });
      $('inventory-body').querySelectorAll('[data-unequip]').forEach(b => b.onclick = () => S.unequip(b.dataset.unequip));
    },

    /* ----------------------------- Spellbook ------------------------- */
    toggleSpellbook() { show('spellbook', !isShown('spellbook')); if (isShown('spellbook')) this.renderSpellbook(); else this.afterModal(); },
    unlockText(s) {
      const u = s.unlock;
      if (u.type === 'start') return 'Known from the start';
      if (u.type === 'level') return `Learned at level ${u.level}`;
      if (u.type === 'quest') { const q = Q.get(u.quest); return `Quest reward: "${q.title}"`; }
      return 'Secret — explore the castle grounds...';
    },
    effectText(s) {
      const how = { bolt: 'projectile', strike: 'instant strike', beam: 'channelled beam', cone: 'cone', bomb: 'charged bomb', line: 'ground line',
        self: 'self', summon: 'summon', toggle: 'toggle' }[s.delivery] || s.delivery;
      const what = { attack: `${s.power} dmg`, heal: `heals ${s.power}`, shield: `absorbs ${s.power}`, debuff: 'debuff', summon: `${s.power} dmg/hit`, utility: 'light' }[s.kind] || '';
      return `${how}${what ? ' · ' + what : ''}${s.cooldown ? ` · ${s.cooldown}s cooldown` : ''}`;
    },
    renderSpellbook() {
      const P = S.player, grid = $('spellbook-grid');
      grid.innerHTML = '';
      $('sb-count').textContent = `${P.spells.length} / ${SPELLS.length} spells learned`;
      SPELLS.forEach(s => {
        const known = P.spells.includes(s.id), pending = P.pendingLessons.includes(s.id);
        const card = document.createElement('div'); card.className = 'scard' + (known ? '' : ' locked');
        const cv = document.createElement('canvas'); cv.width = 110; cv.height = 110;
        global.drawThumb(cv, s, { locked: !known && !pending });
        card.appendChild(cv);
        const info = document.createElement('div');
        info.innerHTML = known || pending
          ? `<h4>${s.name}</h4><div class="muted">${s.shapeName} · ${s.element}</div><div class="stats"><span>💧 ${s.cost} MP</span><span>⚔ ${this.effectText(s)}</span></div><p>${s.desc}</p>`
          : `<h4>??? </h4><div class="muted">${this.unlockText(s)}</div>`;
        if (known) { const b = document.createElement('button'); b.textContent = 'Practice'; b.onclick = () => { show('spellbook', false); this.runLesson(s.id, true).then(() => this.toggleSpellbook()); }; info.appendChild(b); }
        else if (pending) { const b = document.createElement('button'); b.textContent = 'Learn now'; b.className = 'glow'; b.onclick = () => { show('spellbook', false); global.Game.processLessons(); }; info.appendChild(b); }
        card.appendChild(info);
        grid.appendChild(card);
      });
      const r = CAST_RULES;
      $('sb-rules').innerHTML = `Hold the left mouse button and draw a glyph to cast it instantly — draw as fast as you like. ` +
        `Match ≥ ${Math.round(r.successAt * 100)}% to cast · ≥ ${Math.round(r.perfectAt * 100)}% is Perfect (fastest wind-up, full power, may crit). ` +
        `Sloppier casts deal down to ${Math.round(r.minPower * 100)}% damage, cost up to +${Math.round(r.maxExtraMana * 100)}% mana and fly slower. Mana refills every second.`;
    },

    /* ------------------------------ Lessons -------------------------- */
    /** Show demo then require a successful drawing. practice=true allows closing. */
    runLesson(spellId, practice = false) {
      return new Promise(resolve => {
        const s = spellById(spellId);
        this.lesson = { spell: s, practice, resolve, successes: 0, tries: 0 };
        $('lesson-title').textContent = practice ? `Practice: ${s.name}` : `New Spell: ${s.name}`;
        $('lesson-info').innerHTML = `<b>${s.shapeName}</b> · ${s.cost} MP · ${s.desc}<br><span class="muted">Watch the glowing stroke, then trace it yourself. Start at the white dot. ${s.closed ? 'Closed shapes can start anywhere on the outline.' : 'Either direction works.'}</span>`;
        $('lesson-feedback').innerHTML = practice ? 'Draw it as many times as you like.' : 'Draw the shape to learn it.';
        $('lesson-feedback').className = '';
        $('lesson-close').classList.toggle('hidden', !practice);
        show('lesson');
        this.lessonPad.resize(); this.lessonPad.clear(); this.lessonPad.enable();
        this.lessonPad.demo(s);
      });
    },
    async lessonStroke(points) {
      const L = this.lesson; if (!L || L.checking) return;
      L.tries++;
      L.checking = true;
      let res;
      try { res = await SC.evaluateAsync(points); } finally { L.checking = false; }
      if (this.lesson !== L) return;                 // lesson closed while recognizing
      const fb = $('lesson-feedback');
      const right = res && res.spell.id === L.spell.id && res.success;
      if (right) {
        L.successes++;
        fb.className = 'ok';
        fb.innerHTML = `✨ ${res.tier}! ${res.pct}% match — ${Math.round(SC.powerFor(res.quality) * 100)}% power, ${SC.costFor(L.spell, res.quality)} MP.`;
        if (!L.practice) {
          this.lessonPad.disable();
          setTimeout(() => { fb.innerHTML += `<br><b>${L.spell.name} has been added to your Spellbook!</b>`; }, 300);
          setTimeout(() => this.endLesson(true), 1800);
        }
      } else {
        fb.className = 'bad';
        fb.innerHTML = !res ? 'Too small — draw bigger.'
          : res.spell.id !== L.spell.id ? `That looked more like ${res.spell.name} (${res.pct}%). Watch again and try once more.`
          : `Close! ${res.pct}% — you need ${Math.round(CAST_RULES.successAt * 100)}%. Try a smoother, more confident stroke.`;
        setTimeout(() => { if (this.lesson === L && this.lessonPad.points.length === 0) this.lessonPad.demo(L.spell); }, 900);
      }
    },
    endLesson(learned) {
      const L = this.lesson; if (!L) return;
      this.lesson = null;
      this.lessonPad.disable(); this.lessonPad.stopDemo();
      show('lesson', false);
      if (learned && !L.practice) {
        S.learnSpell(L.spell.id);
        this.toast(`Learned ${L.spell.name}!`, 'spell');
        if (L.spell.id === 'wandlight') this.toast('Press L (or draw the check-mark) to light your wand.', 'info');
      }
      L.resolve(learned);
    },

    /* ------------------------------ Menus ---------------------------- */
    togglePause() { show('pause', !isShown('pause')); this.renderPause(); if (!isShown('pause')) this.afterModal(); },
    renderPause() {
      const has = !!S.player && global.Game.mode === 'explore';
      ['pm-save', 'pm-ghost', 'pm-shake', 'pm-bob'].forEach(id => $(id).classList.toggle('hidden', !has));
      $('pm-menu').textContent = global.Game.mode === 'duel' ? 'Leave Duel' : 'Save & Quit to Menu';
      if (!has) return;
      $('pm-ghost').textContent = `Drawing guide: ${S.player.showGhost ? 'ON' : 'OFF'}`;
      $('pm-shake').textContent = `Screen shake: ${S.player.shake === 0 ? 'OFF' : 'ON'}`;
      $('pm-bob').textContent = `Head bob: ${S.player.headBob === 0 ? 'OFF' : 'ON'}`;
    },

    showMenu() {
      show('menu'); show('hud', false);
      $('m-continue').disabled = !S.hasSave();
      $('m-continue').onclick = () => { show('menu', false); global.Game.startStory(true); };
      $('m-new').onclick = () => {
        const b = $('m-new');
        if (S.hasSave() && !b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Overwrite save? Click again'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'New Game'; }, 3000); return; }
        b.dataset.confirm = ''; b.textContent = 'New Game';
        show('menu', false); global.Game.startStory(false);
      };
      $('m-duel').onclick = () => { show('menu', false); this.showDuelSetup(); };
      $('m-how').onclick = () => show('how-to');
    },
  };

  global.UI = UI;
})(window);
