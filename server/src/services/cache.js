class TtlCache {
  constructor({ maxEntries = 500, defaultTtlMs = 5 * 60 * 1000 } = {}) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) return undefined;

    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  getStale(key) {
    return this.store.get(key)?.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.store.has(key)) this.store.delete(key);

    while (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }

    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

export default TtlCache;
