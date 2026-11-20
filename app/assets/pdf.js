/* Suchsel – Rätselblatt und Lösungsblatt als A4-PDF und als Bild (PNG), ohne fremde Bibliothek und ohne Netz.
   Das Layout wird einmal berechnet (Liste von Zeichenbefehlen in Punkt, y von oben) und dann entweder als PDF geschrieben
   oder auf ein Canvas gezeichnet. Die Vorschau zeigt also genau, was aus dem Drucker kommt.
   Schriften sind die, die jedes PDF-Programm mitbringt (Helvetica, Times, Courier), kodiert als WinAnsi: Umlaute, ß, Ñ und
   Akzente gehen, alles andere wird ohne Akzent geschrieben oder fällt weg.
   SuPdf.layout(d) → { pages, W, H, draw(ctx, i), bytes(), png(scale) }
   d = { title, sub, brand, label: [Rätsel, Lösung], g: { grid, w, h, words: [{ t, sel, color }] }, mode: puzzle|solution|both,
         land, name: [Beschriftung Name, Datum] | null, list, font: sans|serif|mono } */
(function () {
    'use strict';
    // Breiten der Zeichen 32 bis 255 in Tausendsteln der Schriftgröße (Adobe-Metriken, WinAnsi). Courier ist überall 600 breit.
    const W = {
        r: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
        b: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
        tr: [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541,350,500,350,333,500,444,1000,500,500,333,1000,556,333,889,350,611,350,350,333,333,444,444,350,500,1000,333,980,389,333,722,350,444,722,250,333,500,500,500,500,200,500,333,760,276,500,564,333,760,333,400,564,300,300,333,500,453,250,333,300,310,500,750,750,750,444,722,722,722,722,722,722,889,667,611,611,611,611,333,333,333,333,722,722,722,722,722,722,722,564,722,722,722,722,722,722,556,500,444,444,444,444,444,444,667,444,444,444,444,444,278,278,278,278,500,500,500,500,500,500,500,564,500,500,500,500,500,500,500,500],
        tb: [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520,350,500,350,333,500,500,1000,500,500,333,1000,556,333,1000,350,667,350,350,333,333,500,500,350,500,1000,333,1000,389,333,722,350,444,722,250,333,500,500,500,500,220,500,333,747,300,500,570,333,747,333,400,570,300,300,333,556,540,250,333,300,330,500,750,750,750,500,722,722,722,722,722,722,1000,722,667,667,667,667,389,389,389,389,722,722,778,778,778,778,778,570,778,722,722,722,722,722,611,556,500,500,500,500,500,500,722,444,444,444,444,444,278,278,278,278,500,556,500,500,500,500,500,570,500,556,556,556,556,500,556,500],
    }
    const FONTS = {
        sans: { r: 'Helvetica', b: 'Helvetica-Bold', wr: 'r', wb: 'b', css: 'Helvetica, Arial, "Liberation Sans", "Nimbus Sans", sans-serif' },
        serif: { r: 'Times-Roman', b: 'Times-Bold', wr: 'tr', wb: 'tb', css: '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif' },
        mono: { r: 'Courier', b: 'Courier-Bold', wr: '', wb: '', css: '"Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", monospace' },
    };
    // Zeichen, die WinAnsi zwischen 128 und 159 anders belegt als Unicode
    const WIN = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142,
        '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };
    const UNWIN = {};
    for (const ch in WIN) UNWIN[WIN[ch]] = ch;

    /** Text in WinAnsi-Bytes (als String mit Zeichencodes unter 256). Unbekanntes ohne Akzent, sonst weg. */
    function enc(s) {
        let out = '';
        for (const ch of String(s == null ? '' : s).replace(/\s+/g, ' ')) {
            const c = ch.codePointAt(0);
            if ((c >= 32 && c < 127) || (c >= 160 && c < 256)) out += ch;
            else if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
            else if (ch === 'ẞ') out += 'SS';
            else {
                const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
                if (base && base !== ch && base.codePointAt(0) < 256) out += enc(base);
            }
        }
        return out.replace(/ {2,}/g, ' ').trim();
    }
    const dec = s => s.replace(/[\x80-\x9f]/g, ch => UNWIN[ch.charCodeAt(0)] || '');
    const esc = s => s.replace(/[\\()]/g, '\\$&');
    const f = n => (Math.round(n * 100) / 100).toString();
    const rgb = hex => {
        const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
        return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0, 0, 0];
    };
    const css = c => 'rgb(' + c.map(v => Math.round(v * 255)).join(',') + ')';

    function layout(d) {
        const F = FONTS[d.font] || FONTS.sans;
        const PW = d.land ? 841.89 : 595.28, PH = d.land ? 595.28 : 841.89, M = 38;
        const width = (s, size, bold) => {
            const t = W[bold ? F.wb : F.wr];
            let w = 0;
            for (let i = 0; i < s.length; i++) w += t ? t[s.charCodeAt(i) - 32] || 556 : 600;
            return w * size / 1000;
        };
        const g = d.g;
        const GRAY = [0.45, 0.45, 0.45], BLACK = [0, 0, 0], FRAME = [0.72, 0.74, 0.8];
        const pages = d.mode === 'both' ? [false, true] : [d.mode === 'solution'];
        const words = g.words.map(x => ({ s: enc(x.t), sel: x.sel, color: rgb(x.color) }));

        const ops = pages.map(sol => {
            const o = [];
            const text = (x, y, s, size, bold, color, align) => {
                const w = width(s, size, bold);
                o.push({ k: 't', x: align === 'c' ? x - w / 2 : align === 'r' ? x - w : x, y, s, size, bold: !!bold, c: color || BLACK });
            };
            let y = M;
            // Kopf: Überschrift, darunter klein Schwierigkeit und Größe, auf Wunsch Zeile für Name und Datum
            let title = enc(d.title || '');
            while (title.length > 3 && width(title, 22, true) > PW - 2 * M) title = title.slice(0, -2);
            text(M, y + 18, title, 22, true);
            y += 26;
            if (d.sub) { text(M, y + 10, enc(d.sub), 10, false, GRAY); y += 14; }
            if (d.name) {
                y += 8;
                const nl = enc(d.name[0]) + ':', dl = enc(d.name[1]) + ':';
                text(M, y + 12, nl, 11, false);
                const nx = M + width(nl, 11) + 6, dx = PW - M - 120;
                o.push({ k: 'l', x1: nx, y1: y + 14, x2: dx - 24, y2: y + 14, w: 0.6, c: GRAY });
                text(dx, y + 12, dl, 11, false);
                o.push({ k: 'l', x1: dx + width(dl, 11) + 6, y1: y + 14, x2: PW - M, y2: y + 14, w: 0.6, c: GRAY });
                y += 20;
            }
            y += 12;

            // Wortliste unter dem Gitter: so viele Spalten, wie nebeneinander passen
            let fs = words.length > 30 ? 10 : words.length > 20 ? 11 : 13;
            let listH = 0, cols = 1, colW = 0, rows = 0;
            const BOX = fs * 0.85, GAP = 7;
            if (d.list && words.length) {
                const maxW = Math.max(...words.map(x => width(x.s, fs, true)));
                colW = BOX + GAP + maxW + 18;
                cols = Math.max(1, Math.min(6, Math.floor((PW - 2 * M + 18) / colW)));
                rows = Math.ceil(words.length / cols);
                listH = 16 + rows * fs * 1.75;
            }
            const FOOT = 18;
            const availW = PW - 2 * M, availH = PH - y - M - FOOT - listH - 10;
            const cell = Math.max(2, Math.min(availW / g.w, availH / g.h, 56));
            const gw = cell * g.w, gh = cell * g.h;
            const gx = (PW - gw) / 2, gy = y + 6;
            const pad = Math.max(3, cell * 0.3);
            o.push({ k: 'r', x: gx - pad, y: gy - pad, w: gw + 2 * pad, h: gh + 2 * pad, r: Math.min(10, pad * 1.6), lw: 0.9, c: FRAME });
            const cx = x => gx + (x + 0.5) * cell, cy = yy => gy + (yy + 0.5) * cell;
            if (sol) {
                for (const w of words) {
                    if (!w.sel) continue;
                    const s = w.sel;
                    o.push({ k: 'l', x1: cx(s[0]), y1: cy(s[1]), x2: cx(s[0] + s[2] * (s[4] - 1)), y2: cy(s[1] + s[3] * (s[4] - 1)), w: cell * 0.78, c: w.color, a: 0.62, cap: 1 });
                }
            }
            const ls = cell * 0.6;
            for (let yy = 0; yy < g.h; yy++) for (let x = 0; x < g.w; x++) {
                const ch = enc(g.grid[yy * g.w + x]);
                text(cx(x), cy(yy) + ls * 0.36, ch, ls, true, BLACK, 'c');
            }

            // Wortliste
            if (listH) {
                const ly = gy + gh + pad + 18;
                const totalW = Math.min(cols, words.length) * colW - 18;
                const lx = Math.max(M, (PW - totalW) / 2);
                words.forEach((w, i) => {
                    const c = Math.floor(i / rows), r = i % rows;
                    const x = lx + c * colW, yy = ly + r * fs * 1.75;
                    if (sol) o.push({ k: 'r', x, y: yy - BOX * 0.92, w: BOX, h: BOX, r: BOX / 2, fill: w.color, c: w.color, lw: 0.5 });
                    else o.push({ k: 'r', x, y: yy - BOX * 0.92, w: BOX, h: BOX, r: 1.6, lw: 0.8, c: BLACK });
                    text(x + BOX + GAP, yy, w.s, fs, true);
                });
            }

            // Fuß
            text(M, PH - M + 8, enc(d.brand || 'Suchsel'), 8, false, GRAY);
            text(PW - M, PH - M + 8, enc(sol ? d.label[1] : d.label[0]), 8, false, GRAY, 'r');
            return o;
        });

        /* ---------- Als PDF-Datei ---------- */
        function bytes() {
            const alphas = new Map();
            const gs = a => { if (!alphas.has(a)) alphas.set(a, 'GS' + (alphas.size + 1)); return alphas.get(a); };
            const rr = (x, y, w, h, r) => {
                const k = r * 0.5523, L = x, R = x + w, T = PH - y, B = PH - y - h;
                return [f(L + r) + ' ' + f(T) + ' m', f(R - r) + ' ' + f(T) + ' l',
                    f(R - r + k) + ' ' + f(T) + ' ' + f(R) + ' ' + f(T - r + k) + ' ' + f(R) + ' ' + f(T - r) + ' c', f(R) + ' ' + f(B + r) + ' l',
                    f(R) + ' ' + f(B + r - k) + ' ' + f(R - r + k) + ' ' + f(B) + ' ' + f(R - r) + ' ' + f(B) + ' c', f(L + r) + ' ' + f(B) + ' l',
                    f(L + r - k) + ' ' + f(B) + ' ' + f(L) + ' ' + f(B + r - k) + ' ' + f(L) + ' ' + f(B + r) + ' c', f(L) + ' ' + f(T - r) + ' l',
                    f(L) + ' ' + f(T - r + k) + ' ' + f(L + r - k) + ' ' + f(T) + ' ' + f(L + r) + ' ' + f(T) + ' c'].join(' ') + ' h';
            };
            const col = c => c.map(f).join(' ');
            const streams = ops.map(list => list.map(op => {
                if (op.k === 't') return col(op.c) + ' rg BT /' + (op.bold ? 'F2 ' : 'F1 ') + f(op.size) + ' Tf ' + f(op.x) + ' ' + f(PH - op.y) + ' Td (' + esc(op.s) + ') Tj ET';
                if (op.k === 'l') return 'q ' + (op.a ? '/' + gs(op.a) + ' gs ' : '') + col(op.c) + ' RG ' + f(op.w) + ' w ' + (op.cap ? '1 J ' : '')
                    + f(op.x1) + ' ' + f(PH - op.y1) + ' m ' + f(op.x2) + ' ' + f(PH - op.y2) + ' l S Q';
                return 'q ' + col(op.c) + ' RG ' + (op.fill ? col(op.fill) + ' rg ' : '') + f(op.lw) + ' w ' + rr(op.x, op.y, op.w, op.h, op.r) + (op.fill ? ' B' : ' S') + ' Q';
            }).join('\n'));
            const objs = [];
            const add = s => { objs.push(s); return objs.length; };
            const cat = add(''), pagesId = add('');
            const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /' + F.r + ' /Encoding /WinAnsiEncoding >>');
            const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /' + F.b + ' /Encoding /WinAnsiEncoding >>');
            const gsd = [...alphas].map(([a, n]) => '/' + n + ' << /Type /ExtGState /ca ' + f(a) + ' /CA ' + f(a) + ' >>').join(' ');
            const res = '<< /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >>' + (gsd ? ' /ExtGState << ' + gsd + ' >>' : '') + ' >>';
            const kids = streams.map(s => {
                const c = add('<< /Length ' + s.length + ' >>\nstream\n' + s + '\nendstream');
                return add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + f(PW) + ' ' + f(PH) + '] /Resources ' + res + ' /Contents ' + c + ' 0 R >>');
            });
            objs[cat - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
            objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map(k => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
            const info = add('<< /Title (' + esc(enc(d.title || 'Suchsel')) + ') /Producer (Suchsel) >>');
            let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
            const offs = objs.map((s, i) => { const at = out.length; out += (i + 1) + ' 0 obj\n' + s + '\nendobj\n'; return at; });
            const xref = out.length;
            out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
            out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + cat + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
            const b = new Uint8Array(out.length);
            for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 255;
            return b;
        }

        /* ---------- Seite i auf ein Canvas zeichnen. Der Kontext muss so skaliert sein, dass 1 Einheit 1 Punkt ist. ---------- */
        function draw(ctx, i) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, PW, PH);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
            for (const op of ops[i] || []) {
                if (op.k === 't') {
                    ctx.font = (op.bold ? 'bold ' : '') + op.size + 'px ' + F.css;
                    ctx.fillStyle = css(op.c);
                    ctx.fillText(dec(op.s), op.x, op.y);
                } else if (op.k === 'l') {
                    ctx.globalAlpha = op.a || 1;
                    ctx.strokeStyle = css(op.c);
                    ctx.lineWidth = op.w;
                    ctx.lineCap = op.cap ? 'round' : 'butt';
                    ctx.beginPath(); ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke();
                    ctx.globalAlpha = 1;
                } else {
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(op.x, op.y, op.w, op.h, op.r); else ctx.rect(op.x, op.y, op.w, op.h);
                    if (op.fill) { ctx.fillStyle = css(op.fill); ctx.fill(); }
                    ctx.strokeStyle = css(op.c);
                    ctx.lineWidth = op.lw;
                    ctx.stroke();
                }
            }
        }

        /** Alle Seiten untereinander als PNG (Blob). scale 3 ≈ 216 dpi. */
        function png(scale) {
            const gap = 24;
            const c = document.createElement('canvas');
            c.width = Math.round(PW * scale);
            c.height = Math.round((PH * ops.length + gap * (ops.length - 1)) * scale);
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#d9dde6';
            ctx.fillRect(0, 0, c.width, c.height);
            ops.forEach((_, i) => {
                ctx.setTransform(scale, 0, 0, scale, 0, i * (PH + gap) * scale);
                draw(ctx, i);
            });
            return new Promise(res => c.toBlob(res, 'image/png'));
        }

        // Kleinste Schrift im Gitter in Millimetern, für den Hinweis bei sehr großen Gittern
        const cellMm = Math.min((PW - 2 * M) / g.w, (PH - 200) / g.h) * 25.4 / 72;
        return { pages: ops.length, W: PW, H: PH, draw, bytes, png, cellMm };
    }

    window.SuPdf = { layout };
})();
