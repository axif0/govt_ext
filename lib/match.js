/* global TeletalkMatch */
var TeletalkMatch = (function () {
  function normalizeLabel(text) {
    if (!text) return '';
    return String(text)
      .replace(/\*+/g, '')
      .replace(/'s/gi, ' ')
      .replace(/[''`]/g, ' ')
      .replace(/[:：]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normalizeSection(text) {
    return normalizeLabel(text)
      .replace(/\(if applicable\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isVisible(el) {
    if (!el || el.type === 'hidden') return false;
    if (el.disabled || el.readOnly) return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function isExcludedForm(form) {
    return !!(form.closest('header, nav, #navbar, footer'));
  }

  function getForms() {
    var out = [];
    document.querySelectorAll('form.custom-form').forEach(function (f) {
      if (!isExcludedForm(f)) out.push(f);
    });
    if (out.length) return out;

    document.querySelectorAll('form').forEach(function (f) {
      if (isExcludedForm(f)) return;
      if (f.querySelector('input, select, textarea')) out.push(f);
    });
    return out;
  }

  function hasApplicationForm() {
    var forms = getForms();
    for (var i = 0; i < forms.length; i++) {
      if (getFieldElements(forms[i]).length > 0) return true;
    }
    return false;
  }

  function findSectionHeading(start) {
    var cur = start;
    while (cur && cur !== document.body) {
      var prev = cur.previousElementSibling;
      while (prev) {
        var tag = prev.tagName;
        if (tag === 'LEGEND' || tag === 'H6' || tag === 'H5' || tag === 'H4') {
          var t = normalizeSection(prev.textContent);
          if (t.length > 2) return t;
        }
        var inner = prev.querySelector && prev.querySelector('legend, h6, h5, h4');
        if (inner) {
          var t2 = normalizeSection(inner.textContent);
          if (t2.length > 2) return t2;
        }
        prev = prev.previousElementSibling;
      }
      cur = cur.parentElement;
      if (cur && (cur.tagName === 'FORM' || cur.tagName === 'BODY')) break;
    }
    return '';
  }

  function getSectionPrefix(el) {
    var fieldset = el.closest('fieldset');
    if (fieldset) {
      var legend = fieldset.querySelector('legend');
      if (legend) {
        var s = normalizeSection(legend.textContent);
        if (s) return s;
      }
    }

    var table = el.closest('table');
    if (table) {
      var tr = el.closest('tr');
      if (tr) {
        var rows = table.querySelectorAll('tr');
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] === tr) break;
          var cell = rows[i].querySelector('th, td');
          if (!cell) continue;
          var text = normalizeSection(cell.textContent);
          if (text.indexOf('address') >= 0 || text.indexOf('qualification') >= 0 ||
              text.indexOf('education') >= 0 || text.indexOf('examination') >= 0) {
            if (cell.colSpan > 1 || rows[i].querySelector('legend, h6, h5, strong, b')) {
              return text;
            }
          }
        }
      }
    }

    return findSectionHeading(el.closest('tr, td, div, fieldset') || el);
  }

  function getSiblingsInCell(td) {
    var siblings = [];
    td.querySelectorAll('input, select, textarea').forEach(function (n) {
      if (n.type === 'hidden' || n.type === 'submit' || n.type === 'button' || n.type === 'image') return;
      if (!isVisible(n)) return;
      siblings.push(n);
    });
    return siblings;
  }

  function hasKeySuffix(key) {
    return /(?: type| value| \d+| day| month| year)$/.test(key);
  }

  function getCompositeSiblings(el, label) {
    var normLabel = normalizeLabel(label);
    var td = el.closest('td');
    if (td) {
      var inTd = getSiblingsInCell(td);
      if (inTd.length > 1) return inTd;
    }

    var tr = el.closest('tr');
    if (!tr) return td ? getSiblingsInCell(td) : [el];

    var inTr = [];
    tr.querySelectorAll('input, select, textarea').forEach(function (n) {
      if (!isVisible(n) || n.type === 'hidden' || n.type === 'submit' || n.type === 'button') return;
      if (normalizeLabel(getLabelFor(n)) === normLabel) inTr.push(n);
    });
    return inTr.length > 1 ? inTr : (td ? getSiblingsInCell(td) : [el]);
  }

  function disambiguateByType(el, key, siblings) {
    if (siblings.length <= 1 || hasKeySuffix(key)) return key;
    if (el.tagName === 'SELECT') return key + ' type';
    if (el.tagName === 'INPUT') {
      var t = (el.type || 'text').toLowerCase();
      if (t === 'text' || t === 'number' || t === 'tel' || t === '') return key + ' value';
      if (siblings.indexOf(el) > 0) return key + ' ' + (siblings.indexOf(el) + 1);
    }
    if (siblings.indexOf(el) > 0) return key + ' ' + (siblings.indexOf(el) + 1);
    return key;
  }

  function applyDobKey(el, key, label) {
    if (hasKeySuffix(key)) return key;
    var norm = normalizeLabel(label);
    if (norm.indexOf('date of birth') < 0 && norm.indexOf('dob') < 0) return key;
    var tr = el.closest('tr');
    if (!tr || el.tagName !== 'SELECT') return key;

    var selects = [];
    tr.querySelectorAll('select').forEach(function (s) {
      if (isVisible(s)) selects.push(s);
    });
    if (selects.length !== 3) return key;

    var idx = selects.indexOf(el);
    if (idx === 0) return key + ' day';
    if (idx === 1) return key + ' month';
    if (idx === 2) return key + ' year';
    return key;
  }

  function getLabelFor(el) {
    if (el.id) {
      var byFor = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (byFor) return byFor.textContent.replace(/\s+/g, ' ').trim();
    }

    var parentLabel = el.closest('label');
    if (parentLabel) {
      var clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach(function (n) { n.remove(); });
      var t = clone.textContent.replace(/\s+/g, ' ').trim();
      if (t) return t;
    }

    var td = el.closest('td');
    if (td && td.previousElementSibling) {
      var prev = td.previousElementSibling.textContent.replace(/\s+/g, ' ').trim();
      if (prev) return prev;
    }

    var tr = el.closest('tr');
    if (tr) {
      var cells = tr.querySelectorAll('td, th');
      for (var i = 0; i < cells.length; i++) {
        if (cells[i].contains(el)) {
          if (i > 0) {
            var cellText = cells[i - 1].textContent.replace(/\s+/g, ' ').trim();
            if (cellText) return cellText;
          }
          break;
        }
      }
    }

    var fieldset = el.closest('fieldset');
    if (fieldset) {
      var legend = fieldset.querySelector('legend');
      if (legend) {
        var leg = legend.textContent.replace(/\s+/g, ' ').trim();
        if (leg && (el.type === 'radio' || el.type === 'checkbox')) return leg;
      }
    }

    if (el.placeholder) return el.placeholder;
    if (el.name && el.name.length > 1) return el.name.replace(/_/g, ' ');
    if (el.id && el.id.length > 1) return el.id.replace(/_/g, ' ');
    return '';
  }

  function getFieldKey(el) {
    var label = getLabelFor(el);
    if (!label) return '';

    var key = normalizeLabel(label);
    var dobKey = applyDobKey(el, key, label);
    if (dobKey !== key) {
      key = dobKey;
    } else {
      key = disambiguateByType(el, key, getCompositeSiblings(el, label));
    }

    var section = getSectionPrefix(el);
    if (section && key.indexOf(section) !== 0) {
      key = section + ' ' + key;
    }

    return key;
  }

  function trimValue(v) {
    if (v === undefined || v === null) return '';
    return String(v).replace(/\u00a0/g, ' ').trim();
  }

  var PLACEHOLDER_VALUES = {
    select: 1, choose: 1, 'choose one': 1, 'please select': 1,
    '---': 1, '--': 1, '-': 1, 'n/a': 1, na: 1, none: 1
  };

  function isMeaningfulValue(v) {
    var s = trimValue(v);
    if (!s) return false;
    return !PLACEHOLDER_VALUES[normalizeLabel(s)];
  }

  function meaningfulProfileKeys(profile) {
    return Object.keys(profile).filter(function (k) {
      return isMeaningfulValue(profile[k]);
    });
  }

  function labelsMatch(a, b) {
    a = normalizeLabel(a);
    b = normalizeLabel(b);
    if (!a || !b) return false;
    if (a === b) return true;
    var minLen = Math.min(a.length, b.length);
    if (minLen >= 8 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) {
      var short = a.length <= b.length ? a : b;
      var long = a.length <= b.length ? b : a;
      if (short.indexOf(' ') < 0 && long.indexOf(' ') >= 0 && long.indexOf(short) === 0) return false;
      return true;
    }
    return false;
  }

  function lookupValue(profile, label, section) {
    var norm = normalizeLabel(label);
    var val;

    if (profile[norm] !== undefined) val = profile[norm];
    else {
      var keys = Object.keys(profile);
      for (var i = 0; i < keys.length; i++) {
        if (section && keys[i].indexOf(section) !== 0) continue;
        if (!section && keys[i].indexOf(' ') >= 0) {
          var parts = keys[i].split(' ');
          if (parts.length > 2) continue;
        }
        if (labelsMatch(keys[i], norm) || labelsMatch(keys[i], label)) {
          val = profile[keys[i]];
          break;
        }
      }
    }

    if (val === undefined) return undefined;
    val = trimValue(val);
    return isMeaningfulValue(val) ? val : undefined;
  }

  function lookupValueForElement(profile, el) {
    var key = getFieldKey(el);
    var section = getSectionPrefix(el);
    var label = getLabelFor(el);

    if (key && profile[key] !== undefined) {
      var direct = trimValue(profile[key]);
      if (isMeaningfulValue(direct)) return direct;
    }

    var keyTail = (section && key.indexOf(section) === 0) ? key.slice(section.length).trim() : key;

    // legacy profile keys without section prefix (e.g. "division" → "permanent address division")
    if (section && keyTail && profile[keyTail] !== undefined) {
      var legacy = trimValue(profile[keyTail]);
      if (isMeaningfulValue(legacy)) return legacy;
    }

    if (section) {
      var keys = Object.keys(profile);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf(section) !== 0) continue;
        var tail = keys[i].slice(section.length).trim();
        if (tail === keyTail || labelsMatch(tail, keyTail)) {
          var v = trimValue(profile[keys[i]]);
          if (isMeaningfulValue(v)) return v;
        }
      }
    }

    if (key && key.indexOf(' value') >= 0) {
      var norm = normalizeLabel(label);
      var allKeys = Object.keys(profile);
      for (var j = 0; j < allKeys.length; j++) {
        if (section && allKeys[j].indexOf(section) !== 0) continue;
        if (allKeys[j].indexOf('value') >= 0 && allKeys[j].indexOf(norm) >= 0) {
          var v2 = trimValue(profile[allKeys[j]]);
          if (isMeaningfulValue(v2)) return v2;
        }
      }
    }

    if (!section) {
      var global = lookupValue(profile, label, '');
      if (global !== undefined) return global;
    }

    return undefined;
  }

  function getFieldElements(root) {
    root = root || document;
    var nodes = root.querySelectorAll('input, select, textarea');
    var out = [];
    nodes.forEach(function (el) {
      if (el.type === 'submit' || el.type === 'button' || el.type === 'image') return;
      if (!isVisible(el)) return;
      out.push(el);
    });
    return out;
  }

  function sanitizeProfile(profile) {
    var clean = {};
    Object.keys(profile).forEach(function (k) {
      if (isMeaningfulValue(profile[k])) clean[k] = trimValue(profile[k]);
    });
    return clean;
  }

  function enableApplicableSections(profile) {
    document.querySelectorAll('fieldset').forEach(function (fs) {
      var legend = fs.querySelector('legend');
      if (!legend) return;
      var section = normalizeSection(legend.textContent);
      if (!section) return;

      var hasData = Object.keys(profile).some(function (k) {
        return k.indexOf(section) === 0 && isMeaningfulValue(profile[k]);
      });
      if (!hasData) return;

      var cb = fs.querySelector('input[type=checkbox]');
      if (cb && !cb.checked) cb.click();
    });
  }

  if (typeof console !== 'undefined') {
    var _ok = normalizeLabel("Applicant's Name:") === 'applicant name' &&
      labelsMatch("father's name", 'Father Name') &&
      !labelsMatch('division', 'division quota');
    if (!_ok && console.warn) console.warn('TeletalkMatch self-check failed');
  }

  return {
    normalizeLabel: normalizeLabel,
    trimValue: trimValue,
    isMeaningfulValue: isMeaningfulValue,
    meaningfulProfileKeys: meaningfulProfileKeys,
    sanitizeProfile: sanitizeProfile,
    getForms: getForms,
    hasApplicationForm: hasApplicationForm,
    getLabelFor: getLabelFor,
    getFieldKey: getFieldKey,
    getSectionPrefix: getSectionPrefix,
    lookupValueForElement: lookupValueForElement,
    getFieldElements: getFieldElements,
    labelsMatch: labelsMatch,
    lookupValue: lookupValue,
    isVisible: isVisible,
    enableApplicableSections: enableApplicableSections
  };
})();
