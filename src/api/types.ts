export type ApiReachableStatus = 'safe' | 'risky' | 'invalid' | 'unknown' | 'unverified';

export interface ApiResponse {
  email: string;
  is_valid: boolean;
  is_reachable: ApiReachableStatus;
  is_disposable: boolean;
  is_role_account: boolean;
  is_deliverable: boolean;
  mx_valid: boolean;
  reason: string;
}
