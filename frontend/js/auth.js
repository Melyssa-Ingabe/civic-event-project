/**
 * auth.js
 * ------------------------------------------------------------------
 * Global auth context. Holds the logged-in user { id, full_name, email, role }
 * and the JWT token.
 *
 * Storage rules:
 *  - "Remember me" NOT ticked -> sessionStorage (cleared when the tab/browser closes)
 *  - "Remember me" ticked     -> localStorage (persists after closing the browser)
 *    Security trade-off: anything in localStorage can be read by any script on
 *    the page, so an XSS bug could leak the token. That is why persistence is
 *    opt-in and all API text is escaped with UI.escapeHtml before display.
 *
 * ROLE-BASED ACCESS GUARDS are defined in this file (see section below):
 *  - Auth.requireAuth()        -> page needs any logged-in user
 *  - Auth.requireAdmin()       -> page is admin-only
 *  - Auth.redirectIfLoggedIn() -> login/signup pages
 *  - Auth.applyRoleUI()        -> removes admin-only / user-only controls
 *
 * IMPORTANT: these guards are for user experience only. Real security is
 * enforced by the backend, which checks the token and role on every request.
 * ------------------------------------------------------------------
 */
const Auth = (function () {
  const KEYS = CONFIG.STORAGE_KEYS;
  let expiryTimer = null;

  /* ---------- Storage ---------- */

  // The session lives in whichever storage currently holds the token
  function storage() {
    return localStorage.getItem(KEYS.TOKEN) ? localStorage : sessionStorage;
  }

  function save(token, user, remember) {
    clear();
    const store = remember ? localStorage : sessionStorage;
    store.setItem(KEYS.TOKEN, token);
    store.setItem(KEYS.USER, JSON.stringify({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
    }));
  }

  function clear() {
    [localStorage, sessionStorage].forEach(function (store) {
      store.removeItem(KEYS.TOKEN);
      store.removeItem(KEYS.USER);
    });
    // Clear cached API lists so the next user never sees the previous user's data
    Object.keys(sessionStorage).forEach(function (key) {
      if (key.indexOf('civic_cache:') === 0) sessionStorage.removeItem(key);
    });
  }

  function getToken() {
    return storage().getItem(KEYS.TOKEN);
  }

  function getUser() {
    try { return JSON.parse(storage().getItem(KEYS.USER)); }
    catch (e) { return null; }
  }

  // Used after a profile update so the navbar shows the new name/email
  function updateUser(changes) {
    const store = storage();
    const user = Object.assign({}, getUser(), changes);
    store.setItem(KEYS.USER, JSON.stringify(user));
  }

  /* ---------- Token expiry ---------- */

  // Reads the "exp" value inside the JWT and returns it in milliseconds
  function getExpiry(token) {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      return payload.exp ? payload.exp * 1000 : null;
    } catch (e) {
      return null;
    }
  }

  function isExpired() {
    const token = getToken();
    if (!token) return true;
    const exp = getExpiry(token);
    return exp ? Date.now() >= exp : false;
  }

  // Signs the user out automatically at the exact moment the token expires
  function scheduleAutoLogout() {
    const exp = getExpiry(getToken());
    if (!exp) return;
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(function () {
      logout('Your session has expired. Please log in again.');
    }, Math.max(exp - Date.now(), 0));
  }

  function isLoggedIn() {
    return !!getToken() && !isExpired();
  }

  function isAdmin() {
    const user = getUser();
    return isLoggedIn() && !!user && user.role === 'admin';
  }

  function logout(message) {
    clear();
    UI.setFlash(message || 'You have been logged out.', 'info');
    window.location.href = 'login.html';
  }

  /* ================================================================
   * ROLE-BASED ACCESS GUARDS (client-side, UX only)
   * The backend is the real security layer: it rejects requests with
   * 401 (no/expired token) or 403 (wrong role) - handled in api.js.
   * ================================================================ */

  // GUARD 1 - Any logged-in user (admin OR normal user).
  // Called at the top of every protected page. Redirects to login if there
  // is no token, or signs the user out if the token has expired.
  function requireAuth() {
    if (!getToken()) {
      UI.setFlash('Please log in to continue.', 'info');
      window.location.href = 'login.html';
      return false;
    }
    if (isExpired()) {
      logout('Your session has expired. Please log in again.');
      return false;
    }
    scheduleAutoLogout();
    return true;
  }

  // GUARD 2 - Admin-only pages (create/edit forms, user management, admin tools).
  // A normal user who opens one of these URLs is sent back to the dashboard
  // with a "contact an admin" message instead of seeing the page.
  function requireAdmin() {
    if (!requireAuth()) return false;
    if (!isAdmin()) {
      UI.setFlash('That page is for administrators only. Contact an admin if you need access.', 'error');
      window.location.href = 'dashboard.html';
      return false;
    }
    return true;
  }

  // GUARD 3 - Login/signup pages: logged-in users go straight to the dashboard.
  function redirectIfLoggedIn() {
    if (isLoggedIn()) {
      window.location.href = 'dashboard.html';
      return true;
    }
    if (getToken()) clear(); // remove an expired leftover token
    return false;
  }

  // GUARD 4 - Show/hide controls by role.
  // In the HTML, mark elements with:
  //   data-admin-only -> Create/Edit/Delete buttons, Admin + Dashboard links, Users page
  //   data-user-only  -> Register for event, Add feedback, My registrations
  // Elements the current role must not see are REMOVED from the page, not just hidden.
  function applyRoleUI(root) {
    const $root = root ? $(root) : $(document);
    if (isAdmin()) {
      $root.find('[data-user-only]').remove();
    } else {
      $root.find('[data-admin-only]').remove();
    }
  }

  return {
    save: save,
    clear: clear,
    getToken: getToken,
    getUser: getUser,
    updateUser: updateUser,
    isLoggedIn: isLoggedIn,
    isAdmin: isAdmin,
    logout: logout,
    requireAuth: requireAuth,
    requireAdmin: requireAdmin,
    redirectIfLoggedIn: redirectIfLoggedIn,
    applyRoleUI: applyRoleUI,
  };
})();