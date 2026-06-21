function setStatusBox(text, empty) {
  var box = document.getElementById('statusBox');
  box.innerHTML = text;
  box.className = empty ? 'empty' : '';
}

function ensureBar(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (!tab || !tab.id) return cb(tab);
    chrome.tabs.sendMessage(tab.id, { action: 'showBar' }, function () {
      cb(tab);
    });
  });
}

function loadStatus() {
  var fillBtn = document.getElementById('fillBtn');
  chrome.storage.local.get('profile', function (data) {
    var profile = TeletalkMatch.sanitizeProfile(data.profile || {});
    var savedCount = TeletalkMatch.meaningfulProfileKeys(profile).length;

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab || !tab.url || tab.url.indexOf('teletalk.com.bd') < 0) {
        if (!savedCount) {
          setStatusBox('No saved data yet.', true);
        } else {
          setStatusBox('<strong>' + savedCount + '</strong> field(s) saved.<br>Open a Teletalk form page.', false);
        }
        fillBtn.disabled = !savedCount;
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'status' }, function (response) {
        if (chrome.runtime.lastError || !response) {
          if (!savedCount) {
            setStatusBox('No saved data yet.', true);
          } else {
            setStatusBox('<strong>' + savedCount + '</strong> field(s) saved.<br>Reload Teletalk page for live count.', false);
          }
          fillBtn.disabled = !savedCount;
          return;
        }

        if (!savedCount) {
          setStatusBox('No saved data yet.<br>Fill form once, then Save.', true);
          fillBtn.disabled = true;
        } else if (response.total === 0) {
          setStatusBox('<strong>' + savedCount + '</strong> field(s) saved.<br>Open application form to auto-fill.', false);
          fillBtn.disabled = true;
        } else {
          var gapLine = response.gap > 0
            ? '<br><span style="color:#888;font-size:12px">' + response.gap + ' field(s) have no saved match</span>'
            : '';
          setStatusBox(
            '<strong>' + response.matchable + '</strong> of <strong>' + response.total + '</strong> fields can auto-fill' +
            gapLine +
            '<br><span style="color:#666;font-size:12px">' + savedCount + ' total saved</span>',
            false
          );
          fillBtn.disabled = response.matchable === 0;
        }
      });
    });
  });
}

function sendAction(action) {
  var msg = document.getElementById('msg');
  ensureBar(function (tab) {
    if (!tab || !tab.url || tab.url.indexOf('teletalk.com.bd') < 0) {
      msg.textContent = 'Open a teletalk.com.bd page first.';
      return;
    }
    chrome.tabs.sendMessage(tab.id, { action: action }, function (response) {
      if (chrome.runtime.lastError) {
        msg.textContent = 'Reload the Teletalk page and try again.';
        return;
      }
      if (action === 'save' && response) {
        msg.textContent = 'Saved ' + (response.count || 0) + ' field(s).';
      } else if (action === 'fill' && response) {
        var extra = response.unmatched && response.unmatched.length
          ? ' · ' + response.unmatched.length + ' unmatched'
          : '';
        msg.textContent = 'Filled ' + response.filled + '/' + response.total + extra;
      }
      loadStatus();
    });
  });
}

document.getElementById('saveBtn').addEventListener('click', function () { sendAction('save'); });
document.getElementById('fillBtn').addEventListener('click', function () { sendAction('fill'); });
document.getElementById('optionsLink').addEventListener('click', function (e) {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

loadStatus();
