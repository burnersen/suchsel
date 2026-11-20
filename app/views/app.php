<?php
/* Suchsel – Hauptseite. Nur das Gerüst, alles Weitere baut app.js. Texte übersetzt die App selbst (i18n.js). */
defined('SU_VERSION') || exit;
$suV = function (string $f): string { return h('?action=asset&f=' . $f . '&v=' . suFileVersion('assets/' . $f)); };
$suWords = [];
foreach (suWordLangs() as $l) $suWords[$l] = '?action=words&l=' . $l . '&v=' . suFileVersion('words/' . $l . '.txt');
?><!DOCTYPE html>
<html lang="<?= suLang() ?>" data-v="<?= h(SU_VERSION) ?>" data-words="<?= h(json_encode($suWords, JSON_UNESCAPED_SLASHES)) ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="description" content="<?= h(suT('Suchsel: Wortsuchrätsel mit großem Wortschatz in vielen Themen, eigenen Wörtern, Zoom und Druck als PDF. Kostenlos, ohne Werbung, auch offline als App.', 'Suchsel: word search puzzles with a large vocabulary in many topics, your own words, zoom and PDF printing. Free, ad-free, works offline as an app.')) ?>">
<meta name="theme-color" content="#3b5bdb">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Suchsel">
<title>Suchsel</title>
<link rel="manifest" href="?action=manifest">
<link rel="icon" href="<?= $suV('icon.svg') ?>" type="image/svg+xml">
<link rel="apple-touch-icon" href="<?= $suV('icon-192.png') ?>">
<link rel="stylesheet" href="<?= $suV('app.css') ?>">
<script src="<?= $suV('boot.js') ?>"></script>
<script defer src="<?= $suV('i18n.js') ?>"></script>
<script defer src="<?= $suV('game.js') ?>"></script>
<script defer src="<?= $suV('board.js') ?>"></script>
<script defer src="<?= $suV('pdf.js') ?>"></script>
<script defer src="<?= $suV('app.js') ?>"></script>
</head>
<body>
<header id="top">
    <button id="menuBtn" class="iconbtn" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <div class="brand"><img src="<?= $suV('icon.svg') ?>" alt="" width="28" height="28"><span>Suchsel</span></div>
    <div class="stat"><span id="timer"></span><span id="progress"></span></div>
    <button id="newBtn" class="btn primary" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span></span></button>
</header>
<div id="banner" hidden></div>
<main id="main">
    <section id="wordsCard" class="card">
        <h1 id="theme"></h1>
        <ul id="words"></ul>
    </section>
    <section id="boardCard" class="card">
        <div id="boardWrap"><canvas id="board"></canvas></div>
        <div class="tools">
            <button id="hintBtn" class="iconbtn hintbtn" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg><span></span></button>
            <div class="zoom">
                <button id="zoomOut" class="iconbtn" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>
                <button id="zoomFit" class="iconbtn" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
                <button id="zoomIn" class="iconbtn" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
        </div>
    </section>
</main>
<div id="layer"></div>
<div id="toast" class="toast" hidden></div>
<noscript><p class="noscript">Suchsel braucht JavaScript. / Suchsel needs JavaScript.</p></noscript>
</body>
</html>
