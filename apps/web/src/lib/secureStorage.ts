const SALT =
  import.meta.env.VITE_ENCRYPTION_SALT || import.meta.env.ENCRYPTION_SALT || 'lorekeeper-salt';

const textEncoder = new TextEncoder();

const deriveKey = async () => {
  const material = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(SALT),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: textEncoder.encode('secure-storage'), iterations: 100_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const pack = (iv: Uint8Array, data: ArrayBuffer) =>
  `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(data)))}`;

const unpack = (payload: string) => {
  const [iv, content] = payload.split('.');
  if (!iv || !content) throw new Error('Invalid payload');
  return {
    iv: Uint8Array.from(atob(iv), (c) => c.charCodeAt(0)),
    data: Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
  };
};

export const encryptValue = async (value: string) => {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(value));
  return pack(iv, encrypted);
};

export const decryptValue = async (payload: string) => {
  const key = await deriveKey();
  const { iv, data } = unpack(payload);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
};

const setCookie = (name: string, value: string, days = 7) => {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax; Secure`;
};

const getCookie = (name: string) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const clearCookie = (name: string) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax; Secure`;
};

export const secureStorage = {
  async storeTokens(accessToken: string, refreshToken?: string) {
    try {
      setCookie('lk_access_token', accessToken);
      if (refreshToken) setCookie('lk_refresh_token', refreshToken);
    } catch (error) {
      const encryptedAccess = await encryptValue(accessToken);
      localStorage.setItem('lk_access_token', encryptedAccess);
      if (refreshToken) {
        const encryptedRefresh = await encryptValue(refreshToken);
        localStorage.setItem('lk_refresh_token', encryptedRefresh);
      }
    }
  },

  async loadTokens() {
    const cookieAccess = getCookie('lk_access_token');
    const cookieRefresh = getCookie('lk_refresh_token');
    if (cookieAccess) {
      return { accessToken: cookieAccess, refreshToken: cookieRefresh };
    }
    const storedAccess = localStorage.getItem('lk_access_token');
    const storedRefresh = localStorage.getItem('lk_refresh_token');
    return {
      accessToken: storedAccess ? await decryptValue(storedAccess) : null,
      refreshToken: storedRefresh ? await decryptValue(storedRefresh) : null
    };
  },

  clearTokens() {
    clearCookie('lk_access_token');
    clearCookie('lk_refresh_token');
    localStorage.removeItem('lk_access_token');
    localStorage.removeItem('lk_refresh_token');
  },

  async storePassphrase(passphrase: string) {
    const encrypted = await encryptValue(passphrase);
    localStorage.setItem('lk_private_passphrase', encrypted);
  },

  async loadPassphrase() {
    const stored = localStorage.getItem('lk_private_passphrase');
    return stored ? await decryptValue(stored) : null;
  },

  clearPassphrase() {
    localStorage.removeItem('lk_private_passphrase');
  }
};
