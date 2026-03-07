/**
 * YATAI i18n - Language Switching System
 *
 * Supports 8 languages with Korean fallback.
 * Current language stored in localStorage.
 * URL parameter ?lang=xx overrides stored preference.
 *
 * Usage:
 *   i18n.init()                          // detect language
 *   i18n.t('cart')                       // get UI label
 *   i18n.getText(item.name)              // get localized menu text
 *   i18n.setLang('en')                   // switch language
 *   i18n.renderSwitcher(containerEl)     // render language buttons
 */

var i18n = (function () {
  'use strict';

  var STORAGE_KEY = 'yatai_lang';
  var FALLBACK = 'ko';
  var currentLang = FALLBACK;

  var LANGUAGES = [
    { code: 'ko', label: '한국어', flag: 'KR' },
    { code: 'en', label: 'English', flag: 'EN' },
    { code: 'zh', label: '中文', flag: 'CN' },
    { code: 'ja', label: '日本語', flag: 'JP' },
    { code: 'vi', label: 'Tiếng Việt', flag: 'VN' },
    { code: 'th', label: 'ไทย', flag: 'TH' },
    { code: 'ne', label: 'नेपाली', flag: 'NE' },
    { code: 'ru', label: 'Русский', flag: 'RU' }
  ];

  // --- UI Labels (buttons, headers, system text) ---
  var UI_LABELS = {
    // Header
    menu: {
      ko: '메뉴', en: 'Menu', zh: '菜单', ja: 'メニュー',
      vi: 'Thực đơn', th: 'เมนู', ne: 'मेनु', ru: 'Меню'
    },
    // Cart
    cart: {
      ko: '장바구니', en: 'Cart', zh: '购物车', ja: 'カート',
      vi: 'Giỏ hàng', th: 'ตะกร้า', ne: 'कार्ट', ru: 'Корзина'
    },
    addToCart: {
      ko: '담기', en: 'Add', zh: '加入', ja: '追加',
      vi: 'Thêm', th: 'เพิ่ม', ne: 'थप्नुहोस्', ru: 'Добавить'
    },
    total: {
      ko: '합계', en: 'Total', zh: '合计', ja: '合計',
      vi: 'Tổng cộng', th: 'ยอดรวม', ne: 'जम्मा', ru: 'Итого'
    },
    clearCart: {
      ko: '전체 삭제', en: 'Clear All', zh: '清空', ja: '全削除',
      vi: 'Xóa tất cả', th: 'ล้างทั้งหมด', ne: 'सबै हटाउनुहोस्', ru: 'Очистить'
    },
    emptyCart: {
      ko: '장바구니가 비어있습니다', en: 'Cart is empty', zh: '购物车为空', ja: 'カートは空です',
      vi: 'Giỏ hàng trống', th: 'ตะกร้าว่างเปล่า', ne: 'कार्ट खाली छ', ru: 'Корзина пуста'
    },
    // Price
    priceTbd: {
      ko: '가격문의', en: 'Ask price', zh: '询价', ja: '価格要相談',
      vi: 'Hỏi giá', th: 'สอบถามราคา', ne: 'मूल्य सोध्नुहोस्', ru: 'Уточнить цену'
    },
    // Time restriction
    lunchOnly: {
      ko: '점심 한정', en: 'Lunch only', zh: '仅午餐', ja: 'ランチ限定',
      vi: 'Chỉ bữa trưa', th: 'มื้อเที่ยงเท่านั้น', ne: 'दिउँसोको खाना मात्र', ru: 'Только обед'
    },
    available: {
      ko: '주문가능', en: 'Available', zh: '可点', ja: '注文可',
      vi: 'Có sẵn', th: 'สั่งได้', ne: 'उपलब्ध', ru: 'Доступно'
    },
    unavailable: {
      ko: '준비중', en: 'Unavailable', zh: '暂不可点', ja: '準備中',
      vi: 'Không có sẵn', th: 'ไม่พร้อม', ne: 'उपलब्ध छैन', ru: 'Недоступно'
    },
    // Category navigation
    allMenu: {
      ko: '전체', en: 'All', zh: '全部', ja: '全て',
      vi: 'Tất cả', th: 'ทั้งหมด', ne: 'सबै', ru: 'Все'
    },
    // Gallery
    menuPhotos: {
      ko: '메뉴판', en: 'Menu Photos', zh: '菜单照片', ja: 'メニュー写真',
      vi: 'Ảnh thực đơn', th: 'รูปเมนู', ne: 'मेनु फोटो', ru: 'Фото меню'
    },
    // General
    close: {
      ko: '닫기', en: 'Close', zh: '关闭', ja: '閉じる',
      vi: 'Đóng', th: 'ปิด', ne: 'बन्द', ru: 'Закрыть'
    },
    items: {
      ko: '개', en: 'items', zh: '个', ja: '品',
      vi: 'món', th: 'รายการ', ne: 'वस्तु', ru: 'шт.'
    },
    currency: {
      ko: '₩', en: '₩', zh: '₩', ja: '₩',
      vi: '₩', th: '₩', ne: '₩', ru: '₩'
    },
    // Admin: translation quality toggle
    koEnOnly: {
      ko: 'ko/en만', en: 'ko/en only', zh: 'ko/en only', ja: 'ko/enのみ',
      vi: 'ko/en only', th: 'ko/en only', ne: 'ko/en only', ru: 'ko/en only'
    }
  };

  // --- ko/en-only mode (admin translation quality gate) ---
  var KOEN_KEY = 'yatai_koen_only';

  function isKoEnOnly() {
    return localStorage.getItem(KOEN_KEY) === '1';
  }

  function setKoEnOnly(enabled) {
    if (enabled) {
      localStorage.setItem(KOEN_KEY, '1');
    } else {
      localStorage.removeItem(KOEN_KEY);
    }
  }

  // --- Core functions ---

  function init() {
    // Priority: URL param > localStorage > fallback
    var urlLang = getUrlParam('lang');
    if (urlLang && isValidLang(urlLang)) {
      currentLang = urlLang;
      localStorage.setItem(STORAGE_KEY, currentLang);
    } else {
      currentLang = localStorage.getItem(STORAGE_KEY) || FALLBACK;
    }

    if (!isValidLang(currentLang)) {
      currentLang = FALLBACK;
    }

    document.documentElement.lang = currentLang;
  }

  function setLang(code) {
    if (!isValidLang(code)) return;
    currentLang = code;
    localStorage.setItem(STORAGE_KEY, code);
    document.documentElement.lang = code;
  }

  function getLang() {
    return currentLang;
  }

  // Get UI label by key
  function t(key) {
    var labels = UI_LABELS[key];
    if (!labels) return key;
    return labels[currentLang] || labels[FALLBACK] || key;
  }

  // Get localized text from a { ko, en, zh, ... } object
  // In ko/en-only mode, non-ko/en languages fall back to ko
  function getText(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (isKoEnOnly() && currentLang !== 'ko' && currentLang !== 'en') {
      return obj['ko'] || '';
    }
    return obj[currentLang] || obj[FALLBACK] || '';
  }

  // Format price: always ₩ + comma (KRW fixed format)
  function formatPrice(price) {
    if (!price || price <= 0) return t('priceTbd');
    return '\u20A9' + price.toLocaleString('ko-KR');
  }

  // --- Language switcher UI ---

  function renderSwitcher(container) {
    if (!container) return;

    var html = '<div class="lang-switcher">';
    LANGUAGES.forEach(function (lang) {
      var activeClass = lang.code === currentLang ? ' lang-btn-active' : '';
      html += '<button class="lang-btn' + activeClass + '" data-lang="' + lang.code + '">';
      html += '<span class="lang-flag">' + lang.flag + '</span>';
      html += '<span class="lang-label">' + lang.label + '</span>';
      html += '</button>';
    });
    html += '</div>';

    container.innerHTML = html;

    container.addEventListener('click', function (e) {
      var btn = e.target.closest('.lang-btn');
      if (!btn) return;
      var code = btn.getAttribute('data-lang');
      setLang(code);

      // Update active state
      var buttons = container.querySelectorAll('.lang-btn');
      for (var i = 0; i < buttons.length; i++) {
        if (buttons[i].getAttribute('data-lang') === code) {
          buttons[i].classList.add('lang-btn-active');
        } else {
          buttons[i].classList.remove('lang-btn-active');
        }
      }

      // Fire custom event for pages to re-render
      document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: code } }));
    });
  }

  // --- Helpers ---

  function isValidLang(code) {
    return LANGUAGES.some(function (l) { return l.code === code; });
  }

  function getUrlParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function getLanguages() {
    return LANGUAGES.slice();
  }

  // --- Public API ---
  return {
    init: init,
    setLang: setLang,
    getLang: getLang,
    t: t,
    getText: getText,
    formatPrice: formatPrice,
    renderSwitcher: renderSwitcher,
    getLanguages: getLanguages,
    isKoEnOnly: isKoEnOnly,
    setKoEnOnly: setKoEnOnly
  };
})();
