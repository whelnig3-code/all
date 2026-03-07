/**
 * YATAI Cart System
 *
 * - Item detail popup: photo, name, description (detailed), price, qty selector
 * - Cart popup: items shown in Korean for staff to read
 * - sessionStorage-based (resets per visit)
 */
var Cart = (function () {
  'use strict';

  var STORAGE_KEY = 'yatai_cart';
  var items = []; // [{id, name_ko, price, qty}]

  // --- Storage ---
  function load() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      items = raw ? JSON.parse(raw) : [];
    } catch (e) { items = []; }
  }

  function save() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateFab();
  }

  // --- Cart operations (immutable) ---
  function add(id, nameKo, price, qty) {
    var found = false;
    items = items.map(function (ci) {
      if (ci.id !== id) return ci;
      found = true;
      return Object.assign({}, ci, { qty: ci.qty + qty });
    });
    if (!found) {
      items = items.concat([{ id: id, name_ko: nameKo, price: price, qty: qty }]);
    }
    save();
  }

  function removeItem(id) {
    items = items.filter(function (ci) { return ci.id !== id; });
    save();
  }

  function changeQty(id, delta) {
    var shouldRemove = false;
    items = items.map(function (ci) {
      if (ci.id !== id) return ci;
      var newQty = ci.qty + delta;
      if (newQty <= 0) { shouldRemove = true; return ci; }
      return Object.assign({}, ci, { qty: newQty });
    });
    if (shouldRemove) removeItem(id);
  }

  function clearAll() {
    items = [];
    save();
  }

  function totalQty() {
    return items.reduce(function (s, ci) { return s + ci.qty; }, 0);
  }

  function totalPrice() {
    return items.reduce(function (s, ci) { return s + ci.price * ci.qty; }, 0);
  }

  // --- FAB (floating action button) ---
  function updateFab() {
    var badge = document.getElementById('cartFabBadge');
    var qty = totalQty();
    if (badge) {
      badge.textContent = qty;
      badge.style.display = qty > 0 ? '' : 'none';
    }
  }

  // --- Item Detail Popup ---
  function showItemPopup(item) {
    var lang = i18n.getLang();
    var name = i18n.getText(item.name);
    var koName = item.name.ko || '';
    var desc = i18n.getText(item.description) || '';
    var koDesc = (item.description && item.description.ko) || '';
    var imgSrc = item.image || 'images/placeholder.webp';
    var isPlaceholder = imgSrc === 'images/placeholder.webp';

    var overlay = document.getElementById('popupOverlay');
    var popup = document.getElementById('popupContent');

    var h = '';
    h += '<button class="popup-close" onclick="Cart.closePopup()">&times;</button>';

    // Image
    h += '<div class="popup-img-wrap">';
    if (isPlaceholder) {
      h += '<div class="popup-img-ph">PHOTO</div>';
    } else {
      h += '<img class="popup-img" src="' + esc(imgSrc) + '" alt="' + esc(name) + '">';
    }
    if (item.recommended) {
      h += '<span class="popup-badge">BEST</span>';
    }
    h += '</div>';

    // Info section
    h += '<div class="popup-body">';
    h += '<div class="popup-name">' + esc(name) + '</div>';
    if (lang !== 'ko' && koName && koName !== name) {
      h += '<div class="popup-name-ko">' + esc(koName) + '</div>';
    }

    // Price
    if (item.price > 0) {
      h += '<div class="popup-price">' + i18n.formatPrice(item.price) + '</div>';
    }

    // Descriptions - detailed
    if (desc) {
      h += '<div class="popup-desc">' + esc(desc) + '</div>';
    }
    if (lang !== 'ko' && koDesc && koDesc !== desc) {
      h += '<div class="popup-desc-ko">' + esc(koDesc) + '</div>';
    }

    // Lunch time
    if (item.available_time) {
      h += '<div class="popup-time">' + i18n.t('lunchOnly') + ' ' + item.available_time.start + ' ~ ' + item.available_time.end + '</div>';
    }

    // Qty + Add
    h += '<div class="popup-actions">';
    h += '<div class="popup-qty">';
    h += '<button class="popup-qty-btn" id="pqMinus">&minus;</button>';
    h += '<span class="popup-qty-val" id="pqVal">1</span>';
    h += '<button class="popup-qty-btn" id="pqPlus">&plus;</button>';
    h += '</div>';
    h += '<button class="popup-add-btn" id="pqAdd">' + i18n.t('addToCart') + '</button>';
    h += '</div>';

    h += '</div>'; // .popup-body

    popup.innerHTML = h;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    var qty = 1;
    document.getElementById('pqMinus').onclick = function () {
      if (qty > 1) { qty--; document.getElementById('pqVal').textContent = qty; }
    };
    document.getElementById('pqPlus').onclick = function () {
      if (qty < 20) { qty++; document.getElementById('pqVal').textContent = qty; }
    };
    document.getElementById('pqAdd').onclick = function () {
      add(item.id, koName, item.price, qty);
      closePopup();
      showToast(koName, qty);
    };
  }

  function closePopup() {
    var overlay = document.getElementById('popupOverlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  function showToast(name, qty) {
    var toast = document.getElementById('cartToast');
    if (!toast) return;
    toast.textContent = name + ' x' + qty + ' +';
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 1500);
  }

  // --- Cart Popup ---
  function showCart() {
    var overlay = document.getElementById('cartOverlay');
    var popup = document.getElementById('cartContent');
    renderCart(popup);
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    var overlay = document.getElementById('cartOverlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  function renderCart(el) {
    var h = '';
    h += '<button class="popup-close" onclick="Cart.closeCart()">&times;</button>';
    h += '<div class="cart-head">';
    h += '<span class="cart-title">' + i18n.t('cart') + '</span>';
    if (items.length > 0) {
      h += '<button class="cart-clear" onclick="Cart.doClear()">' + i18n.t('clearCart') + '</button>';
    }
    h += '</div>';

    if (items.length === 0) {
      h += '<div class="cart-empty">' + i18n.t('emptyCart') + '</div>';
    } else {
      h += '<div class="cart-staff-note">주문 내역 (직원용)</div>';
      h += '<div class="cart-list">';
      items.forEach(function (ci, idx) {
        h += '<div class="cart-row">';
        h += '<div class="cart-row-name">' + esc(ci.name_ko) + '</div>';
        h += '<div class="cart-row-right">';
        h += '<button class="cart-row-qbtn" onclick="Cart.doMinus(' + idx + ')">&minus;</button>';
        h += '<span class="cart-row-qty">' + ci.qty + '</span>';
        h += '<button class="cart-row-qbtn" onclick="Cart.doPlus(' + idx + ')">+</button>';
        h += '<span class="cart-row-price">' + i18n.formatPrice(ci.price * ci.qty) + '</span>';
        h += '<button class="cart-row-del" onclick="Cart.doRemove(' + idx + ')">&times;</button>';
        h += '</div></div>';
      });
      h += '</div>';
      h += '<div class="cart-total">';
      h += '<span>' + i18n.t('total') + '</span>';
      h += '<span class="cart-total-price">' + i18n.formatPrice(totalPrice()) + '</span>';
      h += '</div>';
    }
    el.innerHTML = h;
  }

  // Cart actions (called from inline onclick)
  function doMinus(idx) {
    if (idx >= 0 && idx < items.length) {
      changeQty(items[idx].id, -1);
      renderCart(document.getElementById('cartContent'));
    }
  }
  function doPlus(idx) {
    if (idx >= 0 && idx < items.length) {
      changeQty(items[idx].id, 1);
      renderCart(document.getElementById('cartContent'));
    }
  }
  function doRemove(idx) {
    if (idx >= 0 && idx < items.length) {
      removeItem(items[idx].id);
      renderCart(document.getElementById('cartContent'));
    }
  }
  function doClear() {
    clearAll();
    renderCart(document.getElementById('cartContent'));
  }

  // --- Helpers ---
  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // --- Init ---
  function init() {
    load();
    updateFab();

    // Close on overlay click
    var popupOverlay = document.getElementById('popupOverlay');
    if (popupOverlay) {
      popupOverlay.addEventListener('click', function (e) {
        if (e.target === popupOverlay) closePopup();
      });
    }
    var cartOverlay = document.getElementById('cartOverlay');
    if (cartOverlay) {
      cartOverlay.addEventListener('click', function (e) {
        if (e.target === cartOverlay) closeCart();
      });
    }
  }

  return {
    init: init,
    showItemPopup: showItemPopup,
    closePopup: closePopup,
    showCart: showCart,
    closeCart: closeCart,
    updateFab: updateFab,
    doMinus: doMinus,
    doPlus: doPlus,
    doRemove: doRemove,
    doClear: doClear
  };
})();
