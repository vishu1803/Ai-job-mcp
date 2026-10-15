(function () {
  function openImport() {
    const panel = document.getElementById('import-resume');
    if (panel) panel.open = true;
  }
  if (window.location.hash === '#import-resume') openImport();
  document
    .querySelectorAll('a[href="#import-resume"]')
    .forEach((link) => link.addEventListener('click', openImport));
  const select = document.getElementById('workspaceTheme'),
    media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    document.documentElement.dataset.theme =
      select.value === 'system' ? (media.matches ? 'dark' : 'light') : select.value;
  };
  select.value = window.careerHubAppearance || 'system';
  select.addEventListener('change', () => {
    try {
      window.localStorage.setItem('career-hub-appearance', select.value);
    } catch {
      /* Theme still works without persistence. */
    }
    apply();
  });
  media.addEventListener('change', () => {
    if (select.value === 'system') apply();
  });
  const menu = document.getElementById('mobileNavMenu'),
    toggle = document.getElementById('mobileNavToggle');
  toggle.addEventListener('click', () => {
    if (menu.classList.contains('open')) menu.querySelector('a')?.focus();
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !menu.classList.contains('open')) return;
    const links = [...menu.querySelectorAll('a,button')];
    if (event.shiftKey && document.activeElement === links[0]) {
      event.preventDefault();
      toggle.focus();
    } else if (!event.shiftKey && document.activeElement === links.at(-1)) {
      event.preventDefault();
      toggle.focus();
    }
  });
  toggle.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && menu.classList.contains('open')) {
      event.preventDefault();
      (event.shiftKey ? menu.querySelector('a:last-child') : menu.querySelector('a'))?.focus();
    }
  });
})();
