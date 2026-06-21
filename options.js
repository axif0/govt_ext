var STORAGE_KEY = 'profile';
var SETTINGS_KEY = 'settings';
var currentProfile = {};

function setStatus(text) {
  document.getElementById('status').textContent = text;
}

function renderTable(profile, filter) {
  var tbody = document.getElementById('profileTableBody');
  var keys = TeletalkMatch.meaningfulProfileKeys(profile).sort();
  filter = (filter || '').toLowerCase().trim();

  var rows = keys.filter(function (k) {
    if (!filter) return true;
    return k.indexOf(filter) >= 0 || String(profile[k]).toLowerCase().indexOf(filter) >= 0;
  });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="2" class="empty-table">No saved fields' +
      (filter ? ' matching search' : '') + '.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function (k) {
    return '<tr><td>' + escapeHtml(k) + '</td><td>' + escapeHtml(profile[k]) + '</td></tr>';
  }).join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syncUi(profile) {
  currentProfile = TeletalkMatch.sanitizeProfile(profile);
  document.getElementById('profileJson').value = JSON.stringify(currentProfile, null, 2);
  renderTable(currentProfile, document.getElementById('searchKeys').value);
}

function load() {
  chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], function (data) {
    syncUi(data[STORAGE_KEY] || {});
    document.getElementById('autoFillOnLoad').checked = !!(data[SETTINGS_KEY] && data[SETTINGS_KEY].autoFillOnLoad);
  });
}

document.getElementById('searchKeys').addEventListener('input', function () {
  renderTable(currentProfile, this.value);
});

document.getElementById('saveBtn').addEventListener('click', function () {
  var raw = document.getElementById('profileJson').value.trim();
  var profile;
  try {
    profile = raw ? JSON.parse(raw) : {};
    if (typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Profile must be a JSON object');
  } catch (e) {
    setStatus('Invalid JSON: ' + e.message);
    return;
  }

  profile = TeletalkMatch.sanitizeProfile(profile);
  var settings = { autoFillOnLoad: document.getElementById('autoFillOnLoad').checked };
  var obj = {};
  obj[STORAGE_KEY] = profile;
  obj[SETTINGS_KEY] = settings;

  chrome.storage.local.set(obj, function () {
    syncUi(profile);
    setStatus('Saved. ' + TeletalkMatch.meaningfulProfileKeys(profile).length + ' field(s) in profile.');
  });
});

document.getElementById('exportBtn').addEventListener('click', function () {
  chrome.storage.local.get(STORAGE_KEY, function (data) {
    var profile = TeletalkMatch.sanitizeProfile(data[STORAGE_KEY] || {});
    var blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'teletalk-profile.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Exported.');
  });
});

document.getElementById('importFile').addEventListener('change', function (e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var profile = TeletalkMatch.sanitizeProfile(JSON.parse(reader.result));
      if (typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Must be object');
      var obj = {};
      obj[STORAGE_KEY] = profile;
      chrome.storage.local.set(obj, function () {
        syncUi(profile);
        setStatus('Imported ' + TeletalkMatch.meaningfulProfileKeys(profile).length + ' field(s).');
      });
    } catch (err) {
      setStatus('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('clearBtn').addEventListener('click', function () {
  if (!confirm('Delete all saved profile data?')) return;
  chrome.storage.local.remove([STORAGE_KEY], function () {
    syncUi({});
    setStatus('Profile cleared.');
  });
});

load();
