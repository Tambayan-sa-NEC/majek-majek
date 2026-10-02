// Recognition worker: same results as the main thread, works from file:// and http://, falls back safely.
const { chromium } = require('playwright'); const path = require('path'); const http = require('http'); const fs = require('fs');
(async () => {
  // tiny static file server (test only) to check the worker over http:// too
  const root = path.resolve(__dirname, '..');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const srv = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(8131);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const url of ['file://' + path.resolve(__dirname, '../index.html'), 'http://localhost:8131/']) {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url); await page.waitForTimeout(1000);
    const r = await page.evaluate(async () => {
      const out = { same: 0, diff: [], n: 0 };
      for (const s of GameData.SPELLS) for (let k = 0; k < 3; k++) {
        const pts = s.points.map(([x, y]) => ({ x: 100 + x * 220 + (Math.random() - .5) * 8, y: 100 + y * 220 + (Math.random() - .5) * 8 }));
        const a = SpellCaster.evaluate(pts), b = await SpellCaster.evaluateAsync(pts);
        out.n++;
        if (a.spell.id === b.spell.id && Math.abs(a.score - b.score) < 1e-9 && a.tier === b.tier) out.same++; else out.diff.push([a.spell.id, b.spell.id, a.score, b.score]);
      }
      // main-thread blocking: how long does the page freeze per recognition?
      const pts = GameData.SPELLS[2].points.map(([x, y]) => ({ x: x * 200, y: y * 200 }));
      let t0 = performance.now(); SpellCaster.evaluate(pts); const syncMs = performance.now() - t0;
      t0 = performance.now(); const p = SpellCaster.evaluateAsync(pts); const asyncBlockMs = performance.now() - t0; const res = await p; const asyncTotalMs = performance.now() - t0;
      // too-small stroke returns null on both paths
      const tiny = [{ x: 0, y: 0 }, { x: 3, y: 3 }, { x: 5, y: 1 }, { x: 6, y: 6 }, { x: 8, y: 2 }, { x: 9, y: 9 }];
      const nullOk = SpellCaster.evaluate(tiny) === null && (await SpellCaster.evaluateAsync(tiny)) === null;
      return { ...out, workerActive: !!RecWorker.worker && !RecWorker.broken, syncMs: +syncMs.toFixed(1), asyncBlockMs: +asyncBlockMs.toFixed(2), asyncTotalMs: +asyncTotalMs.toFixed(1), resultOk: res.spell.id === GameData.SPELLS[2].id, nullOk };
    });
    console.log(url.startsWith('file') ? 'file://' : 'http://', JSON.stringify(r), 'errors:', errors.length ? errors : 'none');
    await page.close();
  }
  // forced fallback: break Worker and confirm evaluateAsync still works
  const page = await browser.newPage();
  await page.addInitScript(() => { window.Worker = function () { throw new Error('blocked'); }; });
  await page.goto('file://' + path.resolve(__dirname, '../index.html')); await page.waitForTimeout(800);
  console.log('fallback when Worker is blocked:', JSON.stringify(await page.evaluate(async () => { const r = await SpellCaster.evaluateAsync(GameData.SPELLS[0].points.map(([x, y]) => ({ x: x * 200, y: y * 200 }))); return { spell: r.spell.id, tier: r.tier, workerBroken: RecWorker.broken }; })));
  await browser.close(); srv.close();
})();
