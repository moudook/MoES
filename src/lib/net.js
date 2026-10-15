export class ApiError extends Error {
  constructor(message, status, url) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }
}

export function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  return search.toString();
}

export async function fetchJSON(url, options = {}) {
  const {
    timeoutMs = 8000,
    retries = 1,
    backoffMs = 250,
    fetchImpl = globalThis.fetch,
    headers = {},
    method,
    body,
  } = options;

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestInit = {
        headers: { accept: 'application/json', ...headers },
        signal: controller.signal,
      };
      if (method) requestInit.method = method;
      if (body !== undefined) requestInit.body = body;
      const response = await fetchImpl(url, requestInit);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const error = new ApiError(`HTTP ${response.status} for ${url}${body ? `: ${body.slice(0, 200)}` : ''}`, response.status, url);
        if (response.status >= 500 && attempt < retries) {
          lastError = error;
          await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
          continue;
        }
        throw error;
      }
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new ApiError(`Invalid JSON from ${url}`, 502, url);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status && error.status < 500) throw error;
      lastError = error instanceof Error ? error : new ApiError(String(error), 0, url);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new ApiError('Request failed', 0, url);
}

export class TTLCache {
  #map = new Map();
  constructor(ttlMs = 600000, nowFn = () => Date.now()) {
    this.ttlMs = ttlMs;
    this.now = nowFn;
  }
  get(key) {
    const entry = this.#map.get(key);
    if (!entry) return undefined;
    if (this.now() > entry.expires) {
      this.#map.delete(key);
      return undefined;
    }
    return entry.value;
  }
  set(key, value) {
    this.#map.set(key, { value, expires: this.now() + this.ttlMs });
    return value;
  }
  delete(key) {
    return this.#map.delete(key);
  }
  get size() {
    return this.#map.size;
  }
}
