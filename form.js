// napari-spatialdata app form: limits the number of hours to the selected
// partition's time limit, using the limits form.yml.erb places on the
// partition select (data-max-hours, {partition: hours or null}).
//
// The change handler is bound through jQuery because OnDemand's saved-settings
// prefill changes fields with jQuery's trigger('change'), which plain
// addEventListener handlers do not receive.

(function () {
  'use strict';

  var PREFIX = 'batch_connect_session_context_';

  function readLimits(select) {
    try {
      var raw = select.getAttribute('data-max-hours');
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function helpElement(input) {
    var wrapper = document.getElementById(input.id + '_wrapper');
    var scope = wrapper || input.parentNode;
    return scope ? scope.querySelector('.form-text, .help-block') : null;
  }

  function applyLimit(select, hours, limits) {
    var max = limits[select.value];
    var help = helpElement(hours);

    if (typeof max === 'number' && max > 0) {
      hours.max = String(max);
      if (Number(hours.value) > max) {
        hours.value = String(max);
      }
    } else {
      hours.removeAttribute('max');
    }

    if (help) {
      if (!help.dataset.baseText) {
        help.dataset.baseText = help.textContent.trim();
      }
      help.textContent = help.dataset.baseText +
        (typeof max === 'number' && max > 0
          ? ' The ' + select.value + ' partition allows up to ' + max + ' hours.'
          : '');
    }
  }

  function init() {
    var select = document.getElementById(PREFIX + 'partition');
    var hours = document.getElementById(PREFIX + 'bc_num_hours');
    if (!select || !hours) {
      return;
    }
    var limits = readLimits(select);
    var update = function () { applyLimit(select, hours, limits); };

    if (window.jQuery) {
      window.jQuery(select).on('change', update);
    } else {
      select.addEventListener('change', update);
    }
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
