/* Suchsel – das Buchstabengitter auf einem Canvas: zeichnen, zoomen, verschieben und Wörter mit Finger oder Maus markieren.
   Die Markierung rastet in 8 Richtungen ein (waagerecht, senkrecht, schräg, jeweils vorwärts und rückwärts) und bleibt bei
   kleinen Wacklern in ihrer Richtung. Zwei Finger zoomen und verschieben, am Rechner Mausrad, Strg+Mausrad und rechte Maustaste.
   Gezeichnet werden nur die sichtbaren Felder, so bleibt es auch bei 100 × 100 flüssig.
   Taschenlampe: das Gitter ist dunkel, nur rund um Finger oder Maus leuchten die Buchstaben, mit einer kurzen Lichtspur dahinter. */
(function () {
    'use strict';

    const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const FONTS = {
        sans: '"Segoe UI", Roboto, "Helvetica Neue", Arial, "Liberation Sans", sans-serif',
        round: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", Nunito, "Varela Round", system-ui, sans-serif',
        serif: 'Georgia, "Times New Roman", "Liberation Serif", serif',
        mono: '"Courier New", Courier, "Liberation Mono", ui-monospace, monospace',
    };
    const PAD = 10, EDGE = 44;
    const TRAIL = 900;   // so lange leuchtet die Spur der Taschenlampe nach (ms)

    class SuBoard {
        /** opts: onSelect(sel, color) → true, wenn ein Wort gefunden wurde; nextColor() → Farbe für die nächste Markierung */
        constructor(canvas, opts) {
            this.cv = canvas;
            this.ctx = canvas.getContext('2d');
            this.o = opts;
            this.g = null;
            this.found = [];
            this.cover = null;
            this.cs = 30; this.ox = PAD; this.oy = PAD;
            this.cw = 0; this.ch = 0; this.dpr = 1;
            this.ptrs = new Map();
            this.drag = null; this.pinch = null; this.pan = null; this.lock = false;
            this.anims = [];
            this.raf = 0;
            this.fitted = true;
            this.font = 'sans';
            this.colors = { text: '#1b1f2a', cover: '#111', line: 'rgba(0,0,0,.06)', bg: '#fff', dark: false };
            this.lines = false;
            this.lamp = 0;          // Radius des Lichtkegels in Feldern, 0 = aus
            this.lampAt = null;     // wo das Licht gerade ist (in Feldern)
            this.trail = [];        // Lichtspur: [{ gx, gy, t }]
            this.lc = null; this.mc = null;   // Zeichenflächen für die angeleuchteten Buchstaben und das Licht als Maske
            this.bind();
            new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
            this.resize();
        }

        /* ---------- Daten ---------- */
        setPuzzle(g, keepView) {
            this.g = g;
            this.drag = null;
            this.anims = [];
            if (!keepView) this.home();
            this.redraw();
        }
        /** list = [{ sel: [x, y, dx, dy, len], color }] */
        setFound(list, popLast) {
            this.found = list;
            if (this.g) {
                this.cover = new Uint8Array(this.g.w * this.g.h);
                for (const f of list) for (let i = 0; i < f.sel[4]; i++) this.cover[(f.sel[1] + f.sel[3] * i) * this.g.w + f.sel[0] + f.sel[2] * i] = 1;
            }
            if (popLast && list.length) this.anim({ type: 'pop', f: list[list.length - 1], dur: 380 });
            this.redraw();
        }
        setStyle(font, lines) {
            this.font = FONTS[font] ? font : 'sans';
            this.lines = !!lines;
            this.readColors();
            this.redraw();
        }
        /** Taschenlampe an (Radius in Feldern) oder aus (0) */
        setLamp(r) {
            r = +r || 0;
            if (r === this.lamp) return;
            this.lamp = r;
            this.lampAt = null;
            this.trail = [];
            this.cv.parentElement.classList.toggle('lamp', !!r);
            this.redraw();
        }
        readColors() {
            const cs = getComputedStyle(document.documentElement);
            const v = (k, d) => (cs.getPropertyValue(k) || '').trim() || d;
            this.colors = { text: v('--board-text', '#1b1f2a'), cover: v('--board-cover', '#111'), line: v('--board-line', 'rgba(0,0,0,.07)'),
                hint: v('--accent', '#3b5bdb'), dark: document.documentElement.dataset.theme === 'dark' };
        }

        /* ---------- Ansicht ---------- */
        resize() {
            const r = this.cv.getBoundingClientRect();
            const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
            const dpr = Math.min(3, window.devicePixelRatio || 1);
            if (w === this.cw && h === this.ch && dpr === this.dpr) return;
            // Den Punkt in der Mitte festhalten, damit sich beim Drehen des Handys nichts verschiebt
            const mx = this.g ? (this.cw / 2 - this.ox) / this.cs : 0, my = this.g ? (this.ch / 2 - this.oy) / this.cs : 0;
            this.cw = w; this.ch = h; this.dpr = dpr;
            this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
            if (this.g) {
                if (this.fitted) this.fit();
                else { this.cs = this.clampCs(this.cs); this.ox = w / 2 - mx * this.cs; this.oy = h / 2 - my * this.cs; this.clamp(); }
            }
            this.redraw();
        }
        fitCs() { return this.g ? Math.max(2, Math.min((this.cw - 2 * PAD) / this.g.w, (this.ch - 2 * PAD) / this.g.h)) : 30; }
        clampCs(c) { const f = this.fitCs(); return Math.max(Math.min(f, 12), Math.min(Math.max(f, 110), c)); }
        clamp() {
            if (!this.g) return;
            const gw = this.cs * this.g.w, gh = this.cs * this.g.h;
            this.ox = gw <= this.cw - 2 * PAD ? (this.cw - gw) / 2 : Math.min(PAD, Math.max(this.cw - PAD - gw, this.ox));
            this.oy = gh <= this.ch - 2 * PAD ? (this.ch - gh) / 2 : Math.min(PAD, Math.max(this.ch - PAD - gh, this.oy));
        }
        fit() { this.cs = this.fitCs(); this.fitted = true; this.clamp(); this.redraw(); }
        /** Startansicht: ganzes Gitter, wenn die Buchstaben dann noch gut lesbar sind, sonst lesbar groß und oben links anfangen */
        home() {
            const f = this.fitCs();
            if (f >= 15) return this.fit();
            this.cs = this.clampCs(30);
            this.fitted = false;
            this.ox = PAD; this.oy = PAD;
            this.clamp();
        }
        zoomAt(factor, px, py) {
            if (!this.g) return;
            const c = this.clampCs(this.cs * factor);
            const gx = (px - this.ox) / this.cs, gy = (py - this.oy) / this.cs;
            this.cs = c;
            this.ox = px - gx * c; this.oy = py - gy * c;
            this.fitted = Math.abs(c - this.fitCs()) < 0.5;
            this.clamp();
            this.redraw();
        }
        zoom(factor) { this.zoomAt(factor, this.cw / 2, this.ch / 2); }
        panBy(dx, dy) { this.ox += dx; this.oy += dy; this.fitted = false; this.clamp(); this.redraw(); }
        /** Ein Feld in den sichtbaren Bereich holen */
        reveal(x, y) {
            const px = this.ox + (x + 0.5) * this.cs, py = this.oy + (y + 0.5) * this.cs;
            const m = this.cs * 2;
            if (px < m || px > this.cw - m) this.ox += this.cw / 2 - px;
            if (py < m || py > this.ch - m) this.oy += this.ch / 2 - py;
            this.clamp();
        }
        canPan() { return this.g && (this.cs * this.g.w > this.cw - 2 * PAD + 1 || this.cs * this.g.h > this.ch - 2 * PAD + 1); }

        /* ---------- Effekte ---------- */
        anim(a) { a.t0 = performance.now(); this.anims.push(a); this.redraw(); }
        hint(x, y) { this.reveal(x, y); this.anim({ type: 'hint', x, y, dur: 2600 }); }
        /** Ein gefundenes Wort kurz aufleuchten lassen (Antippen in der Wortliste) */
        flash(sel, color) { this.reveal(sel[0] + sel[2] * (sel[4] - 1) / 2, sel[1] + sel[3] * (sel[4] - 1) / 2); this.anim({ type: 'flash', f: { sel, color }, dur: 900 }); }

        /* ---------- Zeichnen ---------- */
        redraw() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); }); }
        draw() {
            const c = this.ctx, g = this.g;
            c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            c.clearRect(0, 0, this.cw, this.ch);
            if (!g) return;
            const cs = this.cs, now = performance.now();
            this.anims = this.anims.filter(a => now - a.t0 < a.dur);
            const x0 = Math.max(0, Math.floor(-this.ox / cs)), x1 = Math.min(g.w - 1, Math.floor((this.cw - this.ox) / cs));
            const y0 = Math.max(0, Math.floor(-this.oy / cs)), y1 = Math.min(g.h - 1, Math.floor((this.ch - this.oy) / cs));
            const cx = x => this.ox + (x + 0.5) * cs, cy = y => this.oy + (y + 0.5) * cs;

            const lamp = this.lamp > 0, lights = lamp ? this.lights(now) : null;
            if (lamp) this.drawGlow(c, lights);

            if (this.lines && cs >= 8) {
                c.strokeStyle = lamp ? 'rgba(255,255,255,.06)' : this.colors.line;
                c.lineWidth = 1;
                c.beginPath();
                for (let x = x0; x <= x1 + 1; x++) { const px = Math.round(this.ox + x * cs) + 0.5; c.moveTo(px, cy(y0) - cs / 2); c.lineTo(px, cy(y1) + cs / 2); }
                for (let y = y0; y <= y1 + 1; y++) { const py = Math.round(this.oy + y * cs) + 0.5; c.moveTo(cx(x0) - cs / 2, py); c.lineTo(cx(x1) + cs / 2, py); }
                c.stroke();
            }

            // Markierungen: dicke Linie mit runden Enden, leicht durchscheinend, damit sich kreuzende Wörter erkennbar bleiben
            c.lineCap = 'round';
            const capsule = (sel, color, alpha, widen) => {
                c.globalAlpha = alpha;
                c.strokeStyle = color;
                c.lineWidth = cs * 0.8 * (widen || 1);
                c.beginPath();
                c.moveTo(cx(sel[0]), cy(sel[1]));
                c.lineTo(cx(sel[0] + sel[2] * (sel[4] - 1)) + (sel[4] === 1 ? 0.01 : 0), cy(sel[1] + sel[3] * (sel[4] - 1)));
                c.stroke();
            };
            const fa = this.colors.dark ? 0.9 : 0.82;
            for (const f of this.found) {
                const pop = this.anims.find(a => a.type === 'pop' && a.f === f);
                const k = pop ? (now - pop.t0) / pop.dur : 1;
                capsule(f.sel, f.color, fa, pop ? 1 + 0.35 * Math.sin(Math.PI * k) : 1);
            }
            if (lamp && cs >= 5) {
                // Im Dunkeln: kleine Punkte zeigen, wo Buchstaben stehen
                c.fillStyle = 'rgba(255,255,255,.16)';
                const rr = Math.max(1, cs * 0.045);
                c.beginPath();
                for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                    if (this.cover && this.cover[y * g.w + x]) continue;
                    c.moveTo(cx(x) + rr, cy(y)); c.arc(cx(x), cy(y), rr, 0, Math.PI * 2);
                }
                c.fill();
            }
            for (const a of this.anims) {
                const k = (now - a.t0) / a.dur;
                if (a.type === 'miss') capsule(a.sel, a.color, 0.55 * (1 - k), 1);
                if (a.type === 'flash') capsule(a.f.sel, a.f.color, 1, 1 + 0.3 * Math.abs(Math.sin(k * Math.PI * 3)));
            }
            if (this.drag && this.drag.len) {
                // Die Markierung folgt dem Finger fließend in der eingerasteten Richtung, erfasst werden ganze Felder
                const d = this.drag, tt = d.t || 0;
                c.globalAlpha = lamp ? 0.4 : 0.6;
                c.strokeStyle = d.color;
                c.lineWidth = cs * 0.8;
                c.beginPath();
                c.moveTo(cx(d.sx), cy(d.sy));
                c.lineTo(cx(d.sx) + d.dir[0] * tt * cs + 0.01, cy(d.sy) + d.dir[1] * tt * cs);
                c.stroke();
            }
            c.globalAlpha = 1;
            for (const a of this.anims) {
                if (a.type !== 'hint') continue;
                const k = (now - a.t0) / a.dur;
                c.strokeStyle = this.colors.hint;
                c.lineWidth = Math.max(2, cs * 0.1);
                c.globalAlpha = Math.min(1, (1 - k) * 2);
                c.beginPath();
                c.arc(cx(a.x), cy(a.y), cs * (0.42 + 0.14 * Math.abs(Math.sin(k * Math.PI * 4))), 0, Math.PI * 2);
                c.stroke();
                c.globalAlpha = 1;
            }

            // Buchstaben, nur die sichtbaren
            if (cs >= 3) {
                const font = '700 ' + (cs * 0.6).toFixed(1) + 'px ' + FONTS[this.font];
                c.font = font;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                const dy = cs * 0.035;
                for (let y = y0; y <= y1; y++) {
                    const py = cy(y) + dy;
                    for (let x = x0; x <= x1; x++) {
                        const i = y * g.w + x;
                        const cov = this.cover && this.cover[i];
                        if (lamp && !cov) continue;   // im Dunkeln nur gefundene Wörter, der Rest kommt über das Licht
                        c.fillStyle = cov ? this.colors.cover : this.colors.text;
                        c.fillText(g.grid[i], cx(x), py);
                    }
                }
                if (lamp && lights.length) this.drawLit(c, lights, font, x0, x1, y0, y1);
            }
            if (this.anims.length || (lamp && this.trail.length)) this.redraw();
        }

        /* ---------- Taschenlampe ---------- */
        /** Alle Lichtpunkte gerade: wo das Licht ist, die verblassende Spur und ein Tipp. k = Helligkeit 0…1 */
        lights(now) {
            this.trail = this.trail.filter(p => now - p.t < TRAIL);
            const out = this.trail.map(p => { const k = 1 - (now - p.t) / TRAIL; return { gx: p.gx, gy: p.gy, k: k * k * (3 - 2 * k) }; });
            if (this.lampAt) out.push({ gx: this.lampAt.gx, gy: this.lampAt.gy, k: 1 });
            for (const a of this.anims) if (a.type === 'hint') out.push({ gx: a.x + 0.5, gy: a.y + 0.5, k: Math.min(1, (1 - (now - a.t0) / a.dur) * 3) * 0.8 });
            return out;
        }
        lightR(p) { return this.lamp * this.cs * (0.55 + 0.45 * p.k); }
        /** Warmer Schein unter den Buchstaben */
        drawGlow(c, lights) {
            for (const p of lights) {
                const x = this.ox + p.gx * this.cs, y = this.oy + p.gy * this.cs, r = this.lightR(p);
                const gr = c.createRadialGradient(x, y, 0, x, y, r);
                gr.addColorStop(0, 'rgba(255,214,90,' + (0.24 * p.k).toFixed(3) + ')');
                gr.addColorStop(0.6, 'rgba(255,200,60,' + (0.08 * p.k).toFixed(3) + ')');
                gr.addColorStop(1, 'rgba(255,200,60,0)');
                c.fillStyle = gr;
                c.fillRect(x - r, y - r, 2 * r, 2 * r);
            }
        }
        /** Buchstaben im Licht: die Buchstaben im Lichtkreis auf eine eigene Fläche, dann mit den Lichtflecken als Maske ausblenden */
        drawLit(c, lights, font, x0, x1, y0, y1) {
            const g = this.g, cs = this.cs, W = this.cv.width, H = this.cv.height;
            const prep = k => {
                if (!this[k]) this[k] = document.createElement('canvas');
                const cv = this[k];
                if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
                const l = cv.getContext('2d');
                l.globalCompositeOperation = 'source-over';
                l.setTransform(1, 0, 0, 1, 0, 0);
                l.clearRect(0, 0, W, H);
                l.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
                return l;
            };
            const m = prep('mc'), l = prep('lc');
            const lit = new Set();
            for (const p of lights) {
                const x = this.ox + p.gx * cs, y = this.oy + p.gy * cs, r = this.lightR(p);
                const gr = m.createRadialGradient(x, y, 0, x, y, r);
                gr.addColorStop(0, 'rgba(255,255,255,' + p.k.toFixed(3) + ')');
                gr.addColorStop(0.5, 'rgba(255,255,255,' + (0.85 * p.k).toFixed(3) + ')');
                gr.addColorStop(1, 'rgba(255,255,255,0)');
                m.fillStyle = gr;
                m.fillRect(x - r, y - r, 2 * r, 2 * r);
                const rc = r / cs;
                for (let yy = Math.max(y0, Math.floor(p.gy - rc)); yy <= Math.min(y1, Math.floor(p.gy + rc)); yy++)
                    for (let xx = Math.max(x0, Math.floor(p.gx - rc)); xx <= Math.min(x1, Math.floor(p.gx + rc)); xx++) lit.add(yy * g.w + xx);
            }
            l.font = font;
            l.textAlign = 'center';
            l.textBaseline = 'middle';
            l.fillStyle = '#fff4d0';
            const dy = cs * 0.035;
            for (const i of lit) {
                if (this.cover && this.cover[i]) continue;
                const x = i % g.w, y = (i - x) / g.w;
                l.fillText(g.grid[i], this.ox + (x + 0.5) * cs, this.oy + (y + 0.5) * cs + dy);
            }
            l.setTransform(1, 0, 0, 1, 0, 0);
            l.globalCompositeOperation = 'destination-in';
            l.drawImage(this.mc, 0, 0);
            l.globalCompositeOperation = 'source-over';
            c.save();
            c.setTransform(1, 0, 0, 1, 0, 0);
            c.globalAlpha = 1;
            c.drawImage(this.lc, 0, 0);
            c.restore();
        }
        /** Licht an die Stelle von Finger oder Maus. Am Handy etwas über die Fingerspitze, damit der Finger es nicht verdeckt. */
        moveLamp(p, touch) {
            if (!this.lamp || !this.g) return;
            const off = touch ? Math.min(30, Math.max(14, this.cs * 0.6)) / this.cs : 0;
            const at = { gx: p.gx, gy: p.gy - off };
            const now = performance.now(), last = this.trail[this.trail.length - 1];
            if (this.lampAt && (!last || Math.hypot(at.gx - last.gx, at.gy - last.gy) > 0.2 || now - last.t > 40)) {
                this.trail.push({ gx: this.lampAt.gx, gy: this.lampAt.gy, t: now });
                if (this.trail.length > 160) this.trail.shift();
            }
            this.lampAt = at;
            this.redraw();
        }
        /** Finger hoch oder Maus raus: das Licht verglimmt */
        dropLamp() {
            if (!this.lampAt) return;
            this.trail.push({ gx: this.lampAt.gx, gy: this.lampAt.gy, t: performance.now() });
            this.lampAt = null;
            this.redraw();
        }

        /* ---------- Bedienung ---------- */
        toGrid(e) {
            const r = this.cv.getBoundingClientRect();
            const px = e.clientX - r.left, py = e.clientY - r.top;
            return { px, py, gx: (px - this.ox) / this.cs, gy: (py - this.oy) / this.cs, touch: e.pointerType !== 'mouse' };
        }
        bind() {
            const cv = this.cv;
            cv.addEventListener('pointerdown', e => this.down(e));
            cv.addEventListener('pointermove', e => this.move(e));
            cv.addEventListener('pointerup', e => this.up(e, false));
            cv.addEventListener('pointercancel', e => this.up(e, true));
            cv.addEventListener('lostpointercapture', e => { if (this.ptrs.has(e.pointerId)) this.up(e, true); });
            cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !this.ptrs.size) this.dropLamp(); });
            cv.addEventListener('contextmenu', e => e.preventDefault());
            cv.addEventListener('wheel', e => this.wheel(e), { passive: false });
            // Safari am Mac: Zoomen mit zwei Fingern auf dem Trackpad kommt als gesture-Ereignis
            let gs = 1;
            cv.addEventListener('gesturestart', e => { e.preventDefault(); gs = 1; });
            cv.addEventListener('gesturechange', e => {
                e.preventDefault();
                const p = this.toGrid(e);
                this.zoomAt(e.scale / gs, p.px, p.py);
                gs = e.scale;
            });
        }
        down(e) {
            if (!this.g) return;
            if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1 && e.button !== 2) return;
            e.preventDefault();
            try { this.cv.setPointerCapture(e.pointerId); } catch (x) {}
            const p = this.toGrid(e);
            this.ptrs.set(e.pointerId, p);
            if (this.ptrs.size === 2 && e.pointerType !== 'mouse') {
                // zweiter Finger: Markieren abbrechen, ab jetzt zoomen und verschieben
                this.drag = null;
                this.pan = null;
                this.lock = true;
                this.dropLamp();
                const [a, b] = [...this.ptrs.values()];
                const mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2;
                this.pinch = { d0: Math.hypot(a.px - b.px, a.py - b.py) || 1, cs0: this.cs, gx: (mx - this.ox) / this.cs, gy: (my - this.oy) / this.cs, zoom: false };
                this.redraw();
                return;
            }
            if (this.ptrs.size > 1 || this.lock) return;
            this.moveLamp(p, p.touch);
            const inside = p.gx >= 0 && p.gy >= 0 && p.gx < this.g.w && p.gy < this.g.h;
            if (e.pointerType === 'mouse' && e.button !== 0 || !inside) {
                this.pan = { px: p.px, py: p.py, ox: this.ox, oy: this.oy };
                this.cv.classList.add('panning');
                return;
            }
            this.drag = { sx: Math.floor(p.gx), sy: Math.floor(p.gy), dir: [1, 0], len: 1, color: this.o.nextColor(), last: p, moved: false };
            this.autoScroll();
            this.redraw();
        }
        move(e) {
            if (!this.ptrs.has(e.pointerId)) {
                if (e.pointerType === 'mouse' && this.lamp) this.moveLamp(this.toGrid(e), false);   // am Rechner leuchtet die Maus auch ohne Klick
                return;
            }
            const p = this.toGrid(e);
            this.ptrs.set(e.pointerId, p);
            if (!this.pinch && this.ptrs.size === 1) this.moveLamp(p, p.touch);
            if (this.pinch && this.ptrs.size >= 2) {
                const [a, b] = [...this.ptrs.values()];
                const mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2, dist = Math.hypot(a.px - b.px, a.py - b.py) || 1;
                const pz = this.pinch;
                // Zwei Finger gemeinsam bewegen verschiebt nur. Gezoomt wird erst, wenn sich der Abstand deutlich ändert (über 12 %).
                if (!pz.zoom && Math.abs(dist / pz.d0 - 1) > 0.12) { pz.zoom = true; pz.d0 = dist; pz.cs0 = this.cs; pz.gx = (mx - this.ox) / this.cs; pz.gy = (my - this.oy) / this.cs; }
                if (pz.zoom) this.cs = this.clampCs(pz.cs0 * dist / pz.d0);
                this.ox = mx - pz.gx * this.cs; this.oy = my - pz.gy * this.cs;
                this.fitted = false;
                this.clamp();
                this.redraw();
                return;
            }
            if (this.pan) {
                this.ox = this.pan.ox + p.px - this.pan.px; this.oy = this.pan.oy + p.py - this.pan.py;
                this.fitted = false;
                this.clamp();
                this.redraw();
                return;
            }
            if (this.drag) { this.drag.last = p; this.track(p); }
        }
        /** Auswahl nachführen: Richtung einrasten, Länge auf die Richtung projizieren, am Rand des Gitters stoppen */
        track(p) {
            const d = this.drag, g = this.g;
            const vx = p.gx - (d.sx + 0.5), vy = p.gy - (d.sy + 0.5);
            const dist = Math.hypot(vx, vy);
            if (dist < 0.5) { d.len = 1; d.t = 0; this.redraw(); return; }
            d.moved = true;
            const ang = Math.atan2(vy, vx);
            const cur = Math.atan2(d.dir[1], d.dir[0]);
            let diff = Math.abs(ang - cur);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            // Hysterese: in der bisherigen Richtung bleiben, solange der Finger nicht deutlich (mehr als ~32°) davon abweicht
            if (!(d.len > 1 && diff < 0.56)) d.dir = D8[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
            const [dx, dy] = d.dir;
            const proj = (vx * dx + vy * dy) / (dx * dx + dy * dy);
            const lim = Math.min(dx > 0 ? g.w - 1 - d.sx : dx < 0 ? d.sx : 1e9, dy > 0 ? g.h - 1 - d.sy : dy < 0 ? d.sy : 1e9);
            d.t = Math.max(0, Math.min(lim, proj));
            const n = Math.max(0, Math.min(lim, Math.round(proj)));
            if (n + 1 !== d.len) { d.len = n + 1; if (navigator.vibrate && this.o.tick) this.o.tick(); }
            this.redraw();
        }
        /** Beim Markieren am Rand des Bildes: Gitter langsam weiterschieben, damit auch lange Wörter in großen Gittern gehen */
        autoScroll() {
            const step = () => {
                const d = this.drag;
                if (!d) return;
                const p = d.last;
                let vx = 0, vy = 0;
                if (p.px < EDGE) vx = (EDGE - p.px) / EDGE; else if (p.px > this.cw - EDGE) vx = -(p.px - (this.cw - EDGE)) / EDGE;
                if (p.py < EDGE) vy = (EDGE - p.py) / EDGE; else if (p.py > this.ch - EDGE) vy = -(p.py - (this.ch - EDGE)) / EDGE;
                if (d.moved && d.len > 1) {
                    // Richtung steht fest: genau in Wortrichtung weiterschieben, schräg also in beide Richtungen zugleich.
                    // Es reicht, wenn der Finger an einem Rand ist, auf den das Wort zuläuft.
                    const [dx, dy] = d.dir;
                    const s = Math.max(dx * vx < 0 ? Math.abs(vx) : 0, dy * vy < 0 ? Math.abs(vy) : 0);
                    vx = -dx * s; vy = -dy * s;
                }
                if ((vx || vy) && this.canPan()) {
                    const ox = this.ox, oy = this.oy;
                    this.ox += Math.max(-1, Math.min(1, vx)) * 9; this.oy += Math.max(-1, Math.min(1, vy)) * 9;
                    this.clamp();
                    if (ox !== this.ox || oy !== this.oy) {
                        this.fitted = false;
                        p.gx = (p.px - this.ox) / this.cs; p.gy = (p.py - this.oy) / this.cs;
                        if (this.lamp) this.moveLamp(p, p.touch);
                        this.track(p);
                    }
                }
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        }
        up(e, cancel) {
            if (!this.ptrs.has(e.pointerId)) return;
            this.ptrs.delete(e.pointerId);
            if (e.pointerType !== 'mouse') this.dropLamp();
            if (this.pinch) { if (this.ptrs.size < 2) this.pinch = null; if (!this.ptrs.size) this.lock = false; return; }
            if (!this.ptrs.size) this.lock = false;
            if (this.pan) { this.pan = null; this.cv.classList.remove('panning'); return; }
            const d = this.drag;
            this.drag = null;
            if (!d) return;
            // Doppelt tippen (ohne zu ziehen) bringt das Gitter zurück in die Ausgangsgröße
            if (!d.moved && !cancel) {
                const now = performance.now(), p = d.last;
                if (this.tap && now - this.tap.t < 350 && Math.hypot(p.px - this.tap.x, p.py - this.tap.y) < 40) { this.tap = null; this.home(); this.redraw(); return; }
                this.tap = { t: now, x: p.px, y: p.py };
            } else this.tap = null;
            if (!cancel && d.len >= 2) {
                const sel = [d.sx, d.sy, d.dir[0], d.dir[1], d.len];
                if (!this.o.onSelect(sel, d.color) && !this.lamp) this.anim({ type: 'miss', sel, color: d.color, dur: 420 });
            }
            this.redraw();
        }
        wheel(e) {
            if (!this.g) return;
            e.preventDefault();
            const p = this.toGrid(e);
            const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
            if (e.ctrlKey || e.metaKey || !this.canPan()) {
                this.zoomAt(Math.exp(-e.deltaY * k * (e.ctrlKey ? 0.01 : 0.0025)), p.px, p.py);
            } else {
                const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX, dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
                this.panBy(-dx * k, -dy * k);
            }
        }
        /** Tastatur am Rechner: Pfeile verschieben, + und - zoomen, 0 passt ein */
        key(e) {
            if (!this.g) return false;
            const s = 60;
            switch (e.key) {
                case 'ArrowLeft': this.panBy(s, 0); return true;
                case 'ArrowRight': this.panBy(-s, 0); return true;
                case 'ArrowUp': this.panBy(0, s); return true;
                case 'ArrowDown': this.panBy(0, -s); return true;
                case '+': case '=': this.zoom(1.25); return true;
                case '-': this.zoom(0.8); return true;
                case '0': this.fit(); return true;
            }
            return false;
        }
    }

    window.SuBoard = SuBoard;
})();
