/**
 * YATAI Gallery - Menu Page Photo Viewer
 *
 * Features:
 * - Horizontal swipe with CSS scroll-snap
 * - Double-tap to zoom (mobile)
 * - Tap to zoom (desktop fallback)
 * - Left/right navigation arrows
 * - Dot navigation
 * - Page indicator (1/9)
 * - First page eager, rest lazy
 */

(function () {
  'use strict';

  var TOTAL_PAGES = 9;
  var DOUBLE_TAP_DELAY = 300;

  var gallery = document.getElementById('gallery');
  var dotsContainer = document.getElementById('dots');
  var currentPageEl = document.querySelector('.current-page');
  var totalPagesEl = document.querySelector('.total-pages');
  var zoomOverlay = document.getElementById('zoomOverlay');
  var zoomImage = document.getElementById('zoomImage');
  var zoomClose = document.getElementById('zoomClose');
  var navLeft = document.getElementById('navLeft');
  var navRight = document.getElementById('navRight');

  totalPagesEl.textContent = TOTAL_PAGES;

  // --- Build slides and dots ---
  function buildGallery() {
    var fragment = document.createDocumentFragment();
    var dotsFragment = document.createDocumentFragment();

    for (var i = 1; i <= TOTAL_PAGES; i++) {
      var slide = document.createElement('div');
      slide.className = 'gallery-slide';
      slide.setAttribute('data-page', i);

      var picture = document.createElement('picture');

      var sourceWebp = document.createElement('source');
      sourceWebp.srcset = 'menu-pages/page-' + String(i).padStart(2, '0') + '.webp';
      sourceWebp.type = 'image/webp';

      var img = document.createElement('img');
      img.src = 'menu-pages/page-' + String(i).padStart(2, '0') + '.jpg';
      img.alt = 'Menu page ' + i;
      img.className = 'loading';
      img.loading = i === 1 ? 'eager' : 'lazy';
      img.decoding = 'async';

      img.addEventListener('load', function () {
        this.classList.remove('loading');
      });

      picture.appendChild(sourceWebp);
      picture.appendChild(img);
      slide.appendChild(picture);
      fragment.appendChild(slide);

      var dot = document.createElement('button');
      dot.className = 'gallery-dot' + (i === 1 ? ' active' : '');
      dot.setAttribute('aria-label', 'Page ' + i);
      dot.setAttribute('data-page', i);
      dotsFragment.appendChild(dot);
    }

    gallery.appendChild(fragment);
    dotsContainer.appendChild(dotsFragment);
  }

  // --- Current page tracking ---
  var currentPage = 1;

  function updateIndicator(pageNum) {
    if (pageNum === currentPage) return;
    currentPage = pageNum;
    currentPageEl.textContent = pageNum;

    var dots = dotsContainer.querySelectorAll('.gallery-dot');
    for (var j = 0; j < dots.length; j++) {
      if (j === pageNum - 1) {
        dots[j].classList.add('active');
      } else {
        dots[j].classList.remove('active');
      }
    }

    updateArrowVisibility();
  }

  // --- Arrow visibility ---
  function updateArrowVisibility() {
    if (currentPage <= 1) {
      navLeft.classList.add('hidden');
    } else {
      navLeft.classList.remove('hidden');
    }

    if (currentPage >= TOTAL_PAGES) {
      navRight.classList.add('hidden');
    } else {
      navRight.classList.remove('hidden');
    }
  }

  // --- Scroll tracking ---
  var scrollTimeout = null;
  function onGalleryScroll() {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(function () {
      scrollTimeout = null;
      var scrollLeft = gallery.scrollLeft;
      var slideWidth = gallery.clientWidth;
      var page = Math.round(scrollLeft / slideWidth) + 1;
      page = Math.max(1, Math.min(page, TOTAL_PAGES));
      updateIndicator(page);
    }, 50);
  }

  gallery.addEventListener('scroll', onGalleryScroll, { passive: true });

  // --- Navigate to page ---
  function goToPage(page) {
    page = Math.max(1, Math.min(page, TOTAL_PAGES));
    var slideWidth = gallery.clientWidth;
    gallery.scrollTo({ left: (page - 1) * slideWidth, behavior: 'smooth' });
  }

  // --- Arrow click ---
  navLeft.addEventListener('click', function (e) {
    e.stopPropagation();
    goToPage(currentPage - 1);
  });

  navRight.addEventListener('click', function (e) {
    e.stopPropagation();
    goToPage(currentPage + 1);
  });

  // --- Dot click ---
  dotsContainer.addEventListener('click', function (e) {
    var dot = e.target.closest('.gallery-dot');
    if (!dot) return;
    var page = parseInt(dot.getAttribute('data-page'), 10);
    goToPage(page);
  });

  // --- Keyboard navigation ---
  document.addEventListener('keydown', function (e) {
    if (zoomOverlay.classList.contains('visible')) {
      if (e.key === 'Escape') closeZoom();
      return;
    }
    if (e.key === 'ArrowLeft') goToPage(currentPage - 1);
    if (e.key === 'ArrowRight') goToPage(currentPage + 1);
  });

  // --- Zoom logic ---
  function openZoom(imgSrc) {
    zoomImage.src = imgSrc;
    zoomOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeZoom() {
    zoomOverlay.classList.remove('visible');
    document.body.style.overflow = '';
    zoomImage.src = '';
  }

  zoomClose.addEventListener('click', closeZoom);
  zoomOverlay.addEventListener('click', function (e) {
    if (e.target === zoomOverlay || e.target === document.querySelector('.zoom-container')) {
      closeZoom();
    }
  });

  // --- Double-tap detection for mobile ---
  var lastTapTime = 0;
  var lastTapSlide = null;

  gallery.addEventListener('click', function (e) {
    // Ignore clicks on arrows
    if (e.target.closest('.nav-arrow')) return;

    var slide = e.target.closest('.gallery-slide');
    if (!slide) return;

    var img = slide.querySelector('img');
    if (!img) return;

    var now = Date.now();
    var isDoubleTap = (now - lastTapTime < DOUBLE_TAP_DELAY) && (lastTapSlide === slide);

    if (isDoubleTap) {
      // Double-tap: open zoom
      lastTapTime = 0;
      lastTapSlide = null;
      openZoom(img.src);
    } else {
      // First tap: wait for potential second tap
      lastTapTime = now;
      lastTapSlide = slide;

      // On desktop (no touch), single click also opens zoom after delay
      if (!('ontouchstart' in window)) {
        setTimeout(function () {
          if (lastTapTime === now) {
            lastTapTime = 0;
            lastTapSlide = null;
            openZoom(img.src);
          }
        }, DOUBLE_TAP_DELAY);
      }
    }
  });

  // --- Init ---
  buildGallery();
  updateArrowVisibility();
})();
