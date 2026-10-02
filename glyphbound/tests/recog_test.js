// Node test: recognition accuracy & score calibration on simulated human strokes.
require('../js/recognizer.js'); require('../js/data.js');
const { SPELLS, CAST_RULES } = GameData;
const R = new Recognizer(); SPELLS.forEach(s => R.add(s.id, s.points, !!s.closed));
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function humanize(points, closed, noise) {
  let pts = points.map(p => [p[0], p[1]]);
  if (closed) { const k = Math.floor(rnd() * (pts.length - 1)); const ring = pts.slice(0, -1); pts = ring.slice(k).concat(ring.slice(0, k)); pts.push(pts[0].slice()); }
  if (rnd() < 0.5) pts.reverse();
  const rot = (rnd() - 0.5) * 2 * 12 * Math.PI / 180, sx = 0.8 + rnd() * 0.45, sy = 0.8 + rnd() * 0.45;
  const ph1 = rnd() * 6, ph2 = rnd() * 6, f1 = 1 + rnd() * 2;
  return pts.map((p, i) => {
    const t = i / pts.length;
    let x = (p[0] - 0.5) * sx, y = (p[1] - 0.5) * sy;
    const xr = x * Math.cos(rot) - y * Math.sin(rot), yr = x * Math.sin(rot) + y * Math.cos(rot);
    return { x: 300 + 200 * (xr + noise * Math.sin(t * f1 * 6.28 + ph1) + noise * 0.3 * (rnd() - 0.5)),
             y: 300 + 200 * (yr + noise * Math.cos(t * f1 * 6.28 + ph2) + noise * 0.3 * (rnd() - 0.5)) };
  });
}
for (const noise of [0.0, 0.03, 0.06, 0.09]) {
  let ok = 0, total = 0, fails = {}, scores = [];
  for (const s of SPELLS) for (let i = 0; i < 25; i++) {
    const r = R.recognize(humanize(s.points, s.closed, noise)); total++;
    if (r.id === s.id) { ok++; scores.push(r.score); } else fails[s.id + '->' + r.id] = (fails[s.id + '->' + r.id] || 0) + 1;
  }
  scores.sort((a, b) => a - b);
  const pct = q => scores[Math.floor(q * (scores.length - 1))].toFixed(3);
  console.log(`noise ${noise}: acc ${(100 * ok / total).toFixed(1)}%  score p5 ${pct(0.05)} p50 ${pct(0.5)} p95 ${pct(0.95)}`, JSON.stringify(fails));
}
// scribbles
let sc = [];
for (let i = 0; i < 200; i++) { const pts = []; let x = 300, y = 300; for (let j = 0; j < 40; j++) { x += (rnd() - 0.5) * 80; y += (rnd() - 0.5) * 80; pts.push({ x, y }); } sc.push(R.recognize(pts).score); }
sc.sort((a, b) => a - b);
console.log('scribble p50', sc[100].toFixed(3), 'p90', sc[180].toFixed(3), 'max', sc[199].toFixed(3), 'above success', sc.filter(s => s >= CAST_RULES.successAt).length);
