export type ReachableStatus = 'safe' | 'risky' | 'invalid' | 'unknown';

export type ValidationReason =
  | 'invalid_syntax'
  | 'disposable'
  | 'no_mx_records'
  | 'mailbox_not_found'
  | 'mailbox_full'
  | 'mailbox_disabled'
  | 'catch_all'
  | 'smtp_error'
  | null;

export interface SmtpResult {
  is_reachable: ReachableStatus;
  can_connect: boolean;
  is_deliverable: boolean;
  is_catch_all: boolean;
}

export interface ValidationResult {
  email: string;
  valid: boolean;
  reason: ValidationReason;
  disposable: boolean;
  mx: boolean;
  smtp: SmtpResult | null;
  cached: boolean;
}

export interface ValidationOptions {
  /** Enable deep SMTP verification via Reacher backend (default: false) */
  deep?: boolean;
  /** Check MX records (default: true) */
  checkMx?: boolean;
  /** Use DeBounce API for disposable detection (default: true) */
  useDeBounce?: boolean;
  /** Timeout for DNS lookups in seconds (default: 5) */
  timeout?: number;
}

export interface BatchValidationOptions extends ValidationOptions {
  /** Max concurrent Reacher calls for deep mode (default: 5) */
  concurrency?: number;
}

export interface BatchValidationResult {
  results: ValidationResult[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    disposable: number;
    unknown: number;
  };
}

export interface CacheTtlConfig {
  safe?: number;
  invalid?: number;
  risky?: number;
  unknown?: number;
}

export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete?(key: string): Promise<void>;
}

export interface SniffmailConfig {
  reacherUrl?: string;
  reacherApiKey?: string;
  cache?: {
    enabled?: boolean;
    store?: CacheStore;
    ttl?: CacheTtlConfig;
  };
}
