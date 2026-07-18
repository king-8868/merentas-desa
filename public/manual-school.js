/* Panduan Pengurus Sekolah — standalone manual page behaviour.
   Vanilla JS only, no framework, no build step. This script never reads
   account data, never calls an authentication or write API, and never
   touches localStorage keys used by the main app (see app.js) — it only
   owns 'md-lang' (language preference, shared convention with
   docs/学校使用手册.html) and 'md-manual-checklist' (this page's own
   checklist state). */

(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Trilingual switch (zh / en / ms) ---------- */
  var PAGE_TITLES = {
    zh: 'PANDUAN PENGGUNA PENGURUS SEKOLAH · 学校管理员使用手册 · Merentas Desa 2026',
    en: 'PANDUAN PENGGUNA PENGURUS SEKOLAH · School Manager User Guide · Merentas Desa 2026',
    ms: 'PANDUAN PENGGUNA PENGURUS SEKOLAH · Sistem Merentas Desa 2026',
  };
  function setLang(lang) {
    document.body.setAttribute('data-lang', lang);
    ['zh', 'en', 'ms'].forEach(function (code) {
      var btn = document.getElementById('btn-lang-' + code);
      if (btn) {
        btn.classList.toggle('active', code === lang);
        btn.setAttribute('aria-pressed', code === lang ? 'true' : 'false');
      }
    });
    try { localStorage.setItem('md-lang', lang); } catch (e) { /* private mode / storage disabled */ }
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh' : (lang === 'ms' ? 'ms' : 'en'));
    if (PAGE_TITLES[lang]) document.title = PAGE_TITLES[lang];
    // Generic attribute-translation hook: any element carrying
    // data-alt-zh/en/ms gets its alt swapped (used by the hero poster <img>,
    // whose accessible description must also change with the language).
    document.querySelectorAll('[data-alt-zh]').forEach(function (el) {
      var val = el.getAttribute('data-alt-' + lang);
      if (val) el.setAttribute('alt', val);
    });
  }
  window.setLang = setLang;

  (function initLang() {
    var saved = 'zh';
    try { saved = localStorage.getItem('md-lang') || 'zh'; } catch (e) { /* ignore */ }
    if (['zh', 'en', 'ms'].indexOf(saved) === -1) saved = 'zh';
    setLang(saved);
  })();

  /* ---------- Reading progress bar ---------- */
  var progressBar = document.getElementById('readingProgress');
  function updateProgress() {
    if (!progressBar) return;
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)) : 0;
    progressBar.style.width = pct + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

  /* ---------- Scroll reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    // No IntersectionObserver, or the user asked for reduced motion:
    // show everything immediately rather than leaving content invisible.
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Sticky side nav: mobile toggle ---------- */
  var sideNav = document.getElementById('sideNav');
  var navToggle = document.getElementById('navToggle');
  var navBackdrop = document.getElementById('navBackdrop');

  function openNav() {
    if (!sideNav) return;
    sideNav.classList.add('open');
    if (navBackdrop) navBackdrop.classList.add('open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'true');
  }
  function closeNav() {
    if (!sideNav) return;
    sideNav.classList.remove('open');
    if (navBackdrop) navBackdrop.classList.remove('open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  }
  if (navToggle) {
    navToggle.addEventListener('click', function () {
      if (sideNav.classList.contains('open')) closeNav(); else openNav();
    });
  }
  if (navBackdrop) navBackdrop.addEventListener('click', closeNav);
  if (sideNav) {
    sideNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
  }

  /* ---------- Scroll spy ---------- */
  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.side-nav a[href^="#"]'));
  function setActiveLink(id) {
    navLinks.forEach(function (a) {
      var isActive = a.getAttribute('href') === '#' + id;
      a.classList.toggle('active', isActive);
      if (isActive) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }
  if ('IntersectionObserver' in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      var visible = entries.filter(function (e) { return e.isIntersecting; });
      if (visible.length) {
        visible.sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
        setActiveLink(visible[0].target.id);
      }
    }, { rootMargin: '-20% 0px -70% 0px', threshold: [0, 1] });
    sections.forEach(function (sec) { spy.observe(sec); });
  }

  /* ---------- Accordion FAQ ---------- */
  var faqButtons = document.querySelectorAll('.faq-question');
  faqButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      var panelId = btn.getAttribute('aria-controls');
      var panel = panelId ? document.getElementById(panelId) : null;
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (panel) panel.setAttribute('data-open', expanded ? 'false' : 'true');
    });
  });

  window.expandAllFaq = function () {
    faqButtons.forEach(function (btn) {
      var panelId = btn.getAttribute('aria-controls');
      var panel = panelId ? document.getElementById(panelId) : null;
      btn.setAttribute('aria-expanded', 'true');
      if (panel) panel.setAttribute('data-open', 'true');
    });
  };

  /* ---------- Toast ---------- */
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('visible'); }, 2200);
  }
  window.showToast = showToast;

  /* ---------- Copy URL ---------- */
  var copyBtns = document.querySelectorAll('[data-action="copy-url"]');
  copyBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = window.location.href;
      var lang = document.body.getAttribute('data-lang') || 'zh';
      var messages = {
        zh: '链接已复制',
        en: 'Link copied',
        ms: 'Pautan disalin',
      };
      var fallbackMessages = {
        zh: '无法自动复制，请手动复制网址',
        en: 'Could not copy automatically — please copy the URL manually',
        ms: 'Tidak dapat menyalin secara automatik — sila salin pautan secara manual',
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          showToast(messages[lang]);
        }).catch(function () {
          showToast(fallbackMessages[lang]);
        });
      } else {
        showToast(fallbackMessages[lang]);
      }
    });
  });

  /* ---------- Back to top / print (floating buttons) ---------- */
  var fabTop = document.getElementById('fabTop');
  function toggleFab() {
    if (!fabTop) return;
    fabTop.classList.toggle('visible', (window.scrollY || document.documentElement.scrollTop) > 480);
  }
  window.addEventListener('scroll', toggleFab, { passive: true });
  toggleFab();
  if (fabTop) {
    fabTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  }

  var printBtns = document.querySelectorAll('[data-action="print"]');
  printBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      // Printing every FAQ collapsed would hide answers on paper - the print
      // stylesheet also forces max-height:none, but expanding aria-expanded
      // too keeps on-screen state consistent if the user returns to the tab.
      window.expandAllFaq();
      window.print();
    });
  });

  /* ---------- Hero spotlight (mouse-follow, desktop only, motion-safe) ---------- */
  var heroSpot = document.querySelector('.hero-spot');
  if (heroSpot && !prefersReducedMotion && window.matchMedia('(hover: hover)').matches) {
    var hero = document.querySelector('.hero');
    hero.addEventListener('mousemove', function (e) {
      var rect = hero.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 100;
      var y = ((e.clientY - rect.top) / rect.height) * 100;
      heroSpot.style.setProperty('--mx', x + '%');
      heroSpot.style.setProperty('--my', y + '%');
    });
  }

  /* ---------- Checklist (localStorage, browser-local only — not a system record) ---------- */
  var CHECKLIST_KEY = 'md-manual-checklist';
  var checklistBoxes = document.querySelectorAll('.checklist input[type="checkbox"]');
  function loadChecklistState() {
    try {
      var raw = localStorage.getItem(CHECKLIST_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }
  function saveChecklistState(state) {
    try { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function updateChecklistProgress() {
    var progressEl = document.getElementById('checklistProgress');
    if (!progressEl) return;
    var total = checklistBoxes.length;
    var done = Array.prototype.filter.call(checklistBoxes, function (cb) { return cb.checked; }).length;
    var lang = document.body.getAttribute('data-lang') || 'zh';
    var templates = {
      zh: done + ' / ' + total + ' 项已完成',
      en: done + ' / ' + total + ' completed',
      ms: done + ' / ' + total + ' selesai',
    };
    progressEl.textContent = templates[lang];
  }
  var checklistState = loadChecklistState();
  checklistBoxes.forEach(function (cb) {
    var key = cb.id;
    if (checklistState[key]) {
      cb.checked = true;
      cb.closest('li').classList.add('checked');
    }
    cb.addEventListener('change', function () {
      checklistState[key] = cb.checked;
      saveChecklistState(checklistState);
      cb.closest('li').classList.toggle('checked', cb.checked);
      updateChecklistProgress();
    });
  });
  updateChecklistProgress();
  // Keep the progress caption's language in sync when the user switches
  // language after having already ticked some boxes.
  var origSetLang = window.setLang;
  window.setLang = function (lang) {
    origSetLang(lang);
    updateChecklistProgress();
  };

})();
