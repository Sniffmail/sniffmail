import type { ApiResponse } from './types';
import { getApiUrl, getApiKey } from '../config';

const REQUEST_TIMEOUT = 30000; // 30 seconds

export class ApiKeyNotConfiguredError extends Error {
  constructor() {
    super(
      'API key not configured. Call configure({ apiKey: "sniff_xxx" }) or set SNIFFMAIL_API_KEY env var. Get your free API key at https://sniffmail.io'
    );
    this.name = 'ApiKeyNotConfiguredError';
  }
}

export class SniffmailError extends Error {
  public statusCode?: number;
  public responseData?: unknown;

  constructor(message: string, statusCode?: number, responseData?: unknown) {
    super(message);
    this.name = 'SniffmailError';
    this.statusCode = statusCode;
    this.responseData = responseData;
  }
}

export async function checkMailbox(email: string): Promise<ApiResponse> {
  const apiUrl = getApiUrl();
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new ApiKeyNotConfiguredError();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'x-api-key': apiKey,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${apiUrl}/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        throw new SniffmailError(
          'Invalid API key. Get your free API key at https://sniffmail.io',
          401,
          data
        );
      }

      if (response.status === 403) {
        throw new SniffmailError(
          'Usage limit exceeded. Upgrade your plan at https://sniffmail.io',
          403,
          data
        );
      }

      if (response.status === 429) {
        throw new SniffmailError(
          'Rate limit exceeded. Please slow down your requests.',
          429,
          data
        );
      }

      throw new SniffmailError(
        `API returned ${response.status}`,
        response.status,
        data
      );
    }

    return (await response.json()) as ApiResponse;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiKeyNotConfiguredError || error instanceof SniffmailError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new SniffmailError('Request timed out');
      }
      throw new SniffmailError(`API error: ${error.message}`);
    }

    throw new SniffmailError('Unknown API error');
  }
}

export async function checkApiHealth(): Promise<boolean> {
  const apiUrl = getApiUrl();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${apiUrl}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    return response.status < 500;
  } catch {
    return false;
  }
}
