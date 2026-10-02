/* =====================================================================
 * main.js — GAME FLOW (glues world, player, combat, quests and UI)
 * ---------------------------------------------------------------------
 * Game.boot() is called by index.html once Three.js has loaded.
 * Modes: 'menu' | 'explore' (story) | 'duel' (practice vs CPU) | 'dead'
 * Combat is real time: enemies live in the world and fight as soon as
 * they notice you. Draw glyphs as fast as you can to cast.
 * ===================================================================== */
(function (global) {
  'use strict';
  const S = global.GameState, W = global.World, C = global.Combat, UI = global.UI, P = global.Player;
  const { AREAS } = global.GameData;

  const Game = {
    mode: 'menu',
    lessonRunning: false,
    duelCount: 1,

    boot() {
      const canvas = document.getElementById('game-canvas');
      W.init(canvas);
      P.init(canvas);
      C.init();
      UI.init();
      W.resize();

      W.onInteractPrompt = it => UI.setPrompt(it);
      W.onAreaChange = def => { C.saveToState(); UI.setArea(def.name); if (this.mode === 'explore') UI.renderHud(); W.refreshMarkers(); };
      W.onTalk = id => UI.openDialogue(global.Quests.dialogueFor(id));
      W.onShrine = () => UI.openMap();                              // attuned shrine → map with quick travel
      S.Events.on('shrines', () => { UI._guideKey = ''; });
      W.onSecret = (name, text) => UI.openDialogue({ speaker: name, pages: [text], choices: [{ text: 'Close', action: null }] });
      C.onPlayerDeath = () => this.onPlayerDeath();
      C.onDuelEnd = won => this.onDuelEnd(won);
      C.onEngage = e => this.enterArena(e);
      C.onArenaCleared = () => this.onArenaCleared();
      W.onFlee = () => this.exitArena(false);
      S.Events.on('levelup', () => C.syncPlayerFromSave());      // level-ups refill HP & mana
      S.Events.on('gear', () => { C.applyGear(); P.updateGearLook(); });   // staff / hat changed

      // the world (and every enemy) freezes whenever a panel is open
      setInterval(() => {
        const blocking = UI.isBlocking();
        W.paused = !(this.mode === 'explore' || this.mode === 'duel') || blocking;
        if (blocking && P.locked) P.releaseLock();
      }, 50);
      setInterval(() => { if (this.mode === 'explore') this.saveNow(true); }, 10000);
      global.addEventListener('beforeunload', () => { if (this.mode === 'explore') this.saveNow(true); });

      document.getElementById('loading').classList.add('hidden');
      this.toMenu();
    },

    /** Copy live HP/mana/position into the save and write it. */
    saveNow(quiet) {
      if (!S.player || this.mode !== 'explore') return;
      C.saveToState();
      if (W.area && !W.area.arena) { S.player.area = W.areaId; S.player.pos = [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)]; }
      else if (this.arena) { S.player.area = this.arena.srcId; S.player.pos = this.arena.ret.slice(); }   // mid-battle: resume where it started
      S.save();
      if (!quiet) UI.renderHud();
    },

    toMenu() {
      if (this.mode === 'explore') this.saveNow(true);
      this.arena = null;
      this.mode = 'menu';
      P.releaseLock(); P.cancelDraw();
      UI.showDeath(false);
      UI.setHudMode('menu');
      UI.bossBar(null);
      UI.showMenu();
    },

    /** Called when the browser releases the mouse (Esc). Opens the pause menu. */
    onPointerUnlock() {
      if ((this.mode === 'explore' || this.mode === 'duel') && !UI.isBlocking()) UI.togglePause();
    },

    /* ------------------------------ Story ---------------------------- */
    startStory(continueSave) {
      this.arena = null;
      if (!(continueSave && S.load())) S.newGame();
      const pl = S.player;
      if (pl.shake === undefined) pl.shake = 1;
      if (pl.headBob === undefined) pl.headBob = 1;
      this.mode = 'explore';
      UI.setHudMode('explore');
      C.startStory();
      W.loadArea(AREAS[pl.area] ? pl.area : 'great_hall', pl.pos);
      UI.setWandlight(P.wandlightOn);
      P.updateGearLook();
      if (!continueSave) {
        UI.openDialogue({ speaker: 'Thornwick Academy', pages: [
          'You arrive at Thornwick Academy of the Arcane, a castle older than any map.',
          'Here, spells are cast by DRAWING their glyphs. Hold the left mouse button and draw — the spell flies the moment you let go. Draw as fast as you can: there are no turns.',
          'The more precise your stroke, the faster and stronger the spell. Mana refills every second.',
          'Controls: WASD to move, mouse to look, hold LEFT mouse to draw, E to interact, L for Wandlight, Q quest log, B spellbook, Esc pause.',
          'Enemies never attack on their own: walk up to one and press E to battle it. Practise first on the Training Dummy in the east of the Great Hall.',
          'First, learn your starting glyphs. Then speak with Headmistress Vane (the gold "!" in the Great Hall).'],
          choices: [{ text: 'Begin', action: null }] });
      } else this.processLessons();
    },

    /** Run any pending spell lessons, one after another, when nothing else is open. */
    async processLessons() {
      if (this.lessonRunning || this.mode !== 'explore' || !S.player || !S.player.pendingLessons.length) return;
      if (this.arena) return;                         // lessons wait until the battle is over
      if (UI.isBlocking()) return;
      this.lessonRunning = true;
      while (S.player.pendingLessons.length && this.mode === 'explore') {
        const id = S.player.pendingLessons[0];
        const learned = await UI.runLesson(id, false);
        if (!learned) break;
      }
      this.lessonRunning = false;
      UI.renderHud();
    },

    onPlayerDeath() {
      if (this.mode !== 'explore') return;          // the duel ends through onDuelEnd
      this.mode = 'dead';
      this.arena = null;
      P.cancelDraw();
      UI.showDeath(true, 'You were knocked out…');
      setTimeout(() => {
        if (this.mode !== 'dead') return;
        S.restoreFull();
        this.mode = 'explore';
        UI.showDeath(false);
        C.startStory();
        W.loadArea('great_hall', AREAS.great_hall.spawn);
        UI.toast('You wake up by the Great Hall hearth.', 'info');
        S.save();
      }, 2200);
    },

    /* --------------------------- Story battles ----------------------- */
    /**
     * An enemy spotted you (or you hit it): you and its pack move to a battle arena that looks
     * like the current area. Bosses and dragons fight alone in a bigger arena with no escape.
     */
    enterArena(e) {
      if (this.mode !== 'explore' || this.arena || !W.area || W.area.arena) return;
      const solo = e.def.boss || e.def.dragon;
      const pack = [e];                               // one enemy per battle: the one you chose to fight
      this.arena = { srcId: W.areaId, ret: [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)], yaw: P.yaw,
        foes: pack.map(x => ({ key: x.id, type: x.type, hp: x.hp })), solo };
      P.cancelDraw();
      C.saveToState();
      S.player.area = this.arena.srcId; S.player.pos = this.arena.ret.slice(); S.save();
      const size = e.def.dragon ? 46 : solo ? 36 : 30;
      W.loadArena(this.arena.srcId, size, !solo);
      const n = pack.length, back = (size / 2 - 4) - (e.def.dragon ? 18 : solo ? 13 : 10);   // you start at the south edge
      pack.forEach((x, i) => {
        const ent = C.spawnEnemy(x.type, (i - (n - 1) / 2) * 3.5, back - (i % 2) * 2, x.id);
        ent.hp = Math.max(1, x.hp);
        ent.ai.alerted = true; ent.ai.cd = 1.2 + i * 0.5;      // a moment to get your bearings
      });
      UI.screenFlash('#ffffff', 0.55, 600);
      UI.toast(e.def.training ? 'Training! Draw any attack glyph at the dummy.' : `Battle! ${e.def.name}`, 'quest');
      if (e.def.training) {            // short lesson: interrupting and Levitate
        const tip = (ms, text) => setTimeout(() => { if (this.arena && this.arena.training) UI.toast(text, 'spell'); }, ms);
        this.arena.training = true;
        tip(4000, 'When the dummy glows, hit it with a PERFECT or GREAT cast to INTERRUPT its punch.');
        tip(9000, 'Or draw Levitate (two rising chevrons) to float, so its punch misses.');
        tip(14000, 'Weak spots: the nameplate shows what hurts it most (🔥⚡ here).');
      }
      UI.toast(solo ? 'Stand your ground and cast! No escape from this one.' : 'Stand your ground and cast! Press F to flee.', 'info');
    },
    onArenaCleared() {
      setTimeout(() => { if (this.arena && this.mode === 'explore') { UI.toast('Victory!', 'quest'); this.exitArena(true); } }, 1300);
    },
    /** Leave the arena: back to the exact spot the battle started. */
    exitArena(won) {
      const a = this.arena; if (!a) return;
      this.arena = null;
      if (won && !a.training) a.foes.forEach(f => C.defeated.add(f.key));   // the dummy is always there
      C.graceUntil = performance.now() + (won ? 2500 : 6000);   // a few seconds before anything can grab you again
      if (!won) UI.toast('You escaped!', 'info');
      W.loadArea(a.srcId, a.ret, a.yaw - Math.PI);
      UI.renderHud();
      this.processLessons();
    },

    /* --------------------------- Practice duel ----------------------- */
    startDuel(count) {
      if (this.mode === 'explore') this.saveNow(true);
      this.arena = null;
      this.duelCount = count;
      this.mode = 'duel';
      UI.setHudMode('duel');
      C.startDuel(count);
      UI.duelStart();
      UI.toast(`Practice duel: defeat ${count} CPU wizard${count > 1 ? 's' : ''}! All spells unlocked.`, 'quest');
    },
    onDuelEnd(won) {
      const secs = C.duel ? Math.round((performance.now() - C.duel.start) / 1000) : 0;
      P.cancelDraw();
      setTimeout(() => { if (this.mode === 'duel') UI.showDuelResult(won, secs); }, won ? 900 : 1200);
    },
  };

  global.Game = Game;
})(window);
