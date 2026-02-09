import type { ReacherResponse } from './types';
import { getReacherUrl, getReacherApiKey } from '../config';

const REACHER_TIMEOUT = 30000; // 30 seconds

export class ReacherNotConfiguredError extends Error {
  constructor() {
    super(
      'Reacher backend URL not configured. Call configure({ reacherUrl: "..." }) or set REACHER_BACKEND_URL env var.'
    );
    this.name = 'ReacherNotConfiguredError';
  }
}

export class ReacherError extends Error {
  public statusCode?: number;
  public responseData?: unknown;

  constructor(message: string, statusCode?: number, responseData?: unknown) {
    super(message);
    this.name = 'ReacherError';
    this.statusCode = statusCode;
    this.responseData = responseData;
  }
}

export async function checkMailbox(email: string): Promise<ReacherResponse> {
  const reacherUrl = getReacherUrl();
  const reacherApiKey = getReacherApiKey();

  if (!reacherUrl) {
    throw new ReacherNotConfiguredError();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (reacherApiKey) {
    headers['Authorization'] = `Bearer ${reacherApiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REACHER_TIMEOUT);

  try {
    const response = await fetch(`${reacherUrl}/v0/check_email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to_email: email }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new ReacherError(
        `Reacher backend returned ${response.status}`,
        response.status,
        data
      );
    }

    return (await response.json()) as ReacherResponse;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ReacherNotConfiguredError || error instanceof ReacherError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new ReacherError('Reacher backend request timed out');
      }
      throw new ReacherError(`Reacher backend error: ${error.message}`);
    }

    throw new ReacherError('Unknown Reacher backend error');
  }
}

export async function checkReacherHealth(): Promise<boolean> {
  const reacherUrl = getReacherUrl();

  if (!reacherUrl) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(reacherUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 404 is acceptable - means the server is running
    return response.status < 500 || response.status === 404;
  } catch {
    return false;
  }
}
