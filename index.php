<?php
/**
 * Suchsel – Wortsuchrätsel als App, zum Selbsthosten
 *
 * Diese Datei ist nur der Einstieg: Einstellungen und Reihenfolge. Der eigentliche Code liegt in app/:
 *   app/lib/     Funktionen (Einstellungen, Sperre nach ein paar Spielen im Browser, Update)
 *   app/views/   die Hauptseite
 *   app/assets/  CSS, JavaScript, Symbole (werden über diese Datei ausgeliefert)
 *   app/words/   der Wortschatz, eine Textdatei pro Sprache
 *
 * Das Spiel läuft komplett im Browser. Der Server liefert nur die App aus und zählt, wie oft eine Adresse
 * im Browser ein neues Rätsel startet. Wer Suchsel als App installiert, spielt unbegrenzt und ohne Server.
 * Nichts wird von fremden Servern nachgeladen.
 * Der Code enthält KEINE Zugangsdaten. Alles Geheime entsteht beim ersten Aufruf und liegt
 * dann im Ordner data/. Den Ordner data/ niemals veröffentlichen oder ins Git legen.
 *
 * Lizenz: GNU Affero General Public License v3.0, siehe Datei LICENSE.
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');
date_default_timezone_set('Europe/Berlin');

define('SU_VERSION', '1.0.1');
define('SU_ROOT', __DIR__);
define('SU_APP', SU_ROOT . '/app');
define('SU_DATA_DIR', SU_ROOT . '/data');

require SU_APP . '/lib/core.php';
require SU_APP . '/lib/limit.php';
require SU_APP . '/lib/update.php';

$action = isset($_GET['action']) && is_string($_GET['action']) ? $_GET['action'] : '';

/* ---------- Dateien: CSS, JavaScript, Symbole ---------- */
if ($action === 'asset') {
    $f = isset($_GET['f']) && is_string($_GET['f']) ? $_GET['f'] : '';
    $types = suAssetTypes();
    $ext = strtolower((string)pathinfo($f, PATHINFO_EXTENSION));
    if (!preg_match('~^[a-z0-9][a-z0-9\-]*\.[a-z]+$~', $f) || !isset($types[$ext]) || !is_file(SU_APP . '/assets/' . $f)) suNotFound();
    suHeaders();
    header('Content-Type: ' . $types[$ext]);
    header('Cache-Control: ' . (isset($_GET['v']) ? 'public, max-age=31536000, immutable' : 'no-cache'));
    readfile(SU_APP . '/assets/' . $f);
    exit;
}

/* ---------- Wortschatz einer Sprache (Textdatei, siehe app/words/) ---------- */
if ($action === 'words') {
    $l = isset($_GET['l']) && is_string($_GET['l']) ? $_GET['l'] : '';
    if (!in_array($l, suWordLangs(), true)) suNotFound();
    suHeaders();
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: ' . (isset($_GET['v']) ? 'public, max-age=31536000, immutable' : 'no-cache'));
    readfile(SU_APP . '/words/' . $l . '.txt');
    exit;
}

/* ---------- Service Worker: hält die ganze App vor, danach läuft sie ohne Netz ---------- */
if ($action === 'sw') {
    suHeaders();
    header("Content-Security-Policy: default-src 'none'; connect-src 'self'; frame-ancestors 'none'");
    header('Content-Type: text/javascript; charset=utf-8');
    header('Cache-Control: no-cache');
    echo 'const SU_V = ' . json_encode(SU_VERSION) . ";\n";
    echo 'const SU_FILES = ' . json_encode(suPrecacheList(), JSON_UNESCAPED_SLASHES) . ";\n";
    readfile(SU_APP . '/assets/sw.js');
    exit;
}

if ($action === 'manifest') {
    suHeaders();
    header('Content-Type: application/manifest+json; charset=utf-8');
    header('Cache-Control: no-cache');
    $icon = function (string $f): string { return '?action=asset&f=' . $f . '&v=' . suFileVersion('assets/' . $f); };
    echo json_encode([
        'name' => 'Suchsel', 'short_name' => 'Suchsel', 'id' => './',
        'description' => suT('Wortsuchrätsel mit eigenen Wörtern, zum Ausdrucken und ohne Werbung', 'Word search puzzles with your own words, printable and ad-free'),
        'start_url' => './', 'scope' => './', 'display' => 'standalone', 'orientation' => 'any', 'lang' => suLang(),
        'background_color' => '#eef1f8', 'theme_color' => '#3b5bdb', 'categories' => ['games', 'education', 'entertainment'],
        'icons' => [
            ['src' => $icon('icon-192.png'), 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
            ['src' => $icon('icon-512.png'), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
            ['src' => $icon('icon-512.png'), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/* ---------- Sperre: wie viele Rätsel darf diese Adresse im Browser noch starten? ---------- */
if ($action === 'quota' || $action === 'play') {
    suHeaders();
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if ($action === 'play' && ($_SERVER['REQUEST_METHOD'] !== 'POST' || ($_SERVER['HTTP_X_SUCHSEL'] ?? '') !== '1')) {
        http_response_code(405);
        echo json_encode(['error' => 'POST only']);
        exit;
    }
    echo json_encode(suQuota($action === 'play'));
    exit;
}

if ($action !== '') suNotFound();

/* ---------- Die App ---------- */
suHeaders(true);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
ob_start();
require SU_APP . '/views/app.php';
$html = (string)ob_get_clean();
if (!filter_var(ini_get('zlib.output_compression'), FILTER_VALIDATE_BOOLEAN)) header('Content-Length: ' . strlen($html));
echo $html;
suAutoUpdate();   // höchstens einmal pro Stunde, erst nachdem die Seite ausgeliefert ist
