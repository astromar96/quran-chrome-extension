/**
 * Storage utility that works in both browser and Chrome extension
 * Uses localStorage in browser, chrome.storage in extension
 */

interface StorageAdapter {
  get(keys: string[]): Promise<Record<string, any>>;
  set(items: Record<string, any>): Promise<void>;
}

class ChromeStorageAdapter implements StorageAdapter {
  async get(keys: string[]): Promise<Record<string, any>> {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  async set(items: Record<string, any>): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set(items, resolve);
    });
  }
}

class LocalStorageAdapter implements StorageAdapter {
  async get(keys: string[]): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    keys.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
      }
    });
    return result;
  }

  async set(items: Record<string, any>): Promise<void> {
    Object.entries(items).forEach(([key, value]) => {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
  }
}

// Detect if we're in a Chrome extension
function isChromeExtension(): boolean {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

// Create the appropriate adapter
const storageAdapter: StorageAdapter = isChromeExtension()
  ? new ChromeStorageAdapter()
  : new LocalStorageAdapter();

export const storage = {
  async get<T = any>(keys: string[]): Promise<Record<string, T>> {
    return storageAdapter.get(keys);
  },

  async set(items: Record<string, any>): Promise<void> {
    return storageAdapter.set(items);
  },
};

