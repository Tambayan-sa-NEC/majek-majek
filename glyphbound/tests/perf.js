// Performance checks for the real-time edition: no GPU leaks when travelling or killing waves of
// enemies, constant light count, pooled effects under heavy spell spam. Run: node tests/perf.js
const { chromium } = require('playwright'); const path = require('path');
let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) fails++; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html') + '?nolock'); await page.waitForTimeout(1200);
  await page.evaluate(() => localStorage.clear());
  await page.click('#m-new'); await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('dialogue').classList.add('hidden'); while (UI.lesson) UI.endLesson(true); GameState.player.spells = GameData.SPELLS.map(s => s.id); GameState.player.pendingLessons = []; });
  const info = () => page.evaluate(() => { const r = World.renderer.info; let lights = 0; World.scene.traverse(o => { if (o.isLight) lights++; }); return { geo: r.memory.geometries, tex: r.memory.textures, programs: r.programs.length, lights }; });
  const areas = ['great_hall', 'corridor', 'courtyard', 'forest', 'dungeon'];
  const laps = [];
  for (let lap = 0; lap < 3; lap++) {
    for (const a of areas) { await page.evaluate(a => World.travel(a, GameData.AREAS[a].spawn), a); await page.waitForTimeout(350); }
    laps.push(await info());
  }
  console.log('after each tour:', JSON.stringify(laps));
  check('no geometry/texture growth across area tours', laps[2].geo <= laps[1].geo + 2 && laps[2].tex <= laps[1].tex + 2);
  check('light count constant', laps.every(l => l.lights === laps[0].lights), 'lights ' + laps[0].lights);

  // waves: kill every enemy in the corridor, re-enter, repeat
  const waves = [];
  for (let w = 0; w < 4; w++) {
    await page.evaluate(() => World.travel('corridor', GameData.AREAS.corridor.spawn)); await page.waitForTimeout(300);
    await page.evaluate(() => Combat.entities.filter(e => e.kind === 'enemy').forEach(e => Combat.damage(e, 99999, 'fire', Combat.player)));
    await page.waitForTimeout(1800);
    waves.push((await info()).geo);
  }
  console.log('geometries after each wave:', waves.join(', '));
  check('no geometry growth from enemy waves', waves[3] <= waves[1] + 2);

  // battles: enter and leave the arena repeatedly
  const battles = [];
  for (let b = 0; b < 4; b++) {
    await page.evaluate(() => { World.travel('courtyard', GameData.AREAS.courtyard.spawn); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const e = Combat.entities.find(x => x.kind === 'enemy'); Game.enterArena(e); });
    await page.waitForTimeout(500);
    await page.evaluate(() => Game.exitArena(false));
    await page.waitForTimeout(500);
    battles.push((await info()).geo);
  }
  console.log('geometries after each battle:', battles.join(', '));
  check('no geometry growth from entering/leaving battle arenas', battles[3] <= battles[1] + 2);

  // spam: 80 player spells of every delivery type in ~4 s
  const spam = await page.evaluate(async () => {
    World.travel('courtyard', GameData.AREAS.courtyard.spawn);
    await new Promise(r => setTimeout(r, 300));
    Combat.player.mana = 1e6; Combat.player.maxMana = 1e6;
    const frames = []; let last = performance.now(), running = true;
    const tick = () => { const n = performance.now(); frames.push(n - last); last = n; if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const spells = GameData.SPELLS.filter(s => s.delivery !== 'toggle');
    const settle = async () => { const t = performance.now(); while ((Combat.projectiles.length || Combat.channels.length || Combat.zones.length || Combat.entities.some(e => e.kind === 'summon')) && performance.now() - t < 90000) await new Promise(r => setTimeout(r, 500)); };
    // warm-up: cast each spell once so shared, cached geometries (cones, rings) are created before measuring
    for (const s of spells) { Combat.castSpell(Combat.player, s, 1, 'Perfect', Player.wandTip.clone(), Player.aimDir()); await new Promise(r => setTimeout(r, 60)); }
    await settle(); await new Promise(r => setTimeout(r, 1500));
    const geo0 = World.renderer.info.memory.geometries;
    let maxProj = 0;
    for (let i = 0; i < 80; i++) {
      const s = spells[i % spells.length];
      Combat.castSpell(Combat.player, s, 1, 'Perfect', Player.wandTip.clone(), Player.aimDir());
      maxProj = Math.max(maxProj, Combat.projectiles.length);
      await new Promise(r => setTimeout(r, 50));
    }
    const t0 = performance.now();
    while ((Combat.projectiles.length || Combat.channels.length || Combat.zones.length) && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 200));
    const t1 = performance.now();   // let summons expire (game time runs slower than real time on a software GPU)
    while (Combat.entities.some(e => e.kind === 'summon') && performance.now() - t1 < 90000) await new Promise(r => setTimeout(r, 500));
    running = false;
    let lights = 0; World.scene.traverse(o => { if (o.isLight) lights++; });
    frames.sort((x, y) => x - y);
    return { maxProj, leftProj: Combat.projectiles.length, lights, geoGrowth: World.renderer.info.memory.geometries - geo0,
      summonsLeft: Combat.entities.filter(e => e.kind === 'summon' && !e.dead).length,
      orbsBusy: FX.orbs.filter(o => o.userData.busy).length, medianFrame: +frames[frames.length >> 1].toFixed(1), p95Frame: +frames[Math.floor(frames.length * 0.95)].toFixed(1) };
  });
  console.log('spell spam:', JSON.stringify(spam));
  check('spam: all projectiles finished and pooled orbs returned', spam.leftProj === 0 && spam.orbsBusy === 0);
  check('spam: light count unchanged', spam.lights === laps[0].lights);
  check('spam: no lasting geometry growth', spam.geoGrowth <= 4, 'growth ' + spam.geoGrowth);
  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log('(frame times are from a software GPU in CI; a real GPU is far faster)');
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
