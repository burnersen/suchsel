/* Suchsel – prüft den Wortschatz (node tools/check-words.js): doppelte Wörter, fremde Schriftzeichen, Größe der Themen.
   Läuft nur auf der Kommandozeile, gehört nicht zur App. */
'use strict';
const fs = require('fs'), path = require('path');
const G = require('../app/assets/game.js');
const dir = path.join(__dirname, '..', 'app', 'words');
let bad = 0;
for (const f of fs.readdirSync(dir).filter(f => /^[a-z]{2}\.txt$/.test(f)).sort()) {
    const lang = f.slice(0, 2);
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const cats = [];
    let cat = null;
    for (let line of txt.split('\n')) {
        line = line.trim();
        if (!line || line[0] === '#' || /^==.*==$/.test(line)) continue;
        const m = /^\[([a-z0-9_-]+)\]\s*(.+)$/.exec(line);
        if (m) { cat = { id: m[1], name: m[2], buf: '' }; cats.push(cat); continue; }
        if (cat) cat.buf += ' ' + line;
    }
    let total = 0;
    const ids = new Set();
    const small = [];
    for (const c of cats) {
        if (ids.has(c.id)) { console.log(`${lang}: Thema doppelt: ${c.id}`); bad++; }
        ids.add(c.id);
        const words = c.buf.split(',').map(w => w.trim().replace(/\s+/g, ' ')).filter(Boolean);
        const seen = new Map();
        for (const w of words) {
            if (/[^\p{Script=Latin}\s'’.\-]/u.test(w)) { console.log(`${lang}/${c.id}: fremdes Zeichen in „${w}“`); bad++; }
            const k = G.normalize(w, lang, true);
            if (seen.has(k)) console.log(`${lang}/${c.id}: doppelt „${w}“ (${seen.get(k)})`);
            seen.set(k, w);
        }
        const usable = [...seen.keys()].filter(k => k.length >= 3 && k.length <= 12).length;
        if (usable < 30) small.push(`${c.id} (${usable})`);
        total += seen.size;
    }
    console.log(`${lang}: ${cats.length} Themen, ${total} Wörter` + (small.length ? `, klein: ${small.join(', ')}` : ''));
}
process.exit(bad ? 1 : 0);
