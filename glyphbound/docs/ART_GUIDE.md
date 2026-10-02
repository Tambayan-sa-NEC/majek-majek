# Glyphbound — Visual Asset Guide (First-Person Real-Time Edition)

Reference for building every asset in the **first-person, real-time** version of Glyphbound with Three.js primitives, procedural textures and particles. Every value is meant to be copied straight into code.

> **Conventions:**
> - Colors are sRGB hex (`0xRRGGBB` in Three.js).
> - 1 unit = 1 m. Player eye height is 1.65 m.
> - Times are in milliseconds.
> - "Desktop / Mobile" columns are the two quality tiers (§9.7).
> - Light intensities are tuned for this project's Three.js r160 setup, where torches look right at `PointLight(color, 1.6, 12, 1.5)`.

> **Naming note:** your brief calls the light charm "Lumos". That is the Harry Potter spell name, so to follow your "no trademarked spell names" rule this guide uses the original name **Wandlight**. The mechanic is exactly what you described; rename it freely.

---

## Quick index

| § | Section | Key lookups |
|---|---|---|
| 0 | [Art direction & master palette](#0-art-direction--master-palette) | Style rules, reserved colors, signal colors |
| 1 | [Castle environments](#1-castle-environments) | First-person scale · sight lines & landmarks · **doors** · 5 areas |
| 2 | [NPC models](#2-npc-character-models) | Shared rig · 7 NPCs · face-level details |
| 3 | [Enemies & dragons](#3-enemies-status-cues-and-dragons) | Reading system · roster · status cues · 5 dragons · telegraphs |
| 4 | [Spell drawing shapes](#4-spell-drawing-shapes) | 18 templates, all recognizer-tested |
| 5 | [Spell color schemes](#5-spell-color-schemes) | Primary / secondary / glow per spell |
| 6 | [Spell effects](#6-spell-effect-visualizations) | Build recipes, particle budgets, first-person rules |
| 7 | [Wandlight (light charm)](#7-wandlight-the-light-charm) | Light values, drawing/casting response, darkness tuning, wand viewmodel |
| 8 | [UI](#8-ui-elements) | HUD, drawing feedback, tutorial, spellbook, quest log |
| 9 | [Three.js technical setup](#9-threejs-technical-recommendations) | Renderer, materials, textures, lights, post, budgets |
| 10 | [Timing](#10-animation-and-feedback-timing) | Draw → cast → impact, per quality tier |
| A | [Appendix: current code vs this guide](#appendix-a--current-code-vs-this-guide) | What's done, what's next |

---

## 0. Art direction & master palette

**Name: "Candlelit Arcane".** A dark, cool, low-poly castle seen through the wizard's own eyes. It is lit by warm candles and your wand, and **spells are the only fully saturated, glowing things on screen**. Everything else exists to make casting readable at speed.

### 0.1 Seven rules every asset follows

1. **Three value bands.**
   - World: dark (HSL lightness 8–40%, saturation ≤ 35%).
   - Characters: mid-tones (lightness 30–65%, saturation 30–60%).
   - Magic: bright and saturated (lightness 55–100%, saturation ≥ 80%, emissive/additive).
   - A world prop brighter or more saturated than a spell is a bug.
2. **Hue ownership.**
   - Each spell family owns a hue band (§0.3).
   - The world never uses a saturated version of a reserved hue. Muted versions are fine.
3. **Silhouette first, front view first.**
   - In first person, you mostly see characters **from the front at eye level**.
   - Every NPC and enemy must be identifiable as a solid black shape **from the front** at 64 px tall.
4. **Flat-shaded low-poly.**
   - Use `flatShading` on organic shapes, and low segment counts (spheres 10–16, cylinders 6–12).
   - No image textures. Detail comes from small procedural canvas textures (§9.3).
5. **Max 3 base colors + 1 glow color per model.** The glow color is the model's identity: eyes, orb, rune or core.
6. **Friend vs foe light language.**
   - Player spells and allies: **white-hot core** fading to their hue.
   - Enemy attacks: **dark core `#1A0A12`** with a **red rim `#FF3B2F`** plus their element hue.
7. **Edges rich, centers clear.**
   - Detail hugs walls and corners. The middle of every room stays open for fighting.
   - Keep walking paths at least 1.6 m wide.
   - Props cover at most 25% of the floor area.

### 0.2 World neutrals

| Token | Hex | Use |
|---|---|---|
| `stone.dark` | `#2E2A33` | Dungeon walls, deep shadow |
| `stone.mid` | `#5A5550` | Corridor walls, pillars |
| `stone.light` | `#8A8070` | Door frames, trims (frames must contrast with walls) |
| `wood.dark` | `#4A3220` | Beams, trunks, door leaves |
| `wood.mid` | `#6A4628` | Tables, desks |
| `iron` | `#2A2A2E` | Door bands, bars, hinges |
| `cloth.red` | `#7A1C24` | Carpets, banners |
| `night.sky` | `#0C1020` | Enchanted ceiling, night backdrop |
| `candle.flame` | `#FFB040` | Flames (small, emissive ≤ 3) |
| `candle.light` | `#FF9A40` | Torch `PointLight` color |

### 0.3 Reserved magic hues (never saturated in the world)

| Hue | Family | Anchor | | Hue | Family | Anchor |
|---|---|---|---|---|---|---|
| 345–360° | Draconic | `#E8243C` | | 165–175° | Ward | `#2EE6C3` |
| 10–20° | Dragonfire | `#FF4A1C` | | 200–210° | Water | `#2F9BFF` |
| 22–32° | Fire | `#FF7A2A` | | 210° near-white | Spirit | `#DCE9FF` |
| 40–48° desaturated | Wind/dust | `#F2D49B` | | 225–232° | Energy | `#3D5CFF` |
| 52–58° | Lightning | `#FFF04D` | | 232–238° pastel | Sleep | `#A9B4FF` |
| 88–100° | Poison | `#8EE03A` | | 270–280° | Fear | `#A34DFF` |
| 140–150° | Life | `#3DFF8E` | | 310–320° | Soul | `#FF5CDB` |
| 38° very light | Wandlight | `#FFF1D6` | | | | |

### 0.4 Gameplay signal colors

| Token | Hex | Meaning |
|---|---|---|
| `enemy.rim` | `#FF3B2F` | Enemy projectile rim, default enemy eyes, hostile telegraphs, damage-direction arrows |
| `enemy.core` | `#1A0A12` | Dark core of enemy projectiles |
| `ally.rim` | `#4AF2FF` | Summoned allies, friendly dragon outline |
| `elite.gold` | `#FFC23D` | Elite ring, boss nameplate, **quest-locked doors** |
| `boss.violet` | `#7A5CFF` | Boss rooms and boss doors |
| `passage.veil` | `#BFD8E8` | Area-transition archway veils (neutral, not a spell hue) |
| `telegraph.fill` / `.edge` | `#FF3B2F` at 25% / `#FF8A6B` | Area-attack warnings |

### 0.5 UI palette

| Token | Hex | Use |
|---|---|---|
| `ui.panel` | `#15101F` at 82% | All panels |
| `ui.border` | `#C9A54E` | Borders, focus rings |
| `ui.text` / `ui.muted` | `#F2E9D8` / `#B8AB95` | Text |
| `ui.hp` / `ui.mp` / `ui.xp` | `#E8414A`→`#A01818` / `#4A9BFF`→`#1C4AA0` / `#FFE07A`→`#A07A10` | Bar gradients |
| `tier.perfect` / `.great` / `.good` / `.fizzle` | `#FFD84A` / `#7DFF9A` / `#9FD8FF` / `#FF6B6B` | Cast quality only |
| Duel team colors (6) | `#4A7DFF` `#FF4A4A` `#4AFF8A` `#FFC94A` `#C24AFF` `#4AE0FF` | Robes, nameplates, wand-tip glow in duels. **Never** on spells. |

---

## 1. Castle environments

### 1.1 First-person scale and camera

| Parameter | Value | Why |
|---|---|---|
| Eye height | 1.65 m | Human scale; NPC heads sit right at eye line |
| FOV (vertical) | 75° desktop, 70° mobile landscape | Wide enough for spatial awareness, low distortion |
| Near / far | 0.05 / 90 m | Fog hides everything past ~60 m |
| Collision radius | 0.35 m | Lets the player pass 1.4 m doors comfortably |
| Walk / sprint | 4.2 / 6.5 m/s | Sprint for traversal, walk for fights |
| Head bob | 0.025 m vertical at 1.8 Hz (walk), 0.04 m at 2.4 Hz (sprint) | Settings toggle: off / 50% / 100% |
| Look sensitivity | 0.0022 rad/px (mouse), 0.006 rad/px (touch) | — |

**Dimension standards** (keep these consistent so the castle feels like one building):

| Element | Size |
|---|---|
| Standard door opening | 1.4 × 2.6 m |
| Grand double door | 3.2 × 5.5 m (arched) |
| Corridor width / ceiling | 6 m / 6 m to the vault peak |
| Room ceiling (normal) | 7–9 m |
| Dungeon ceiling | 3.4 m (deliberately low and oppressive) |
| Table height / bench | 0.8 m / 0.45 m |
| Stair step | 0.18 rise × 0.3 run |
| Railings | 1.0 m |

### 1.2 Sight lines, landmarks and wayfinding (all areas)

- **Every entrance frames a landmark.** Standing in any doorway, the player sees one bright, unique object at the end of the main sight line within 20 m. Never block it with pillars or props.
- **Light temperature = function:**
  - Warm (`#FF9A40`) means safe or hub.
  - Neutral moonlight (`#A0A8FF` desaturated) means transit.
  - Violet (`#7A5CFF`) means boss or danger.
- **Door lintel runes are color-coded by destination** (see the destination tints in §1.3). Players learn "the teal-runed door leads to the courtyard" without a map.
- **Floor lines:** carpets and paths run along the main traffic routes and point at doors.
- **Rhythm:** repeat structural elements (pillars, torches) every 6 m in corridors, so distance and speed read in peripheral vision.
- **Readability at eye level:** interactables (doors, NPCs, pickups, secrets) are placed between 0.8 and 2.2 m high and given a halo or emissive accent visible from 15 m.

### 1.3 Doors (key architectural element)

#### 1.3.1 Door types

| Type | Where | Build (primitives) |
|---|---|---|
| **Oak door** (standard) | Classrooms, offices, side rooms | Leaf `BoxGeometry(1.4, 2.6, 0.12)` with a plank canvas texture (§9.3) in `wood.dark`; 3 iron bands `BoxGeometry(1.42, 0.08, 0.14)` in `iron`; ring handle `TorusGeometry(0.07, 0.015, 6, 12)`; frame of 3 boxes `0.25 × 2.85 × 0.5` in `stone.light`; pointed arch = 2 rotated boxes meeting at the top. **Pivot**: wrap the leaf in a `Group` positioned at the hinge edge. |
| **Grand double doors** | Great Hall main entrance | 2 leaves `1.6 × 5.0 × 0.18`; rounded arch above = half-disc `CylinderGeometry(1.6, 1.6, 0.18, 24, 1, false, 0, π)` rotated to stand upright; carved border made with a darker inset box; large knockers |
| **Iron cell door** | Dungeon | Frame + 8 vertical bars `CylinderGeometry(0.03, 0.03, 2.4, 5)` (instanced) + 3 cross bars; padlock = `BoxGeometry(0.12, 0.14, 0.06)` + shackle `TorusGeometry(0.04, 0.012, 6, 10, π)` |
| **Portcullis** | Dungeon entrance, boss room | Grid of instanced bars, 0.25 m spacing, 3.2 × 3.4 m; raises vertically |
| **Archway passage** | Area transitions (no leaf) | Stone arch frame + **veil**: `PlaneGeometry(3.1, 3.9)`, `passage.veil` at 25% opacity, additive, slow vertical shimmer (UV scroll 0.05/s); destination name label 3 m high |
| **Secret door** | Library bookcase, dungeon wall | Looks like the wall or a bookcase; slides 1.5 m sideways or swings inward. Reveal cue: a faint rune visible **only in Wandlight** (§7.4). |
| **Forest gate** | Courtyard → Whisperwood | Wrought-iron double gate: instanced vertical bars with cone tips + 2 horizontal rails + scroll ornaments (half-torus) |

#### 1.3.2 Door states and indicators (readable from 15 m)

| State | Leaf | Lintel rune (`TorusGeometry(0.22, 0.03, 6, 6)` above the door) | Extra cues | Prompt at the crosshair |
|---|---|---|---|---|
| **Closed, can open** | Closed | Destination tint at emissive 0.8 | **Light strip under the door**: `PlaneGeometry(1.3, 0.04)` `#FFB040` emissive 0.8 (for passages to lit areas); handle glints | `E  Open` |
| **Open** | Swung 95° over 450 ms `out` | Same | Light spill on the floor: additive wedge plane `#FFB040` at 15% opacity | — |
| **Passage** (area transition) | No leaf; veil | Destination tint at emissive 1.2 | Destination label; veil brightens 25% as you approach within 3 m | `E  Enter: Courtyard` |
| **Locked: needs a key/quest item** | Closed | `elite.gold` emissive 1.2 | Gold padlock icon sprite on the leaf (0.3 m); no light strip | `🔒 Needs: Hob's Lantern` (muted) |
| **Sealed by magic: needs a spell** | Closed | **The required spell's primary color** | **That spell's glyph** drawn on the leaf as an emissive line sprite (generated from its template points!); slow pulse 1.6 s | `✎ Draw Fire Bolt to break the seal` |
| **Boss door** | Closed / portcullis | `boss.violet` emissive 1.5 | 2 chains crossing the door; violet light leaking from the gaps; 0.03 m low-frequency camera rumble within 6 m | `E  Enter (boss)` |
| **Decorative / never opens** | Closed | **No rune** | No light strip, darker iron. Absence of a rune = not interactive | — |

**Door placement logic**

1. Center doors on wall segments, aligned with the room's main axis or the landmark sight line.
2. Every room has ≥ 2 exits, except a dead end that holds a reward (chest, secret, NPC).
3. Area transitions always sit at the end of a sight line, framed by 2 torches.
4. Leave ≥ 2.5 m clear in front of every door: no props, no spawn points.
5. Never put a door directly behind a pillar or banner as seen from the opposite entrance.
6. Door frames always use `stone.light` against darker walls, so openings read at a glance.

**Destination tints** (lintel runes and passage veils):
- Great Hall: warm gold `#E8B860`.
- Corridor: neutral `#B8B0A0`.
- Courtyard: soft teal `#7FB8A8`.
- Dungeon: dim violet `#8A78C8`.
- Forest: moss `#8FB080`.

All are muted on purpose so they never compete with spells.

### 1.4 Shared construction rules

- **Areas and walls:**
  - One `Group` per area, with only one area loaded at a time. Dispose the old area's geometries, materials and textures on travel.
  - Walls are `BoxGeometry` segments 0.6 m thick, split around door openings.
  - **Ceilings now matter** (the player looks up): add a ceiling plane or vaults everywhere except the Great Hall (enchanted sky) and outdoor areas.
- **Repeated props:** use `InstancedMesh` for anything repeated (candles, pillars, bars, benches, trees, books, chain links). An area should be ≤ 60 draw calls.
- **Light budget:**
  - Per area: 1 `HemisphereLight`, 1 `DirectionalLight` and **3 environment `PointLight` slots** (2 on mobile). The most important lights (hearth, moon) claim slots first; the rest of the torches are emissive + halo.
  - Plus **Wandlight** (§7) and 2 pooled spell lights (0 on mobile).
  - Keep the total count fixed (§9.4). On mobile, keep the 2 most important environment lights per area and make the others emissive-only.
  - Fake every other torch with an emissive flame and a halo sprite.
- **Shadows:** none. Characters get **blob shadows**: `CircleGeometry(0.6 × scale)` with a radial-gradient texture, `#000000` at 45% → 0%.
- **Fog:** always on, matching the background color.

### 1.5 Great Hall — "Warm Assembly" (hub)

| Aspect | Spec |
|---|---|
| Mood | Safe, ceremonial, warm. Rest point and quest givers. |
| Size | 36 × 24 m; walls 12 m, open to an **enchanted night sky** |
| Landmark | The **great hearth** (west wall, 3 m tall flame) + a **floating golden orrery** above the head table (3 nested `TorusGeometry` rings `#D4AF37`, rotating at 0.1–0.3 rad/s, central sphere emissive `#FFD9A0` 1.5) |
| Fog / background | `#1A1426`, fog 20 → 60 m |
| Hemisphere light | sky `#8070A0`, ground `#302828`, 1.9 |
| Directional light | `#FFD8A0`, 0.5, from (10, 20, 8) |
| Point lights (4) | Hearth `#FF8030` 3.0/14 · orrery `#FFC070` 2.0/30 · 2 sconces `#FF9A40` 1.5/12 |
| Palette | Floor `#5A4A3A` · walls `#6B6258` · tables `#6A4628` · banners `#8A1C1C` `#1C4A8A` `#1C7A3A` `#A08A1C` (≤ 60% sat) · gold `#D4AF37` |

| Prop | Recipe |
|---|---|
| 4 long tables | `BoxGeometry(2.2, 0.8, 12)` + instanced benches `0.6 × 0.45 × 12`; plates and goblets instanced (cylinders, gold, metalness 0.6) |
| Head table on a dais | Dais `BoxGeometry(16, 0.4, 4)` + table `14 × 0.8 × 1.4` + 5 high-backed chairs (box + tall box back) |
| 40 floating candles | InstancedMesh candle + flame (emissive `#FFB040` 3); bob ± 0.15 m; height 4–6.5 m so they sit in the upper field of view without blocking sight lines |
| Enchanted ceiling | `Points` (400 stars, size 0.35, `fog: false`) + a slow aurora: a large plane at y 14 m with an animated gradient shader (`#2A1D4F` ↔ `#1C4A6A`, 8% opacity) |
| Banners | `PlaneGeometry(2, 5)`, DoubleSide, vertex wave (desktop) |
| Stained-glass windows | Tall pointed-arch planes on the walls with a procedural colored-cell texture, emissive 0.4 (muted colors, ≤ 50% sat) |
| Exits | Grand double doors (south → Courtyard) · oak door (north → Corridor) |

### 1.6 North Corridor — "Long Shadows" (transit)

| Aspect | Spec |
|---|---|
| Mood | Transitional, mildly unsafe at night. Rhythmic pools of light. |
| Size | 60 × 6 m, vaulted ceiling 6 m |
| Landmark | A **tall stained-glass window** at the far east end (3 × 6 m) glowing with moonlight `#A0A8FF` emissive 0.6, visible down the full corridor length |
| Fog / background | `#120E1A`, fog 10 → 45 m |
| Hemisphere light | sky `#605878`, ground `#302828`: **1.9 by day, 1.1 at night** (Wandlight territory) |
| Point lights | ≤ 4 torches `#FF9A40` 1.6/12 (every other torch is real, the rest emissive + halo) |
| Palette | Floor `#4A4440` · walls `#5A5550` · runner `#7A1C24` · frames `#B08A3A` |

| Prop | Recipe |
|---|---|
| Vaulted ceiling | Instanced half-ring arches every 6 m: `TorusGeometry(3, 0.25, 6, 12, π)` standing upright, spanning the corridor; ceiling panels between them = flat planes at 6 m |
| Colonnade | Instanced pillars `CylinderGeometry(0.4, 0.5, 6, 10)` against both walls every 6 m (they also carry the arches) |
| Runner carpet | `BoxGeometry(56, 0.02, 2)` along the center line |
| Torches | Bracket box + stick + flame cone + halo (0.8 m) at 2.4 m height |
| Paintings | Frame box + canvas plane, eye level (1.6–2.4 m), random muted HSL(h, 0.35, 0.35) |
| Lived-in details | Instanced suits of armor in alcoves (decorative, no glow), a fallen book stack, a cat statue; keep them against the walls |
| Doors | Oak doors to classrooms on the north wall every 12 m (most decorative = no rune; 2 real); infirmary door near Sister Wren; dungeon stair portcullis at the east end |

### 1.7 Courtyard — "Open Air" (breathing room)

| Aspect | Spec |
|---|---|
| Mood | Dusk sky, the only area with "daylight". Relief after interiors. |
| Size | 44 × 44 m; crenellated walls 6 m; open sky |
| Landmark | **Clock tower** on the north side (4 × 4 × 20 m box tower + cone roof + emissive clock face `#FFE9B0` 1.0, r 1.2 m), visible from everywhere and from inside the Great Hall doors + **central fountain** |
| Fog / background | `#7A8CB0`, fog 30 → 90 m |
| Hemisphere light | sky `#8090B0`, ground `#2A3020`, 1.4 |
| Directional light | Sunset `#FFF0D0` 1.2 from (−20, 12, 10) |
| Palette | Grass `#4C7A3A` (35% sat) · paths `#9A9080` · walls `#7A7468` · fountain water `#3A80B8` (deliberately duller than Water Bullet) |

| Prop | Recipe |
|---|---|
| Fountain | Basin `CylinderGeometry(3, 3.2, 0.8, 20)` + water disc (roughness 0.2, y-bob ± 0.03) + 3-tier spout + 30 falling droplet particles (desktop only) |
| Covered walkway | Instanced arches along the east wall + slanted roof planes; gives shade and a cover silhouette |
| Well | Open cylinder + 2 posts + cone roof |
| Trees (8) | Instanced trunk + 2 cone leaf layers |
| Lived-in details | Benches, a wheelbarrow (Hob's), stacked barrels (instanced cylinders), training dummies (cylinder + sphere) |
| Doors | Grand doors north → Great Hall; forest gate east → Whisperwood (moss-tinted runes) |

### 1.8 Dungeon — "Cold Iron" (danger, boss)

| Aspect | Spec |
|---|---|
| Mood | Oppressive, claustrophobic. The darkest interior: **designed around Wandlight**. |
| Size | 44 × 36 m, ceiling **3.4 m**, heavy stone beams every 4 m |
| Landmark | The **Warden's cell glow**: violet light `#7A5CFF` spilling from the north-east cell through bars, visible from the entrance stairs |
| Fog / background | `#08060C`, fog 8 → 36 m |
| Hemisphere light | sky `#6A6088`, ground `#201C24`, **1.0** (low on purpose: Wandlight makes it comfortable; enemy eyes stay visible without it) |
| Directional light | `#A0A8FF`, 0.25 (moonlight through grates) |
| Point lights | 2 torches `#FF9A40` 1.6/12 · Warden glow `#7A5CFF` 1.2/10 · 1 spare for events |
| Palette | Floor `#3A3434` · walls `#4A4242` · beams `#2E2A2A` · bars `#2A2A2A` (metalness 0.8) · ooze pool `#3A6A5A` (emissive 0.3, muted) |

| Prop | Recipe |
|---|---|
| Ceiling beams | Instanced `BoxGeometry(44, 0.4, 0.5)` every 4 m at 3.2 m |
| Cells | North wall: 5 cells of instanced bars with iron cell doors (2 open, 2 locked, 1 boss portcullis) |
| Grates and light shafts | Ceiling grate planes with an alpha-tested grid texture; shafts = additive `PlaneGeometry(1.5, 3.4)` `#A0A8FF` at 8% (camera-facing on Y only) |
| Chains | Instanced torus links hanging from the beams (sway ± 3° at 0.5 Hz) |
| Lived-in details | Straw piles (flattened dodecahedra `#8A7A4A`), buckets, a rack of rusty tools, scratch marks (thin dark planes on the walls) |
| Weeping Rune (secret) | `TorusGeometry(0.5, 0.06, 6, 5)` emissive `#7FB0FF`; **invisible until Wandlight is within 5 m** (§7.4) |

### 1.9 Whisperwood Forest — "Bioluminescent Night" (dragon country)

| Aspect | Spec |
|---|---|
| Mood | Mysterious, exploratory, dangerous. Deep blue-black with muted mushroom glows. |
| Size | 64 × 64 m; dense tree ring boundary |
| Landmarks | **Starfall Altar beam**: a thin vertical additive cylinder `#BFE0FF` at 30% opacity, 40 m tall, visible above the canopy from anywhere. **Dragon nest smoke column** (dark particles rising 25 m) in the north-east marks danger. |
| Fog / background | `#0C1418`, fog 10 → 50 m |
| Hemisphere light | sky `#405870`, ground `#101810`, 1.2 |
| Directional light | Moon `#8FB0FF` 0.6 |
| Point lights | Moon fill `#8FB0FF` 1.5/80 at y 25; quest pickups `#9FD8FF` 1.5/6 |
| Palette | Ground `#22361E` · trunks `#4A3220` · leaves `#1F4A24` / `#2A5A2A` · mushrooms `#60D0B0` / `#9070C0` emissive 0.6 · fireflies `#D8FF70` |

| Prop | Recipe |
|---|---|
| Trees (≈ 250) | 2 InstancedMeshes; trunks 0.3–0.5 m wide so they read as obstacles at eye level; **keep 4 m wide winding paths** clear; canopy cones start at 2.5 m so the player can see under them |
| Undergrowth | Instanced low ferns (3 crossed planes with a leaf canvas texture, alpha-test) only along path edges, never on paths |
| Mushrooms | Instanced half-sphere caps; clusters mark path forks (natural wayfinding) |
| Fireflies | One `Points`, positions animated in the vertex shader (zero CPU) |
| Dragon nest | Ring of jagged rocks (`DodecahedronGeometry`, `#3A3430`), scorched ground decal `#1A1210`, scattered bones `#D8D0C0`, smoke column |
| Gate | Wrought-iron forest gate on the west edge back to the Courtyard |

---

## 2. NPC character models

### 2.1 Shared wizard rig

The model faces +Z with its origin at the feet. Total height is ≈ 1.95 m plus the hat, so **NPC eyes sit at 1.75 m, just above player eye level**. That makes them feel present when you talk to them.

| Part | Geometry | Position (y) |
|---|---|---|
| Robe | `ConeGeometry(0.55, 1.5, 14)` | 0.75 |
| Hem trim | `TorusGeometry(0.5, 0.05, 6, 18)` (rotate x 90°) | 0.10 |
| Shoulders | `SphereGeometry(0.30, 14, 10)` | 1.42 |
| Head | `SphereGeometry(0.24, 16, 12)` | 1.72 |
| **Face (new for first person)** | Eyes: 2 × `SphereGeometry(0.035)` `#111111` (x ± 0.08, z 0.21) · brows: 2 × `BoxGeometry(0.08, 0.015, 0.02)` in the hair color, angled per personality · nose: `ConeGeometry(0.03, 0.08, 5)` rotated forward · mouth: `BoxGeometry(0.07, 0.012, 0.01)` `#5A2A2A` | 1.68–1.78 |
| Hat | Brim `CylinderGeometry(0.46, 0.46, 0.04, 18)` at 1.90 + cone `ConeGeometry(0.30, 0.75, 14)` at 2.27 (tilt 0.12) | — |
| Staff / prop | Per NPC | — |

**Behavior at eye level:**
- **Head tracking:** when the player is within 6 m, rotate the head toward the camera (yaw clamp ± 70°, pitch ± 25°, slerp at 6 rad/s). The body turns only if the angle exceeds 70°.
- **Idle:** bob y ± 0.02 m at 2 rad/s, plus one personality gesture every 4–8 s (listed below).
- **Talk:** mouth box scale y 1 ↔ 3 at 8 Hz while dialogue text types out.
- **Ghost variant:** opacity 0.55, emissive 0.4, float + 0.3 m.

### 2.2 Roster

| NPC (role) | Front silhouette hook | Palette (robe / hat / trim / glow) | Costume details | Identifying prop | Idle gesture |
|---|---|---|---|---|---|
| **Headmistress Orla Vane** (main quests, Great Hall) | **Tallest** (×1.15), very tall hat (cone h 1.0), high collar framing the face | `#3B2A6B` / `#2A1D4F` / `#D4AF37` / `#FFD84A` | Collar `CylinderGeometry(0.32, 0.38, 0.25, 12)` at 1.55; gold star on the hat; stern angled brows | **Crescent staff**: `TorusGeometry(0.14, 0.03, 6, 16, π × 1.3)` atop the staff | Taps the staff once; the orb pulses |
| **Pip Tansy** (student) | **Shortest** (×0.8), big head (×1.2), hat slipping (tilt 0.35) | `#7A2D2D` / `#5A1F1F` / `#FFC070` / `#FFB040` | Striped scarf (3 alternating tori); raised, eager brows | **Book stack** under the arm (3 boxes in muted red, blue, green) | Pushes the hat back up |
| **Professor Barnaby Quill** (glyph master) | Hunched head (z + 0.08); **long beard** to the waist; spectacles | `#2D4A3A` / `#1F3529` / `#C0C0C0` / `#9FE8C0` | Beard `ConeGeometry(0.18, 0.7, 10)` `#E8E8E8` inverted; 2 torus lenses r 0.05 | **Giant quill** behind the hat (flattened cone `#F2E9D8`, tilted 0.6 rad) | Writes in the air; a short faint glyph trail |
| **Sister Wren** (healer) | **Rounded hood**, no pointed hat; white apron | `#E8E8F0` / `#B0C8FF` / `#6DC89A` / `#3DFF8E` (only when healing) | Hood = partial sphere over the head; apron plane; soft brows | **Herb lantern** on a chain (box with a muted green core) | Checks the lantern, sways it |
| **Hob Marrow** (groundskeeper) | **Broadest** (x ×1.3), flat cap, bushy beard | `#5A4632` / `#3D2F22` / `#8FBF5A` / `#FFB040` | Flat cap cylinder; 2 boot boxes; rolled sleeves (tori) | **Shovel** (handle + flat box blade, metalness 0.7) | Leans on the shovel |
| **Old Grimble** (friendly ghost, dungeon) | Floating, **no feet**, trailing wisp tail | `#BFE0FF` / `#9FC8FF` / `#FFFFFF` / `#DCE9FF` | Ghost material + 3 shrinking tail spheres; wrist chains | Chains (2 torus links per wrist) | Drifts in a figure-eight; opacity 0.4 ↔ 0.6 |
| **Duel Master Kael Thorne** (duel host) | Angular: **wide pauldrons** (flattened octahedra), half-cape | `#2A2A35` / `#1A1A22` / `#E8243C` / `#FF5C5C` | Cape plane behind; sharp brows | **Crossed staves** on the back | Arms crossed; nods at challengers |

**Readability rule:** any two NPCs differ on at least two of: height, headwear shape, width, prop. Verify by rendering them black against white from the **front** at 64 px.

**Quest markers:**
- Sprite 0.7 m above the head. `!` `#FFD84A` = new quest; `?` `#7DFF7D` = turn in.
- Billboard; scale with distance so it stays 28–40 px on screen.
- Visible through walls at 30% opacity within 25 m, so it doubles as a waypoint.

**Conversation framing (first person):**
- When dialogue opens, ease the FOV 75° → 62° over 300 ms (`inout`) and lerp the view so the NPC's face sits at 45% screen height.
- Restore everything over 250 ms on close.
- No camera cut, so immersion is kept.

---

## 3. Enemies, status cues and dragons

### 3.1 Enemy reading system

| Cue | Rule |
|---|---|
| **Element** | Eye/core glow color = the element they attack with (fire `#FF7A2A`, poison `#8EE03A`, lightning `#FFF04D`, spirit `#DCE9FF`, physical `#FF3B2F`). **Eyes are always emissive ≥ 2.0**, so enemies are visible in darkness at 25 m even without Wandlight. |
| **Threat tier** | Minion: scale 0.7–0.9, no ring. Standard: 1.0–1.2, thin red ground ring (r 0.9 × scale). Elite: 1.3–1.5, double gold ring. Boss/dragon: ≥ 1.8, rune ring + top-center health bar. |
| **Off-screen threats (first-person critical)** | Screen-edge arrows (`enemy.rim`, 28 px chevrons) point to enemies within 12 m outside the view. They pulse at 4 Hz when that enemy is winding up an attack. |
| **Damage direction** | Getting hit flashes a red arc segment (90°, 40% opacity) at the screen edge facing the attacker; it fades over 400 ms. |
| **Hit reaction** | Emissive flash to white 60 ms + knockback (§10). |
| **Death** | Noise-dissolve shader (400 ms, edge glow in the element color) + 30-particle burst. |
| **Wandlight rim** | Within Wandlight radius, enemies get a warm rim highlight that makes silhouettes pop (§7.4). |

### 3.2 Standard enemy roster

| Enemy | Front silhouette | Palette (body / glow) | Build | Attack tell (first-person readable) |
|---|---|---|---|---|
| **Dust Sprite** (minion) | Floating faceted gem + orbiting motes | `#D9C38C` / `#FFE9A8` | `IcosahedronGeometry(0.38, 0)` + 4 orbiting spheres | Stops and spins faster 300 ms before dashing at you |
| **Cellar Rat** (minion) | Low and wide; huge ears; red eyes | `#6B5A4E` / `#FF3030` | Squashed sphere body + head + ear cones + tail | Rears up 200 ms before biting (head rises into view) |
| **Bog Imp** | Round, huge head, horn-ears | `#4F7A3A` / `#FFD23A` | Body + head spheres + 2 cones | Crouches 250 ms, then lobs a dark-core mud ball |
| **Thornback Spider** | Wide, flat, 8 legs, glowing abdomen | `#2B2633` / `#B3FF3A` | Body + abdomen spheres; 8 instanced leg cylinders | Front legs lift and the abdomen pulse speeds up (2 → 6 Hz) before a venom spit |
| **Animated Armor** | Boxy, visor slit, sword | `#9AA3AD` (metal 0.7, rough 0.35) / `#58C8FF` | Box limbs; emissive visor | Sword raised overhead for 400 ms before a heavy swing |
| **Corridor Wraith** | Tall tattered cone, floating hood | `#8090B0` at 60% / `#9FD8FF` | Open cone DoubleSide + dark head sphere | Fades to 20% opacity while repositioning (300 ms); **Wandlight makes it +25% visible** |
| **Ember Salamander** | Long, low, glowing back spots | `#C8401C` / `#FFA020` | Capsule body + cone tail + emissive spots | Back spots light up head → tail before the flame spit |
| **Stone Gargoyle** (elite) | Stocky, slab wings, horns | `#6F6F78` / `#FF5050` | Boxes + wing slabs | Wings snap open 300 ms before a charge |
| **The Hollow Warden** (boss) | Huge armored skeleton, violet chest core | `#35303F` / `#7A5CFF` | Armor rig ×1.8 + skull + core | Core flares; a red ground ring and a red curtain (§3.4.3) appear 600 ms before the slam |

### 3.3 Status-effect visual cues

Rules:
- One reserved color, one motion and one icon per status.
- Max 3 visible on a model; the rest show as nameplate icons.
- Statuses on the **player** show as screen-edge tints (last column), because you can't see your own body.

| Status | Color | On enemies (3D) | Icon | On the player (screen) |
|---|---|---|---|---|
| Burning | `#FF7A2A` | 12 / 6 rising additive embers, 10 Hz flicker; body tint 0.25 | 🔥 | Orange edge vignette flicker, embers drifting up the screen edges |
| Poisoned | `#8EE03A` | 8 / 4 rising bubbles; green tint 0.2 | ☠️ | Green edge vignette pulsing at 1 Hz; slight screen wobble (0.3°) |
| Soaked | `#2F9BFF` | Falling drips; roughness 0.2 | 💧 | Droplet streaks sliding down the screen edges |
| Stunned | `#FFF04D` | 3 orbiting star sprites at the head | 💫 | Brief white-yellow flash + 400 ms look-input lock |
| Asleep | `#A9B4FF` | "Z" sprites; body tilts 15° | 💤 | (Player can't be put to sleep: immune by design) |
| Afraid | `#A34DFF` | Shiver ± 0.03 m at 25 Hz + violet aura ring | 😱 | Violet edge vignette + 4% FOV squeeze |
| Blinded | `#F2D49B` | Dust ring at head height | 🌫️ | Sandy haze overlay at 35% opacity, clearing from the center out |
| Shielded | `#2EE6C3` | Fresnel bubble (§6) | 🛡️ | Teal screen-edge glow + faint hex pattern at the edges (§6.3) |
| Chilled (frost dragon) | `#BFF4FF` | Frost sprites; 30% slower animation | ❄️ | Frost creeping in from the screen corners; movement −30% |
| Draconic Mark | `#E8243C` | Rotating rune under the target | 🐉 | Crimson rune flashes at the screen top: "Marked!" |

### 3.4 Dragons: escalated threats and allies

Dragons are the game's big moments. In first person they **dwarf the player**: you look up at them.
- Every attack has a long, readable telegraph that works at eye level.
- They get dedicated audio, screen shake and a boss bar.

#### 3.4.1 Shared procedural dragon rig

| Part | Build |
|---|---|
| Spine | 10–16 instanced `SphereGeometry` segments tapering from `r_body` to 0.25 × `r_body`; follow-the-leader with fixed spacing gives serpentine motion with zero animation data |
| Head | Elongated `BoxGeometry` snout + swept-back horn cones + emissive eyes + **throat glow sphere** inside the neck (breath telegraph) |
| Wings | Custom `BufferGeometry`: shoulder vertex + 3–4 finger tips + membrane triangles, DoubleSide, vertex colors darker at the edges. Flap ± 0.6 rad at 1.5 Hz (glide) / 4 Hz (hover). |
| Legs / tail / spines | Cylinder pairs + cone claws; tail blade cone; instanced back-spine cones |

About 8 draw calls per dragon.

#### 3.4.2 Variants

| Dragon | Role | Length / head height | Silhouette | Palette (body / belly / membrane / glow) | Attacks |
|---|---|---|---|---|---|
| **Wyrmling** | Summoned **ally** | 1.6 m / 0.9 m (below eye level: reads as a companion) | Chubby, big head, stubby wings | `#C23A4A` / `#F2C08A` / `#8A2A3A` / **ally rim `#4AF2FF`**, white-cored flame | Fire puffs (player colors) |
| **Ember Drake** | Standard dragon (forest) | 4 m / 2.4 m | 4 legs, broad wings, heavy | `#7A1F12` / `#C8641E` / `#4A120C` / `#FF4A1C` | Fire cone 6 m; scorch decals |
| **Frost Wyvern** | Elite (courtyard siege) | 5 m / 3.2 m | **2 legs** (wings are arms), long neck, crystal spines | `#3A5A7A` / `#BFE8FF` / `#2A4A6A` translucent 0.8 / `#BFF4FF` | Frost beam (Chilled), ice spikes from the ground |
| **Storm Wyrm** | Elite (flies over the courtyard) | 7 m / 4–9 m (airborne) | **No legs**, serpentine, fin-wings | `#2A2A4A` / `#6A6A9A` / `#4A4AFF` at 0.6 / `#FFF04D` + `#9F7BFF` arcs | Lightning on telegraphed circles |
| **Elder Dragon "Ashmaw"** | Final boss (nest) | 10 m / 6 m | Massive, horn crown, torn wings, glowing cracks | `#1E1418` / `#5A2A1E` / `#2A1010` / cracks & breath `#FF4A1C` → `#FFD36B` | Sweeping breath, wing gust (knockback), meteor rain, tail sweep |

> Enemy dragon breath obeys the foe rule: dark core `#1A0A12` + red rim + the dragon's hue. The player's Dragon's Breath has a white-hot core.

#### 3.4.3 Telegraphs that read at eye level

Ground decals alone are hard to see in first person (you look *forward*, not down). Every dragon telegraph uses **three layers**:
1. **Body tell:** throat glow, rearing, wing spread.
2. **Ground decal:** `RingGeometry`/`CircleGeometry` at y + 0.02, `#FF3B2F`, fill animated 0 → 1.
3. **Danger curtain:** a vertical gradient band along the decal's edge. Use `CylinderGeometry` open-ended or plane strips, 1.5 m tall, `#FF3B2F` → transparent upward, additive, 40% opacity. It reads at eye level and through the corner of your eye.

| Attack | Body tell | Duration (≥ 600 ms hard minimum) |
|---|---|---|
| Breath | Throat glow emissive 0 → 4; head rears 0.4 rad; cone decal + curtain fill | 700 (Drake) / 900 (Wyvern) / 1100 (Elder) |
| Wing gust (knockback) | Wings spread and hold; dust ring expands at the feet; the curtain is a full circle | 650 |
| Tail sweep | Body twists away; 120° arc decal + curtain | 600 |
| Dive / charge | Rises 3 m; a shadow decal locks onto the player and shrinks 2 → 0.8 m; screen-edge arrow if off-screen | 900 |
| Lightning call | 3–5 circle decals `#FFF04D` with spark crowns at head height | 800 |
| Meteor rain | Sky darkens 15%; circles appear 150 ms apart; falling streaks visible high in the view | 1200 |
| Enrage (< 30% HP) | Cracks emissive ×2, membranes glow, roar shake 400 ms | — |

**Escalation in first person:**
- **Arrival:** FOV punch 75° → 80° → 75° over 600 ms, plus a 250 ms roar shake (0.08 m camera offset, 25 Hz decaying).
- **Look-up hint:** if the dragon's head is above the view, show a soft upward chevron at the top edge.
- **Boss bar:** top-center, 60% width, name in `elite.gold`.
- **Ally dragons:** a cyan rim plus a cyan blob shadow, so they never read as threats.

---

## 4. Spell drawing shapes

### 4.1 Rules

- **One continuous stroke** (pointer down → up).
- Either direction is accepted.
- **Closed** shapes (●) can start anywhere on the outline.
- Tilt tolerance ± 20°; minimum stroke size 25 px.
- Templates use a unit square, x right, **y down**, built with the game's `ShapeKit` (`arc` angles are counter-clockwise on screen).
- **First-person drawing:** strokes are drawn **centered on the crosshair**. The ghost guide is drawn around the crosshair too, and the spell fires at whatever the crosshair points at (§8.3).
- **Ghost guide:** template in the spell primary at 45% opacity, dashed 10/10 px, with a white start dot (r 5 px) and an arrowhead 6 points in.
- **Verified:** all 18 shapes were run through the game's recognizer with simulated sloppy drawing (tilt ± 12°, stretch 0.8–1.25×, wobble).
  - Every new shape (dragon spells, Wandlight, new Spawn Ghost) scored 30/30 or 40/40.
  - Overall accuracy at heavy wobble: 98.7%. The remaining misses are rare mix-ups between other existing spells.
  - Random scribbles never reached the casting threshold (0 of 200; max 0.773 vs threshold 0.78).

### 4.2 The 13 core spells

| # | Spell | Shape | Stroke | `ShapeKit` template | Closest other |
|---|---|---|---|---|---|
| 1 | **Fire Bolt** | Rising Triangle ● | Bottom-left → top apex → bottom-right → back | `poly([[0,1],[0.5,0],[1,1],[0,1]])` | Water Bullet |
| 2 | **Water Bullet** | Falling Triangle ● | Top-left → top-right → bottom point → back | `poly([[0,0],[1,0],[0.5,1],[0,0]])` | Heal (85%) — keep the point sharp |
| 3 | **Shield** | Circle ● | Full circle, any start | `circle()` | Heal (86%) |
| 4 | **Poison** | Serpent S | Top-right, over the top to the left, down through the center, curve right, end bottom-left | `join(arc(0.5,0.25,0.25,20,270,24), arc(0.5,0.75,0.25,90,-160,24))` | Lightning (80%) |
| 5 | **Lightning Strike** | Bolt ⚡ | Top → down-left to mid → right → down-left to bottom | `poly([[0.65,0],[0.25,0.5],[0.75,0.5],[0.35,1]])` | Poison (80%) |
| 6 | **Gust** | Wave ~ | Left → right, 2 sine periods | `wave(2, 0.25)` | Dragon Ward (72%) |
| 7 | **Cause Fear** | Jagged W | Top-left ↓ ↑ ↓ ↑ top-right | `poly([[0,0],[0.25,1],[0.5,0.35],[0.75,1],[1,0]])` | Dragon Bind (68%) |
| 8 | **Sleep** | Zed Z | Top-left → top-right → bottom-left → bottom-right | `poly([[0,0],[1,0],[0,1],[1,1]])` | 54% (very safe) |
| 9 | **Dragon's Breath** | Spiral | From the center, spiral outward counter-clockwise 2 turns | `spiral(2)` | 60% (very safe) |
| 10 | **Heal** | Heart ● | From the bottom point: left lobe, top notch, right lobe, back | `heart()` | Shield (86%) |
| 11 | **Spawn Ghost** | **Pigtail** | Diagonal up from bottom-left to the loop's base, one counter-clockwise loop (up the right side, over, down the left), diagonal down to bottom-right | `join(poly([[0,1],[0.5,0.45]]), arc(0.5,0.25,0.2,270,630,32), poly([[0.5,0.45],[1,1]]))` | Summon Elder (65%) |
| 12 | **Spirit Bomb** | Five-Point Star ● | One-stroke pentagram from the top point | `star(5)` | 48% (very safe) |
| 13 | **Kamehameha Wave** | Loop & Release | Small circle on the left (start at its right edge), then a long line right | `join(arc(0.15,0.5,0.15,0,360,32), poly([[0.3,0.5],[1,0.5]]))` | Water Bullet (68%) |

> Spawn Ghost used to be a square, but that was 92% similar to Shield's circle and swapped about 1 in 15 casts under fast drawing. The Pigtail is already live in the current build (`shapeRev: 2` re-teaches existing saves).

### 4.3 Dragon spells and Wandlight

| # | Spell | Shape | Stroke | `ShapeKit` template | Closest other |
|---|---|---|---|---|---|
| 14 | **Summon Wyrmling** | Wings M | Bottom-left ↑ top, ↓ middle, ↑ top, ↓ bottom-right | `poly([[0,1],[0.25,0],[0.5,0.6],[0.75,0],[1,1]])` | Heal (59%) |
| 15 | **Dragon Ward** | Infinity ∞ ● | Sideways figure-eight through the center | For `i = 0..64`: `t = i/64·2π`, `d = 1 + sin²t`, point `[0.5 + 0.5·cos t/d, 0.5 + 0.8·sin t·cos t/d]` | Summon Elder (61%) |
| 16 | **Dragon Bind** | Shackle U | Top-left ↓, round the bottom, ↑ top-right | `join(poly([[0,0],[0,0.5]]), arc(0.5,0.5,0.5,180,360,24), poly([[1,0.5],[1,0]]))` | Shield (79%) |
| 17 | **Summon Elder Dragon** | Arrowhead | Bottom-center ↑ tip, ↙ left barb, back ↗ to tip, ↘ right barb | `poly([[0.5,1],[0.5,0],[0.15,0.35],[0.5,0],[0.85,0.35]])` | Dragon Ward (61%) |
| 18 | **Wandlight** (toggle) | Check mark ✓ | Short stroke down-right, long stroke up-right | `poly([[0,0.6],[0.3,1],[1,0]])` | Cause Fear (67%) |

Why a check mark for Wandlight:
- I tested a vertical line, a caret ^ and a "candle" (line + loop). All were recognized.
- The check mark was the least similar to existing spells, and it's a deliberate gesture: a plain line is too easy to trigger by accident while aiming.
- It also has a **keyboard shortcut (L)** and a mobile button (§7.2), because toggling a light shouldn't cost a combat gesture.

### 4.4 Recognizer settings for real time

| Setting | Value |
|---|---|
| Success / Perfect thresholds | 0.78 / 0.92 |
| Live guess | Every 4th pointer sample, at most every 60 ms (≈ 1.8 ms per guess) |
| Templates searched | Only spells the player knows (all in duels) |
| Final recognition cost | ≈ 20 ms for 17 templates (measured, desktop-class CPU); expect 40–80 ms on phones. Run it in a Web Worker (§9.8). |

---

## 5. Spell color schemes

Each spell has three colors:
- **Primary:** the effect body.
- **Secondary:** accents, trails, sparks and the impact ring.
- **Glow:** the halo and light color.

Player-spell cores are always `#FFFFFF`, blending to glow at 30% radius.

| Spell | Family | Primary | Secondary | Glow | Distinguishing note |
|---|---|---|---|---|---|
| Fire Bolt | Fire | `#FF7A2A` | `#FFB347` | `#FFD9A0` | Orange ball |
| Dragon's Breath | Dragonfire | `#FF4A1C` | `#FFC23D` | `#FFE36B` | Redder; cone stream, never a ball |
| Water Bullet | Water | `#2F9BFF` | `#9AD4FF` | `#D6EEFF` | Sky-blue droplet |
| Lightning Strike | Lightning | `#FFF04D` | `#FFFFFF` | `#FFF9B8` | Vertical bolt from above |
| Gust | Wind | `#F2D49B` | `#FFFFFF` | `#FFF6DE` | Pale sand; reads by motion |
| Poison | Poison | `#8EE03A` | `#3E8F1E` | `#C9FF8A` | Acid green + dark smoke |
| Cause Fear | Mind | `#A34DFF` | `#2A0A40` | `#E0B8FF` | Violet + black smoke, jagged |
| Sleep | Mind | `#A9B4FF` | `#E8ECFF` | `#C9D4FF` | Pastel, slow, soft |
| Shield | Ward | `#2EE6C3` | `#0F6E66` | `#B8FFF6` | Teal-mint |
| Heal | Life | `#3DFF8E` | `#1E9E5A` | `#C8FFE0` | Green, upward motion |
| Spawn Ghost | Spirit | `#DCE9FF` | `#8FA6C8` | `#FFFFFF` | Near-white, translucent |
| Spirit Bomb | Soul | `#FF5CDB` | `#8FB8FF` | `#FFE0F6` | Magenta orb with blue sparks |
| Kamehameha Wave | Energy | `#3D5CFF` | `#A8C8FF` | `#FFFFFF` | Royal-blue beam, white core |
| Summon Wyrmling | Draconic | `#E8243C` | `#FFC23D` | `#FF8A6B` | Crimson + gold sigil |
| Dragon Ward | Draconic | `#E8243C` | `#2EE6C3` | `#FFB8C0` | Crimson ring, teal inner |
| Dragon Bind | Draconic | `#FFC23D` | `#E8243C` | `#FFE9A8` | Gold chains, crimson runes |
| Summon Elder Dragon | Draconic | `#E8243C` | `#FFD36B` | `#FFFFFF` | Crimson silhouette, gold eyes |
| Wandlight | Light | `#FFF1D6` | `#FFD9A0` | `#FFFFFF` | Warm white; a light source, not a projectile |

**Categories** (spellbook tabs, spell guide, quick-glyph frames):

| Category | Color | Spells |
|---|---|---|
| Elemental | `#FF7A2A` | Fire Bolt, Water Bullet, Lightning, Gust, Dragon's Breath |
| Affliction | `#A34DFF` | Poison, Cause Fear, Sleep |
| Ward & Life | `#2EE6C3` | Shield, Heal |
| Spirit | `#FF5CDB` | Spawn Ghost, Spirit Bomb, Kamehameha |
| Draconic | `#E8243C` | 4 dragon spells |
| Utility | `#FFF1D6` | Wandlight |

**Contrast checks:**
- **Blue family:** Water / Kamehameha / Sleep share 200–238°. They are separated by form (bullet / beam / mist) and by saturation and value (Sleep is pastel; Kamehameha has a white core and a huge glow).
- **Fire family:** Fire Bolt vs Dragon's Breath differ in hue (25° vs 15°) and form.
- **Warm pale pair:** Wandlight vs Gust are both pale and warm, but Wandlight is far lighter and never travels.
- **World vs spells:** no environment uses a saturated reserved hue. The dungeon ooze is muted teal, and the Warden core is violet.

---

## 6. Spell effect visualizations

### 6.1 First-person rules for effects

1. **Spells start at the wand tip.** World-space wand tip = camera position + camera-space offset `(0.22, −0.20, −0.55)` (matches the viewmodel, §7.6).
2. **Keep effects out of the player's face:**
   - Fade every particle and mesh to 0 opacity within 0.6 m of the camera.
   - Start cone effects 0.8 m ahead of the wand.
   - Near-camera additive overdraw is the #1 frame-rate killer in first person.
3. **Self-cast spells are shown on screen, not as a sphere around the camera.** A bubble around the camera fills the screen with transparent pixels. Use screen-edge effects instead (§6.3).
4. **Aim:** spells fly to the crosshair raycast hit point. Soft aim assist bends the trajectory up to 4° (desktop) or 8° (touch) toward the nearest enemy inside that cone.
5. **Scale up for distance:** effects hitting targets beyond 15 m scale their impact by ×1.3, so they still register on screen.

### 6.2 Shared building blocks (all pooled; zero allocation in combat)

| Block | Build | Pool (Desktop / Mobile) |
|---|---|---|
| Particles | One `InstancedMesh` of camera-facing quads + custom `ShaderMaterial` (per-instance color/size/life, soft radial falloff, near-camera fade), additive, `depthWrite: false` | 3000 / 1000 |
| Halo sprite | 64 px radial-gradient `CanvasTexture`, additive. Fake bloom on every bright object. | 64 / 32 |
| Trail ribbon | Triangle strip of the last 16 positions, alpha fading to the tail | 24 / 12 |
| Shock ring | `RingGeometry(0.9, 1, 48)` scaled 0 → R, fading | 16 / 8 |
| Light flash | `PointLight` from the fixed pool, intensity curve | 2 / 0 |
| Beam | Open `CylinderGeometry` scaled along its length; white core + additive sheath | 4 / 2 |
| Decal | Ground circle/ring, `polygonOffset` | 24 / 12 |
| Screen overlay | One full-screen CSS layer (or a single post quad) for vignettes, edge glows and flashes | 1 |

**Universal impact package** (every damaging spell; tier values in §10):
1. Target white flash.
2. Halo burst.
3. Shock ring (secondary color).
4. Particle burst.
5. Damage number.
6. Hit-stop + camera kick on Great and Perfect casts.

### 6.3 Per-spell effects

Particle counts are Desktop / Mobile. "Travel" is the Perfect-tier speed; §10 scales it by tier.

| Spell | Wind-up (at the wand) | Travel / body | Impact | Lingering | Particles |
|---|---|---|---|---|---|
| **Fire Bolt** | Wand tip flares orange; 6 sparks spiral in | Sphere r 0.25, white core, halo 0.8 m, orange trail ribbon, pooled light; 40 m/s, slight arc | 50-particle burst, 2 m shock ring, scorch decal (1.5 s) | Burn embers | 70 / 30 |
| **Water Bullet** | 8 droplets orbit the wand tip | Elongated droplet (sphere scaled 0.8 × 0.8 × 1.6, aligned to velocity, roughness 0.1), falling droplet trail; 45 m/s | Dome splash (40 droplets, gravity −9.8), splash ring, Soaked status | Puddle decal 2 s | 60 / 25 |
| **Lightning Strike** | Spark crown above the *target* 120 ms (Perfect) – 200 ms (Good); wand crackles | Instant jagged `Line` (12 segments, ± 0.6 m jitter) from 12 m above the target, 3 re-jitters at 40 ms + 2 branches | Pooled light flash 15 / 25 m, 60 sparks, 3 m ground ring, camera kick | Stun stars | 80 / 35 |
| **Gust** | Dust swirl around the wand | Crescent of 3 stacked arc planes racing forward at 30 m/s, sideways dust streaks; starts 1 m ahead of the camera | Target knocked back 1.5 m; dust ring at head height | Blind haze | 90 / 40 |
| **Poison** | Green bubbles rise from the tip | Wobbling sphere r 0.25 (vertex-shader wobble) dripping particles; 30 m/s | Acid splash + lingering cloud (30 large soft particles `#3E8F1E` at 50%, 2.5 s) | Poison bubbles | 90 / 37 |
| **Cause Fear** | Brief violet vignette pulse (80 ms) on *your* screen | Dark comet: black-violet core, `#2A0A40` smoke trail, zig-zag path ± 0.4 m | Jagged 8-point star ring + canvas-drawn skull sprite flash (150 ms) | Fear shiver + aura | 50 / 20 |
| **Sleep** | Pastel motes drift from the tip | Slow drifting cloud of 20 soft particles at 12 m/s (deliberately the slowest), sine sway | Cloud envelops the target for 1 s; Z sprites | Sleep Zs | 40 / 18 |
| **Shield** (self) | Teal ring sweeps across the bottom of the screen in 120 ms | **First person: screen-edge teal glow** (radial-gradient overlay, edges 35% → center 0%) **+ faint scrolling hex pattern** at the edges + the wand hand gets a teal rim. Other players and enemies see the 3D fresnel bubble (`SphereGeometry(1.4, 24, 16)`, alpha = `pow(1 − dot(N, V), 2.5)`). | On absorbing a hit: the edge glow flashes white on the side the hit came from (100 ms) | Persists; shatter = 40 shards flying outward from the screen center (screen-space) | 40 / 20 |
| **Heal** (self) | Green ring sweeps up from the bottom edge | Particles rising through the **lower periphery** of the view (spawned 1.2 m ahead, 0.6–1.2 m below the eye line) + green edge pulse + soft white flash 100 ms | `+HP` number near the HP bar | Sparkle 0.5 s | 70 / 30 |
| **Spawn Ghost** | Ground cracks with white light 2 m ahead-right | Ghost (wizard rig, ghost material, scale 0.7) rises in 300 ms at your **right side, 1.5 m ahead**: visible in view, never blocking the crosshair | Each ghost strike: small white projectile r 0.2, 35 m/s, wispy trail | Fades out over 400 ms | 40 / 18 |
| **Spirit Bomb** | The orb grows **2.5 m ahead and 1.4 m above eye level** for 500 ms (r 0.1 → 1.6 m); blue sparks stream *inward* from the edges of the view | Pink orb, white core, 2 rotating additive shells, pooled light; falls toward the target in 400 ms `in` | 120-particle burst, 6 m ring, light flash 20, camera kick, hit-stop 120 ms | Pink embers 1 s | 160 / 60 |
| **Kamehameha Wave** | Charge 400 ms: blue particles converge into a sphere at the wand tip, pulsing faster | **Beam tapers near the camera**: core r 0.06 at the wand → 0.35 at 3 m; sheath r 0.15 → 0.8; spiral streaks; extends in 120 ms, holds 600 ms, radius jitter ± 5% at 30 Hz | Contact sparks, scorch line, sustained camera shake 0.15° | Afterglow 300 ms | 140 / 55 |
| **Dragon's Breath** | Wand tip turns red; a dragon-head sigil sprite flashes 1 m ahead (150 ms) | Cone stream starting **0.8 m ahead**: 25 puffs/s × 10 particles for 1.2 s, 9 m/s, ± 15° spread, color primary → secondary → smoke `#3A2A20`, size 0.45 → 1.05 m | Target engulfed + scorch cone decal | Smoke 1 s | 300 / 110 |
| **Summon Wyrmling** | Crimson summoning circle (2 m decal, rotating runes) draws 3 m ahead in 250 ms | Wyrmling bursts out with a wing flap + 30 gold sparks; ally rim `#4AF2FF` | — | Fights 12 s, dissolves into embers | 60 / 25 |
| **Dragon Ward** (self) | Crimson ∞ sigil traces 1 m ahead | First person: two crimson/teal rings orbit **at the screen edges** (2D overlay arcs) + crimson edge glow. Others see 3D interlocking rings around you. | Blocked dragon fire splits around you (particles deflect sideways past the camera at > 0.8 m) | 6 s | 50 / 20 |
| **Dragon Bind** | Gold chains snake from the ground under the target in 200 ms | Instanced torus links along 4 Catmull-Rom curves from ground anchors to the dragon | A flying dragon is dragged down 3 m in 300 ms; landing dust; camera kick | Chains strain 2.5 s, then shatter | 70 / 30 |
| **Summon Elder Dragon** | Screen darkens 25% over 300 ms; a giant sigil spreads across the ground ahead; low rumble | Spectral crimson dragon (shared rig, scale 4, translucent) swoops **across** the view from behind-left to front-right in 1.2 s, breathing white-cored fire along its path | Sequential impacts 150 ms apart, heavy kick, hit-stop 140 ms | Ember rain 1.5 s | 400 / 140 |
| **Wandlight** | See §7 | — | — | — | 6 / 3 |

### 6.4 Intensity by draw quality

The same spell looks stronger when drawn better.

| Tier | Size | Particles | Glow / light | Extras |
|---|---|---|---|---|
| Perfect (≥ 92%) | ×1.15 | ×1.3 | ×1.3 / ×1.5 | Gold sparkle ring at the wand tip, extra shock ring, hit-stop and kick (§10) |
| Great (85–92%) | ×1.0 | ×1.0 | ×1.0 | Small kick |
| Good (78–85%) | ×0.85 | ×0.7 | ×0.8 | No kick, thinner trail |

---

## 7. Wandlight (the light charm)

### 7.1 Purpose and design

- **What it is:** a warm, steady light at your wand tip. It makes dark areas (the dungeon, corridors at night, the forest) comfortable to navigate and fight in.
- **Darkness is tuned so you can play without it**, but slowly and anxiously. Wandlight is the reward that makes the dark feel safe.

### 7.2 Activation

| Input | Action |
|---|---|
| Draw ✓ (check mark) | Toggle on/off (also teaches it via the normal spell-lesson flow) |
| Keyboard **L** | Toggle (no gesture needed mid-fight) |
| Mobile | Small wand-tip button above the draw button (44 px, `#FFF1D6` icon) |
| Cost | Free to toggle; optional upkeep 0.5 MP/s (turn it off in duels, where it would just be a handicap) |
| Ignite | 180 ms: intensity 0 → 120% (`out`) with 2 flickers (30 ms dips to 60%), settling to 100% over 120 ms |
| Extinguish | 120 ms to 0 (`in`) + 3 tiny ember particles falling from the tip |

### 7.3 Light values

| Property | Desktop | Mobile | Notes |
|---|---|---|---|
| Point light (always) | `PointLight(0xFFF1D6, 2.8, 14, 1.6)` at the wand-tip world position | Same, distance 12 | Warm white, clearly different from orange candles (`#FF9A40`) and every spell hue |
| Forward spot (optional) | `SpotLight(0xFFF1D6, 5, 24, 28°, 0.55, 1.4)` from the camera, target 10 m ahead along the view | Off | Lets you read enemies at range down dark corridors. Costs 1 light slot. |
| Hemisphere boost while lit | +0.15 intensity in areas flagged `dark` | +0.15 | Cheap global readability lift without a bigger radius |
| Fog response | Fog color +6% lightness, fog far +8 m | Same | Reads as light scattering in dust |
| Flicker | ± 4% at 7 Hz (smooth noise, not random jumps) | ± 4% | Alive but not distracting |
| Shadows | **None** | None | A point light shadow costs 6 extra render passes per frame. Not worth it in a real-time game. |

**Light slot rule:** Wandlight is **permanent light slot #1**.
- The `PointLight` (and the spot on desktop) exists all session; "off" just means intensity 0.
- This avoids shader recompiles: Three.js rebuilds materials when the number of lights changes, which causes a visible hitch.

### 7.4 What Wandlight reveals

| Effect | Implementation |
|---|---|
| **Enemy rim light** | Each enemy material gets a `wandRim` uniform. Rim term `pow(1 − dot(N, V), 3) × wandRim × 0.5` in `#FFF1D6`. `wandRim` = 1 at ≤ 6 m, falling to 0 at 14 m (computed per enemy on the CPU, once per frame). Silhouettes pop against dark walls. |
| **Wraith exposure** | Wraiths inside the light: opacity +0.25 and their fade-teleport becomes visible (a gameplay counter). |
| **Hidden runes, secret doors, Weeping Rune** | Materials with `opacity = smoothstep(5.0, 2.5, distanceToWandTip) × lit`. Invisible otherwise. Rewards exploring with the light on. |
| **Floor readability** | Dark areas are tuned so floor luminance is ≥ 4% without Wandlight (navigable) and ≈ 25% inside its radius |
| **Enemy eyes** | Always emissive ≥ 2.0, so enemies stay visible at 25 m **with or without** Wandlight. Darkness never hides threats unfairly. |

**Darkness tuning per area** (hemisphere intensity when Wandlight exists in the game):

| Area | Hemisphere | Flag |
|---|---|---|
| Great Hall | 1.9 | lit |
| Courtyard | 1.4 | lit |
| Corridor by day / night | 1.9 / 1.1 | lit / dark |
| Forest | 1.2 | dark |
| Dungeon | 1.0 | dark |

### 7.5 Response to drawing and casting

| Moment | Wandlight behavior | Duration / easing |
|---|---|---|
| Drawing starts | Dims to 55% (focus shifts to the glyph) | 120 ms `out` |
| While drawing | Color lerps 25% toward the **live-guessed spell's primary** (the light "charges" with that magic) | Follows the guess, 80 ms smoothing |
| Release → Perfect | Flash to 2.2× intensity in the spell primary | 70 ms, then back to normal over 250 ms `out` |
| Release → Great / Good | Flash 1.6× / 1.3× | 90 / 110 ms, then 250 ms back |
| Fizzle | 3 flickers (40 ms off / 40 ms on), then 40% for 250 ms | — |
| Channeled spells (Kamehameha, Dragon's Breath) | Tinted 50% toward the spell color for the duration | — |
| Taking damage | Single 60 ms dip to 50% | — |

If Wandlight is **off** when you cast, the wand tip still flashes the same way briefly. The light slot is borrowed for the flash, then returned to 0.

### 7.6 Wand viewmodel (where Wandlight and casting live)

| Part | Build | Position (camera space) |
|---|---|---|
| Hand | Sleeve `CylinderGeometry(0.06, 0.08, 0.35, 8)` in the robe color + hand `SphereGeometry(0.05)` skin | (0.26, −0.28, −0.45), rotated to point forward-up 15° |
| Wand | `CylinderGeometry(0.008, 0.014, 0.38, 6)` `#5A3A1E` with a carved grip (2 thin tori) | Tip ends at (0.22, −0.20, −0.55) |
| Tip orb | `SphereGeometry(0.018)` emissive in the last spell's primary (or `#FFF1D6` when Wandlight is on) + halo sprite 0.12 m | At the tip |
| Wandlight motes | 6 / 3 tiny additive particles orbiting the tip (r 0.04) | At the tip |

**Rendering the viewmodel:**
- Draw it in a **separate scene with its own camera** (FOV 60°): `renderer.autoClear = false`; render the world; `renderer.clearDepth()`; render the viewmodel scene.
- This stops the wand clipping into walls.
- Add a weak copy of the Wandlight point light to the viewmodel scene so the hand is lit consistently.

**Viewmodel animation:**
- **Idle sway:** ± 0.004 m at 1.2 Hz.
- **Walk bob:** synced to the head bob, 50% amplitude.
- **Drawing:** the hand raises 0.06 m and the tip follows the stroke direction slightly (max 3° tilt), so the stroke feels physically drawn.
- **Recoil per cast:** Perfect 7° pitch over 50 ms, recovering in 160 ms. Great 5° / 60 / 180. Good 3° / 70 / 200.

---

## 8. UI elements

### 8.1 Principles

1. **The world is the display.** In combat, UI covers ≤ 10% of the screen. No modals, and nothing in the center third except the crosshair, the stroke and transient feedback (< 400 ms).
2. **Feedback where the eyes are.** In first person, the eyes are on the crosshair. Draw, guide and confirm all happen around it.
3. **Color = meaning.** Tier colors only for cast quality, element colors only for spells, red only for danger.
4. **Typography (no web-font download):**
   - Display: `Georgia, 'Times New Roman', serif`.
   - Numbers and HUD: `system-ui, 'Segoe UI', Roboto, sans-serif` with `tabular-nums`.

| Text | Desktop / Mobile | Style |
|---|---|---|
| Cast chip: match % | 28 / 22 px | 800 sans, tier color |
| Cast chip: spell name | 18 / 15 px | 700 serif, spell primary |
| Damage numbers | 22–40 / 18–30 px by tier | 800 sans, 2 px black stroke; crits `#FFD84A` |
| HUD labels | 11 / 10 px | 600 sans |
| Panel titles / body | 22 / 18 px · 15 / 14 px | Serif |

### 8.2 First-person combat HUD

```
┌──────────────────────────────────────────────────────────────┐
│ HP ███████▒▒  MP █████▒▒     [ DRAGON / BOSS BAR ]          │
│ 🔥 💧 (status)                                               │
│ ◄ (off-screen threat)                                     ►  │
│                         ·  ← crosshair                       │
│                    stroke + ghost + chip                     │
│                                                              │
│ quest tracker (hidden in combat)    [Q1][Q2][Q3][Q4][Q5] ✋💡│
└──────────────────────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Crosshair | 4 px dot `#F2E9D8` at 80% + a 22 px ring that appears when you can cast (ring = recovery timer, §10) |
| HP / MP | Top-left, 200 × 10 px and 200 × 7 px bars, no portrait; HP flashes on damage |
| Status icons | 18 px under the bars; your own statuses also tint the screen edges (§3.3) |
| Boss / dragon bar | Top-center, 60% width, 12 px, name in `elite.gold` |
| Quick-glyph strip | Bottom-right, 5 × 40 px slots (36 px mobile): spell shape thumbnail in the primary color, a radial cooldown sweep, greyed to 35% without enough mana. Slot frame = category color. |
| Wandlight indicator | 💡 icon at the end of the strip, glowing `#FFF1D6` when on |
| Off-screen threat arrows | Screen edges, `enemy.rim` chevrons, pulse when winding up (§3.1) |
| Interaction prompt | 40 px below the crosshair: `E  Open`, `E  Talk to Sister Wren` (14 px, panel pill) |
| Nameplates | World-anchored above heads: 80 px bars (red enemy, cyan ally), shown within 15 m or if recently damaged |
| Quest tracker | Hidden in combat; returns 2 s after combat ends (top-left under the bars, 12 px) |

### 8.3 Drawing input in first person

| Platform | How drawing works |
|---|---|
| Desktop (pointer lock) | **Hold right mouse button** (or `Shift`) to enter draw mode. Mouse-look freezes; a virtual pen starts **at the crosshair** and moves with `movementX/Y` (sensitivity 1.0 px per px). Left mouse held = stroke. Releasing the left button = cast. Release the right button to look again. Staying in pointer lock avoids the browser's re-lock prompt. |
| Desktop (alternative) | "Quick-draw" option: start drawing with the left mouse button; look is suspended until release |
| Touch | Left thumb: move stick. Right side: drag = look. **Draw**: press-and-hold the right side for 150 ms (haptic tick if supported) or press the ✋ draw button, then draw anywhere; the stroke maps to a 300 px area around the crosshair. |
| Movement while drawing | Allowed at 60% speed (strafe while casting feels visceral); no sprint |

### 8.4 Drawing feedback states

| State | Visual |
|---|---|
| Ready | Crosshair ring full; nothing else |
| Draw mode entered | Screen darkens 8% except a soft 320 px circle around the crosshair (focus vignette, 100 ms); Wandlight dims (§7.5) |
| Drawing | Trail: 6 px white core + 14 px glow `#9FE8FF` (shadow blur 16), tail fading over the last 30%. **Live ghost:** when the best partial match is ≥ 60%, the full template appears dashed in the spell primary at 45%, aligned to your stroke, plus a 14 px label "Fire Bolt?" near the pen. The trail tints 30% toward that spell's primary. |
| Release → recognized | ≤ 50 ms: **cast chip** 32 px below the crosshair, a 150 × 50 px pill with a tier-colored border: `97%  Fire Bolt  PERFECT`. The stroke flashes in the tier color and shrinks into the crosshair (it "loads" the wand). |
| Perfect | Gold chip; 12 gold sparkles burst from the crosshair; chip pops 0.6 → 1.12 → 1.0; distinct "ting" |
| Great / Good | Green / light-blue chip; Good shows the power % in muted text |
| Fizzle | Stroke turns `#FF6B6B` and shatters into 20 falling segments (180 ms); chip "62% · Closest: Shield", shaking x ± 4 px × 3 |
| No mana | Chip "Need 80 MP"; MP bar flashes red twice |
| Recovery | The crosshair ring refills (§10 durations). Strokes drawn during recovery are buffered. |
| Sealed door targeted | The crosshair ring tints in the required spell's color, and the guide shows that spell's ghost faintly *before* you start drawing |

### 8.5 Spell-learning tutorial

- **Layout:** centered panel 560 × 640 px (full-screen on mobile). The game pauses, which is allowed out of combat.
  - Header: spell name (22 px serif) + category tag.
  - Info row: shape · cost · effect.
  - Drawing area: 420 × 420 px canvas, radial gradient `#241A3A` → `#0E0A18`.
- **Demo:**
  - The template draws itself over 1.6 s (`inout`) as an 8 px glowing stroke in the spell primary.
  - A white comet head (r 9 px, glow 25 px) leads it.
  - The faint template stays underneath at 18%.
  - Pause 600 ms, then loop. The start dot pulses r 5 → 8 px at 1.5 Hz.
- **Practice:** starts when the canvas is touched. The demo stops, the faint template stays, and the live ghost works as in combat.
- **Results:**
  - Success: green text + a 2D mini burst in the spell's colors + "Added to Spellbook" (scale 0.8 → 1, 200 ms).
  - Wrong spell: "That looked like Heal (81%)", then the demo replays once.
  - Close miss: "74% · need 78%" plus the most common tip for that shape.
- **Mastery (optional):** 3 pips; 3 Perfects = "Mastered" badge.

### 8.6 Spellbook

- **Layout:** two-page book, 960 × 640 px (stacked on mobile).
  - Left: 6 category tabs (§5 colors) and a 3 × 3 grid of 96 px glyph cards.
  - Right: detail page with a looping glyph demo, stats as icon rows (💧 cost · ⚔ power · ⏱ cast time per tier · element), your best match %, and a **Practice** button.
- **Card states:**
  - Learned: full color, start dot + arrow.
  - Pending lesson: gold pulsing border, "Learn now".
  - Locked: grey `#555555` outline, no start dot, unlock hint ("Level 5", "Quest: …", "Secret").

### 8.7 Quest log

- **Layout:** right-side drawer, 380 px, slides in over 180 ms (`out`). The game keeps running behind it except during story pauses.
- **Sections:** Active (expanded) · Available (giver + location) · Completed (collapsed).
- **Entries:** 16 px serif title, muted giver, checkbox objectives with `3/5`, and a green "Return to …" banner when ready.
- **World waypoints:** the active quest target gets a small diamond marker (12 px, `#FFD84A`) at the screen position or edge, with distance in meters. Toggle in settings.

### 8.8 Accessibility and quality

- Camera shake 0 / 50 / 100%.
- Head bob 0 / 50 / 100%.
- Reduce flashes (caps flash intensity at 40%).
- Colorblind assist (pattern marks on tier colors: Perfect ★, Great ✓✓, Good ✓; shape icons on status tints).
- FOV slider 65–90°.
- Quality: Auto / Desktop / Mobile (§9.7).

---

## 9. Three.js technical recommendations

### 9.1 Renderer and camera

```js
const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = false;            // blob shadows instead
renderer.autoClear = false;                    // world, then viewmodel (§7.6)
const camera = new THREE.PerspectiveCamera(75, w / h, 0.05, 90);
```

### 9.2 Materials

| Use | Material | Parameters |
|---|---|---|
| Stone, wood, cloth, props | `MeshLambertMaterial` | Cheapest lit; flat shading via `toNonIndexed()` + `computeVertexNormals()` |
| Characters | `MeshStandardMaterial` | `roughness 0.75, metalness 0.05`; skin roughness 0.6 |
| Armor / iron / gold | `MeshStandardMaterial` | Armor 0.35 / 0.7 · iron 0.4 / 0.8 · gold 0.3 / 0.6 (roughness / metalness) |
| Glow parts | `MeshBasicMaterial` or `emissive` 1.5–3 | Basic for small parts (cheaper) |
| Ghosts, wraiths, veils | `MeshStandardMaterial` / `MeshBasicMaterial` | `transparent, opacity 0.55, depthWrite: false` |
| Spells, particles, beams, halos | `MeshBasicMaterial` / `ShaderMaterial` | `AdditiveBlending, transparent, depthWrite: false, toneMapped: false` (keeps cores white-hot) |
| Fresnel bubbles, danger curtains | `ShaderMaterial` | Additive, `depthWrite: false` |
| Decals | `MeshBasicMaterial` | `transparent, depthWrite: false, polygonOffset: true, polygonOffsetFactor: −1` |
| Wandlight-revealed objects | Any + `onBeforeCompile` | Opacity from a `wandTipPos` uniform (§7.4) |

**Share materials:** one material per palette token. Never create materials in spawn code. Add the enemy rim and Wandlight rim via `onBeforeCompile` on the shared enemy material.

### 9.3 Procedural textures (no image assets)

Generate once at load with a 2D canvas → `CanvasTexture` at 128–256 px, `RepeatWrapping`, `LinearMipmapLinearFilter`. Recommendation: **stylized flat color + procedural detail**, not realism. It is cheaper, matches the low-poly silhouettes, and keeps spells the highest-contrast element.

| Texture | Recipe |
|---|---|
| Stone floor / wall blocks | Base fill; 4 × 4 rounded rects ± 6% lightness; 300 specks; 1 px grout |
| Door planks | Vertical 28 px bands ± 4% lightness, sine grain lines (alpha 0.15), dark seams; iron studs as dark dots |
| Grass / forest floor | Base + 2000 short strokes ± 8% hue |
| Stained glass | Voronoi-ish cells (random polygons) in muted hues, 3 px dark lead lines |
| Soft dot | 64 px radial gradient (shared by all particles and halos) |
| Hex pattern | 128 px hex outlines for shields |
| Rune ring / spell glyph sprites | Draw the spell's own `ShapeKit` points onto a canvas: reused for door seals, sigils and quick-glyph icons |
| Noise | 128 px value noise `DataTexture` (dissolve, wobble, flicker) |

### 9.4 Lighting setup

- **Base lights:** per area, 1 `HemisphereLight` + 1 `DirectionalLight` (no shadows), with values in §1.
- **Fixed point-light count for the whole session:**

  | Tier | Wandlight | Wandlight spot | Environment | Spell flashes | Total |
  |---|---|---|---|---|---|
  | Desktop | 1 | 1 (optional) | 3 | 2 | 6–7 |
  | Mobile | 1 | — | 2 | 0 | 3 |

  Toggle intensity, never add or remove lights (shader recompile hitch).
  **Measured:** a point light costs every lit pixel even at intensity 0. In the Phase 1 build, switching 5 point lights off cut frame time by more than half on a software renderer. Keep the count low; use halo sprites for extra glow.
- **Character rim:** `onBeforeCompile` adds `rim = pow(1 − dot(N, V), 3)`. Rim colors: enemies `#FF3B2F` × 0.4, allies `#4AF2FF` × 0.5, plus the Wandlight rim (§7.4).

### 9.5 Post-processing

| Option | Desktop | Mobile | Recommendation |
|---|---|---|---|
| Halo sprites (fake bloom) | Yes | Yes | **Default.** Near-zero cost. |
| Screen-space overlay (vignettes, edge glows, flashes) | Yes | Yes | One CSS layer; free. Carries all first-person self-effects (§6.3). |
| `UnrealBloomPass` (half resolution, threshold 0.85, strength 0.8, radius 0.4) | Optional | No | Costs 2–4 ms on integrated GPUs and needs `examples/jsm` add-ons not in the bundled `three.min.js`. Only add it if 60 FPS holds without it. |
| FXAA | If MSAA off | No | Cheap |
| SSAO, DOF, motion blur | No | No | Too expensive; motion blur also hurts glyph readability |

### 9.6 Performance budget

Targets: 60 FPS desktop, ≥ 45 stable on mid phones.

| Budget | Desktop | Mobile |
|---|---|---|
| Draw calls (world + viewmodel) | ≤ 150 | ≤ 80 |
| Triangles | ≤ 200 k | ≤ 80 k |
| Active particles | ≤ 3000 | ≤ 1000 |
| Point lights (fixed) | 6–7 | 3 |
| JS per frame | ≤ 6 ms | ≤ 8 ms |

**Rules that matter most during spell-spam:**

1. **Near-camera overdraw is the killer in first person.** Fade particles within 0.6 m, start cones 0.8 m out, use screen overlays for self-effects. Shrink particle size before cutting count.
2. **Pool everything:** particles, projectiles, rings, decals, damage-number DOM nodes. Zero `new` in the combat loop.
3. **Reuse math objects:** module-level scratch vectors; no `.clone()` per frame.
4. **Instance** repeated geometry: props, bars, trees, spine segments, chain links.
5. **Cap concurrent heavy effects:** 2 beams, 3 breath streams, 1 Elder Dragon; extras reuse the oldest slot.
6. **Distance culling:** skip particle simulation for effects > 40 m away or behind the camera (dot product test).
7. **Dispose** geometry, materials and textures on area change.

### 9.7 Adaptive quality (Auto)

- **Measure:** a rolling 2 s average frame time.
- **If > 20 ms:** step down one level.
  1. Pixel ratio ×0.85.
  2. Particles ×0.6.
  3. Disable bloom / FXAA.
  4. Disable the Wandlight spot.
  5. Halve fireflies, trails and undergrowth.
- **If < 12 ms for 5 s:** step back up.
- **Reasoning:** stable frame rate beats fidelity.

### 9.8 Recognition off the main thread

- **Where:** run the recognizer in a **Web Worker**. Post the stroke on release and get back `{id, score}`.
- **Hiding the delay:** the release animation (stroke shrinking into the crosshair, §10) covers the 20–60 ms the worker needs.
- **Live guesses:** they stay on the main thread (≈ 1.8 ms, throttled to 60 ms).

---

## 10. Animation and feedback timing

### 10.1 Easing tokens

| Token | Curve | Use |
|---|---|---|
| `snap` | `cubic-bezier(.2, 1.6, .4, 1)` | Chip pop, sparkles (overshoot) |
| `out` | `cubic-bezier(.2, .8, .2, 1)` | Panels, doors, knockback start, ignite |
| `in` | `cubic-bezier(.6, 0, .9, .4)` | Spirit Bomb fall, fades, extinguish |
| `inout` | `cubic-bezier(.45, 0, .55, 1)` | Recovery, FOV changes |
| `linear` | — | Projectile travel |

### 10.2 The drawing-to-cast loop

| Step | Perfect | Great | Good | Fizzle | Notes |
|---|---|---|---|---|---|
| Enter draw mode → focus vignette | 100 ms | same | same | same | Wandlight dims 120 ms |
| Pointer sample → trail | same frame (≤ 16 ms) | same | same | same | `getCoalescedEvents()`; 2D overlay canvas |
| Live ghost update | every 60 ms | same | same | same | When the partial match is ≥ 60% |
| **Release → recognition** | ≤ 25 ms desktop / ≤ 70 ms mobile | same | same | same | Worker (§9.8) |
| Stroke shrinks into the crosshair | 90 ms `in` | 110 | 130 | — | Starts instantly on release (hides recognition) |
| **Cast chip appears** | ≤ 50 ms, pop 140 ms `snap` | same | same | shake 3 × 40 ms | **Sub-200 ms feedback: met** |
| Chip visible | 450 + fade 150 | 400 | 400 | 600 | Never blocks casting |
| Wandlight / tip flash | 2.2× for 70 ms | 1.6× / 90 | 1.3× / 110 | flicker | §7.5 |
| **Cast wind-up** (tip flare → spawn) | **60 ms** | **110 ms** | **170 ms** | — | Main "faster when better" lever |
| Wand recoil | 7° / 50 ms, recover 160 | 5° / 60 / 180 | 3° / 70 / 200 | small droop 4° | §7.6 |
| Projectile speed | 40 m/s | 32 m/s | 25 m/s | — | 8 m target: 200 / 250 / 320 ms |
| **Release → impact (8 m)** | **≈ 310 ms** | **≈ 410 ms** | **≈ 540 ms** | — | Perfect lands ~40% sooner |
| Hit-stop (world time scale 0.05) | 70 ms | 40 ms | 0 | — | Spirit Bomb 120, Elder 140 |
| Camera kick (first person: rotation, not position) | 0.8° pitch up + random 0.4° yaw, 140 ms decaying | 0.4°, 100 ms | none | none | Scaled by the accessibility setting |
| Target flash | 1 frame + 80 ms decay | same | 60 ms | — | |
| Damage number | ×1.4, gold on crit, rises 60 px over 900 ms | ×1.15 | ×1.0 | — | `snap` pop 120 ms |
| Enemy knockback | 0.4 m / 90 ms `out`, recover 220 ms | 0.3 m | 0.2 m | — | Bosses/dragons flinch only (4° tilt) |
| Fizzle lockout | — | — | — | 250 ms | Shatter 180 ms |
| **Recovery before the next cast** | 80 ms | 120 ms | 160 ms | 250 ms | Crosshair ring refill; strokes buffered |

**Effective spell rate:** a skilled player draws a simple glyph in about 350 ms. With recovery, that's ≈ 2 casts/s on Perfects and ≈ 1.6/s on Goods. Mana is the real limiter.

### 10.3 Sequence (Perfect Fire Bolt)

```
t(ms) 0        25    50        90  150         300  310  380        600
      │release │rec  │chip pop  │tip flare 60  │fly 200ms│hit│hit-stop 70│ recover 80
      stroke shrinks into crosshair ─►│ recoil 7° ─► recover 160          number ─► 900
```

### 10.4 Spell-specific overrides

| Spell | Override |
|---|---|
| Lightning Strike | No travel: spark crown 120 / 160 / 200 ms by tier, then instant strike |
| Kamehameha Wave | Charge 400 / 500 / 600 ms; beam extends in 120 ms, holds 600 ms; damage ticks every 100 ms |
| Spirit Bomb | Grow 500 / 600 / 700 ms; fall 400 ms `in` |
| Dragon's Breath | Stream 1.2 s; ticks every 150 ms inside the cone |
| Shield / Heal / Dragon Ward | Wind-up 60 / 90 / 120 ms; screen effect appears instantly after |
| Summons | Circle 250 ms; emerge 300 ms; you can cast again during the emerge animation |
| Summon Elder Dragon | Darken 300 ms → sigil 400 ms → pass 1.2 s; global cooldown 30 s |
| Wandlight toggle | Ignite 180 ms / extinguish 120 ms; no recovery lockout |

### 10.5 Spell-spam handling

- **Input buffer:** drawing the next glyph during flight or recovery is allowed. One completed stroke is buffered and fires the moment recovery ends.
- **No silent failures:** a stroke that can't fire always shows a chip with the reason.
- **Concurrency:** up to 8 projectiles per player in flight; pools absorb them.
- **Combo flourish (optional):** 3 Perfects within 2 s gives a gold crosshair ring and +10% damage for 3 s.

### 10.6 World and enemy timing

| Event | Timing |
|---|---|
| Door open / close | 450 ms `out` / 380 ms `inout`; portcullis rise 900 ms |
| Sealed door break (correct glyph drawn) | Seal glyph flashes 120 ms → shatters into 30 particles → door opens 450 ms |
| Standard / elite telegraph | 250–400 / 300–600 ms |
| Dragon telegraph | 600–1200 ms (≥ 600 ms hard minimum so a glyph can be finished) |
| Enemy death | Dissolve 400 ms; XP orbs fly to the player in 350 ms `in` |
| Dragon stagger (Dragon Bind / big hits) | Grounded 2.5 s; wings droop 300 ms; recovery roar 400 ms |
| Dialogue FOV ease | 300 ms in / 250 ms out (`inout`) |

---

## Appendix A — Current code vs this guide

The current build is **first-person and real-time**, as this guide describes. Online duel was removed; the duel is a single-player Practice Duel against 1–5 CPU wizards.

| Area | Status |
|---|---|
| Spawn Ghost Pigtail shape | ✅ Live (`js/data.js`, `shapeRev: 2` re-teaches old saves) |
| Spell colors (§5 primaries for the 13 core spells) | ✅ Live |
| Dungeon pool and Warden glow off the Life hue | ✅ Live |
| Dragon spells + Wandlight | ✅ Live: 18 spells in `SPELLS`, Wandlight (check-mark or `L`) |
| First-person camera, pointer-lock drawing, wand viewmodel | ✅ Live (`js/player.js`); `?nolock` fallback for PCs without mouse capture |
| Wandlight light, enemy rim and hidden-rune reveal | ✅ Live (fixed light slot, `wandRim` shader uniform, reveal within 5 m) |
| Doors (oak / cell / portcullis; closed, locked, sealed-by-spell, boss) | ✅ Live (`gates` in `AREAS`, opened doors saved) |
| Pooled FX and instanced props | ✅ `js/fx.js` (all particles in one draw call, pooled meshes and lights), instanced scenery, areas disposed on exit |
| Recognition in a Web Worker | ✅ Blob worker, identical results, works from `file://` and `http://`, main-thread fallback |
| Real-time combat loop | ✅ `js/combat.js`: wind-up/recovery per tier, stroke buffering, telegraphed enemy attacks, dragon zones, boss bar, hit-stop, practice-duel bots |
| Adaptive resolution | ✅ The pixel ratio drops automatically on slow GPUs (down to 0.6) and recovers when frames are fast |
