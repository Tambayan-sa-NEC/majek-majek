/* =====================================================================
 * data.js — ALL EDITABLE GAME CONTENT (real-time, first-person edition)
 * ---------------------------------------------------------------------
 * Spells, statuses, enemies (incl. dragons), NPCs, quests, items, areas,
 * doors, level curve and casting rules live here as plain data. Add
 * entries and the rest of the game picks them up automatically.
 * Requires: recognizer.js (for ShapeKit)
 * ===================================================================== */
(function (global) {
  'use strict';
  const K = global.ShapeKit;

  // Lemniscate (infinity) stroke for Dragon Ward, recognizer-tested (docs/ART_GUIDE.md §4.3)
  const INFINITY = [];
  for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI * 2, d = 1 + Math.sin(t) ** 2; INFINITY.push([0.5 + 0.5 * Math.cos(t) / d, 0.5 + 0.8 * Math.sin(t) * Math.cos(t) / d]); }

  /* ----------------------------------------------------------------
   * SPELLS
   *  cost      mana (real-time: mana regenerates every second)
   *  power     damage (attacks), HP healed, shield absorb, or damage per shot (summons)
   *  delivery  how the spell travels:
   *    'bolt'    projectile: speed (m/s), radius (hit size), optional knockback (m)
   *    'strike'  instant hit at the aimed enemy/point: range, aoe (radius)
   *    'beam'    channelled beam: range, charge (s), hold (s), ticks
   *    'cone'    channelled cone: range, angle (deg), hold (s), ticks
   *    'bomb'    charged orb: charge (s), speed, aoe
   *    'line'    huge sweep along your aim: range, width
   *    'self'    affects you: duration (s)
   *    'summon'  ally: duration (s), every (s between attacks)
   *    'toggle'  Wandlight on/off
   *  status    optional status for the target: {id, chance, secs, value}
   *  unlock    {type:'start'} | {type:'level', level} | {type:'quest', quest} | {type:'secret', secret}
   *  points    the stroke to draw (unit square, y down); closed:true = start anywhere on the outline
   *  shapeRev  bump when a learned spell's shape changes (players get a new lesson)
   * ---------------------------------------------------------------- */
  const SPELLS = [
    { id: 'fire_bolt', name: 'Fire Bolt', cost: 18, power: 26, kind: 'attack', element: 'fire', color: 0xff7a2a,
      delivery: 'bolt', speed: 40, radius: 0.45,
      status: { id: 'burn', chance: 0.35, secs: 4, value: 5 },
      shapeName: 'Rising Triangle', closed: true, points: K.poly([[0, 1], [0.5, 0], [1, 1], [0, 1]]),
      desc: 'Hurls a bolt of flame. May set the target Burning.', unlock: { type: 'start' } },

    { id: 'water_bullet', name: 'Water Bullet', cost: 14, power: 20, kind: 'attack', element: 'water', color: 0x2f9bff,
      delivery: 'bolt', speed: 45, radius: 0.45,
      status: { id: 'soaked', chance: 1, secs: 5 },
      shapeName: 'Falling Triangle', closed: true, points: K.poly([[0, 0], [1, 0], [0.5, 1], [0, 0]]),
      desc: 'A high-pressure water shot. Soaks the target (Lightning deals x1.5) and douses Burning.', unlock: { type: 'start' } },

    { id: 'wandlight', name: 'Wandlight', cost: 0, power: 0, kind: 'utility', element: 'light', color: 0xfff1d6,
      delivery: 'toggle',
      shapeName: 'Check Mark', points: K.poly([[0, 0.6], [0.3, 1], [1, 0]]),
      desc: 'Toggles a warm light at your wand tip (also: L key). Reveals hidden runes and makes foes easier to see.', unlock: { type: 'start' } },

    { id: 'levitate', name: 'Levitate', cost: 20, power: 0, kind: 'utility', element: 'air', color: 0xbfe6ff,
      delivery: 'self', duration: 2.5, cooldown: 5,
      shapeName: 'Rising Chevrons', points: K.poly([[0, 0.55], [0.5, 0.2], [1, 0.55], [1, 0.8], [0.5, 0.45], [0, 0.8]]),
      desc: 'Float into the air for 2.5 seconds. Enemy shots, breath and ground attacks miss you while you float.', unlock: { type: 'start' } },

    { id: 'shield', name: 'Shield', cost: 35, power: 45, kind: 'shield', element: 'arcane', color: 0x2ee6c3,
      delivery: 'self', duration: 8,
      shapeName: 'Circle', closed: true, points: K.circle(),
      desc: 'Conjures a ward that absorbs damage for 8 seconds.', unlock: { type: 'quest', quest: 'q_first_sparks' } },

    { id: 'poison', name: 'Poison', cost: 25, power: 6, kind: 'attack', element: 'poison', color: 0x8ee03a,
      delivery: 'bolt', speed: 30, radius: 0.5,
      status: { id: 'poison', chance: 1, secs: 6, value: 6 },
      shapeName: 'Serpent S', points: K.join(K.arc(0.5, 0.25, 0.25, 20, 270, 24), K.arc(0.5, 0.75, 0.25, 90, -160, 24)),
      desc: 'Toxic orb that Poisons the target for 6 seconds.', unlock: { type: 'quest', quest: 'q_lantern' } },

    { id: 'lightning', name: 'Lightning Strike', cost: 40, power: 44, kind: 'attack', element: 'lightning', color: 0xfff04d,
      delivery: 'strike', range: 35, aoe: 1.6,
      status: { id: 'stun', chance: 0.3, secs: 1.5 },
      shapeName: 'Bolt', points: K.poly([[0.65, 0], [0.25, 0.5], [0.75, 0.5], [0.35, 1]]),
      desc: 'Calls lightning down on whatever you aim at. May Stun. x1.5 damage on Soaked targets.', unlock: { type: 'level', level: 3 } },

    { id: 'gust', name: 'Gust', cost: 20, power: 14, kind: 'attack', element: 'wind', color: 0xf2d49b,
      delivery: 'bolt', speed: 30, radius: 1.6, knockback: 4,
      status: { id: 'blind', chance: 0.8, secs: 4 },
      shapeName: 'Wave', points: K.wave(2, 0.25),
      desc: 'A wide blast of wind: knocks foes back and Blinds them (they miss more).', unlock: { type: 'level', level: 2 } },

    { id: 'cause_fear', name: 'Cause Fear', cost: 35, power: 0, kind: 'debuff', element: 'mind', color: 0xa34dff,
      delivery: 'bolt', speed: 28, radius: 0.6,
      status: { id: 'fear', chance: 0.9, secs: 5 },
      shapeName: 'Jagged W', points: K.poly([[0, 0], [0.25, 1], [0.5, 0.35], [0.75, 1], [1, 0]]),
      desc: 'Fills the target with dread: it flees and hits 40% softer for 5 seconds.', unlock: { type: 'quest', quest: 'q_armor' } },

    { id: 'sleep', name: 'Sleep', cost: 40, power: 0, kind: 'debuff', element: 'mind', color: 0xa9b4ff,
      delivery: 'bolt', speed: 12, radius: 0.9,
      status: { id: 'sleep', chance: 0.85, secs: 6 },
      shapeName: 'Zed', points: K.poly([[0, 0], [1, 0], [0, 1], [1, 1]]),
      desc: 'A slow drifting cloud. The target Sleeps for 6 seconds; damage wakes it.', unlock: { type: 'quest', quest: 'q_letter' } },

    { id: 'dragons_breath', name: "Dragon's Breath", cost: 70, power: 64, kind: 'attack', element: 'fire', color: 0xff4a1c,
      delivery: 'cone', range: 8, angle: 32, hold: 1.2, ticks: 8,
      status: { id: 'burn', chance: 0.6, secs: 5, value: 8 },
      shapeName: 'Spiral', points: K.spiral(2),
      desc: 'A roaring cone of dragonfire in front of you. Burns everything inside.', unlock: { type: 'level', level: 5 } },

    { id: 'heal', name: 'Heal', cost: 45, power: 55, kind: 'heal', element: 'life', color: 0x3dff8e,
      delivery: 'self', duration: 0,
      shapeName: 'Heart', closed: true, points: K.heart(),
      desc: 'Restores health and cures Poison and Burning.', unlock: { type: 'quest', quest: 'q_moonpetals' } },

    { id: 'spawn_ghost', name: 'Spawn Ghost', cost: 60, power: 14, kind: 'summon', element: 'spirit', color: 0xdce9ff, shapeRev: 2,
      delivery: 'summon', duration: 12, every: 1.4,
      // Pigtail replaced the old square (92% similar to Shield's circle). See docs/ART_GUIDE.md §4.2
      shapeName: 'Pigtail', points: K.join(K.poly([[0, 1], [0.5, 0.45]]), K.arc(0.5, 0.25, 0.2, 270, 630, 32), K.poly([[0.5, 0.45], [1, 1]])),
      desc: 'Summons a spectral ally that shoots your foes for 12 seconds.', unlock: { type: 'secret', secret: 'weeping_rune' } },

    { id: 'spirit_bomb', name: 'Spirit Bomb', cost: 120, power: 115, kind: 'attack', element: 'spirit', color: 0xff5cdb,
      delivery: 'bomb', charge: 0.5, speed: 25, aoe: 4.5,
      shapeName: 'Five-Point Star', closed: true, points: K.star(5),
      desc: 'Gathers spirit energy into a colossal orb that explodes on impact.', unlock: { type: 'secret', secret: 'starfall_altar' } },

    { id: 'kamehameha', name: 'Kamehameha Wave', cost: 150, power: 150, kind: 'attack', element: 'energy', color: 0x3d5cff,
      delivery: 'beam', range: 28, charge: 0.4, hold: 0.6, ticks: 6,
      shapeName: 'Loop & Release', points: K.join(K.arc(0.15, 0.5, 0.15, 0, 360, 32), K.poly([[0.3, 0.5], [1, 0.5]])),
      desc: 'Focuses all your energy into a devastating beam.', unlock: { type: 'level', level: 7 } },

    // ---- dragon spells (shapes recognizer-tested, docs/ART_GUIDE.md §4.3)
    { id: 'summon_wyrmling', name: 'Summon Wyrmling', cost: 90, power: 20, kind: 'summon', element: 'draconic', color: 0xe8243c,
      delivery: 'summon', duration: 15, every: 1.2,
      shapeName: 'Wings M', points: K.poly([[0, 1], [0.25, 0], [0.5, 0.6], [0.75, 0], [1, 1]]),
      desc: 'Hatches a loyal wyrmling that breathes fire on your foes for 15 seconds.', unlock: { type: 'quest', quest: 'q_dragon_egg' } },

    { id: 'dragon_ward', name: 'Dragon Ward', cost: 50, power: 0, kind: 'shield', element: 'draconic', color: 0xe8243c,
      delivery: 'self', duration: 8,
      shapeName: 'Infinity', closed: true, points: INFINITY,
      desc: 'For 8 seconds, dragonfire and breath deal 80% less damage to you (other fire 50% less).', unlock: { type: 'quest', quest: 'q_frost' } },

    { id: 'dragon_bind', name: 'Dragon Bind', cost: 60, power: 20, kind: 'debuff', element: 'draconic', color: 0xffc23d,
      delivery: 'strike', range: 30, aoe: 1.2,
      status: { id: 'bound', chance: 1, secs: 3 },
      shapeName: 'Shackle U', points: K.join(K.poly([[0, 0], [0, 0.5]]), K.arc(0.5, 0.5, 0.5, 180, 360, 24), K.poly([[1, 0.5], [1, 0]])),
      desc: 'Golden chains pin the target for 3 seconds. Flying dragons are dragged to the ground.', unlock: { type: 'quest', quest: 'q_storm' } },

    { id: 'summon_elder', name: 'Summon Elder Dragon', cost: 200, power: 260, kind: 'attack', element: 'draconic', color: 0xe8243c,
      delivery: 'line', range: 40, width: 3.5, cooldown: 30,
      shapeName: 'Arrowhead', points: K.poly([[0.5, 1], [0.5, 0], [0.15, 0.35], [0.5, 0], [0.85, 0.35]]),
      desc: 'A spectral elder dragon sweeps the battlefield along your aim. 30 s cooldown.', unlock: { type: 'quest', quest: 'q_ashmaw' } },
  ];

  /* ----------------------------------------------------------------
   * STATUSES (durations are in seconds; value = damage per second)
   * ---------------------------------------------------------------- */
  const STATUSES = {
    burn:    { name: 'Burning',  icon: '🔥', color: 0xff7a2a, bad: true,  desc: 'Takes fire damage every second.' },
    poison:  { name: 'Poisoned', icon: '☠️', color: 0x8ee03a, bad: true,  desc: 'Takes poison damage every second.' },
    soaked:  { name: 'Soaked',   icon: '💧', color: 0x2f9bff, bad: true,  desc: 'Lightning deals 50% more damage.' },
    stun:    { name: 'Stunned',  icon: '💫', color: 0xfff04d, bad: true,  desc: 'Cannot act.' },
    sleep:   { name: 'Asleep',   icon: '💤', color: 0xa9b4ff, bad: true,  desc: 'Cannot act. Damage wakes it.' },
    fear:    { name: 'Afraid',   icon: '😱', color: 0xa34dff, bad: true,  desc: 'Flees and deals 40% less damage.' },
    blind:   { name: 'Blinded',  icon: '🌫️', color: 0xf2d49b, bad: true,  desc: 'Misses far more often.' },
    chilled: { name: 'Chilled',  icon: '❄️', color: 0xbff4ff, bad: true,  desc: 'Moves 30% slower.' },
    bound:   { name: 'Bound',    icon: '⛓️', color: 0xffc23d, bad: true,  desc: 'Pinned in place; flying dragons are grounded.' },
    shield:  { name: 'Shielded', icon: '🛡️', color: 0x2ee6c3, bad: false, desc: 'Absorbs incoming damage.' },
    ward:    { name: 'Dragon Ward', icon: '🐉', color: 0xe8243c, bad: false, desc: 'Dragonfire deals 80% less damage.' },
    levitate: { name: 'Levitating', icon: '🪶', color: 0xbfe6ff, bad: false, desc: 'Floating: enemy attacks miss you.' },
  };

  /* ----------------------------------------------------------------
   * ENEMIES (real-time)
   *  speed     move speed (m/s)      range  attack reach (m)
   *  cd        seconds between attacks   tell  wind-up warning (ms) before each attack
   *  proj      projectile speed for ranged attacks (omit = melee)
   *  moves     picked by weight: 'attack' | 'status' | 'heal' | 'shield' | 'drain'
   *  dragon    {abilities:[...], flying} — see combat.js dragon AI
   *  look      procedural mesh archetype + colors (models.js)
   * ---------------------------------------------------------------- */
  const ENEMIES = {
    // never really hurts you (HP can't drop below 1), slow obvious wind-ups: practise interrupting and Levitate
    training_dummy: { name: 'Training Dummy', level: 1, hp: 400, atk: [3, 4], acc: 1, dodge: 0, xp: 0, gold: 0, training: true,
      speed: 0, range: 2, cd: 3.4, tell: 1400,
      weak: ['fire', 'lightning'], resist: [], immune: [],
      moves: [{ name: 'Straw Punch', type: 'attack', power: 1, weight: 1 }],
      look: { shape: 'dummy', color: 0xc8a060, glow: 0xff5a3a, scale: 1 } },

    dust_sprite: { name: 'Dust Sprite', level: 1, hp: 70, atk: [5, 8], acc: 0.85, dodge: 0.05, xp: 22,
      speed: 2.6, range: 1.8, cd: 1.8, tell: 300,
      weak: ['fire'], resist: [], immune: [],
      moves: [{ name: 'Dust Swipe', type: 'attack', power: 1, weight: 3 },
              { name: 'Sneeze Cloud', type: 'status', status: 'blind', secs: 3, weight: 1 }],
      look: { shape: 'sprite', color: 0xd9c38c, glow: 0xffe9a8, scale: 0.8 } },

    cellar_rat: { name: 'Cellar Rat', level: 1, hp: 80, atk: [6, 9], acc: 0.85, dodge: 0.08, xp: 18,
      speed: 3.2, range: 1.6, cd: 1.5, tell: 250,
      weak: ['fire'], resist: [], immune: [],
      moves: [{ name: 'Bite', type: 'attack', power: 1, weight: 3 },
              { name: 'Filthy Gnaw', type: 'status', status: 'poison', secs: 4, value: 3, power: 0.6, weight: 1 }],
      look: { shape: 'beast', color: 0x6b5a4e, glow: 0xff3030, scale: 0.7 } },

    bog_imp: { name: 'Bog Imp', level: 2, hp: 130, atk: [7, 11], acc: 0.85, dodge: 0.1, xp: 38,
      speed: 2.4, range: 12, cd: 2.4, tell: 350, proj: 14,
      weak: ['lightning'], resist: ['water'], immune: [],
      moves: [{ name: 'Mud Ball', type: 'attack', power: 1, weight: 3 },
              { name: 'Mud Toss', type: 'status', status: 'blind', secs: 3, weight: 1 },
              { name: 'Gleeful Cackle', type: 'heal', power: 20, weight: 1 }],
      look: { shape: 'imp', color: 0x4f7a3a, glow: 0xffd23a, scale: 0.8 } },

    forest_spider: { name: 'Thornback Spider', level: 2, hp: 160, atk: [8, 12], acc: 0.85, dodge: 0.1, xp: 45,
      speed: 3.4, range: 10, cd: 2.2, tell: 400, proj: 16,
      weak: ['fire'], resist: ['poison'], immune: [],
      moves: [{ name: 'Venom Spit', type: 'status', status: 'poison', secs: 4, value: 4, power: 0.8, weight: 2 },
              { name: 'Leg Slash', type: 'attack', power: 1.1, weight: 2 },
              { name: 'Sticky Web', type: 'status', status: 'chilled', secs: 2.5, weight: 1, chance: 0.6 }],
      look: { shape: 'spider', color: 0x2b2633, glow: 0xb3ff3a, scale: 1 } },

    animated_armor: { name: 'Animated Armor', level: 3, hp: 250, atk: [10, 15], acc: 0.8, dodge: 0, xp: 65,
      speed: 2.0, range: 2.2, cd: 2.2, tell: 400,
      weak: ['lightning'], resist: ['fire'], immune: ['poison', 'sleep', 'fear'],
      moves: [{ name: 'Sword Swing', type: 'attack', power: 1, weight: 3 },
              { name: 'Crushing Blow', type: 'attack', power: 1.6, weight: 1 },
              { name: 'Raise Guard', type: 'shield', power: 30, weight: 1 }],
      look: { shape: 'armor', color: 0x9aa3ad, glow: 0x58c8ff, scale: 1.1 } },

    wraith: { name: 'Corridor Wraith', level: 4, hp: 190, atk: [10, 14], acc: 0.85, dodge: 0.15, xp: 75,
      speed: 3.0, range: 9, cd: 2.0, tell: 350, proj: 18,
      weak: ['fire', 'spirit', 'life'], resist: ['poison', 'wind'], immune: ['sleep'],
      moves: [{ name: 'Chill Bolt', type: 'attack', power: 1, weight: 3 },
              { name: 'Mana Drain', type: 'drain', power: 0.7, mana: 25, weight: 2 },
              { name: 'Wail', type: 'status', status: 'fear', secs: 2.5, weight: 1 }],
      look: { shape: 'wraith', color: 0x8090b0, glow: 0x9fd8ff, scale: 1.1 } },

    ember_salamander: { name: 'Ember Salamander', level: 4, hp: 280, atk: [12, 17], acc: 0.85, dodge: 0.08, xp: 95,
      speed: 2.6, range: 10, cd: 2.2, tell: 450, proj: 15,
      weak: ['water'], resist: ['fire'], immune: ['burn'],
      moves: [{ name: 'Tail Lash', type: 'attack', power: 1, weight: 2 },
              { name: 'Flame Spit', type: 'status', status: 'burn', secs: 4, value: 5, power: 0.8, weight: 2 }],
      look: { shape: 'lizard', color: 0xc8401c, glow: 0xffa020, scale: 1.1 } },

    stone_gargoyle: { name: 'Stone Gargoyle', level: 5, hp: 380, atk: [13, 18], acc: 0.8, dodge: 0, xp: 120,
      speed: 2.2, range: 2.4, cd: 2.4, tell: 300,
      weak: ['lightning', 'energy'], resist: ['fire', 'wind'], immune: ['poison', 'sleep'],
      moves: [{ name: 'Stone Fist', type: 'attack', power: 1.1, weight: 3 },
              { name: 'Harden', type: 'shield', power: 50, weight: 1 }],
      look: { shape: 'gargoyle', color: 0x6f6f78, glow: 0xff5050, scale: 1.2 } },

    hollow_warden: { name: 'The Hollow Warden', level: 6, hp: 900, atk: [14, 20], acc: 0.85, dodge: 0.05, xp: 450, boss: true,
      speed: 2.0, range: 2.8, cd: 2.0, tell: 600,
      weak: ['spirit', 'energy', 'life'], resist: ['poison', 'mind'], immune: ['sleep', 'fear'],
      moves: [{ name: 'Grave Slam', type: 'attack', power: 1.5, weight: 2 },
              { name: 'Soul Rend', type: 'drain', power: 1, mana: 30, weight: 2 },
              { name: 'Hollow Roar', type: 'status', status: 'fear', secs: 2.5, weight: 1 },
              { name: 'Bone Ward', type: 'shield', power: 60, weight: 1 }],
      look: { shape: 'warden', color: 0x35303f, glow: 0x7a5cff, scale: 1.8 } },

    // ---------------------------- DRAGONS ----------------------------
    // abilities: 'breath' (cone), 'tail' (arc sweep), 'gust' (knockback ring),
    //            'lightning' (strike circles), 'meteors' (falling circles)
    ember_drake: { name: 'Ember Drake', level: 5, hp: 700, atk: [16, 24], acc: 0.9, dodge: 0, xp: 400, dragon: true,
      speed: 3.0, range: 7, cd: 2.6, element: 'fire', breathStatus: { id: 'burn', secs: 4, value: 6 },
      abilities: ['breath', 'tail', 'gust'], tells: { breath: 700, tail: 600, gust: 650 }, flying: false,
      weak: ['water'], resist: ['fire'], immune: ['burn', 'sleep', 'fear'],
      look: { shape: 'dragon', body: 0x7a1f12, belly: 0xc8641e, membrane: 0x4a120c, glow: 0xff4a1c, scale: 1.4, legs: 4 } },

    frost_wyvern: { name: 'Frost Wyvern', level: 6, hp: 900, atk: [18, 26], acc: 0.9, dodge: 0.05, xp: 550, dragon: true,
      speed: 3.4, range: 8, cd: 2.4, element: 'frost', breathStatus: { id: 'chilled', secs: 4 },
      abilities: ['breath', 'gust'], tells: { breath: 900, gust: 650 }, flying: false,
      weak: ['fire'], resist: ['water'], immune: ['sleep', 'fear'],
      look: { shape: 'dragon', body: 0x3a5a7a, belly: 0xbfe8ff, membrane: 0x2a4a6a, glow: 0xbff4ff, scale: 1.6, legs: 2 } },

    storm_wyrm: { name: 'Storm Wyrm', level: 6, hp: 1000, atk: [18, 26], acc: 0.9, dodge: 0.1, xp: 650, dragon: true,
      speed: 4.0, range: 22, cd: 2.6, element: 'lightning',
      abilities: ['lightning', 'gust'], tells: { lightning: 800, gust: 650 }, flying: true,
      weak: ['energy', 'water'], resist: ['lightning', 'wind'], immune: ['sleep', 'fear'],
      look: { shape: 'dragon', body: 0x2a2a4a, belly: 0x6a6a9a, membrane: 0x4a4aff, glow: 0xfff04d, scale: 1.6, legs: 0 } },

    elder_ashmaw: { name: 'Ashmaw the Elder', level: 8, hp: 2600, atk: [22, 32], acc: 0.9, dodge: 0, xp: 1500, dragon: true, boss: true,
      speed: 2.6, range: 10, cd: 2.2, element: 'fire', breathStatus: { id: 'burn', secs: 5, value: 9 },
      abilities: ['breath', 'tail', 'gust', 'meteors'], tells: { breath: 1100, tail: 600, gust: 650, meteors: 1200 }, flying: false,
      weak: ['water', 'energy'], resist: ['fire', 'poison'], immune: ['burn', 'sleep', 'fear', 'stun'],
      look: { shape: 'dragon', body: 0x1e1418, belly: 0x5a2a1e, membrane: 0x2a1010, glow: 0xff4a1c, scale: 2.6, legs: 4, crown: true } },
  };

  /* ----------------------------------------------------------------
   * ITEMS (quest items)
   * ---------------------------------------------------------------- */
  const ITEMS = {
    sealed_letter: { name: 'Sealed Letter', icon: '✉️' },
    moonpetal:     { name: 'Moonpetal', icon: '🌸' },
    hob_lantern:   { name: "Hob's Lantern", icon: '🏮' },
    dragon_egg:    { name: 'Ember Egg', icon: '🥚' },
    cell_key:      { name: 'Rusty Cell Key', icon: '🗝️' },

    /* ---- Equipment (slot: 'staff' | 'hat'). Equip in the Inventory (I). Stats:
     *  power   +% damage/healing of every spell     boost   { spellId: +% } for specific spells
     *  maxHp / maxMana   flat bonus                 regen   +mana per second
     *  shield  +% Shield strength                   heal    +% healing
     *  cdr     −% spell cooldowns                   crit    +crit chance on Perfect casts
     *  grants  [spellIds] you can cast while it is equipped (even if not learned)
     *  color   tints your wand                      rarity  common | rare | epic | legendary */
    apprentice_staff: { name: 'Apprentice Staff', icon: '🪄', slot: 'staff', rarity: 'common', color: 0x8a5a2e, stats: { power: 0.05 },
                        desc: 'A sturdy first staff from the Headmistress.' },
    oak_staff:        { name: 'Gnarled Oak Staff', icon: '🪄', slot: 'staff', rarity: 'common', color: 0x6a4a22, stats: { power: 0.08, boost: { gust: 0.3 } },
                        desc: 'Smells of rain. Gusts hit harder.' },
    tide_staff:       { name: 'Tidecaller Staff', icon: '🔱', slot: 'staff', rarity: 'rare', color: 0x2f9bff, stats: { power: 0.06, boost: { water_bullet: 0.4, poison: 0.2 } },
                        desc: 'Water Bullet and Poison Sting hit harder.' },
    ember_staff:      { name: 'Ember Staff', icon: '🔥', slot: 'staff', rarity: 'rare', color: 0xff6a2a, stats: { power: 0.1, boost: { fire_bolt: 0.35, dragons_breath: 0.25 } },
                        desc: 'Warm to the touch. Fire Bolt and Dragon\'s Breath burn hotter.' },
    stormrod:         { name: 'Stormrod', icon: '⚡', slot: 'staff', rarity: 'epic', color: 0xfff04d, stats: { power: 0.08, boost: { lightning: 0.4, kamehameha: 0.2 }, grants: ['lightning'] },
                        desc: 'Crackles constantly. Lets you cast Lightning Strike even if you never learned it.' },
    moonwood_staff:   { name: 'Moonwood Staff', icon: '🌙', slot: 'staff', rarity: 'epic', color: 0xbfe0ff, stats: { power: 0.12, heal: 0.3, grants: ['heal'] },
                        desc: 'Grown in moonlight. Lets you cast Healing Light and heals more.' },
    frost_staff:      { name: 'Rimeglass Staff', icon: '❄️', slot: 'staff', rarity: 'epic', color: 0xbff4ff, stats: { power: 0.15, boost: { water_bullet: 0.3, sleep: 0.3 } },
                        desc: 'Carved from the Frost Wyvern\'s ice.' },
    wyrmbone_staff:   { name: 'Wyrmbone Staff', icon: '🐉', slot: 'staff', rarity: 'epic', color: 0xe8d8b0, stats: { power: 0.15, boost: { summon_wyrmling: 0.3, dragon_bind: 0.3 } },
                        desc: 'Made from the Ember Drake\'s horn. Dragon magic grows stronger.' },
    starfall_staff:   { name: 'Starfall Staff', icon: '🌟', slot: 'staff', rarity: 'legendary', color: 0xff5cdb, stats: { power: 0.25, crit: 0.1, boost: { spirit_bomb: 0.3 } },
                        desc: 'Ashmaw\'s hoard held this. Every spell hits harder.' },
    dusty_cap:        { name: 'Dusty Cap', icon: '🧢', slot: 'hat', rarity: 'common', stats: { maxMana: 12 }, desc: 'Somebody\'s old cap. Sneezy.' },
    pointed_hat:      { name: 'Pointed Hat', icon: '🎩', slot: 'hat', rarity: 'common', stats: { maxMana: 20 }, desc: 'Every wizard needs one.' },
    iron_circlet:     { name: 'Iron Circlet', icon: '👑', slot: 'hat', rarity: 'common', stats: { maxHp: 25 }, desc: 'Pried off an Animated Armor.' },
    sage_hood:        { name: 'Sage\'s Hood', icon: '🧙', slot: 'hat', rarity: 'rare', stats: { regen: 6 }, desc: 'Your mana refills faster.' },
    silk_cowl:        { name: 'Silkweave Cowl', icon: '🕸️', slot: 'hat', rarity: 'rare', stats: { regen: 4, maxHp: 15 }, desc: 'Spun from Thornback silk.' },
    moon_circlet:     { name: 'Moonpetal Circlet', icon: '🌸', slot: 'hat', rarity: 'rare', stats: { heal: 0.4, maxHp: 15 }, desc: 'Healing spells heal much more.' },
    veil_hood:        { name: 'Wraith-Veil Hood', icon: '👻', slot: 'hat', rarity: 'rare', stats: { crit: 0.08, regen: 3 }, desc: 'Perfect casts crit more often.' },
    stone_crown:      { name: 'Gargoyle Crown', icon: '🗿', slot: 'hat', rarity: 'rare', stats: { maxHp: 30, power: 0.05 }, desc: 'Heavy, but you feel unbreakable.' },
    warden_helm:      { name: 'Warden\'s Helm', icon: '⛑️', slot: 'hat', rarity: 'epic', stats: { maxHp: 40, shield: 0.35 }, desc: 'The Hollow Warden\'s helm. Your Shield absorbs more.' },
    storm_cap:        { name: 'Storm-Touched Cap', icon: '🌩️', slot: 'hat', rarity: 'epic', stats: { cdr: 0.2, maxMana: 25 }, desc: 'Spell cooldowns are 20% shorter.' },
    // sold by Tilly in the Great Hall
    birch_staff:      { name: 'Silver Birch Staff', icon: '🪄', slot: 'staff', rarity: 'rare', color: 0xe8e8f0, stats: { power: 0.1, boost: { fire_bolt: 0.15, water_bullet: 0.15 } },
                        desc: 'A merchant\'s favourite. Fire Bolt and Water Bullet hit harder.' },
    scholar_cap:      { name: 'Scholar\'s Cap', icon: '🎓', slot: 'hat', rarity: 'rare', stats: { maxMana: 35, regen: 3 }, desc: 'Thinking cap. More mana, refills faster.' },
    ward_hat:         { name: 'Warding Hat', icon: '🎩', slot: 'hat', rarity: 'rare', stats: { shield: 0.25, maxHp: 20 }, desc: 'Stitched with protective runes.' },

    /* ---- Potions (use: press 1 = Health, 2 = Mana, or click them in the Inventory) */
    health_potion:    { name: 'Health Potion', icon: '🧪', use: { hp: 70 }, price: 30, desc: 'Restores 70 HP. Hotkey 1.' },
    mana_potion:      { name: 'Mana Potion', icon: '🔷', use: { mana: 90 }, price: 30, desc: 'Restores 90 mana. Hotkey 2.' },
  };

  /** Element names and icons (weaknesses on enemy nameplates, spellbook). */
  const ELEMENTS = {
    fire: ['🔥', 'Fire'], water: ['💧', 'Water'], lightning: ['⚡', 'Lightning'], energy: ['✨', 'Energy'], spirit: ['👻', 'Spirit'],
    life: ['💚', 'Life'], poison: ['☠️', 'Poison'], wind: ['🌪️', 'Wind'], air: ['🌪️', 'Air'], mind: ['🌀', 'Mind'], frost: ['❄️', 'Frost'],
    arcane: ['🔮', 'Arcane'], light: ['☀️', 'Light'], draconic: ['🐉', 'Dragon'], physical: ['✊', 'Physical'],
  };

  /** Sell price is 40% of this. Items without a price use their rarity. */
  const ITEM_PRICES = { common: 60, rare: 180, epic: 450, legendary: 1200 };

  /** Shops: NPC id → what they sell (price defaults to the item's price / rarity). */
  const SHOPS = {
    tilly: [{ item: 'health_potion' }, { item: 'mana_potion' },
            { item: 'pointed_hat', price: 70 }, { item: 'birch_staff', price: 220 }, { item: 'scholar_cap', price: 240 },
            { item: 'tide_staff', price: 260 }, { item: 'sage_hood', price: 280 }, { item: 'ward_hat', price: 300 }],
  };

  /** Loot: what each enemy can drop when you beat it (items you already own never drop twice). */
  const DROPS = {
    dust_sprite:      [{ item: 'dusty_cap', chance: 0.15 }],
    cellar_rat:       [{ item: 'dusty_cap', chance: 0.12 }],
    bog_imp:          [{ item: 'tide_staff', chance: 0.15 }],
    forest_spider:    [{ item: 'silk_cowl', chance: 0.15 }],
    animated_armor:   [{ item: 'iron_circlet', chance: 0.18 }],
    wraith:           [{ item: 'veil_hood', chance: 0.25 }],
    ember_salamander: [{ item: 'ember_staff', chance: 0.5 }],
    stone_gargoyle:   [{ item: 'stone_crown', chance: 0.3 }],
    hollow_warden:    [{ item: 'warden_helm', chance: 1 }],
    ember_drake:      [{ item: 'wyrmbone_staff', chance: 1 }],
    frost_wyvern:     [{ item: 'frost_staff', chance: 1 }],
    storm_wyrm:       [{ item: 'storm_cap', chance: 1 }],
    elder_ashmaw:     [{ item: 'starfall_staff', chance: 1 }],
  };

  /* ----------------------------------------------------------------
   * NPCS — lines are shown when the NPC has no quest business with you
   * ---------------------------------------------------------------- */
  const NPCS = {
    orla:  { name: 'Headmistress Orla Vane', area: 'great_hall', pos: [0, -8], look: { robe: 0x3b2a6b, hat: 0x2a1d4f, trim: 0xd4af37 },
             lines: ['Thornwick has stood for nine hundred years, young one. It will stand nine hundred more.',
                     'Draw with conviction. Magic rewards a steady hand, and a quick one.',
                     'Rest by the great hearth whenever you are weary.'] },
    tilly: { name: 'Tilly Wrenfeather', title: 'Wandwright & Merchant', area: 'great_hall', pos: [15, -2], shop: true,
             look: { robe: 0x2d6a6a, hat: 0x1f4a4a, trim: 0xffd84a },
             lines: ['Staffs, hats, potions! Gold talks, apprentice.',
                     'Beaten foes often carry a few coins. Bring them here.',
                     'Not sure about an item? I show you how it compares to what you wear.'] },
    pip:   { name: 'Pip Tansy', title: 'Second-year Apprentice', area: 'great_hall', pos: [7, 9.5], look: { robe: 0x7a2d2d, hat: 0x5a1f1f, trim: 0xffc070 },
             lines: ['Did you know the courtyard well whispers at night? Creepy!',
                     'I heard there is an old altar deep in Whisperwood. Nobody remembers what it does.',
                     'Draw a check mark (or press L) to light your wand. The dungeon is so dark!'] },
    quill: { name: 'Professor Barnaby Quill', title: 'Master of Glyphs', area: 'corridor', pos: [-20, -2.5], look: { robe: 0x2d4a3a, hat: 0x1f3529, trim: 0xc0c0c0 },
             lines: ['A spell is only as good as the shape you give it.',
                     'Perfect strokes fire faster and hit harder. Sloppy ones cost you time.'] },
    wren:  { name: 'Sister Wren', title: 'Castle Healer', area: 'corridor', pos: [14, -2.5], look: { robe: 0xe8e8f0, hat: 0xb0c8ff, trim: 0x6dffb0 },
             lines: ['Mind your health out there. Poison lingers if left untreated.',
                     'Keep moving while you cast. A still wizard is an easy target.'] },
    hob:   { name: 'Hob Marrow', title: 'Groundskeeper', area: 'courtyard', pos: [9, -9], look: { robe: 0x5a4632, hat: 0x3d2f22, trim: 0x8fbf5a },
             lines: ['Whisperwood is east through the gate. Watch for spiders.',
                     'Things grow strange in that forest. Strange, hungry, and lately... scaly.'] },
    grimble: { name: 'Old Grimble', title: 'Friendly Ghost', area: 'dungeon', pos: [-15, -9], ghost: true, look: { robe: 0xbfe0ff, hat: 0x9fc8ff, trim: 0xffffff },
             lines: ['Ooooh, a visitor! Mind the Warden in the deep cells.',
                     'I used to be a student too, you know. Then I took a wrong turn. For three centuries.',
                     'There is a rune on the east wall that weeps. You will only see it by wandlight...',
                     'That sealed cell door? Old magic. Splash it with water, they say.'] },
  };

  /* ----------------------------------------------------------------
   * QUESTS
   *  objectives: {type:'kill', target:enemyId, count} | {type:'collect', target:itemId, count} | {type:'talk', target:npcId}
   *  giveItems:  items handed to the player on accept
   *  Spells rewarded = any spell whose unlock.quest is this quest.
   * ---------------------------------------------------------------- */
  const QUESTS = [
    { id: 'q_first_sparks', title: 'First Sparks', giver: 'orla', turnIn: 'orla', requires: {},
      summary: 'Dust Sprites have invaded the North Corridor. Drive them out.',
      objectives: [{ type: 'kill', target: 'dust_sprite', count: 3, text: 'Defeat Dust Sprites in the North Corridor' }],
      rewards: { xp: 60 , items: ['apprentice_staff'] },
      dialogue: {
        offer: ['Ah, our newest apprentice. Welcome to Thornwick Academy.',
                'Dust Sprites have been swirling through the North Corridor. Harmless alone, a nuisance in numbers.',
                'Blast three of them with Fire Bolt. Hold the left mouse button and draw the rising triangle, then let go.'],
        active: ['The North Corridor is through the north door. Three sprites, apprentice.'],
        complete: ['Splendid work! You have a natural hand for glyphs.',
                   'Let me teach you a ward. Trace a perfect circle and the magic will guard you.'] } },

    { id: 'q_letter', title: 'A Letter for the Professor', giver: 'pip', turnIn: 'quill', requires: {},
      summary: 'Deliver Pip\'s overdue essay to Professor Quill in the North Corridor.',
      objectives: [{ type: 'talk', target: 'quill', text: 'Deliver the letter to Professor Quill' }],
      giveItems: ['sealed_letter'], rewards: { xp: 45 },
      dialogue: {
        offer: ['Psst! You look trustworthy.', 'My essay for Professor Quill is three days late. If I hand it in myself he will turn me into a newt.',
                'Could you deliver it for me? He lurks in the North Corridor.'],
        active: ['Professor Quill is in the North Corridor. Please hurry!'],
        complete: ['A letter from... Pip Tansy. Three days late. Hmm.', 'Well, at least the messenger is punctual. Let me reward your trouble.',
                   'Here is the Sleep glyph. A simple zed: across, down, across.'] } },

    { id: 'q_moonpetals', title: 'Moonpetals for the Infirmary', giver: 'wren', turnIn: 'wren', requires: { level: 2 },
      summary: 'Gather 3 glowing Moonpetals in Whisperwood Forest for Sister Wren.',
      objectives: [{ type: 'collect', target: 'moonpetal', count: 3, text: 'Collect Moonpetals in Whisperwood' }],
      rewards: { xp: 90 , items: ['moon_circlet'] },
      dialogue: {
        offer: ['Child, my stores are empty. I need Moonpetals, they glow pale blue in Whisperwood Forest.',
                'Bring me three, and I will teach you the healer\'s art.'],
        active: ['Three Moonpetals, dear. They glow in the dark corners of Whisperwood.'],
        complete: ['Oh, they are perfect! Thank you.', 'Now, the healing glyph. Draw a heart, start at the bottom point, and mean it.'] } },

    { id: 'q_lantern', title: 'The Lost Lantern', giver: 'hob', turnIn: 'hob', requires: { quests: ['q_first_sparks'] },
      summary: 'Recover Hob\'s lantern from the spider nest deep in Whisperwood.',
      objectives: [{ type: 'collect', target: 'hob_lantern', count: 1, text: 'Find Hob\'s Lantern in Whisperwood' }],
      rewards: { xp: 110 , items: ['sage_hood'] },
      dialogue: {
        offer: ['Dropped me best lantern runnin\' from them Thornback Spiders, I did.', 'It\'s somewhere up in the north-east of Whisperwood. Fetch it back?'],
        active: ['North-east corner o\' the forest. Mind the spiders.'],
        complete: ['Me lantern! You\'re a good sort.', 'Here, I\'ll show you a trick I learned from the bog witches. Draw a serpent, like an S.'] } },

    { id: 'q_armor', title: 'Restless Armor', giver: 'quill', turnIn: 'quill', requires: { quests: ['q_letter'], level: 3 },
      summary: 'Three suits of Animated Armor stalk the dungeon. Put them to rest.',
      objectives: [{ type: 'kill', target: 'animated_armor', count: 3, text: 'Defeat Animated Armor in the Dungeon' }],
      rewards: { xp: 160 , items: ['pointed_hat'] },
      dialogue: {
        offer: ['Some fool enchanted the old dungeon armor, and now it patrols on its own.', 'Fire barely scratches steel. Try lightning. Defeat three of them.'],
        active: ['The dungeon stairs are at the far east end of this corridor.'],
        complete: ['Impressive. The armor is still at last.', 'You have earned the glyph of Fear. A jagged W. Use it wisely.'] } },

    { id: 'q_salamander', title: 'Embers in the Woods', giver: 'hob', turnIn: 'hob', requires: { quests: ['q_lantern'], level: 3 },
      summary: 'An Ember Salamander is scorching Whisperwood. Douse it for good.',
      objectives: [{ type: 'kill', target: 'ember_salamander', count: 1, text: 'Defeat the Ember Salamander (south-east Whisperwood)' }],
      rewards: { xp: 170 , items: ['ember_staff'] },
      dialogue: {
        offer: ['There\'s a fire lizard settin\' the south-east woods alight.', 'Water\'s your friend there. Soak it good.'],
        active: ['South-east part o\' the forest. You\'ll smell it before you see it.'],
        complete: ['The smoke\'s clearin\'. Grand job, apprentice!'] } },

    { id: 'q_warden', title: 'The Hollow Warden', giver: 'orla', turnIn: 'orla', requires: { quests: ['q_first_sparks'], level: 4 },
      summary: 'An ancient jailer has woken in the deepest cell of the dungeon. Defeat it.',
      objectives: [{ type: 'kill', target: 'hollow_warden', count: 1, text: 'Defeat the Hollow Warden in the Dungeon' }],
      rewards: { xp: 450 },
      dialogue: {
        offer: ['Grave news. The Hollow Warden, a jailer bound beneath this castle centuries ago, has awoken.',
                'Its cell is behind the violet portcullis in the dungeon. I have unsealed it for you.',
                'Spirit and raw energy wound it most. I would not ask this if I did not believe you were ready.'],
        active: ['The Warden lurks behind the violet portcullis in the dungeon. Prepare yourself.'],
        complete: ['You did it. Thornwick owes you a great debt, Archmage-in-training.',
                   'But there is worse news from the woods. Speak with Hob.'] } },

    // ---------------------------- DRAGON LINE ----------------------------
    { id: 'q_dragon_egg', title: 'The Ember Egg', giver: 'hob', turnIn: 'hob', requires: { quests: ['q_salamander'], level: 4 },
      summary: 'An Ember Drake nests in southern Whisperwood. Recover its egg before it hatches wild.',
      objectives: [{ type: 'kill', target: 'ember_drake', count: 1, text: 'Defeat the Ember Drake (southern Whisperwood)' },
                   { type: 'collect', target: 'dragon_egg', count: 1, text: 'Take the Ember Egg from the nest' }],
      rewards: { xp: 300 },
      dialogue: {
        offer: ['That salamander weren\'t the worst of it. There\'s a DRAGON nestin\' in the south woods.',
                'An Ember Drake, guardin\' an egg. Hatch it wild and we\'ll have two of \'em.',
                'Watch its throat. When it glows, get out of the red. Water hurts it.'],
        active: ['Southern Whisperwood. Red ground means move!'],
        complete: ['The egg\'s warm... and it likes you! Here, I\'ll show you the hatchin\' glyph.',
                   'Draw a pair of wings, like an M. The little one will fight for you.'] } },

    { id: 'q_frost', title: 'Frost over Thornwick', giver: 'orla', turnIn: 'orla', requires: { quests: ['q_dragon_egg', 'q_warden'], level: 5 },
      summary: 'A Frost Wyvern has landed in the Courtyard. Drive it off.',
      objectives: [{ type: 'kill', target: 'frost_wyvern', count: 1, text: 'Defeat the Frost Wyvern in the Courtyard' }],
      rewards: { xp: 420 },
      dialogue: {
        offer: ['The dragons are drawn to the castle now. A Frost Wyvern has landed in our Courtyard!',
                'Its breath will freeze you in place. Fire will melt its hide.'],
        active: ['The Frost Wyvern is in the Courtyard. Hurry!'],
        complete: ['Well fought. Take this: the Dragon Ward. Trace infinity, and dragonfire will bend around you.'] } },

    { id: 'q_storm', title: 'Eye of the Storm', giver: 'quill', turnIn: 'quill', requires: { quests: ['q_frost'], level: 6 },
      summary: 'A Storm Wyrm circles above Whisperwood, calling lightning. Bring it down.',
      objectives: [{ type: 'kill', target: 'storm_wyrm', count: 1, text: 'Defeat the Storm Wyrm over Whisperwood' }],
      rewards: { xp: 500 },
      dialogue: {
        offer: ['A Storm Wyrm! It never lands. It strikes from the sky wherever you stand.',
                'Keep moving out of its lightning circles, and blast it with water and raw energy.'],
        active: ['The Storm Wyrm circles over the middle of Whisperwood.'],
        complete: ['Remarkable. Here is the glyph of the shackle: Dragon Bind. Even a flying wyrm can be dragged to earth.'] } },

    { id: 'q_ashmaw', title: 'Ashmaw', giver: 'orla', turnIn: 'orla', requires: { quests: ['q_storm'], level: 7 },
      summary: 'Ashmaw the Elder, mother of the drakes, has come to the southern nest. End this.',
      objectives: [{ type: 'kill', target: 'elder_ashmaw', count: 1, text: 'Defeat Ashmaw the Elder at the southern nest' }],
      rewards: { xp: 1200 },
      dialogue: {
        offer: ['Ashmaw the Elder has come for her young. She waits at the southern nest in Whisperwood.',
                'Her breath, her tail, and fire from the sky. Use the Ward, use the Bind, and keep moving.',
                'Thornwick\'s fate is in your hand.'],
        active: ['Ashmaw waits at the southern nest. Use Dragon Ward against her fire.'],
        complete: ['It is over. You have become a true Archmage of Thornwick.',
                   'Ashmaw\'s spirit has chosen you. Draw the arrowhead, and she will fly for you.'] } },
  ];

  /* ----------------------------------------------------------------
   * SECRETS — hidden interactables that teach spells (see SPELLS.unlock)
   *  hidden: only visible within 5 m of your Wandlight
   * ---------------------------------------------------------------- */
  const SECRETS = {
    weeping_rune:   { name: 'The Weeping Rune', minLevel: 1, hidden: true, text: 'Cold tears run down the rune. A pale shape steps out of the stone and whispers a glyph to you...',
                      locked: '' },
    starfall_altar: { name: 'Starfall Altar', minLevel: 3, text: 'Starlight pours into the altar. A five-pointed glyph burns itself into your memory!',
                      locked: 'The altar is silent. Perhaps it will answer someone more experienced (Level 3).' },
  };

  /* ----------------------------------------------------------------
   * AREAS — the explorable castle. Coordinates: x right, z south.
   *  props      builder in world.js     dark  true = designed for Wandlight
   *  ceiling    height of the roof (omit = open sky)
   *  doors      area transitions (archway passages)
   *  gates      physical doors with states (DOOR_TYPES / states in world.js):
   *             {id, x, z, rot, type:'oak'|'cell'|'portcullis', state:'closed'|'locked'|'sealed'|'boss'|'decor',
   *              key (item for 'locked'), spell (spell id for 'sealed'), quest (for 'boss': opens while active/done)}
   *  enemies    {type, x, z, requiresQuest?}
   *  pickups    quest items shown while the quest is active (requiresKill: only after that enemy type is dead; always: no quest)
 *  chests     one-time XP rewards {id, x, z, xp, text}
   * ---------------------------------------------------------------- */
  const AREAS = {
    great_hall: { name: 'The Great Hall', size: [36, 24], props: 'great_hall', outdoor: false, wallHeight: 12,
      floor: 0x5a4a3a, wall: 0x6b6258, ambient: 0x8070a0, fog: [0x1a1426, 20, 60],
      spawn: [0, 6], rest: [-15, 0],
      doors: [{ to: 'corridor', x: 0, z: -12, label: 'North Corridor', spawn: [0, 3], tint: 0xb8b0a0 },
              { to: 'courtyard', x: 0, z: 12, label: 'Courtyard', spawn: [0, -18], tint: 0x7fb8a8 }],
      gates: [{ id: 'hall_west', x: -17.4, z: -8, rot: Math.PI / 2, type: 'oak', state: 'decor' },
              { id: 'hall_east', x: 17.4, z: -8, rot: -Math.PI / 2, type: 'oak', state: 'decor' }],
      enemies: [{ type: 'training_dummy', x: 14.5, z: 8 }], pickups: [], secrets: [] },

    corridor: { name: 'North Corridor', size: [60, 10], props: 'corridor', outdoor: false, ceiling: 7, wallHeight: 7,
      floor: 0x4a4440, wall: 0x5a5550, ambient: 0x605878, fog: [0x120e1a, 10, 45],
      spawn: [0, 3],
      doors: [{ to: 'great_hall', x: 0, z: 5, label: 'Great Hall', spawn: [-3, -10.5], tint: 0xe8b860 },
              { to: 'dungeon', x: 30, z: 0, label: 'Dungeon Stairs', spawn: [-18, 0], tint: 0x8a78c8 }],
      gates: [{ id: 'classroom_1', x: -12, z: -4.4, rot: 0, type: 'oak', state: 'decor' },
              { id: 'classroom_2', x: 6, z: -4.4, rot: 0, type: 'oak', state: 'decor' },
              { id: 'store_room', x: -6, z: -4.4, rot: 0, type: 'oak', state: 'closed' }],
      enemies: [{ type: 'dust_sprite', x: -10, z: 1 }, { type: 'dust_sprite', x: 6, z: 2 },
                { type: 'dust_sprite', x: 22, z: -1 }, { type: 'dust_sprite', x: -26, z: 1 },
                { type: 'cellar_rat', x: 26, z: 2 }],
      pickups: [], secrets: [] },

    courtyard: { name: 'The Courtyard', size: [44, 44], props: 'courtyard', outdoor: true, wallHeight: 6,
      floor: 0x4c7a3a, wall: 0x7a7468, ambient: 0x8090b0, fog: [0x7a8cb0, 30, 90], sky: 0x7a8cb0,
      spawn: [0, -18],
      doors: [{ to: 'great_hall', x: 0, z: -22, label: 'Great Hall', spawn: [0, 9], tint: 0xe8b860 },
              { to: 'forest', x: 22, z: 0, label: 'Whisperwood Gate', spawn: [-28, 0], tint: 0x8fb080 }],
      gates: [],
      enemies: [{ type: 'dust_sprite', x: -14, z: 12 }, { type: 'cellar_rat', x: 14, z: 14 },
                { type: 'frost_wyvern', x: 0, z: 8, requiresQuest: 'q_frost' }],
      pickups: [{ id: 'oak_staff', item: 'oak_staff', x: -19, z: 19, always: true }], secrets: [] },

    forest: { name: 'Whisperwood Forest', size: [64, 64], props: 'forest', outdoor: true, dark: true,
      floor: 0x22361e, wall: 0x1a2a18, ambient: 0x405870, fog: [0x0c1418, 12, 55], sky: 0x0c1418,
      spawn: [-28, 0],
      doors: [{ to: 'courtyard', x: -32, z: 0, label: 'Courtyard', spawn: [19, 0], tint: 0x7fb8a8 }],
      gates: [],
      enemies: [{ type: 'bog_imp', x: -12, z: 14 }, { type: 'bog_imp', x: 4, z: -6 },
                { type: 'forest_spider', x: 16, z: -14 }, { type: 'forest_spider', x: 24, z: -24 },
                { type: 'forest_spider', x: -6, z: -22 },
                { type: 'ember_salamander', x: 22, z: 22, requiresQuest: 'q_salamander' },
                { type: 'ember_drake', x: -2, z: 22, requiresQuest: 'q_dragon_egg' },
                { type: 'storm_wyrm', x: 4, z: 0, requiresQuest: 'q_storm' },
                { type: 'elder_ashmaw', x: -2, z: 22, requiresQuest: 'q_ashmaw' }],
      pickups: [{ id: 'petal1', item: 'moonpetal', quest: 'q_moonpetals', x: -20, z: 20 },
                { id: 'petal2', item: 'moonpetal', quest: 'q_moonpetals', x: 10, z: 8 },
                { id: 'petal3', item: 'moonpetal', quest: 'q_moonpetals', x: -4, z: -28 },
                { id: 'lantern', item: 'hob_lantern', quest: 'q_lantern', x: 26, z: -27 },
                { id: 'egg', item: 'dragon_egg', quest: 'q_dragon_egg', x: -2, z: 27, requiresKill: 'ember_drake' },
                { id: 'moonwood', item: 'moonwood_staff', x: 28, z: 28, always: true, hidden: true }],
      secrets: [{ id: 'starfall_altar', x: -25, z: -25 }] },

    dungeon: { name: 'The Dungeon', size: [44, 36], props: 'dungeon', outdoor: false, ceiling: 4.2, wallHeight: 4.2, dark: true,
      floor: 0x3a3434, wall: 0x4a4242, ambient: 0x6a6088, fog: [0x08060c, 10, 40],
      spawn: [-18, 0],
      doors: [{ to: 'corridor', x: -22, z: 0, label: 'North Corridor', spawn: [27, 0], tint: 0xb8b0a0 }],
      gates: [{ id: 'warden_gate', x: 15, z: -14, rot: 0, type: 'portcullis', state: 'boss', quest: 'q_warden' },
              { id: 'sealed_cell', x: -10, z: -14, rot: 0, type: 'cell', state: 'sealed', spell: 'water_bullet' },
              { id: 'locked_cell', x: 0, z: -14, rot: 0, type: 'cell', state: 'locked', key: 'cell_key' }],
      enemies: [{ type: 'cellar_rat', x: -8, z: 8 }, { type: 'animated_armor', x: 0, z: -8 },
                { type: 'animated_armor', x: 8, z: 10 }, { type: 'animated_armor', x: -4, z: 14 },
                { type: 'wraith', x: 12, z: 0 }, { type: 'stone_gargoyle', x: -2, z: -2 },
                { type: 'hollow_warden', x: 15, z: -16, requiresQuest: 'q_warden' }],
      pickups: [{ id: 'cellkey', item: 'cell_key', x: -10, z: -16.5, always: true },
                { id: 'stormrod', item: 'stormrod', x: -20, z: 15, always: true, hidden: true }],   // hidden: only Wandlight shows it
      chests: [{ id: 'cell_chest', x: 0, z: -16.5, xp: 120, gold: 90, text: 'An old student\'s stash: spell notes worth 120 XP and 90 gold!' }],
      secrets: [{ id: 'weeping_rune', x: 21.5, z: 12 }] },

    // Story battles: when an enemy spots you, you and its pack are moved here. The look
    // (floor, walls, fog, darkness) is copied from the area you were in (World.loadArena).
    battle_arena: { name: 'Battle Arena', size: [30, 30], props: 'battle_arena', outdoor: true, wallHeight: 4, arena: true,
      floor: 0x4a4458, wall: 0x5a5466, ambient: 0x8a80b0, fog: [0x1a1430, 25, 80], sky: 0x1a1430,
      spawn: [0, 12], doors: [], gates: [], enemies: [], pickups: [], secrets: [] },

    duel_arena: { name: 'Duelling Circle', size: [40, 40], props: 'duel_arena', outdoor: true, wallHeight: 3, arena: true,
      floor: 0x4a4458, wall: 0x5a5466, ambient: 0x8a80b0, fog: [0x1a1430, 25, 80], sky: 0x1a1430,
      spawn: [0, 12], doors: [], gates: [], enemies: [], pickups: [], secrets: [] },
  };

  /* ----------------------------------------------------------------
   * PROGRESSION & RULES
   * ---------------------------------------------------------------- */
  const PROGRESSION = {
    maxLevel: 10,
    xpToNext: level => Math.round(60 * Math.pow(level, 1.4)),
    maxHp: level => 100 + 20 * (level - 1),
    maxMana: level => 110 + 28 * (level - 1),
    spellPower: level => 1 + 0.08 * (level - 1),
    manaRegen: level => 18 + 3 * level,          // mana per SECOND
    hpRegen: level => 1 + 0.3 * level,           // HP per second when out of combat for 5 s
  };

  // Real-time casting (docs/ART_GUIDE.md §10)
  const CAST_RULES = {
    successAt: 0.78, perfectAt: 0.92,
    minPower: 0.65,      // damage at the worst passing match (1.0 at perfect)
    maxExtraMana: 0.3,   // +30% mana at the worst passing match
    perfectCrit: 0.2,    // crit chance on perfect casts
    baseHit: 0.8,        // chance to land at the worst match vs dodging foes (1.0 at perfect)
    fizzleMana: 5,
    windup:   { Perfect: 60,  Great: 110, Good: 170 },     // ms before the spell leaves the wand
    recovery: { Perfect: 80,  Great: 120, Good: 160, Fizzle: 250 },   // ms before the next cast fires
    speedMul: { Perfect: 1.0, Great: 0.8, Good: 0.62 },    // projectile speed multiplier
    hitStop:  { Perfect: 70,  Great: 40,  Good: 0 },       // ms of freeze on impact
  };

  // Practice duel vs CPU wizards (real-time, single player)
  const DUEL_RULES = { hp: 400, mana: 800, manaRegen: 40, spellPower: 1, maxOpponents: 5,
    colors: [0x4a7dff, 0xff4a4a, 0x4aff8a, 0xffc94a, 0xc24aff, 0x4ae0ff],
    names: ['You', 'Ember', 'Frost', 'Moss', 'Gilt', 'Violet'] };

  global.GameData = { SPELLS, STATUSES, ENEMIES, ITEMS, ITEM_PRICES, SHOPS, DROPS, ELEMENTS, NPCS, QUESTS, SECRETS, AREAS, PROGRESSION, CAST_RULES, DUEL_RULES };
})(typeof window !== 'undefined' ? window : globalThis);
