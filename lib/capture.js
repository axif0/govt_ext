/* global TeletalkMatch, TeletalkCapture */
var TeletalkCapture = (function () {
  function readValue(el) {
    var type = (el.type || '').toLowerCase();

    if (el.tagName === 'SELECT') {
      var opt = el.options[el.selectedIndex];
      var text = opt ? TeletalkMatch.trimValue(opt.text || opt.value || '') : '';
      if (!TeletalkMatch.isMeaningfulValue(text)) return '';
      return text;
    }

    if (type === 'radio') {
      if (!el.checked) return null;
      var span = el.parentElement && el.parentElement.querySelector('span');
      if (span) return span.textContent.trim();
      return el.value || TeletalkMatch.getLabelFor(el);
    }

    if (type === 'checkbox') {
      return el.checked ? (el.value || 'yes') : '';
    }

    if (type === 'file') {
      return el.files && el.files.length ? el.files[0].name : '';
    }

    return TeletalkMatch.trimValue(el.value || '');
  }

  function capturePage() {
    var profile = {};
    var count = 0;
    var forms = TeletalkMatch.getForms();

    forms.forEach(function (form) {
      TeletalkMatch.getFieldElements(form).forEach(function (el) {
        if (el.type === 'radio' && !el.checked) return;

        var label = TeletalkMatch.getLabelFor(el);
        if (!label) return;

        var value = readValue(el);
        if (!TeletalkMatch.isMeaningfulValue(value)) return;

        var key = TeletalkMatch.getFieldKey(el);
        if (!key) return;

        profile[key] = value;
        count++;
      });
    });

    return { profile: profile, count: count };
  }

  return { capturePage: capturePage, readValue: readValue };
})();
