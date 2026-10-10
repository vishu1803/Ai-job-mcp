/** Keep request paths useful for diagnostics without logging query credentials. */
export function safeLogUrl(url) {
  return typeof url === 'string' ? url.split(/[?#]/, 1)[0] : undefined;
}
