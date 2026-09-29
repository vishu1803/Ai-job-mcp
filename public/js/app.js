(function () {
  // 1. Mobile Navigation Drawer
  const toggle = document.getElementById('mobileNavToggle');
  const menu = document.getElementById('mobileNavMenu');
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      const isOpen = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.innerHTML = isOpen
        ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
        : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Close mobile nav when clicking any link
    menu.querySelectorAll('a, button').forEach(function (link) {
      link.addEventListener('click', function () {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML =
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';
        document.body.style.overflow = '';
      });
    });
  }

  // 2. Global Dropdown Management (Nav & User)
  const allDropdowns = Array.from(document.querySelectorAll('.nav-dropdown, .user-dropdown'));

  function closeAllDropdowns(exceptElement) {
    allDropdowns.forEach(function (drop) {
      if (drop !== exceptElement && drop.classList.contains('open')) {
        drop.classList.remove('open');
        const btn = drop.querySelector('.nav-dropdown-btn, .user-dropdown-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  allDropdowns.forEach(function (drop) {
    const btn = drop.querySelector('.nav-dropdown-btn, .user-dropdown-btn');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const wasOpen = drop.classList.contains('open');
      closeAllDropdowns(drop);
      const isNowOpen = !wasOpen;
      drop.classList.toggle('open', isNowOpen);
      btn.setAttribute('aria-expanded', String(isNowOpen));
    });

    // Close on link click inside dropdown
    drop.querySelectorAll('a, button[type="submit"]').forEach(function (item) {
      item.addEventListener('click', function () {
        drop.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
    });
  });

  // Close on outside click
  document.addEventListener('click', function (e) {
    let insideDropdown = false;
    allDropdowns.forEach(function (drop) {
      if (drop.contains(e.target)) insideDropdown = true;
    });
    if (!insideDropdown) {
      closeAllDropdowns(null);
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (menu && menu.classList.contains('open')) {
        menu.classList.remove('open');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
          toggle.innerHTML =
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';
          toggle.focus();
        }
        document.body.style.overflow = '';
      }
      let focusedBtn = null;
      allDropdowns.forEach(function (drop) {
        if (drop.classList.contains('open')) {
          focusedBtn = drop.querySelector('.nav-dropdown-btn, .user-dropdown-btn');
        }
      });
      closeAllDropdowns(null);
      if (focusedBtn) focusedBtn.focus();
    }
  });

  // 3. User-Facing State Controller
  window.UserFacingState = {
    showToast: function (opts) {
      const container = document.getElementById('portalToastContainer');
      if (!container) return;
      const toast = document.createElement('div');
      const type = opts.type || 'info';
      toast.className = 'portal-toast portal-toast-' + type;
      toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

      let iconSvg =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
      if (type === 'success')
        iconSvg =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
      if (type === 'error')
        iconSvg =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      if (type === 'warning')
        iconSvg =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

      toast.innerHTML =
        '<span style="flex-shrink:0; display:inline-flex; align-items:center;">' +
        iconSvg +
        '</span>' +
        '<div style="flex-grow:1;">' +
        (opts.title
          ? '<div style="font-weight:700; margin-bottom:2px;">' + opts.title + '</div>'
          : '') +
        '<div>' +
        (opts.message || '') +
        '</div>' +
        '</div>' +
        '<button type="button" style="background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:1rem; padding:0 4px;" aria-label="Close">&times;</button>';

      toast.querySelector('button').addEventListener('click', function () {
        toast.classList.remove('show');
        setTimeout(function () {
          toast.remove();
        }, 300);
      });

      container.appendChild(toast);
      // Trigger transition
      requestAnimationFrame(function () {
        toast.classList.add('show');
      });

      const duration = opts.duration || (type === 'error' ? 8000 : 4000);
      setTimeout(function () {
        if (toast.parentNode) {
          toast.classList.remove('show');
          setTimeout(function () {
            toast.remove();
          }, 300);
        }
      }, duration);
    },

    highlightFieldErrors: function (formEl, errors) {
      if (!formEl || !Array.isArray(errors)) return;
      // Clear existing
      formEl.querySelectorAll('.is-invalid').forEach(function (el) {
        el.classList.remove('is-invalid');
      });
      formEl.querySelectorAll('.field-feedback-error').forEach(function (el) {
        el.remove();
      });
      const oldSummary = formEl.querySelector('.validation-summary-card');
      if (oldSummary) oldSummary.remove();

      if (errors.length === 0) return;

      // Render summary card at top of form
      const summary = document.createElement('div');
      summary.className = 'validation-summary-card';
      summary.setAttribute('role', 'alert');
      summary.setAttribute('tabindex', '-1');

      let listHtml = '<ul class="validation-summary-list">';
      errors.forEach(function (err, idx) {
        listHtml +=
          '<li><a class="validation-summary-link" data-field="' +
          err.field +
          '">' +
          (err.label || err.field) +
          ': ' +
          (err.message || 'Check value') +
          '</a></li>';
      });
      listHtml += '</ul>';

      summary.innerHTML =
        '<div class="validation-summary-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Please correct the highlighted fields:</div>' +
        listHtml;
      formEl.insertBefore(summary, formEl.firstChild);
      summary.focus();

      // Link summary items to fields
      summary.querySelectorAll('.validation-summary-link').forEach(function (link) {
        link.addEventListener('click', function () {
          const fieldName = this.getAttribute('data-field');
          const targetInput =
            formEl.querySelector('[name="' + fieldName + '"]') ||
            formEl.querySelector('#' + fieldName);
          if (targetInput) {
            targetInput.focus();
            targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      });

      // Mark fields
      let firstField = null;
      errors.forEach(function (err) {
        const input =
          formEl.querySelector('[name="' + err.field + '"]') ||
          formEl.querySelector('#' + err.field);
        if (input) {
          input.classList.add('is-invalid');
          input.setAttribute('aria-invalid', 'true');
          if (!firstField) firstField = input;

          const errEl = document.createElement('div');
          errEl.className = 'field-feedback-error';
          errEl.id = 'err-' + err.field;
          errEl.innerHTML =
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>' +
            (err.message || 'Invalid value') +
            '</span>';
          input.setAttribute('aria-describedby', errEl.id);

          if (input.nextSibling) {
            input.parentNode.insertBefore(errEl, input.nextSibling);
          } else {
            input.parentNode.appendChild(errEl);
          }
        }
      });

      if (firstField) {
        firstField.focus();
      }
    },
  };

  // 4. Double-submit prevention on standard POST forms
  document.querySelectorAll('form[method="POST"]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (form.hasAttribute('data-no-prevent-double-submit')) return;
      if (typeof form.checkValidity === 'function' && !form.checkValidity()) return;

      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.classList.add('is-loading');
        submitBtn.setAttribute('data-orig-text', submitBtn.innerHTML);
        submitBtn.innerHTML =
          '<span class="btn-spinner"></span> ' +
          (submitBtn.getAttribute('data-loading-text') || 'Processing…');
        // Allow native submit to complete while preventing subsequent duplicate clicks
        setTimeout(function () {
          submitBtn.disabled = true;
        }, 10);
      }
    });
  });

  // 5. Offline & Network state listener
  const offlineBanner = document.getElementById('portalOfflineBanner');
  function updateOnlineStatus() {
    if (!navigator.onLine) {
      if (offlineBanner) offlineBanner.style.display = 'flex';
    } else {
      if (offlineBanner && offlineBanner.style.display === 'flex') {
        offlineBanner.style.display = 'none';
        window.UserFacingState.showToast({
          type: 'success',
          title: 'Back Online',
          message: 'Your internet connection has been restored.',
        });
      }
    }
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // 6. Automatic URL Error Query Display
  try {
    const url = new URL(window.location.href);
    const errorParam = url.searchParams.get('error');
    if (errorParam) {
      window.UserFacingState.showToast({
        type: 'error',
        title: "We couldn't complete that action",
        message: errorParam,
      });
    }
  } catch (err) {}

  // 7. Global Top Navigation Progress Bar (P13 Perceived Performance)
  let navProgressTimer = null;
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a');
    if (!link || !link.href) return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;
    if (link.origin !== window.location.origin) return;
    if (link.pathname === window.location.pathname && link.search === window.location.search)
      return;

    const bar = document.getElementById('nav-progress-bar');
    if (!bar) return;

    if (navProgressTimer) clearTimeout(navProgressTimer);

    navProgressTimer = setTimeout(function () {
      bar.style.opacity = '1';
      bar.style.width = '35%';
      setTimeout(function () {
        bar.style.width = '70%';
      }, 250);
      setTimeout(function () {
        bar.style.width = '90%';
      }, 800);
    }, 80);
  });

  window.addEventListener('pageshow', function () {
    const bar = document.getElementById('nav-progress-bar');
    if (bar) {
      bar.style.width = '100%';
      setTimeout(function () {
        bar.style.opacity = '0';
        setTimeout(function () {
          bar.style.width = '0%';
        }, 200);
      }, 150);
    }
  });
})();
