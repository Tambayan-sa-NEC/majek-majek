/* =====================================================================
 * recognizer.js — SPELL DRAWING RECOGNITION
 * ---------------------------------------------------------------------
 *  ShapeKit   : tiny helpers to describe spell shapes as point paths
 *  Recognizer : a $1-style unistroke matcher (Wobbrock et al. 2007),
 *               tuned to be forgiving:
 *                 - accepts strokes drawn in either direction
 *                 - closed shapes (circle, star...) can start anywhere
 *                 - small rotations (+/-20 deg) are searched
 *                 - compares both uniform and stretched scaling, so
 *                   lines and squashed shapes still match
 * All coordinates use screen orientation (y grows downward).
 * ===================================================================== */
// Named module function so drawing.js can also start it inside a Web Worker (via toString()).
function GlyphRecognizerModule(global) {
  'use strict';

  /* ---------------------------- ShapeKit ---------------------------- */
  const ShapeKit = {
    /** Straight segments through the given [x,y] corners. */
    poly(corners) {
      const out = [];
      for (let i = 0; i < corners.length - 1; i++) {
        const [x1, y1] = corners[i], [x2, y2] = corners[i + 1];
        for (let t = 0; t < 1; t += 0.05) out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      }
      out.push(corners[corners.length - 1].slice());
      return out;
    },
    /** Arc around (cx,cy). Angles in degrees, counter-clockwise as seen on screen. */
    arc(cx, cy, r, fromDeg, toDeg, steps = 32) {
      const out = [];
      for (let i = 0; i <= steps; i++) {
        const a = (fromDeg + (toDeg - fromDeg) * (i / steps)) * Math.PI / 180;
        out.push([cx + r * Math.cos(a), cy - r * Math.sin(a)]);
      }
      return out;
    },
    circle() { return ShapeKit.arc(0.5, 0.5, 0.5, 90, 450, 48); },
    /** Sine wave across the width. */
    wave(periods = 2, amp = 0.25) {
      const out = [];
      for (let i = 0; i <= 64; i++) { const x = i / 64; out.push([x, 0.5 - amp * Math.sin(x * periods * Math.PI * 2)]); }
      return out;
    },
    spiral(turns = 2) {
      const out = [];
      for (let i = 0; i <= 96; i++) {
        const t = i / 96, a = t * turns * Math.PI * 2, r = 0.5 * t;
        out.push([0.5 + r * Math.cos(a), 0.5 - r * Math.sin(a)]);
      }
      return out;
    },
    heart() {
      const out = [];
      for (let i = 0; i <= 64; i++) {
        const t = Math.PI + (i / 64) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        out.push([0.5 + x / 34, 0.45 - y / 34]);
      }
      return out;
    },
    star(points = 5) {
      const corners = [];
      for (let i = 0; i <= points; i++) {
        const a = (-90 + i * 144) * Math.PI / 180;
        corners.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]);
      }
      return ShapeKit.poly(corners);
    },
    /** Concatenate several path pieces into one stroke. */
    join(...parts) { return [].concat(...parts); },
  };

  /* --------------------------- Geometry ----------------------------- */
  const N = 64;              // resample count
  const SIZE = 250;          // normalised square size
  const HALF_DIAG = 0.5 * Math.sqrt(2 * SIZE * SIZE);
  const ANGLE_RANGE = 20 * Math.PI / 180;
  const ANGLE_PREC = 2 * Math.PI / 180;
  const PHI = 0.5 * (-1 + Math.sqrt(5));

  const toPts = arr => arr.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y });
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function pathLength(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]); return d; }

  function resample(input, n) {
    const pts = input.map(p => ({ x: p.x, y: p.y }));
    const I = pathLength(pts) / (n - 1);
    if (I === 0) return Array.from({ length: n }, () => ({ x: pts[0].x, y: pts[0].y }));
    let D = 0; const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const d = dist(pts[i - 1], pts[i]);
      if (D + d >= I) {
        const q = { x: pts[i - 1].x + ((I - D) / d) * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + ((I - D) / d) * (pts[i].y - pts[i - 1].y) };
        out.push(q); pts.splice(i, 0, q); D = 0;
      } else D += d;
    }
    while (out.length < n) out.push({ ...pts[pts.length - 1] });
    return out.slice(0, n);
  }

  function centroid(pts) { let x = 0, y = 0; pts.forEach(p => { x += p.x; y += p.y; }); return { x: x / pts.length, y: y / pts.length }; }
  function bbox(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /** Centre on centroid and scale; uniform keeps aspect ratio, stretched fills the square. */
  function normalize(pts, uniform) {
    const c = centroid(pts);
    const moved = pts.map(p => ({ x: p.x - c.x, y: p.y - c.y }));
    const b = bbox(moved);
    if (uniform) {
      // RMS radius is rotation-invariant, so the angle search below stays meaningful.
      const rms = Math.sqrt(moved.reduce((a, p) => a + p.x * p.x + p.y * p.y, 0) / moved.length);
      const s = (0.5 * SIZE) / (rms || 1);
      return moved.map(p => ({ x: p.x * s, y: p.y * s }));
    }
    const sx = SIZE / Math.max(b.w, 1e-6 + Math.max(b.w, b.h) * 0.25);
    const sy = SIZE / Math.max(b.h, 1e-6 + Math.max(b.w, b.h) * 0.25);
    const scaled = moved.map(p => ({ x: p.x * sx, y: p.y * sy }));
    const c2 = centroid(scaled);
    return scaled.map(p => ({ x: p.x - c2.x, y: p.y - c2.y }));
  }

  function rotate(pts, rad) {
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return pts.map(p => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
  }
  function pathDistance(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += dist(a[i], b[i]); return d / a.length; }

  /** Golden-section search over small rotations for the best alignment. */
  function distanceAtBestAngle(cand, tmpl) {
    let a = -ANGLE_RANGE, b = ANGLE_RANGE;
    let x1 = PHI * a + (1 - PHI) * b, f1 = pathDistance(rotate(cand, x1), tmpl);
    let x2 = (1 - PHI) * a + PHI * b, f2 = pathDistance(rotate(cand, x2), tmpl);
    while (Math.abs(b - a) > ANGLE_PREC) {
      if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = PHI * a + (1 - PHI) * b; f1 = pathDistance(rotate(cand, x1), tmpl); }
      else { a = x1; x1 = x2; f1 = f2; x2 = (1 - PHI) * a + PHI * b; f2 = pathDistance(rotate(cand, x2), tmpl); }
    }
    return Math.min(f1, f2);
  }

  /** All orderings of a template we accept: reversed, and (for closed shapes) any start point. */
  function variants(resampled, closed) {
    const list = [resampled, resampled.slice().reverse()];
    if (closed) {
      const ring = resampled.slice(0, N - 1);
      for (let k = 2; k < N - 1; k += 2) {
        const shifted = ring.slice(k).concat(ring.slice(0, k));
        shifted.push({ ...shifted[0] });
        list.push(shifted, shifted.slice().reverse());
      }
    }
    return list;
  }

  /* --------------------------- Recognizer --------------------------- */
  class Recognizer {
    constructor() { this.templates = []; }

    /** Register a shape. `points` is an array of [x,y]. */
    add(id, points, closed = false) {
      const raw = resample(toPts(points), N);
      const vars = variants(raw, closed);
      this.templates.push({
        id, closed, raw,
        uni: vars.map(v => normalize(v, true)),
        str: vars.map(v => normalize(v, false)),
      });
    }

    clear() { this.templates = []; }

    /** Score a stroke against one template, 0..1. */
    scoreAgainst(candRaw, t) {
      const cu = normalize(candRaw, true), cs = normalize(candRaw, false);
      let best = Infinity;
      for (let i = 0; i < t.uni.length; i++) {
        best = Math.min(best, distanceAtBestAngle(cu, t.uni[i]));
        best = Math.min(best, distanceAtBestAngle(cs, t.str[i]) * 1.08); // stretched match slightly penalised
      }
      return Math.max(0, 1 - best / HALF_DIAG);
    }

    /**
     * Recognise a full stroke. `allowed` = optional list of template ids.
     * Returns { id, score, ranking:[{id,score}] } or null if the stroke is too short.
     */
    recognize(points, allowed) {
      const pts = toPts(points);
      if (pts.length < 5) return null;
      const b = bbox(pts);
      if (Math.max(b.w, b.h) < 25) return null;
      const cand = resample(pts, N);
      const ranking = this.templates
        .filter(t => !allowed || allowed.includes(t.id))
        .map(t => ({ id: t.id, score: this.scoreAgainst(cand, t) }))
        .sort((a, b) => b.score - a.score);
      if (!ranking.length) return null;
      return { id: ranking[0].id, score: ranking[0].score, ranking };
    }

    /**
     * Live guess while the stroke is unfinished: compares the partial stroke to the
     * first part of each template. Returns { id, score, transform } where transform maps
     * template unit coords to screen coords, so a ghost outline can be drawn.
     */
    guessPartial(points, allowed) {
      const pts = toPts(points);
      if (pts.length < 6) return null;
      const pb = bbox(pts);
      if (Math.max(pb.w, pb.h) < 20) return null;
      const cand = normalize(resample(pts, 32), true);
      let best = null;
      for (const t of this.templates) {
        if (allowed && !allowed.includes(t.id)) continue;
        for (const dir of [t.raw, t.raw.slice().reverse()]) {
          for (const f of [0.3, 0.5, 0.7, 0.85, 1]) {
            const prefix = dir.slice(0, Math.max(3, Math.round(N * f)));
            const tp = normalize(resample(prefix, 32), true);
            const s = 1 - pathDistance(cand, tp) / HALF_DIAG;
            if (!best || s > best.score) best = { id: t.id, score: s, prefix, f };
          }
        }
      }
      if (!best) return null;
      // Map template space -> screen by matching the prefix's box to the stroke's box.
      const tb = bbox(best.prefix), tc = centroid(best.prefix), sc = centroid(pts);
      const s = Math.max(pb.w, pb.h) / (Math.max(tb.w, tb.h) || 1);
      best.transform = p => ({ x: sc.x + (p[0] - tc.x) * s, y: sc.y + (p[1] - tc.y) * s });
      return best;
    }
  }

  global.ShapeKit = ShapeKit;
  global.Recognizer = Recognizer;
  global.RecognizerUtil = { resample, normalize, bbox, toPts };
}
GlyphRecognizerModule(typeof window !== 'undefined' ? window : globalThis);
(typeof window !== 'undefined' ? window : globalThis).GlyphRecognizerModule = GlyphRecognizerModule;
