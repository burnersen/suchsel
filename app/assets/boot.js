/* Suchsel – läuft vor dem ersten Bild: hell oder dunkel so, wie zuletzt eingestellt, damit nichts aufblitzt. */
(() => {
    try {
        const s = JSON.parse(localStorage.getItem('su_set')) || {};
        const dark = s.theme === 'dark' || (s.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        // Dem Browser sagen, dass die Seite ihr Design selbst macht, damit er nichts erzwungen umfärbt
        const m = document.querySelector('meta[name=color-scheme]');
        if (m) m.content = dark ? 'only dark' : 'only light';
        if (s.lang) document.documentElement.lang = s.lang;
    } catch (e) {}
})();
