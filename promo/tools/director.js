// Regie: bedient Suchsel in der Bühne (stage.html) und nimmt per CDP-Screencast jedes Bild mit Zeitstempel auf.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'frames');
const PREVIEW = process.argv.includes('--preview');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, locale: 'de-DE', userAgent: UA, colorScheme: 'light', serviceWorkers: 'block' });
  // Nur für die Aufnahme: die App darf in der Bühne als iframe laufen
  await ctx.route('http://127.0.0.1:8765/**', async r => {
    const res = await r.fetch();
    const h = res.headers();
    delete h['x-frame-options'];
    if (h['content-security-policy']) h['content-security-policy'] = h['content-security-policy'].replace(/frame-ancestors[^;]*;?/, '');
    await r.fulfill({ response: res, headers: h });
  });
  await ctx.addInitScript(() => {
    if (location.pathname.endsWith('stage.html')) return;
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear();
      localStorage.setItem('su_coach', '1');
      localStorage.setItem('su_set', JSON.stringify({ lang: 'de', theme: 'light', font: 'sans', lines: false, timer: true, vibrate: true }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('http://127.0.0.1:8765/stage.html');
  const app = page.frameLocator('#app');
  const appFrame = () => page.frames().find(f => f !== page.mainFrame());
  await page.waitForTimeout(1500);

  // Start ohne Rätsel: eins vorbereiten lassen wir die App selbst, aber das Banner schließen
  const S = (fn, ...a) => page.evaluate(([fn, a]) => window.stage[fn](...a), [fn, a]);
  const wait = ms => page.waitForTimeout(ms);
  const fpos = { x: 540, y: 1800 };
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  async function moveTo(x, y, ms = 450, down = false) {
    const x0 = fpos.x, y0 = fpos.y;
    await S('glide', x0 / 2, y0 / 2, x / 2, y / 2, ms, down);
    const t0 = Date.now();
    const n = Math.max(4, Math.round(ms / 40));
    for (let i = 1; i <= n; i++) {
      const target = t0 + ms * i / n;
      const d = target - Date.now();
      if (d > 0) await wait(d);
      const k = ease(Math.min(1, (Date.now() - t0) / ms));
      await page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k);
    }
    await page.mouse.move(x, y);
    fpos.x = x; fpos.y = y;
  }
  // Bühne ist per CSS zoom 2 skaliert, Playwright rechnet das im iframe nicht mit, also selbst umrechnen
  async function ifr() { return page.evaluate(() => { const r = document.querySelector('#app').getBoundingClientRect(); return { x: r.x, y: r.y }; }); }
  async function rectOf(loc) {
    await loc.first().waitFor({ state: 'attached', timeout: 8000 });
    const r = await loc.first().evaluate(e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, vh: innerHeight }; });
    const o = await ifr();
    return { x: o.x + 2 * r.x, y: o.y + 2 * r.y, w: 2 * r.w, h: 2 * r.h, inner: r };
  }
  async function center(loc) {
    // Nur den Scrollbereich im Fenster der App bewegen, nie die Bühne selbst
    const moved = await loc.first().evaluate(e => {
      let p = e.parentElement;
      while (p && !(p.scrollHeight > p.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
      const r = e.getBoundingClientRect();
      const top = p ? p.getBoundingClientRect().top : 0, bottom = p ? p.getBoundingClientRect().bottom : innerHeight;
      const cy = r.top + r.height / 2;
      if (!p || (cy > top + 10 && cy < bottom - 10)) return false;
      p.scrollBy({ top: cy - (top + bottom) / 2, behavior: 'smooth' });
      return true;
    });
    if (moved) await wait(550);
    const r = await rectOf(loc);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }
  async function tap(loc, ms = 500) {
    const c = await center(loc);
    await moveTo(c.x, c.y, ms);
    await S('finger', c.x / 2, c.y / 2, true, true);
    await S('ripple', c.x / 2, c.y / 2);
    await page.mouse.down(); await wait(90); await page.mouse.up();
    await S('finger', c.x / 2, c.y / 2, true, false);
  }
  async function hideFinger() { await S('finger', null, null, false, false); }

  // Gitter: Felder in Bildschirmkoordinaten (Gitter passt ganz hinein, also mittig)
  async function cellFn() {
    const g = JSON.parse(await appFrame().evaluate(() => localStorage.getItem('su_game')));
    const b = (await rectOf(app.locator('#board'))).inner, o = await ifr();
    const PAD = 10;
    const cs = Math.max(2, Math.min((b.w - 2 * PAD) / g.w, (b.h - 2 * PAD) / g.h));
    const ox = (b.w - cs * g.w) / 2, oy = (b.h - cs * g.h) / 2;
    return { g, cell: (x, y) => ({ x: o.x + 2 * (b.x + ox + (x + .5) * cs), y: o.y + 2 * (b.y + oy + (y + .5) * cs) }) };
  }
  async function swipeWord(w, cell, speed = 1) {
    const [x, y, dx, dy] = w.p, n = w.k.length;
    const a = cell(x, y), e = cell(x + dx * (n - 1), y + dy * (n - 1));
    await moveTo(a.x, a.y, 380 / speed);
    await page.mouse.down();
    await moveTo(e.x, e.y, (200 + n * 45) / speed, true);
    await page.mouse.up();
    await S('finger', e.x / 2, e.y / 2, true, false);
    await wait(200 / speed);
  }
  async function solve(count, speed = 1) {
    const { g, cell } = await cellFn();
    const words = g.words.filter(w => !w.f).slice(0, count == null ? undefined : count);
    for (const w of words) await swipeWord(w, cell, speed);
  }

  // ---------- Aufnahme starten ----------
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async f => {
    const file = path.join(OUT, String(n++).padStart(6, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });

  // Vorbereitung vor der Aufnahme: Banner zu, ein Rätsel „Im Zoo“ bereit legen
  await appFrame().evaluate(() => { const b = document.querySelector('#banner .iconbtn'); if (b) b.click(); });
  await page.evaluate(() => scrollTo(0, 0));
  await wait(300);

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  const T0 = Date.now();
  const mark = l => console.log(((Date.now() - T0) / 1000).toFixed(1) + 's', l);

  // ---------- 1. Intro ----------
  mark('intro');
  await S('intro', true);
  await wait(3300);
  await S('intro', false);
  await wait(250);

  const go = () => app.locator('.sheet .foot .btn.primary');
  const seg = t => app.locator('.sheet .seg button', { hasText: t }).first();
  const scrollSheet = top => app.locator('.sheet .body').last().evaluate((e, top) => e.scrollTo({ top, behavior: 'smooth' }), top);

  // ---------- 2. Thema wählen ----------
  mark('thema');
  await S('head', 'Neues Rätsel', 'Thema aussuchen');
  await S('phone', '');
  await S('sub', 'Über 26.000 Wörter in 6 Sprachen und vielen Themen');
  await wait(1000);
  await tap(app.locator('#newBtn'));
  await wait(800);
  await tap(app.locator('.chip[data-k="b:bauernhof"]'));
  console.log('bauernhof an:', await app.locator('.chip.on[data-k="b:bauernhof"]').count());
  await wait(350);
  await S('sub', 'Vier Stufen, von Leicht bis Profi');
  await tap(app.locator('.sheet .seg button[data-v="leicht"]'));
  await wait(500);
  await tap(go());
  await wait(800);

  // ---------- 3. Wörter wischen ----------
  mark('wischen');
  await S('head', 'So einfach geht\'s', 'Wörter wischen');
  await S('sub', 'Mit dem Finger über ein Wort ziehen, fertig');
  await solve(2);
  await S('sub', 'Jedes gefundene Wort bekommt seine eigene Farbe');
  await solve(2);
  await S('sub', 'Waagerecht, senkrecht, schräg und rückwärts');
  await solve(null);
  await hideFinger();

  // ---------- 4. Geschafft ----------
  mark('geschafft');
  await S('head', 'Geschafft!', 'Mit Zeit und Bestzeit');
  await S('sub', 'Konfetti, Stoppuhr und gleich weiter zum nächsten Rätsel');
  await wait(2600);
  await tap(app.locator('.sheet .btn', { hasText: 'Lösung drucken' }));
  await wait(800);

  // ---------- 5. Drucken ----------
  mark('drucken');
  await S('head', 'Für Schule und Zuhause', 'Ausdrucken als PDF');
  await S('sub', 'A4 als PDF oder Bild, mit Rätsel, Lösung oder beidem');
  await wait(900);
  await tap(seg('Beides')); await wait(350);
  await tap(app.locator('.sheet .pager .chip', { hasText: 'Rätsel' })); await wait(800);
  await S('sub', 'Mit Wortliste und Zeile für Name und Datum, ideal als Arbeitsblatt');
  await tap(app.locator('.sheet label.toggle', { hasText: 'Name und Datum' })); await wait(300);
  await wait(700);
  await tap(app.locator('.sheet header .iconbtn').last());
  await wait(450);

  // ---------- 6. Eigene Wörter ----------
  mark('eigene');
  await S('head', 'Ganz persönlich', 'Eigene Wörter');
  await S('sub', 'Eigene Wörter eintippen, z. B. für Geburtstag, Schule oder Familie');
  await tap(app.locator('#newBtn'));
  await wait(800);
  await tap(app.locator('.chip[data-k="custom"]'));
  await wait(300);
  const titleIn = app.locator('.sheet .custom input[type=text]').first();
  await tap(titleIn, 350);
  await titleIn.pressSequentially('Omas Geburtstag', { delay: 28 });
  const ta = app.locator('.sheet .custom textarea').first();
  await tap(ta, 350);
  await ta.pressSequentially('Oma, Opa, Kuchen, Kerzen, Party, Geschenke', { delay: 26 });
  await wait(250);
  await tap(go());
  await wait(800);
  await S('sub', 'Daraus baut Suchsel sofort ein passendes Rätsel');
  await solve(2, 1.3);
  await hideFinger();

  // ---------- 7. Design ----------
  mark('design');
  await S('head', 'Ganz nach Geschmack', 'Hell oder dunkel');
  await S('sub', 'Dunkles Design und vier Schriften zur Auswahl');
  await tap(app.locator('#menuBtn'));
  await wait(550);
  await tap(app.locator('.mitem', { hasText: 'Einstellungen' }));
  await wait(650);
  await tap(seg('Dunkel')); await wait(650);
  await tap(seg('Rund')); await wait(500);
  await tap(app.locator('.sheet header .iconbtn').last());
  await wait(450);
  await solve(2, 1.3);
  await hideFinger();
  await wait(300);

  // ---------- 8. Großes Gitter mit Zoom ----------
  mark('profi');
  await S('head', 'Für Profis', 'Große Gitter mit Zoom');
  await S('sub', 'Bis zu 100 × 100 Felder, mit zwei Fingern zoomen');
  await tap(app.locator('#newBtn'));
  await wait(800);
  await tap(app.locator('.chip[data-k="rnd"]'));
  await wait(250);
  await tap(app.locator('.sheet .seg button[data-v="profi"]'));
  await wait(350);
  await tap(go());
  await wait(800);
  const bc = await center(app.locator('#board'));
  await moveTo(bc.x - 60, bc.y - 40, 400);
  {
    const o = await ifr();
    const ix = (bc.x - 60 - o.x) / 2, iy = (bc.y - 40 - o.y) / 2;
    for (let i = 0; i < 10; i++) {
      await appFrame().evaluate(([x, y]) => document.querySelector('#board').dispatchEvent(new WheelEvent('wheel', { deltaY: -12, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })), [ix, iy]);
      await wait(40);
    }
  }
  await wait(350);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(30, 40); await wait(45); }
  await wait(450);
  await hideFinger();

  // ---------- 9. Als App ----------
  mark('app');
  await S('head', 'Überall dabei', 'Als App installieren');
  await S('sub', 'Kostenlos, ohne Werbung, ohne Anmeldung, auch offline');
  await tap(app.locator('#menuBtn'));
  await wait(550);
  await tap(app.locator('.mitem', { hasText: 'Als App installieren' }));
  await wait(900);
  await scrollSheet(240);
  await wait(1300);
  await hideFinger();

  // ---------- 10. Outro ----------
  mark('outro');
  await S('head', '', '');
  await S('sub', '');
  await S('phone', 'away');
  await wait(450);
  await S('outro', true);
  await wait(5600);
  mark('ende');
  const TEND = Date.now();

  await cdp.send('Page.stopScreencast');
  await wait(300);
  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify({ frames }));
  console.log('Bilder:', frames.length);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
