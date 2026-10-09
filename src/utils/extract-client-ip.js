import { normalizeIp } from '../security/proxy-policy.js';

/** Never read provider/client headers here. Missing identity shares one bounded
 * bucket, not a limiter bypass or a fabricated loopback address.
 */
export function extractClientIp(req) {
  return (
    normalizeIp(req.ip) ||
    normalizeIp(req.socket?.remoteAddress || req.raw?.socket?.remoteAddress) ||
    'unknown'
  );
}
