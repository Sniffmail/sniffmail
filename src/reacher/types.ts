export interface ReacherSyntax {
  address: string;
  domain: string;
  is_valid_syntax: boolean;
  username: string;
}

export interface ReacherMxRecord {
  exchange: string;
  priority: number;
}

export interface ReacherMx {
  accepts_mail: boolean;
  records: ReacherMxRecord[];
}

export interface ReacherSmtp {
  can_connect_smtp: boolean;
  has_full_inbox: boolean;
  is_catch_all: boolean;
  is_deliverable: boolean;
  is_disabled: boolean;
}

export interface ReacherMisc {
  is_disposable: boolean;
  is_role_account: boolean;
  gravatar_url: string | null;
}

export type ReacherReachableStatus = 'safe' | 'risky' | 'invalid' | 'unknown';

export interface ReacherResponse {
  input: string;
  is_reachable: ReacherReachableStatus;
  syntax: ReacherSyntax;
  mx: ReacherMx;
  smtp: ReacherSmtp;
  misc: ReacherMisc;
}
