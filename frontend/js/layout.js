/**
 * layout.js
 * ------------------------------------------------------------------
 * Shared page layout injected on every logged-in page:
 *  - Header: logo, global search, main links, notification bell with
 *    unread count, profile dropdown, mobile menu
 *  - Notification drawer (GET /api/notifications)
 *  - Footer with contact/help information
 *  - Admin sidebar for dashboard/admin pages
 *
 * Each page needs these placeholders:
 *   <div id="app-header"></div> ... <div id="app-footer"></div>
 * and calls (after the auth guard):
 *   if (!Auth.requireAuth()) return;
 *   Layout.init({ active: 'events' });
 * ------------------------------------------------------------------
 */
const Layout = (function () {
  const esc = UI.escapeHtml;
  let notifications = [];
  let loaded = false;
  let loadError = null;
  let drawerOpen = false;
  let pollTimer = null;

  const MAIN_LINKS = [
    { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html' },
    { key: 'events', label: 'Events', href: 'events.html' },
    { key: 'announcements', label: 'Announcements', href: 'announcements.html' },
    { key: 'promos', label: 'Promos', href: 'promos.html' },
    { key: 'services', label: 'Services', href: 'services.html' },
    // ROLE GUARD (UI): the "Admin" link is only rendered for admins
    { key: 'admin', label: 'Admin', href: 'admin-users.html', adminOnly: true },
  ];

  const MENU_ITEM = 'block w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-600';

  const LOGO = `<svg class="h-8 w-8 text-indigo-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M9 15l2 2 4-4" /></svg>`;

  const ICON = {
    bell: '<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    search: '<svg class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    menu: '<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    close: '<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    trash: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    chevron: '<svg class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  };

  /* ================================================================
   * Read / unread tracking
   * The notifications table has a "read" column. Read state is also
   * remembered per user in localStorage so the unread count updates
   * instantly when a notification is opened (optimistic UI).
   * ================================================================ */
  function readKey() {
    const user = Auth.getUser();
    return 'civic_read_' + (user ? user.id : 'guest');
  }
  function readIds() {
    try { return JSON.parse(localStorage.getItem(readKey())) || []; }
    catch (e) { return []; }
  }
  function isRead(n) {
    return n.read === true || readIds().indexOf(n.id) !== -1;
  }
  function markRead(id) {
    const ids = readIds();
    if (ids.indexOf(id) === -1) {
      ids.push(id);
      localStorage.setItem(readKey(), JSON.stringify(ids));
    }
    updateBell();
  }
  function markAllRead() {
    const ids = readIds();
    notifications.forEach(function (n) { if (ids.indexOf(n.id) === -1) ids.push(n.id); });
    localStorage.setItem(readKey(), JSON.stringify(ids));
    updateBell();
    renderNotifications();
  }

  /* ================================================================
   * HTML builders
   * ================================================================ */
  function navLinks(active, mobile) {
    const admin = Auth.isAdmin();
    return MAIN_LINKS
      .filter(function (link) { return !link.adminOnly || admin; })
      .map(function (link) {
        const current = link.key === active;
        const size = mobile ? 'block px-3 py-2 text-base' : 'px-3 py-2 text-sm';
        const state = current
          ? 'bg-indigo-50 text-indigo-800 font-semibold'
          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium';
        return `<li><a href="${link.href}" class="${size} ${state} rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  ${current ? 'aria-current="page"' : ''}>${link.label}</a></li>`;
      }).join('');
  }

  function searchForm(id) {
    return `
      <form class="global-search relative" role="search" action="events.html" method="get">
        <label for="${id}" class="sr-only">Search events</label>
        ${ICON.search}
        <input id="${id}" name="q" type="search" placeholder="Search events…" class="input py-2 pl-9 text-sm" />
      </form>`;
  }

  function headerHtml(active, user) {
    const admin = Auth.isAdmin();
    const initials = (user.full_name || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();

    return `
    <header class="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-40">
      <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main">
        <div class="flex h-16 items-center gap-3">
          <a href="dashboard.html" class="flex items-center gap-2 shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
            ${LOGO}
            <span class="text-xl font-bold text-slate-900">Civic<span class="text-indigo-700">Events</span></span>
          </a>

          <ul class="hidden lg:flex items-center gap-1 ml-4">${navLinks(active, false)}</ul>

          <div class="hidden lg:block flex-1 max-w-xs ml-auto">${searchForm('global-search')}</div>

          <div class="flex items-center gap-1 ml-auto lg:ml-2">
            <!-- Notification bell + unread count -->
            <button id="bell-btn" type="button" aria-label="Notifications" aria-haspopup="dialog" aria-expanded="false" aria-controls="notif-drawer"
                    class="relative p-2 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
              ${ICON.bell}
              <span id="bell-count" class="hidden absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold items-center justify-center" aria-hidden="true"></span>
            </button>

            <!-- Profile dropdown -->
            <div class="relative">
              <button id="profile-btn" type="button" aria-expanded="false" aria-controls="profile-menu"
                      class="flex items-center gap-2 p-1 sm:pr-2 rounded-full hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
                <span class="h-8 w-8 rounded-full bg-indigo-700 text-white text-sm font-bold flex items-center justify-center" aria-hidden="true">${esc(initials)}</span>
                <span class="hidden sm:block text-sm font-medium text-slate-700 max-w-[8rem] truncate">${esc(user.full_name)}</span>
                <span class="sr-only">Open profile menu</span>
                ${ICON.chevron}
              </button>
              <div id="profile-menu" class="hidden absolute right-0 mt-2 w-64 card p-2 shadow-lg z-50">
                <div class="px-3 py-2 mb-1 border-b border-slate-100">
                  <p class="text-sm font-semibold text-slate-900 truncate">${esc(user.full_name)}</p>
                  <p class="text-xs text-slate-600 truncate">${esc(user.email)}</p>
                  <span class="mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${admin ? 'bg-amber-100 text-amber-900' : 'bg-indigo-100 text-indigo-800'}">${esc(user.role)}</span>
                </div>
                <a href="profile.html" class="${MENU_ITEM}">My profile</a>
                <a href="my-registrations.html" class="${MENU_ITEM}" data-user-only>My registrations</a>
                <a href="notifications.html" class="${MENU_ITEM}">All notifications</a>
                <button type="button" id="logout-btn" class="${MENU_ITEM} !text-red-700">Log out</button>
              </div>
            </div>

            <!-- Mobile menu button -->
            <button id="mobile-menu-btn" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open main menu"
                    class="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
              ${ICON.menu}
            </button>
          </div>
        </div>

        <div id="mobile-menu" class="hidden lg:hidden pb-4 space-y-3">
          ${searchForm('global-search-mobile')}
          <ul class="space-y-1">${navLinks(active, true)}</ul>
        </div>
      </nav>
    </header>`;
  }

  function drawerHtml() {
    return `
    <div id="notif-overlay" class="hidden fixed inset-0 bg-black/40 z-50"></div>
    <aside id="notif-drawer" role="dialog" aria-modal="true" aria-labelledby="notif-title" aria-hidden="true"
           class="invisible fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-xl z-50 flex flex-col translate-x-full transition-transform duration-300">
      <div class="flex items-center justify-between gap-2 p-4 border-b border-slate-200">
        <h2 id="notif-title" class="text-lg font-semibold">Notifications</h2>
        <div class="flex items-center gap-1">
          <button id="mark-all-read" type="button" class="text-sm font-medium text-indigo-700 hover:text-indigo-900 px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">Mark all read</button>
          <button id="notif-close" type="button" aria-label="Close notifications"
                  class="p-2 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">${ICON.close}</button>
        </div>
      </div>
      <div id="notif-list" class="flex-1 overflow-y-auto p-2"></div>
      <div class="p-3 border-t border-slate-200">
        <a href="notifications.html" class="btn btn-secondary w-full">View all notifications</a>
      </div>
    </aside>`;
  }

  function notificationItemHtml(n) {
    const unread = !isRead(n);
    // ROLE GUARD (UI): only admins get a delete button.
    // The backend also rejects DELETE /api/notifications/:id from non-admins (403).
    const deleteBtn = Auth.isAdmin()
      ? `<button type="button" data-delete-notif="${esc(n.id)}" aria-label="Delete notification: ${esc(n.title)}"
                 class="self-start p-2 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600">${ICON.trash}</button>`
      : '';

    return `
      <li>
        <div class="flex gap-2 p-3 rounded-lg ${unread ? 'bg-indigo-50' : 'hover:bg-slate-50'}">
          <span class="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${unread ? 'bg-indigo-600' : 'bg-transparent'}" aria-hidden="true"></span>
          <a href="notification.html?id=${encodeURIComponent(n.id)}" data-notif-link="${esc(n.id)}"
             class="flex-1 min-w-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
            <p class="text-sm font-semibold text-slate-900">${esc(n.title)}${unread ? ' <span class="sr-only">(unread)</span>' : ''}</p>
            <p class="text-sm text-slate-600 line-clamp-2">${esc(n.message)}</p>
            <p class="mt-1 text-xs text-slate-500"><span class="capitalize">${esc(n.type)}</span> · <time datetime="${esc(n.created_at)}">${UI.timeAgo(n.created_at)}</time></p>
          </a>
          ${deleteBtn}
        </div>
      </li>`;
  }

  function footerHtml() {
    const year = new Date().getFullYear();
    return `
    <footer class="bg-slate-900 text-slate-300 mt-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div class="lg:col-span-2">
          <p class="text-lg font-bold text-white">Civic<span class="text-indigo-300">Events</span></p>
          <p class="mt-2 text-sm max-w-md">Your city's events, audio announcements and service updates, all in one accessible place.</p>
        </div>
        <nav aria-label="Footer">
          <h2 class="text-sm font-semibold text-white uppercase tracking-wider">Explore</h2>
          <ul class="mt-3 space-y-2 text-sm">
            <li><a href="events.html" class="hover:text-white underline-offset-2 hover:underline">Events</a></li>
            <li><a href="announcements.html" class="hover:text-white underline-offset-2 hover:underline">Announcements</a></li>
            <li><a href="promos.html" class="hover:text-white underline-offset-2 hover:underline">Promos</a></li>
            <li><a href="profile.html" class="hover:text-white underline-offset-2 hover:underline">My profile</a></li>
          </ul>
        </nav>
        <div>
          <h2 class="text-sm font-semibold text-white uppercase tracking-wider">Help &amp; contact</h2>
          <ul class="mt-3 space-y-2 text-sm">
            <li>Email: <a href="mailto:support@civicevents.example" class="hover:text-white underline underline-offset-2">support@civicevents.example</a></li>
            <li>Phone: <a href="tel:+250788000000" class="hover:text-white underline underline-offset-2">+250 788 000 000</a></li>
            <li>Mon–Fri, 8:00–17:00 (CAT)</li>
          </ul>
        </div>
      </div>
      <div class="border-t border-slate-800">
        <p class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-xs text-slate-400">© ${year} CivicEvents. Built with accessibility in mind.</p>
      </div>
    </footer>`;
  }

  // Admin sidebar (left on desktop, scrollable row on mobile)
  function adminSidebar(active) {
    const links = [
      { key: 'dashboard', label: 'Overview', href: 'dashboard.html' },
      { key: 'users', label: 'Users', href: 'admin-users.html' },
      { key: 'notifications', label: 'Notifications', href: 'notifications.html' },
      { key: 'services', label: 'Service requests', href: 'services.html' },
      { key: 'event-form', label: '+ New event', href: 'event-form.html' },
      { key: 'announcement-form', label: '+ New announcement', href: 'announcement-form.html' },
      { key: 'promo-form', label: '+ New promo', href: 'promo-form.html' },
    ];
    const items = links.map(function (link) {
      const current = link.key === active;
      return `<li><a href="${link.href}" ${current ? 'aria-current="page"' : ''}
          class="block whitespace-nowrap px-3 py-2 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600
                 ${current ? 'bg-indigo-700 text-white font-semibold' : 'text-slate-700 hover:bg-slate-100 font-medium'}">${link.label}</a></li>`;
    }).join('');
    return `
      <nav aria-label="Admin" class="lg:w-56 shrink-0 mb-6 lg:mb-0">
        <p class="hidden lg:block px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Admin panel</p>
        <ul class="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">${items}</ul>
      </nav>`;
  }

  /* ================================================================
   * Notifications: load, render, bell count, delete (admin)
   * ================================================================ */
  function loadNotifications() {
    return Api.get('/notifications')
      .then(function (res) {
        notifications = Api.toList(res).sort(function (a, b) {
          return new Date(b.created_at) - new Date(a.created_at);
        });
        loadError = null;
        loaded = true;
        updateBell();
        renderNotifications();
        return notifications;
      })
      .catch(function (err) {
        loadError = err.message;
        loaded = true;
        renderNotifications();
        return [];
      });
  }

  function updateBell() {
    const unread = notifications.filter(function (n) { return !isRead(n); }).length;
    const $count = $('#bell-count');
    $count.text(unread > 9 ? '9+' : unread).toggleClass('hidden', unread === 0).toggleClass('flex', unread > 0);
    $('#bell-btn').attr('aria-label', unread ? 'Notifications, ' + unread + ' unread' : 'Notifications');
  }

  function renderNotifications() {
    const $list = $('#notif-list');
    if (!$list.length) return;
    if (!loaded) { UI.showSkeleton($list, 4, 'row'); return; }
    if (loadError) { UI.showError($list, loadError, loadNotifications); return; }
    if (!notifications.length) { UI.showEmpty($list, "You're all caught up. No notifications yet."); return; }
    $list.attr('aria-busy', 'false').html('<ul class="space-y-1">' + notifications.map(notificationItemHtml).join('') + '</ul>');
  }

  function deleteNotification(id) {
    return UI.confirmDialog({
      title: 'Delete this notification?',
      message: 'It will be removed for everyone. This cannot be undone.',
      confirmText: 'Delete',
    }).then(function (ok) {
      if (!ok) return false;
      const backup = notifications.slice();
      // Optimistic UI: remove it right away, put it back if the API call fails
      notifications = notifications.filter(function (n) { return n.id !== id; });
      updateBell();
      renderNotifications();
      return Api.del('/notifications/' + encodeURIComponent(id))
        .then(function () {
          UI.toast('Notification deleted.');
          $(document).trigger('notifications:changed');
          return true;
        })
        .catch(function (err) {
          notifications = backup;
          updateBell();
          renderNotifications();
          UI.toast(err.message, 'error');
          return false;
        });
    });
  }

  /* ================================================================
   * Drawer open/close + keyboard handling
   * ================================================================ */
  function openDrawer() {
    drawerOpen = true;
    $('#notif-overlay').removeClass('hidden');
    $('#notif-drawer').removeClass('invisible translate-x-full').attr('aria-hidden', 'false');
    $('#bell-btn').attr('aria-expanded', 'true');
    $('#notif-close').trigger('focus');
    renderNotifications();
    loadNotifications();
  }

  function closeDrawer() {
    drawerOpen = false;
    $('#notif-overlay').addClass('hidden');
    $('#notif-drawer').addClass('translate-x-full').attr('aria-hidden', 'true');
    setTimeout(function () { if (!drawerOpen) $('#notif-drawer').addClass('invisible'); }, 300);
    $('#bell-btn').attr('aria-expanded', 'false').trigger('focus');
  }

  function toggleProfileMenu(open) {
    const $btn = $('#profile-btn');
    const isOpen = open !== undefined ? open : $btn.attr('aria-expanded') !== 'true';
    $btn.attr('aria-expanded', String(isOpen));
    $('#profile-menu').toggleClass('hidden', !isOpen);
    if (isOpen) $('#profile-menu a, #profile-menu button').first().trigger('focus');
  }

  function bindEvents() {
    $('#bell-btn').on('click', function () { drawerOpen ? closeDrawer() : openDrawer(); });
    $('#notif-close, #notif-overlay').on('click', closeDrawer);
    $('#mark-all-read').on('click', markAllRead);

    $('#notif-list').on('click', '[data-notif-link]', function () {
      markRead($(this).data('notif-link'));
    });
    $('#notif-list').on('click', '[data-delete-notif]', function () {
      deleteNotification($(this).data('delete-notif'));
    });

    $('#profile-btn').on('click', function (e) { e.stopPropagation(); toggleProfileMenu(); });
    $(document).on('click', function (e) {
      if (!$(e.target).closest('#profile-menu').length) toggleProfileMenu(false);
    });

    $('#logout-btn').on('click', function () { Auth.logout('You have been logged out.'); });

    $('#mobile-menu-btn').on('click', function () {
      const open = $(this).attr('aria-expanded') !== 'true';
      $(this).attr({ 'aria-expanded': String(open), 'aria-label': open ? 'Close main menu' : 'Open main menu' });
      $('#mobile-menu').toggleClass('hidden', !open);
    });

    // Keyboard: Esc closes menus/drawer, Tab stays inside the open drawer
    $(document).on('keydown', function (e) {
      if ($('[aria-labelledby="confirm-title"]').length) return; // a confirm dialog handles its own keys

      if (e.key === 'Escape') {
        if (drawerOpen) closeDrawer();
        if ($('#profile-btn').attr('aria-expanded') === 'true') {
          toggleProfileMenu(false);
          $('#profile-btn').trigger('focus');
        }
      }

      if (e.key === 'Tab' && drawerOpen) {
        const $focusable = $('#notif-drawer').find('a[href], button:not([disabled])').filter(':visible');
        const first = $focusable[0];
        const last = $focusable[$focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ================================================================
   * Public: init
   * ================================================================ */
  function init(options) {
    options = options || {};
    const user = Auth.getUser() || {};

    $('#app-header').replaceWith(headerHtml(options.active, user));
    $('#app-footer').replaceWith(footerHtml());
    $('body').append(drawerHtml());

    // ROLE GUARD (UI): the admin sidebar is only built for admins
    if (options.adminSidebar && Auth.isAdmin()) {
      $('#admin-sidebar').html(adminSidebar(options.adminSidebar));
    }

    // ROLE GUARD (UI): remove data-admin-only / data-user-only elements for the wrong role
    Auth.applyRoleUI();

    // Keep the search term visible after searching
    const q = new URLSearchParams(window.location.search).get('q');
    if (q && options.active === 'events') $('.global-search input').val(q);

    bindEvents();
    loadNotifications();
    clearInterval(pollTimer);
    pollTimer = setInterval(loadNotifications, 60000); // refresh the bell every minute
  }

  return {
    init: init,
    adminSidebar: adminSidebar,
    loadNotifications: loadNotifications,
    getNotifications: function () { return notifications; },
    isRead: isRead,
    markRead: markRead,
    deleteNotification: deleteNotification,
  };
})();