import { isIP } from 'node:net';

const configurationError = () =>
  new Error('TRUSTED_PROXY_CIDRS must contain explicit IP addresses or nonzero CIDRs only');

// Node's strict parser rejects octal/shorthand IPv4, ports and hostnames.
function parseAddress(value) {
  if (typeof value !== 'string' || value.includes('%') || !isIP(value)) return null;
  if (isIP(value) === 4) {
    const parts = value.split('.').map(Number);
    return {
      bits: 32,
      value: parts.reduce((n, p) => (n << 8n) | BigInt(p), 0n),
      text: parts.join('.'),
    };
  }
  let input = value.toLowerCase();
  if (input.includes('.')) {
    const lastColon = input.lastIndexOf(':');
    const octets = input
      .slice(lastColon + 1)
      .split('.')
      .map(Number);
    input = `${input.slice(0, lastColon + 1)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = input.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const words =
    halves.length === 2
      ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
      : left;
  const binary = words.reduce((n, p) => (n << 16n) | BigInt(`0x${p}`), 0n);
  if (binary >> 32n === 0xffffn) {
    const octets = [24n, 16n, 8n, 0n].map((shift) => Number((binary >> shift) & 255n));
    return { bits: 32, value: binary & 0xffffffffn, text: octets.join('.'), mapped: true };
  }
  return { bits: 128, value: binary, text: new URL(`http://[${value}]/`).hostname.slice(1, -1) };
}

export function normalizeIp(value) {
  return parseAddress(value)?.text || null;
}

/** Shared env/programmatic contract. Equivalent networks and duplicates collapse. */
export function parseTrustedProxies(input = '') {
  if (input === false || input === undefined || input === '') return [];
  const entries = typeof input === 'string' ? input.trim().split(',') : input;
  if (!Array.isArray(entries) || entries.length > 128) throw configurationError();
  if (typeof input === 'string' && !input.trim()) return [];
  const networks = new Map();
  for (const entry of entries) {
    if (typeof entry !== 'string') throw configurationError();
    const pieces = entry.trim().split('/');
    const address = parseAddress(pieces[0]);
    if (!address || pieces.length > 2) throw configurationError();
    let prefix = address.bits;
    if (pieces.length === 2) {
      if (!/^(0|[1-9][0-9]*)$/.test(pieces[1])) throw configurationError();
      prefix = Number(pieces[1]);
      if (address.mapped) {
        if (prefix < 97 || prefix > 128) throw configurationError();
        prefix -= 96;
      }
    }
    if (prefix < 1 || prefix > address.bits) throw configurationError();
    const shift = BigInt(address.bits - prefix);
    const network = (address.value >> shift) << shift;
    const key = `${address.bits}:${network}:${prefix}`;
    const text =
      address.bits === 32
        ? [24n, 16n, 8n, 0n].map((s) => Number((network >> s) & 255n)).join('.')
        : new URL(
            `http://[${[112n, 96n, 80n, 64n, 48n, 32n, 16n, 0n].map((s) => ((network >> s) & 65535n).toString(16)).join(':')}]/`
          ).hostname.slice(1, -1);
    networks.set(key, `${text}/${prefix}`);
  }
  return [...networks.values()].sort();
}

export function createProxyPolicy(input = '') {
  const cidrs = parseTrustedProxies(input);
  const ranges = cidrs.map((cidr) => {
    const [ip, prefix] = cidr.split('/');
    return { ...parseAddress(ip), prefix: Number(prefix) };
  });
  const trust = (ip) => {
    const address = parseAddress(ip);
    return (
      !!address &&
      ranges.some(
        (range) =>
          address.bits === range.bits &&
          address.value >> BigInt(range.bits - range.prefix) ===
            range.value >> BigInt(range.bits - range.prefix)
      )
    );
  };
  return Object.freeze({ cidrs: Object.freeze(cidrs), trust });
}

/** Walk from socket toward client; stop at the nearest untrusted hop.
 * Invalid/missing/oversized chains collapse to peer. CF-Connecting-IP,
 * X-Real-IP and Forwarded are deliberately not identity sources.
 */
export function resolveClientIdentity(req, policy) {
  const peer = normalizeIp(req.socket?.remoteAddress || req.raw?.socket?.remoteAddress);
  const fallback = {
    clientIp: peer || 'unknown',
    peerIp: peer || 'unknown',
    ips: [peer || 'unknown'],
  };
  if (!peer || !policy.trust(peer)) return fallback;
  const header = req.headers?.['x-forwarded-for'];
  if (typeof header !== 'string' || header.length > 4096) return fallback;
  const fields = header.split(',');
  if (fields.length > 32) return fallback;
  const chain = fields.map((ip) => normalizeIp(ip.trim()));
  if (chain.some((ip) => !ip)) return fallback;
  const ips = [peer];
  for (const hop of chain.reverse()) {
    if (!policy.trust(ips[ips.length - 1])) break;
    ips.push(hop);
  }
  return { clientIp: ips[ips.length - 1], peerIp: peer, ips };
}

export function installProxyPolicy(app, policy) {
  app.decorate('proxyPolicy', policy);
  app.addHook('onRequest', async (req) => {
    const identity = resolveClientIdentity(req, policy);
    // All limiters and audit writers see the same canonical identity.
    Object.defineProperties(req, {
      ip: { value: identity.clientIp },
      ips: { value: Object.freeze(identity.ips) },
      peerIp: { value: identity.peerIp },
    });
  });
}
