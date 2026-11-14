/* Runs before the page paints so the chosen theme never flashes. */
(function () {
  var themes = ['dark', 'light', 'winter'];
  var t = null;
  try { t = localStorage.getItem('wynn-theme'); } catch (e) {}
  if (themes.indexOf(t) < 0) {
    t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', t);
  window.WynnTheme = {
    list: themes,
    get: function () { return document.documentElement.getAttribute('data-theme'); },
    set: function (n) {
      if (themes.indexOf(n) < 0) return;
      document.documentElement.setAttribute('data-theme', n);
      try { localStorage.setItem('wynn-theme', n); } catch (e) {}
    }
  };
})();
