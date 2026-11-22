/**
 * service-requests.js
 * ------------------------------------------------------------------
 * City service requests ("report an issue / request a service").
 *
 * IMPORTANT: the provided backend has NO service-request endpoints,
 * so requests are stored in this browser's localStorage. Every function
 * returns a Promise (like Api.*), so connecting a real API later only
 * means changing this file, e.g. list() -> Api.get('/service-requests').
 *
 * Service types match backend/src/utils/serviceTypes.js.
 * ------------------------------------------------------------------
 */
const ServiceRequests = (function () {
  const KEY = 'civic_service_requests';

  const TYPES = [
    { name: 'Road Repair', description: 'Potholes, damaged roads or broken pavements.' },
    { name: 'Sanitation', description: 'Missed waste collection, illegal dumping or blocked drains.' },
    { name: 'Street Light Issue', description: 'Broken, flickering or missing street lights.' },
    { name: 'Public Event Support', description: 'Help with security, cleanup or permits for a community event.' },
    { name: 'Water Supply Issue', description: 'No water, leaking pipes or low pressure.' },
    { name: 'General Complaint', description: 'Anything else you would like the city to know about.' },
  ];

  const STATUSES = {
    submitted: { label: 'Submitted', classes: 'bg-sky-100 text-sky-800' },
    in_progress: { label: 'In progress', classes: 'bg-amber-100 text-amber-900' },
    resolved: { label: 'Resolved', classes: 'bg-emerald-100 text-emerald-800' },
    rejected: { label: 'Rejected', classes: 'bg-red-100 text-red-800' },
  };

  /* ---------- Storage helpers ---------- */
  function readAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }

  function writeAll(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function newId() {
    return window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : 'sr-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  // Runs fn and returns a Promise, with the same error shape as api.js { status, message }
  function run(fn) {
    return new Promise(function (resolve, reject) {
      try {
        resolve(fn());
      } catch (err) {
        reject(err && err.status ? err : {
          status: 0,
          message: "Couldn't save on this device. Please check that browser storage is enabled.",
        });
      }
    });
  }

  function fail(status, message) {
    const err = new Error(message);
    err.status = status;
    err.message = message;
    throw err;
  }

  function newestFirst(a, b) {
    return new Date(b.created_at) - new Date(a.created_at);
  }

  /* ---------- Public functions ---------- */

  // ROLE GUARD (data): admins get every request, normal users only their own
  function list() {
    return run(function () {
      const user = Auth.getUser();
      if (!user) fail(401, 'Please log in again.');
      const all = readAll().sort(newestFirst);
      return Auth.isAdmin() ? all : all.filter(function (r) { return r.user_id === user.id; });
    });
  }

  // Normal users submit requests (admins handle them)
  function create(data) {
    return run(function () {
      // ROLE GUARD (data): only normal users create requests
      if (Auth.isAdmin()) fail(403, 'Admins manage service requests and cannot submit them.');
      const typeNames = TYPES.map(function (t) { return t.name; });
      if (typeNames.indexOf(data.type) === -1) fail(400, 'Please choose a valid service type.');
      if (!data.title || !data.description || !data.location) fail(400, 'Please fill in all required fields.');

      const user = Auth.getUser();
      const now = new Date().toISOString();
      const request = {
        id: newId(),
        user_id: user.id,
        user_name: user.full_name,
        user_email: user.email,
        type: data.type,
        title: data.title,
        description: data.description,
        location: data.location,
        status: 'submitted',
        admin_note: '',
        handled_by: null,
        created_at: now,
        updated_at: now,
      };
      const all = readAll();
      all.push(request);
      writeAll(all);
      return request;
    });
  }

  // ROLE GUARD (data): only admins can change a request's status
  function updateStatus(id, status, note) {
    return run(function () {
      if (!Auth.isAdmin()) fail(403, "You don't have permission to do that. Contact an administrator if you need access.");
      if (!STATUSES[status]) fail(400, 'Please choose a valid status.');
      const all = readAll();
      const request = all.find(function (r) { return r.id === id; });
      if (!request) fail(404, 'This service request no longer exists.');
      request.status = status;
      request.admin_note = note || '';
      request.handled_by = Auth.getUser().full_name;
      request.updated_at = new Date().toISOString();
      writeAll(all);
      return request;
    });
  }

  // A user can withdraw their own request while it is still "Submitted"
  function withdraw(id) {
    return run(function () {
      const user = Auth.getUser();
      const all = readAll();
      const index = all.findIndex(function (r) { return r.id === id && r.user_id === user.id; });
      if (index === -1) fail(404, 'This service request no longer exists.');
      if (all[index].status !== 'submitted') fail(400, 'Only requests that have not been picked up yet can be withdrawn.');
      all.splice(index, 1);
      writeAll(all);
      return true;
    });
  }

  function statusBadge(status) {
    const s = STATUSES[status] || STATUSES.submitted;
    return '<span class="inline-block text-xs font-semibold px-2 py-0.5 rounded-full ' + s.classes + '">' + s.label + '</span>';
  }

  return {
    TYPES: TYPES,
    STATUSES: STATUSES,
    list: list,
    create: create,
    updateStatus: updateStatus,
    withdraw: withdraw,
    statusBadge: statusBadge,
  };
})();