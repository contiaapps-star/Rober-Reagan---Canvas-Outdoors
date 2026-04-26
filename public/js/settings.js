(function () {
  'use strict';

  // Use template-fragment parsing so OOB swaps like `<tbody hx-swap-oob>` and
  // bare `<tr>` rows in pagination responses survive the browser's HTML parser.
  // Must be set before htmx processes any response.
  document.addEventListener('htmx:load', function () {
    if (window.htmx && window.htmx.config) {
      window.htmx.config.useTemplateFragments = true;
    }
  });
  if (window.htmx && window.htmx.config) {
    window.htmx.config.useTemplateFragments = true;
  }

  // htmx 1.x ignores 4xx responses by default — they get logged and the swap
  // is skipped. Our form handlers return 400 with the re-rendered form (with
  // inline error messages) and rely on HX-Retarget/HX-Reswap headers to land
  // the swap inside #modal-root. Tell htmx to swap 400/422 like a 200.
  document.addEventListener('htmx:beforeSwap', function (evt) {
    var status = evt.detail.xhr && evt.detail.xhr.status;
    if (status === 400 || status === 422) {
      evt.detail.shouldSwap = true;
      evt.detail.isError = false;
    }
  });

  // Confirm dialog for destructive actions: any element with [data-confirm]
  // prompts before htmx fires the request.
  document.addEventListener('htmx:confirm', function (evt) {
    var prompt = evt.detail.elt && evt.detail.elt.getAttribute('data-confirm');
    if (!prompt) return;
    evt.preventDefault();
    if (window.confirm(prompt)) {
      evt.detail.issueRequest(true);
    }
  });

  // Settings sub-nav toggle: clicking the Settings group header collapses /
  // expands its children.
  document.addEventListener('click', function (evt) {
    var target = evt.target;
    while (target && target !== document.body) {
      if (target.getAttribute && target.getAttribute('data-toggle') === 'settings') {
        var group = target.closest('[data-testid="sidebar-settings-group"]');
        if (group) {
          var open = group.getAttribute('data-open') === 'true';
          group.setAttribute('data-open', open ? 'false' : 'true');
          var sub = group.querySelector('[data-testid="sidebar-settings-sub"]');
          if (sub) sub.classList.toggle('fc-sidebar__sub--hidden', open);
          target.setAttribute('aria-expanded', open ? 'false' : 'true');
        }
        return;
      }
      target = target.parentElement;
    }
  });

  // Modal close: clicking the backdrop, the X button, or pressing Escape clears
  // the modal-root container.
  function closeModal() {
    var root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }

  document.addEventListener('click', function (evt) {
    var target = evt.target;
    if (target && target.getAttribute && target.getAttribute('data-modal-close') === 'true') {
      closeModal();
    }
  });

  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape') closeModal();
  });

  // Global page-loader: sets data-htmx-loading on <body> while ANY htmx request
  // is in flight, so a top progress bar can animate without per-trigger
  // hx-indicator wiring. Tracks a counter to handle overlapping requests.
  var inFlight = 0;
  function setLoading(on) {
    if (on) {
      inFlight += 1;
    } else {
      inFlight = Math.max(0, inFlight - 1);
    }
    if (inFlight > 0) {
      document.body.setAttribute('data-htmx-loading', 'true');
    } else {
      document.body.removeAttribute('data-htmx-loading');
    }
  }
  document.addEventListener('htmx:beforeRequest', function () {
    setLoading(true);
  });
  document.addEventListener('htmx:afterRequest', function () {
    setLoading(false);
  });
  document.addEventListener('htmx:sendError', function () {
    setLoading(false);
  });
  document.addEventListener('htmx:responseError', function () {
    setLoading(false);
  });
  document.addEventListener('htmx:timeout', function () {
    setLoading(false);
  });

  // After a successful POST/PUT, clear the modal so the new row stays visible.
  document.addEventListener('htmx:afterSwap', function (evt) {
    var trigger = evt.detail && evt.detail.requestConfig && evt.detail.requestConfig.elt;
    if (!trigger) return;
    var inModal = trigger.closest && trigger.closest('.fc-modal');
    if (!inModal) return;
    var status = evt.detail.xhr && evt.detail.xhr.status;
    if (status >= 200 && status < 300) closeModal();
  });
})();
