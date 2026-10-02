/* =====================================================================
 * drawing.js — SPELL DRAWING PAD, LIVE GUIDE & CAST EVALUATION
 * ---------------------------------------------------------------------
 *  SpellCaster.evaluate(points, allowedIds) -> cast result with quality
 *  DrawPad      : attaches to a <canvas>, captures one stroke at a time
 *                 (mouse, pen or touch), shows a glowing trail plus a
 *                 ghost outline of the spell it thinks you are drawing,
 *                 and can play an animated demonstration of a shape.
 *  drawThumb()  : renders a spell's shape (with start dot) to a canvas.
 * Requires: recognizer.js, data.js
 * ===================================================================== */
(function (global) {
  'use strict';
  const { SPELLS, CAST_RULES } = global.GameData;
  const spellById = id => SPELLS.find(s => s.id === id);
  const hex = n => '#' + n.toString(16).padStart(6, '0');

  /* --------------------------- SpellCaster -------------------------- */
  const recognizer = new global.Recognizer();
  SPELLS.forEach(s => recognizer.add(s.id, s.points, !!s.closed));

  /* ------------------------ Recognition worker --------------------- */
  const RecWorker = {
    worker: null, broken: false, nextId: 1, pending: new Map(),
    get() {
      if (this.broken) return null;
      if (this.worker) return this.worker;
      try {
        if (typeof Worker === 'undefined' || !global.GlyphRecognizerModule || !global.Blob || !global.URL) throw new Error('no worker support');
        const src = `(${global.GlyphRecognizerModule.toString()})(self);
          let R = null;
          self.onmessage = e => {
            const m = e.data;
            if (m.type === 'init') { R = new self.Recognizer(); m.templates.forEach(t => R.add(t.id, t.points, t.closed)); return; }
            if (m.type === 'rec') {
              const pts = []; for (let i = 0; i < m.points.length; i += 2) pts.push({ x: m.points[i], y: m.points[i + 1] });
              const r = R ? R.recognize(pts, m.allowed || undefined) : null;
              self.postMessage({ id: m.id, r: r ? { id: r.id, score: r.score, ranking: r.ranking } : null });
            }
          };`;
        const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        const w = new Worker(url);
        w.onmessage = e => { const p = this.pending.get(e.data.id); if (p) { this.pending.delete(e.data.id); clearTimeout(p.timer); p.resolve(e.data.r); } };
        w.onerror = ev => { if (ev && ev.preventDefault) ev.preventDefault(); this.fail(); };
        w.postMessage({ type: 'init', templates: SPELLS.map(s => ({ id: s.id, points: s.points, closed: !!s.closed })) });
        this.worker = w;
        return w;
      } catch (e) { this.broken = true; return null; }
    },
    fail() {
      this.broken = true;
      if (this.worker) { try { this.worker.terminate(); } catch (e) { /* ignore */ } }
      this.worker = null;
      this.pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error('worker failed')); });
      this.pending.clear();
    },
    recognize(points, allowed) {
      return new Promise((resolve, reject) => {
        const id = this.nextId++;
        const flat = new Float64Array(points.length * 2);   // 64-bit: results identical to the main thread
        points.forEach((p, i) => { flat[i * 2] = p.x; flat[i * 2 + 1] = p.y; });
        const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout')); }, 300);
        this.pending.set(id, { resolve, reject, timer });
        this.worker.postMessage({ type: 'rec', id, points: flat, allowed: allowed || null }, [flat.buffer]);
      });
    },
  };

  const SpellCaster = {
    recognizer,
    /**
     * Returns { spell, score, pct, quality(0..1), tier, success, ranking } or null.
     * quality maps successAt..perfectAt onto 0..1 and drives damage/mana/hit chance.
     */
    evaluate(points, allowedIds) {
      const r = recognizer.recognize(points, allowedIds);
      return r ? this.fromRaw(r) : null;
    },
    /**
     * Same as evaluate(), but runs recognition in a background Web Worker so a ~20 ms
     * recognition never drops a frame during fast casting (ART_GUIDE §9.8).
     * Falls back to the main thread if workers are unavailable (e.g. blocked on file://)
     * or the worker does not answer within 300 ms.
     */
    evaluateAsync(points, allowedIds) {
      const w = RecWorker.get();
      if (!w) return Promise.resolve(this.evaluate(points, allowedIds));
      return RecWorker.recognize(points, allowedIds).then(r => r ? this.fromRaw(r) : null)
        .catch(() => { RecWorker.broken = true; return this.evaluate(points, allowedIds); });
    },
    /** Build a cast result from a raw {id, score, ranking} recognition. */
    fromRaw(r) {
      const spell = spellById(r.id);
      if (!spell) return null;
      const { successAt, perfectAt } = CAST_RULES;
      const quality = Math.max(0, Math.min(1, (r.score - successAt) / (perfectAt - successAt)));
      const success = r.score >= successAt;
      const tier = !success ? 'Fizzle' : r.score >= perfectAt ? 'Perfect' : quality >= 0.5 ? 'Great' : 'Good';
      return { spell, score: r.score, pct: Math.round(r.score * 100), quality, tier, success, ranking: r.ranking };
    },
    /** Mana cost after accuracy penalty. */
    costFor(spell, quality) { return Math.round(spell.cost * (1 + CAST_RULES.maxExtraMana * (1 - quality))); },
    powerFor(quality) { return CAST_RULES.minPower + (1 - CAST_RULES.minPower) * quality; },
  };

  /* ---------------------------- Thumbnails -------------------------- */
  function drawThumb(canvas, spell, opts = {}) {
    const c = canvas.getContext('2d'), w = canvas.width, h = canvas.height, pad = Math.min(w, h) * 0.15;
    c.clearRect(0, 0, w, h);
    const s = Math.min(w, h) - pad * 2, ox = (w - s) / 2, oy = (h - s) / 2;
    const pts = spell.points.map(p => [ox + p[0] * s, oy + p[1] * s]);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = opts.locked ? '#555' : hex(spell.color);
    c.shadowColor = c.strokeStyle; c.shadowBlur = opts.locked ? 0 : 8;
    c.lineWidth = Math.max(2, w / 28);
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    c.shadowBlur = 0;
    if (!opts.locked) {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(pts[0][0], pts[0][1], Math.max(3, w / 22), 0, Math.PI * 2); c.fill();
      // direction arrow near the start
      const a = pts[Math.min(6, pts.length - 1)], b = pts[0];
      const ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
      c.fillStyle = hex(spell.color);
      c.beginPath(); const ax = a[0], ay = a[1], L = w / 12;
      c.moveTo(ax + Math.cos(ang) * L, ay + Math.sin(ang) * L);
      c.lineTo(ax + Math.cos(ang + 2.5) * L, ay + Math.sin(ang + 2.5) * L);
      c.lineTo(ax + Math.cos(ang - 2.5) * L, ay + Math.sin(ang - 2.5) * L); c.fill();
    }
  }

  /* ------------------------------ DrawPad --------------------------- */
  class DrawPad {
    /**
     * opts.onStroke(points) is called on release with the stroke in CSS pixels.
     * opts.allowed() returns the spell ids considered for the live guide.
     * opts.showGhost() returns whether to show the live guide.
     */
    constructor(canvas, opts = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.opts = opts; this.enabled = false;
      this.points = []; this.pointerId = null;
      this.guess = null; this.fade = null; this.demoState = null;
      this.resize();
      global.addEventListener('resize', () => this.resize());
      canvas.addEventListener('pointerdown', e => this.down(e));
      canvas.addEventListener('pointermove', e => this.move(e));
      canvas.addEventListener('pointerup', e => this.up(e));
      canvas.addEventListener('pointercancel', e => this.cancel(e));
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      const tick = () => { this.render(); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }

    resize() {
      const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, global.devicePixelRatio || 1);
      this.w = r.width || this.canvas.clientWidth || 300; this.h = r.height || this.canvas.clientHeight || 300;
      this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    enable() { this.enabled = true; this.canvas.style.pointerEvents = 'auto'; this.resize(); }
    disable() { this.enabled = false; this.canvas.style.pointerEvents = 'none'; this.cancel(); }
    clear() { this.points = []; this.guess = null; this.fade = null; }

    pos(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    down(e) {
      if (!this.enabled || this.pointerId !== null) return;   // one stroke, one pointer at a time
      e.preventDefault();
      this.pointerId = e.pointerId;
      this.canvas.setPointerCapture(e.pointerId);
      this.stopDemo();
      this.points = [this.pos(e)]; this.guess = null; this.fade = null;
      if (this.opts.onStart) this.opts.onStart();
    }
    move(e) {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      events.forEach(ev => { const p = this.pos(ev), last = this.points[this.points.length - 1]; if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) this.points.push(p); });
      if (this.points.length % 4 === 0 && this.showGhost()) {
        this.guess = SpellCaster.recognizer.guessPartial(this.points, this.opts.allowed ? this.opts.allowed() : null);
      }
    }
    up(e) {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      const pts = this.points;
      this.fade = { points: pts, t: 1 };
      this.points = []; this.guess = null;
      if (pts.length > 4 && this.opts.onStroke) this.opts.onStroke(pts);
    }
    cancel() { this.pointerId = null; this.points = []; this.guess = null; }

    /* ---- Virtual pen (first person with pointer lock: the stroke follows mouse
     *      movement from the crosshair, because there is no visible cursor) ---- */
    beginVirtual(x, y) {
      if (!this.enabled || this.pointerId !== null) return false;
      this.pointerId = 'virtual';
      this.stopDemo();
      this.points = [{ x, y }]; this.guess = null; this.fade = null; this._lastGuess = 0;
      if (this.opts.onStart) this.opts.onStart();
      return true;
    }
    moveVirtual(x, y) {
      if (this.pointerId !== 'virtual') return;
      const last = this.points[this.points.length - 1];
      if (Math.hypot(x - last.x, y - last.y) > 2) this.points.push({ x, y });
      const now = performance.now();
      if (this.showGhost() && now - this._lastGuess > 60 && this.points.length > 5) {   // live guess at most every 60 ms (§10.2)
        this._lastGuess = now;
        this.guess = SpellCaster.recognizer.guessPartial(this.points, this.opts.allowed ? this.opts.allowed() : null);
      }
    }
    endVirtual() {
      if (this.pointerId !== 'virtual') return;
      this.up({ pointerId: 'virtual' });
    }
    isDrawing() { return this.pointerId !== null; }
    showGhost() { return this.opts.showGhost ? this.opts.showGhost() : true; }

    /** Loop an animated demonstration of a spell's stroke until stopped. */
    demo(spell, loop = true) {
      this.demoState = { spell, t: 0, loop, last: performance.now() };
    }
    stopDemo() { this.demoState = null; }

    stroke(points, color, width, alpha = 1, glow = 16) {
      const c = this.ctx; if (points.length < 2) return;
      c.save(); c.globalAlpha = alpha; c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = glow; c.lineWidth = width;
      c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
      c.strokeStyle = '#ffffff'; c.shadowBlur = 0; c.lineWidth = width * 0.35; c.stroke();
      c.restore();
    }

    render() {
      const c = this.ctx;
      if (!this.demoState && !this.points.length && !this.fade) {      // idle: clear once, then skip (cheap on big overlays)
        if (this._drawn) { c.clearRect(0, 0, this.w, this.h); this._drawn = false; }
        return;
      }
      this._drawn = true;
      c.clearRect(0, 0, this.w, this.h);
      // demonstration
      if (this.demoState) {
        const d = this.demoState, now = performance.now();
        d.t += (now - d.last) / 1000; d.last = now;
        const dur = 2.2, k = Math.min(1, d.t / dur);
        const size = Math.min(this.w, this.h) * 0.6, ox = (this.w - size) / 2, oy = (this.h - size) / 2;
        const all = d.spell.points.map(p => ({ x: ox + p[0] * size, y: oy + p[1] * size }));
        this.stroke(all, hex(d.spell.color), 3, 0.18, 0);
        const n = Math.max(2, Math.floor(all.length * k));
        const part = all.slice(0, n);
        this.stroke(part, hex(d.spell.color), 8, 0.95);
        const head = part[part.length - 1];
        c.save(); c.fillStyle = '#fff'; c.shadowColor = hex(d.spell.color); c.shadowBlur = 25;
        c.beginPath(); c.arc(head.x, head.y, 9, 0, Math.PI * 2); c.fill(); c.restore();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(all[0].x, all[0].y, 5, 0, Math.PI * 2); c.fill();
        if (d.t > dur + 0.8) { if (d.loop) d.t = 0; else this.demoState = null; }
      }
      // live guide: ghost outline of the best-guess spell
      if (this.points.length && this.guess && this.guess.score > 0.6) {
        const spell = spellById(this.guess.id);
        const ghost = spell.points.map(this.guess.transform);
        c.save(); c.setLineDash([10, 10]);
        this.stroke(ghost, hex(spell.color), 4, 0.45, 8);
        c.restore();
        const last = this.points[this.points.length - 1];
        c.save(); c.font = 'bold 16px Georgia'; c.fillStyle = hex(spell.color); c.shadowColor = '#000'; c.shadowBlur = 6;
        c.fillText(`${spell.name}?`, last.x + 18, last.y - 14); c.restore();
      }
      if (this.points.length) this.stroke(this.points, '#9fe8ff', 7, 1);
      if (this.fade) {
        this.fade.t -= 0.03;
        if (this.fade.t <= 0) this.fade = null;
        else this.stroke(this.fade.points, '#9fe8ff', 7, this.fade.t);
      }
    }
  }

  global.SpellCaster = SpellCaster;
  global.RecWorker = RecWorker;
  global.DrawPad = DrawPad;
  global.drawThumb = drawThumb;
  global.hexColor = hex;
})(window);
