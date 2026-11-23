export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const KEY = 'emadeco.session';

/** Le stockage peut être indisponible (navigation privée, WebView) : on ne fait jamais planter l'application. */
export const session = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return memoryToken;
    }
  },
  set(token: string) {
    memoryToken = token;
    try {
      localStorage.setItem(KEY, token);
    } catch {
      /* ignoré */
    }
  },
  clear() {
    memoryToken = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignoré */
    }
  },
};
let memoryToken: string | null = null;

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = session.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'Connexion impossible. Vérifiez votre réseau et réessayez.', 'network');
  }

  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* corps vide ou non JSON */
  }
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, data?.error?.message ?? 'Une erreur est survenue.', data?.error?.code);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, undefined, form),
};

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'Une erreur est survenue.');
