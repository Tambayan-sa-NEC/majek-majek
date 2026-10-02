/* =====================================================================
 * quests.js — QUESTS, NPC DIALOGUE & SECRETS
 * ---------------------------------------------------------------------
 * Quest states: 'locked' -> 'available' -> 'active' -> 'ready' -> 'done'
 *   ready = all objectives finished, waiting to be turned in.
 * Talking to an NPC builds a dialogue from the quest data automatically.
 * Requires: data.js, state.js
 * ===================================================================== */
(function (global) {
  'use strict';
  const { QUESTS, NPCS, SPELLS, SECRETS, ITEMS } = global.GameData;
  const S = global.GameState;
  const E = S.Events;

  const byId = id => QUESTS.find(q => q.id === id);

  const Quests = {
    get: byId,

    stateOf(id) {
      const q = byId(id), rec = S.player.quests[id];
      if (rec && rec.state === 'done') return 'done';
      if (rec && rec.state === 'active') return this.objectivesDone(q) ? 'ready' : 'active';
      const req = q.requires || {};
      if (req.level && S.player.level < req.level) return 'locked';
      if (req.quests && !req.quests.every(r => this.stateOf(r) === 'done')) return 'locked';
      return 'available';
    },

    progressOf(q, i) {
      const o = q.objectives[i], rec = S.player.quests[q.id];
      if (!rec) return 0;
      if (o.type === 'collect') return Math.min(o.count, S.itemCount(o.target));
      return rec.progress[i] || 0;
    },
    goalOf(o) { return o.type === 'talk' ? 1 : o.count; },
    objectivesDone(q) { return q.objectives.every((o, i) => this.progressOf(q, i) >= this.goalOf(o)); },

    isActive(id) { const s = this.stateOf(id); return s === 'active' || s === 'ready'; },

    accept(id) {
      const q = byId(id);
      S.player.quests[id] = { state: 'active', progress: {} };
      (q.giveItems || []).forEach(it => { S.addItem(it); E.emit('toast', { text: `Received: ${ITEMS[it].name}`, kind: 'item' }); });
      E.emit('toast', { text: `Quest accepted: ${q.title}`, kind: 'quest' });
      E.emit('quests');
      S.save();
    },

    complete(id) {
      const q = byId(id);
      S.player.quests[id] = { state: 'done', progress: {} };
      q.objectives.forEach(o => { if (o.type === 'collect') S.addItem(o.target, -o.count); });
      (q.giveItems || []).forEach(it => S.addItem(it, -S.itemCount(it)));
      E.emit('toast', { text: `Quest complete: ${q.title}`, kind: 'quest' });
      SPELLS.filter(s => s.unlock.type === 'quest' && s.unlock.quest === id).forEach(s => S.grantSpell(s.id));
      (q.rewards.items || []).forEach(it => {        // equipment rewards
        if (S.owns(it)) return;
        S.addItem(it);
        E.emit('toast', { text: `Reward: ${ITEMS[it].icon} ${ITEMS[it].name}! Press I to equip.`, kind: 'loot' });
      });
      S.addGold(q.rewards.gold !== undefined ? q.rewards.gold : Math.round((q.rewards.xp || 0) * 0.5));
      S.addXp(q.rewards.xp || 0);
      E.emit('quests');
      S.save();
    },

    /* ---------------- Objective hooks (called by the game) ----------- */
    onKill(enemyType) {
      QUESTS.forEach(q => {
        if (this.stateOf(q.id) !== 'active') return;
        q.objectives.forEach((o, i) => {
          if (o.type === 'kill' && o.target === enemyType) {
            const rec = S.player.quests[q.id];
            rec.progress[i] = Math.min(o.count, (rec.progress[i] || 0) + 1);
            E.emit('toast', { text: `${o.text}: ${rec.progress[i]}/${o.count}`, kind: 'quest' });
          }
        });
      });
      E.emit('quests');
    },
    onCollect(itemId) {
      S.addItem(itemId);
      const it = ITEMS[itemId];
      E.emit('toast', it.slot ? { text: `Found: ${it.icon} ${it.name}! Press I to equip.`, kind: 'loot' } : { text: `Picked up: ${it.name}`, kind: 'item' });
      E.emit('quests');
      S.save();
    },

    /* ----------------------------- Dialogue -------------------------- */
    /**
     * Builds a dialogue for an NPC: { speaker, pages:[text], choices:[{text, action}] }.
     * Priority: turn-in > talk-objective > quest offer > active reminder > idle lines.
     */
    dialogueFor(npcId) {
      const npc = NPCS[npcId];
      const speaker = npc.name;
      for (const q of QUESTS) {
        const st = this.stateOf(q.id);
        const talkIdx = q.objectives.findIndex(o => o.type === 'talk' && o.target === npcId);
        if (st === 'active' && talkIdx >= 0) {
          S.player.quests[q.id].progress[talkIdx] = 1;
        }
        if (q.turnIn === npcId && this.stateOf(q.id) === 'ready') {
          return { speaker, pages: q.dialogue.complete, choices: [{ text: 'Thank you!', action: () => this.complete(q.id) }] };
        }
      }
      for (const q of QUESTS) {
        if (q.giver === npcId && this.stateOf(q.id) === 'available') {
          return { speaker, pages: q.dialogue.offer, questTitle: q.title,
                   choices: [{ text: `Accept: ${q.title}`, action: () => this.accept(q.id) }, { text: 'Maybe later.', action: null }] };
        }
      }
      for (const q of QUESTS) {
        if ((q.giver === npcId || q.turnIn === npcId) && this.stateOf(q.id) === 'active') {
          return { speaker, pages: q.dialogue.active, choices: [{ text: 'On my way.', action: null }] };
        }
      }
      const locked = QUESTS.find(q => q.giver === npcId && this.stateOf(q.id) === 'locked' && (q.requires.level || 0) > S.player.level
        && (!q.requires.quests || q.requires.quests.every(r => this.stateOf(r) === 'done')));
      npc._line = ((npc._line || 0) + 1) % npc.lines.length;
      const pages = [npc.lines[npc._line]];
      if (locked) pages.push(`(Come back at level ${locked.requires.level}. I may have a task for you.)`);
      const choices = [{ text: 'Farewell.', action: null }];
      if (npc.shop) choices.unshift({ text: '🛒 Browse wares', action: () => global.UI.openShop(npcId) });
      return { speaker, pages, choices };
    },

    /* ------------------------------ Guide ---------------------------- */
    /** The quest the guide follows: the tracked one if still active, else the first active, else the first available. */
    guideQuest() {
      const tr = S.player.tracked;
      if (tr && this.isActive(tr)) return byId(tr);
      return QUESTS.find(q => this.isActive(q.id)) || QUESTS.find(q => this.stateOf(q.id) === 'available') || null;
    },
    /** Where to go next for a quest: { area, x, z, text }. */
    guideFor(q) {
      if (!q) return null;
      const st = this.stateOf(q.id), npcAt = (id, verb) => { const n = NPCS[id]; return { area: n.area, x: n.pos[0], z: n.pos[1], text: `${verb} ${n.name}` }; };
      if (st === 'available') return npcAt(q.giver, 'Talk to');
      if (st === 'ready') return npcAt(q.turnIn, 'Return to');
      if (st !== 'active') return null;
      for (let i = 0; i < q.objectives.length; i++) {
        const o = q.objectives[i];
        if (this.progressOf(q, i) >= this.goalOf(o)) continue;
        if (o.type === 'talk') return npcAt(o.target, 'Talk to');
        for (const [aid, a] of Object.entries(global.GameData.AREAS)) {
          if (a.arena) continue;
          if (o.type === 'kill') { const e = a.enemies.find(x => x.type === o.target); if (e) return { area: aid, x: e.x, z: e.z, text: o.text }; }
          if (o.type === 'collect') { const p = (a.pickups || []).find(x => x.item === o.target && !S.player.collected.includes(x.id)); if (p) return { area: aid, x: p.x, z: p.z, text: o.text }; }
        }
        return { area: null, text: o.text };
      }
      return null;
    },
    /** Next door to take from `from` toward area `to` (breadth-first over the doors), or null if already there. */
    routeDoor(from, to) {
      if (!to || from === to) return null;
      const AREAS = global.GameData.AREAS, prev = { [from]: null }, queue = [from];
      while (queue.length) {
        const a = queue.shift();
        if (a === to) break;
        for (const d of AREAS[a].doors) if (!(d.to in prev)) { prev[d.to] = { a, d }; queue.push(d.to); }
      }
      if (!(to in prev)) return null;
      let step = to;
      while (prev[step] && prev[step].a !== from) step = prev[step].a;
      return prev[step] ? prev[step].d : null;
    },

    /** Quest marker for an NPC: '!' (new quest), '?' (turn in), '…' (in progress) or ''. */
    markerFor(npcId) {
      let mark = '';
      for (const q of QUESTS) {
        const st = this.stateOf(q.id);
        if (q.turnIn === npcId && st === 'ready') return '?';
        if (st === 'active' && q.objectives.some(o => o.type === 'talk' && o.target === npcId)) return '?';
        if (q.giver === npcId && st === 'available') mark = '!';
      }
      return mark;
    },

    /* ------------------------------ Secrets -------------------------- */
    discoverSecret(id) {
      const sec = SECRETS[id];
      if (S.player.secrets.includes(id)) return { text: `${sec.name}: its magic is already yours.` };
      if (S.player.level < sec.minLevel) return { text: sec.locked };
      S.player.secrets.push(id);
      SPELLS.filter(s => s.unlock.type === 'secret' && s.unlock.secret === id).forEach(s => S.grantSpell(s.id));
      S.addXp(50);
      S.save();
      return { text: sec.text, discovered: true };
    },
  };

  global.Quests = Quests;
})(window);
