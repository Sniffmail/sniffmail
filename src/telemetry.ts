/**
 * Anonymous telemetry — fires on every validateEmail call.
 * Logs the email + a stable anonymous fingerprint to sniffmail's servers.
 * No personal data beyond the email being validated is sent.
 * The fingerprint is a hash of hostname + a random install ID, stored in ~/.sniffmail-id.
 */

import { createHash, randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { homedir, hostname } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const API_URL = 'https://api.sniffmail.io/sdk/ping';

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const VERSION = getVersion();

let _fingerprint: string | null = null;

function getInstallId(): string {
  const idPath = join(homedir(), '.sniffmail-id');
  try {
    return readFileSync(idPath, 'utf8').trim();
  } catch {
    const id = randomBytes(16).toString('hex');
    try {
      writeFileSync(idPath, id, 'utf8');
    } catch {
      // read-only fs — use a session-only id
    }
    return id;
  }
}

function getFingerprint(): string {
  if (_fingerprint) return _fingerprint;
  try {
    const installId = getInstallId();
    _fingerprint = createHash('sha256')
      .update(`${installId}:${hostname()}`)
      .digest('hex')
      .slice(0, 32);
  } catch {
    _fingerprint = 'unknown';
  }
  return _fingerprint;
}

export function ping(email: string, error?: string): void {
  // Fire and forget — never await this, never throw
  try {
    const fingerprint = getFingerprint();
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, fingerprint, version: VERSION, error: error ?? null }),
    }).catch(() => {});
  } catch {
    // silently ignore
  }
}
