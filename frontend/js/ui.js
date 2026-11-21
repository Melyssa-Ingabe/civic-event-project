/**
 * ui.js
 * ------------------------------------------------------------------
 * Reusable UI helpers used on every page:
 * toasts, flash messages, loading buttons, skeleton loaders,
 * empty/error states (with retry), confirm dialog, form field errors,
 * date/duration formatting and file validation.
 * ------------------------------------------------------------------
 */
const UI = (function () {
  const FLASH_KEY = 'civic_flash';

  /* ---------- Security: escape any text from the API before inserting as HTML ---------- */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- Toasts ---------- */
  function toast(message, type, duration) {
    type = type || 'success';
    duration = duration || 4000;

    let $container = $('#toast-container');
    if (!$container.length) {
      $container = $('<div id="toast-container" class="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm" aria-live="polite"></div>').appendTo('body');
    }

    const styles = {
      success: 'bg-green-700',
      error: 'bg-red-700',
      info: 'bg-slate-800',
      warning: 'bg-amber-700',
    };
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '!' };

    const $toast = $(`
      <div role="${type === 'error' ? 'alert' : 'status'}"
           class="${styles[type] || styles.info} text-white rounded-lg shadow-lg px-4 py-3 flex items-start gap-3 transition duration-300 opacity-0 -translate-y-2">
        <span aria-hidden="true" class="font-bold">${icons[type] || icons.info}</span>
        <p class="flex-1 text-sm">${escapeHtml(message)}</p>
        <button type="button" class="text-white/80 hover:text-white leading-none text-lg" aria-label="Dismiss message">&times;</button>
      </div>`);

    $container.append($toast);
    requestAnimationFrame(function () { $toast.removeClass('opacity-0 -translate-y-2'); });

    function remove() {
      $toast.addClass('opacity-0');
      setTimeout(function () { $toast.remove(); }, 300);
    }
    $toast.find('button').on('click', remove);
    setTimeout(remove, duration);
  }

  /* ---------- Flash: a toast that survives a page redirect ---------- */
  function setFlash(message, type) {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message: message, type: type || 'success' }));
  }

  function showFlash() {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return;
    sessionStorage.removeItem(FLASH_KEY);
    try {
      const flash = JSON.parse(raw);
      toast(flash.message, flash.type);
    } catch (e) { /* ignore broken flash */ }
  }

  /* ---------- Button loading state ---------- */
  function setLoading(btn, isLoading, loadingText) {
    const $btn = $(btn);
    if (isLoading) {
      $btn.data('original-html', $btn.html());
      $btn.prop('disabled', true).attr('aria-busy', 'true').html(
        `<span class="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin align-[-2px]" aria-hidden="true"></span>
         <span class="ml-2">${escapeHtml(loadingText || 'Loading...')}</span>`
      );
    } else {
      $btn.prop('disabled', false).removeAttr('aria-busy').html($btn.data('original-html'));
    }
  }

  /* ---------- Skeleton loaders for lists ---------- */
  function showSkeleton(container, count, variant) {
    count = count || 6;
    let html = '';
    for (let i = 0; i < count; i++) {
      if (variant === 'row') {
        html += `<div class="bg-white rounded-xl p-4 shadow-sm animate-pulse flex gap-4" aria-hidden="true">
            <div class="h-12 w-12 bg-slate-200 rounded-full"></div>
            <div class="flex-1 space-y-2"><div class="h-4 bg-slate-200 rounded w-1/2"></div><div class="h-3 bg-slate-200 rounded w-3/4"></div></div>
          </div>`;
      } else {
        html += `<div class="bg-white rounded-xl shadow-sm overflow-hidden animate-pulse" aria-hidden="true">
            <div class="h-40 bg-slate-200"></div>
            <div class="p-4 space-y-3">
              <div class="h-4 bg-slate-200 rounded w-3/4"></div>
              <div class="h-3 bg-slate-200 rounded w-1/2"></div>
              <div class="h-3 bg-slate-200 rounded w-full"></div>
            </div>
          </div>`;
      }
    }
    $(container).attr('aria-busy', 'true').html(html);
  }

  /* ---------- Empty and error states ---------- */
  function showEmpty(container, message, actionHtml) {
    $(container).attr('aria-busy', 'false').html(`
      <div class="col-span-full text-center py-16 px-4 bg-white rounded-xl border border-dashed border-slate-300">
        <p class="text-slate-600">${escapeHtml(message)}</p>
        ${actionHtml || ''}
      </div>`);
  }

  // Error box with a "Try again" button (network fallback + retry)
  function showError(container, message, onRetry) {
    const $box = $(`
      <div role="alert" class="col-span-full text-center py-12 px-4 bg-red-50 border border-red-200 rounded-xl">
        <p class="text-red-800 font-medium mb-4">${escapeHtml(message)}</p>
        ${onRetry ? '<button type="button" class="retry-btn px-4 py-2 rounded-lg bg-red-700 text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">Try again</button>' : ''}
      </div>`);
    $(container).attr('aria-busy', 'false').html($box);
    if (onRetry) $box.find('.retry-btn').on('click', onRetry);
  }

  /* ---------- Accessible confirm dialog (returns a Promise<boolean>) ---------- */
  function confirmDialog(options) {
    options = options || {};
    const title = options.title || 'Are you sure?';
    const message = options.message || '';
    const confirmText = options.confirmText || 'Confirm';
    const danger = options.danger !== false;
    const lastFocused = document.activeElement;

    const confirmClasses = danger
      ? 'bg-red-700 hover:bg-red-800 focus:ring-red-500'
      : 'bg-indigo-700 hover:bg-indigo-800 focus:ring-indigo-500';

    const $modal = $(`
      <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"
             class="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <h2 id="confirm-title" class="text-lg font-semibold text-slate-900">${escapeHtml(title)}</h2>
          <p id="confirm-message" class="mt-2 text-slate-600">${escapeHtml(message)}</p>
          <div class="mt-6 flex justify-end gap-3">
            <button type="button" data-action="cancel" class="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">Cancel</button>
            <button type="button" data-action="confirm" class="px-4 py-2 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${confirmClasses}">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </div>`).appendTo('body');

    return new Promise(function (resolve) {
      function close(result) {
        $(document).off('keydown.confirmDialog');
        $modal.remove();
        if (lastFocused) lastFocused.focus();
        resolve(result);
      }

      $modal.on('click', '[data-action="cancel"]', function () { close(false); });
      $modal.on('click', '[data-action="confirm"]', function () { close(true); });
      $modal.on('click', function (e) { if (e.target === $modal[0]) close(false); });

      // Keyboard: Esc closes, Tab stays inside the dialog
      $(document).on('keydown.confirmDialog', function (e) {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Tab') {
          const $buttons = $modal.find('button');
          const first = $buttons[0];
          const last = $buttons[$buttons.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });

      $modal.find('[data-action="cancel"]').trigger('focus');
    });
  }

  /* ---------- Form field errors (accessible) ---------- */
  function fieldError(input, message) {
    const $input = $(input);
    const errorId = $input.attr('id') + '-error';
    // If the input sits inside a wrapper (e.g. password + eye button), put the error after the wrapper
    const $anchor = $input.parent().hasClass('relative') ? $input.parent() : $input;

    $input.attr('aria-invalid', 'true').addClass('border-red-600');
    const described = ($input.attr('aria-describedby') || '').split(' ').filter(Boolean);
    if (described.indexOf(errorId) === -1) described.push(errorId);
    $input.attr('aria-describedby', described.join(' '));

    let $error = $('#' + errorId);
    if (!$error.length) {
      $error = $(`<p id="${errorId}" class="field-error mt-1 text-sm text-red-700"></p>`).insertAfter($anchor);
    }
    $error.text(message);
  }

  function clearErrors(form) {
    const $form = $(form);
    $form.find('.field-error').remove();
    $form.find('[aria-invalid="true"]').each(function () {
      const $input = $(this);
      const errorId = $input.attr('id') + '-error';
      const described = ($input.attr('aria-describedby') || '').split(' ').filter(function (id) { return id && id !== errorId; });
      $input.attr('aria-invalid', 'false').removeClass('border-red-600');
      if (described.length) $input.attr('aria-describedby', described.join(' '));
      else $input.removeAttr('aria-describedby');
    });
  }

  /* ---------- Formatting ---------- */
  function formatDate(iso, withTime) {
    if (!iso) return 'Date to be announced';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    if (withTime !== false) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    return d.toLocaleString(undefined, opts);
  }

  function formatDuration(seconds) {
    seconds = Math.round(Number(seconds) || 0);
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, '0');
    return m + ':' + s;
  }

  function timeAgo(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + ' d ago';
    return formatDate(iso, false);
  }

  /* ---------- File validation (size/type checked BEFORE upload) ---------- */
    function validateFile(file, kind) {
    const rules = CONFIG.UPLOAD_LIMITS[kind];
    if (!file) return 'Please choose a file.';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (rules.extensions.indexOf(ext) === -1) {
      return 'This file type is not supported. Allowed types: ' + rules.extensions.join(', ') + '.';
    }
    if (file.size > rules.maxMB * 1024 * 1024) {
      return 'This file is too large (' + (file.size / 1024 / 1024).toFixed(1) + ' MB). The maximum is ' + rules.maxMB + ' MB.';
    }
    return null;
  }

  // Show any flash message as soon as a page loads
  $(showFlash);

  return {
    escapeHtml: escapeHtml,
    toast: toast,
    setFlash: setFlash,
    setLoading: setLoading,
    showSkeleton: showSkeleton,
    showEmpty: showEmpty,
    showError: showError,
    confirmDialog: confirmDialog,
    fieldError: fieldError,
    clearErrors: clearErrors,
    formatDate: formatDate,
    formatDuration: formatDuration,
    timeAgo: timeAgo,
    validateFile: validateFile,
  };
})();