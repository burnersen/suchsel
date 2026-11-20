<?php
/* Suchsel – Sperre im Browser: eine Adresse darf ein paar Rätsel auf der Webseite starten (Standard 10), danach geht es nur
   noch mit der installierten App weiter. Die App fragt hier nur nach, solange sie im Browser-Tab läuft.
   Gespeichert wird nie die Adresse selbst, sondern nur eine Prüfsumme mit geheimem Schlüssel. Nach 'days' Tagen
   (Standard 30) fängt die Zählung von vorn an, ältere Einträge werden gelöscht. */
defined('SU_VERSION') || exit;

/** Die Datenbank für die Zähler, null = geht nicht (dann gibt es eben keine Sperre) */
function suDb(): ?PDO {
    static $pdo = false;
    if ($pdo !== false) return $pdo;
    $pdo = null;
    $cfg = suConfig();
    if (!extension_loaded('pdo_sqlite') || empty($cfg['db']) || !preg_match('~^su_[0-9a-f]{24}\.sqlite$~', $cfg['db'])) return null;
    try {
        $db = new PDO('sqlite:' . SU_DATA_DIR . '/' . $cfg['db']);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $db->exec('PRAGMA busy_timeout = 5000');
        if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 1) {
            try { $db->query('PRAGMA journal_mode = WAL')->fetchAll(); } catch (Throwable $e) {}
            $db->exec('CREATE TABLE IF NOT EXISTS plays (k TEXT PRIMARY KEY, n INTEGER NOT NULL, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL)');
            $db->exec('PRAGMA user_version = 1');
            @chmod(SU_DATA_DIR . '/' . $cfg['db'], 0600);
        }
        $pdo = $db;
    } catch (Throwable $e) {
        error_log('Suchsel: Datenbank geht nicht: ' . $e->getMessage());
    }
    return $pdo;
}

/** Adresse des Besuchers. IPv6 wird auf das /64-Netz gekürzt, das gehört meist einem einzigen Anschluss. */
function suClientIp(): string {
    $cfg = suConfig();
    $ip = '';
    $hdr = (string)$cfg['ip_header'];
    if ($hdr !== '' && preg_match('~^HTTP_[A-Z0-9_]+$~', $hdr) && !empty($_SERVER[$hdr])) $ip = trim(explode(',', (string)$_SERVER[$hdr])[0]);
    if (filter_var($ip, FILTER_VALIDATE_IP) === false) $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false) {
        $bin = @inet_pton($ip);
        if ($bin !== false && strlen($bin) === 16) $ip = bin2hex(substr($bin, 0, 8)) . '::/64';
    }
    return $ip;
}

/**
 * Stand für diese Adresse. Mit $consume wird ein neues Rätsel gezählt, sofern noch eins frei ist.
 * Antwort: ok (darf spielen), limit (0 = keine Sperre), used, left
 */
function suQuota(bool $consume): array {
    $cfg = suConfig();
    $limit = max(0, (int)$cfg['limit']);
    $days = max(1, (int)$cfg['days']);
    if ($limit === 0) return ['ok' => true, 'limit' => 0, 'used' => 0, 'left' => 0];
    $db = suDb();
    if (!$db || $cfg['secret'] === '') return ['ok' => true, 'limit' => 0, 'used' => 0, 'left' => 0];
    $key = substr(hash_hmac('sha256', suClientIp(), (string)$cfg['secret']), 0, 32);
    $now = time();
    $old = $now - $days * 86400;
    try {
        $db->exec('BEGIN IMMEDIATE');
        $st = $db->prepare('SELECT n, first_at FROM plays WHERE k = ?');
        $st->execute([$key]);
        $row = $st->fetch();
        $n = $row && (int)$row['first_at'] >= $old ? (int)$row['n'] : 0;
        $first = $row && (int)$row['first_at'] >= $old ? (int)$row['first_at'] : $now;
        $ok = $n < $limit;
        if ($consume && $ok) {
            $n++;
            $db->prepare('INSERT OR REPLACE INTO plays (k, n, first_at, last_at) VALUES (?, ?, ?, ?)')->execute([$key, $n, $first, $now]);
        }
        if (mt_rand(1, 50) === 1) $db->prepare('DELETE FROM plays WHERE first_at < ?')->execute([$old]);
        $db->exec('COMMIT');
    } catch (Throwable $e) {
        try { $db->exec('ROLLBACK'); } catch (Throwable $e2) {}
        error_log('Suchsel: Zähler geht nicht: ' . $e->getMessage());
        return ['ok' => true, 'limit' => 0, 'used' => 0, 'left' => 0];
    }
    return ['ok' => $ok, 'limit' => $limit, 'used' => $n, 'left' => max(0, $limit - $n)];
}
