# Glyphbound: Tales of Thornwick

A first-person, real-time wizard game for the browser. You cast spells by **drawing their glyphs**. There are no turns: draw as fast as you can and keep casting while you have mana.

## Play

Double-click `index.html` (Chrome, Edge or Firefox). Nothing to install, works offline.

- **Click the game once** to capture the mouse. Esc releases it and pauses.
- **WASD** move, **Shift** sprint, **mouse** look.
- **Hold LEFT mouse and draw** a glyph, release to cast. The spell flies where the crosshair points.
- **E** interact (talk, doors, chests, items) · **L** Wandlight · **Q** quest log · **B** spellbook.

**Touchscreen PC?** Touch the screen and draw a glyph with your finger, lift to cast.

**Battles:** enemies never attack on their own. Walk up to one and press **E** (⚔ Fight) to battle it one-on-one in an arena that looks like the area you were in. In the arena nobody walks: you and your foe stand still and only cast. A Perfect or Great hit while a foe glows to attack interrupts it. Win and you return to the same spot (beaten enemies stay gone until you leave the area through a door). Press F (🏃 Flee) to escape, except from bosses and dragons.

**Levitate:** draw the rising chevrons to float for 2.5 seconds; enemy shots, breath and ground attacks miss you.

**Map & quest guide:** press M for the castle map and this area's map (minimap top right). The ★, the golden light pillar and the arrow at the top of the screen lead to your tracked quest's next step (choose it with 📍 Track in the Quest Log); in another area the guide points to the right door.

**Shrines ✦:** one per area. Touch one with E to attune it, then travel to any attuned shrine from a shrine or the map. Add shrines in `SHRINES` (`js/data.js`).

**Doors** glow so you can spot them from afar; usable gates glow in their state colour (gold = closed/locked, blue = sealed, purple = boss).

**Gold & shop:** beaten enemies, quests and chests give gold. Talk to Tilly Wrenfeather (Great Hall) to buy staffs, hats and Health/Mana Potions (keys 1 and 2) or sell gear for 40% of its price. Every item shows green/red differences against what you wear. Shop stock lives in `SHOPS` (`js/data.js`).

**Weaknesses:** nameplates show what an enemy is weak to; in battle a line lists which of your spells use that element.

**Training Dummy:** east side of the Great Hall. Press E to practise drawing, interrupting and Levitate; it never knocks you out and is always there.

**Inventory (I):** equip one staff (more spell power, boosts to certain spells, some grant a spell) and one hat (more HP or mana, faster mana, stronger shields, shorter cooldowns). Enemies drop them (bosses and dragons always do), quests reward them, and some are hidden around the castle (look with Wandlight). Add new items in `ITEMS` and drop chances in `DROPS` (`js/data.js`).

If mouse capture does not work on your PC, open `index.html?nolock` instead: hold LEFT to draw at the cursor, hold RIGHT and drag to look.

Optional local server (from this folder): `python -m http.server 8000`, then open `http://localhost:8000`.

## Modes

- **Story**: explore Thornwick Academy, take quests, fight monsters and four dragons in real time, open locked and sealed doors, level up and learn 18 spells.
- **Practice Duel**: you against 1–5 CPU wizards in the Duelling Circle, every spell unlocked, 400 HP, 800 mana.

## Casting rules

- Match ≥ 78% to cast. ≥ 92% is **Perfect**: 60 ms wind-up, full power, may crit.
- Sloppier casts are slower (up to 170 ms wind-up), weaker, cost more mana and fly slower.
- A stroke drawn while the last spell is still recovering is queued and fires as soon as possible.
- Mana refills every second. HP refills slowly after 5 seconds without damage.

## Project layout

| File | What it holds |
|---|---|
| `js/data.js` | **All editable content**: spells (with delivery type), statuses, enemies and dragons, equipment and loot drops, NPCs, quests, items, secrets, areas and doors, level curve, cast and duel rules |
| `js/recognizer.js` | `$1`-style stroke recognizer + `ShapeKit` helpers for describing shapes |
| `js/drawing.js` | Drawing pad (mouse/touch/virtual pen), live ghost guide, cast evaluation; recognition runs in a background worker |
| `js/state.js` | Player save data, leveling, spell unlocks, events, localStorage save |
| `js/quests.js` | Quest state machine, auto-built NPC dialogue, secrets |
| `js/world.js` | Renderer, castle areas, doors, pickups, chests, hidden secrets, collision, main loop |
| `js/player.js` | First-person camera, movement, draw-to-cast pipeline, Wandlight, wand viewmodel |
| `js/combat.js` | Real-time combat: spells, projectiles, enemy and dragon AI, telegraphed zones, practice-duel bots |
| `js/models.js` | Procedural 3D models (wizards, monsters, dragons), name plates |
| `js/fx.js` | Pooled spell and particle effects (one draw call for all particles) |
| `js/ui.js` | HUD, crosshair, cast chip, boss bar, dialogue, quest log, spellbook, lessons, menus |
| `js/main.js` | Game flow (menu → story / practice duel, death and respawn, saving) |
| `docs/ART_GUIDE.md` | Visual asset guide for the first-person version |
| `tests/` | Node + Playwright checks used during development (not needed to play) |

## Adding content

**New spell** (in `SPELLS`, `js/data.js`)
1. Copy an entry, give it a unique `id`, `name`, `cost`, `power`, `kind` and `element`.
2. Choose a `delivery`: `bolt` (projectile), `strike`, `beam`, `cone`, `bomb`, `line`, `self`, `summon` or `toggle`, plus its fields (`speed`, `range`, `radius`, `aoe`, `cooldown`, …). Copy them from a spell with the same delivery.
3. Describe the stroke with `points` using `ShapeKit` (`poly`, `arc`, `circle`, `wave`, `spiral`, `heart`, `star`, `join`). Set `closed: true` for loops.
4. Pick how it unlocks with `unlock` (`start`, `level`, `quest` or `secret`). Existing saves pick it up automatically. If you change a learned spell's shape, bump `shapeRev` so players relearn it.
5. Run `node tests/recog_test.js` to check it isn't confused with another spell.

**New quest** (in `QUESTS`)
1. Add an entry with `giver`, `turnIn`, `requires`, `objectives` (`kill` / `collect` / `talk`), `rewards.xp` and the dialogue lists (`offer`, `active`, `complete`).
2. For `collect`, add matching `pickups` to an area (`item`, `quest`, `x`, `z`, optional `requiresKill`) and the item to `ITEMS`.
3. To reward a spell, set that spell's `unlock: { type: 'quest', quest: '<your quest id>' }`.

**New NPC** (in `NPCS`)
1. Add `{ name, area, pos: [x, z], look: { robe, hat, trim }, lines: [...] }`.
2. The NPC appears in that area with a name label. Quests that use the NPC as `giver` or `turnIn` show `!` / `?` markers and dialogue automatically.

**New enemy, door or area**
- Enemies: add to `ENEMIES` (HP, `speed`, `range`, `cd`, `tell`, optional `proj`, `moves`, `look.shape`) and list them in an area's `enemies`. Dragons use `dragon: true` and `abilities`.
- Doors: add to an area's `gates` with `type` (`oak`, `cell`, `portcullis`) and `state` (`closed`, `locked` + `key`, `sealed` + `spell`, `boss` + `quest`, `decor`).
- Areas: add an `AREAS` entry, doors in both directions, and optionally a props builder in `World.props`.

## Tests (developers only)

Needs Node and Playwright. From this folder (PowerShell):

```powershell
node tests/recog_test.js     # every glyph recognizes as itself
node tests/worker.js         # background recognizer matches the main thread
node tests/realtime.js       # movement, casting, spam, enemies, doors, Wandlight, dragons, save/load, duel
node tests/perf.js           # memory, lights and frame time
```
