<?php
/**
 * Suchsel – Installer (Version @@VERSION@@)
 *
 * Diese eine Datei enthält das ganze Programm. Hochladen, im Browser aufrufen, fertig:
 * Sie legt index.php und den Ordner app/ neben sich an und löscht sich danach selbst,
 * ebenso ein Suchsel-ZIP aus dem Release, falls eines daneben liegt.
 * Bei einem Update werden nur die Programmdateien ersetzt, der Ordner data/ wird nie angefasst.
 *
 * Erzeugt von tools/build-release.php, nicht von Hand bearbeiten.
 * Lizenz: GNU Affero General Public License v3.0, siehe Datei LICENSE.
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');

define('SUI_VERSION', '@@VERSION@@');
define('SUI_MIN_PHP', '7.4.0');

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, private');
header('X-Robots-Tag: noindex, nofollow');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

$suiAl = strtolower(trim(isset($_SERVER['HTTP_ACCEPT_LANGUAGE']) ? (string)$_SERVER['HTTP_ACCEPT_LANGUAGE'] : ''));
$suiEn = $suiAl !== '' && strncmp($suiAl, 'de', 2) !== 0;

/** Deutsch oder Englisch, je nach Browser */
function suiT($de, $en) {
    global $suiEn;
    return $suiEn ? $en : $de;
}

function suiH($s) {
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

/** Die eingepackten Dateien: hinter dem Programmende steht pro Zeile „Pfad, Prüfsumme, Inhalt (Base64)“ */
function suiPayload() {
    $fp = @fopen(__FILE__, 'rb');
    if (!$fp) return null;
    fseek($fp, __COMPILER_HALT_OFFSET__);
    $raw = stream_get_contents($fp);
    fclose($fp);
    $files = array();
    foreach (explode("\n", (string)$raw) as $line) {
        $line = trim($line);
        if ($line === '') continue;
        $p = explode("\t", $line);
        if (count($p) !== 3) return null;
        $path = $p[0];
        if (!preg_match('~^[A-Za-z0-9._\-]+(/[A-Za-z0-9._\-]+)*$~', $path) || strpos($path, '..') !== false) return null;
        $bin = base64_decode($p[2], true);
        if ($bin === false || !hash_equals($p[1], hash('sha256', $bin))) return null;
        $files[$path] = $bin;
    }
    return isset($files['index.php']) ? $files : null;
}

/** Version eines schon vorhandenen Suchsel, '' = index.php gehört zu etwas anderem, null = keine da */
function suiInstalledVersion($index) {
    if (!is_file($index)) return null;
    $head = (string)@file_get_contents($index, false, null, 0, 8192);
    if (strpos($head, 'Suchsel') !== false && preg_match("~define\\('SU_VERSION',\\s*'([0-9][0-9A-Za-z.\\-]*)'\\)~", $head, $m)) return $m[1];
    return '';
}

/** Schreibt alles erst unter einem Zwischennamen und tauscht dann um. Liefert Fehlertext oder ''. */
function suiInstall($dir, array $files) {
    $tmp = array();
    $fail = '';
    foreach ($files as $path => $bin) {
        $target = $dir . '/' . $path;
        $parent = dirname($target);
        if (!is_dir($parent) && !@mkdir($parent, 0755, true) && !is_dir($parent)) { $fail = $path; break; }
        $t = $target . '.tmp';
        if (@file_put_contents($t, $bin) !== strlen($bin) || hash('sha256', (string)@file_get_contents($t)) !== hash('sha256', $bin)) {
            @unlink($t);
            $fail = $path;
            break;
        }
        $tmp[$t] = $target;
    }
    if ($fail === '') {
        foreach ($tmp as $t => $target) {
            if (!@rename($t, $target)) { $fail = substr($target, strlen($dir) + 1); break; }
            @chmod($target, 0644);
            if (function_exists('opcache_invalidate')) @opcache_invalidate($target, true);
        }
    }
    if ($fail !== '') {
        foreach ($tmp as $t => $target) if (is_file($t)) @unlink($t);
        return $fail;
    }
    // Programmteile, die es in dieser Version nicht mehr gibt, wegräumen (nur .php in app/, sonst nichts)
    foreach (array('lib', 'views', 'assets', 'words') as $sub) {
        foreach ((array)@glob($dir . '/app/' . $sub . '/*') as $old) {
            if (!isset($files['app/' . $sub . '/' . basename($old)])) @unlink($old);
        }
    }
    return '';
}

/** Suchsel-ZIPs aus dem Release, die neben dem Installer liegen (werden nach der Installation nicht mehr gebraucht) */
function suiZips($dir) {
    $out = array();
    foreach ((array)@glob($dir . '/suchsel-*.zip') as $z) {
        if (is_file($z) && preg_match('~^suchsel-[0-9][0-9A-Za-z.\-]*\.zip$~', basename($z))) $out[] = $z;
    }
    return $out;
}

$suiDir = __DIR__;
$suiSelf = __FILE__;
$suiIndex = $suiDir . '/index.php';
$suiSelfIsIndex = realpath($suiSelf) === realpath($suiIndex);
$suiFiles = suiPayload();
$suiOld = $suiSelfIsIndex ? null : suiInstalledVersion($suiIndex);
$suiHasData = is_dir($suiDir . '/data');

$suiProblems = array();
if (version_compare(PHP_VERSION, SUI_MIN_PHP, '<')) {
    $suiProblems[] = suiT('Suchsel braucht PHP 7.4 oder neuer, hier läuft PHP ', 'Suchsel needs PHP 7.4 or newer, this server runs PHP ') . PHP_VERSION . '.';
}
$suiNoSqlite = !extension_loaded('pdo_sqlite');
if (!is_writable($suiDir)) {
    $suiProblems[] = suiT('PHP darf in diesen Ordner nicht schreiben. Bitte die Schreibrechte anpassen.', 'PHP is not allowed to write to this folder. Please fix the permissions.');
}
if ($suiFiles === null) {
    $suiProblems[] = suiT('Diese Installer-Datei ist beschädigt (unvollständig hochgeladen?). Bitte noch einmal herunterladen und im Binärmodus hochladen.', 'This installer file is damaged (incomplete upload?). Please download it again and upload it in binary mode.');
}

$suiError = '';
$suiDone = false;
$suiSelfGone = true;
if (!$suiProblems && (isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '') === 'POST' && isset($_POST['sui_go'])) {
    if ($suiOld === '' && empty($_POST['sui_overwrite'])) {
        $suiError = suiT('Bitte erst bestätigen, dass die vorhandene index.php ersetzt werden darf.', 'Please confirm first that the existing index.php may be replaced.');
    } else {
        $fail = suiInstall($suiDir, $suiFiles);
        if ($fail !== '') {
            $suiError = suiT('Diese Datei ließ sich nicht schreiben: ', 'This file could not be written: ') . $fail
                      . suiT('. Es wurde nichts verändert.', '. Nothing has been changed.');
        } else {
            $suiDone = true;
            foreach (suiZips($suiDir) as $z) @unlink($z);
            if (!$suiSelfIsIndex) {
                @unlink($suiSelf);
                clearstatcache();
                $suiSelfGone = !is_file($suiSelf);
            }
            if ($suiSelfGone) {
                header('Location: index.php');
                exit;
            }
        }
    }
}

$suiTitle = $suiOld ? suiT('Suchsel aktualisieren', 'Update Suchsel') : suiT('Suchsel installieren', 'Install Suchsel');
?><!DOCTYPE html>
<html lang="<?php echo $suiEn ? 'en' : 'de'; ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title><?php echo suiH($suiTitle); ?></title>
<style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.25rem;
           background: #0b1120; color: #e2e8f0; font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .card { width: 100%; max-width: 34rem; background: #111a2e; border: 1px solid #26324d; border-radius: 1rem; padding: 1.75rem; }
    h1 { margin: 0 0 0.25rem; font-size: 1.4rem; }
    .sub { margin: 0 0 1.25rem; color: #94a3b8; font-size: 0.9rem; }
    ul { margin: 0 0 1.25rem; padding-left: 1.2rem; }
    li { margin-bottom: 0.35rem; }
    code { background: #0b1120; border: 1px solid #26324d; border-radius: 0.35rem; padding: 0.05rem 0.35rem; font-size: 0.85em; }
    .box { border-radius: 0.6rem; padding: 0.7rem 0.85rem; margin-bottom: 1rem; font-size: 0.92rem; }
    .bad { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; }
    .warn { background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.4); color: #fcd34d; }
    .good { background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; }
    label { display: flex; gap: 0.6rem; align-items: flex-start; margin-bottom: 1rem; font-size: 0.92rem; }
    button, .btn { display: inline-block; width: 100%; border: 0; border-radius: 0.6rem; padding: 0.8rem 1rem; font: inherit; font-weight: 600;
                   color: #fff; background: #3b5bdb; cursor: pointer; text-align: center; text-decoration: none; }
    button:hover, .btn:hover { background: #364fc7; }
</style>
</head>
<body>
<div class="card">
    <h1><?php echo suiH($suiTitle); ?></h1>
    <p class="sub">Version <?php echo suiH(SUI_VERSION); ?></p>
<?php if ($suiDone): ?>
    <div class="box good"><?php echo suiH(suiT('Suchsel ist eingerichtet.', 'Suchsel is installed.')); ?></div>
    <div class="box bad"><?php echo suiH(suiT('Diese Installer-Datei ließ sich nicht löschen. Bitte lösche sie jetzt von Hand: ', 'This installer file could not be deleted. Please delete it by hand now: ')); ?><code><?php echo suiH(basename($suiSelf)); ?></code></div>
    <a class="btn" href="index.php"><?php echo suiH(suiT('Weiter zu Suchsel', 'Continue to Suchsel')); ?></a>
<?php elseif ($suiProblems): ?>
<?php foreach ($suiProblems as $p): ?>
    <div class="box bad"><?php echo suiH($p); ?></div>
<?php endforeach; ?>
    <p class="sub"><?php echo suiH(suiT('Es wurde nichts verändert. Behebe das Problem und lade diese Seite neu.', 'Nothing has been changed. Fix the problem and reload this page.')); ?></p>
<?php else: ?>
<?php if ($suiError !== ''): ?>
    <div class="box bad"><?php echo suiH($suiError); ?></div>
<?php endif; ?>
    <ul>
<?php if ($suiOld): ?>
        <li><?php echo suiH(suiT('Gefunden: Suchsel ', 'Found: Suchsel ') . $suiOld . suiT('. Es wird auf ', '. It will be updated to ') . SUI_VERSION . suiT(' aktualisiert.', '.')); ?></li>
<?php else: ?>
        <li><?php echo suiT('Legt <code>index.php</code> und den Ordner <code>app/</code> in diesem Verzeichnis an.', 'Creates <code>index.php</code> and the folder <code>app/</code> in this directory.'); ?></li>
<?php endif; ?>
<?php if ($suiHasData): ?>
        <li><?php echo suiT('Der Ordner <code>data/</code> mit den Einstellungen bleibt unangetastet.', 'The folder <code>data/</code> with the settings is left untouched.'); ?></li>
<?php endif; ?>
        <li><?php echo suiH(suiT('Danach löscht sich diese Installer-Datei selbst.', 'Afterwards this installer file deletes itself.')); ?></li>
<?php foreach (suiZips($suiDir) as $z): ?>
        <li><?php echo suiT('Auch <code>', 'Also <code>') . suiH(basename($z)) . suiT('</code> wird gelöscht, die Datei wird dann nicht mehr gebraucht.', '</code> is deleted, the file is no longer needed then.'); ?></li>
<?php endforeach; ?>
<?php if ($suiNoSqlite): ?>
        <li><?php echo suiH(suiT('Hinweis: Die PHP-Erweiterung „pdo_sqlite“ fehlt. Suchsel läuft trotzdem, nur ohne die Sperre nach ein paar Spielen im Browser.', 'Note: the PHP extension "pdo_sqlite" is missing. Suchsel still works, just without the limit after a few games in the browser.')); ?></li>
<?php endif; ?>
    </ul>
    <form method="post">
        <input type="hidden" name="sui_go" value="1">
<?php if ($suiOld === ''): ?>
        <div class="box warn"><?php echo suiT('In diesem Verzeichnis liegt schon eine <code>index.php</code>, die nicht zu Suchsel gehört. Sie würde überschrieben.', 'This directory already contains an <code>index.php</code> that does not belong to Suchsel. It would be overwritten.'); ?></div>
        <label><input type="checkbox" name="sui_overwrite" value="1"> <span><?php echo suiH(suiT('Ja, die vorhandene index.php darf ersetzt werden.', 'Yes, the existing index.php may be replaced.')); ?></span></label>
<?php endif; ?>
        <button type="submit"><?php echo suiH($suiOld ? suiT('Jetzt aktualisieren', 'Update now') : suiT('Jetzt installieren', 'Install now')); ?></button>
    </form>
<?php endif; ?>
</div>
</body>
</html>
<?php
__halt_compiler();
