// Baut aus den Screencast-Bildern (mit Zeitstempel) eine ffmpeg-concat-Liste mit echten Bilddauern
const fs = require('fs'), path = require('path');
const dir = process.argv[2], target = +process.argv[3] || 0;
const { frames } = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json')));
const t0 = frames[0].t, total = frames[frames.length - 1].t - t0 + 1.0;
const k = target && total > target ? target / total : 1;   // Faktor < 1 = schneller
let out = '';
for (let i = 0; i < frames.length; i++) {
  const d = (i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 1.0) * k;
  out += `file '${path.resolve(frames[i].file)}'\nduration ${d.toFixed(5)}\n`;
}
out += `file '${path.resolve(frames[frames.length - 1].file)}'\n`;
fs.writeFileSync(path.join(dir, 'list.txt'), out);
console.log('roh', total.toFixed(1), 's, Faktor', k.toFixed(3), '→', (total * k).toFixed(1), 's');
