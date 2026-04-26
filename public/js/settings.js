(function () {
  'use strict';

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
