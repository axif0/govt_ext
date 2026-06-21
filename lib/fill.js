/* global TeletalkMatch, TeletalkFill */
var TeletalkFill = (function () {
  var inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  var textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function readElementValue(el) {
    if (el.tagName === 'SELECT') {
      var opt = el.options[el.selectedIndex];
      return opt ? TeletalkMatch.trimValue(opt.text || opt.value || '') : '';
    }
    if (el.type === 'radio' || el.type === 'checkbox') {
      return el.checked ? 'yes' : '';
    }
    return TeletalkMatch.trimValue(el.value || '');
  }

  function valuesMatch(el, value) {
    value = TeletalkMatch.trimValue(value);
    if (!TeletalkMatch.isMeaningfulValue(value)) return false;

    var current = readElementValue(el);
    if (!TeletalkMatch.isMeaningfulValue(current)) return false;

    if (TeletalkMatch.normalizeLabel(current) === TeletalkMatch.normalizeLabel(value)) return true;
    if (el.tagName === 'SELECT') {
      return current.indexOf(value) >= 0 || value.indexOf(current) >= 0;
    }
    return current === value;
  }

  function highlight(el) {
    el.classList.add('tt-filled');
    setTimeout(function () { el.classList.remove('tt-filled'); }, 1200);
  }

  function setNativeValue(el, value) {
    value = TeletalkMatch.trimValue(value);
    if (!TeletalkMatch.isMeaningfulValue(value)) return false;

    var type = (el.type || '').toLowerCase();
    if (type === 'date') {
      var m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) value = m[3] + '-' + m[2] + '-' + m[1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    } else if (type === 'number' && isNaN(Number(value))) {
      return false;
    } else if (type === 'month' && !/^\d{4}-\d{2}$/.test(value)) {
      return false;
    }

    try {
      if (el.tagName === 'TEXTAREA' && textareaSetter && textareaSetter.set) {
        textareaSetter.set.call(el, value);
      } else if (inputSetter && inputSetter.set) {
        inputSetter.set.call(el, value);
      } else {
        el.value = value;
      }
    } catch (e) {
      return false;
    }
    fire(el, 'input');
    fire(el, 'change');
    return true;
  }

  function norm(s) {
    return TeletalkMatch.normalizeLabel(s);
  }

  function setSelect(el, value) {
    value = TeletalkMatch.trimValue(value);
    if (!TeletalkMatch.isMeaningfulValue(value)) return false;

    el.value = value;
    if (el.value === value) {
      fire(el, 'change');
      return true;
    }

    var vt = norm(value);

    for (var i = 0; i < el.options.length; i++) {
      var opt = el.options[i];
      if (!TeletalkMatch.isMeaningfulValue(opt.text)) continue;
      if (norm(opt.text) === vt || norm(opt.value) === vt) {
        el.selectedIndex = i;
        fire(el, 'change');
        return true;
      }
    }

    // prefix match only — avoids "Dhaka" → "Dhaka Metropolitan" false pick
    if (vt.length >= 4) {
      for (var j = 0; j < el.options.length; j++) {
        var o = el.options[j];
        if (!TeletalkMatch.isMeaningfulValue(o.text)) continue;
        var ot = norm(o.text);
        if (ot.indexOf(vt) === 0 && (ot.length === vt.length || ot.charAt(vt.length) === ' ')) {
          el.selectedIndex = j;
          fire(el, 'change');
          return true;
        }
      }
    }
    return false;
  }

  function setRadio(el, value) {
    if (!el.name) return false;

    var group = document.querySelectorAll('input[type="radio"][name="' + CSS.escape(el.name) + '"]');
    var target = norm(value);

    for (var i = 0; i < group.length; i++) {
      var r = group[i];
      var span = r.parentElement && r.parentElement.querySelector('span');
      var labelText = span ? span.textContent.trim() : '';
      if (norm(r.value) === target || norm(labelText) === target || labelText.indexOf(value) >= 0) {
        r.click();
        return true;
      }
    }
    return false;
  }

  function fillElement(el, value, opts) {
    opts = opts || {};
    value = TeletalkMatch.trimValue(value);
    if (!TeletalkMatch.isMeaningfulValue(value)) return false;
    if (valuesMatch(el, value)) return opts.countAsFilled ? true : false;

    var type = (el.type || '').toLowerCase();
    var ok = false;

    if (el.tagName === 'SELECT') ok = setSelect(el, value);
    else if (type === 'radio') ok = setRadio(el, value);
    else if (type === 'checkbox') {
      var on = /^(yes|true|1|on)$/i.test(String(value));
      if (on !== el.checked) el.click();
      ok = true;
    } else if (type === 'file') ok = false;
    else ok = setNativeValue(el, value);

    if (ok && opts.highlight !== false) highlight(el);
    return ok;
  }

  function countMatchable(profile) {
    var matchable = 0;
    var total = 0;
    var forms = TeletalkMatch.getForms();
    var radioDone = {};

    forms.forEach(function (form) {
      TeletalkMatch.getFieldElements(form).forEach(function (el) {
        if (el.type === 'radio') {
          if (!el.name || radioDone[el.name]) return;
        }

        var label = TeletalkMatch.getLabelFor(el);
        if (!label) return;

        total++;
        if (TeletalkMatch.lookupValueForElement(profile, el) !== undefined) {
          matchable++;
          if (el.type === 'radio' && el.name) radioDone[el.name] = true;
        }
      });
    });

    return {
      matchable: matchable,
      total: total,
      savedCount: TeletalkMatch.meaningfulProfileKeys(profile).length,
      gap: total - matchable
    };
  }

  function fillPage(profile, opts) {
    opts = opts || {};
    var filled = 0;
    var total = 0;
    var unmatched = [];
    var forms = TeletalkMatch.getForms();
    var radioDone = {};

    TeletalkMatch.enableApplicableSections(profile);

    forms.forEach(function (form) {
      TeletalkMatch.getFieldElements(form).forEach(function (el) {
        if (el.type === 'radio') {
          if (!el.name || radioDone[el.name]) return;
        }

        var label = TeletalkMatch.getLabelFor(el);
        if (!label) return;

        total++;
        var value = TeletalkMatch.lookupValueForElement(profile, el);

        if (value === undefined) {
          unmatched.push(label);
          return;
        }

        if (fillElement(el, value, { highlight: opts.highlight, countAsFilled: true })) {
          filled++;
          if (el.type === 'radio' && el.name) radioDone[el.name] = true;
        } else if (!valuesMatch(el, value)) {
          unmatched.push(label);
        } else {
          filled++;
          if (el.type === 'radio' && el.name) radioDone[el.name] = true;
        }
      });
    });

    return { filled: filled, total: total, unmatched: unmatched };
  }

  function countPendingSelects(profile) {
    var pending = 0;
    TeletalkMatch.getForms().forEach(function (form) {
      TeletalkMatch.getFieldElements(form).forEach(function (el) {
        if (el.tagName !== 'SELECT') return;
        var value = TeletalkMatch.lookupValueForElement(profile, el);
        if (value === undefined) return;
        if (!valuesMatch(el, value)) pending++;
      });
    });
    return pending;
  }

  function fillPageWithRetry(profile, done) {
    var delays = [0, 400, 900, 1500];
    var best = { filled: 0, total: 0, unmatched: [] };
    var step = 0;
    var lastFilled = -1;

    function runStep() {
      var result = fillPage(profile, { highlight: step === 0 });
      if (result.filled > best.filled) best = result;
      else best.unmatched = result.unmatched;

      var pendingSelects = countPendingSelects(profile);
      step++;

      if (step < delays.length && pendingSelects > 0 && result.filled > lastFilled) {
        lastFilled = result.filled;
        setTimeout(runStep, delays[step] - delays[step - 1]);
      } else if (done) {
        done(best);
      }
    }

    runStep();
  }

  return {
    fillPage: fillPage,
    fillPageWithRetry: fillPageWithRetry,
    fillElement: fillElement,
    countMatchable: countMatchable,
    valuesMatch: valuesMatch
  };
})();
