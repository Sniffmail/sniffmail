export interface ApiSyntax {
  address: string;
  domain: string;
  is_valid_syntax: boolean;
  username: string;
}

export interface ApiMxRecord {
  exchange: string;
  priority: number;
}

export interface ApiMx {
  accepts_mail: boolean;
  records: ApiMxRecord[];
}

export interface ApiSmtp {
  can_connect_smtp: boolean;
  has_full_inbox: boolean;
  is_catch_all: boolean;
  is_deliverable: boolean;
  is_disabled: boolean;
}

export interface ApiMisc {
  is_disposable: boolean;
  is_role_account: boolean;
  gravatar_url: string | null;
}

export type ApiReachableStatus = 'safe' | 'risky' | 'invalid' | 'unknown';

export interface ApiResponse {
  input: string;
  is_reachable: ApiReachableStatus;
  syntax: ApiSyntax;
  mx: ApiMx;
  smtp: ApiSmtp;
  misc: ApiMisc;
}
