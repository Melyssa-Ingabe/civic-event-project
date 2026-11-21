/**
 * config.js
 * Central app settings. If the backend runs on a different port,
 * change API_BASE_URL here and the whole app follows.
 */
const CONFIG = {
  // Backend server (see backend/README.md - runs on port 4000)
  API_BASE_URL: 'http://localhost:4000',

  // All API endpoints start with /api
  get API_URL() {
    return this.API_BASE_URL + '/api';
  },

  // Keys used in sessionStorage / localStorage
  STORAGE_KEYS: {
    TOKEN: 'civic_token',
    USER: 'civic_user',
  },

  // Items per page on list pages
  PAGE_SIZE: 9,

    // Client-side upload limits - these match backend/src/middlewares/upload.middleware.js
  UPLOAD_LIMITS: {
    image: { maxMB: 2, extensions: ['jpg', 'jpeg', 'png', 'gif'] },
    audio: { maxMB: 5, extensions: ['mp3', 'wav', 'm4a', 'ogg'] },
    video: { maxMB: 8, extensions: ['mp4', 'mov', 'avi', 'mkv'] },
  },
};

/**
 * Turns a file path from the backend into a full URL.
 * e.g. "/uploads/events/abc.jpg" -> "http://localhost:4000/uploads/events/abc.jpg"
 * If the backend already sent a full URL, it is returned unchanged.
 */
function mediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return CONFIG.API_BASE_URL + (path.startsWith('/') ? '' : '/') + path;
}