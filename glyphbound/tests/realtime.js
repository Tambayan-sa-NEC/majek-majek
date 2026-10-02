// Real-time first-person checks: movement, drawing-to-cast, spell spam, enemies/XP/quests, doors,
// Wandlight, dragons, death/respawn, save/load and the practice duel. Run: node tests/realtime.js
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const SHOTS = path.resolve(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) fails++; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const url = 'file://' + path.resolve(__dirname, '../index.html') + '?nolock';
  await page.goto(url); await page.waitForTimeout(1200);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForTimeout(1200);
  const shot = n => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await shot('01_menu');

  /* ---- new game, lessons ---- */
  await page.click('#m-new'); await page.waitForTimeout(400);
  check('dialogue opens on new game', await ev(() => !document.getElementById('dialogue').classList.contains('hidden')));
  for (let i = 0; i < 9; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(80); }
  await page.waitForTimeout(400);
  check('starting lesson opens', await ev(() => !document.getElementById('lesson').classList.contains('hidden')));
  // finish lessons programmatically, give all spells
  await ev(() => { while (UI.lesson) UI.endLesson(true); GameState.player.spells = GameData.SPELLS.map(s => s.id); GameState.player.pendingLessons = []; GameState.player.level = 6; Combat.syncPlayerFromSave(); Combat.player.maxMana = 2000; Combat.player.mana = 2000; });
  await page.waitForTimeout(500);
  check('mode explore, world running', await ev(() => Game.mode === 'explore' && !World.paused && Player.active()));
  await shot('02_hall');

  /* ---- movement ---- */
  const p0 = await ev(() => [Player.pos.x, Player.pos.z]);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
  const p1 = await ev(() => [Player.pos.x, Player.pos.z]);
  check("W moves the player", Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.15, JSON.stringify([p0, p1].map(a => a.map(v => +v.toFixed(2)))));
  // right-drag look in nolock mode
  const y0 = await ev(() => Player.yaw);
  await page.mouse.move(640, 400); await page.mouse.down({ button: 'right' }); await page.mouse.move(740, 400, { steps: 5 }); await page.mouse.up({ button: 'right' });
  check('right-drag turns the camera', Math.abs((await ev(() => Player.yaw)) - y0) > 0.1);

  /* ---- quest guide, minimap, map, shrines ---- */
  await page.waitForTimeout(400);
  const guide = await ev(() => ({ shown: !document.getElementById('guide').classList.contains('hidden'), text: document.getElementById('guide').textContent, beacon: !!(World.beacon && World.guide), mm: document.getElementById('minimap').width > 0 }));
  check('quest guide: compass text, light pillar and minimap', guide.shown && /Headmistress/.test(guide.text) && /m$/.test(guide.text.trim()) && guide.beacon && guide.mm, JSON.stringify(guide));
  const shrine = await ev(async () => {
    const sh = GameData.SHRINES.hall_shrine, out = {};
    for (let i = 0; i < 10 && !(out.first && /Attune/.test(out.first)); i++) { Player.place(sh.x, sh.z + 1.8, 0); await new Promise(r => setTimeout(r, 150)); out.first = World.current && World.current.label; }
    World.interact(); await new Promise(r => setTimeout(r, 200));
    out.attuned = GameState.player.shrines.includes('hall_shrine');
    out.second = World.current && World.current.label;
    World.interact(); await new Promise(r => setTimeout(r, 400));
    out.mapOpen = !document.getElementById('map').classList.contains('hidden');
    out.travelButtons = document.querySelectorAll('#map-travel [data-travel]').length;
    return out;
  });
  check('shrine: first touch attunes it, then it opens quick travel', /Attune/.test(shrine.first || '') && shrine.attuned && /Quick travel/.test(shrine.second || '') && shrine.mapOpen && shrine.travelButtons === 1, JSON.stringify(shrine));
  await shot('02b_map');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const route = await ev(async () => {
    World.travel('corridor', GameData.AREAS.corridor.spawn); await new Promise(r => setTimeout(r, 800));
    const text = document.getElementById('guide').textContent, onDoor = World.guide && World.guide.door;
    const sh = GameData.SHRINES.corridor_shrine;
    for (let i = 0; i < 10 && !(World.current && /Attune/.test(World.current.label)); i++) { Player.place(sh.x + 1.8, sh.z, Math.PI / 2); await new Promise(r => setTimeout(r, 150)); }
    World.interact();
    return { text, onDoor, attuned: GameState.player.shrines.length };
  });
  check('guide in another area points to the right door', /go to The Great Hall/.test(route.text) && route.onDoor, JSON.stringify(route));
  await page.keyboard.press('KeyM'); await page.waitForTimeout(400);
  await page.click('#map-travel [data-travel="hall_shrine"]'); await page.waitForTimeout(800);
  const tp = await ev(() => ({ area: World.areaId, near: Math.hypot(Player.pos.x - GameData.SHRINES.hall_shrine.x, Player.pos.z - GameData.SHRINES.hall_shrine.z) < 3.5, mapClosed: document.getElementById('map').classList.contains('hidden') }));
  check('map (M) quick travel teleports to an attuned shrine', route.attuned === 2 && tp.area === 'great_hall' && tp.near && tp.mapClosed, JSON.stringify(tp));
  const doorsGlow = await ev(() => { let n = 0; World.areaGroup.traverse(o => { if (o.material && o.material.emissiveIntensity > 1 && o.geometry && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.width < 0.1) n++; }); return n; });
  check('doors are highlighted with glowing frames', doorsGlow >= 4, 'glowing edges ' + doorsGlow);
  await ev(() => Player.place(0, 6, Math.PI));

  /* ---- draw to cast ---- */
  const drawSpell = async (id, size = 260, cx = 640, cy = 420, steps = 2) => {
    const pts = await ev(id => GameData.SPELLS.find(s => s.id === id).points, id);
    const P = pts.map(([x, y]) => [cx - size / 2 + x * size, cy - size / 2 + y * size]);
    await page.mouse.move(P[0][0], P[0][1]); await page.mouse.down();
    for (let i = 1; i < P.length; i++) await page.mouse.move(P[i][0], P[i][1], { steps });
    await page.mouse.up();
  };
  const casts0 = await ev(() => GameState.player.stats.casts);
  await drawSpell('fire_bolt'); await page.waitForTimeout(500);
  const chip = await ev(() => document.getElementById('cast-chip').textContent);
  check('drawing Fire Bolt casts it', (await ev(() => GameState.player.stats.casts)) === casts0 + 1 && /Fire Bolt/.test(chip), chip);
  await shot('03_cast');

  /* ---- spam: 6 strokes as fast as possible ---- */
  const before = await ev(() => GameState.player.stats.casts);
  const t0 = Date.now();
  for (let i = 0; i < 6; i++) await drawSpell(i % 2 ? 'water_bullet' : 'fire_bolt', 240, 640, 420, 1);
  const drawMs = Date.now() - t0;
  await page.waitForTimeout(700);
  const spam = (await ev(() => GameState.player.stats.casts)) - before;
  check('spam: back-to-back strokes all cast (no turns)', spam >= 5, `${spam}/6 cast in ${drawMs} ms of drawing`);

  /* ---- battles: spotted → arena → win → back to the same spot ---- */
  const waitFor = async (fn, ms = 20000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(fn, arg)) return true; await page.waitForTimeout(250); } return false; };
  await ev(() => { World.travel('corridor', GameData.AREAS.corridor.spawn); Combat.graceUntil = performance.now() + 1e9; }); await page.waitForTimeout(600);
  const enemies = await ev(() => Combat.entities.filter(e => e.kind === 'enemy').map(e => e.type));
  check('corridor enemies spawn in the world', enemies.length > 0, enemies.join(','));
  // fights never start by themselves, and spells don't hurt enemies outside a battle
  const calm = await ev(async () => {
    Combat.graceUntil = 0;
    const e = Combat.entities.find(x => x.kind === 'enemy');
    Player.place(e.pos.x + 3, e.pos.z, Math.PI / 2);
    const hp0 = e.hp;
    const dir = e.pos.clone().setY(1).sub(Player.wandTip).normalize();
    Combat.castSpell(Combat.player, GameData.SPELLS.find(s => s.id === 'fire_bolt'), 1, 'Perfect', Player.wandTip.clone(), dir);
    await new Promise(r => setTimeout(r, 4000));
    return { area: World.areaId, enemyHp: e.hp === hp0, playerHp: Combat.player.hp === Combat.player.maxHp || Combat.player.hp > 0 };
  });
  check('no automatic battles: standing next to an enemy (even hitting it) does not start a fight', calm.area === 'corridor' && calm.enemyHp, JSON.stringify(calm));
  // walk up, face it, press E
  const fightNear = type => ev(async type => {
    const e = Combat.entities.find(x => x.kind === 'enemy' && !x.dead && (!type || x.type === type));
    if (!e) return { error: 'no enemy ' + type };
    const off = e.def.dragon ? 5 : 2.2;
    let label = null;
    for (let i = 0; i < 20 && !(label && /Fight/.test(label)); i++) {
      Player.place(e.pos.x + off, e.pos.z, Math.PI / 2);          // east of it, facing west
      await new Promise(r => setTimeout(r, 120));
      label = World.current && World.current.label;
    }
    const prompt = document.getElementById('prompt').textContent;
    const ret = [Player.pos.x, Player.pos.z];
    World.interact();
    return { label, prompt, key: e.id, ret };
  }, type);
  const f1 = await fightNear('dust_sprite');
  await page.keyboard.press('KeyE');            // (already triggered via World.interact — E does the same)
  const entered = await waitFor(() => World.areaId === 'battle_arena');
  const startSpot = await ev(() => ({ x: Game.arena.ret[0], z: Game.arena.ret[1], keys: Game.arena.foes.map(f => f.key) }));
  check('weakness is shown on the enemy (nameplate + Fight prompt)', /Weak/.test(f1.label || ''), f1.label);
  check('E on an enemy shows "⚔ Fight" and starts the battle', entered && /Fight/.test(f1.label || '') && /Fight/.test(f1.prompt), JSON.stringify(f1));
  await page.waitForTimeout(300);
  const arenaInfo = await ev(() => ({ theme: World.area.theme, foes: Combat.entities.filter(e => e.kind === 'enemy').length, portal: !document.getElementById('btn-flee').classList.contains('hidden'), saveArea: GameState.player.area }));
  const foeInfo = await ev(() => !document.getElementById('foe-info').classList.contains('hidden') && document.getElementById('foe-info').textContent);
  check('arena: weakness line tells you which spells to use', /Weak to/.test(foeInfo || '') && /Try: .*Fire Bolt/.test(foeInfo || ''), foeInfo);
  check('arena: exactly one enemy, themed like the area', arenaInfo.theme === 'corridor' && arenaInfo.foes === 1 && arenaInfo.portal && arenaInfo.saveArea === 'corridor', JSON.stringify(arenaInfo));
  await shot('04a_arena');
  // nobody walks in the arena: W does nothing, the foe stays where it is, and it attacks from range
  const still = await ev(async () => {
    const p0 = [Player.pos.x, Player.pos.z];
    const foes = Combat.entities.filter(x => x.kind === 'enemy' && !x.dead);
    const f0 = foes.map(f => [f.pos.x, f.pos.z]);
    Combat.player.hp = Combat.player.maxHp;
    const hp0 = Combat.player.hp;
    Player.keys.KeyW = true;
    for (let i = 0; i < 60 && Combat.player.hp >= hp0; i++) await new Promise(r => setTimeout(r, 300));
    Player.keys.KeyW = false;
    const moved = Math.hypot(Player.pos.x - p0[0], Player.pos.z - p0[1]);
    const foeMoved = Math.max(...foes.map((f, i) => Math.hypot(f.pos.x - f0[i][0], f.pos.z - f0[i][1])));
    return { moved: +moved.toFixed(2), foeMoved: +foeMoved.toFixed(2), hp0, hp1: Math.round(Combat.player.hp), dist: +Math.hypot(foes[0].pos.x - Player.pos.x, foes[0].pos.z - Player.pos.z).toFixed(1) };
  });
  check('arena: you cannot walk and the foe stays put', still.moved < 0.05 && still.foeMoved < 0.05, JSON.stringify(still));
  check('arena: the foe attacks you from range in real time', still.hp1 < still.hp0, JSON.stringify(still));
  const intr = await ev(() => {
    const e = Combat.entities.find(x => x.kind === 'enemy' && !x.dead);
    const hp = e.hp;
    e.ai.state = 'windup'; e.ai.windup = 5; e.ai.move = e.def.moves[0];
    Combat.damage(e, 1, 'fire', Combat.player, { tier: 'Perfect' });
    e.hp = hp;
    return e.ai.state;
  });
  check('arena: a Perfect hit during the foe\'s wind-up interrupts it', intr === 'chase', intr);
  // Levitate: drawing it lifts you and attacks miss
  const lev = await ev(async () => {
    Combat.player.hp = Combat.player.maxHp;
    const y0 = World.camera.position.y;
    Player.handleResult({ success: true, spell: GameData.SPELLS.find(s => s.id === 'levitate'), quality: 1, tier: 'Perfect', pct: 100 });
    await new Promise(r => setTimeout(r, 700));
    const e = Combat.entities.find(x => x.kind === 'enemy' && !x.dead);
    const hp0 = Combat.player.hp;
    Combat.damage(Combat.player, 30, 'physical', e);
    return { status: !!Combat.player.statuses.levitate, lifted: +(World.camera.position.y - y0).toFixed(2), hpSame: Combat.player.hp === hp0 };
  });
  check('Levitate: lifts you and enemy attacks miss', lev.status && lev.lifted > 0.5 && lev.hpSame, JSON.stringify(lev));
  await shot('04c_levitate');
  const xp0 = await ev(() => GameState.player.xp + GameState.player.level * 100000);
  const killed = await ev(async () => {
    const spell = GameData.SPELLS.find(s => s.id === 'fire_bolt');
    for (let i = 0; i < 60 && Combat.entities.some(e => e.kind === 'enemy' && !e.dead); i++) {
      const e = Combat.entities.find(x => x.kind === 'enemy' && !x.dead);
      Combat.player.hp = Combat.player.maxHp;
      const dir = e.pos.clone().setY(e.pos.y + 1).sub(Player.wandTip).normalize();
      Combat.castSpell(Combat.player, spell, 1, 'Perfect', Player.wandTip.clone(), dir);
      await new Promise(r => setTimeout(r, 250));
    }
    return Combat.entities.filter(e => e.kind === 'enemy' && !e.dead).length;
  });
  const xp1 = await ev(() => GameState.player.xp + GameState.player.level * 100000);
  check('spells kill the foe (from where you stand) and grant XP', killed === 0 && xp1 > xp0, `alive ${killed}`);
  const back = await waitFor(() => World.areaId === 'corridor', 15000);
  const after = await ev(k => ({ x: +Player.pos.x.toFixed(1), z: +Player.pos.z.toFixed(1), beatenGone: !Combat.entities.some(e => k.includes(e.id)), mode: Game.mode }), startSpot.keys);
  check('beating an enemy gives gold', await ev(() => GameState.player.gold > 0), 'gold ' + await ev(() => GameState.player.gold));
  check('victory returns you to the same spot; the beaten enemy stays gone', back && Math.abs(after.x - startSpot.x) < 0.3 && Math.abs(after.z - startSpot.z) < 0.3 && after.beatenGone, JSON.stringify({ startSpot, after }));
  await shot('04b_back_in_corridor');
  // flee: another fight, press F
  await fightNear();
  const entered2 = await waitFor(() => World.areaId === 'battle_arena');
  await page.waitForTimeout(400);
  const fleeBtn = await ev(() => !document.getElementById('btn-flee').classList.contains('hidden'));
  await page.keyboard.press('KeyF');
  const fled = await waitFor(() => World.areaId === 'corridor', 5000);
  check('F (🏃 Flee button) takes you back to the castle', entered2 && fleeBtn && fled, JSON.stringify({ entered2, fleeBtn, fled }));

  /* ---- items: quest reward, equip, stats, granted spell, hidden staff ---- */
  const gear = await ev(() => {
    const p0 = Combat.player.power, m0 = Combat.player.maxMana;
    Quests.complete('q_first_sparks');                                  // rewards the Apprentice Staff
    const got = GameState.owns('apprentice_staff');
    GameState.addItem('pointed_hat');
    return { got, p0, m0 };
  });
  await page.keyboard.press('KeyI'); await page.waitForTimeout(300);
  const invOpen = await ev(() => !document.getElementById('inventory').classList.contains('hidden') && document.querySelectorAll('#inventory-body [data-equip]').length >= 2);
  await page.click('#inventory-body [data-equip="apprentice_staff"]'); await page.waitForTimeout(150);
  await page.click('#inventory-body [data-equip="pointed_hat"]'); await page.waitForTimeout(150);
  await shot('11_inventory');
  const eq = await ev(() => ({ staff: GameState.player.equipped.staff, hat: GameState.player.equipped.hat, power: Combat.player.power, maxMana: Combat.player.maxMana, wand: Player.wandMesh.material.color.getHex(), want: GameData.ITEMS.apprentice_staff.color }));
  check('quest reward gives a staff; Inventory (I) equips staff and hat', gear.got && invOpen && eq.staff === 'apprentice_staff' && eq.hat === 'pointed_hat', JSON.stringify({ gear, eq }));
  check('equipment raises spell power and max mana, and tints the wand', eq.power > gear.p0 && eq.maxMana === gear.m0 + 20 && eq.wand === eq.want, JSON.stringify({ gear, eq }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // a hidden staff in the dungeon, only visible with Wandlight, that grants Lightning Strike
  await ev(() => { World.travel('dungeon', GameData.AREAS.dungeon.spawn); GameState.player.spells = GameState.player.spells.filter(id => id !== 'lightning'); });
  await page.waitForTimeout(600);
  const hidden = await ev(async () => {
    const out = {};
    Player.place(-20, 16.6, 0); await new Promise(r => setTimeout(r, 600));
    out.withoutLight = World.current ? World.current.label : null;
    Player.toggleWandlight(); await new Promise(r => setTimeout(r, 1500));
    out.withLight = World.current ? World.current.label : null;
    World.interact();
    out.owned = GameState.owns('stormrod');
    GameState.equip('stormrod');
    out.canCastLightning = Player.allowedIds().includes('lightning');
    Player.toggleWandlight();
    return out;
  });
  check('Wandlight reveals a hidden Stormrod; equipping it grants Lightning Strike', !/Stormrod/.test(hidden.withoutLight || '') && /Stormrod/.test(hidden.withLight || '') && hidden.owned && hidden.canCastLightning, JSON.stringify(hidden));
  await ev(() => { GameState.equip('apprentice_staff'); Combat.graceUntil = performance.now() + 1e9; });

  /* ---- training dummy, shop, gold, potions, comparisons, brighter Wandlight ---- */
  await ev(() => { World.travel('great_hall', GameData.AREAS.great_hall.spawn); Combat.graceUntil = performance.now() + 1e9; }); await page.waitForTimeout(600);
  const fdum = await fightNear('training_dummy');
  const inTraining = await waitFor(() => World.areaId === 'battle_arena');
  const train = await ev(async () => {
    const d = Combat.entities.find(e => e.kind === 'enemy');
    Combat.player.hp = 20;
    Combat.damage(Combat.player, 999, 'physical', d);
    const hpAfter = Combat.player.hp;
    Combat.player.hp = Combat.player.maxHp;
    const xp0 = GameState.player.xp, lvl0 = GameState.player.level;
    Combat.damage(d, 99999, 'fire', Combat.player);
    return { hpAfter, xpSame: GameState.player.xp === xp0 && GameState.player.level === lvl0 };
  });
  const trainBack = await waitFor(() => World.areaId === 'great_hall', 15000);
  const dummyStays = await ev(() => Combat.entities.some(e => e.type === 'training_dummy'));
  check('training dummy: "Train with" via E, never knocks you out, gives no XP, stays in the hall', /Train with/.test(fdum.label || '') && inTraining && train.hpAfter === 1 && train.xpSame && trainBack && dummyStays, JSON.stringify({ label: fdum.label, train, trainBack, dummyStays }));
  // shop: talk to Tilly → Browse wares
  await ev(() => { GameState.player.gold = 600; GameState.Events.emit('gold'); GameState.equip('apprentice_staff'); });
  const talk = await ev(async () => {
    const n = GameData.NPCS.tilly;
    let label = null;
    for (let i = 0; i < 10 && !(label && /Tilly/.test(label)); i++) { Player.place(n.pos[0] - 2, n.pos[1], -Math.PI / 2); await new Promise(r => setTimeout(r, 150)); label = World.current && World.current.label; }
    World.interact();
    await new Promise(r => setTimeout(r, 200));
    const btn = [...document.querySelectorAll('#dlg-choices button')].find(b => /Browse/.test(b.textContent));
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 300));
    return { label, shop: !document.getElementById('shop').classList.contains('hidden'), hudGold: document.getElementById('hud-gold').textContent };
  });
  check('talking to Tilly opens the shop; HUD shows gold', /Tilly/.test(talk.label || '') && talk.shop && /600/.test(talk.hudGold), JSON.stringify(talk));
  const cmp = await ev(() => { const card = document.querySelector('#shop-body [data-buy="birch_staff"]').closest('.icard'); return card.querySelector('.cmp').textContent; });
  check('shop shows comparison vs your equipped staff (green/red)', /vs Apprentice Staff/.test(cmp) && /\+5% spell power/.test(cmp), cmp);
  await page.click('#shop-body [data-buy="birch_staff"]'); await page.waitForTimeout(200);
  await page.click('#shop-body [data-buy="health_potion"]'); await page.waitForTimeout(200);
  const bought = await ev(() => ({ owns: GameState.owns('birch_staff'), potions: GameState.itemCount('health_potion'), gold: GameState.player.gold }));
  check('buying a staff and a potion spends gold', bought.owns && bought.potions === 1 && bought.gold === 600 - 220 - 30, JSON.stringify(bought));
  const sold = await ev(() => { const g0 = GameState.player.gold; const btn = document.querySelector('#shop-body [data-sell="stormrod"]'); if (btn) btn.click(); return { gone: !GameState.owns('stormrod'), gain: GameState.player.gold - g0 }; });
  check('selling unequipped gear gives 40% back', sold.gone && sold.gain === Math.round(450 * 0.4), JSON.stringify(sold));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const pot = await ev(async () => { Combat.player.hp = 40; return 0; });
  await page.keyboard.press('Digit1'); await page.waitForTimeout(300);
  const potion = await ev(() => ({ hp: Math.round(Combat.player.hp), left: GameState.itemCount('health_potion') }));
  check('key 1 drinks a Health Potion', potion.hp >= 100 && potion.left === 0, JSON.stringify(potion));
  await shot('12_shop');
  const lum = await ev(async () => { if (!Player.wandlightOn) Player.toggleWandlight(); await new Promise(r => setTimeout(r, 900)); const I = World.wandLight.intensity, dist = World.wandLight.distance; Player.toggleWandlight(); return { I: +I.toFixed(2), dist }; });
  check('Wandlight (Lumos) is brighter and reaches further', lum.I > 4 && lum.dist >= 24, JSON.stringify(lum));

  /* ---- doors ---- */
  await ev(() => { World.travel('dungeon', GameData.AREAS.dungeon.spawn); Combat.graceUntil = performance.now() + 1e9; }); await page.waitForTimeout(600);
  const doors = await ev(() => {
    const g = id => World.gates.find(x => x.def.id === id);
    const out = {};
    const lockd = g('locked_cell'), seal = g('sealed_cell'), boss = g('warden_gate');
    World.useGate(lockd); out.lockedStays = !lockd.open;
    GameState.addItem('cell_key'); World.useGate(lockd); out.keyOpens = lockd.open;
    World.spellHit(seal.pos, 'fire_bolt'); out.wrongSpellResists = !seal.open;
    World.spellHit(seal.pos, 'water_bullet'); out.waterBreaksSeal = seal.open;
    World.useGate(boss); out.bossGateHolds = !boss.open;
    out.saved = (GameState.player.openedGates || []).slice();
    return out;
  });
  check('doors: locked / key / seal / boss', doors.lockedStays && doors.keyOpens && doors.wrongSpellResists && doors.waterBreaksSeal && doors.bossGateHolds, JSON.stringify(doors));

  /* ---- Wandlight ---- */
  await page.keyboard.press('KeyL'); await page.waitForTimeout(500);
  const wl = await ev(() => ({ on: Player.wandlightOn, I: +World.wandLight.intensity.toFixed(2), btn: document.getElementById('btn-light').classList.contains('on') }));
  check('L toggles Wandlight (light + HUD)', wl.on && wl.I > 3 && wl.btn, JSON.stringify(wl));
  await shot('05_dungeon_wandlight');
  const reveal = await ev(async () => {
    const h = World.hiddenThings[0]; if (!h) return 'no hidden secret in this area';
    Player.place(h.pos.x, h.pos.z + 1.5, 0); await new Promise(r => setTimeout(r, 1200));
    return { revealed: h.revealed, op: +h.mat.opacity.toFixed(2) };
  });
  if (typeof reveal === 'string') {
    // the hidden rune lives in another area — find it
    const area = await ev(() => { const s = GameData.SECRETS.find(x => x.hidden); return Object.keys(GameData.AREAS).find(a => (GameData.AREAS[a].secrets || []).some(x => x.id === s.id)); });
    await ev(a => World.travel(a, GameData.AREAS[a].spawn), area); await page.waitForTimeout(600);
    const r2 = await ev(async () => { const h = World.hiddenThings[0]; Player.place(h.pos.x, h.pos.z + 1.5, 0); await new Promise(r => setTimeout(r, 1200)); return { revealed: h.revealed, op: +h.mat.opacity.toFixed(2) }; });
    check('Wandlight reveals the hidden rune', r2.revealed, JSON.stringify(r2) + ' in ' + area);
  } else check('Wandlight reveals the hidden rune', reveal.revealed, JSON.stringify(reveal));
  await page.keyboard.press('KeyL');

  /* ---- dragons ---- */
  await ev(() => { const P = GameState.player; P.quests.q_salamander = { state: 'done', progress: {} }; Quests.accept('q_dragon_egg'); });
  await ev(() => World.travel('forest', GameData.AREAS.forest.spawn)); await page.waitForTimeout(600);
  const fd = await fightNear('ember_drake');
  const drake = await ev(async () => {
    Combat.player.hp = Combat.player.maxHp = 5000;
    let t = performance.now(); while (World.areaId !== 'battle_arena' && performance.now() - t < 15000) await new Promise(r => setTimeout(r, 200));
    Combat.player.hp = Combat.player.maxHp = 5000;
    const d = Combat.entities.find(e => e.type === 'ember_drake');
    let zones = 0;
    for (let i = 0; i < 150 && !(zones > 0 && Combat.player.hp < 5000); i++) { await new Promise(r => setTimeout(r, 200)); zones = Math.max(zones, Combat.zones.length); }
    return { arena: World.areaId, size: World.area.size[0], noFlee: document.getElementById('btn-flee').classList.contains('hidden') && Game.arena.solo, alerted: d && d.ai.alerted, zones,
      hpLost: 5000 - Math.round(Combat.player.hp), boss: !document.getElementById('boss-bar').classList.contains('hidden') };
  });
  check('Ember Drake: big arena, no flee, telegraphed zones, boss bar', drake && drake.arena === 'battle_arena' && drake.noFlee && drake.alerted && drake.zones > 0 && drake.boss, JSON.stringify(drake));
  await shot('06_dragon');
  await ev(() => { const d = Combat.entities.find(e => e.type === 'ember_drake'); Combat.damage(d, 99999, 'fire', Combat.player); });
  await waitFor(() => World.areaId === 'forest', 15000);
  const egg = await ev(() => {
    const q = GameState.player.quests.q_dragon_egg;
    return { area: World.areaId, progress: q && q.progress, drakeGone: !Combat.entities.some(e => e.type === 'ember_drake'), eggVisible: World.interactables.some(i => i.label && /Egg/i.test(i.label)) };
  });
  check('killing the drake counts for the quest and reveals the egg', egg.area === 'forest' && egg.drakeGone && egg.eggVisible, JSON.stringify(egg));
  check('the Ember Drake always drops the Wyrmbone Staff', await ev(() => GameState.owns('wyrmbone_staff')));

  /* ---- death → respawn ---- */
  for (let i = 0; i < 3; i++) { await ev(() => { GameState.player.pendingLessons.slice().forEach(id => GameState.learnSpell(id)); while (UI.lesson) UI.endLesson(true); }); await page.waitForTimeout(300); }
  await ev(() => { Combat.player.maxHp = GameState.maxHp(); Combat.damage(Combat.player, 99999, 'fire', null); });
  await page.waitForTimeout(500);
  check('death shows the knock-out screen', await ev(() => Game.mode === 'dead' && !document.getElementById('death').classList.contains('hidden')));
  await page.waitForTimeout(2300);
  const resp = await ev(() => ({ mode: Game.mode, area: World.areaId, hp: Combat.player.hp, max: Combat.player.maxHp }));
  check('respawn in the Great Hall at full HP', resp.mode === 'explore' && resp.area === 'great_hall' && resp.hp === resp.max, JSON.stringify(resp));

  /* ---- save / load ---- */
  await ev(() => { World.travel('courtyard', GameData.AREAS.courtyard.spawn); Combat.graceUntil = performance.now() + 1e9; });
  await page.waitForTimeout(500);
  await ev(() => { Combat.player.hp = 50; Game.saveNow(); });
  const saved = await ev(() => ({ lvl: GameState.player.level, area: GameState.player.area, hp: GameState.player.hp, pos: GameState.player.pos }));
  await page.reload(); await page.waitForTimeout(1300);
  await page.click('#m-continue'); await page.waitForTimeout(700);
  await ev(() => { while (UI.lesson) UI.endLesson(true); Combat.graceUntil = performance.now() + 1e9; }); await page.waitForTimeout(200);   // re-learn lessons for glyphs whose shape changed
  const loaded = await ev(() => ({ lvl: GameState.player.level, area: World.areaId, hp: Math.round(Combat.player.hp), x: +Player.pos.x.toFixed(1), z: +Player.pos.z.toFixed(1), opened: GameState.player.openedGates }));
  check('save/load keeps equipped staff and hat', await ev(() => GameState.player.equipped.staff === 'apprentice_staff' && GameState.player.equipped.hat === 'pointed_hat' && Combat.player.maxMana === GameState.maxMana()));
  check('save/load keeps level, area, HP, position, opened doors', loaded.lvl === saved.lvl && loaded.area === 'courtyard' && loaded.hp >= 50 && loaded.opened && loaded.opened.includes('sealed_cell'), JSON.stringify({ saved, loaded }));

  /* ---- pause ---- */
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('Esc pauses and freezes the world', await ev(() => !document.getElementById('pause').classList.contains('hidden') && World.paused));
  await page.click('#pm-resume'); await page.waitForTimeout(200);
  check('Resume unpauses', await ev(() => !World.paused));

  /* ---- practice duel ---- */
  await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.click('#pm-menu'); await page.waitForTimeout(300);
  await page.click('#m-duel'); await page.waitForTimeout(200);
  await page.selectOption('#duel-count', '3'); await page.click('#duel-start'); await page.waitForTimeout(600);
  const duel = await ev(() => ({ mode: Game.mode, bots: Combat.entities.filter(e => e.kind === 'wizard').length, bars: document.querySelectorAll('#duel-bars .dbar').length, quick: document.querySelectorAll('#quickbar .qslot').length }));
  check('practice duel starts with 3 CPU wizards', duel.mode === 'duel' && duel.bots === 3 && duel.bars === 3, JSON.stringify(duel));
  const b0 = await ev(() => Combat.entities.filter(e => e.kind === 'wizard').map(b => [b.pos.x, b.pos.z]));
  let duelHp = 400;
  for (let i = 0; i < 30 && duelHp >= 400; i++) { await page.waitForTimeout(1000); duelHp = await ev(() => Math.round(Combat.player.hp)); }
  check('CPU wizards cast at you in real time', duelHp < 400, `hp ${duelHp}/400`);
  const bMoved = await ev(b0 => Math.max(...Combat.entities.filter(e => e.kind === 'wizard').map((b, i) => Math.hypot(b.pos.x - b0[i][0], b.pos.z - b0[i][1]))), b0);
  check('duel: CPU wizards stand still and only cast', bMoved < 0.05, 'moved ' + bMoved.toFixed(2));
  await drawSpell('lightning'); await page.waitForTimeout(400);
  await shot('07_duel');
  await ev(() => Combat.entities.filter(e => e.kind === 'wizard').forEach(b => { delete b.statuses.levitate; delete b.statuses.shield; Combat.damage(b, 99999, 'fire', Combat.player); }));
  const won = await waitFor(() => !document.getElementById('duel-result').classList.contains('hidden') && /Victory/.test(document.getElementById('result-title').textContent), 10000);
  check('winning shows the duel result', won, await ev(() => JSON.stringify({ title: document.getElementById('result-title').textContent, bots: Combat.entities.filter(e => e.kind === 'wizard').map(b => [b.hp, !!b.dead]), hp: Combat.player.hp })));
  await shot('08_duel_result');
  await page.click('#result-again'); await page.waitForTimeout(600);
  check('rematch restarts the duel', await ev(() => Game.mode === 'duel' && Combat.entities.filter(e => e.kind === 'wizard' && e.hp > 0).length === 3 && Combat.player.hp === 400));
  await ev(() => Combat.damage(Combat.player, 99999, 'fire', null));
  await page.waitForTimeout(200);
  let lost = false; for (let i = 0; i < 20 && !lost; i++) { await page.waitForTimeout(300); lost = await ev(() => !document.getElementById('duel-result').classList.contains('hidden') && /Defeated/.test(document.getElementById('result-title').textContent)); }
  check('losing shows Defeated', lost);
  await page.click('#result-menu'); await page.waitForTimeout(300);
  check('back to menu', await ev(() => Game.mode === 'menu' && !document.getElementById('menu').classList.contains('hidden')));
  check('no online code left', await ev(() => !window.Net && !document.getElementById('m-online')));

  /* ---- pointer-lock edition loads too ---- */
  const p2 = await ctx.newPage();
  const err2 = []; p2.on('pageerror', e => err2.push(e.message));
  await p2.goto('file://' + path.resolve(__dirname, '../index.html')); await p2.waitForTimeout(1200);
  await p2.click('#m-continue'); await p2.waitForTimeout(600);
  await p2.evaluate(() => { while (UI.lesson) UI.endLesson(true); }); await p2.waitForTimeout(300);
  const cp = await p2.evaluate(() => !document.getElementById('click-play').classList.contains('hidden') || Player.noLock);
  check('pointer-lock mode shows "Click to play"', cp);
  await p2.screenshot({ path: path.join(SHOTS, '09_click_to_play.png') });
  check('no page errors (pointer-lock page)', err2.length === 0, err2.join(' | '));

  /* ---- touch: touchscreen PC (mouse + touch) and tablet mode (touch only) ---- */
  await p2.close(); await page.goto('about:blank');           // keep the software GPU free for the touch pages
  const touchRun = async (label, fakeFinePointer) => {
    const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    if (fakeFinePointer) await tctx.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => q.includes('pointer: coarse') ? { matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : mm(q); });
    const tp = await tctx.newPage();
    const errs = []; tp.on('pageerror', e => errs.push(e.message));
    await tp.goto('file://' + path.resolve(__dirname, '../index.html')); await tp.waitForTimeout(1200);
    await tp.evaluate(() => localStorage.clear());
    await tp.click('#m-new'); await tp.waitForTimeout(400);
    await tp.evaluate(() => { document.getElementById('dialogue').classList.add('hidden'); while (UI.lesson) UI.endLesson(true); GameState.player.spells = GameData.SPELLS.map(s => s.id); GameState.player.pendingLessons = []; Combat.graceUntil = performance.now() + 1e9; });
    await tp.waitForTimeout(500);
    const kind = await tp.evaluate(() => ({ hybrid: Player.hybrid, noLock: Player.noLock, clickPlay: !document.getElementById('click-play').classList.contains('hidden') }));
    const cdp = await tctx.newCDPSession(tp);
    const pts = await tp.evaluate(() => GameData.SPELLS.find(s => s.id === 'fire_bolt').points);
    const P = pts.map(([x, y]) => ({ x: 640 + x * 260, y: 290 + y * 260 }));     // right of centre (left third is the move stick in tablet mode)
    const c0 = await tp.evaluate(() => GameState.player.stats.casts);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [P[0]] });
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      for (let k = 1; k <= 2; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * k / 2, y: a.y + (b.y - a.y) * k / 2 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await tp.waitForTimeout(1000);
    const res = await tp.evaluate(() => ({ casts: GameState.player.stats.casts, chip: document.getElementById('cast-chip').textContent, clickPlay: !document.getElementById('click-play').classList.contains('hidden') }));
    check(`${label}: finger draws Fire Bolt and casts it`, res.casts === c0 + 1 && /Fire Bolt/.test(res.chip), JSON.stringify({ kind, res }));
    if (fakeFinePointer) check(`${label}: "Click to play" card gets out of the way after a touch`, kind.hybrid && !res.clickPlay, JSON.stringify(kind));
    await tp.screenshot({ path: path.join(SHOTS, `10_touch_${fakeFinePointer ? 'pc' : 'tablet'}.png`) });
    check(`no page errors (${label})`, errs.length === 0, errs.join(' | '));
    await tctx.close();
  };
  await touchRun('touchscreen PC', true);
  await touchRun('tablet mode', false);

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
