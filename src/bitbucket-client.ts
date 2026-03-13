import type { PaginatedResponse, BitbucketError } from './types.js';

const BASE_URL = 'https://api.bitbucket.org/2.0';

export class BitbucketClient {
  private authHeader: string;

  constructor(username: string, apiToken: string) {
    this.authHeader = `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: 'application/json',
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorMessage = `Bitbucket API error [${response.status}]: ${response.statusText}`;
      try {
        const raw = await response.text();
        try {
          const errorBody = JSON.parse(raw) as BitbucketError;
          if (errorBody.error?.message) {
            const detail = errorBody.error.detail
              ? typeof errorBody.error.detail === 'string'
                ? errorBody.error.detail
                : JSON.stringify(errorBody.error.detail)
              : '';
            errorMessage = `Bitbucket API error [${response.status}]: ${errorBody.error.message}${detail ? ` — ${detail}` : ''}`;
          } else {
            errorMessage = `Bitbucket API error [${response.status}]: ${raw.slice(0, 500)}`;
          }
        } catch {
          if (raw) {
            errorMessage += ` — ${raw.slice(0, 500)}`;
          }
        }
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    // Some endpoints return 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async getRaw(path: string): Promise<string> {
    const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: this.authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Bitbucket API error: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  async getPaginated<T>(path: string, maxPages = 5): Promise<T[]> {
    const allValues: T[] = [];
    let url: string | undefined = path;
    let pages = 0;

    while (url && pages < maxPages) {
      const page: PaginatedResponse<T> = await this.get<PaginatedResponse<T>>(url);
      allValues.push(...page.values);
      url = page.next;
      pages++;
    }

    return allValues;
  }
}
