/* global TeletalkCapture, TeletalkFill, TeletalkMatch */
(function () {
  var STORAGE_KEY = 'profile';
  var SETTINGS_KEY = 'settings';
  var UI_KEY = 'uiState';
  var forceVisible = false;
  var lastUnmatched = [];

  function toast(msg, ms) {
    ms = ms || 3500;
    var el = document.getElementById('tt-fill-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tt-fill-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('show'); }, ms);
  }

  function getProfile(cb) {
    chrome.storage.local.get(STORAGE_KEY, function (data) {
      cb(TeletalkMatch.sanitizeProfile(data[STORAGE_KEY] || {}));
    });
  }

  function saveProfile(profile, cb) {
    var obj = {};
    obj[STORAGE_KEY] = profile;
    chrome.storage.local.set(obj, cb);
  }

  function saveUiState(collapsed) {
    var obj = {};
    obj[UI_KEY] = { collapsed: collapsed };
    chrome.storage.local.set(obj);
  }

  function showUnmatched(list) {
    lastUnmatched = list || [];
    var wrap = document.getElementById('tt-fill-unmatched');
    if (!wrap) return;

    if (!lastUnmatched.length) {
      wrap.innerHTML = '';
      wrap.style.display = 'none';
      return;
    }

    var unique = lastUnmatched.filter(function (l, i, arr) { return arr.indexOf(l) === i; });
    wrap.style.display = 'block';
    wrap.innerHTML =
      '<details><summary>' + unique.length + ' unmatched field(s)</summary><ul>' +
      unique.slice(0, 30).map(function (l) { return '<li>' + l + '</li>'; }).join('') +
      (unique.length > 30 ? '<li>…and ' + (unique.length - 30) + ' more</li>' : '') +
      '</ul></details>';
  }

  function setBarVisible(show) {
    var bar = document.getElementById('tt-fill-bar');
    if (!bar) return;
    if (show) bar.classList.remove('tt-hidden');
    else bar.classList.add('tt-hidden');
  }

  function refreshVisibility() {
    var hasForm = TeletalkMatch.hasApplicationForm();
    setBarVisible(forceVisible || hasForm);
  }

  function updateStatus() {
    var statusEl = document.getElementById('tt-fill-status');
    var gapEl = document.getElementById('tt-fill-gap');
    var fillBtn = document.getElementById('tt-fill-autofill');
    if (!statusEl) return;

    refreshVisibility();

    getProfile(function (profile) {
      var savedCount = TeletalkMatch.meaningfulProfileKeys(profile).length;
      var preview = TeletalkFill.countMatchable(profile);

      if (!savedCount) {
        statusEl.className = 'tt-empty';
        statusEl.innerHTML = 'No saved data yet.<br>Fill the form once, then click <strong>Save Form</strong>.';
        if (gapEl) gapEl.textContent = '';
        if (fillBtn) fillBtn.disabled = true;
        showUnmatched([]);
        return;
      }

      statusEl.className = '';
      if (fillBtn) fillBtn.disabled = preview.matchable === 0 && preview.total > 0;

      if (preview.total === 0) {
        statusEl.innerHTML =
          '<strong>' + savedCount + '</strong> field(s) saved.<br>Open an application form page to auto-fill.';
        if (gapEl) gapEl.textContent = '';
      } else {
        statusEl.innerHTML =
          '<strong>' + preview.matchable + '</strong> of <strong>' + preview.total + '</strong> fields can auto-fill' +
          '<br><span style="color:#666;font-size:12px">' + savedCount + ' total saved in profile</span>';
        if (gapEl) {
          gapEl.textContent = preview.gap > 0
            ? preview.gap + ' field(s) on this page have no saved match'
            : 'All visible fields have saved data';
        }
      }
    });
  }

  function doSave(done) {
    var captured = TeletalkCapture.capturePage();
    if (!captured.count) {
      toast('No filled fields found on this page.');
      if (done) done({ count: 0 });
      return;
    }

    getProfile(function (existing) {
      var before = Object.keys(existing).length;
      var merged = TeletalkMatch.sanitizeProfile(Object.assign({}, existing, captured.profile));
      var added = Object.keys(merged).length - before;

      saveProfile(merged, function () {
        var msg = 'Saved ' + captured.count + ' field(s). Total: ' + Object.keys(merged).length;
        if (before >= 20 && added < 3 && added >= 0) {
          msg = 'Updated ' + Math.max(added, captured.count) + ' field(s). Total: ' + Object.keys(merged).length;
        }
        toast(msg);
        forceVisible = true;
        setBarVisible(true);
        updateStatus();
        if (done) done({ count: captured.count, total: Object.keys(merged).length });
      });
    });
  }

  function doFill(done) {
    getProfile(function (profile) {
      if (!TeletalkMatch.meaningfulProfileKeys(profile).length) {
        toast('No saved data. Fill form once, then click Save Form.');
        if (done) done({ filled: 0, total: 0, unmatched: [] });
        return;
      }

      forceVisible = true;
      setBarVisible(true);

      TeletalkFill.fillPageWithRetry(profile, function (result) {
        var msg = 'Filled ' + result.filled + '/' + result.total + ' fields';
        toast(msg);
        showUnmatched(result.unmatched);
        updateStatus();
        if (done) done(result);
      });
    });
  }

  function injectBar() {
    if (document.getElementById('tt-fill-bar')) return;

    var bar = document.createElement('div');
    bar.id = 'tt-fill-bar';
    bar.className = 'tt-hidden';
    bar.innerHTML =
      '<div class="tt-fill-header">' +
        '<span class="tt-fill-title">Teletalk Form Fill</span>' +
        '<button type="button" id="tt-fill-toggle" title="Minimize">−</button>' +
      '</div>' +
      '<div class="tt-fill-body">' +
        '<div id="tt-fill-status">Loading…</div>' +
        '<div id="tt-fill-gap"></div>' +
        '<div id="tt-fill-unmatched" style="display:none"></div>' +
        '<div class="tt-fill-actions">' +
          '<button type="button" class="tt-btn" id="tt-fill-save">Save Form</button>' +
          '<button type="button" class="tt-btn" id="tt-fill-autofill">Auto Fill</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(bar);

    document.getElementById('tt-fill-save').addEventListener('click', function (e) {
      e.stopPropagation();
      doSave();
    });
    document.getElementById('tt-fill-autofill').addEventListener('click', function (e) {
      e.stopPropagation();
      doFill();
    });

    document.getElementById('tt-fill-toggle').addEventListener('click', function (e) {
      e.stopPropagation();
      bar.classList.toggle('tt-collapsed');
      var collapsed = bar.classList.contains('tt-collapsed');
      this.textContent = collapsed ? '+' : '−';
      saveUiState(collapsed);
    });

    bar.querySelector('.tt-fill-header').addEventListener('click', function (e) {
      if (e.target.id === 'tt-fill-toggle') return;
      if (bar.classList.contains('tt-collapsed')) {
        bar.classList.remove('tt-collapsed');
        document.getElementById('tt-fill-toggle').textContent = '−';
        saveUiState(false);
      }
    });

    chrome.storage.local.get(UI_KEY, function (data) {
      if (data[UI_KEY] && data[UI_KEY].collapsed) {
        bar.classList.add('tt-collapsed');
        document.getElementById('tt-fill-toggle').textContent = '+';
      }
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === 'save') {
      forceVisible = true;
      doSave(sendResponse);
      return true;
    }
    if (msg.action === 'fill') {
      forceVisible = true;
      doFill(sendResponse);
      return true;
    }
    if (msg.action === 'status') {
      getProfile(function (profile) {
        sendResponse(TeletalkFill.countMatchable(profile));
      });
      return true;
    }
    if (msg.action === 'showBar') {
      forceVisible = true;
      setBarVisible(true);
      updateStatus();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  injectBar();
  updateStatus();

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && (changes[STORAGE_KEY] || changes[UI_KEY])) updateStatus();
  });

  var statusTimer;
  function scheduleStatusRefresh() {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(updateStatus, 600);
  }

  window.addEventListener('load', scheduleStatusRefresh);
  document.addEventListener('click', function (e) {
    if (e.target.closest('button[type="submit"], input[type="submit"], .custom-form')) {
      scheduleStatusRefresh();
    }
  });

  chrome.storage.local.get(SETTINGS_KEY, function (data) {
    var settings = data[SETTINGS_KEY] || {};
    if (settings.autoFillOnLoad && TeletalkMatch.hasApplicationForm()) {
      setTimeout(function () { doFill(); }, 800);
    }
  });
})();
