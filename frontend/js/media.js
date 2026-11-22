/**
 * media.js
 * ------------------------------------------------------------------
 * Shared helpers for Announcements (audio) and Promos (video):
 *  - published/draft visibility + badges
 *  - publish / unpublish / delete (admin)
 *  - reading media duration in the browser
 *  - accessible custom audio player
 *  - turning caption_text into a WebVTT captions track
 *  - lazy-loading videos when they scroll into view
 * ------------------------------------------------------------------
 */
const MediaService = (function () {
  const esc = UI.escapeHtml;
  let playerCount = 0;

  const ICON = {
    play: '<svg class="h-5 w-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  };

  const SMALL_BTN = 'px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600';

  /* ---------- Visibility & badges ---------- */

  // ROLE GUARD (UI): normal users only see published items; admins see drafts too
  function isVisible(item) {
    return Auth.isAdmin() || item.published !== false;
  }

  function publishBadge(item) {
    return item.published === false
      ? '<span class="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-white">Draft</span>'
      : '<span class="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Published</span>';
  }

  function newestFirst(a, b) {
    return new Date(b.created_at) - new Date(a.created_at);
  }

  /* ---------- Admin actions ---------- */

  // ROLE GUARD: these are only called from admin-only buttons.
  // The backend also protects these routes with authorize(['admin']).
  function setPublished(resource, id, publish) {
    return Api.patch('/' + resource + '/' + encodeURIComponent(id) + (publish ? '/publish' : '/unpublish'))
      .then(function (res) {
        Api.invalidate('/' + resource);
        return res;
      });
  }

  function remove(resource, item, label) {
    return UI.confirmDialog({
      title: 'Delete this ' + label.toLowerCase() + '?',
      message: '"' + item.title + '" will be removed permanently. This cannot be undone.',
      confirmText: 'Delete',
    }).then(function (ok) {
      if (!ok) return false;
      return Api.del('/' + resource + '/' + encodeURIComponent(item.id))
        .then(function () {
          Api.invalidate('/' + resource);
          UI.toast(label + ' deleted.');
          return true;
        })
        .catch(function (err) {
          UI.toast(err.message, 'error');
          return false;
        });
    });
  }

  /* ---------- Duration (read from the file's metadata) ---------- */
  function getDuration(src, kind) {
    return new Promise(function (resolve) {
      const el = document.createElement(kind === 'video' ? 'video' : 'audio');
      el.preload = 'metadata';
      el.onloadedmetadata = function () { resolve(isFinite(el.duration) ? el.duration : null); };
      el.onerror = function () { resolve(null); };
      el.src = src;
    });
  }

  /* ---------- Accessible audio player ---------- */
  function audioPlayerHtml(src, title) {
    const n = ++playerCount;
    return `
      <div class="card p-4 sm:p-5" data-audio-player>
        <audio preload="metadata" src="${esc(src)}">
          <p>Your browser can't play this audio. <a href="${esc(src)}" download class="link">Download the audio file</a> instead.</p>
        </audio>

        <div class="flex items-center gap-4">
          <button type="button" data-play data-title="${esc(title)}" aria-label="Play: ${esc(title)}"
                  class="shrink-0 h-14 w-14 rounded-full bg-indigo-700 text-white flex items-center justify-center hover:bg-indigo-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600">
            ${ICON.play}
          </button>
          <div class="flex-1 min-w-0">
            <label for="seek-${n}" class="sr-only">Playback position</label>
            <input id="seek-${n}" data-seek type="range" min="0" max="0" step="0.1" value="0"
                   class="w-full accent-indigo-700 cursor-pointer" aria-valuetext="0:00 of 0:00" />
            <div class="mt-1 flex justify-between text-sm text-slate-600 tabular-nums">
              <span><span class="sr-only">Current time </span><span data-current>0:00</span></span>
              <span><span class="sr-only">Duration </span><span data-duration>--:--</span></span>
            </div>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" data-skip="-10" class="${SMALL_BTN}" aria-label="Back 10 seconds">« 10s</button>
          <button type="button" data-skip="10" class="${SMALL_BTN}" aria-label="Forward 10 seconds">10s »</button>
          <button type="button" data-mute class="${SMALL_BTN}" aria-pressed="false">Mute</button>
          <label for="volume-${n}" class="flex items-center gap-2 text-sm text-slate-700">Volume
            <input id="volume-${n}" data-volume type="range" min="0" max="1" step="0.05" value="1" class="w-24 accent-indigo-700" />
          </label>
          <label for="speed-${n}" class="flex items-center gap-2 text-sm text-slate-700">Speed
            <select id="speed-${n}" data-speed class="input py-1 w-auto">
              <option value="0.75">0.75×</option>
              <option value="1" selected>1×</option>
              <option value="1.25">1.25×</option>
              <option value="1.5">1.5×</option>
            </select>
          </label>
        </div>
        <p data-error class="hidden mt-3 text-sm text-red-700" role="alert"></p>
      </div>`;
  }

  function initAudioPlayer(container) {
    const $p = $(container).find('[data-audio-player]').addBack('[data-audio-player]').first();
    const audio = $p.find('audio')[0];
    const $play = $p.find('[data-play]');
    const $seek = $p.find('[data-seek]');
    const title = $play.attr('data-title');

    function setPlaying(playing) {
      $play.html(playing ? ICON.pause : ICON.play).attr('aria-label', (playing ? 'Pause: ' : 'Play: ') + title);
    }
    function updateTime() {
      const current = audio.currentTime || 0;
      const total = isFinite(audio.duration) ? audio.duration : 0;
      $seek.val(current).attr('aria-valuetext', UI.formatDuration(current) + ' of ' + UI.formatDuration(total));
      $p.find('[data-current]').text(UI.formatDuration(current));
    }

    $play.on('click', function () {
      if (audio.paused) {
        audio.play().catch(function () { showError(); });
      } else {
        audio.pause();
      }
    });
    audio.addEventListener('play', function () { setPlaying(true); });
    audio.addEventListener('pause', function () { setPlaying(false); });
    audio.addEventListener('ended', function () { setPlaying(false); });
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', function () {
      if (isFinite(audio.duration)) {
        $seek.attr('max', audio.duration);
        $p.find('[data-duration]').text(UI.formatDuration(audio.duration));
      }
      updateTime();
    });
    audio.addEventListener('error', showError);

    $seek.on('input', function () { audio.currentTime = Number($(this).val()); });
    $p.find('[data-skip]').on('click', function () {
      audio.currentTime = Math.max(0, Math.min((audio.duration || 0), audio.currentTime + Number($(this).attr('data-skip'))));
    });
    $p.find('[data-mute]').on('click', function () {
      audio.muted = !audio.muted;
      $(this).attr('aria-pressed', String(audio.muted)).text(audio.muted ? 'Unmute' : 'Mute');
    });
    $p.find('[data-volume]').on('input', function () { audio.volume = Number($(this).val()); });
    $p.find('[data-speed]').on('change', function () { audio.playbackRate = Number($(this).val()); });

    function showError() {
      $p.find('[data-error]').removeClass('hidden')
        .html('This audio couldn\'t be played in your browser. <a href="' + esc(audio.src) + '" download class="link">Download the file</a> to listen.');
    }
  }

  /* ---------- Captions: caption_text -> WebVTT track ---------- */
  // The backend stores captions as plain text, but <track> needs a .vtt file.
  // We split the text into sentences and spread them evenly across the video.
  function captionsTrackUrl(text, duration) {
    if (!text || !text.trim()) return null;
    const sentences = (text.match(/[^.!?]+[.!?]*/g) || [text]).map(function (s) { return s.trim(); }).filter(Boolean);
    const total = isFinite(duration) && duration > 0 ? duration : sentences.length * 4;
    const per = total / sentences.length;

    function stamp(seconds) {
      const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
      const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
      const s = (seconds % 60).toFixed(3).padStart(6, '0');
      return h + ':' + m + ':' + s;
    }

    let vtt = 'WEBVTT\n\n';
    sentences.forEach(function (sentence, i) {
      vtt += (i + 1) + '\n' + stamp(i * per) + ' --> ' + stamp((i + 1) * per) + '\n' + sentence + '\n\n';
    });
    return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
  }

  /* ---------- Lazy-load videos (performance) ---------- */
  // <video data-src="..."> only starts downloading when it's close to the screen
  function lazyLoadVideos(root) {
    const videos = $(root).find('video[data-src]').toArray();
    function load(video) {
      video.src = video.getAttribute('data-src');
      video.removeAttribute('data-src');
    }
    if (!('IntersectionObserver' in window)) { videos.forEach(load); return; }
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { load(entry.target); observer.unobserve(entry.target); }
      });
    }, { rootMargin: '200px' });
    videos.forEach(function (v) { observer.observe(v); });
  }

  return {
    ICON: ICON,
    isVisible: isVisible,
    publishBadge: publishBadge,
    newestFirst: newestFirst,
    setPublished: setPublished,
    remove: remove,
    getDuration: getDuration,
    audioPlayerHtml: audioPlayerHtml,
    initAudioPlayer: initAudioPlayer,
    captionsTrackUrl: captionsTrackUrl,
    lazyLoadVideos: lazyLoadVideos,
  };
})();