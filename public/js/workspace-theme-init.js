(function () {
  let preference = 'system';
  try {
    preference = window.localStorage.getItem('career-hub-appearance') || 'system';
  } catch {
    /* Storage is optional. */
  }
  if (!['system', 'light', 'dark'].includes(preference)) preference = 'system';
  window.careerHubAppearance = preference;
  document.documentElement.dataset.theme =
    preference === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
})();
