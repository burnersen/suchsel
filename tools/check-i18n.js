/* Suchsel – prüft die Übersetzungen (node tools/check-i18n.js): fehlt ein Text aus app.js, fehlt eine Sprache, passen die Platzhalter? */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'assets', 'app.js'), 'utf8');
const { L, T } = require('../app/assets/i18n.js');
const used = new Set();
const re = /\bt\('((?:[^'\\]|\\.)*)'/g;
let m, bad = 0;
while ((m = re.exec(src))) used.add(m[1].replace(/\\'/g, "'"));
for (const k of ['Leicht', 'Mittel', 'Schwer', 'Profi', 'Eigene']) used.add(k);
for (const k of used) if (!T[k]) { console.log('fehlt: ' + k); bad++; }
for (const k in T) {
    if (!used.has(k)) console.log('unbenutzt: ' + k);
    if (T[k].length !== L.length) { console.log('Sprachen fehlen: ' + k); bad++; }
    const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
    T[k].forEach((tr, i) => { if (ph(tr) !== ph(k)) { console.log(`Platzhalter ${L[i]}: ${k}`); bad++; } });
}
console.log(`${used.size} Texte, ${Object.keys(T).length} übersetzt, ${L.length} Sprachen` + (bad ? `, ${bad} Fehler` : ', alles gut'));
process.exit(bad ? 1 : 0);
