/**
 * @file Bounded In-Memory Webhook Delivery Idempotency Cache
 *
 * Implements delivery tracking via X-GitHub-Delivery with a 24-hour TTL
 * to prevent duplicate webhook processing according to ADR-023.
 *
 * Known Limitation:
 * This in-memory cache is process-local and does not provide distributed cross-instance
 * deduplication. For multi-instance production deployments in Phase 14+, a centralized
 * Redis store or database delivery ledger will be introduced.
 */

export class WebhookDeliveryCache {
  /**
   * @param {object} [options]
   * @param {number} [options.ttlMs=86400000] - Time-to-live in ms (default: 24 hours)
   * @param {number} [options.maxSize=10000] - Maximum cache entry capacity
   * @param {() => number} [options.nowFn] - Time provider function for deterministic testing
   */
  constructor({ ttlMs = 86400000, maxSize = 10000, nowFn = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.nowFn = nowFn;
    /** @type {Map<string, number>} Delivery ID -> Timestamp (ms) */
    this.cache = new Map();
  }

  /**
   * Checks if a delivery ID has already been recorded and is unexpired.
   *
   * @param {string} deliveryId - GitHub delivery GUID
   * @returns {boolean} True if delivery ID exists and is within TTL
   */
  has(deliveryId) {
    if (!deliveryId || typeof deliveryId !== 'string') {
      return false;
    }

    const timestamp = this.cache.get(deliveryId);
    if (timestamp === undefined) {
      return false;
    }

    const now = this.nowFn();
    if (now - timestamp > this.ttlMs) {
      this.cache.delete(deliveryId);
      return false;
    }

    return true;
  }

  /**
   * Records a delivery ID in the cache with the current timestamp.
   *
   * @param {string} deliveryId - GitHub delivery GUID
   */
  set(deliveryId) {
    if (!deliveryId || typeof deliveryId !== 'string') {
      return;
    }

    // Enforce maximum capacity via FIFO eviction
    if (this.cache.size >= this.maxSize && !this.cache.has(deliveryId)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(deliveryId, this.nowFn());
  }

  /**
   * Deletes a specific delivery ID from the cache.
   *
   * @param {string} deliveryId
   */
  delete(deliveryId) {
    this.cache.delete(deliveryId);
  }

  /**
   * Clears all cached delivery entries.
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Returns the count of active (unexpired) cached delivery entries.
   *
   * @returns {number}
   */
  size() {
    const now = this.nowFn();
    for (const [key, timestamp] of this.cache.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
    return this.cache.size;
  }
}

export const defaultWebhookDeliveryCache = new WebhookDeliveryCache();
