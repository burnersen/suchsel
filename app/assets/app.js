/* Suchsel – die App im Browser: Spielablauf, Wortliste, Fenster (Neues Rätsel, Meine Wörter, Drucken, Einstellungen …),
   Hinweis zum Installieren und die Sperre nach ein paar Rätseln im Browser-Tab.
   Alles, was der Nutzer anlegt (eigene Wörter, Einstellungen, Statistik, das laufende Rätsel), bleibt im Speicher des Geräts.
   Der Server wird nur gefragt, ob im Browser-Tab noch ein neues Rätsel frei ist. Als installierte App fragt Suchsel nie. */
(function () {
    'use strict';
    const $ = s => document.querySelector(s);
    const root = document.documentElement;
    const WORD_URLS = JSON.parse(root.dataset.words || '{}');
    const LANGS = { de: 'Deutsch', en: 'English', fr: 'Français', es: 'Español', it: 'Italiano', nl: 'Nederlands' };
    const LINKS = { github: 'https://github.com/burnersen/suchsel', web: 'https://tech.burnersen.de/', kofi: 'https://ko-fi.com/burnersen' };
    // Gut unterscheidbare, helle Farben, auf denen dunkle Buchstaben lesbar bleiben. Reihenfolge so, dass Nachbarn sich deutlich abheben.
    const COLORS = ['#FFD43B', '#74C0FC', '#8CE99A', '#F783AC', '#FFA94D', '#B197FC', '#63E6BE', '#FF8787', '#C0EB75', '#91A7FF',
        '#E599F7', '#66D9E8', '#FAB005', '#4DABF7', '#51CF66', '#F06595', '#FF922B', '#9775FA', '#20C997', '#FFC9C9'];
    const PRESETS = {
        leicht: { n: 6, w: 10, h: 10, dirs: { h: 1, v: 1, d: 0, r: 0 }, tricky: false },
        mittel: { n: 10, w: 13, h: 13, dirs: { h: 1, v: 1, d: 1, r: 0 }, tricky: false },
        schwer: { n: 15, w: 16, h: 16, dirs: { h: 1, v: 1, d: 1, r: 1 }, tricky: false },
        profi: { n: 20, w: 20, h: 20, dirs: { h: 1, v: 1, d: 1, r: 1 }, tricky: true },
    };
    const PRESET_NAMES = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer', profi: 'Profi', eigen: 'Eigene' };

    /* ---------- Speicher ---------- */
    const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem('su_' + k)); return v == null ? d : v; } catch (e) { return d; } };
    const save = (k, v) => { try { localStorage.setItem('su_' + k, JSON.stringify(v)); } catch (e) {} };

    const navLang = () => {
        for (const l of navigator.languages || [navigator.language || 'de']) { const s = String(l).slice(0, 2).toLowerCase(); if (LANGS[s]) return s; }
        return 'en';
    };
    const set = Object.assign({ lang: navLang(), theme: 'auto', font: 'sans', lines: false, timer: true, vibrate: true }, load('set', {}));
    if (!LANGS[set.lang]) set.lang = 'en';
    const wordLang = l => WORD_URLS[l] ? l : WORD_URLS.en ? 'en' : Object.keys(WORD_URLS)[0] || 'de';
    let newOpt = Object.assign({ cat: 'rnd', wl: wordLang(set.lang), preset: 'leicht', n: 6, w: 10, h: 10, dirs: { h: 1, v: 1, d: 0, r: 0 },
        tricky: false, keep: true, custom: '', customTitle: '', saveCat: false }, load('new', {}));
    let own = Object.assign({ cats: [], extra: {} }, load('own', {}));
    let stats = Object.assign({ played: 0, solved: 0, words: 0, hints: 0, time: 0, best: {} }, load('stats', {}));
    let exp = Object.assign({ mode: 'puzzle', land: false, list: true, name: false, title: '' }, load('exp', {}));
    let game = null;
    let board = null;
    let quota = null;          // Antwort des Servers: { ok, limit, used, left }
    let installEvt = null;     // beforeinstallprompt (Chrome, Edge, Android)
    let bannerHidden = false;  // nur für diesen Besuch, beim nächsten Öffnen ist der Hinweis wieder da

    /* ---------- Übersetzung ---------- */
    function t(s, vars) {
        const tr = window.SU_I18N && SU_I18N[set.lang] && SU_I18N[set.lang][s];
        let out = tr || s;
        if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
        return out;
    }

    /* ---------- Bausteine ---------- */
    function el(tag, props, ...kids) {
        const [name, ...cls] = tag.split('.');
        const e = document.createElement(name || 'div');
        if (cls.length) e.className = cls.join(' ');
        for (const k in props || {}) {
            const v = props[k];
            if (v == null || v === false) continue;
            if (k === 'class') e.className += (e.className ? ' ' : '') + v;
            else if (k === 'text') e.textContent = v;
            else if (k === 'html') e.innerHTML = v;
            else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
            else if (k === 'vars') for (const n in v) e.style.setProperty(n, v[n]);
            else if (k === 'value') e.value = v;
            else if (k === 'checked') e.checked = !!v;
            else e.setAttribute(k, v === true ? '' : v);
        }
        for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
        return e;
    }
    const ICONS = {
        close: 'M6 6l12 12M18 6L6 18',
        plus: 'M12 5v14M5 12h14',
        shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
        print: 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
        share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13',
        book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5',
        chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
        gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
        help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
        download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
        info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
        check: 'M20 6L9 17l-5-5',
        edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
        trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
        play: 'M6 4l14 8-14 8z',
        upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
        dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01',
        mix: 'M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3',
        pen: 'M3 21v-3.6L15.4 5l3.6 3.6L6.6 21H3zM13.5 7l3.5 3.5',
        star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
        phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
        sharei: 'M8 7l4-4 4 4M12 3v12M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1',
        dots: 'M12 5h.01M12 12h.01M12 19h.01',
        install: 'M4 4h16v12H4zM8 20h8M12 16v4M12 7v6M9 10l3 3 3-3',
        heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
        github: 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.5 6.4-7A5.4 5.4 0 0 0 20 4.8 5 5 0 0 0 19.9 1S18.7.7 16 2.5a13.4 13.4 0 0 0-7 0C6.3.7 5.1 1 5.1 1A5 5 0 0 0 5 4.8a5.4 5.4 0 0 0-1.5 3.7c0 5.4 3.3 6.6 6.4 7A3.4 3.4 0 0 0 9 18.1V22',
        globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
        link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
        image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
        hand: 'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
    };
    function icon(name) {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', ICONS[name] || '');
        s.append(p);
        return s;
    }
    const fmtTime = ms => {
        const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
        return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
    };
    const slug = s => String(s || 'suchsel').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'suchsel';
    const isTouch = () => matchMedia('(pointer: coarse)').matches;

    /* ---------- Hinweise unten ---------- */
    let toastT = 0;
    function toast(msg, action) {
        const tEl = $('#toast');
        tEl.replaceChildren(el('span', { text: msg }));
        if (action) tEl.append(el('button.btn.small', { type: 'button', text: action.label, onclick: () => { tEl.hidden = true; action.fn(); } }));
        tEl.hidden = false;
        clearTimeout(toastT);
        toastT = setTimeout(() => { tEl.hidden = true; }, action ? 9000 : 3800);
    }

    /* ---------- Aussehen ---------- */
    const darkMq = matchMedia('(prefers-color-scheme: dark)');
    function applyTheme() {
        const dark = set.theme === 'dark' || (set.theme === 'auto' && darkMq.matches);
        root.dataset.theme = dark ? 'dark' : 'light';
        const meta = document.querySelector('meta[name=theme-color]');
        if (meta) meta.content = dark ? '#121826' : '#3b5bdb';
        if (board) board.setStyle(set.font, set.lines);
    }
    darkMq.addEventListener && darkMq.addEventListener('change', applyTheme);

    /* ---------- Wortschatz ---------- */
    const bank = {};
    /** Textdatei einer Sprache: „== Gruppe ==“, „[id] Name“, darunter die Wörter mit Komma getrennt */
    function parseBank(txt) {
        const out = { groups: [], cats: {} };
        let group = null, cat = null;
        for (let line of txt.split('\n')) {
            line = line.trim();
            if (!line || line[0] === '#') continue;
            let m = /^==\s*(.+?)\s*==$/.exec(line);
            if (m) { group = { name: m[1], cats: [] }; out.groups.push(group); continue; }
            m = /^\[([a-z0-9_-]+)\]\s*(.+)$/.exec(line);
            if (m) {
                cat = { id: m[1], name: m[2], words: [] };
                out.cats[cat.id] = cat;
                if (!group) { group = { name: '', cats: [] }; out.groups.push(group); }
                group.cats.push(cat.id);
                continue;
            }
            if (cat) for (const w of line.split(',')) { const x = w.trim(); if (x) cat.words.push(x); }
        }
        return out;
    }
    async function loadBank(l) {
        l = wordLang(l);
        if (bank[l]) return bank[l];
        const r = await fetch(WORD_URLS[l]);
        if (!r.ok) throw new Error('words ' + r.status);
        bank[l] = parseBank(await r.text());
        return bank[l];
    }
    /** Wörter einer Kategorie samt eigener Ergänzungen */
    function catWords(b, l, id) {
        const c = b.cats[id];
        return (c ? c.words : []).concat(own.extra[l + ':' + id] || []);
    }
    /** Eingetippte Wörter: getrennt durch Zeilen, Kommas oder Semikolons */
    function parseList(s) {
        const seen = new Set(), out = [];
        for (let w of String(s || '').split(/[\n,;]+/)) {
            w = w.trim().replace(/\s+/g, ' ');
            if (!w || w.length > 40) continue;
            const k = w.toLocaleLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(w);
        }
        return out.slice(0, 60);
    }

    /* ---------- Installiert oder im Browser-Tab? ---------- */
    function isApp() {
        return ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(m => matchMedia('(display-mode: ' + m + ')').matches)
            || navigator.standalone === true;
    }
    function platform() {
        const ua = navigator.userAgent;
        if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
        if (/Android/.test(ua)) return /Firefox/.test(ua) ? 'android-firefox' : 'android';
        if (/Firefox/.test(ua)) return 'firefox';
        if (/Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)) return 'mac-safari';
        return 'desktop';
    }

    /** Darf hier ein neues Rätsel starten? Im Browser-Tab zählt der Server mit, als App immer. */
    async function allowNew() {
        if (isApp()) return true;
        try {
            const r = await fetch('?action=play', { method: 'POST', headers: { 'X-Suchsel': '1' }, cache: 'no-store' });
            if (!r.ok) return true;
            quota = await r.json();
            renderBanner();
            if (quota.ok) return true;
            showLocked();
            return false;
        } catch (e) {
            return true;   // ohne Verbindung zum Server: spielen lassen
        }
    }
    async function fetchQuota() {
        try {
            const r = await fetch('?action=quota', { cache: 'no-store' });
            if (r.ok) { quota = await r.json(); renderBanner(); }
        } catch (e) {}
    }

    /* ---------- Neues Rätsel ---------- */
    function presetOf(o) {
        for (const k in PRESETS) {
            const p = PRESETS[k];
            if (p.n === o.n && p.w === o.w && p.h === o.h && !!p.tricky === !!o.tricky && ['h', 'v', 'd', 'r'].every(x => !!p.dirs[x] === !!o.dirs[x])) return k;
        }
        return 'eigen';
    }
    const item = (src, l, keep) => ({ src, t: SuGame.display(src, l), k: SuGame.normalize(src, l, keep) });

    /**
     * Ein Rätsel bauen und anzeigen. o: Einstellungen wie newOpt. Mit words (Liste) wird genau diese genommen (Teilen, Neu mischen),
     * mit seed genau dieser Startwert. Liefert false, wenn nichts gestartet wurde.
     */
    async function startNew(o, extra) {
        extra = extra || {};
        const l = wordLang(o.wl);
        let b;
        try { b = await loadBank(l); } catch (e) { toast(t('Der Wortschatz konnte nicht geladen werden.')); return false; }
        let title = extra.title || '', list = extra.words || null, fromPool = false, catId = o.cat;
        let w = o.w, h = o.h;
        const dirs = o.dirs;
        if (!list) {
            if (o.cat === 'custom') {
                list = parseList(o.custom);
                title = o.customTitle.trim() || t('Eigene Wörter');
                if (!list.length) { toast(t('Bitte erst ein paar Wörter eintippen.')); return false; }
            } else if (o.cat === 'mix') {
                list = [];
                for (const id in b.cats) list.push(...catWords(b, l, id));
                title = t('Bunt gemischt');
                fromPool = true;
            } else if (o.cat.startsWith('o:')) {
                const c = own.cats.find(x => 'o:' + x.id === o.cat);
                if (!c) { toast(t('Diese Kategorie gibt es nicht mehr.')); return false; }
                list = c.words.slice();
                title = c.name;
                fromPool = list.length > o.n;
            } else {
                let id = o.cat.startsWith('b:') ? o.cat.slice(2) : '';
                if (!b.cats[id]) {   // Zufall: ein Thema, das genug passende Wörter hat
                    const ml = SuGame.maxLen(w, h, dirs);
                    const ids = Object.keys(b.cats).filter(x => catWords(b, l, x).filter(s => { const k = SuGame.normalize(s, l, o.keep); return k.length >= 3 && k.length <= ml; }).length >= o.n);
                    id = ids.length ? ids[Math.floor(Math.random() * ids.length)] : Object.keys(b.cats)[0];
                    catId = 'b:' + id;
                }
                list = catWords(b, l, id);
                title = b.cats[id] ? b.cats[id].name : '';
                fromPool = true;
            }
        }
        if (!(await allowNew())) return false;
        const seed = extra.seed != null ? extra.seed >>> 0 : SuGame.newSeed();
        const seen = new Set();
        let items = [], short = [];
        for (const s of list) {
            const it = item(s, l, o.keep);
            if (it.k.length < 3) { if (!fromPool) short.push(it.t); continue; }
            if (seen.has(it.k)) continue;
            seen.add(it.k);
            items.push(it);
        }
        if (fromPool) {
            items = SuGame.pick(items, o.n, 3, SuGame.maxLen(w, h, dirs), seed);
        } else if (!extra.words) {
            // Eigene Wörter: das Gitter wächst mit, bis alles hineinpasst
            const grow = () => { if (dirs.h || !dirs.v) w++; if (dirs.v || dirs.d) h++; if (dirs.d) { w = Math.max(w, h); h = w; } };
            const longest = Math.max(0, ...items.map(x => x.k.length));
            const letters = items.reduce((s, x) => s + x.k.length, 0);
            while ((SuGame.maxLen(w, h, dirs) < longest || letters > 0.6 * w * h) && w < 100 && h < 100) grow();
        }
        if (!items.length) { toast(t('Keins der Wörter passt in dieses Gitter. Mach es größer.')); return false; }
        let res = SuGame.generate({ words: items, w, h, dirs, seed, lang: l, keep: o.keep, tricky: o.tricky });
        for (let i = 0; res.missing.length && !fromPool && !extra.words && i < 4 && w < 100; i++) {
            w = Math.min(100, w + 2); h = Math.min(100, h + 2);
            res = SuGame.generate({ words: items, w, h, dirs, seed, lang: l, keep: o.keep, tricky: o.tricky });
        }
        game = {
            v: 1, title, cat: catId, lang: l, w, h, grid: res.grid,
            words: res.words.map(x => ({ t: x.t, k: x.k, src: items.find(y => y.k === x.k).src, p: x.p, f: null, c: -1 })),
            opt: { seed, dirs: Object.assign({}, dirs), keep: o.keep, tricky: o.tricky, preset: presetOf(Object.assign({}, o, { w, h })), n: o.n },
            found: 0, elapsed: 0, hints: 0, done: false, at: Date.now(),
        };
        game.words.sort((a, b2) => a.t.localeCompare(b2.t, l));
        stats.played++;
        save('stats', stats);
        saveGame();
        render(true);
        const notes = [];
        if (w !== o.w || h !== o.h) notes.push(t('Gitter auf {w} × {h} vergrößert, damit alles passt.', { w, h }));
        if (res.missing.length) notes.push(t('Nicht ins Gitter gepasst: {w}', { w: res.missing.join(', ') }));
        if (short.length) notes.push(t('Zu kurz (mindestens 3 Buchstaben): {w}', { w: short.join(', ') }));
        if (notes.length) toast(notes.join(' '));
        return true;
    }
    function saveGame() { if (game) save('game', game); }

    /* ---------- Spielfeld ---------- */
    const colorOf = w => COLORS[w.c % COLORS.length];
    const foundList = () => game.words.filter(w => w.f).sort((a, b) => a.c - b.c).map(w => ({ sel: w.f, color: colorOf(w) }));
    function nextColor() { return COLORS[(game ? game.found : 0) % COLORS.length]; }

    function render(fresh) {
        if (!game) {
            $('#theme').textContent = 'Suchsel';
            $('#words').replaceChildren();
            board.setPuzzle(null);
            renderStat();
            return;
        }
        $('#theme').textContent = game.title;
        renderWords();
        board.setPuzzle({ grid: game.grid, w: game.w, h: game.h }, !fresh);
        board.setFound(foundList());
        renderStat();
        renderCoach();
    }
    function renderWords() {
        const ul = $('#words');
        ul.classList.toggle('many', game.words.length > 14);
        ul.replaceChildren(...game.words.map(w => el('li', {
            class: w.f ? 'found' : null, vars: w.f ? { '--c': colorOf(w) } : null, text: w.t,
            title: w.f ? t('Antippen zeigt das Wort im Gitter') : null,
            onclick: w.f ? () => board.flash(w.f, colorOf(w)) : null,
        })));
    }
    function renderStat() {
        $('#progress').textContent = game ? game.found + '/' + game.words.length : '';
        $('#timer').textContent = game && set.timer ? fmtTime(game.elapsed) : '';
        $('#timer').hidden = !set.timer;
    }
    function renderCoach() {
        const old = $('#coach');
        if (old) old.remove();
        if (!game || game.done || game.found || stats.words) return;
        const c = el('div.coach', null, icon('hand'), el('span', { text: t('Zieh mit dem Finger oder der Maus über die Buchstaben eines Wortes.') }));
        c.id = 'coach';
        $('#boardWrap').append(c);
    }

    function onSelect(sel, color) {
        if (!game || game.done) return false;
        const i = SuGame.match(game, sel);
        if (i < 0) {
            if (set.vibrate && navigator.vibrate) navigator.vibrate([12, 40, 12]);
            return false;
        }
        const w = game.words[i];
        w.f = sel;
        w.c = game.found;
        game.found++;
        stats.words++;
        if (set.vibrate && navigator.vibrate) navigator.vibrate(35);
        renderWords();
        board.setFound(foundList(), true);
        renderStat();
        renderCoach();
        if (game.found === game.words.length) finish();
        save('stats', stats);
        saveGame();
        return color != null;
    }

    function finish() {
        game.done = true;
        stats.solved++;
        stats.time += game.elapsed;
        const key = game.opt.preset || 'eigen';
        const rec = !stats.best[key] || game.elapsed < stats.best[key];
        if (rec) stats.best[key] = Math.round(game.elapsed);
        save('stats', stats);
        saveGame();
        renderStat();
        celebrate();
        setTimeout(() => showDone(rec), 900);
    }

    function hint() {
        if (!game || game.done) return;
        const open = game.words.filter(w => !w.f);
        if (!open.length) return;
        const w = open[Math.floor(Math.random() * open.length)];
        game.hints++;
        stats.hints++;
        save('stats', stats);
        saveGame();
        board.hint(w.p[0], w.p[1]);
        toast(t('Hier fängt eins der Wörter an.'));
    }

    /* ---------- Stoppuhr: läuft nur, solange das Rätsel zu sehen ist ---------- */
    let lastTick = 0, lastSave = 0;
    setInterval(() => {
        const running = game && !game.done && document.visibilityState === 'visible' && !sheets.length;
        const now = performance.now();
        if (running && lastTick) game.elapsed += now - lastTick;
        lastTick = running ? now : 0;
        if (running && now - lastSave > 5000) { lastSave = now; saveGame(); }
        if (game && set.timer) $('#timer').textContent = fmtTime(game.elapsed);
    }, 500);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveGame(); });
    addEventListener('pagehide', saveGame);

    /* ---------- Konfetti ---------- */
    function celebrate() {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const c = el('canvas.confetti');
        document.body.append(c);
        const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
        c.width = W * dpr; c.height = H * dpr;
        const ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        const parts = Array.from({ length: 160 }, () => ({
            x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
            r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, s: 6 + Math.random() * 7, c: COLORS[Math.floor(Math.random() * COLORS.length)],
        }));
        const t0 = performance.now();
        (function step(now) {
            const k = (now - t0) / 2800;
            ctx.clearRect(0, 0, W, H);
            for (const p of parts) {
                p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
                ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.7) / 0.3);
                ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66);
                ctx.restore();
            }
            if (k < 1) requestAnimationFrame(step); else c.remove();
        })(t0);
    }

    /* ---------- Fenster (von unten, am Rechner mittig). Zurück-Taste und Esc schließen das oberste. ---------- */
    const sheets = [];
    function sheet(title, body, opts) {
        opts = opts || {};
        const close = el('button.iconbtn', { type: 'button', 'aria-label': t('Schließen') }, icon('close'));
        const panel = el('div.sheet' + (opts.cls ? '.' + opts.cls : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
            el('header', null, el('h2', { text: title }), close),
            el('div.body', null, body),
            opts.foot ? el('div.foot', null, opts.foot) : null);
        const wrap = el('div.sheet-wrap', null, panel);
        const s = { wrap, panel, onClose: opts.onClose, closed: false };
        s.close = () => closeSheet(s);
        close.addEventListener('click', s.close);
        wrap.addEventListener('pointerdown', e => { if (e.target === wrap) s.downOnBg = true; });
        wrap.addEventListener('click', e => { if (e.target === wrap && s.downOnBg && !opts.sticky) s.close(); s.downOnBg = false; });
        $('#layer').append(wrap);
        sheets.push(s);
        history.pushState({ su: sheets.length }, '');
        return s;
    }
    function removeSheet(s) {
        if (s.closed) return;
        s.closed = true;
        const i = sheets.indexOf(s);
        if (i >= 0) sheets.splice(i, 1);
        s.wrap.classList.add('out');
        setTimeout(() => s.wrap.remove(), 180);
        if (s.onClose) s.onClose();
    }
    function closeSheet(s) {
        if (s.closed) return;
        if (sheets[sheets.length - 1] === s && history.state && history.state.su) history.back();
        else removeSheet(s);
    }
    let skipPop = 0;
    addEventListener('popstate', () => {
        if (skipPop) { skipPop--; return; }
        const s = sheets[sheets.length - 1];
        if (s) removeSheet(s);
    });
    function closeAll() {
        const n = sheets.length;
        if (!n) return;
        sheets.slice().reverse().forEach(removeSheet);
        const depth = Math.min(n, history.state && history.state.su || 0);
        if (depth) { skipPop++; history.go(-depth); }
    }

    // Kleine Bausteine für die Fenster
    const section = (title, ...kids) => el('section.sec', null, title ? el('h3', { text: title }) : null, ...kids);
    function seg(options, value, onchange) {
        const box = el('div.seg', { role: 'radiogroup' });
        const paint = v => box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));
        for (const [v, label, sub] of options) {
            box.append(el('button', { type: 'button', 'data-v': v, role: 'radio', onclick: () => { paint(v); onchange(v); } },
                el('b', { text: label }), sub ? el('small', { text: sub }) : null));
        }
        paint(value);
        box.paint = paint;
        return box;
    }
    function toggle(label, value, onchange, sub) {
        const inp = el('input', { type: 'checkbox', checked: value, onchange: () => onchange(inp.checked) });
        return el('label.toggle', null, el('span', null, el('b', { text: label }), sub ? el('small', { text: sub }) : null), inp, el('i'));
    }
    function stepper(value, min, max, onchange) {
        const inp = el('input', { type: 'number', inputmode: 'numeric', min, max, value });
        const setv = v => { v = Math.max(min, Math.min(max, Math.round(+v) || min)); inp.value = v; onchange(v); };
        inp.addEventListener('change', () => setv(inp.value));
        const box = el('div.stepper', null,
            el('button.iconbtn', { type: 'button', 'aria-label': '−', onclick: () => setv(+inp.value - 1) }, el('span', { text: '−' })),
            inp,
            el('button.iconbtn', { type: 'button', 'aria-label': '+', onclick: () => setv(+inp.value + 1) }, el('span', { text: '+' })));
        box.set = v => { inp.value = v; };
        return box;
    }
    function menuItem(ic, label, fn, sub) {
        return el('button.mitem', { type: 'button', onclick: fn }, icon(ic), el('span', null, el('b', { text: label }), sub ? el('small', { text: sub }) : null));
    }

    /* ---------- Menü ---------- */
    function showMenu() {
        let s;
        const go = fn => () => { s.close(); setTimeout(fn, 60); };
        const items = [
            menuItem('plus', t('Neues Rätsel'), go(showNew), t('Thema, Schwierigkeit, eigene Wörter')),
            game ? menuItem('shuffle', t('Neu mischen'), go(reshuffle), t('Gleiche Wörter, neues Gitter')) : null,
            game ? menuItem('print', t('Drucken und Bild'), go(showExport), t('A4 als PDF oder PNG, leer oder mit Lösung')) : null,
            game ? menuItem('share', t('Rätsel teilen'), go(showShare), t('Link, der genau dieses Gitter öffnet')) : null,
            menuItem('book', t('Meine Wörter'), go(showOwn), t('Eigene Kategorien anlegen und ergänzen')),
            menuItem('chart', t('Statistik'), go(showStats)),
            menuItem('gear', t('Einstellungen'), go(showSettings), t('Sprache, Design, Schrift, Sicherung')),
            menuItem('help', t('Hilfe'), go(showHelp)),
            !isApp() ? menuItem('install', t('Als App installieren'), go(showInstall), t('Kostenlos, unbegrenzt, auch offline')) : null,
            menuItem('info', t('Über Suchsel'), go(showAbout)),
        ];
        s = sheet(t('Menü'), el('div.menu', null, items), { cls: 'narrow' });
    }

    /* ---------- Neues Rätsel ---------- */
    async function showNew() {
        const o = JSON.parse(JSON.stringify(newOpt));
        o.wl = wordLang(o.wl);
        let b;
        try { b = await loadBank(o.wl); } catch (e) { toast(t('Der Wortschatz konnte nicht geladen werden.')); return; }
        const body = el('div.newgame');
        const catBox = el('div.cats');
        const customBox = el('div.custom');
        const fine = el('div.fine');
        const note = el('p.note');
        let presetSeg;

        // Thema
        const search = el('input.search', { type: 'search', placeholder: t('Thema suchen …'), autocomplete: 'off' });
        function chip(key, label, count, ic) {
            return el('button.chip', { type: 'button', 'data-k': key, class: o.cat === key || (key === 'b:' + o.cat) ? 'on' : null,
                onclick: () => { o.cat = key; paintCats(); paintCustom(); paintNote(); } },
                ic ? icon(ic) : null, el('span', { text: label }), count != null ? el('small', { text: String(count) }) : null);
        }
        function paintCats() {
            catBox.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.k === o.cat));
        }
        function buildCats() {
            const q = search.value.trim().toLocaleLowerCase();
            const hit = s => !q || s.toLocaleLowerCase().includes(q);
            const parts = [];
            if (!q) parts.push(el('div.chips.top', null,
                chip('rnd', t('Zufälliges Thema'), null, 'dice'), chip('mix', t('Bunt gemischt'), null, 'mix'), chip('custom', t('Eigene Wörter eintippen'), null, 'pen')));
            const mine = own.cats.filter(c => hit(c.name));
            if (mine.length) parts.push(el('h4', { text: t('Meine Kategorien') }), el('div.chips', null, mine.map(c => chip('o:' + c.id, c.name, c.words.length))));
            for (const g of b.groups) {
                const cats = g.cats.filter(id => hit(b.cats[id].name) || (q && b.cats[id].words.some(w => w.toLocaleLowerCase() === q)));
                if (!cats.length) continue;
                parts.push(el('h4', { text: g.name }), el('div.chips', null, cats.map(id => chip('b:' + id, b.cats[id].name, catWords(b, o.wl, id).length))));
            }
            if (!parts.length) parts.push(el('p.muted', { text: t('Nichts gefunden.') }));
            catBox.replaceChildren(...parts);
        }
        search.addEventListener('input', buildCats);

        const ta = el('textarea', { rows: 4, placeholder: t('Wörter mit Komma oder Zeilenumbruch trennen, z. B. Sonne, Strand, Eis'), value: o.custom });
        const ti = el('input', { type: 'text', placeholder: t('Überschrift, z. B. Im Sommer'), value: o.customTitle, maxlength: 60 });
        const cnt = el('small.muted');
        const updCnt = () => { cnt.textContent = t('{n} Wörter', { n: parseList(ta.value).length }); };
        ta.addEventListener('input', () => { o.custom = ta.value; updCnt(); paintNote(); });
        ti.addEventListener('input', () => { o.customTitle = ti.value; });
        customBox.append(ti, ta, el('div.row', null, cnt,
            toggle(t('Als Kategorie speichern'), o.saveCat, v => { o.saveCat = v; })));
        updCnt();
        function paintCustom() { customBox.hidden = o.cat !== 'custom'; nRow.hidden = o.cat === 'custom'; }

        // Schwierigkeit
        const applyPreset = k => {
            if (!PRESETS[k]) return;
            const p = PRESETS[k];
            Object.assign(o, { n: p.n, w: p.w, h: p.h, tricky: p.tricky, dirs: Object.assign({}, p.dirs), preset: k });
            paintFine();
        };
        presetSeg = seg([
            ['leicht', t('Leicht'), t('6 Wörter, nur → und ↓')],
            ['mittel', t('Mittel'), t('10 Wörter, auch schräg')],
            ['schwer', t('Schwer'), t('15 Wörter, auch rückwärts')],
            ['profi', t('Profi'), t('20 Wörter, knifflig')],
        ], presetOf(o), applyPreset);

        // Feineinstellung
        const nVal = el('b.val');
        const nRange = el('input', { type: 'range', min: 5, max: 20, step: 1, value: o.n });
        nRange.addEventListener('input', () => { o.n = +nRange.value; nVal.textContent = o.n; changed(); });
        const nRow = el('div.field', null, el('label', null, t('Anzahl der Wörter'), nVal), nRange);
        const ws = stepper(o.w, 5, 100, v => { o.w = v; changed(); });
        const hs = stepper(o.h, 5, 100, v => { o.h = v; changed(); });
        const quick = el('div.chips.small', null, [[10, 10], [15, 15], [20, 20], [30, 30], [50, 50], [100, 100], [16, 10], [24, 14]].map(([x, y]) =>
            el('button.chip', { type: 'button', text: x + ' × ' + y, onclick: () => { o.w = x; o.h = y; ws.set(x); hs.set(y); changed(); } })));
        const dirBox = el('div.chips.dirs');
        const dirDefs = [['h', '→', t('Waagerecht')], ['v', '↓', t('Senkrecht')], ['d', '↘', t('Schräg')], ['r', '←', t('Rückwärts')]];
        function paintDirs() {
            dirBox.replaceChildren(...dirDefs.map(([k, arrow, label]) => el('button.chip', { type: 'button', class: o.dirs[k] ? 'on' : null,
                onclick: () => {
                    o.dirs[k] = o.dirs[k] ? 0 : 1;
                    if (!o.dirs.h && !o.dirs.v && !o.dirs.d) o.dirs.h = 1;
                    paintDirs(); changed();
                } }, el('b', { text: arrow }), el('span', { text: label }))));
        }
        const trickyT = el('div');
        const keepT = el('div');
        const langSel = el('select', null, Object.keys(WORD_URLS).map(l => el('option', { value: l, text: LANGS[l] || l, selected: l === o.wl ? 'selected' : null })));
        langSel.addEventListener('change', async () => {
            o.wl = langSel.value;
            try { b = await loadBank(o.wl); } catch (e) { toast(t('Der Wortschatz konnte nicht geladen werden.')); return; }
            if (o.cat.startsWith('b:') && !b.cats[o.cat.slice(2)]) o.cat = 'rnd';
            buildCats(); paintKeep(); paintNote();
        });
        function paintKeep() {
            const sp = SuGame.SPECIAL[o.wl];
            keepT.replaceChildren(sp ? toggle(t('{x} im Gitter lassen', { x: sp.split('').join(' ') }), o.keep, v => { o.keep = v; paintNote(); },
                t('Sonst werden sie ersetzt ({y}).', { y: o.wl === 'de' ? 'AE, OE, UE' : 'N' })) : '');
        }
        function paintFine() {
            nRange.value = o.n; nVal.textContent = o.n; ws.set(o.w); hs.set(o.h);
            paintDirs();
            trickyT.replaceChildren(toggle(t('Knifflige Füllbuchstaben'), o.tricky, v => { o.tricky = v; changed(); }, t('Die freien Felder nehmen gern Buchstaben aus den gesuchten Wörtern.')));
            presetSeg.paint(presetOf(o));
            paintNote();
        }
        function changed() { o.preset = presetOf(o); presetSeg.paint(o.preset); paintNote(); }
        function paintNote() {
            const ml = SuGame.maxLen(o.w, o.h, o.dirs);
            let msg = t('Gitter {w} × {h}, Wörter bis {m} Buchstaben.', { w: o.w, h: o.h, m: ml });
            if (o.cat === 'custom') {
                const list = parseList(o.custom).map(s => SuGame.normalize(s, o.wl, o.keep));
                const longest = Math.max(0, ...list.map(k => k.length));
                if (longest > ml) msg += ' ' + t('Dein längstes Wort hat {n} Buchstaben, das Gitter wird dafür größer.', { n: longest });
            }
            if (o.w * o.h > 1600) msg += ' ' + t('Großes Gitter: mit Plus und Minus oder zwei Fingern zoomen.');
            note.textContent = msg;
        }
        fine.append(
            nRow,
            el('div.field', null, el('label', { text: t('Größe des Gitters (Breite × Höhe)') }), el('div.row.size', null, ws, el('span', { text: '×' }), hs), quick),
            el('div.field', null, el('label', { text: t('Richtungen') }), dirBox),
            trickyT, keepT,
            el('div.field', null, el('label', { text: t('Sprache der Wörter') }), langSel));

        buildCats(); paintCustom(); paintFine(); paintKeep();
        const det = el('details.more', { open: o.preset === 'eigen' ? 'open' : null }, el('summary', { text: t('Feineinstellung') }), fine);
        body.append(
            section(t('Thema'), search, catBox, customBox),
            section(t('Schwierigkeit'), presetSeg, det),
            note);
        const go = el('button.btn.primary.big', { type: 'button' }, icon('play'), el('span', { text: t('Los geht\'s!') }));
        const s = sheet(t('Neues Rätsel'), body, { foot: go, cls: 'wide' });
        go.addEventListener('click', async () => {
            go.disabled = true;
            if (o.cat === 'custom' && o.saveCat && parseList(o.custom).length) {
                const name = o.customTitle.trim() || t('Eigene Wörter');
                const ex = own.cats.find(c => c.name.toLocaleLowerCase() === name.toLocaleLowerCase());
                if (ex) ex.words = parseList(ex.words.concat(parseList(o.custom)).join('\n'));
                else own.cats.push({ id: Date.now().toString(36), name, words: parseList(o.custom) });
                save('own', own);
            }
            newOpt = o;
            save('new', newOpt);
            const ok = await startNew(o);
            go.disabled = false;
            if (ok) s.close();
        });
    }

    async function reshuffle() {
        if (!game) return;
        const o = Object.assign({}, newOpt, { wl: game.lang, w: game.w, h: game.h, dirs: game.opt.dirs, keep: game.opt.keep, tricky: game.opt.tricky, n: game.words.length, cat: game.cat });
        await startNew(o, { words: game.words.map(w => w.src || w.t), title: game.title });
    }
    const nextGame = () => startNew(newOpt);

    /* ---------- Geschafft ---------- */
    function showDone(rec) {
        const body = el('div.done', null,
            el('div.big', { text: '🎉' }),
            el('p.lead', { text: t('{n} Wörter in {time} gefunden.', { n: game.words.length, time: fmtTime(game.elapsed) }) }),
            rec ? el('p.rec', null, icon('star'), el('span', { text: t('Neue Bestzeit für {p}!', { p: t(PRESET_NAMES[game.opt.preset] || 'Eigene') }) })) : null,
            game.hints ? el('p.muted', { text: t('Mit {n} Tipps.', { n: game.hints }) }) : null);
        const s = sheet(t('Geschafft!'), body, { cls: 'narrow', foot: el('div.btns', null,
            el('button.btn.primary', { type: 'button', onclick: () => { s.close(); setTimeout(nextGame, 80); } }, icon('play'), el('span', { text: t('Nächstes Rätsel') })),
            el('button.btn', { type: 'button', onclick: () => { s.close(); setTimeout(showNew, 80); } }, icon('gear'), el('span', { text: t('Anderes Thema') })),
            el('button.btn', { type: 'button', onclick: () => { s.close(); setTimeout(() => showExport('solution'), 80); } }, icon('print'), el('span', { text: t('Lösung drucken') }))) });
    }

    /* ---------- Drucken und Bild ---------- */
    function exportWords() {
        // Gefundene Wörter in ihrer Farbe und an ihrer Stelle, die anderen an der geplanten Stelle in den nächsten Farben
        let next = game.found;
        return game.words.map(w => w.f ? { t: w.t, sel: w.f, color: colorOf(w) }
            : { t: w.t, sel: [w.p[0], w.p[1], w.p[2], w.p[3], w.k.length], color: COLORS[next++ % COLORS.length] });
    }
    function exportLayout(o) {
        return SuPdf.layout({
            title: o.title || game.title, sub: t('{p} · {n} Wörter · {w} × {h}', { p: t(PRESET_NAMES[game.opt.preset] || 'Eigene'), n: game.words.length, w: game.w, h: game.h }),
            brand: 'Suchsel', label: [t('Rätsel'), t('Lösung')], g: { grid: game.grid, w: game.w, h: game.h, words: exportWords() },
            mode: o.mode, land: o.land, list: o.list, name: o.name ? [t('Name'), t('Datum')] : null, font: set.font === 'serif' ? 'serif' : set.font === 'mono' ? 'mono' : 'sans',
        });
    }
    function showExport(mode) {
        if (!game) return;
        const o = Object.assign({}, exp, mode ? { mode } : {});
        const cv = el('canvas.preview');
        const pager = el('div.pager');
        const warn = el('p.warn');
        let page = 0, lay = null;
        const titleIn = el('input', { type: 'text', value: o.title || game.title, maxlength: 80 });
        titleIn.addEventListener('input', () => { o.title = titleIn.value === game.title ? '' : titleIn.value; paint(); });
        function paint() {
            lay = exportLayout(o);
            if (page >= lay.pages) page = 0;
            const box = cv.parentElement ? cv.parentElement.getBoundingClientRect() : { width: 300 };
            const big = cv.classList.contains('big');
            const cssW = Math.min(big ? innerWidth - 24 : 400, box.width || 300);
            const cssH = cssW * lay.H / lay.W;
            const dpr = Math.min(3, devicePixelRatio || 1) * (big ? 1.5 : 1);
            cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
            cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
            const ctx = cv.getContext('2d');
            ctx.setTransform(cv.width / lay.W, 0, 0, cv.height / lay.H, 0, 0);
            lay.draw(ctx, page);
            pager.replaceChildren(...(lay.pages > 1 ? [t('Rätsel'), t('Lösung')].map((l, i) =>
                el('button.chip', { type: 'button', class: i === page ? 'on' : null, text: l, onclick: () => { page = i; paint(); } })) : []));
            warn.textContent = lay.cellMm < 4.2 ? t('Bei {w} Spalten werden die Buchstaben auf dem Blatt sehr klein (etwa {mm} mm). Querformat oder ein kleineres Gitter helfen.',
                { w: game.w, mm: lay.cellMm.toFixed(1).replace('.', set.lang === 'en' ? '.' : ',') }) : '';
            warn.hidden = !warn.textContent;
            exp = Object.assign({}, o);
            save('exp', exp);
        }
        cv.addEventListener('click', () => { cv.classList.toggle('big'); paint(); });
        const fname = ext => 'suchsel-' + slug(o.title || game.title) + '-' + (o.mode === 'solution' ? t('loesung') : o.mode === 'both' ? t('raetsel-loesung') : t('raetsel')) + '.' + ext;
        const pdfBlob = () => new Blob([lay.bytes()], { type: 'application/pdf' });
        const body = el('div.export', null,
            el('div.prevbox', null, cv, pager),
            warn,
            section(t('Blatt'), seg([['puzzle', t('Rätsel')], ['solution', t('Lösung')], ['both', t('Beides')]], o.mode, v => { o.mode = v; page = 0; paint(); })),
            section(t('Format'), seg([['p', t('Hochformat')], ['l', t('Querformat')]], o.land ? 'l' : 'p', v => { o.land = v === 'l'; paint(); })),
            section(t('Überschrift'), titleIn),
            toggle(t('Wortliste unter dem Gitter'), o.list, v => { o.list = v; paint(); }),
            toggle(t('Zeile für Name und Datum'), o.name, v => { o.name = v; paint(); }));
        const foot = el('div.btns', null,
            el('button.btn.primary', { type: 'button', onclick: () => shareOrDownload(pdfBlob(), fname('pdf')) }, icon('download'), el('span', { text: 'PDF' })),
            el('button.btn', { type: 'button', onclick: async () => shareOrDownload(await lay.png(3), fname('png')) }, icon('image'), el('span', { text: t('Bild (PNG)') })),
            el('button.btn', { type: 'button', onclick: () => openPdf(pdfBlob()) }, icon('print'), el('span', { text: t('Drucken') })));
        sheet(t('Drucken und Bild'), body, { foot, cls: 'wide' });
        requestAnimationFrame(paint);
    }
    function download(blob, name) {
        const a = el('a', { href: URL.createObjectURL(blob), download: name });
        document.body.append(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
    }
    async function shareOrDownload(blob, name) {
        if (isTouch() && navigator.canShare) {
            const file = new File([blob], name, { type: blob.type });
            if (navigator.canShare({ files: [file] })) {
                try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
            }
        }
        download(blob, name);
    }
    function openPdf(blob) {
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (!w) download(blob, 'suchsel.pdf');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    /* ---------- Teilen ---------- */
    function shareUrl() { return location.origin + location.pathname + '#p=' + SuGame.encodeShare(game); }
    function showShare() {
        if (!game) return;
        const url = shareUrl();
        const inp = el('input.link', { type: 'text', readonly: true, value: url });
        inp.addEventListener('focus', () => inp.select());
        const body = el('div', null,
            el('p', { text: t('Wer diesen Link öffnet, bekommt genau dieses Gitter, ohne deine Lösungen.') }), inp);
        const foot = el('div.btns', null,
            el('button.btn.primary', { type: 'button', onclick: async () => {
                try { await navigator.clipboard.writeText(url); toast(t('Link kopiert.')); } catch (e) { inp.focus(); inp.select(); }
            } }, icon('link'), el('span', { text: t('Link kopieren') })),
            navigator.share ? el('button.btn', { type: 'button', onclick: () => navigator.share({ title: 'Suchsel: ' + game.title, url }).catch(() => {}) },
                icon('share'), el('span', { text: t('Teilen') })) : null);
        sheet(t('Rätsel teilen'), body, { foot, cls: 'narrow' });
    }

    /* ---------- Meine Wörter ---------- */
    async function showOwn() {
        const l = wordLang(set.lang);
        let b;
        try { b = await loadBank(l); } catch (e) { b = { groups: [], cats: {} }; }
        const list = el('div.ownlist');
        function paint() {
            list.replaceChildren(...(own.cats.length ? own.cats.map(c => el('div.ownrow', null,
                el('div', null, el('b', { text: c.name }), el('small', { text: t('{n} Wörter', { n: c.words.length }) })),
                el('button.iconbtn', { type: 'button', title: t('Spielen'), 'aria-label': t('Spielen'), onclick: () => playOwn(c) }, icon('play')),
                el('button.iconbtn', { type: 'button', title: t('Bearbeiten'), 'aria-label': t('Bearbeiten'), onclick: () => editOwn(c, paint) }, icon('edit')),
                el('button.iconbtn', { type: 'button', title: t('Löschen'), 'aria-label': t('Löschen'), onclick: () => {
                    if (!confirm(t('Kategorie „{x}“ löschen?', { x: c.name }))) return;
                    own.cats = own.cats.filter(x => x !== c); save('own', own); paint();
                } }, icon('trash')))) : [el('p.muted', { text: t('Noch keine eigenen Kategorien. Leg eine an, z. B. für euer Tagesthema.') })]));
        }
        paint();
        const extSel = el('select', null, el('option', { value: '', text: t('Thema wählen …') }),
            b.groups.map(g => el('optgroup', { label: g.name }, g.cats.map(id => el('option', { value: id, text: b.cats[id].name + ((own.extra[l + ':' + id] || []).length ? ' (+' + own.extra[l + ':' + id].length + ')' : '') })))));
        extSel.addEventListener('change', () => { if (extSel.value) editExtra(b, l, extSel.value, () => { extSel.value = ''; }); });
        const body = el('div', null,
            section(t('Meine Kategorien'), list,
                el('button.btn', { type: 'button', onclick: () => editOwn(null, paint) }, icon('plus'), el('span', { text: t('Neue Kategorie') }))),
            section(t('Eingebaute Themen ergänzen'), el('p.muted', { text: t('Fehlt dir ein Wort? Ergänze es, es gilt nur auf diesem Gerät.') }), extSel),
            section(t('Sicherung'), el('p.muted', { text: t('Deine Wörter liegen nur auf diesem Gerät. Eine Sicherung als Datei schützt sie und bringt sie auf ein anderes Gerät.') }),
                el('div.btns', null,
                    el('button.btn', { type: 'button', onclick: backupSave }, icon('download'), el('span', { text: t('Sicherung speichern') })),
                    el('button.btn', { type: 'button', onclick: () => backupLoad(paint) }, icon('upload'), el('span', { text: t('Sicherung laden') })))));
        sheet(t('Meine Wörter'), body);
    }
    function editOwn(c, done) {
        const name = el('input', { type: 'text', value: c ? c.name : '', placeholder: t('Name, z. B. Unser Garten'), maxlength: 60 });
        const ta = el('textarea', { rows: 10, value: c ? c.words.join('\n') : '', placeholder: t('Ein Wort pro Zeile oder mit Komma getrennt') });
        const cnt = el('small.muted');
        const upd = () => { cnt.textContent = t('{n} Wörter', { n: parseList(ta.value).length }); };
        ta.addEventListener('input', upd);
        upd();
        const s = sheet(c ? t('Kategorie bearbeiten') : t('Neue Kategorie'), el('div.form', null,
            el('label', { text: t('Name') }), name, el('label', { text: t('Wörter') }), ta, cnt), {
            foot: el('div.btns', null, el('button.btn.primary', { type: 'button', onclick: () => {
                const words = parseList(ta.value);
                const n = name.value.trim();
                if (!n) { toast(t('Bitte einen Namen eingeben.')); return; }
                if (!words.length) { toast(t('Bitte erst ein paar Wörter eintippen.')); return; }
                if (c) { c.name = n; c.words = words; } else own.cats.push({ id: Date.now().toString(36), name: n, words });
                save('own', own);
                s.close();
                done && done();
            } }, icon('check'), el('span', { text: t('Speichern') }))),
        });
        setTimeout(() => (c ? ta : name).focus(), 250);
    }
    function editExtra(b, l, id, done) {
        const key = l + ':' + id;
        const ta = el('textarea', { rows: 8, value: (own.extra[key] || []).join('\n'), placeholder: t('Ein Wort pro Zeile oder mit Komma getrennt') });
        const s = sheet(b.cats[id].name, el('div.form', null,
            el('details', null, el('summary', { text: t('Schon dabei: {n} Wörter', { n: b.cats[id].words.length }) }), el('p.wordcloud', { text: b.cats[id].words.join(', ') })),
            el('label', { text: t('Deine Ergänzungen') }), ta), {
            onClose: done,
            foot: el('div.btns', null, el('button.btn.primary', { type: 'button', onclick: () => {
                const words = parseList(ta.value);
                if (words.length) own.extra[key] = words; else delete own.extra[key];
                save('own', own);
                toast(t('Gespeichert.'));
                s.close();
            } }, icon('check'), el('span', { text: t('Speichern') }))),
        });
    }
    function playOwn(c) {
        closeAll();
        newOpt = Object.assign({}, newOpt, { cat: 'o:' + c.id });
        save('new', newOpt);
        setTimeout(() => startNew(newOpt), 120);
    }
    function backupSave() {
        const data = { app: 'suchsel', v: 1, at: new Date().toISOString(), own, set, stats, newOpt, exp };
        const d = new Date();
        download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }),
            'suchsel-sicherung-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json');
    }
    function backupLoad(done) {
        const inp = el('input', { type: 'file', accept: '.json,application/json' });
        inp.addEventListener('change', async () => {
            try {
                const d = JSON.parse(await inp.files[0].text());
                if (!d || d.app !== 'suchsel' || !d.own) throw new Error('bad');
                for (const c of d.own.cats || []) {
                    if (!c || !c.name || !Array.isArray(c.words)) continue;
                    const i = own.cats.findIndex(x => x.id === c.id);
                    const clean = { id: String(c.id || Date.now().toString(36)).slice(0, 20), name: String(c.name).slice(0, 60), words: parseList(c.words.join('\n')) };
                    if (i >= 0) own.cats[i] = clean; else own.cats.push(clean);
                }
                for (const k in d.own.extra || {}) if (/^[a-z]{2}:[a-z0-9_-]+$/.test(k) && Array.isArray(d.own.extra[k])) own.extra[k] = parseList(d.own.extra[k].join('\n'));
                save('own', own);
                if (d.stats && (d.stats.played || 0) > stats.played) { stats = Object.assign(stats, d.stats); save('stats', stats); }
                if (d.set) { Object.assign(set, d.set); if (!LANGS[set.lang]) set.lang = 'en'; save('set', set); applyTheme(); applyTexts(); }
                toast(t('Sicherung geladen.'));
                done && done();
            } catch (e) {
                toast(t('Das ist keine Sicherung von Suchsel.'));
            }
        });
        inp.click();
    }

    /* ---------- Statistik ---------- */
    function showStats() {
        const row = (k, v) => el('div.statrow', null, el('span', { text: k }), el('b', { text: String(v) }));
        const body = el('div', null,
            row(t('Rätsel angefangen'), stats.played), row(t('Rätsel gelöst'), stats.solved), row(t('Wörter gefunden'), stats.words),
            row(t('Tipps benutzt'), stats.hints), row(t('Spielzeit gesamt'), fmtTime(stats.time)),
            stats.solved ? row(t('Durchschnitt pro Rätsel'), fmtTime(stats.time / stats.solved)) : null,
            el('h3', { text: t('Bestzeiten') }),
            ...['leicht', 'mittel', 'schwer', 'profi', 'eigen'].map(k => row(t(PRESET_NAMES[k]), stats.best[k] ? fmtTime(stats.best[k]) : '–')));
        const s = sheet(t('Statistik'), body, { cls: 'narrow', foot: el('button.btn', { type: 'button', onclick: () => {
            if (!confirm(t('Statistik wirklich zurücksetzen?'))) return;
            stats = { played: 0, solved: 0, words: 0, hints: 0, time: 0, best: {} };
            save('stats', stats);
            s.close();
        } }, icon('trash'), el('span', { text: t('Zurücksetzen') })) });
    }

    /* ---------- Einstellungen ---------- */
    function showSettings() {
        const lang = el('select', null, Object.keys(LANGS).map(l => el('option', { value: l, text: LANGS[l], selected: l === set.lang ? 'selected' : null })));
        lang.addEventListener('change', () => {
            set.lang = lang.value;
            newOpt.wl = wordLang(set.lang);
            if (newOpt.cat.startsWith('b:')) newOpt.cat = 'rnd';
            save('new', newOpt);
            store();
            applyTexts();
            closeAll();
            setTimeout(showSettings, 250);
        });
        const store = () => save('set', set);
        const sample = el('div.fontsample');
        const paintSample = () => { sample.dataset.font = set.font; sample.textContent = 'SUCHSEL ÄÖÜ'; };
        paintSample();
        const body = el('div', null,
            section(t('Sprache'), lang),
            section(t('Design'), seg([['light', t('Hell')], ['dark', t('Dunkel')], ['auto', t('Wie das Gerät')]], set.theme, v => { set.theme = v; store(); applyTheme(); })),
            section(t('Schrift im Gitter'), seg([['sans', t('Klar')], ['round', t('Rund')], ['serif', t('Klassisch')], ['mono', t('Schreibmaschine')]], set.font,
                v => { set.font = v; store(); paintSample(); board.setStyle(set.font, set.lines); }), sample),
            section(t('Spiel'),
                toggle(t('Kästchen im Gitter'), set.lines, v => { set.lines = v; store(); board.setStyle(set.font, set.lines); }),
                toggle(t('Stoppuhr zeigen'), set.timer, v => { set.timer = v; store(); renderStat(); }),
                navigator.vibrate ? toggle(t('Vibrieren bei Treffern'), set.vibrate, v => { set.vibrate = v; store(); }) : null),
            section(t('Sicherung'), el('p.muted', { text: t('Eigene Wörter, Einstellungen und Statistik als Datei.') }),
                el('div.btns', null,
                    el('button.btn', { type: 'button', onclick: backupSave }, icon('download'), el('span', { text: t('Sicherung speichern') })),
                    el('button.btn', { type: 'button', onclick: () => backupLoad() }, icon('upload'), el('span', { text: t('Sicherung laden') })))));
        sheet(t('Einstellungen'), body);
    }

    /* ---------- Hilfe und Über ---------- */
    function showHelp() {
        const p = (h, txt) => el('div.help', null, el('h3', { text: h }), el('p', { text: txt }));
        const body = el('div', null,
            p(t('So geht\'s'), t('Oben stehen die gesuchten Wörter. Zieh mit dem Finger oder der Maus über die Buchstaben eines Wortes. Die Markierung rastet waagerecht, senkrecht und schräg ein, egal ob du vorn oder hinten anfängst. Gefundene Wörter bekommen eine eigene Farbe und werden oben durchgestrichen.')),
            p(t('Zoomen und Verschieben'), t('Mit Plus und Minus unten rechts, mit zwei Fingern oder am Rechner mit dem Mausrad. Verschieben geht mit zwei Fingern, am Rechner mit gedrückter rechter Maustaste, dem Mausrad oder den Pfeiltasten. Der Knopf zwischen Plus und Minus zeigt wieder das ganze Gitter. Beim Markieren am Rand wandert das Gitter von selbst mit.')),
            p(t('Tipp'), t('Die Glühbirne unten links zeigt, wo eins der Wörter anfängt.')),
            p(t('Neues Rätsel'), t('Wähle ein Thema aus dem großen Wortschatz, lass den Zufall entscheiden oder tipp eigene Wörter ein. Die Schwierigkeit reicht von 6 Wörtern nur waagerecht und senkrecht bis zu 20 Wörtern in alle Richtungen. In der Feineinstellung legst du Anzahl, Größe des Gitters (bis 100 × 100) und Richtungen selbst fest.')),
            p(t('Meine Wörter'), t('Leg eigene Kategorien an oder ergänze die eingebauten Themen. Alles bleibt auf deinem Gerät. Mit der Sicherung als Datei nimmst du es auf ein anderes Gerät mit.')),
            p(t('Drucken'), t('Unter Drucken und Bild gibt es das Rätsel als A4-PDF oder als Bild, leer zum Lösen oder bunt mit Lösung, im Hoch- oder Querformat. Die Vorschau zeigt genau, was aus dem Drucker kommt.')),
            p(t('Als App'), t('Installiert läuft Suchsel ohne Internet, ohne Werbung und ohne Grenze. Im Browser-Tab gibt es ein paar Probespiele.')),
            p(t('Deine Daten'), t('Eigene Wörter, Einstellungen und Statistik bleiben auf deinem Gerät. Im Browser-Tab zählt der Server nur, wie viele Rätsel von deiner Adresse aus gestartet wurden, gespeichert als unkenntliche Prüfsumme und nach 30 Tagen gelöscht.')));
        sheet(t('Hilfe'), body);
    }
    function showAbout() {
        const a = (ic, label, href) => el('a.mitem', { href, target: '_blank', rel: 'noopener' }, icon(ic), el('span', null, el('b', { text: label })));
        const body = el('div', null,
            el('div.about', null, el('img', { src: document.querySelector('link[rel=icon]').href, alt: '', width: 72, height: 72 }),
                el('div', null, el('h3', { text: 'Suchsel' }), el('p.muted', { text: t('Version {v}', { v: root.dataset.v }) }))),
            el('p', { text: t('Wortsuchrätsel mit großem Wortschatz, eigenen Wörtern und Druck als PDF. Kostenlos, ohne Werbung, ohne Anmeldung. Freie Software, die du auch selbst hosten kannst.') }),
            el('div.menu', null,
                a('github', t('Suchsel auf GitHub'), LINKS.github),
                a('globe', 'tech.burnersen.de', LINKS.web),
                a('heart', t('Spendier mir einen Kaffee'), LINKS.kofi)),
            el('p.muted.small', { text: t('Lizenz: GNU AGPL v3.') }));
        sheet(t('Über Suchsel'), body, { cls: 'narrow' });
    }

    /* ---------- Installieren: Hinweis oben, Anleitung, Sperre ---------- */
    const BENEFITS = () => [t('Unbegrenzt spielen'), t('Kostenlos und ohne Werbung'), t('Läuft auch ohne Internet'), t('Startet direkt vom Home-Bildschirm'), t('Deine Wörter bleiben auf deinem Gerät')];
    function renderBanner() {
        const b = $('#banner');
        if (isApp() || bannerHidden) { b.hidden = true; return; }
        const left = quota && quota.limit ? quota.left : null;
        const line = left == null ? t('Kostenlos, ohne Werbung, unbegrenzt und auch offline.')
            : left > 0 ? t('Noch {n} von {m} Probespielen im Browser. Als App unbegrenzt, kostenlos und offline.', { n: left, m: quota.limit })
                : t('Die Probespiele im Browser sind aufgebraucht. Als App geht\'s unbegrenzt weiter.');
        b.replaceChildren(
            el('img', { src: document.querySelector('link[rel=icon]').href, alt: '', width: 40, height: 40 }),
            el('div.txt', null, el('b', { text: t('Hol dir Suchsel als App!') }), el('span', { text: line })),
            el('div.acts', null,
                el('button.btn.light', { type: 'button', onclick: installNow }, icon('install'), el('span', { text: t('Installieren') })),
                el('button.iconbtn', { type: 'button', 'aria-label': t('Schließen'), onclick: () => { bannerHidden = true; renderBanner(); } }, icon('close'))));
        b.classList.toggle('empty', left === 0);
        b.hidden = false;
    }
    async function installNow() {
        if (installEvt) {
            installEvt.prompt();
            try {
                const r = await installEvt.userChoice;
                if (r && r.outcome === 'accepted') { installEvt = null; return; }
            } catch (e) {}
            return;
        }
        showInstall();
    }
    function steps(pf) {
        const S = {
            ios: [t('Tippe auf das Teilen-Symbol (Quadrat mit Pfeil nach oben), am iPhone unten, am iPad oben.'), t('Wähle „Zum Home-Bildschirm“. Eventuell erst etwas nach unten wischen.'), t('Tippe auf „Hinzufügen“. Fertig, Suchsel liegt jetzt bei deinen Apps.')],
            android: [t('Tippe oben rechts auf das Menü ⋮ des Browsers.'), t('Wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.'), t('Bestätige mit „Installieren“.')],
            'android-firefox': [t('Tippe auf das Menü ⋮ von Firefox.'), t('Wähle „Installieren“ oder „Zum Startbildschirm hinzufügen“.'), t('Bestätige, fertig.')],
            'mac-safari': [t('Klicke oben in der Menüleiste auf „Ablage“ (oder auf das Teilen-Symbol).'), t('Wähle „Zum Dock hinzufügen“.'), t('Klicke auf „Hinzufügen“. Suchsel startet jetzt wie jedes andere Programm.')],
            firefox: [t('Firefox kann Web-Apps am Rechner leider (noch) nicht überall installieren.'), t('Öffne diese Seite in Chrome, Edge oder Safari.'), t('Klicke dort in der Adresszeile auf das Installieren-Symbol.')],
            desktop: [t('Klicke rechts in der Adresszeile auf das Installieren-Symbol (Bildschirm mit Pfeil).'), t('Oder öffne das Menü ⋮ und wähle „Suchsel installieren“ bzw. „App installieren“.'), t('Bestätige mit „Installieren“. Suchsel bekommt ein eigenes Fenster und ein Symbol.')],
        };
        return S[pf] || S.desktop;
    }
    function installBody(locked) {
        const pf = platform();
        const names = { ios: 'iPhone / iPad', android: 'Android', 'android-firefox': 'Android (Firefox)', 'mac-safari': 'Mac (Safari)', firefox: 'Firefox', desktop: 'Chrome / Edge' };
        const ol = p => el('ol.steps', null, steps(p).map(s => el('li', { text: s })));
        return el('div.install', null,
            locked ? el('p.lead', { text: t('Deine {n} Probespiele im Browser sind aufgebraucht. Installier Suchsel als App, dann spielst du ab sofort unbegrenzt weiter. Das dauert keine 10 Sekunden.', { n: quota && quota.limit || 10 }) })
                : el('p.lead', { text: t('Mit einem Fingertipp auf deinem Home-Bildschirm oder Desktop. Kein App-Store, keine Anmeldung.') }),
            el('ul.benefits', null, BENEFITS().map(x => el('li', null, icon('check'), el('span', { text: x })))),
            installEvt ? el('button.btn.primary.big', { type: 'button', onclick: installNow }, icon('install'), el('span', { text: t('Jetzt installieren') })) : null,
            el('h3', { text: t('So geht\'s auf diesem Gerät') }), ol(pf),
            el('details', null, el('summary', { text: t('Anleitung für andere Geräte') }),
                ...Object.keys(names).filter(k => k !== pf).map(k => el('div', null, el('h4', { text: names[k] }), ol(k)))),
            locked && game && !game.done ? el('p.muted', { text: t('Dein angefangenes Rätsel kannst du hier noch zu Ende spielen.') }) : null);
    }
    function showInstall() { sheet(t('Suchsel als App'), installBody(false), { cls: 'narrow' }); }
    function showLocked() {
        closeAll();
        setTimeout(() => sheet(t('Weiter geht\'s in der App'), installBody(true), { cls: 'narrow' }), sheets.length ? 250 : 0);
        if (!game) { $('#theme').textContent = t('Bitte als App installieren'); }
    }
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderBanner(); });
    addEventListener('appinstalled', () => {
        installEvt = null;
        toast(t('Installiert! Starte Suchsel ab jetzt über das Symbol auf deinem Home-Bildschirm oder Desktop.'));
    });

    /* ---------- Texte der festen Knöpfe ---------- */
    function applyTexts() {
        root.lang = set.lang;
        $('#newBtn span').textContent = t('Neu');
        $('#hintBtn span').textContent = t('Tipp');
        const lab = { menuBtn: t('Menü'), newBtn: t('Neues Rätsel'), zoomIn: t('Größer'), zoomOut: t('Kleiner'), zoomFit: t('Ganzes Gitter'), hintBtn: t('Tipp') };
        for (const id in lab) { $('#' + id).setAttribute('aria-label', lab[id]); $('#' + id).title = lab[id]; }
        $('#board').setAttribute('aria-label', t('Buchstabengitter'));
        renderBanner();
        if (game) renderWords();
        renderCoach();
    }

    /* ---------- Service Worker: einmal laden, danach läuft alles ohne Netz ---------- */
    function registerSw() {
        if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
        const had = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.register('./?action=sw', { scope: './' }).catch(() => {});
        let shown = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!had || shown) return;
            shown = true;
            toast(t('Eine neue Version von Suchsel ist da.'), { label: t('Neu laden'), fn: () => { saveGame(); location.reload(); } });
        });
        if (isApp() && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    }

    /* ---------- Start ---------- */
    async function init() {
        applyTheme();
        board = new SuBoard($('#board'), { onSelect, nextColor });
        board.setStyle(set.font, set.lines);
        applyTexts();
        $('#menuBtn').addEventListener('click', showMenu);
        $('#newBtn').addEventListener('click', showNew);
        $('#zoomIn').addEventListener('click', () => board.zoom(1.3));
        $('#zoomOut').addEventListener('click', () => board.zoom(1 / 1.3));
        $('#zoomFit').addEventListener('click', () => board.fit());
        $('#hintBtn').addEventListener('click', hint);
        $('#board').addEventListener('pointerdown', () => { const c = $('#coach'); if (c) c.classList.add('gone'); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && sheets.length) { closeSheet(sheets[sheets.length - 1]); return; }
            if (sheets.length || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
            if (board.key(e)) e.preventDefault();
        });
        registerSw();
        if (!isApp()) fetchQuota();
        renderBanner();

        // Geteiltes Rätsel aus dem Link
        const m = /^#p=([A-Za-z0-9_-]+)$/.exec(location.hash);
        if (m) {
            history.replaceState(null, '', location.pathname + location.search);
            const d = SuGame.decodeShare(m[1]);
            if (d) {
                const o = Object.assign({}, newOpt, { wl: d.lang, w: d.w, h: d.h, dirs: d.dirs, keep: d.keep, tricky: d.tricky, n: d.words.length, cat: 'shared' });
                if (await startNew(o, { words: d.words, title: d.title, seed: d.seed })) return;
            }
        }
        const g = load('game', null);
        if (g && g.v === 1 && typeof g.grid === 'string' && g.grid.length === g.w * g.h && Array.isArray(g.words)) {
            game = g;
            render(true);
            return;
        }
        render(true);
        await startNew(newOpt);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
