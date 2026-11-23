/* Suchsel – das Rätsel selbst: Wörter vereinheitlichen, im Gitter verstecken, Füllbuchstaben, Prüfen einer Auswahl.
   Alles hängt nur vom Startwert (seed) ab: dieselben Angaben ergeben immer dasselbe Gitter. Darauf beruht das Teilen per Link.
   Keine Abhängigkeit vom Browser, läuft auch unter Node (für die Tests). */
(function (root) {
    'use strict';

    /** Zufallszahlen aus einem Startwert (mulberry32) */
    function rng(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const newSeed = () => (Math.random() * 4294967296) >>> 0;

    /* Buchstaben und wie häufig sie in der Sprache vorkommen (in Prozent). Daraus entstehen die Füllbuchstaben,
       damit das Gitter nach echter Sprache aussieht. Sonderbuchstaben gehören dazu, sonst würden Wörter mit Ä oder Ñ auffallen. */
    const FREQ = {
        de: 'E17.4 N9.8 I7.6 S7.3 R7 A6.5 T6.2 D5.1 H4.8 U4.4 L3.4 C3.1 G3 M2.5 O2.5 B1.9 W1.9 F1.7 K1.2 Z1.1 P.8 V.7 Ü.65 Ä.55 Ö.3 J.27 Y.05 X.04 Q.03',
        en: 'E12.7 T9.1 A8.2 O7.5 I7 N6.8 S6.3 H6.1 R6 D4.3 L4 C2.8 U2.8 M2.4 W2.4 F2.2 G2 Y2 P1.9 B1.5 V1 K.8 J.15 X.15 Q.1 Z.1',
        fr: 'E14.7 S7.9 A7.6 I7.5 T7.2 N7.1 R6.6 U6.3 O5.8 L5.5 D3.7 C3.3 M3 P3 V1.8 Q1.4 F1.1 B.9 G.9 H.7 J.6 X.4 Y.3 Z.3 K.1 W.1',
        es: 'E13.7 A12.5 O8.7 S8 R6.9 N6.7 I6.3 D5.9 L5 C4.7 T4.6 U3.9 M3.2 P2.5 B1.4 G1 V.9 Y.9 Q.9 H.7 F.7 Z.5 J.4 Ñ.3 X.2 K.1 W.1',
        it: 'E11.8 A11.7 I11.3 O9.8 N6.9 L6.5 R6.4 T5.6 S5 C4.5 D3.7 P3.1 U3 M2.5 V2.1 G1.6 H1.5 F1.2 B.9 Z.5 Q.5 K.1 W.1 X.1 Y.1 J.1',
        nl: 'E18.9 N10 A7.5 T6.8 I6.5 R6.4 O6.1 D5.9 S3.7 L3.6 G3.4 V2.9 H2.4 K2.3 M2.2 U2 B1.6 P1.6 W1.5 J1.5 Z1.4 C1.2 F.8 Y.1 X.1 Q.05',
    };
    /** Sonderbuchstaben, die in der Sprache als eigener Buchstabe im Gitter stehen dürfen */
    const SPECIAL = { de: 'ÄÖÜ', es: 'Ñ' };
    const SPLIT = { 'Ä': 'AE', 'Ö': 'OE', 'Ü': 'UE', 'Æ': 'AE', 'Œ': 'OE', 'Ø': 'O', 'ẞ': 'SS', 'ß': 'SS', 'Ð': 'D', 'Þ': 'TH', 'Ł': 'L' };

    function freqTable(lang, keep) {
        const src = FREQ[lang] || FREQ.en;
        const sp = keep ? (SPECIAL[lang] || '') : '';
        const out = [];
        let sum = 0;
        for (const part of src.split(' ')) {
            const ch = part[0];
            if (!/[A-Z]/.test(ch) && !sp.includes(ch)) continue;
            sum += parseFloat(part.slice(1));
            out.push([ch, sum]);
        }
        return { list: out, sum };
    }

    /**
     * Ein Wort so, wie es im Gitter steht: Großbuchstaben, ohne Leerzeichen und Satzzeichen.
     * Akzente fallen weg (é wird E). Ä, Ö, Ü (Deutsch) und Ñ (Spanisch) bleiben stehen, wenn keep gesetzt ist,
     * sonst werden sie zu AE, OE, UE und N. ß wird immer SS. Alles, was kein lateinischer Buchstabe ist, fällt weg.
     */
    function normalize(text, lang, keep) {
        const sp = keep ? (SPECIAL[lang] || '') : '';
        let out = '';
        for (const ch of String(text).normalize('NFC').toLocaleUpperCase(lang || 'de')) {
            if (ch >= 'A' && ch <= 'Z') { out += ch; continue; }
            if (sp.includes(ch)) { out += ch; continue; }
            if (SPLIT[ch] && (lang === 'de' || !'ÄÖÜ'.includes(ch))) { out += SPLIT[ch]; continue; }
            const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
            if (/^[A-Z]$/.test(base)) out += base;
        }
        return out;
    }

    /** Wie ein Wort in der Liste über dem Gitter steht: Großbuchstaben, Leerzeichen bleiben */
    function display(text, lang) {
        return String(text).trim().replace(/\s+/g, ' ').toLocaleUpperCase(lang || 'de');
    }

    /** Richtungen als [dx, dy]: waagerecht, senkrecht, schräg (beide Diagonalen), rückwärts verdoppelt alles */
    function dirsFor(o) {
        const out = [];
        if (o.h) out.push([1, 0]);
        if (o.v) out.push([0, 1]);
        if (o.d) out.push([1, 1], [1, -1]);
        if (o.r) out.slice().forEach(([x, y]) => out.push([-x || 0, -y || 0]));
        return out.length ? out : [[1, 0]];
    }
    /** Längstes Wort, das bei diesen Richtungen überhaupt ins Gitter passt */
    function maxLen(w, h, o) {
        let m = 0;
        if (o.h || (!o.v && !o.d)) m = Math.max(m, w);
        if (o.v) m = Math.max(m, h);
        if (o.d) m = Math.max(m, Math.min(w, h));
        return m;
    }

    function shuffle(a, r) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    const rev = s => s.split('').reverse().join('');

    /**
     * Wörter aus einem Vorrat auswählen: passende Länge, keine doppelten, keins steckt in einem anderen
     * (sonst gäbe es EIS zweimal, wenn auch EISBÄR dabei ist). pool = [{ t: Anzeige, k: Gitterform }]
     */
    function pick(pool, n, minL, maxL, seed) {
        const r = rng(seed ^ 0x9e3779b9);
        const ok = pool.filter(p => p.k.length >= minL && p.k.length <= maxL);
        shuffle(ok, r);
        const out = [];
        for (const p of ok) {
            if (out.length >= n) break;
            const pr = rev(p.k);
            if (out.some(q => q.k.includes(p.k) || p.k.includes(q.k) || q.k.includes(pr) || pr.includes(q.k))) continue;
            out.push(p);
        }
        return out;
    }

    /**
     * Das Gitter bauen. o = { words: [{ t, k }], w, h, dirs: {h,v,d,r}, seed, lang, keep, tricky, algo }
     * algo 2 (Standard) verteilt die Wörter übers ganze Gitter, algo 1 ist die alte Art (für ältere geteilte Links).
     * Liefert { grid (String, Zeile für Zeile), w, h, words: [{ t, k, p: [x, y, dx, dy] }], missing: [Anzeige …] }
     * Wörter, die nicht hineinpassen, landen in missing.
     */
    function generate(o) {
        const w = o.w, h = o.h, N = w * h;
        const dirs = dirsFor(o.dirs || {});
        // Feste Reihenfolge (lang vor kurz, sonst alphabetisch), damit dieselben Wörter in jeder Reihenfolge dasselbe Gitter ergeben
        const words = o.words.filter(x => x.k.length >= 2).sort((a, b) => b.k.length - a.k.length || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
        const order = words.map((x, i) => i);
        const algo = o.algo === 1 ? 1 : 2;
        let best = null;
        for (let attempt = 0; attempt < 30; attempt++) {
            const r = rng((o.seed + attempt * 7919) >>> 0);
            const cells = new Array(N).fill('');
            const pos = new Array(words.length).fill(null);
            const ctx = { use: dirs.map(() => 0), axis: new Array(N).fill(0) };
            let missing = 0;
            for (const i of order) {
                const p = algo === 1 ? place(cells, w, h, words[i].k, dirs, r) : spread(cells, w, h, words[i].k, dirs, r, ctx);
                if (p) pos[i] = p; else missing++;
            }
            if (!best || missing < best.missing) best = { cells, pos, missing, r };
            if (!missing) break;
        }
        const { cells, pos, r } = best;
        const placed = words.map((x, i) => ({ t: x.t, k: x.k, p: pos[i] })).filter(x => x.p);
        fill(cells, placed, o, r);
        return {
            grid: cells.join(''), w, h, words: placed,
            missing: words.filter((x, i) => !pos[i]).map(x => x.t),
        };
    }

    /** Einen Platz für ein Wort suchen. Bevorzugt Stellen, an denen es sich mit anderen kreuzt, wie bei einem richtigen Suchsel. */
    function place(cells, w, h, k, dirs, r) {
        const L = k.length;
        const cands = [];
        const fits = (x, y, dx, dy) => {
            let cross = 0;
            for (let i = 0; i < L; i++) {
                const c = cells[(y + dy * i) * w + x + dx * i];
                if (c === '') continue;
                if (c !== k[i]) return -1;
                cross++;
            }
            return cross === L ? -1 : cross;   // ganz auf einem anderen Wort liegen gilt nicht
        };
        const range = (d, size) => d > 0 ? [0, size - L] : d < 0 ? [L - 1, size - 1] : [0, size - 1];
        for (let tries = 0; tries < 250 && cands.length < 24; tries++) {
            const [dx, dy] = dirs[Math.floor(r() * dirs.length)];
            const [x0, x1] = range(dx, w), [y0, y1] = range(dy, h);
            if (x1 < x0 || y1 < y0) continue;
            const x = x0 + Math.floor(r() * (x1 - x0 + 1)), y = y0 + Math.floor(r() * (y1 - y0 + 1));
            const c = fits(x, y, dx, dy);
            if (c >= 0) cands.push({ x, y, dx, dy, c });
        }
        if (!cands.length) {
            // Zufall hat nichts gefunden: alle Stellen der Reihe nach (nur bei engen Gittern nötig)
            for (const [dx, dy] of shuffle(dirs.slice(), r)) {
                const [x0, x1] = range(dx, w), [y0, y1] = range(dy, h);
                for (let y = y0; y <= y1 && cands.length < 24; y++) for (let x = x0; x <= x1 && cands.length < 24; x++) {
                    const c = fits(x, y, dx, dy);
                    if (c >= 0) cands.push({ x, y, dx, dy, c });
                }
            }
        }
        if (!cands.length) return null;
        let pickd = cands[Math.floor(r() * cands.length)];
        if (r() < 0.6) {
            const most = Math.max(...cands.map(c => c.c));
            if (most > 0) { const top = cands.filter(c => c.c === most); pickd = top[Math.floor(r() * top.length)]; }
        }
        for (let i = 0; i < L; i++) cells[(pickd.y + pickd.dy * i) * w + pickd.x + pickd.dx * i] = k[i];
        return [pickd.x, pickd.y, pickd.dx, pickd.dy];
    }

    /**
     * Einen Platz für ein Wort suchen, so dass sich die Wörter übers ganze Gitter verteilen:
     * Stellen mit viel Abstand zu anderen Wörtern zählen mehr, Wörter direkt nebeneinander kaum.
     * Kreuzungen gibt es weiter, aber nur ab und zu. Richtungen, die schon oft vorkamen, sind weniger beliebt.
     * ctx.use zählt mit, wie oft jede Richtung schon dran war, ctx.axis merkt sich je Feld die Achse des Wortes dort
     * (damit zwei Wörter nicht parallel direkt nebeneinander liegen, das sieht sofort nach Klumpen aus).
     */
    const W = { par: 15, dir: 3, cross: 6, noise: 3 };   // Gewichte, ausprobiert an vielen Gittern
    function spread(cells, w, h, k, dirs, r, ctx) {
        const L = k.length, use = ctx.use, axis = ctx.axis;
        const axisOf = (dx, dy) => (dx < 0 || (dx === 0 && dy < 0)) ? 5 - dx * 3 - dy : 5 + dx * 3 + dy;
        const cands = [];
        const seen = new Set();
        const range = (d, size) => d > 0 ? [0, size - L] : d < 0 ? [L - 1, size - 1] : [0, size - 1];
        const fits = (x, y, dx, dy) => {
            let cross = 0;
            for (let i = 0; i < L; i++) {
                const c = cells[(y + dy * i) * w + x + dx * i];
                if (c === '') continue;
                if (c !== k[i]) return -1;
                cross++;
            }
            return cross === L ? -1 : cross;
        };
        const add = (x, y, di) => {
            const key = x + ',' + y + ',' + di;
            if (seen.has(key)) return;
            seen.add(key);
            const c = fits(x, y, dirs[di][0], dirs[di][1]);
            if (c >= 0) cands.push({ x, y, di, c });
        };
        for (let tries = 0; tries < 900 && cands.length < 150; tries++) {
            const di = Math.floor(r() * dirs.length);
            const [dx, dy] = dirs[di];
            const [x0, x1] = range(dx, w), [y0, y1] = range(dy, h);
            if (x1 < x0 || y1 < y0) continue;
            add(x0 + Math.floor(r() * (x1 - x0 + 1)), y0 + Math.floor(r() * (y1 - y0 + 1)), di);
        }
        if (!cands.length) {
            for (const di of shuffle(dirs.map((d, i) => i), r)) {
                const [dx, dy] = dirs[di];
                const [x0, x1] = range(dx, w), [y0, y1] = range(dy, h);
                for (let y = y0; y <= y1 && cands.length < 150; y++) for (let x = x0; x <= x1 && cands.length < 150; x++) add(x, y, di);
            }
        }
        if (!cands.length) return null;
        // Wie voll ist es rund um das Wort? Direkt daneben zählt doppelt, zwei Felder weg halb.
        // Ein Wort, das parallel direkt daneben liegt, zählt richtig viel: genau das sieht nach Klumpen aus.
        const crowd = cd => {
            const [dx, dy] = dirs[cd.di];
            const ax = axisOf(dx, dy);
            const path = new Set();
            for (let i = 0; i < L; i++) path.add((cd.y + dy * i) * w + cd.x + dx * i);
            const near = new Set(), far = new Set();
            for (let i = 0; i < L; i++) {
                const px = cd.x + dx * i, py = cd.y + dy * i;
                for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
                    const nx = px + ox, ny = py + oy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    const j = ny * w + nx;
                    if (path.has(j) || cells[j] === '') continue;
                    if (Math.abs(ox) <= 1 && Math.abs(oy) <= 1) near.add(j); else far.add(j);
                }
            }
            let par = 0;
            for (const j of near) { far.delete(j); if (axis[j] === ax) par++; }
            return 2 * near.size + 0.5 * far.size + W.par * par;
        };
        const total = use.reduce((a, b) => a + b, 0);
        // Kreuzungen sind gern gesehen, sie sparen Platz und verstecken die Wörter besser
        for (const cd of cands) {
            cd.s = -crowd(cd) - W.dir * (use[cd.di] - total / dirs.length) + W.cross * cd.c + r() * W.noise;
        }
        cands.sort((a, b) => b.s - a.s);
        const pickd = cands[Math.floor(r() * Math.min(3, cands.length))];
        const [dx, dy] = dirs[pickd.di];
        for (let i = 0; i < L; i++) {
            const j = (pickd.y + dy * i) * w + pickd.x + dx * i;
            cells[j] = k[i];
            axis[j] = axisOf(dx, dy);
        }
        use[pickd.di]++;
        return [pickd.x, pickd.y, dx, dy];
    }

    /** Leere Felder füllen. „Knifflig“ nimmt gern Buchstaben aus den gesuchten Wörtern, dann gibt es viele Fast-Treffer.
        Taucht ein Wort dadurch ein zweites Mal auf, wird neu gefüllt. */
    function fill(cells, placed, o, r) {
        const ft = freqTable(o.lang, o.keep);
        const own = placed.map(x => x.k).join('');
        const empty = [];
        cells.forEach((c, i) => { if (c === '') empty.push(i); });
        const one = () => {
            if (o.tricky && own && r() < 0.45) return own[Math.floor(r() * own.length)];
            const v = r() * ft.sum;
            for (const [ch, s] of ft.list) if (v < s) return ch;
            return 'E';
        };
        for (let round = 0; round < 25; round++) {
            for (const i of empty) cells[i] = one();
            if (!placed.some(x => count(cells, o.w, o.h, x.k) > 1)) return;
        }
    }

    /** Wie oft ein Wort im Gitter steht, in allen 8 Richtungen. Ein Palindrom (ANNA) an derselben Stelle zählt einmal. */
    function count(cells, w, h, k) {
        const L = k.length;
        const seen = new Set();
        const D = [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (cells[y * w + x] !== k[0]) continue;
            for (const [dx, dy] of D) {
                const ex = x + dx * (L - 1), ey = y + dy * (L - 1);
                if (ex < 0 || ey < 0 || ex >= w || ey >= h) continue;
                let i = 1;
                while (i < L && cells[(y + dy * i) * w + x + dx * i] === k[i]) i++;
                if (i === L) {
                    const a = y * w + x, b = ey * w + ex;
                    seen.add(Math.min(a, b) + ':' + Math.max(a, b));
                }
            }
        }
        return seen.size;
    }

    /** Buchstaben entlang einer Auswahl [x, y, dx, dy, Länge] */
    function letters(grid, w, sel) {
        let s = '';
        for (let i = 0; i < sel[4]; i++) s += grid[(sel[1] + sel[3] * i) * w + sel[0] + sel[2] * i];
        return s;
    }

    /** Passt eine Auswahl zu einem noch nicht gefundenen Wort (vorwärts oder rückwärts gezogen)? Liefert dessen Nummer oder -1. */
    function match(game, sel) {
        if (sel[4] < 2) return -1;
        const s = letters(game.grid, game.w, sel);
        const r = rev(s);
        return game.words.findIndex(x => !x.f && (x.k === s || x.k === r));
    }

    /* ---------- Teilen per Link: alle Angaben, aus denen dasselbe Gitter wieder entsteht ---------- */
    function b64e(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        bytes.forEach(b => { bin += String.fromCharCode(b); });
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function b64d(s) {
        const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
        return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    }
    function encodeShare(g) {
        const o = g.opt;
        return b64e(JSON.stringify({ v: 1, a: o.algo === 2 ? 2 : 1, t: g.title, l: g.lang, w: g.w, h: g.h, s: o.seed, d: ['h', 'v', 'd', 'r'].filter(x => o.dirs[x]).join(''),
            k: o.keep ? 1 : 0, f: o.tricky ? 1 : 0, m: o.lamp ? 1 : 0, p: o.preset || '', x: g.words.map(x => x.src || x.t) }));
    }
    function decodeShare(s) {
        try {
            const j = JSON.parse(b64d(s));
            if (!j || j.v !== 1 || !Array.isArray(j.x)) return null;
            const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v) || a));
            return {
                title: String(j.t || '').slice(0, 80), lang: /^[a-z]{2}$/.test(j.l) ? j.l : 'de',
                w: clamp(j.w, 4, 100), h: clamp(j.h, 4, 100), seed: (+j.s) >>> 0,
                dirs: { h: /h/.test(j.d), v: /v/.test(j.d), d: /d/.test(j.d), r: /r/.test(j.d) },
                algo: j.a === 2 ? 2 : 1,   // Links von vor 1.2.0 haben kein a und bekommen das Gitter wie damals
                keep: !!j.k, tricky: !!j.f, lamp: !!j.m, preset: String(j.p || '').slice(0, 10),
                words: j.x.slice(0, 60).map(x => String(x).slice(0, 60)),
            };
        } catch (e) { return null; }
    }

    const api = { rng, newSeed, normalize, display, dirsFor, maxLen, pick, generate, count, letters, match, encodeShare, decodeShare, SPECIAL };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SuGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
