/**
 * A bounded in-memory TTL cache.
 *
 * Redis would be the obvious answer, but it is another service to pay for and
 * to keep running. Every entry here is a copy of freely available public map
 * data, so losing the whole cache on restart costs one slow request. The size
 * cap is what stops a busy map screen turning into a memory leak.
 */
class TtlCache {
  constructor({ maxEntries = 500, defaultTtlMs = 5 * 60 * 1000 } = {}) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    /*
     * Expired entries are kept rather than deleted, so `getStale` can still
     * reach them. The size cap still bounds the store: an expired entry is
     * evicted like any other once it becomes the least recently used.
     */
    if (entry.expiresAt <= Date.now()) return undefined;

    // Re-insert so the Map's insertion order doubles as a recency list.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /**
   * The value regardless of age, for a caller that would otherwise fail.
   *
   * Overpass and Nominatim are donated infrastructure and rate-limit or go down
   * without warning. An hour-old list of police stations is worth far more to
   * somebody who needs one than an error message, so a failed refresh can fall
   * back to the last known good answer.
   */
  getStale(key) {
    return this.store.get(key)?.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.store.has(key)) this.store.delete(key);

    // Evict the least recently used entry once we are full.
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
