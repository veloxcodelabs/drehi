/**
 * Martitony Style Lab - E-commerce Embed Script
 * Enables virtual try-on on external stores (OpenCart, Next.js, Shopify, custom, etc.)
 */
(function () {
  'use strict';

  // Prevent multiple executions of the root script
  if (window.__mslEmbedInitialized) return;
  window.__mslEmbedInitialized = true;

  // Locate the script tag that included embed.js
  var scriptTag = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('embed.js') !== -1) {
        return scripts[i];
      }
    }
    return null;
  })();

  var defaultCode = (scriptTag && (scriptTag.getAttribute('data-code') || scriptTag.getAttribute('data-k'))) || 'julia';
  var customSelector = scriptTag ? scriptTag.getAttribute('data-selector') : null;

  var originUrl = (function () {
    if (scriptTag && scriptTag.src) {
      try {
        var u = new URL(scriptTag.src);
        return u.origin;
      } catch (e) {}
    }
    return window.location.origin;
  })();

  // Standard OpenCart and common e-commerce selectors for main product photo
  var defaultSelectors = [
    '.product-image img',
    '.thumbnails .thumbnail img',
    'ul.thumbnails li:first-child a img',
    'ul.thumbnails li:first-child img',
    '#image',
    '.product-info .image img',
    '.main-image img',
    '.product-gallery img',
    '.product__media img',
    '[data-product-image] img',
    '.swiper-slide-active img'
  ];

  var styleInjected = false;
  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;

    var css = [
      '.msl-no-scroll { overflow: hidden !important; }',
      '.msl-tryon-container { position: relative !important; }',
      '.msl-tryon-btn {',
      '  position: absolute !important;',
      '  bottom: 12px !important;',
      '  right: 12px !important;',
      '  z-index: 30 !important;',
      '  display: inline-flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  gap: 6px !important;',
      '  background: #ffffff !important;',
      '  color: #111827 !important;',
      '  border: 1px solid #e5e7eb !important;',
      '  border-radius: 6px !important;',
      '  padding: 8px 14px !important;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;',
      '  font-size: 13px !important;',
      '  font-weight: 500 !important;',
      '  line-height: 1.2 !important;',
      '  text-decoration: none !important;',
      '  cursor: pointer !important;',
      '  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;',
      '  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;',
      '  box-sizing: border-box !important;',
      '  outline: none !important;',
      '}',
      '.msl-tryon-btn:hover {',
      '  background: #f9fafb !important;',
      '  border-color: #d1d5db !important;',
      '  color: #000000 !important;',
      '}',
      '.msl-tryon-btn:active {',
      '  background: #f3f4f6 !important;',
      '}',
      '.msl-modal-backdrop {',
      '  position: fixed !important;',
      '  top: 0 !important;',
      '  left: 0 !important;',
      '  width: 100vw !important;',
      '  height: 100vh !important;',
      '  z-index: 2147483647 !important;',
      '  background: rgba(0, 0, 0, 0.65) !important;',
      '  backdrop-filter: blur(2px) !important;',
      '  display: flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  padding: 16px !important;',
      '  box-sizing: border-box !important;',
      '}',
      '.msl-modal-window {',
      '  width: 95% !important;',
      '  max-width: 1120px !important;',
      '  height: 90vh !important;',
      '  max-height: 880px !important;',
      '  background: #ffffff !important;',
      '  border-radius: 14px !important;',
      '  overflow: hidden !important;',
      '  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;',
      '  display: flex !important;',
      '  flex-direction: column !important;',
      '  position: relative !important;',
      '  box-sizing: border-box !important;',
      '}',
      '.msl-modal-header {',
      '  height: 48px !important;',
      '  padding: 0 16px !important;',
      '  background: #ffffff !important;',
      '  border-bottom: 1px solid #f3f4f6 !important;',
      '  display: flex !important;',
      '  align-items: center !important;',
      '  justify-content: space-between !important;',
      '  flex-shrink: 0 !important;',
      '}',
      '.msl-modal-title {',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;',
      '  font-size: 13px !important;',
      '  font-weight: 600 !important;',
      '  color: #111827 !important;',
      '  display: flex !important;',
      '  align-items: center !important;',
      '  gap: 6px !important;',
      '}',
      '.msl-modal-subtitle {',
      '  font-weight: 400 !important;',
      '  color: #6b7280 !important;',
      '  font-size: 12px !important;',
      '}',
      '.msl-modal-close {',
      '  background: transparent !important;',
      '  border: none !important;',
      '  font-size: 24px !important;',
      '  line-height: 1 !important;',
      '  color: #6b7280 !important;',
      '  cursor: pointer !important;',
      '  padding: 4px 8px !important;',
      '  border-radius: 4px !important;',
      '  transition: color 0.15s, background-color 0.15s !important;',
      '}',
      '.msl-modal-close:hover {',
      '  color: #111827 !important;',
      '  background-color: #f3f4f6 !important;',
      '}',
      '.msl-modal-body {',
      '  flex: 1 !important;',
      '  width: 100% !important;',
      '  height: calc(100% - 48px) !important;',
      '  overflow: hidden !important;',
      '  position: relative !important;',
      '  background: #ffffff !important;',
      '}',
      '.msl-modal-iframe {',
      '  width: 100% !important;',
      '  height: 100% !important;',
      '  border: none !important;',
      '  display: block !important;',
      '}',
      '@media (max-width: 640px) {',
      '  .msl-modal-backdrop { padding: 0 !important; }',
      '  .msl-modal-window {',
      '    width: 100% !important;',
      '    height: 100% !important;',
      '    max-width: 100% !important;',
      '    max-height: 100% !important;',
      '    border-radius: 0 !important;',
      '  }',
      '  .msl-tryon-btn {',
      '    bottom: 10px !important;',
      '    right: 10px !important;',
      '    font-size: 12px !important;',
      '    padding: 7px 12px !important;',
      '  }',
      '}'
    ].join('\n');

    var styleEl = document.createElement('style');
    styleEl.type = 'text/css';
    styleEl.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function toAbsoluteUrl(url) {
    if (!url) return '';
    try {
      return new URL(url, window.location.href).href;
    } catch (e) {
      return url;
    }
  }

  function getLargeImageUrl(img) {
    if (!img) return '';
    var zoom = img.getAttribute('data-zoom-image') ||
               img.getAttribute('data-zoom') ||
               img.getAttribute('data-large') ||
               img.getAttribute('data-large-image') ||
               img.getAttribute('data-orig-file') ||
               img.getAttribute('data-full-image') ||
               img.getAttribute('data-high-res');
    if (zoom && zoom.trim()) {
      return toAbsoluteUrl(zoom.trim());
    }

    var parentAnchor = img.closest('a');
    if (parentAnchor && parentAnchor.href) {
      var href = parentAnchor.href.trim();
      if (/\.(jpe?g|png|webp|gif|heic)(\?.*)?$/i.test(href)) {
        return toAbsoluteUrl(href);
      }
    }

    var currentSrc = img.currentSrc || img.src;
    return toAbsoluteUrl(currentSrc || '');
  }

  var modalContainer = null;
  var modalIframe = null;

  function ensureModal() {
    if (modalContainer) return;

    injectStyles();

    modalContainer = document.createElement('div');
    modalContainer.className = 'msl-modal-backdrop';
    modalContainer.setAttribute('role', 'dialog');
    modalContainer.setAttribute('aria-modal', 'true');
    modalContainer.style.display = 'none';

    modalContainer.innerHTML = [
      '<div class="msl-modal-window">',
        '<div class="msl-modal-header">',
          '<div class="msl-modal-title">',
            '<span>Martitony Style Lab</span>',
            '<span class="msl-modal-subtitle">· Онлайн проба</span>',
          '</div>',
          '<button type="button" class="msl-modal-close" aria-label="Затвори">&times;</button>',
        '</div>',
        '<div class="msl-modal-body">',
          '<iframe class="msl-modal-iframe" allow="camera" allowfullscreen></iframe>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(modalContainer);

    modalIframe = modalContainer.querySelector('.msl-modal-iframe');
    var closeBtn = modalContainer.querySelector('.msl-modal-close');

    closeBtn.addEventListener('click', closeModal);
    modalContainer.addEventListener('click', function (e) {
      if (e.target === modalContainer) {
        closeModal();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (modalContainer && modalContainer.style.display !== 'none') {
          closeModal();
        }
      }
    });
  }

  function openModal(imgUrl) {
    ensureModal();
    var targetUrl = originUrl + '/?k=' + encodeURIComponent(defaultCode) +
                    '&g=' + encodeURIComponent(imgUrl) +
                    '&embed=1';
    modalIframe.src = targetUrl;
    modalContainer.style.display = 'flex';
    document.body.classList.add('msl-no-scroll');
  }

  function closeModal() {
    if (!modalContainer) return;
    modalContainer.style.display = 'none';
    if (modalIframe) {
      modalIframe.src = 'about:blank';
    }
    document.body.classList.remove('msl-no-scroll');
  }

  function attachButtonToImage(img) {
    if (!img) return;
    var parent = img.parentElement;
    if (!parent) return;

    // Check if button already exists in parent
    if (parent.querySelector('.msl-tryon-btn') || parent.getAttribute('data-msl-has-button') === '1') {
      img.setAttribute('data-msl-attached', '1');
      return;
    }

    injectStyles();

    // Ensure parent container has positioning so button sits over the image
    var pos = window.getComputedStyle(parent).position;
    if (!pos || pos === 'static') {
      parent.classList.add('msl-tryon-container');
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'msl-tryon-btn';
    btn.textContent = 'Пробвай онлайн';

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var largeImg = getLargeImageUrl(img);
      if (largeImg) {
        openModal(largeImg);
      }
    });

    parent.appendChild(btn);
    parent.setAttribute('data-msl-has-button', '1');
    img.setAttribute('data-msl-attached', '1');
  }

  function scanAndAttach() {
    var selectors = customSelector ? [customSelector] : defaultSelectors;
    for (var s = 0; s < selectors.length; s++) {
      try {
        var imgs = document.querySelectorAll(selectors[s]);
        for (var i = 0; i < imgs.length; i++) {
          var img = imgs[i];
          if (img.getAttribute('data-msl-attached') === '1') continue;
          attachButtonToImage(img);
        }
      } catch (err) {
        console.warn('MSL selector error:', err);
      }
    }
  }

  // MutationObserver for Next.js / dynamic SPA product catalogs
  var debounceTimer = null;
  var observer = null;
  function setupObserver() {
    if (observer || typeof MutationObserver === 'undefined') return;
    var target = document.body || document.documentElement;
    if (!target) return;

    observer = new MutationObserver(function () {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scanAndAttach, 120);
    });

    observer.observe(target, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      scanAndAttach();
      setupObserver();
    });
  } else {
    scanAndAttach();
    setupObserver();
  }
})();
