/**
 * api.js
 * ------------------------------------------------------------------
 * Single wrapper around jQuery $.ajax for every backend call.
 *  - Attaches "Authorization: Bearer <token>" to protected requests
 *  - Sends JSON or multipart/form-data (file uploads, with progress)
 *  - Converts 4xx/5xx/network errors into user-friendly messages
 *  - 401 -> signs the user out and redirects to login
 *  - 403 -> rejects with a "contact an administrator" message
 *  - Simple sessionStorage cache for lists (invalidated on create/update)
 *
 * Every successful response from the backend looks like:
 *   { status: 200, message: "...", data: ... }
 * ------------------------------------------------------------------
 */
const Api = (function () {
  const CACHE_PREFIX = 'civic_cache:';

  // Pulls the most useful message out of the backend's error response
  function extractMessage(xhr) {
    const res = xhr.responseJSON;
    if (!res) return null;
    if (Array.isArray(res.errors) && res.errors.length) {
      return res.errors.map(function (e) { return e.msg || e.message || e; }).join(' ');
    }
    if (res.message) return res.message;
    if (typeof res.error === 'string') return res.error;
    if (res.error && res.error.message) return res.error.message;
    return null;
  }

  function friendlyError(xhr, textStatus) {
    const status = xhr.status;
    const serverMessage = extractMessage(xhr);
    let message;

    if (textStatus === 'timeout') {
      message = 'The request took too long. Please check your connection and try again.';
    } else if (status === 0) {
      message = "Can't reach the server. Check your internet connection and make sure the backend is running.";
    } else if (status === 401) {
      message = serverMessage || 'Your session has expired. Please log in again.';
    } else if (status === 403) {
      message = (serverMessage || "You don't have permission to do that.") + ' Contact an administrator if you need access.';
    } else if (status === 404) {
      message = serverMessage || "We couldn't find what you were looking for.";
    } else if (status === 409) {
      message = serverMessage || 'This conflicts with existing data.';
    } else if (status >= 500) {
      message = 'Something went wrong on the server. Please try again in a moment.';
    } else {
      message = serverMessage || 'Something went wrong. Please try again.';
    }

    return { status: status, message: message, data: xhr.responseJSON || null };
  }

  /**
   * Core request function.
   * @param {string} method   GET | POST | PUT | PATCH | DELETE
   * @param {string} endpoint e.g. "/events" (CONFIG.API_URL is added in front)
   * @param {object|FormData} body  JSON body, query params (GET) or FormData
   * @param {object} options  { skipAuthRedirect, onProgress }
   * @returns {Promise} resolves with the full response { status, message, data }
   */
  function request(method, endpoint, body, options) {
    options = options || {};
    const isUpload = body instanceof FormData;

    const settings = {
      url: CONFIG.API_URL + endpoint,
      method: method,
      headers: {},
      dataType: 'json',
      timeout: isUpload ? 0 : 30000, // no timeout for big uploads
    };

    // Attach the JWT to every request when the user is logged in
    const token = Auth.getToken();
    if (token) settings.headers.Authorization = 'Bearer ' + token;

    if (isUpload) {
      settings.data = body;
      settings.processData = false;  // let the browser build multipart/form-data
      settings.contentType = false;
      if (typeof options.onProgress === 'function') {
        settings.xhr = function () {
          const xhr = new window.XMLHttpRequest();
          xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) options.onProgress(Math.round((e.loaded / e.total) * 100));
          });
          return xhr;
        };
      }
    } else if (body && method === 'GET') {
      settings.data = body; // becomes ?key=value
    } else if (body) {
      settings.data = JSON.stringify(body);
      settings.contentType = 'application/json';
    }

    return new Promise(function (resolve, reject) {
      $.ajax(settings)
        .done(function (res) { resolve(res || {}); })
        .fail(function (xhr, textStatus) {
          // Some DELETE routes return 204 with no body - that's still a success
          if (xhr.status >= 200 && xhr.status < 300) return resolve({});

          const err = friendlyError(xhr, textStatus);

          // 401 = missing/expired/invalid token -> sign out and go to login.
          // (Skipped on the login form itself, where 401 means "wrong password".)
          if (err.status === 401 && !options.skipAuthRedirect) {
            Auth.logout('Your session has expired. Please log in again.');
          }
          reject(err);
        });
    });
  }

  /* ---------- Simple list cache (sessionStorage) ---------- */
  function cachedGet(endpoint, params, ttlMs) {
    ttlMs = ttlMs || 60000;
    const key = CACHE_PREFIX + endpoint + '?' + $.param(params || {});
    try {
      const hit = JSON.parse(sessionStorage.getItem(key));
      if (hit && Date.now() - hit.time < ttlMs) return Promise.resolve(hit.res);
    } catch (e) { /* ignore bad cache */ }

    return request('GET', endpoint, params).then(function (res) {
      try { sessionStorage.setItem(key, JSON.stringify({ time: Date.now(), res: res })); } catch (e) { /* storage full */ }
      return res;
    });
  }

  // Call after create/update/delete, e.g. Api.invalidate('/promos')
  function invalidate(endpointPrefix) {
    Object.keys(sessionStorage).forEach(function (key) {
      if (key.indexOf(CACHE_PREFIX + (endpointPrefix || '')) === 0) sessionStorage.removeItem(key);
    });
  }

  return {
    get: function (endpoint, params, options) { return request('GET', endpoint, params, options); },
    post: function (endpoint, body, options) { return request('POST', endpoint, body, options); },
    put: function (endpoint, body, options) { return request('PUT', endpoint, body, options); },
    patch: function (endpoint, body, options) { return request('PATCH', endpoint, body, options); },
    del: function (endpoint, options) { return request('DELETE', endpoint, null, options); },
    cachedGet: cachedGet,
    invalidate: invalidate,
  };
})();