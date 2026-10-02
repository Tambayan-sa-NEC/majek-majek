# Glyphbound — Visual Asset Guide (Real-Time Edition)

Reference for building every asset in the real-time version of Glyphbound with Three.js primitives, procedural textures and particles. Every value is meant to be copied straight into code.

> Conventions: colors are sRGB hex (`0xRRGGBB` in Three.js). Sizes are in metres (1 unit = 1 m; a wizard is ~2.3 m tall with hat). Times are milliseconds. "Desktop / Mobile" columns give the two quality tiers (see §8.7).

---

## Quick index

| § | Section | Jump to |
|---|---|---|
| 0 | Art direction (read first) | [Art direction](#0-art-direction) |
| 1 | Master palette & reserved colors | [Palette](#1-master-palette) |
| 2 | Environments: Great Hall · Corridor · Courtyard · Dungeon · Forest | [Environments](#2-castle-environments) |
| 3 | NPC models | [NPCs](#3-npc-character-models) |
| 4 | Enemies, status cues, dragons | [Enemies](#4-enemies-status-cues-and-dragons) |
| 5 | Spell drawing shapes (17) | [Shapes](#5-spell-drawing-shapes) |
| 6 | Spell color schemes | [Spell colors](#6-spell-color-schemes) |
| 7 | Spell effects (17) | [Effects](#7-spell-effect-visualizations) |
| 8 | UI | [UI](#8-ui-elements) |
| 9 | Three.js technical setup & performance | [Tech](#9-threejs-technical-recommendations) |
| 10 | Animation & feedback timing | [Timing](#10-animation-and-feedback-timing) |
| A | Applying this to the current codebase | [Appendix](#appendix-a--applying-this-guide-to-the-current-code) |

---

## 0. Art direction

**Name: "Candlelit Arcane".** A dark, cool, low-poly castle lit by warm candles, where **spells are the only fully saturated, glowing things on screen**. Everything else exists to make spell-casting readable.

### The six rules every asset follows

1. **Three value bands.**
   - World: dark, HSL lightness 8–40%, saturation ≤ 35%.
   - Characters: mid-tones, lightness 30–65%, saturation 30–60%.
   - Magic: bright and saturated, lightness 55–100%, saturation ≥ 80%, emissive/additive.
   - If a world prop is brighter or more saturated than a spell, it is wrong.
2. **Hue ownership.** Each spell family owns a hue band (§6). The world never uses a *saturated* version of a reserved hue. Muted versions are fine, e.g. desaturated forest green.
3. **Silhouette first.** Every character and enemy must be identifiable as a solid black shape at 64 px tall. Use exaggerated proportions: big hats, big heads, oversized props.
4. **Flat-shaded low-poly.**
   - Use `flatShading: true` on organic shapes.
   - Keep segment counts low: spheres 10–16, cylinders 6–12.
   - Use no image textures. Surface detail comes from vertex colors or small procedural canvas textures (§9.3).
5. **Max 3 base colors + 1 glow color per model.** The glow color is the model's identity: eyes, staff orb, rune or core.
6. **Friend vs foe light language.**
   - Player spells and allies have a **white-hot core** fading to their hue.
   - Enemy attacks have a **dark core (`#1A0A12`)** with a **red-orange rim (`#FF3B2F`)** plus their element hue.
   - A glance tells you whose projectile it is.

### Mood keywords

Warm candlelight vs cold stone · chunky toy-like silhouettes · magic that feels *hot* and *loud* · readable at a glance during spam.

---

## 1. Master palette

### 1.1 World neutrals (shared by all environments)

| Token | Hex | Use |
|---|---|---|
| `stone.dark` | `#2E2A33` | Dungeon walls, deep shadows |
| `stone.mid` | `#5A5550` | Corridor walls, pillars |
| `stone.light` | `#8A8070` | Door frames, trims, fountain |
| `wood.dark` | `#4A3220` | Beams, tree trunks |
| `wood.mid` | `#6A4628` | Tables, desks |
| `cloth.red` | `#7A1C24` | Carpets, banners |
| `night.sky` | `#0C1020` | Background / fog in the Great Hall ceiling |
| `candle.flame` | `#FFB040` | Candle and torch flames (small, intensity ≤ 3) |
| `candle.light` | `#FF9A40` | PointLight color for torches |

### 1.2 Reserved magic hues (never used saturated in the world)

The table below is ordered by hue. Full per-spell colors are in §6.

| Hue band | Family | Anchor hex |
|---|---|---|
| 345–360° | Draconic | `#E8243C` |
| 10–20° | Dragonfire | `#FF4A1C` |
| 22–32° | Fire | `#FF7A2A` |
| 40–48° (desaturated) | Wind/dust | `#F2D49B` |
| 52–58° | Lightning | `#FFF04D` |
| 88–100° | Poison | `#8EE03A` |
| 140–150° | Life | `#3DFF8E` |
| 165–175° | Ward | `#2EE6C3` |
| 200–210° | Water | `#2F9BFF` |
| 210° (near-white) | Spirit | `#DCE9FF` |
| 225–232° | Energy | `#3D5CFF` |
| 232–238° (pastel) | Sleep | `#A9B4FF` |
| 270–280° | Fear | `#A34DFF` |
| 310–320° | Soul | `#FF5CDB` |

### 1.3 Gameplay signal colors

| Token | Hex | Meaning |
|---|---|---|
| `enemy.rim` | `#FF3B2F` | Enemy projectile rim, enemy eye glow (default), hostile telegraph decals |
| `enemy.core` | `#1A0A12` | Dark core of enemy projectiles |
| `ally.rim` | `#4AF2FF` | Summoned ally outline, friendly dragon rim |
| `elite.gold` | `#FFC23D` | Elite enemy ring, boss nameplate |
| `telegraph.fill` | `#FF3B2F` at 25% opacity | Area-attack warning decal fill |
| `telegraph.edge` | `#FF8A6B` | Area-attack warning decal edge |

### 1.4 UI palette

| Token | Hex | Use |
|---|---|---|
| `ui.panel` | `#15101F` at 82% opacity | All panels |
| `ui.border` | `#C9A54E` | Panel borders, focus rings |
| `ui.text` | `#F2E9D8` | Body text |
| `ui.muted` | `#B8AB95` | Secondary text |
| `ui.hp` | `#E8414A` → `#A01818` | HP bar gradient |
| `ui.mp` | `#4A9BFF` → `#1C4AA0` | Mana bar gradient |
| `ui.xp` | `#FFE07A` → `#A07A10` | XP bar gradient |
| `tier.perfect` | `#FFD84A` | Perfect cast |
| `tier.great` | `#7DFF9A` | Great cast |
| `tier.good` | `#9FD8FF` | Good cast |
| `tier.fizzle` | `#FF6B6B` | Failed recognition |

### 1.5 Duel team colors (6 players)

`#4A7DFF` Ember · `#FF4A4A` Frost · `#4AFF8A` Moss · `#FFC94A` Gilt · `#C24AFF` Violet · `#4AE0FF` Tide. Use these only on robes, nameplates and the ground ring, never on spells.

---

## 2. Castle environments

**Shared construction rules**

- **Area size and walls:**
  - Each area is one `Group`. Only one area is loaded at a time.
  - Dispose geometries and materials of the old area on travel.
  - Walls: `BoxGeometry` segments 1 m thick, split around 3.6 m door gaps.
  - Floor: one `PlaneGeometry` with a procedural texture (§9.3).
- **Repeated props use `InstancedMesh`:** candles, pillars, trees, bars, benches, mushrooms. A whole area should be **≤ 60 draw calls**.
- **Light budget per area:**
  - 1 `HemisphereLight`, 1 `DirectionalLight` and **≤ 4 `PointLight`s** with `decay: 2`.
  - Fake the remaining torches with an emissive flame cone plus an additive halo sprite (§9.5).
  - Spells add up to 4 temporary point lights from a pool (§9.6).
- **Shadows:** no real-time shadows. Every character gets a **blob shadow**: a `CircleGeometry(0.6 × scale)` with a radial-gradient canvas texture, `#000000` at 45% → 0%, `depthWrite: false`.
- **Fog:** always on, colored like the background, so the far geometry fades out and you can shrink the camera's `far` to 80.

### 2.1 Great Hall — "Warm Assembly"

| Aspect | Spec |
|---|---|
| Mood | Safe hub, ceremonial, warm. Rest point and quest givers. |
| Size | 36 × 24 m, walls 7 m high, no roof (enchanted night sky) |
| Background / fog | `#1A1426`, fog 20 → 60 m |
| Hemisphere light | sky `#8070A0`, ground `#302828`, intensity 1.9 |
| Directional light | `#FFD8A0`, 0.5, from (10, 20, 8) |
| Point lights (4) | Hearth `#FF8030` int 3 dist 14 · Center chandelier glow `#FFC070` int 2 dist 30 · 2 × wall sconce `#FF9A40` int 1.5 dist 12 |
| Palette | Floor `#5A4A3A` · walls `#6B6258` · tables `#6A4628` · benches `#5A3A20` · banners `#8A1C1C`, `#1C4A8A`, `#1C7A3A`, `#A08A1C` (all ≤ 60% sat) · gold plates `#D4AF37` (metalness 0.6) |

**Key props**

| Prop | Recipe |
|---|---|
| Long tables (4) | `BoxGeometry(2.2, 1, 12)` at x = −10, −4, 4, 10; benches `BoxGeometry(0.6, 0.5, 12)` at ±1.7 m. **Instance** the benches. |
| Head table | `BoxGeometry(14, 1.1, 1.6)` at z = −6 |
| Floating candles (40) | **InstancedMesh** of `CylinderGeometry(0.06, 0.06, 0.35, 6)` `#F8F0D8`; flames as a second InstancedMesh of `SphereGeometry(0.06, 6, 6)` emissive `#FFB040` int 3. Bob y ± 0.15 m at 1 rad/s with per-instance phase (update matrices every 2nd frame on mobile). |
| Enchanted ceiling | `Points`, 400 stars, `size 0.35`, `fog: false`, y 14–34 m |
| Hearth | Box `1.2 × 3.2 × 4` `#6A5A4A`; flame `ConeGeometry(0.7, 1.4, 8)` emissive `#FF7020`; scale-jitter y 1 ± 0.2 at 13 Hz |
| Banners | `PlaneGeometry(2, 4)`, `side: DoubleSide`, slight vertex-wave in the vertex shader (optional, desktop) |
| Pillars | 4 × `CylinderGeometry(0.5, 0.6, 7, 10)` `#7A7064` at the corners |

### 2.2 North Corridor — "Long Shadows"

| Aspect | Spec |
|---|---|
| Mood | Transitional, mildly unsafe. Rhythmic pools of light and dark. |
| Size | 60 × 10 m, walls 7 m |
| Background / fog | `#120E1A`, fog 10 → 45 m |
| Hemisphere light | sky `#605878`, ground `#302828`, 1.9 |
| Directional light | `#FFD8A0`, 0.4 |
| Point lights (≤ 4) | Torches `#FF9A40` int 1.6 dist 12, every other torch; the others are emissive-only plus a halo |
| Palette | Floor `#4A4440` · walls `#5A5550` · carpet runner `#7A1C24` · frames `#B08A3A` (metalness 0.5) · paintings: random HSL(h, 0.4, 0.35) |

**Key props**

| Prop | Recipe |
|---|---|
| Pillar colonnade | **InstancedMesh** `CylinderGeometry(0.5, 0.6, 7, 10)`, every 6 m on both walls (20 instances) |
| Carpet runner | `BoxGeometry(56, 0.02, 3)` |
| Torches | Stick `CylinderGeometry(0.06, 0.08, 0.6, 6)` + flame `ConeGeometry(0.14, 0.35, 8)` emissive `#FF9030` + halo sprite 0.8 m |
| Paintings | Frame `BoxGeometry(2.4, 1.8, 0.1)` + canvas plane `2 × 1.4` |
| Camera rule | Corridor is narrow. Clamp the camera inside the walls and lift it to look *along* the corridor (already in the current code). |

### 2.3 Courtyard — "Open Air"

| Aspect | Spec |
|---|---|
| Mood | Breathing room, dusk sky, the only "daylight" area. |
| Size | 44 × 44 m, crenellated walls 3 m |
| Background / fog | `#7A8CB0`, fog 30 → 90 m |
| Hemisphere light | sky `#8090B0`, ground `#2A3020`, 1.4 |
| Directional light | `#FFF0D0`, 1.2 (low "sunset" angle: from (−20, 12, 10)) |
| Point lights | 0–1 (fountain glow is emissive) |
| Palette | Grass `#4C7A3A` (sat 35%) · paths `#9A9080` · walls `#7A7468` · fountain stone `#A8A090` · water `#3A80B8` emissive `#103050` (deliberately *duller* than Water Bullet `#2F9BFF`) |

**Key props**

| Prop | Recipe |
|---|---|
| Fountain | Basin `CylinderGeometry(3, 3.2, 0.8, 20)` + water disc `CylinderGeometry(2.7, 2.7, 0.1, 20)` roughness 0.2 + spout `CylinderGeometry(0.3, 0.4, 2.2, 10)`. Water y-bob ± 0.03 m. |
| Well | Open `CylinderGeometry(1, 1, 1, 12, 1, true)` DoubleSide + roof: 2 posts + `ConeGeometry(1.4, 0.8, 4)` |
| Trees (8) | InstancedMesh trunk `CylinderGeometry(0.2, 0.3, 2, 7)` `#4A3220` + 2 stacked `ConeGeometry` leaves `#1F4A24`/`#2A5A2A` (flatShading) |
| Crenellations | InstancedMesh `BoxGeometry(0.9, 0.8, 1.1)` every 2 m on the wall top |

### 2.4 Dungeon — "Cold Iron"

| Aspect | Spec |
|---|---|
| Mood | Oppressive, claustrophobic, boss territory. Darkest area, but keep characters readable (hemisphere ≥ 1.6). |
| Size | 44 × 36 m, walls 7 m |
| Background / fog | `#08060C`, fog 12 → 48 m |
| Hemisphere light | sky `#6A6088`, ground `#302828`, 1.9 |
| Directional light | `#A0A8FF`, 0.3 (cold moonlight through grates) |
| Point lights (4) | 3 torches `#FF9A40` int 1.6 dist 12 · Warden-cell glow `#7A5CFF` int 1.2 dist 10 |
| Palette | Floor `#3A3434` · walls `#4A4242` · bars `#2A2A2A` (metalness 0.8, roughness 0.4) · chains `#3A3A3A` · ooze pool `#3A6A5A` emissive at 0.3 |

> ⚠ The old ooze pool used `#4AFF8A`, which is inside the reserved **Life** hue. Use `#3A6A5A` (desaturated teal) so it is never mistaken for a Heal effect.

**Key props**

| Prop | Recipe |
|---|---|
| Cell bars | InstancedMesh `CylinderGeometry(0.04, 0.04, 4, 5)` every 0.6 m (≈ 70 instances = 1 draw call) |
| Chains | InstancedMesh `TorusGeometry(0.08, 0.02, 4, 8)` links, alternating 90° rotation |
| Grates | Ceiling planes with an alpha-tested procedural grid texture (§9.3) casting fake light shafts: additive `PlaneGeometry(1.5, 7)` `#A0A8FF` at 8% opacity |
| Weeping Rune (secret) | `TorusGeometry(0.5, 0.06, 6, 5)` (a pentagon ring) emissive `#7FB0FF` 1.2, pulse 0.8 ↔ 1.4 at 0.5 Hz |

### 2.5 Whisperwood Forest — "Bioluminescent Night"

| Aspect | Spec |
|---|---|
| Mood | Mysterious, exploratory, dragon country. Deep blue-black with cyan/violet mushroom glows. |
| Size | 64 × 64 m, ring of dense trees as the boundary |
| Background / fog | `#0C1418`, fog 12 → 55 m (heavy, hides the boundary) |
| Hemisphere light | sky `#405870`, ground `#101810`, 1.4 |
| Directional light | Moon `#8FB0FF`, 0.6 |
| Point lights (≤ 3) | 1 moon fill `#8FB0FF` int 1.5 dist 80 at y 25 · quest pickups `#9FD8FF` int 1.5 dist 6 |
| Palette | Ground `#22361E` · trunks `#4A3220` · leaves `#1F4A24` / `#2A5A2A` · mushrooms `#60D0B0` / `#9070C0` emissive 0.6 (muted, *not* the Ward or Fear hues) · fireflies `#D8FF70` |

**Key props**

| Prop | Recipe |
|---|---|
| Trees (≈ 250) | 2 InstancedMeshes (trunk, leaves). Seeded random scatter; keep 4 m clear around paths and quest points. |
| Mushrooms (30) | InstancedMesh half-sphere cap `SphereGeometry(0.18, 8, 6, 0, 2π, 0, π/2)` + stem |
| Fireflies (80 / 40 mobile) | One `Points`, additive, size 0.15, positions updated in the vertex shader from a time uniform (zero CPU cost) |
| Spider webs | `CircleGeometry(1.2, 8)` wireframe, white 30% opacity |
| Starfall Altar | `CylinderGeometry(1, 1.2, 0.8, 8)` `#8A8A9A` + floating `OctahedronGeometry(0.35)` emissive `#BFE0FF` 2, spin 1 rad/s |
| Dragon nest (new) | Ring of 12 jagged rocks (`DodecahedronGeometry(0.8–1.6)`, flatShading `#3A3430`), scorched ground decal `#1A1210`, scattered bone cylinders `#D8D0C0` |

---

## 3. NPC character models

### 3.1 Shared wizard rig (all humanoids)

All wizards share one base built from primitives. Change only colors, props and 1–2 proportion tweaks per NPC. The model faces +Z; origin is at the feet.

| Part | Geometry | Position (y) |
|---|---|---|
| Robe | `ConeGeometry(0.55, 1.5, 14)` | 0.75 |
| Hem trim | `TorusGeometry(0.5, 0.05, 6, 18)` rotated x 90° | 0.10 |
| Shoulders | `SphereGeometry(0.30, 14, 10)` | 1.42 |
| Head | `SphereGeometry(0.24, 16, 12)` | 1.72 |
| Eyes | 2 × `SphereGeometry(0.035, 6, 6)` `#111111` at x ± 0.08, z 0.21 | 1.75 |
| Hat brim | `CylinderGeometry(0.46, 0.46, 0.04, 18)` | 1.90 |
| Hat cone | `ConeGeometry(0.30, 0.75, 14)`, tilt z 0.12 | 2.27 |
| Staff | `CylinderGeometry(0.035, 0.045, 1.8, 6)` `#5A3A1E` at x 0.5 | 0.9 |
| Staff orb | `SphereGeometry(0.10, 12, 10)` emissive (= identity glow) | 1.85 |

- **Idle animation:** bob y ± 0.02 m at 2 rad/s.
- **Walk animation:** `|sin(9t)| × 0.08` bob, staff pitch ± 0.15 rad.
- **Ghost variant:** `transparent: true, opacity: 0.55`, emissive robe 0.4, float + 0.3 m with a ± 0.15 m sine at 1.5 rad/s.

### 3.2 NPC roster

| NPC (role) | Silhouette hook | Palette (robe / hat / trim / glow) | Costume details | Identifying prop | Build notes |
|---|---|---|---|---|---|
| **Headmistress Orla Vane** (main quest giver, Great Hall) | **Tallest** (scale 1.15), very tall hat (cone h 1.0) | `#3B2A6B` / `#2A1D4F` / `#D4AF37` / `#FFD84A` | High collar: `CylinderGeometry(0.32, 0.38, 0.25, 12)` at y 1.55; gold star on hat | Staff topped with a **crescent**: `TorusGeometry(0.14, 0.03, 6, 16, π × 1.3)` | Long trailing robe: robe cone radius 0.65 |
| **Pip Tansy** (second-year student) | **Shortest** (scale 0.8), oversized head (×1.2), hat slipping (tilt 0.35) | `#7A2D2D` / `#5A1F1F` / `#FFC070` / `#FFB040` | Striped scarf: 3 alternating thin tori `#FFC070`/`#7A2D2D` at neck | **Stack of books** under arm: 3 boxes `0.3 × 0.08 × 0.22` in `#8A4A2A`, `#2A5A8A`, `#5A8A2A` | No staff; wand = thin cylinder |
| **Professor Barnaby Quill** (glyph master) | Hunched (head z + 0.08), **long beard** to the waist | `#2D4A3A` / `#1F3529` / `#C0C0C0` / `#9FE8C0` | Beard `ConeGeometry(0.18, 0.7, 10)` `#E8E8E8` inverted; round spectacles = 2 tori r 0.05 | **Giant quill** behind the hat: flattened `ConeGeometry(0.08, 0.9, 4)` `#F2E9D8`, tilted back 0.6 rad | Desk with a floating scroll plane nearby |
| **Sister Wren** (healer) | Wide rounded hood instead of a pointed hat | `#E8E8F0` / `#B0C8FF` / `#6DC89A` / `#6DFFB0` (muted until she heals) | Hood: `SphereGeometry(0.34, 14, 10, 0, 2π, 0, π × 0.6)` over the head; apron plane `#FFFFFF` | **Lantern of herbs**: small box `0.18³` with a green emissive core 1.0 on a chain | Hands clasped: 2 small spheres in front of the chest |
| **Hob Marrow** (groundskeeper) | **Broadest** (x scale 1.3), short flat cap instead of a cone | `#5A4632` / `#3D2F22` / `#8FBF5A` / `#FFB040` | Flat cap `CylinderGeometry(0.32, 0.36, 0.18, 12)`; bushy beard; boots = 2 boxes | **Shovel**: cylinder handle + flattened box blade `0.25 × 0.32 × 0.03` `#8A8A8A` (metalness 0.7) | Carries the lantern after its quest is done |
| **Old Grimble** (friendly ghost) | Floating, no feet: robe cone truncated, **trailing wisp** | `#BFE0FF` / `#9FC8FF` / `#FFFFFF` / `#DCE9FF` | Ghost material (above) + 3 tail spheres shrinking 0.25 → 0.08 behind and below | **Chains on wrists**: 2 small torus links each | Fades opacity 0.4 ↔ 0.6 at 0.7 Hz |
| **Duel Master Kael Thorne** (new, optional duel host) | Angular: **wide shoulder pauldrons** (2 flattened `OctahedronGeometry(0.25)`) | `#2A2A35` / `#1A1A22` / `#E8243C` / `#FF5C5C` | Half-cape: `PlaneGeometry(0.9, 1.4)` behind, DoubleSide | **Crossed staves** on the back | Stands on a raised dais in duel mode |

**Readability rule:** each NPC differs from the others on at least **two** of: height, hat shape, width, prop silhouette. Check by rendering all of them black against white at 64 px.

**Quest markers:** sprite 0.8 m above the head.
- `!` `#FFD84A` = new quest.
- `?` `#7DFF7D` = turn in.
- Bob y ± 0.08 m at 3 rad/s.

---

## 4. Enemies, status cues and dragons

### 4.1 Enemy reading system (applies to all enemies)

| Cue | Rule |
|---|---|
| **Element** | Eye/core glow color = the element they *attack with* (fire `#FF7A2A`, poison `#8EE03A`, lightning `#FFF04D`, spirit `#DCE9FF`, physical `#FF3B2F`). |
| **Threat tier** | Size and ground ring. Minion: scale 0.7–0.9, no ring. Standard: 1.0–1.2, thin red ring `#FF3B2F` r = 0.9 × scale. Elite: 1.3–1.5, double gold ring `#FFC23D`. Boss/Dragon: ≥ 1.8, animated rune ring plus a top-of-screen health bar. |
| **Weakness hint** | When targeted, a small icon (the weak element's spell glyph thumbnail, 20 px) orbits the nameplate. |
| **Hit reaction** | Emissive flash to `#FFFFFF` for 60 ms, knockback (§10). |
| **Death** | Dissolve (shader `discard` with noise threshold 0 → 1 over 400 ms, edge glow in the element color) + 30-particle burst. |

### 4.2 Standard enemy roster

| Enemy | Silhouette | Palette (body / glow) | Build | Motion tell |
|---|---|---|---|---|
| **Dust Sprite** (minion) | Floating faceted gem + orbiting motes | `#D9C38C` / `#FFE9A8` | `IcosahedronGeometry(0.38, 0)` flatShading + 4 orbiting spheres r 0.07 | Erratic zig-zag dashes, 300 ms each |
| **Cellar Rat** (minion) | Low, long, big ears | `#6B5A4E` / `#FF3030` | Squashed sphere (0.8, 0.65, 1.3) + head sphere + ear cones + tail cylinder | Scurry in bursts; rears up 200 ms before biting |
| **Bog Imp** | Round body, huge head, horn-ears | `#4F7A3A` / `#FFD23A` | Sphere 0.42 body + sphere 0.32 head + 2 cones | Hops; crouches 250 ms before a mud toss |
| **Thornback Spider** | Wide and flat, 8 legs, glowing abdomen | `#2B2633` / `#B3FF3A` | Body + abdomen spheres; legs = 8 groups of thin cylinders | Abdomen glow pulses faster (2 → 6 Hz) before a venom spit |
| **Animated Armor** | Boxy humanoid, visor slit, sword | `#9AA3AD` (metalness 0.7, roughness 0.35) / `#58C8FF` | Boxes for torso/limbs; visor = emissive box | Raises sword 400 ms before a heavy swing |
| **Corridor Wraith** | Tall tattered cone, floating hood | `#8090B0` at 60% opacity / `#9FD8FF` | Open `ConeGeometry(0.6, 1.9, 12, 1, true)` DoubleSide + dark head sphere | Fades to 20% opacity while repositioning (300 ms) |
| **Ember Salamander** | Long capsule body, cone tail, glowing back spots | `#C8401C` / `#FFA020` | `CapsuleGeometry(0.35, 1.1)` + cone tail + 5 emissive back spheres | Back spots brighten in sequence head → tail before flame spit |
| **Stone Gargoyle** (elite) | Stocky, slab wings, horns | `#6F6F78` flatShading / `#FF5050` | Boxes + 2 wing slabs | Wings snap open 300 ms before a charge |
| **The Hollow Warden** (boss) | Huge armored skeleton, glowing chest core | `#35303F` / `#7A5CFF` (violet; *not* the Life green) | Armor rig ×1.8 + skull sphere + emissive core sphere | Core flares and the ground ring turns red 600 ms before a slam |

### 4.3 Status-effect visual cues

Each status has a **reserved color + one motion + one icon**. Rules:
- Attach the visual to the character as a pooled child effect.
- Never stack more than 3 visible status effects; show the rest as icons only on the nameplate.

| Status | Color | On-model visual (Three.js) | Icon |
|---|---|---|---|
| Burning | `#FF7A2A` | 12 / 6 additive particles rising from the body, flicker 10 Hz; body emissive tinted `#FF7A2A` at 0.25 | 🔥 |
| Poisoned | `#8EE03A` | Bubbles: 8 / 4 small spheres rising slowly; body tinted green 0.2 | ☠️ |
| Soaked | `#2F9BFF` | Drips: 6 / 3 particles falling with gravity; specular boost (roughness 0.2) | 💧 |
| Stunned | `#FFF04D` | 3 star sprites orbiting the head at 4 rad/s, r 0.4 | 💫 |
| Asleep | `#A9B4FF` | "Z" sprites drifting up every 600 ms; body tilts 15° | 💤 |
| Afraid | `#A34DFF` | Shiver (x jitter ± 0.03 m at 25 Hz) + dark violet aura ring at the feet | 😱 |
| Blinded | `#F2D49B` | Swirling dust ring at head height (torus 0.4 r, opacity 0.5) | 🌫️ |
| Shielded | `#2EE6C3` | Fresnel bubble (§7, Shield) | 🛡️ |
| Chilled (new, frost dragon) | `#BFF4FF` | Frost sprites on the body + 30% slower animation playback | ❄️ |
| Draconic Mark (new) | `#E8243C` | Rotating rune decal under the target (enemy dragons focus marked targets) | 🐉 |

### 4.4 Dragons — escalated threats and allies

Dragons are the game's **"big moment"** enemies. They must feel categorically different from standard enemies:

- **Scale:** 3–10× a wizard.
- **Rendering:** always a custom silhouette with wings.
- **Telegraphs:** every attack has a long, readable telegraph.
- **Camera:** they get their own camera framing.
- **UI:** a dedicated boss health bar.

#### 4.4.1 Shared dragon rig (procedural)

Build every dragon from the same parametric rig. Change only colors, proportions and features per variant.

| Part | Build |
|---|---|
| Spine | Chain of 10–16 segments: `SphereGeometry` radii tapering from `r_body` to 0.25 × `r_body`. Each segment follows the one in front (follow-the-leader with fixed spacing) → natural serpentine motion with zero animation data. |
| Head | Elongated `BoxGeometry` snout + 2 `ConeGeometry` horns swept back + emissive eye spheres + a **throat glow** sphere inside the neck (used for breath telegraphs). |
| Wings | Custom `BufferGeometry`: 1 shoulder vertex, 3–4 finger tips, membrane triangles between them. `side: DoubleSide`. Membrane material uses vertex colors darker at the edge. Flap = rotate the wing group around z: ± 0.6 rad at 1.5 Hz (glide) or 4 Hz (hover). |
| Legs | 2 or 4 short `CylinderGeometry` pairs with cone claws |
| Tail | Last 5 spine segments + a tail blade (`ConeGeometry` flattened, or a spiked `OctahedronGeometry`) |
| Back spines | InstancedMesh cones along the spine |

Spine segments are instanced (1 draw call), so a whole dragon is about 8 draw calls.

#### 4.4.2 Variants

| Dragon | Role | Size (length) | Silhouette | Palette (body / belly / membrane / eye-breath glow) | Breath / attack |
|---|---|---|---|---|---|
| **Wyrmling** (summonable ally) | Ally | 1.6 m | Chubby, oversized head, stubby wings, 4 legs | `#C23A4A` / `#F2C08A` / `#8A2A3A` / ally rim `#4AF2FF` + flame `#FF7A2A` | Small fire puffs (player-colored: white-hot core) |
| **Ember Drake** | Standard dragon enemy (forest) | 4 m | 4 legs, broad wings, short neck, heavy | `#7A1F12` / `#C8641E` / `#4A120C` / `#FF4A1C` | Cone of fire, 6 m; ground scorch decals |
| **Frost Wyvern** | Elite (courtyard siege event) | 5 m | **2 legs** (wings are arms), long thin neck, crystalline back spines | `#3A5A7A` / `#BFE8FF` / `#2A4A6A` (translucent 0.8) / `#BFF4FF` | Frost beam; applies Chilled; ice-crystal ground spikes |
| **Storm Wyrm** | Elite (sky over the courtyard) | 7 m | **No legs**, serpentine, small wing fins along the body, flies in sine curves | `#2A2A4A` / `#6A6A9A` / `#4A4AFF` at 0.6 / `#FFF04D` + `#9F7BFF` arcs | Lightning strikes at telegraphed circles |
| **Elder Dragon "Ashmaw"** | Final boss (dragon nest) | 10 m | Massive, 4 legs, horn crown, torn wings, glowing cracks along the body | `#1E1418` / `#5A2A1E` / `#2A1010` / cracks and breath `#FF4A1C` → `#FFD36B` | Sweeping breath, wing gust (knockback), meteor rain, tail sweep |

> Dragon breath is **enemy** fire: it follows the friend-vs-foe rule. Use a dark core `#1A0A12`, a red rim and the dragon's hue. The player's Dragon's Breath has a white-hot core.

#### 4.4.3 Behavioral tells (all telegraphs ≥ 600 ms so players can react while drawing)

| Attack | Tell | Duration |
|---|---|---|
| Breath | Throat glow sphere ramps emissive 0 → 4; head rears back 0.4 rad; red **cone decal** on the ground fills from origin to tip | 700 ms (Drake), 900 ms (Wyvern), 1100 ms (Elder) |
| Wing gust / knockback | Wings spread to full span and hold; dust ring expands at the dragon's feet | 650 ms |
| Tail sweep | Body twists away; a red **arc decal** (ring segment, 120°) fills | 600 ms |
| Dive / charge | Dragon lifts 3 m, shadow decal locks onto the target and shrinks 2 m → 0.8 m | 900 ms |
| Lightning call (Storm Wyrm) | Circle decals `#FFF04D` at 30% fill on 3–5 spots; crackle sparks at the edges | 800 ms |
| Meteor rain (Elder) | Sky darkens 15% (scene fog color lerp), circle decals appear 150 ms apart | 1200 ms |
| Enrage (< 30% HP) | Body cracks emissive ×2, wing membranes glow, roar shake 400 ms | — |

**Decal build:** `RingGeometry`/`CircleGeometry` on the ground (y + 0.02), `MeshBasicMaterial` `#FF3B2F`, `transparent`, `depthWrite: false`, `polygonOffset`. Animate the "fill" with a second inner mesh scaling 0 → 1, or a `uniform float fill` in a tiny shader.

**Escalation cues** (make dragons feel bigger than everything else):
- **Camera:** pull back +4 m and FOV 60 → 66° over 600 ms when a dragon enters.
- **Arrival:** a 250 ms roar screen shake (amplitude 0.25 m).
- **Health bar:** a **top-center** bar, 60% screen width, with the dragon's name in `elite.gold`.
- **Ally dragons:** a cyan rim (`ally.rim`) and a soft cyan blob shadow instead of black, so they never read as threats.

---

## 5. Spell drawing shapes

### 5.1 Rules for every shape

- **One continuous stroke** (pointer down → up).
- Recognition accepts **either direction**.
- **Closed** shapes (marked ●) can start **anywhere** on the outline.
- Tilt tolerance is ± 20°. Minimum stroke size is 25 px (bounding box).
- Templates live in a unit square, x right, **y down**.
- Code uses the existing `ShapeKit` helpers:
  - `arc(cx, cy, r, fromDeg, toDeg)` is counter-clockwise as seen on screen.
- Ghost guide:
  - Draw the template in the spell's primary color at 45% opacity, dashed (10 px dash / 10 px gap).
  - Draw a white **start dot** (r 5 px) and a small arrowhead 6 points along the stroke.
- **Verified:** all 17 shapes were run through the game's recognizer with simulated sloppy drawing (random tilt ± 12°, stretch 0.8–1.25×, wobble).
  - With the current square Spawn Ghost: **99.8% correct at light wobble, 99.1% at medium, 97.6% at heavy**. Nearly all errors were Shield ↔ Spawn Ghost.
  - With the recommended Pigtail Spawn Ghost (§5.3): **99.6% at heavy wobble**.

### 5.2 The 13 core spells

| # | Spell | Shape (nickname) | Description / stroke order | `ShapeKit` template | Closest other shape |
|---|---|---|---|---|---|
| 1 | **Fire Bolt** | Rising Triangle ● | Bottom-left → apex top-center → bottom-right → back to start | `poly([[0,1],[0.5,0],[1,1],[0,1]])` | Water Bullet (inverted) |
| 2 | **Water Bullet** | Falling Triangle ● | Top-left → top-right → bottom-center point → back to start | `poly([[0,0],[1,0],[0.5,1],[0,0]])` | Heal (85%) — keep the point sharp |
| 3 | **Shield** | Circle ● | Full circle, any start | `circle()` | Heal (86%) |
| 4 | **Poison** | Serpent S | Start top-right, curve over the top to the left, down through the center, curve right, end bottom-left | `join(arc(0.5,0.25,0.25,20,270,24), arc(0.5,0.75,0.25,90,-160,24))` | Lightning (80%) |
| 5 | **Lightning Strike** | Bolt ⚡ | Top-right-ish → down-left to mid → right along mid → down-left to bottom | `poly([[0.65,0],[0.25,0.5],[0.75,0.5],[0.35,1]])` | Poison (80%) |
| 6 | **Gust** | Wave ~ | Left → right, two full sine periods, amplitude 0.25 | `wave(2, 0.25)` | Dragon Ward (72%) |
| 7 | **Cause Fear** | Jagged W | Top-left down to bottom, up to middle, down to bottom, up to top-right | `poly([[0,0],[0.25,1],[0.5,0.35],[0.75,1],[1,0]])` | Dragon Bind (68%) |
| 8 | **Sleep** | Zed Z | Top-left → top-right → bottom-left → bottom-right | `poly([[0,0],[1,0],[0,1],[1,1]])` | (54% — very safe) |
| 9 | **Dragon's Breath** | Spiral | Start at the center, spiral outward counter-clockwise 2 full turns | `spiral(2)` | (60% — very safe) |
| 10 | **Heal** | Heart ● | Start at the bottom point, up the left lobe, dip to the top-center notch, right lobe, back to the bottom point | `heart()` | Shield (86%) |
| 11 | **Spawn Ghost** | **Pigtail** (changed, see §5.3) | Diagonal up from bottom-left to the loop's bottom point, one full counter-clockwise loop (up the right side, over the top, down the left), then diagonal down to bottom-right | `join(poly([[0,1],[0.5,0.45]]), arc(0.5,0.25,0.2,270,630,32), poly([[0.5,0.45],[1,1]]))` | Summon Elder (65%) |
| 12 | **Spirit Bomb** | Five-Point Star ● | Classic one-stroke pentagram from the top point | `star(5)` | (48% — very safe) |
| 13 | **Kamehameha Wave** | Loop & Release | Small circle on the left (start at its right edge, go around once), then a long straight line to the right | `join(arc(0.15,0.5,0.15,0,360,32), poly([[0.3,0.5],[1,0.5]]))` | Water Bullet (68%) |

### 5.3 Required change: Spawn Ghost

The current Spawn Ghost shape (a **square**) scores **92% similar to Shield's circle**. That is too close: under fast, sloppy drawing they swap about 1 time in 15. Replace it with the **Pigtail** above: a rising line, a tight loop and a falling line, like a ghost's wisp.

Test results with heavy wobble across all 17 spells:

| Spawn Ghost shape | Accuracy | Closest other shape |
|---|---|---|
| Square (current) | 97.6% overall, Shield ↔ Ghost confusions | Shield 92% |
| Bow-tie | 97.8% | Dragon Ward 85% |
| Omega Ω | 99.2% | Shield 82% |
| **Pigtail (recommended)** | **99.6%** (final joined version: 40/40 Spawn Ghost draws recognized) | Summon Elder 65% |

### 5.4 Dragon spells (new)

| # | Spell | Shape | Description / stroke order | `ShapeKit` template | Closest other shape |
|---|---|---|---|---|---|
| 14 | **Summon Wyrmling** | Wings M | Bottom-left up to the top, down to the middle, up to the top, down to bottom-right (the vertical mirror of Cause Fear's W) | `poly([[0,1],[0.25,0],[0.5,0.6],[0.75,0],[1,1]])` | Heal (59%) |
| 15 | **Dragon Ward** | Infinity ∞ ● | Figure-eight lying on its side; start anywhere, cross through the center | Lemniscate: for `i = 0..64`, `t = i/64·2π`, `d = 1 + sin²t`, point = `[0.5 + 0.5·cos t / d, 0.5 + 0.8·sin t·cos t / d]` | Summon Elder (61%) |
| 16 | **Dragon Bind** | Shackle U | Top-left straight down, round the bottom, straight up to top-right | `join(poly([[0,0],[0,0.5]]), arc(0.5,0.5,0.5,180,360,24), poly([[1,0.5],[1,0]]))` | Shield (79%) |
| 17 | **Summon Elder Dragon** | Arrowhead | Bottom-center straight up to the top, down-left to the left barb, back up to the tip, down-right to the right barb | `poly([[0.5,1],[0.5,0],[0.15,0.35],[0.5,0],[0.85,0.35]])` | Dragon Ward (61%) |

**Dragon spell effects** (§7) summon or interact with dragons:
- Wyrmling: a small allied dragon that fights for 12 s.
- Dragon Ward: a fire-and-breath shield that absorbs dragon attacks.
- Dragon Bind: chains that pin a dragon for 2.5 s and ground a flying one.
- Elder Dragon: an ultimate; a colossal spectral dragon makes one strafing pass.

### 5.5 Recognizer settings for real-time play

| Setting | Value | Why |
|---|---|---|
| Success threshold | 0.78 | Below this, random scribbles never matched (0 of 200 in testing; max scribble score 0.768) |
| Perfect threshold | 0.92 | Clean, confident strokes land 0.94–0.97 |
| Live guess frequency | Every 4th pointer sample, at most every 60 ms | Partial guess costs ≈ 1.8 ms |
| Templates searched | **Only spells the player knows** (plus all in duel) | Fewer templates = faster and fewer false matches |
| Final recognition cost | ≈ 20 ms for all 17 templates (measured, desktop-class CPU). Expect 40–80 ms on phones. | See §9.8 for running it in a Web Worker |

---

## 6. Spell color schemes

### 6.1 Structure of every spell color set

- **Primary:** the body of the effect (projectile mesh, main particles).
- **Secondary:** accents, trails, sparks and the impact ring. It should differ from primary in value or hue so the effect has depth.
- **Glow:** the halo sprite and the light color, plus the hot core. For player spells the core is always `#FFFFFF`, blended to glow at 30% radius.

### 6.2 Per-spell palette

| Spell | Family | Primary | Secondary | Glow | Distinguishing note |
|---|---|---|---|---|---|
| Fire Bolt | Fire | `#FF7A2A` | `#FFB347` | `#FFD9A0` | Orange; round projectile |
| Dragon's Breath | Dragonfire | `#FF4A1C` | `#FFC23D` | `#FFE36B` | Redder than Fire Bolt; cone stream, never a ball |
| Water Bullet | Water | `#2F9BFF` | `#9AD4FF` | `#D6EEFF` | Sky blue, droplet trail |
| Lightning Strike | Lightning | `#FFF04D` | `#FFFFFF` | `#FFF9B8` | Yellow-white, vertical bolt from above |
| Gust | Wind | `#F2D49B` | `#FFFFFF` | `#FFF6DE` | Pale sand (the only low-saturation spell); reads by motion |
| Poison | Poison | `#8EE03A` | `#3E8F1E` | `#C9FF8A` | Acid green with dark-green smoke |
| Cause Fear | Mind | `#A34DFF` | `#2A0A40` | `#E0B8FF` | Violet + **black** smoke; jagged |
| Sleep | Mind | `#A9B4FF` | `#E8ECFF` | `#C9D4FF` | Pastel periwinkle; soft, slow, round |
| Shield | Ward | `#2EE6C3` | `#0F6E66` | `#B8FFF6` | Teal-mint bubble |
| Heal | Life | `#3DFF8E` | `#1E9E5A` | `#C8FFE0` | Saturated green, upward motion |
| Spawn Ghost | Spirit | `#DCE9FF` | `#8FA6C8` | `#FFFFFF` | Near-white, translucent |
| Spirit Bomb | Soul | `#FF5CDB` | `#8FB8FF` | `#FFE0F6` | Magenta-pink orb with blue sparks; unique hue |
| Kamehameha Wave | Energy | `#3D5CFF` | `#A8C8FF` | `#FFFFFF` | Royal blue beam with a pure-white core; the beam shape separates it from Water |
| Summon Wyrmling | Draconic | `#E8243C` | `#FFC23D` | `#FF8A6B` | Crimson + gold sigil |
| Dragon Ward | Draconic | `#E8243C` | `#2EE6C3` | `#FFB8C0` | Crimson ring with teal inner (ward) |
| Dragon Bind | Draconic | `#FFC23D` | `#E8243C` | `#FFE9A8` | Gold chains, crimson runes |
| Summon Elder Dragon | Draconic | `#E8243C` | `#FFD36B` | `#FFFFFF` | Screen-filling crimson silhouette, gold eyes |

### 6.3 Category summary (for UI icons, spellbook tabs and the spell guide)

| Category | Spells | Tab/icon color |
|---|---|---|
| Elemental | Fire Bolt, Water Bullet, Lightning, Gust, Dragon's Breath | `#FF7A2A` |
| Affliction | Poison, Cause Fear, Sleep | `#A34DFF` |
| Ward & Life | Shield, Heal | `#2EE6C3` |
| Spirit | Spawn Ghost, Spirit Bomb, Kamehameha Wave | `#FF5CDB` |
| Draconic | All 4 dragon spells | `#E8243C` |

### 6.4 Contrast checks

- **Environment conflict:** no environment uses a saturated version of any primary above (§1.2). Fixed conflicts: the dungeon ooze (was Life green → now `#3A6A5A`) and the Warden core (green → violet `#7A5CFF`).
- **Spell vs spell:**
  - The closest hue pairs are Water / Kamehameha / Sleep (200–238°). They are separated by **form**: bullet, beam, soft mist.
  - They are also separated by **saturation/value**: Sleep is pastel, and Kamehameha has a white core with a much larger glow.
  - Fire Bolt vs Dragon's Breath: separated by hue (25° vs 15°) and by form (ball vs cone stream).
- **Enemy vs player:** player spells have a white core; enemy attacks have a dark core and red rim (§0 rule 6).

---

## 7. Spell effect visualizations

### 7.1 Shared FX building blocks

These are pooled; never allocate during combat.

| Block | Build | Pool size (Desktop / Mobile) |
|---|---|---|
| **Particles** | One `InstancedMesh` of camera-facing quads (`PlaneGeometry(1,1)`) with a custom `ShaderMaterial`: per-instance color, size, life (instanced attributes); soft radial falloff in the fragment shader; `blending: AdditiveBlending`, `depthWrite: false`. Simulate on the CPU in a typed array, or fully in the shader from spawn time + velocity. | 3000 / 1000 |
| **Halo sprite** | `Sprite` with a 64 px radial-gradient `CanvasTexture` (white → transparent), additive. A cheap stand-in for bloom on every bright object. | 64 / 32 |
| **Trail ribbon** | Triangle strip of the last 16 positions, alpha fading toward the tail, additive. Pre-allocated `BufferGeometry`, update the positions each frame. | 24 / 12 |
| **Shock ring** | `RingGeometry(0.9, 1, 48)` flat on the ground or facing the camera, scaled 0 → R, opacity 1 → 0 | 16 / 8 |
| **Light flash** | `PointLight`, intensity curve 0 → peak → 0 | 4 / 2 |
| **Beam** | Open `CylinderGeometry(1, 1, 1, 16, 1, true)` scaled along z; inner white core plus outer additive sheath | 4 / 2 |
| **Decal** | `CircleGeometry` / `RingGeometry` on the ground, `polygonOffset` | 24 / 12 |

**Universal impact package** (every damaging spell; values per tier in §10):
1. A white 1-frame flash on the target (emissive).
2. A halo burst at the hit point.
3. A shock ring in the secondary color.
4. A particle burst in primary + secondary.
5. A floating damage number.
6. Hit-stop and camera shake for Great/Perfect casts.

### 7.2 Per-spell effects

Particle counts are Desktop / Mobile. "Travel" is the projectile speed at Perfect quality (§10 scales it per tier).

| Spell | Cast (wind-up) | Travel / body | Impact | Lingering | Particles |
|---|---|---|---|---|---|
| **Fire Bolt** | Staff orb flares orange; 6 sparks spiral into the orb | Sphere r 0.3 (white core) + halo 0.9 m + trail ribbon (orange → transparent) + 1 point light; slight arc (peak + 0.6 m); 40 m/s | 50-particle burst (primary/secondary), shock ring 2 m, scorch decal 1 m fading over 1.5 s | Burn status (§4.3) | 70 / 30 |
| **Water Bullet** | Water spirals around the staff (ring of 8 droplets, 0.3 m) | Elongated droplet: sphere scaled (0.8, 0.8, 1.6) aligned to velocity, `roughness 0.1, metalness 0`, secondary-color trail of droplets falling with gravity; 45 m/s | Splash: 40 droplets in a dome with gravity −9.8; flat splash ring on the ground; target gets the Soaked status | Puddle decal 2 s | 60 / 25 |
| **Lightning Strike** | Sky flickers (fog color +10% for 60 ms); small spark crown over the target 120 ms before the strike | Instant: jagged `Line` (12 segments, ± 0.6 m jitter) from 12 m above the target; regenerate the jitter every 40 ms for 3 flickers; 2 branch lines | Light flash intensity 15 / 25 m, 60-particle spark burst, ground shock ring 3 m, camera shake 0.15 m | Stun stars on a stun proc | 80 / 35 |
| **Gust** | Dust ring expands at the caster's feet | Wide crescent: 3 stacked camera-facing arc planes (`RingGeometry(1.2, 1.5, 24, 1, 0, π)`) racing forward at 30 m/s, opacity flicker; dust particles streak sideways | Target knocked back 1.5 m (§10); dust swirl at head height | Blind dust ring | 90 / 40 |
| **Poison** | Green bubbles rise from the orb | Wobbling sphere r 0.3 (vertex-shader wobble), dripping particles; 30 m/s | Acid splash + a lingering cloud: 30 large (0.5 m) soft particles `#3E8F1E` at 50% opacity, slow swirl, 2.5 s | Poison bubbles | 60 + 30 / 25 + 12 |
| **Cause Fear** | Caster's eyes glow violet; screen-edge vignette pulses violet 80 ms | Jagged dark comet: black-violet core sphere with a `#2A0A40` smoke trail, zig-zag path (lateral ± 0.4 m) | Expanding jagged ring (star-shaped 8-point line loop) + a shrieking face sprite (simple canvas-drawn skull) flashing 150 ms | Fear shiver + aura | 50 / 20 |
| **Sleep** | Soft pastel motes drift from the orb | Slow drifting cloud of 20 soft particles moving at 12 m/s (deliberately the slowest spell), slight sine sway | Cloud envelops the target and lingers 1 s; "Zzz" sprites | Sleep Zs | 40 / 18 |
| **Shield** | Ring traces around the caster at floor level in 120 ms | **Fresnel bubble**: `SphereGeometry(1.4, 24, 16)`, `ShaderMaterial` with alpha = `pow(1 − dot(N, V), 2.5)`, color `#2EE6C3`, additive; hexagon pattern via a procedural `CanvasTexture` scrolling slowly | On hit: the bubble flashes white at the impact point (pass the hit direction as a uniform; brighten fragments with `dot(N, hitDir) > 0.8`) and ripples | Bubble persists; shatters into 40 shards when it breaks | 40 / 20 |
| **Heal** | Green ring at the feet | Column of 60 rising particles (spiral, 1.2 s) + a green halo on the caster + a soft white flash 100 ms | `+HP` number in `tier.great` green | Faint green sparkle 0.5 s | 70 / 30 |
| **Spawn Ghost** | Ground cracks with white light under the caster's side | A ghost model (wizard rig, ghost material, scale 0.7) rises from the ground in 300 ms with a white burst; floats beside the caster | Each ghost strike: a small white projectile r 0.2, 35 m/s, wispy trail | Ghost persists for its duration; fades out over 400 ms | 40 / 18 |
| **Spirit Bomb** | Caster raises the staff; the orb **grows above the head** for 500 ms (r 0.1 → 1.6 m); streams of blue sparks fly *inward* from the surroundings | Huge pink orb with a white core, 2 rotating additive shells, 1 point light; falls toward the target in 400 ms with ease-in | Massive: 120-particle burst, 6 m shock ring, light flash 20, camera shake 0.35 m, hit-stop 120 ms | Pink embers float down for 1 s | 160 / 60 |
| **Kamehameha Wave** | Charge 400 ms: blue particles converge into a sphere at the hands; the sphere pulses faster | **Beam**: white core cylinder r 0.35 + blue sheath r 0.8 (additive) + spiraling particle streaks along the beam; extends from caster to target in 120 ms and holds 600 ms with a ± 5% radius jitter at 30 Hz | Continuous sparks at the contact point, ground scorch line, camera shake 0.2 m sustained | Fading blue afterglow 300 ms | 140 / 55 |
| **Dragon's Breath** | Staff orb turns red; a dragon-head sigil (canvas-drawn sprite) flashes in front of the caster 150 ms | Cone stream: 25 puffs per second (each 10 soft particles) for 1.2 s, velocity 9 m/s spread ± 15°; puff color shifts primary → secondary → dark smoke `#3A2A20` over its life; puff size 0.45 → 1.05 m | Target engulfed: burn status; ground scorch cone decal | Smoke 1 s | 300 / 110 |
| **Summon Wyrmling** | Crimson summoning circle (decal with a rotating rune ring, 2 m) draws itself in 250 ms | Wyrmling bursts out with a wing flap, 30 gold sparks, ally rim `#4AF2FF` | — | Wyrmling fights 12 s, then dissolves into embers | 60 / 25 |
| **Dragon Ward** | Crimson infinity sigil traces in the air in front of the caster | Two interlocking rings (crimson outer, teal inner) orbit the caster on tilted axes at 3 rad/s; fresnel shell tinted crimson | On blocking dragon fire: the fire splits around the ward (deflected particles), the rings flash | Lasts 6 s | 50 / 20 |
| **Dragon Bind** | Gold chains snake out from the ground under the target in 200 ms | Chains: instanced torus links along 4 curves (Catmull-Rom) from ground anchors to the dragon's body, gold `#FFC23D` with crimson runes (emissive) | A flying dragon is dragged down 3 m in 300 ms; dust ring on landing; camera shake 0.2 m | Chains strain (link scale pulse) for 2.5 s, then shatter | 70 / 30 |
| **Summon Elder Dragon** | Screen darkens 25% over 300 ms; a giant crimson sigil appears on the ground; low rumble shake (0.05 m) | A **spectral dragon silhouette** (shared rig, translucent crimson material, scale 4) swoops across the arena in 1.2 s, breathing white-cored crimson fire along its path | Everything in the path takes heavy damage: sequential impact bursts 150 ms apart, big shake 0.4 m, hit-stop 140 ms | Lingering ember rain 1.5 s | 400 / 140 |

### 7.3 Intensity tiers by draw quality

The same spell looks stronger when drawn better. This makes precision *visible*.

| Tier | Size | Particle count | Glow / light | Extras |
|---|---|---|---|---|
| Perfect (≥ 92%) | ×1.15 | ×1.3 | Halo ×1.3, light ×1.5 | Gold sparkle ring at cast (`tier.perfect`), extra shock ring, hit-stop and shake (§10) |
| Great (85–92%) | ×1.0 | ×1.0 | ×1.0 | Small shake |
| Good (78–85%) | ×0.85 | ×0.7 | ×0.8 | No shake, thinner trail |

---

## 8. UI elements

### 8.1 Principles

1. **The world is the main display.**
   - During combat, UI covers **≤ 12% of the screen**.
   - No modals, and nothing in the center third except transient feedback (< 400 ms).
2. **Feedback lives where the eyes are.** Put the match % and confirmation at the **stroke's release point**, not in a fixed panel.
3. **Color = meaning.** Tier colors (§1.4) are used *only* for cast quality. Element colors are used *only* for spells.
4. **One font pair:**
   - Display: `Georgia, 'Times New Roman', serif` (spell names, titles).
   - Numbers and HUD: `system-ui, 'Segoe UI', Roboto, sans-serif` with `font-variant-numeric: tabular-nums`. No web-font download.

| Text role | Size (desktop / mobile) | Weight | Color |
|---|---|---|---|
| Spell name on cast chip | 20 / 17 px | 700 serif | Spell primary |
| Match % on cast chip | 28 / 22 px | 800 sans | Tier color |
| Damage numbers | 22–40 / 18–30 px (scaled by tier) | 800 sans, 2 px black stroke | White; crits in `tier.perfect` |
| HUD bar labels | 11 / 10 px | 600 sans | `ui.text` |
| Panel titles | 22 / 18 px | 700 serif | `#FFD84A` |
| Body text | 15 / 14 px | 400 serif | `ui.text` |

### 8.2 In-combat HUD layout (real-time)

```
┌───────────────────────────────────────────────────────────────┐
│ [HP][MP] portrait          BOSS / DRAGON BAR (top-center)      │
│ status icons                                       [minimap?] │
│                                                               │
│                      (game world — clear)                     │
│                                                               │
│                     stroke + ghost + chip                     │
│                                                               │
│ [combo/last cast]                 [QUICK GLYPH STRIP: 5 slots] │
└───────────────────────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Player frame | Top-left, 220 × 64 px: HP bar 12 px, MP bar 8 px, 4 status icons (18 px) below |
| Boss / dragon bar | Top-center, 60% width, 14 px tall, name above in `elite.gold`; phase ticks at 70% / 30% |
| Quick Glyph strip | Bottom-right, 5 slots of 44 px (36 px on mobile). Each slot shows the spell's shape thumbnail (stroked in the spell primary, white start dot) and a radial cooldown sweep (dark 60% overlay). Slots with too little mana are greyed out to 35%. Replaces the large spell-guide panel during real-time play. |
| Enemy nameplates | World-anchored above the head: 90 px HP bar, red for enemies, cyan for allies. Show only within 15 m or when damaged in the last 3 s. |
| Combat log | **Removed in real time.** Use damage numbers and status icons instead. An optional toggle shows the last 3 events, 12 px, fading in 2 s. |

### 8.3 Drawing feedback (the core loop)

| State | Visual |
|---|---|
| **Idle** (can cast) | Cursor = small glowing ring 14 px `#9FE8FF`. Nothing else on screen. |
| **Drawing** | Trail: 6 px core `#FFFFFF` + 14 px outer `#9FE8FF` with 16 px canvas shadow-blur glow; the tail fades over its last 30% of length. Live guess: when the best partial match is ≥ 60%, show the full template as a **dashed ghost** (spell primary, 45% opacity) aligned to the stroke, plus a small label "Fire Bolt?" (14 px) offset (+18, −14) px from the pen. The trail color shifts toward the guessed spell's primary at 30% blend. |
| **Release → recognized** | Within ≤ 50 ms: a **cast chip** pops at the release point (offset 24 px up), pill 150 × 54 px, panel color + 2 px tier-colored border: `[ 97% ]  Fire Bolt  PERFECT`. The stroke flashes in the tier color and contracts into the staff orb (§10). |
| **Perfect** | Chip border and text `#FFD84A`, a gold particle sparkle burst (12 particles) at the chip, the chip scales 0.6 → 1.12 → 1.0. Distinct short "ting" sound recommended. |
| **Great / Good** | Chip in `#7DFF9A` / `#9FD8FF`. Good shows a small "−power" hint: power % in muted text. |
| **Fizzle** | Stroke turns `#FF6B6B` and shatters into 20 short line segments falling with gravity in 180 ms. Chip: "62% · Closest: Shield" in `tier.fizzle`; the chip shakes x ± 4 px × 3. |
| **No mana** | Chip: "Need 80 MP"; the MP bar flashes red twice (2 × 120 ms). |
| **Cooldown / lockout** | Cursor ring becomes a draining arc; strokes started during lockout are buffered (§10.5). |

### 8.4 Spell-learning tutorial

- **Layout:** centered panel 560 × 640 px (full-screen on mobile), allowed because the tutorial is out of combat. Header: spell name (22 px serif) + category tag. Info row: shape name · mana cost · one-line effect.
- **Drawing area:** 420 × 420 px canvas, radial gradient `#241A3A` → `#0E0A18`, 1 px border `#4A3A6A`.
- **Demo state:**
  - The template draws itself over **1.6 s** (ease-in-out), 8 px glowing stroke in the spell primary.
  - A white "comet head" dot (r 9 px, glow 25 px) leads it.
  - The faint full template is shown at 18% opacity underneath.
  - Pause 600 ms, then loop.
  - Start-dot pulse r 5 → 8 px at 1.5 Hz.
- **Practice state:** begins the moment the player touches the canvas.
  - The demo stops; the faint template stays as a guide.
  - Live ghost and labels behave as in combat.
- **Result states:**
  - Success: green feedback text plus a burst of the spell's own mini effect (2D particles in its colors) inside the canvas, then "Added to Spellbook" (scale 0.8 → 1, 200 ms).
  - Wrong spell: "That looked like Heal (81%)", and the demo replays once after 900 ms.
  - Close miss: "74% · need 78%", with a hint about the most common error for that shape (e.g. "keep the bottom point sharp").
- **Progress:** 3 pips under the canvas. First success = learned. Optional "master it" mode: 3 Perfects.

### 8.5 Spellbook

- **Layout:** two-page book, 960 × 640 px.
  - Left page: category tabs (§6.3 colors, 40 px tall) + a grid of spell cards (3 × 3, 96 px thumbnails).
  - Right page: the selected spell's detail.
- **Spell card states:**

  | State | Look |
  |---|---|
  | Learned | Full color, glyph thumbnail with start dot and arrow |
  | Pending lesson | Gold pulsing border, "Learn now" |
  | Locked | Thumbnail drawn in `#555555`, no start dot, unlock hint ("Level 5", "Quest: …", "Secret") |

- **Detail page:**
  - Large animated glyph (looping demo).
  - Stats as icon rows: 💧 cost, ⚔ power, ⏱ cast time per tier, element.
  - Your best match %.
  - A **Practice** button.

### 8.6 Quest log

- **Layout:** right-side drawer, 380 px wide, slides in over 180 ms (`cubic-bezier(.2,.8,.2,1)`). The game keeps running behind it at 100% opacity, except in story pauses.
- **Sections:** Active (expanded) · Available (collapsed, giver + location) · Completed (collapsed).
- **Quest entry:** title 16 px serif bold; giver in muted text; objectives as checkbox rows with `3/5` progress; a ready-to-turn-in banner `#7DFF7D` "Return to Headmistress Vane".
- **Tracker:** the top 2 active quests stay pinned top-left under the player frame (12 px, 50% panel opacity). They auto-hide during combat and return 2 s after combat ends.

### 8.7 Accessibility and quality toggles (settings)

- Reduce camera shake (0 / 50 / 100%).
- Reduce flashes (caps light-flash intensity at 40% and disables the white hit flash).
- Colorblind assist (adds shape icons to status cues and outlines tier colors with patterns: Perfect = star, Great = double tick, Good = single tick).
- Quality: Auto / Desktop / Mobile (§9.7).

---

## 9. Three.js technical recommendations

### 9.1 Renderer

```js
const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = false;           // blob shadows instead (§2)
camera.far = 90;                              // fog hides beyond this
```

### 9.2 Materials

| Use | Material | Parameters |
|---|---|---|
| Stone, wood, cloth, most props | `MeshLambertMaterial` (cheapest lit) | `color`, `flatShading` via geometry `toNonIndexed()` + `computeVertexNormals()`; or `MeshStandardMaterial` `roughness 0.9, metalness 0` if you need specular |
| Characters | `MeshStandardMaterial` | `roughness 0.75, metalness 0.05`; skin `roughness 0.6` |
| Armor, bars, gold | `MeshStandardMaterial` | Armor `roughness 0.35, metalness 0.7`; gold `roughness 0.3, metalness 0.6`; bars `roughness 0.4, metalness 0.8` |
| Glow parts (eyes, orbs, flames, runes) | `MeshBasicMaterial` (unlit) or Standard with `emissive` = color, `emissiveIntensity 1.5–3` | Basic is cheaper; use it for small parts |
| Ghosts, wraiths | `MeshStandardMaterial` | `transparent: true, opacity 0.55, depthWrite: false`, emissive 0.3–0.4 |
| Spell bodies, particles, beams, halos | `MeshBasicMaterial` / custom `ShaderMaterial` | `blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false` (keeps the core white-hot after tone mapping) |
| Shield / ward bubbles | `ShaderMaterial` (fresnel) | Additive, `side: FrontSide`, `depthWrite: false` |
| Ground decals | `MeshBasicMaterial` | `transparent, depthWrite: false, polygonOffset: true, polygonOffsetFactor: −1` |

**Share materials:** create one material per palette token and reuse it. Never create materials inside spawn functions.

### 9.3 Textures: procedural, stylized, tiny

There are no image assets. Generate everything once at load time with a 2D canvas (`CanvasTexture`) at **128–256 px**, `RepeatWrapping`, and `NearestFilter` for a hand-painted pixel feel or `LinearMipmapLinearFilter` for smooth.

| Texture | Recipe |
|---|---|
| Stone floor | Fill the base color; draw a grid of 4 × 4 rounded rectangles in base ± 6% lightness; 300 random 1–2 px specks; 1 px dark grout lines. Repeat (W/4, D/4). |
| Wood planks | Vertical bands 32 px wide in alternating ± 4% lightness; sine-wave grain lines (alpha 0.15); dark plank seams. |
| Grass / forest floor | Base + 2000 random 1 × 3 px strokes in ± 8% hue. |
| Particle soft dot | 64 px radial gradient: white 1.0 at 0% → 0.6 at 30% → 0 at 100%. Shared by all particles and halos. |
| Hex shield pattern | 128 px tile of hexagon outlines (2 px, white 60%) |
| Rune ring | 512 px canvas: circle + 12 glyphs drawn from the spell templates (reuse your `ShapeKit` points!) |
| Noise (dissolve, wobble) | 128 px value noise baked once into a `DataTexture` |

**Recommendation:** go *stylized flat + procedural detail* rather than attempting realism. It is cheaper, matches the low-poly silhouettes, and keeps spells the highest-contrast element.

### 9.4 Lighting setup (per area)

- **Base lights:** 1 `HemisphereLight` (ambient fill, characters always readable) + 1 `DirectionalLight` (form shading, no shadows), with values per area in §2.
- **Point lights:** ≤ 4 environment `PointLight`s with `decay: 2` and an explicit `distance`.
  - Keep the total *point* light count fixed for the whole session, including the 4 pooled spell lights. Three.js recompiles shaders when the number of lights changes.
  - Toggle `intensity` instead of adding or removing lights.
- **Rim light for characters:** add a fresnel term via `onBeforeCompile` (`emissive += rimColor × pow(1 − dot(N, V), 3) × 0.6`). It separates characters from dark backgrounds at almost no cost. Rim colors: player `#9FE8FF`, enemies `#FF3B2F` at 0.4, allies `#4AF2FF`.

### 9.5 Post-processing

| Option | Desktop | Mobile | Recommendation |
|---|---|---|---|
| **Halo sprites** (fake bloom) | Yes | Yes | **Default for both.** Near-zero cost; the core of the glow look. |
| `UnrealBloomPass` | Optional, at **half resolution**: threshold 0.85, strength 0.8, radius 0.4 | No | Adds polish on desktop, but costs 2–4 ms/frame on integrated GPUs and needs the `examples/jsm` add-ons (not in the current bundled `three.min.js`). Add it only after the game holds 60 FPS without it. |
| FXAA | If `antialias: false` | No | Cheap; use on desktop when MSAA is off |
| SSAO, DOF, motion blur | No | No | Too expensive for the benefit in a fast game |
| Screen shake, hit flash, vignette pulse | Yes | Yes | Done in camera transform and a CSS overlay; free |

### 9.6 Performance budget (target: 60 FPS desktop, stable ≥ 45 FPS on mid phones)

| Budget | Desktop | Mobile |
|---|---|---|
| Draw calls per frame | ≤ 150 | ≤ 80 |
| Triangles | ≤ 200 k | ≤ 80 k |
| Active particles | ≤ 3000 | ≤ 1000 |
| Point lights (fixed) | 8 (4 env + 4 FX) | 4 (2 + 2) |
| Transparent overdraw layers at the screen center | ≤ 6 | ≤ 3 |
| JS per frame | ≤ 6 ms | ≤ 8 ms |

**Rules that matter most in spell-spam:**

1. **Pool everything:** particles, projectiles, rings, lights, decals, damage-number DOM nodes. Zero `new` in the combat loop.
2. **Reuse math objects:** module-level scratch `Vector3`s. No `.clone()` per frame.
3. **Instance repeated geometry:** candles, trees, bars, pillars, spine segments, chain links.
4. **Cap concurrent heavy effects:** max 2 beams, max 3 Dragon's Breath streams, max 1 Elder Dragon at a time. Extra casts reuse the oldest slot.
5. **Additive overdraw is the real GPU killer:**
   - Shrink particle size before cutting particle count.
   - Fade out particles closer than 1.5 m to the camera.
6. **Dispose on area change:** `geometry.dispose()`, `material.dispose()`, `texture.dispose()`.

### 9.7 Adaptive quality (Auto mode)

- **Measure:** track a rolling 2 s average frame time.
- **If > 20 ms:** step down one level.
  1. Pixel ratio ×0.85.
  2. Particles ×0.6.
  3. Disable bloom / FXAA.
  4. Halve trail lengths and fireflies.
  5. Drop non-essential point lights to emissive-only.
- **If < 12 ms for 5 s:** step back up.
- **Reasoning:** frame-rate stability beats fidelity in real-time combat.

### 9.8 Recognition off the main thread

- **Cost:** the final recognition costs about 20 ms on desktop for 17 templates. That is acceptable, but it can drop a frame mid-combat, and phones are 2–4× slower.
- **Recommendation:** run `recognizer.js` in a **Web Worker**.
  - Post the stroke points on pointer-up.
  - Receive `{id, score}`.
- **Main thread meanwhile:** play the "release" animation (§10) for the ~20–60 ms the worker needs, so the delay is hidden inside the animation.
- **Live partial guesses** (≈ 1.8 ms) can stay on the main thread, throttled to every 60 ms.

---

## 10. Animation and feedback timing

### 10.1 Easing tokens

| Token | CSS / formula | Use |
|---|---|---|
| `snap` | `cubic-bezier(.2, 1.6, .4, 1)` | Chip pop, perfect sparkle (overshoot) |
| `out` | `cubic-bezier(.2, .8, .2, 1)` | Panels, knockback start |
| `in` | `cubic-bezier(.6, 0, .9, .4)` | Spirit Bomb fall, fade-outs |
| `inout` | `cubic-bezier(.45, 0, .55, 1)` | Recovery, camera moves |
| `linear` | — | Projectile travel (constant speed reads as "fast") |

### 10.2 The drawing-to-cast loop

All times are measured from the event that starts each step.

| Step | Perfect | Great | Good | Fizzle | Notes |
|---|---|---|---|---|---|
| Pointer sample → trail drawn | same frame (≤ 16 ms) | same | same | same | Use `getCoalescedEvents()`; draw on a 2D overlay canvas |
| Live ghost update | every 60 ms | same | same | same | Only when the best partial match ≥ 60% |
| **Release → recognition result** | ≤ 25 ms desktop / ≤ 70 ms mobile | same | same | same | Worker (§9.8); hidden under the release animation |
| Release animation (stroke contracts into the staff orb) | 90 ms `in` | 110 ms | 130 ms | — | Starts instantly on pointer-up, before the result arrives |
| **Cast chip appears** | ≤ 50 ms after release, pop 140 ms `snap` | same | same | shake 3 × 40 ms | **Sub-200 ms feedback target: met** |
| Chip visible | 450 ms, fade 150 ms | 400 ms | 400 ms | 600 ms | Does not block casting |
| **Cast wind-up** (orb flare → projectile spawn) | **60 ms** | **110 ms** | **170 ms** | — | The main "faster when better" lever |
| Projectile speed | 40 m/s | 32 m/s | 25 m/s | — | At 8 m: 200 / 250 / 320 ms |
| **Release → impact (8 m target)** | **≈ 310 ms** | **≈ 410 ms** | **≈ 540 ms** | — | Perfect lands about 40% sooner than Good |
| Hit-stop (freeze target + projectile; world time scale 0.05) | 70 ms | 40 ms | 0 | — | Big spells: Spirit Bomb 120 ms, Elder 140 ms |
| Camera shake | 0.12 m, 140 ms, decaying sine 30 Hz | 0.06 m, 100 ms | none | none | Scale by the accessibility setting |
| Impact flash (target emissive white) | 1 frame full + 80 ms decay | same | 60 ms decay | — | |
| Damage number | Scale 1.4, gold if crit, rise 60 px over 900 ms, fade the last 300 ms | Scale 1.15 | Scale 1.0 | — | Pop with `snap` 120 ms |
| Enemy knockback | 0.4 m over 90 ms `out`, recover 220 ms `inout` | 0.3 m | 0.2 m | — | Bosses/dragons: 0 m, flinch only (tilt 4°) |
| Fizzle lockout | — | — | — | 250 ms | Red stroke shatter 180 ms |
| **Recovery before the next cast is accepted** | 80 ms | 120 ms | 160 ms | 250 ms | Strokes started earlier are buffered (§10.5) |

> The **effective spell rate** for a skilled player (≈ 350 ms to draw a simple glyph + recovery) is about 2 casts/s with Perfects and about 1.6 casts/s with Goods. Mana cost is the real limiter, not animation.

### 10.3 Sequencing diagram (Perfect Fire Bolt)

```
t(ms)  0        25   50       90 150      300 310 380      600
       │release │rec │chip pop│orb flare(60)│fly 200ms│hit│hit-stop 70│ recover
       stroke contracts ─────►│             │         │   │ number pops ─────► 900
```

### 10.4 Spell-specific timing overrides

| Spell | Override |
|---|---|
| Lightning Strike | No travel: spark crown 120 ms (Perfect) / 200 ms (Good), then the instant strike |
| Kamehameha Wave | Charge 400 / 500 / 600 ms by tier; beam extends in 120 ms, holds 600 ms; damage ticks every 100 ms |
| Spirit Bomb | Grow 500 / 600 / 700 ms; fall 400 ms `in` |
| Dragon's Breath | Stream 1.2 s; damage ticks every 150 ms while the target is inside the cone |
| Shield / Heal / Ward | Self-cast: wind-up 60 / 90 / 120 ms; effect appears instantly after |
| Summon spells | Circle draw 250 ms; summon emerges in 300 ms; the player can cast again during the summon animation |
| Summon Elder Dragon | Darken 300 ms → sigil 400 ms → pass 1.2 s; global cooldown 30 s |

### 10.5 Spell-spam handling

- **Input buffer:** the player may start drawing the next glyph while the previous projectile is in flight or during recovery. One stroke is buffered and executes the moment recovery ends.
- **Never discard a completed stroke silently.** If it can't fire, show the chip with the reason.
- **Overlap:** multiple projectiles can be in the air at once. Pools handle up to 8 concurrent projectiles per player.
- **Combo flourish (optional):** 3 Perfects within 2 s give a gold ring around the cursor and +10% damage for 3 s. It visually rewards rhythm.

### 10.6 Enemy and dragon reaction timing

| Event | Timing |
|---|---|
| Standard enemy telegraph | 250–400 ms (§4.2) |
| Elite telegraph | 300–600 ms |
| Dragon telegraph | 600–1200 ms (§4.4.3); ≥ 600 ms is a hard minimum so a player can finish a glyph and react |
| Enemy death dissolve | 400 ms + 30-particle burst; drops/XP orbs fly to the player in 350 ms `in` |
| Dragon stagger (from Dragon Bind or big hits) | 2.5 s grounded; wings droop 300 ms; recover with a roar 400 ms |

---

## Appendix A — Applying this guide to the current code

Gaps between the current turn-based codebase and this guide. Items marked ✅ have been applied; the rest are separate code changes still to do.

| Area | Current code | Guide says | Effort |
|---|---|---|---|
| Spawn Ghost shape | ✅ Done: Pigtail is now in `js/data.js` (`shapeRev: 2` re-teaches players who learned the square) | Pigtail (§5.3) | Done |
| Spell colors | ✅ Done: all 13 spells use the §6.2 primaries; shield visuals and enemy heal/guard effects match | Use the §6.2 table | Done |
| Dungeon pool & Warden glow | ✅ Done: `#3A6A5A` / `#7A5CFF` | `#3A6A5A` / `#7A5CFF` | Done |
| FX allocation | `models.js` FX creates new geometries and materials per effect and clones vectors per frame | Pooled instanced particles (§7.1, §9.6) | Medium — needed before real-time combat |
| Lights | Torches add point lights per area (varying counts) | Fixed light count, intensity toggling (§9.4) | Small |
| Repeated props | Individual meshes (candles, trees, bars) | `InstancedMesh` | Medium |
| Recognition | Main thread, about 20 ms per cast | Web Worker for real time (§9.8) | Medium |
| Combat model | Turn-based, async/await turn loop | Real-time loop with input buffer and cooldowns (§10) | Large — a combat rewrite |
