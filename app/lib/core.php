<?php
/* Suchsel – Grundlagen: Datenordner, Einstellungen, Kopfzeilen, Sprache des Servers, Dateilisten */
defined('SU_VERSION') || exit;

function suFatal(string $msg): void {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    exit($msg . "\n");
}

function suNotFound(): void {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    exit("404\n");
}

/**
 * Einstellungen aus data/config.php. Fehlt die Datei, wird sie angelegt, samt data/ und einer .htaccess, die den Ordner sperrt.
 * Darin stehen ein zufälliger Schlüssel (für die Prüfsummen der Adressen) und der zufällige Name der Datenbank.
 * Alles andere hat Standardwerte und lässt sich dort von Hand eintragen, siehe Kopf der Datei.
 */
function suConfig(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $defaults = ['limit' => 10, 'days' => 30, 'auto_update' => true, 'ip_header' => ''];
    $file = SU_DATA_DIR . '/config.php';
    if (is_file($file)) {
        $c = @include $file;
        if (is_array($c) && !empty($c['secret']) && !empty($c['db'])) return $cfg = $c + $defaults;
    }
    if (!is_dir(SU_DATA_DIR) && !@mkdir(SU_DATA_DIR, 0700, true) && !is_dir(SU_DATA_DIR)) {
        // Ohne Schreibrechte läuft das Spiel trotzdem, nur ohne Sperre und ohne Update
        return $cfg = ['secret' => '', 'db' => ''] + $defaults;
    }
    if (!is_file(SU_DATA_DIR . '/.htaccess')) {
        @file_put_contents(SU_DATA_DIR . '/.htaccess', "# Suchsel: hier liegt alles Geheime, nichts davon darf von außen abrufbar sein.\n"
            . "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\nOptions -Indexes\n");
    }
    if (!is_file(SU_DATA_DIR . '/index.html')) @file_put_contents(SU_DATA_DIR . '/index.html', '');
    $new = ['secret' => bin2hex(random_bytes(32)), 'db' => 'su_' . bin2hex(random_bytes(12)) . '.sqlite'];
    if (!suConfigWrite($new)) return $cfg = ['secret' => '', 'db' => ''] + $defaults;
    return $cfg = $new + $defaults;
}

/** data/config.php schreiben (erst unter anderem Namen, dann umbenennen, damit nie eine halbe Datei dasteht) */
function suConfigWrite(array $cfg): bool {
    $file = SU_DATA_DIR . '/config.php';
    $php = "<?php\n"
        . "// Suchsel: automatisch angelegt. Nicht löschen, nicht weitergeben.\n"
        . "// Weitere Einträge, die man hier von Hand ergänzen kann (Standardwerte in Klammern):\n"
        . "//   'limit' => 10,          so viele neue Rätsel darf eine Adresse im Browser starten, danach nur noch als App (10). 0 = keine Sperre.\n"
        . "//   'days' => 30,           nach so vielen Tagen fängt die Zählung für eine Adresse von vorn an (30).\n"
        . "//   'auto_update' => false, keine automatischen Updates aus dem GitHub-Release (true = an).\n"
        . "//   'update_url' => '',     andere Adresse für Updates, '' schaltet sie ganz ab.\n"
        . "//   'ip_header' => 'HTTP_CF_CONNECTING_IP',  nur hinter einem Proxy wie Cloudflare: woher die echte Adresse kommt ('').\n"
        . "return " . var_export($cfg, true) . ";\n";
    if (@file_put_contents($file . '.tmp', $php, LOCK_EX) === false || !@rename($file . '.tmp', $file)) {
        @unlink($file . '.tmp');
        return false;
    }
    @chmod($file, 0600);
    if (function_exists('opcache_invalidate')) @opcache_invalidate($file, true);
    return true;
}

function suIsHttps(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

function suHeaders(bool $html = false): void {
    if (headers_sent()) return;
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()');
    header('Cross-Origin-Opener-Policy: same-origin');
    header('Cross-Origin-Resource-Policy: same-origin');
    if (suIsHttps()) header('Strict-Transport-Security: max-age=31536000');
    if ($html) {
        header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; "
            . "connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    } else {
        header('X-Robots-Tag: noindex, nofollow');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    }
}

function h(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

/** Sprache für die wenigen Texte, die der Server selbst schreibt: Deutsch für deutsche Geräte, sonst Englisch. Die App übersetzt sich selbst. */
function suLang(): string {
    $al = strtolower(trim((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')));
    return $al === '' || strncmp($al, 'de', 2) === 0 ? 'de' : 'en';
}
function suT(string $de, string $en): string {
    return suLang() === 'de' ? $de : $en;
}

/** Dateitypen, die über ?action=asset ausgeliefert werden */
function suAssetTypes(): array {
    return ['css' => 'text/css; charset=utf-8', 'js' => 'text/javascript; charset=utf-8', 'svg' => 'image/svg+xml', 'png' => 'image/png'];
}

/** Sprachen, für die es einen Wortschatz gibt (app/words/xx.txt) */
function suWordLangs(): array {
    static $l = null;
    if ($l !== null) return $l;
    $l = [];
    foreach ((array)@glob(SU_APP . '/words/*.txt') as $f) {
        $b = basename($f, '.txt');
        if (preg_match('~^[a-z]{2}$~', $b)) $l[] = $b;
    }
    sort($l);
    return $l;
}

/** Kennung für den Stand einer Datei: Version plus Änderungszeit, damit der Browser nach jedem Update frisch lädt */
function suFileVersion(string $rel): string {
    return SU_VERSION . '-' . (int)@filemtime(SU_APP . '/' . $rel);
}

/** Was der Service Worker beim Installieren vorhält: die Seite, alle Dateien und den Wortschatz aller Sprachen */
function suPrecacheList(): array {
    $out = ['./', '?action=manifest'];
    $types = suAssetTypes();
    foreach ((array)@glob(SU_APP . '/assets/*') as $f) {
        $b = basename($f);
        if ($b === 'sw.js' || !isset($types[strtolower((string)pathinfo($b, PATHINFO_EXTENSION))])) continue;
        $out[] = '?action=asset&f=' . $b . '&v=' . suFileVersion('assets/' . $b);
    }
    foreach (suWordLangs() as $l) $out[] = '?action=words&l=' . $l . '&v=' . suFileVersion('words/' . $l . '.txt');
    return $out;
}

/** Datei aus dem Netz holen (folgt Weiterleitungen, höchstens $max Bytes). Wirft bei jedem Fehler. */
function suHttpGet(string $url, int $max): string {
    if (!preg_match('~^https?://~i', $url)) throw new RuntimeException('bad url');
    $ua = 'Suchsel/' . SU_VERSION . ' (self-hosted)';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $buf = '';
        curl_setopt_array($ch, [CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 60,
            CURLOPT_USERAGENT => $ua, CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json, application/octet-stream;q=0.9, */*;q=0.5'],
            CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$buf, $max) { $buf .= $chunk; return strlen($buf) > $max ? 0 : strlen($chunk); }]);
        $ok = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if (strlen($buf) > $max) throw new RuntimeException('too large');
        if ($ok === false || $code !== 200) throw new RuntimeException('HTTP ' . ($code ?: $err));
        return $buf;
    }
    if (!filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) throw new RuntimeException('no curl, no allow_url_fopen');
    $ctx = stream_context_create(['http' => ['method' => 'GET', 'header' => "User-Agent: $ua\r\nAccept: application/vnd.github+json, */*;q=0.5", 'timeout' => 60,
        'follow_location' => 1, 'max_redirects' => 5, 'ignore_errors' => true]]);
    $buf = @file_get_contents($url, false, $ctx, 0, $max + 1);
    $code = isset($http_response_header) && preg_match_all('~^HTTP/\S+\s+(\d+)~m', implode("\n", $http_response_header), $m) ? (int)end($m[1]) : 0;
    if ($buf === false || $code !== 200) throw new RuntimeException('HTTP ' . $code);
    if (strlen($buf) > $max) throw new RuntimeException('too large');
    return $buf;
}
