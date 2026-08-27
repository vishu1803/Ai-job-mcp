/**
 * @file Client IP Extraction Utility (P14-003 Security Fix)
 *
 * Extracts the real client IP from a Fastify request.
 *
 * IP trust model:
 * - LOCAL (trustProxy=false): req.ip is the actual client. Fastify ignores proxy
 *   headers. A client sending CF-Connecting-IP or X-Forwarded-For directly gets
 *   req.ip (127.0.0.1), not the spoofed header value.
 * - PRODUCTION (trustProxy=true): Fastify trusts X-Forwarded-For and sets req.ip
 *   to the leftmost (original client) IP. CF-Connecting-IP is Cloudflare-specific
 *   and may be more accurate, so it takes precedence when a proxy is detected.
 *
 * SECURITY INVARIANT:
 *   On direct (non-proxy) requests, the client CANNOT choose an arbitrary
 *   rate-limit identity by setting proxy headers. When trustProxy=false, Fastify
 *   does not populate req.ip from X-Forwarded-For, and this utility ignores
 *   CF-Connecting-IP because no trusted proxy is present.
 *
 * Detection:
 *   When req.ip differs from req.socket.remoteAddress, Fastify accepted a
 *   forwarded header — meaning trustProxy is enabled and a proxy is in front.
 */

/**
 * Extracts the real client IP address from a Fastify request.
 *
 * @param {import('fastify').FastifyRequest} req Fastify request object
 * @returns {string} Client IP address
 */
export function extractClientIp(req) {
  // Detect whether a trusted proxy is in front by comparing Fastify's req.ip
  // (which respects trustProxy) with the raw socket remote address.
  // When they differ, a proxy set the X-Forwarded-For header and Fastify trusted it.
  const reqIp = req.ip;
  const socketRemote = req.socket?.remoteAddress || '';
  const normalize = (ip) => (ip || '').replace(/^::ffff:/, '');
  const isBehindProxy = reqIp && socketRemote && normalize(reqIp) !== normalize(socketRemote);

  if (isBehindProxy) {
    // Behind a trusted proxy: CF-Connecting-IP is the highest-fidelity client IP
    // (Cloudflare-specific, cannot be spoofed by clients).
    const cfConnectingIp = req.headers['cf-connecting-ip'];
    if (cfConnectingIp && typeof cfConnectingIp === 'string') {
      return cfConnectingIp;
    }
  }

  // req.ip is the authoritative source:
  // - Direct request (no proxy): returns the actual connection IP (loopback)
  // - Behind trustProxy=true: returns the leftmost X-Forwarded-For IP (client)
  // This is always safe because Fastify handles trustProxy internally.
  if (reqIp) {
    return reqIp;
  }

  return '127.0.0.1';
}
