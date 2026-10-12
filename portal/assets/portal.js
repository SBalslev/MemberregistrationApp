/**
 * ISS Sportsskytter Portal — table enhancements
 * Adds client-side sort + live row-filter to all .portal-table elements.
 * Zero dependencies. Works on touch / mobile.
 */
(function () {
  'use strict';

  /* -----------------------------------------------------------------------
   * Utility: detect cell value type for correct comparison
   * ----------------------------------------------------------------------- */
  function cellValue(cell) {
    // data-sort-value overrides (set by PHP for e.g. raw dates)
    if (cell.dataset.sortValue !== undefined) return cell.dataset.sortValue;
    return cell.textContent.trim();
  }

  function compareValues(a, b) {
    // Dates in dd/mm/yyyy format — check BEFORE numbers to avoid digit-stripping confusion
    var da = parseDMY(a), db = parseDMY(b);
    if (da && db) return da - db;

    // Numbers (includes currency "1.234,56 kr." — strip non-numeric except decimal)
    var na = parseFloat(a.replace(/[^\d,.-]/g, '').replace(',', '.'));
    var nb = parseFloat(b.replace(/[^\d,.-]/g, '').replace(',', '.'));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;

    // Fallback: locale string compare
    return a.localeCompare(b, 'da', { sensitivity: 'base' });
  }

  function parseDMY(s) {
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  }

  /* -----------------------------------------------------------------------
   * Sort indicator markup
   * ----------------------------------------------------------------------- */
  var ICON_NONE = '<span class="sort-icon" aria-hidden="true">⇅</span>';
  var ICON_ASC  = '<span class="sort-icon asc" aria-hidden="true">▲</span>';
  var ICON_DESC = '<span class="sort-icon desc" aria-hidden="true">▼</span>';

  /* -----------------------------------------------------------------------
   * Initialise one table
   * ----------------------------------------------------------------------- */
  function initTable(table) {
    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;

    var headers = Array.from(thead.querySelectorAll('th'));
    var sortState = { col: -1, dir: 0 }; // dir: 0=none, 1=asc, -1=desc

    headers.forEach(function (th, colIdx) {
      // Skip columns explicitly marked no-sort
      if (th.dataset.noSort !== undefined) return;

      th.classList.add('sortable');
      th.setAttribute('tabindex', '0');
      th.setAttribute('role', 'columnheader');
      th.setAttribute('aria-sort', 'none');
      th.insertAdjacentHTML('beforeend', ICON_NONE);

      function doSort() {
        var newDir = (sortState.col === colIdx) ? -sortState.dir || 1 : 1;
        sortState.col = colIdx;
        sortState.dir = newDir;
        applySort(table, tbody, headers, colIdx, newDir);
      }

      th.addEventListener('click', doSort);
      th.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doSort(); }
      });
    });

    // Default: sort by first sortable column — descending if table has data-default-desc
    var firstSortable = headers.findIndex(function (th) { return th.dataset.noSort === undefined; });
    if (firstSortable >= 0) {
      var defaultDir = table.dataset.defaultDesc !== undefined ? -1 : 1;
      sortState.col = firstSortable;
      sortState.dir = defaultDir;
      applySort(table, tbody, headers, firstSortable, defaultDir);
    }
  }

  function applySort(table, tbody, headers, colIdx, dir) {
    // Update ARIA + icons
    headers.forEach(function (th, i) {
      var icon = th.querySelector('.sort-icon');
      if (!icon) return;
      if (i === colIdx) {
        icon.outerHTML = dir === 1 ? ICON_ASC : ICON_DESC;
        th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
      } else {
        icon.outerHTML = ICON_NONE;
        th.setAttribute('aria-sort', 'none');
      }
    });

    var rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort(function (ra, rb) {
      var ca = ra.cells[colIdx], cb = rb.cells[colIdx];
      if (!ca || !cb) return 0;
      var diff = compareValues(cellValue(ca), cellValue(cb));
      return dir * diff;
    });

    rows.forEach(function (r) { tbody.appendChild(r); });
  }

  /* -----------------------------------------------------------------------
   * Live filter: hook onto existing search inputs
   * Inputs with data-filter-table="#tableId" (or nearest .portal-table)
   * filter rows client-side on every keystroke.
   * ----------------------------------------------------------------------- */
  function initFilter(input) {
    var tableSelector = input.dataset.filterTable;
    var table = tableSelector
      ? document.querySelector(tableSelector)
      : input.closest('.portal-card')?.querySelector('.portal-table');
    if (!table) return;

    var tbody = table.querySelector('tbody');
    if (!tbody) return;

    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      Array.from(tbody.querySelectorAll('tr')).forEach(function (row) {
        var text = row.textContent.toLowerCase();
        row.classList.toggle('portal-row-hidden', !!(q && !text.includes(q)));
      });
    });
  }

  /* -----------------------------------------------------------------------
   * Boot on DOMContentLoaded
   * ----------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.portal-table').forEach(initTable);
    document.querySelectorAll('input[type="search"], input[data-filter-table]').forEach(initFilter);
    initContactToggle();
    initEmailExport();
    initConfirmReset();
    initAnnouncementEditor();
    initAnnouncementArchive();
  });

  /* -----------------------------------------------------------------------
   * Confirm dialog for password reset forms
   * ----------------------------------------------------------------------- */
  function initConfirmReset() {
    document.querySelectorAll('form.js-confirm-reset').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        var name = form.dataset.memberName || 'medlemmet';
        if (!confirm('Nulstil adgangskode for ' + name + '?')) {
          e.preventDefault();
        }

        function initAnnouncementArchive() {
          document.querySelectorAll('form.js-confirm-announcement-archive').forEach(function (form) {
            form.addEventListener('submit', function (event) {
              var title = form.dataset.announcementTitle || 'beskeden';
              if (!confirm('Arkivér "' + title + '"?')) {
                event.preventDefault();
              }
            });
          });
        }

        function initAnnouncementEditor() {
          var form = document.getElementById('announcement-form');
          if (!form) return;

          var title = document.getElementById('announcement-title');
          var body = document.getElementById('announcement-body');
          var priority = document.getElementById('announcement-priority');
          var imageInput = document.getElementById('announcement-image');
          var preview = document.getElementById('announcement-preview');
          var previewImage = document.getElementById('announcement-preview-image');
          var previewTitle = document.getElementById('announcement-preview-title');
          var previewBody = document.getElementById('announcement-preview-body');
          var previewKicker = document.getElementById('announcement-preview-kicker');
          var objectUrl = '';

          function updatePreview() {
            previewTitle.textContent = title.value.trim() || 'Din titel vises her';
            previewBody.textContent = body.value.trim() || 'Din information vises her.';
            previewKicker.textContent = priority.value === 'important'
              ? 'Vigtig besked fra ISS'
              : 'Besked fra ISS';
          }

          title.addEventListener('input', updatePreview);
          body.addEventListener('input', updatePreview);
          priority.addEventListener('change', updatePreview);
          imageInput.addEventListener('change', function () {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            var file = imageInput.files[0];
            if (!file) return;
            objectUrl = URL.createObjectURL(file);
            previewImage.src = objectUrl;
            previewImage.classList.remove('hidden');
            preview.classList.remove('no-image');
          });
        }
      });
    });
  }

  /* -----------------------------------------------------------------------
   * Contact column reveal/hide toggle (members list)
   * ----------------------------------------------------------------------- */
  function initContactToggle() {
    var btn = document.getElementById('toggleContactBtn');
    if (!btn) return;

    var revealed  = false;
    var hideTimer = null;

    btn.addEventListener('click', function () {
      revealed = !revealed;
      var cols = document.querySelectorAll('.contact-masked');

      if (revealed) {
        document.querySelectorAll('td.contact-col').forEach(function (td) { td.classList.remove('contact-masked'); });
        btn.textContent = '🙈 Skjul kontakt';
        btn.classList.add('portal-btn-warning');
        hideTimer = setTimeout(function () {
          document.querySelectorAll('td.contact-col').forEach(function (td) { td.classList.add('contact-masked'); });
          btn.textContent = '👁 Vis kontakt';
          btn.classList.remove('portal-btn-warning');
          revealed = false;
        }, 30000);
      } else {
        clearTimeout(hideTimer);
        document.querySelectorAll('td.contact-col').forEach(function (td) { td.classList.add('contact-masked'); });
        btn.textContent = '👁 Vis kontakt';
        btn.classList.remove('portal-btn-warning');
      }
    });
  }

  /* -----------------------------------------------------------------------
   * Email export — fetches all matching emails and copies to clipboard
   * ----------------------------------------------------------------------- */
  function initEmailExport() {
    var btn = document.getElementById('exportEmailsBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
      btn.disabled    = true;
      btn.textContent = '⏳ Henter…';

      var params = new URLSearchParams(window.location.search);
      var csrf   = document.querySelector('input[name="csrf_token"]');
      if (!csrf) { btn.disabled = false; btn.textContent = '📋 Kopier e-mails'; return; }

      var body = new FormData();
      body.append('csrf_token',    csrf.value);
      body.append('action',        'export_emails');
      body.append('filter_status', params.get('status') || '');
      body.append('filter_type',   params.get('type')   || '');
      body.append('filter_q',      params.get('q')      || '');

      fetch(window.location.pathname, { method: 'POST', body: body })
        .then(function (r) { return r.json(); })
        .then(function (emails) {
          if (!emails.length) {
            btn.textContent = '⚠ Ingen e-mails';
            setTimeout(function () { btn.textContent = '📋 Kopier e-mails'; btn.disabled = false; }, 2000);
            return;
          }
          navigator.clipboard.writeText(emails.join(', ')).then(function () {
            btn.textContent = '✓ ' + emails.length + ' kopieret!';
            btn.classList.add('portal-btn-warning');
            setTimeout(function () {
              btn.textContent = '📋 Kopier e-mails';
              btn.classList.remove('portal-btn-warning');
              btn.disabled = false;
            }, 3000);
          });
        })
        .catch(function () {
          btn.textContent = '⚠ Fejl';
          setTimeout(function () { btn.textContent = '📋 Kopier e-mails'; btn.disabled = false; }, 2000);
        });
    });
  }

})();
