/**
 * events.js
 * ------------------------------------------------------------------
 * Shared helpers for the event pages (list, detail, form, my registrations):
 * image handling, date ranges, status badges, event cards,
 * register / cancel registration, delete (admin).
 * ------------------------------------------------------------------
 */
const EventsService = (function () {
  const esc = UI.escapeHtml;
  let myRegistrations = null; // cached list for the logged-in user

  const ICON = {
    calendar: '<svg class="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    pin: '<svg class="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    bigCalendar: '<svg class="h-12 w-12 text-indigo-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  };

  /* ---------- Images ---------- */
  // The backend stores the image as metadata.image_url (full URL)
  function imageUrl(event) {
    return event && event.metadata && event.metadata.image_url ? mediaUrl(event.metadata.image_url) : '';
  }

  // Image with a placeholder behind it (shown if there's no image or it fails to load)
  function mediaBox(event, heightClass) {
    const url = imageUrl(event);
    return `
      <div class="relative ${heightClass} bg-gradient-to-br from-indigo-100 to-sky-100 flex items-center justify-center overflow-hidden">
        ${ICON.bigCalendar}
        ${url ? `<img src="${esc(url)}" alt="${esc('Photo for ' + event.title)}" loading="lazy"
                      class="absolute inset-0 h-full w-full object-cover" onerror="this.remove()">` : ''}
      </div>`;
  }

  /* ---------- Dates & status ---------- */
  function formatRange(start, end) {
    if (!start) return 'Date to be announced';
    const s = new Date(start);
    const e = end ? new Date(end) : null;
    const dateOpts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    const timeOpts = { hour: '2-digit', minute: '2-digit' };
    const startDate = s.toLocaleDateString(undefined, dateOpts);
    const startTime = s.toLocaleTimeString(undefined, timeOpts);
    if (!e) return startDate + ', ' + startTime;
    if (s.toDateString() === e.toDateString()) {
      return startDate + ', ' + startTime + ' – ' + e.toLocaleTimeString(undefined, timeOpts);
    }
    return UI.formatDate(start) + ' – ' + UI.formatDate(end);
  }

  function status(event) {
    const now = new Date();
    const start = event.starts_at ? new Date(event.starts_at) : null;
    const end = event.ends_at ? new Date(event.ends_at) : start;
    if (end && end < now) return 'past';
    if (start && start <= now) return 'ongoing';
    return 'upcoming';
  }

  function statusBadge(st) {
    const styles = {
      upcoming: 'bg-emerald-100 text-emerald-800',
      ongoing: 'bg-amber-100 text-amber-900',
      past: 'bg-slate-200 text-slate-700',
    };
    const labels = { upcoming: 'Upcoming', ongoing: 'Happening now', past: 'Past event' };
    return `<span class="inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${styles[st]}">${labels[st]}</span>`;
  }

  // ROLE GUARD (UI): normal users only ever see published events.
  // Admins see everything (unpublished ones get a "Draft" badge).
  function isVisible(event) {
    return Auth.isAdmin() || event.published !== false;
  }

  /* ---------- Registrations (normal users) ---------- */
  function loadMyRegistrations(force) {
    // ROLE GUARD (UI): admins manage events, they don't register for them
    if (Auth.isAdmin()) return Promise.resolve([]);
    if (myRegistrations && !force) return Promise.resolve(myRegistrations);
    return Api.get('/event-registrations/my-registrations').then(function (res) {
      myRegistrations = Api.toList(res).filter(function (r) {
        return (r.status || 'registered') !== 'cancelled';
      });
      return myRegistrations;
    });
  }

  function isRegistered(eventId) {
    return !!myRegistrations && myRegistrations.some(function (r) { return r.event_id === eventId; });
  }

  function register(eventId) {
    return Api.post('/event-registrations/register', { event_id: eventId })
      .then(function (res) {
        myRegistrations = (myRegistrations || []).concat([res.data || { event_id: eventId }]);
        return res;
      })
      .catch(function (err) {
        // 409 = already registered -> keep the UI in sync anyway
        if (err.status === 409) myRegistrations = (myRegistrations || []).concat([{ event_id: eventId }]);
        throw err;
      });
  }

  function cancel(eventId) {
    return Api.post('/event-registrations/cancel', { event_id: eventId }).then(function (res) {
      myRegistrations = (myRegistrations || []).filter(function (r) { return r.event_id !== eventId; });
      return res;
    });
  }

  /* ---------- Delete (admin) ---------- */
  function deleteEvent(event) {
    return UI.confirmDialog({
      title: 'Delete this event?',
      message: '"' + event.title + '" will be removed permanently. This cannot be undone.',
      confirmText: 'Delete event',
    }).then(function (ok) {
      if (!ok) return false;
      return Api.del('/events/' + encodeURIComponent(event.id))
        .then(function () {
          Api.invalidate('/events');
          UI.toast('Event deleted.');
          return true;
        })
        .catch(function (err) {
          // The DB blocks deleting events that still have registrations (no cascade)
          const message = err.status >= 500
            ? "Couldn't delete this event. Events that already have registrations can't be deleted."
            : err.message;
          UI.toast(message, 'error');
          return false;
        });
    });
  }

  /* ---------- Event card (used on the events list) ---------- */
  function cardHtml(event) {
    const admin = Auth.isAdmin();
    const st = status(event);
    const id = esc(event.id);
    const title = esc(event.title);
    const detailUrl = 'event.html?id=' + encodeURIComponent(event.id);

    let actions = `<a href="${detailUrl}" class="btn btn-secondary btn-sm" aria-label="View details for ${title}">View</a>`;

    if (!admin) {
      // Normal user: Register button, or "Registered" if already signed up
      if (isRegistered(event.id)) {
        actions += '<span class="inline-flex items-center gap-1 text-sm font-semibold text-green-700"><span aria-hidden="true">✓</span> Registered</span>';
      } else if (st !== 'past') {
        actions += `<button type="button" data-register="${id}" class="btn btn-primary btn-sm" aria-label="Register for ${title}">Register</button>`;
      }
    } else {
      // ROLE GUARD (UI): Edit/Delete only rendered for admins
      actions += `<a href="event-form.html?id=${encodeURIComponent(event.id)}" class="btn btn-secondary btn-sm" aria-label="Edit ${title}">Edit</a>
                  <button type="button" data-delete="${id}" class="btn btn-danger btn-sm" aria-label="Delete ${title}">Delete</button>`;
    }

    return `
      <article class="card overflow-hidden flex flex-col hover:shadow-md transition-shadow">
        ${mediaBox(event, 'h-44')}
        <div class="p-5 flex-1 flex flex-col">
          <div class="flex flex-wrap gap-2 mb-2">
            ${statusBadge(st)}
            ${admin && event.published === false ? '<span class="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-white">Draft</span>' : ''}
          </div>
          <h2 class="text-lg font-semibold text-slate-900">
            <a href="${detailUrl}" class="hover:text-indigo-700 focus:outline-none focus-visible:underline">${title}</a>
          </h2>
          <dl class="mt-2 space-y-1 text-sm text-slate-600">
            <div class="flex gap-2"><dt class="sr-only">Date and time</dt>${ICON.calendar}<dd>${esc(formatRange(event.starts_at, event.ends_at))}</dd></div>
            <div class="flex gap-2"><dt class="sr-only">Location</dt>${ICON.pin}<dd>${esc(event.location || 'Location to be announced')}</dd></div>
          </dl>
          <p class="mt-3 text-sm text-slate-600 line-clamp-2">${esc(event.description || 'No description provided.')}</p>
          <div class="mt-auto pt-4 flex flex-wrap items-center gap-2">${actions}</div>
        </div>
      </article>`;
  }

  return {
    ICON: ICON,
    imageUrl: imageUrl,
    mediaBox: mediaBox,
    formatRange: formatRange,
    status: status,
    statusBadge: statusBadge,
    isVisible: isVisible,
    loadMyRegistrations: loadMyRegistrations,
    isRegistered: isRegistered,
    register: register,
    cancel: cancel,
    deleteEvent: deleteEvent,
    cardHtml: cardHtml,
  };
})();