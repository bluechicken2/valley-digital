// ================================================
// XRAYNEWS — Cinematic Loader
// js/loader.js
// ================================================
(function () {
  'use strict';

  var _overlay = null;
  var _cbs = [];

  var TAGLINE = 'Initializing truth engine...';
  var STATUS = [
    '[\u2713] Connecting to global feeds...',
    '[\u2713] Loading country data...',
    '[\u2713] Calibrating verification engine...',
    '[\u2713] Ready.'
  ];

  function _build() {
    var el = document.createElement('div');
    el.id = 'gwl';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', 'Loading XrayNews');
    el.innerHTML = [
      '<div class="gwl-wrap">',
        '<div class="gwl-globe-rig">',
          '<div class="gwl-orbit gwl-o1"><span class="gwl-bead"></span></div>',
          '<div class="gwl-orbit gwl-o2"><span class="gwl-bead"></span></div>',
          '<div class="gwl-orbit gwl-o3"><span class="gwl-bead"></span></div>',
          '<div class="gwl-core">&#127760;</div>',
        '</div>',
        '<div class="gwl-logo">XRAYNEWS</div>',
        '<div class="gwl-tagline" id="gwl-tagline"></div>',
        '<div class="gwl-status" id="gwl-status"></div>',
      '</div>',
      '<div class="gwl-prog-track">',
        '<div class="gwl-prog-fill" id="gwl-prog"></div>',
      '</div>'
    ].join('');
    document.body.insertBefore(el, document.body.firstChild);
    _overlay = el;
  }

  function _type(el, text, cb) {
    var i = 0;
    el.textContent = '';
    var tid = setInterval(function () {
      if (i < text.length) { el.textContent += text[i++]; }
      else { clearInterval(tid); if (cb) cb(); }
    }, 36);
  }

  function _progress(el, ms) {
    var s = null;
    function step(ts) {
      if (!s) s = ts;
      var p = Math.min((ts - s) / ms, 1);
      var e = 1 - Math.pow(1 - p, 2.5);
      el.style.width = (e * 100) + '%';
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function _lines(container, lines, delay) {
    lines.forEach(function (line, i) {
      setTimeout(function () {
        var d = document.createElement('div');
        d.className = 'gwl-line';
        d.textContent = line;
        container.appendChild(d);
        setTimeout(function () { d.classList.add('gwl-line-in'); }, 30);
      }, delay + i * 510);
    });
  }

  function show() {
    if (document.body) {
      _doShow();
    } else {
      document.addEventListener('DOMContentLoaded', _doShow);
    }
  }

  function _doShow() {
    if (_overlay) return;
    _build();
    var tagEl  = document.getElementById('gwl-tagline');
    var stEl   = document.getElementById('gwl-status');
    var progEl = document.getElementById('gwl-prog');
    _progress(progEl, 2900);
    setTimeout(function () {
      _type(tagEl, TAGLINE, function () {
        _lines(stEl, STATUS, 60);
      });
    }, 380);
  }

  function hide() {
    if (!_overlay) { _fire(); return; }
    _overlay.classList.add('gwl-out');
    setTimeout(function () {
      try { _overlay.parentNode.removeChild(_overlay); } catch (e) {}
      _overlay = null;
      _fire();
    }, 650);
  }

  function onComplete(cb) { _cbs.push(cb); }

  function _fire() {
    _cbs.forEach(function (cb) { try { cb(); } catch (e) {} });
    _cbs = [];
  }

  window.Loader = { show: show, hide: hide, onComplete: onComplete };
})();
