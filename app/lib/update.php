<?php
/* Suchsel – Updates von allein: höchstens alle 15 Minuten beim neuesten GitHub-Release nachsehen und eine neue Version
   gleich einspielen, nachdem die Seite ausgeliefert ist. Der Installer aus dem Release wird per Prüfsumme kontrolliert,
   die laufende Version vorher in data/update-prev.txt gelegt. Abschalten: 'auto_update' => false in data/config.php.
   Nach außen geht dabei nur die Frage an GitHub, nichts Persönliches. */
defined('SU_VERSION') || exit;

const SU_UPDATE_URL = 'https://api.github.com/repos/burnersen/suchsel/releases/latest';

function suUpdUrl(): string {
    $cfg = suConfig();
    return array_key_exists('update_url', $cfg) ? (string)$cfg['update_url'] : SU_UPDATE_URL;
}

/** Merkzettel der Updates (wann zuletzt nachgesehen, was gefunden) */
function suUpdState(?array $set = null): array {
    $file = SU_DATA_DIR . '/update.json';
    if ($set !== null) {
        @file_put_contents($file, json_encode($set, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
        @chmod($file, 0600);
        return $set;
    }
    $s = is_file($file) ? json_decode((string)@file_get_contents($file), true) : null;
    return is_array($s) ? $s : [];
}

/** Beim Release nachsehen: neueste Version, Adresse und Prüfsumme des Installers */
function suUpdCheck(): array {
    $url = suUpdUrl();
    if ($url === '') throw new RuntimeException('updates off');
    suUpdState(['at' => time()] + suUpdState());
    $j = json_decode(suHttpGet($url, 1 << 20), true);
    if (!is_array($j) || empty($j['tag_name'])) throw new RuntimeException('bad answer');
    $info = ['v' => preg_replace('~^(?:suchsel-|v)~i', '', (string)$j['tag_name']), 'url' => '', 'sha' => ''];
    foreach ((array)($j['assets'] ?? []) as $a) {
        if (is_array($a) && ($a['name'] ?? '') === 'suchsel-install.php') {
            $info['url'] = (string)($a['browser_download_url'] ?? '');
            if (preg_match('~^sha256:([0-9a-f]{64})$~', (string)($a['digest'] ?? ''), $m)) $info['sha'] = $m[1];
        }
    }
    if (!preg_match('~^[0-9][0-9A-Za-z.\-]*$~', $info['v'])) throw new RuntimeException('bad version');
    suUpdState(['at' => time(), 'info' => $info]);
    return $info;
}

/** Erlaubte Pfade im Paket: index.php, LICENSE und alles unter app/ */
function suPayloadPathOk(string $p): bool {
    return (bool)preg_match('~^(?:index\.php|LICENSE|app(?:/[A-Za-z0-9._\-]+)+)$~', $p) && strpos($p, '..') === false;
}

/** Dateien im Format des Installers: hinter „__halt_compiler();“ pro Zeile Pfad, SHA-256 und Inhalt (Base64). null = unbrauchbar. */
function suPayloadParse(string $raw): ?array {
    $pos = strpos($raw, '__halt_compiler();');
    $raw = $pos === false ? $raw : substr($raw, $pos + 18);
    $files = [];
    foreach (explode("\n", $raw) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        $p = explode("\t", $line);
        if (count($p) !== 3 || !suPayloadPathOk($p[0])) return null;
        $bin = base64_decode($p[2], true);
        if ($bin === false || !hash_equals($p[1], hash('sha256', $bin))) return null;
        $files[$p[0]] = $bin;
    }
    return isset($files['index.php'], $files['app/lib/core.php'], $files['app/assets/app.js']) ? $files : null;
}

/** Die laufende Version in einer Datei festhalten (gleiches Format), damit man zu ihr zurückkann */
function suPayloadSave(string $file): void {
    $list = ['index.php', 'LICENSE'];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(SU_APP, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) if ($f->isFile()) $list[] = 'app/' . str_replace('\\', '/', substr($f->getPathname(), strlen(SU_APP) + 1));
    $out = '#Suchsel ' . SU_VERSION . "\n";
    foreach ($list as $path) {
        if (!is_file(SU_ROOT . '/' . $path) || !suPayloadPathOk($path)) continue;
        $bin = (string)file_get_contents(SU_ROOT . '/' . $path);
        $out .= $path . "\t" . hash('sha256', $bin) . "\t" . base64_encode($bin) . "\n";
    }
    if (@file_put_contents($file, $out, LOCK_EX) !== strlen($out)) throw new RuntimeException('cannot save current version');
    @chmod($file, 0600);
}

/** Dateien einspielen wie der Installer: alles erst unter Zwischennamen schreiben, dann umbenennen, Überbleibsel in app/ wegräumen */
function suPayloadInstall(array $files): void {
    $tmp = [];
    $fail = '';
    foreach ($files as $path => $bin) {
        $target = SU_ROOT . '/' . $path;
        $parent = dirname($target);
        if (!is_dir($parent) && !@mkdir($parent, 0755, true) && !is_dir($parent)) { $fail = $path; break; }
        $t = $target . '.tmp';
        if (@file_put_contents($t, $bin) !== strlen($bin)) { @unlink($t); $fail = $path; break; }
        $tmp[$t] = $target;
    }
    if ($fail === '') {
        foreach ($tmp as $t => $target) {
            if (!@rename($t, $target)) { $fail = substr($target, strlen(SU_ROOT) + 1); break; }
            @chmod($target, 0644);
            if (function_exists('opcache_invalidate')) @opcache_invalidate($target, true);
        }
    }
    foreach ($tmp as $t => $target) if (is_file($t)) @unlink($t);
    if ($fail !== '') throw new RuntimeException('cannot write ' . $fail);
    foreach (['lib', 'views', 'assets', 'words'] as $sub) {
        foreach ((array)@glob(SU_APP . '/' . $sub . '/*') as $old) {
            if (is_file($old) && !isset($files['app/' . $sub . '/' . basename($old)])) @unlink($old);
        }
    }
}

/** Darf PHP die Programmdateien überschreiben? '' = ja, sonst der erste Pfad, bei dem es nicht geht */
function suUpdWritable(): string {
    foreach (['index.php', 'app', 'app/lib', 'app/views', 'app/assets', 'app/words', 'app/lib/core.php', 'app/assets/app.js'] as $p) {
        if (file_exists(SU_ROOT . '/' . $p) && !is_writable(SU_ROOT . '/' . $p)) return $p;
    }
    return '';
}

/** Neueste Version holen, prüfen und einspielen */
function suUpdInstall(array $info): void {
    if ($info['url'] === '' || $info['sha'] === '') throw new RuntimeException('no verifiable installer');
    if (($w = suUpdWritable()) !== '') throw new RuntimeException('not writable: ' . $w);
    @set_time_limit(150);
    $bin = suHttpGet($info['url'], 16 << 20);
    if (!hash_equals($info['sha'], hash('sha256', $bin))) throw new RuntimeException('checksum mismatch');
    $files = suPayloadParse($bin);
    if (!$files || !preg_match("~define\\('SU_VERSION',\\s*'" . preg_quote($info['v'], '~') . "'\\)~", $files['index.php'])) {
        throw new RuntimeException('unusable installer');
    }
    suPayloadSave(SU_DATA_DIR . '/update-prev.txt');
    suPayloadInstall($files);
}

/** Höchstens alle 15 Minuten nachsehen, eine neue Version gleich einspielen. Läuft nach der ausgelieferten Seite.
    Eine Sperrdatei sorgt dafür, dass es nur einmal gleichzeitig passiert. */
function suAutoUpdate(): void {
    $cfg = suConfig();
    if (empty($cfg['auto_update']) || $cfg['secret'] === '' || suUpdUrl() === '') return;
    if (time() - (int)(suUpdState()['at'] ?? 0) < 900) return;
    $lock = @fopen(SU_DATA_DIR . '/update.lock', 'c');
    if (!$lock) return;
    if (!flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); return; }
    try {
        ignore_user_abort(true);
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        else { while (ob_get_level() > 0) @ob_end_flush(); @flush(); }
        if (time() - (int)(suUpdState()['at'] ?? 0) < 900) return;   // ein anderer Aufruf war schneller
        @set_time_limit(150);
        $info = suUpdCheck();
        if (version_compare($info['v'], SU_VERSION, '>')) suUpdInstall($info);
    } catch (Throwable $e) {
        error_log('Suchsel Update: ' . $e->getMessage());
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
