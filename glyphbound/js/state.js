/* =====================================================================
 * state.js — GAME STATE, EVENTS, LEVELING & SAVING
 * ---------------------------------------------------------------------
 * Holds the player's persistent progress and a tiny event bus that the
 * UI listens to. Saves to localStorage under SAVE_KEY.
 * Requires: data.js
 * ===================================================================== */
(function (global) {
  'use strict';
  const { SPELLS, PROGRESSION, ITEMS, ITEM_PRICES } = global.GameData;
  const SAVE_KEY = 'thornwick_save_v1';

  /* ----------------------------- Events ----------------------------- */
  const listeners = {};
  const Events = {
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    emit(name, data) { (listeners[name] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); },
  };

  /* ------------------------------ State ----------------------------- */
  function freshPlayer() {
    const p = {
      version: 1,
      level: 1, xp: 0,
      hp: PROGRESSION.maxHp(1), mana: PROGRESSION.maxMana(1),
      spells: [],            // learned spell ids (in spellbook)
      pendingLessons: [],    // granted but not yet practised
      inventory: {},         // itemId -> count
      quests: {},            // questId -> { state:'active'|'done', progress:{} }
      collected: [],         // pickup ids already taken
      secrets: [],           // secret ids discovered
      area: 'great_hall', pos: [0, 6],
      stats: { kills: 0, casts: 0, perfects: 0 },
      showGhost: true,
      equipped: { staff: null, hat: null },   // equipment item ids (see ITEMS with a slot)
      gold: 0,
      shrines: [],            // attuned quick-travel shrine ids
      tracked: null,          // quest id followed by the guide (null = first active quest)
    };
    SPELLS.filter(s => s.unlock.type === 'start').forEach(s => p.pendingLessons.push(s.id));
    return p;
  }

  const State = {
    player: null,
    Events,

    hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
    newGame() { this.player = freshPlayer(); this.save(); },
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        this.player = Object.assign(freshPlayer(), data);
        this.player.pendingLessons = data.pendingLessons || [];
        // Drop ids for spells that no longer exist in data.js
        const ids = new Set(SPELLS.map(s => s.id));
        this.player.spells = this.player.spells.filter(id => ids.has(id));
        this.player.pendingLessons = this.player.pendingLessons.filter(id => ids.has(id));
        // A spell's shape changed since it was learned (shapeRev bumped)? Teach the new shape.
        const revs = this.player.shapeRevs || (this.player.shapeRevs = {});
        SPELLS.forEach(s => {
          if (this.player.spells.includes(s.id) && (revs[s.id] || 1) < (s.shapeRev || 1)) {
            this.player.spells = this.player.spells.filter(id => id !== s.id);
            if (!this.player.pendingLessons.includes(s.id)) this.player.pendingLessons.push(s.id);
            Events.emit('toast', { text: `${s.name} has a new glyph shape. Relearn it!`, kind: 'spell' });
          }
        });
        this.syncUnlocks();
        return true;
      } catch (e) { console.warn('Save could not be loaded', e); return false; }
    },
    save() {
      if (!this.player) return;
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.player)); Events.emit('saved'); }
      catch (e) { console.warn('Save failed', e); }
    },
    deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },

    /* ------------------------- Derived stats ------------------------ */
    maxHp() { return PROGRESSION.maxHp(this.player.level) + this.bonus('maxHp'); },
    maxMana() { return PROGRESSION.maxMana(this.player.level) + this.bonus('maxMana'); },
    power() { return PROGRESSION.spellPower(this.player.level) * (1 + this.bonus('power')); },
    manaRegen() { return PROGRESSION.manaRegen(this.player.level) + this.bonus('regen'); },

    /* --------------------------- Equipment --------------------------- */
    /** Item definitions currently equipped. */
    gear() {
      const eq = (this.player && this.player.equipped) || {};
      return ['staff', 'hat'].map(sl => eq[sl] && ITEMS[eq[sl]]).filter(Boolean);
    },
    /** Sum of one numeric stat over equipped items (power, maxHp, maxMana, regen, shield, heal, cdr, crit). */
    bonus(key) { return this.gear().reduce((a, it) => a + ((it.stats && it.stats[key]) || 0), 0); },
    /** Extra damage % for one spell from equipment. */
    boostFor(spellId) { return this.gear().reduce((a, it) => a + ((it.stats && it.stats.boost && it.stats.boost[spellId]) || 0), 0); },
    /** Spells granted by equipped items. */
    grantedSpells() { return [].concat(...this.gear().map(it => (it.stats && it.stats.grants) || [])); },
    owns(itemId) { return this.itemCount(itemId) > 0; },

    /* ----------------------------- Gold ------------------------------ */
    addGold(n, quiet) {
      if (!n) return;
      this.player.gold = Math.max(0, (this.player.gold || 0) + Math.round(n));
      if (!quiet && n > 0) Events.emit('toast', { text: `+${Math.round(n)} gold`, kind: 'gold' });
      Events.emit('gold');
    },
    priceOf(itemId, override) { const it = ITEMS[itemId]; return override || it.price || ITEM_PRICES[it.rarity] || 50; },
    sellPrice(itemId) { return Math.max(1, Math.round(this.priceOf(itemId) * 0.4)); },
    /** Buy one item. Equipment can only be owned once; potions stack. */
    buy(itemId, price) {
      const it = ITEMS[itemId];
      if (!it || (it.slot && this.owns(itemId))) return 'owned';
      if ((this.player.gold || 0) < price) return 'poor';
      this.addGold(-price, true);
      this.addItem(itemId);
      this.save(); Events.emit('quests');
      return 'ok';
    },
    /** Sell equipment you are not wearing. */
    sell(itemId) {
      const it = ITEMS[itemId];
      if (!it || !it.slot || !this.owns(itemId) || Object.values(this.player.equipped || {}).includes(itemId)) return false;
      this.addItem(itemId, -1);
      this.addGold(this.sellPrice(itemId), true);
      this.save(); Events.emit('quests');
      return true;
    },
    equip(itemId) {
      const it = ITEMS[itemId];
      if (!it || !it.slot || !this.owns(itemId)) return false;
      this.player.equipped = this.player.equipped || { staff: null, hat: null };
      this.player.equipped[it.slot] = itemId;
      this.save(); Events.emit('gear'); Events.emit('stats');
      return true;
    },
    unequip(slot) {
      if (!this.player.equipped) return;
      this.player.equipped[slot] = null;
      this.save(); Events.emit('gear'); Events.emit('stats');
    },
    xpToNext() { return PROGRESSION.xpToNext(this.player.level); },
    restoreFull() { this.player.hp = this.maxHp(); this.player.mana = this.maxMana(); Events.emit('stats'); },

    /* --------------------------- Progress --------------------------- */
    addXp(amount) {
      const p = this.player;
      if (p.level >= PROGRESSION.maxLevel) return;
      p.xp += amount;
      Events.emit('toast', { text: `+${amount} XP`, kind: 'xp' });
      while (p.level < PROGRESSION.maxLevel && p.xp >= this.xpToNext()) {
        p.xp -= this.xpToNext();
        p.level++;
        p.hp = this.maxHp(); p.mana = this.maxMana();
        Events.emit('levelup', { level: p.level });
      }
      this.syncUnlocks();
      Events.emit('stats');
    },

    /**
     * Grant any spell whose unlock condition is already met (level reached, quest done,
     * secret found). Also catches up old saves when new spells are added to data.js.
     */
    syncUnlocks() {
      const p = this.player;
      SPELLS.forEach(s => {
        const u = s.unlock;
        const met = (u.type === 'start') || (u.type === 'level' && p.level >= u.level)
          || (u.type === 'quest' && p.quests[u.quest] && p.quests[u.quest].state === 'done')
          || (u.type === 'secret' && p.secrets.includes(u.secret));
        if (met) this.grantSpell(s.id);
      });
    },

    knows(spellId) { return this.player.spells.includes(spellId); },

    /** Queue a spell lesson (the player must practise it before it is learned). */
    grantSpell(spellId) {
      const p = this.player;
      if (p.spells.includes(spellId) || p.pendingLessons.includes(spellId)) return;
      p.pendingLessons.push(spellId);
      const spell = SPELLS.find(s => s.id === spellId);
      Events.emit('toast', { text: `New spell discovered: ${spell.name}!`, kind: 'spell' });
      Events.emit('lessons');
    },

    /** Called when practice succeeds. */
    learnSpell(spellId) {
      const p = this.player;
      p.pendingLessons = p.pendingLessons.filter(id => id !== spellId);
      if (!p.spells.includes(spellId)) p.spells.push(spellId);
      const spell = SPELLS.find(s => s.id === spellId);
      (p.shapeRevs || (p.shapeRevs = {}))[spellId] = (spell && spell.shapeRev) || 1;
      this.save();
      Events.emit('stats');
    },

    addItem(id, n = 1) { const inv = this.player.inventory; inv[id] = (inv[id] || 0) + n; if (inv[id] <= 0) delete inv[id]; },
    itemCount(id) { return this.player.inventory[id] || 0; },
  };

  global.GameState = State;
})(window);
