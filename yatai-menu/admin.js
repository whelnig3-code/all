/**
 * YATAI Admin - Menu Management Module
 *
 * Provides admin editing capability for the tablet menu.
 * Edits are stored in localStorage as an overlay on base menu.json.
 * Publishing merges overlay into base and downloads the result.
 *
 * Flow:
 *   menu.json (fetch) + localStorage overlay → merged display
 *   [Publish] → download merged menu.json → redeploy to Netlify
 */

var MenuAdmin = (function () {
  'use strict';

  var PIN_KEY = 'yatai_admin_pin';
  var EDITS_KEY = 'yatai_menu_edits';
  var DEFAULT_PIN = '0000';

  var isAdminMode = false;
  var baseData = null;
  var onChangeCallback = null;

  // --- localStorage helpers ---

  function getEdits() {
    try {
      var raw = localStorage.getItem(EDITS_KEY);
      if (!raw) return { added: [], updated: {}, deleted: [] };
      return JSON.parse(raw);
    } catch (e) {
      return { added: [], updated: {}, deleted: [] };
    }
  }

  function saveEdits(edits) {
    localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
    notifyChange();
  }

  function notifyChange() {
    if (onChangeCallback) onChangeCallback();
  }

  // --- PIN management ---

  function getPin() {
    return localStorage.getItem(PIN_KEY) || DEFAULT_PIN;
  }

  function setPin(newPin) {
    localStorage.setItem(PIN_KEY, newPin);
  }

  function verifyPin(input) {
    return input === getPin();
  }

  // --- Admin mode ---

  function enterAdmin(pin) {
    if (!verifyPin(pin)) return false;
    isAdminMode = true;
    document.body.classList.add('admin-mode');
    notifyChange();
    return true;
  }

  function exitAdmin() {
    isAdminMode = false;
    document.body.classList.remove('admin-mode');
    closeAllModals();
  }

  function isAdmin() {
    return isAdminMode;
  }

  // --- CRUD operations ---

  function addItem(item) {
    var edits = getEdits();
    var newItem = Object.assign({}, item, {
      id: item.id || generateId(item.category),
      active: true,
      updated_at: new Date().toISOString()
    });
    edits.added.push(newItem);
    saveEdits(edits);
    return newItem;
  }

  function updateItem(id, changes) {
    var edits = getEdits();

    // Check if item is in added list
    var addedIdx = findAddedIndex(edits, id);
    if (addedIdx !== -1) {
      Object.assign(edits.added[addedIdx], changes, {
        updated_at: new Date().toISOString()
      });
    } else {
      if (!edits.updated[id]) edits.updated[id] = {};
      Object.assign(edits.updated[id], changes, {
        updated_at: new Date().toISOString()
      });
    }

    saveEdits(edits);
  }

  function deleteItem(id) {
    var edits = getEdits();

    // If it's a newly added item, just remove from added
    var addedIdx = findAddedIndex(edits, id);
    if (addedIdx !== -1) {
      edits.added.splice(addedIdx, 1);
    } else {
      // Mark base item as deleted
      if (edits.deleted.indexOf(id) === -1) {
        edits.deleted.push(id);
      }
      // Clean up any updates for this item
      delete edits.updated[id];
    }

    saveEdits(edits);
  }

  function toggleActive(id) {
    var merged = getMergedMenu(baseData);
    var item = merged.items.find(function (i) { return i.id === id; });
    if (!item) return;
    updateItem(id, { active: !item.active });
  }

  // --- Merge logic ---

  function getMergedMenu(base) {
    if (!base) return { categories: [], items: [] };
    var edits = getEdits();

    // Start with base items
    var items = base.items
      .filter(function (item) {
        return edits.deleted.indexOf(item.id) === -1;
      })
      .map(function (item) {
        var updates = edits.updated[item.id];
        if (!updates) return Object.assign({}, item);
        return Object.assign({}, item, updates);
      });

    // Append added items
    items = items.concat(edits.added.map(function (item) {
      return Object.assign({}, item);
    }));

    return {
      categories: base.categories.slice(),
      items: items
    };
  }

  // --- Publish ---

  function publishChanges(base) {
    var merged = getMergedMenu(base);
    var json = JSON.stringify(merged, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'menu.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Clear edits after successful download
    discardChanges();
  }

  function discardChanges() {
    localStorage.removeItem(EDITS_KEY);
    notifyChange();
  }

  function getChangeCount() {
    var edits = getEdits();
    return edits.added.length +
      Object.keys(edits.updated).length +
      edits.deleted.length;
  }

  // --- Helpers ---

  function findAddedIndex(edits, id) {
    for (var i = 0; i < edits.added.length; i++) {
      if (edits.added[i].id === id) return i;
    }
    return -1;
  }

  function generateId(category) {
    return (category || 'item') + '-' + Date.now().toString(36);
  }

  function closeAllModals() {
    var modals = document.querySelectorAll('.admin-modal');
    for (var i = 0; i < modals.length; i++) {
      modals[i].classList.remove('visible');
    }
  }

  // --- Admin UI rendering ---

  function renderPublishBar() {
    var existing = document.getElementById('adminPublishBar');
    if (existing) existing.remove();

    var count = getChangeCount();
    if (!isAdminMode) return;

    var bar = document.createElement('div');
    bar.id = 'adminPublishBar';
    bar.className = 'admin-publish-bar' + (count > 0 ? ' has-changes' : '');
    var koEnChecked = (typeof i18n !== 'undefined' && i18n.isKoEnOnly()) ? ' checked' : '';
    bar.innerHTML =
      '<div class="publish-bar-content">' +
        '<span class="publish-bar-status">' +
          (count > 0 ? count + ' changes pending' : 'Admin Mode') +
        '</span>' +
        '<div class="publish-bar-actions">' +
          '<label class="koen-toggle"><input type="checkbox" id="btnKoEn"' + koEnChecked + '> ko/en only</label>' +
          (count > 0
            ? '<button class="btn-discard" id="btnDiscard">Discard</button>' +
              '<button class="btn-publish" id="btnPublish">Publish</button>'
            : '<button class="btn-exit-admin" id="btnExitAdmin">Exit Admin</button>') +
        '</div>' +
      '</div>';

    document.body.appendChild(bar);

    document.getElementById('btnKoEn').addEventListener('change', function () {
      if (typeof i18n !== 'undefined') {
        i18n.setKoEnOnly(this.checked);
        document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: i18n.getLang() } }));
      }
    });

    if (count > 0) {
      document.getElementById('btnDiscard').addEventListener('click', function () {
        if (confirm('Discard all ' + count + ' changes?')) {
          discardChanges();
        }
      });
      document.getElementById('btnPublish').addEventListener('click', function () {
        publishChanges(baseData);
      });
    } else {
      document.getElementById('btnExitAdmin').addEventListener('click', function () {
        exitAdmin();
        renderPublishBar();
      });
    }
  }

  function showPinPrompt() {
    var modal = document.getElementById('adminPinModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'adminPinModal';
      modal.className = 'admin-modal';
      modal.innerHTML =
        '<div class="admin-modal-content pin-modal">' +
          '<h3>Admin Login</h3>' +
          '<input type="password" id="pinInput" maxlength="4" pattern="[0-9]*" inputmode="numeric" placeholder="PIN">' +
          '<div class="pin-actions">' +
            '<button class="btn-cancel" id="pinCancel">Cancel</button>' +
            '<button class="btn-confirm" id="pinConfirm">Enter</button>' +
          '</div>' +
          '<p class="pin-error" id="pinError"></p>' +
        '</div>';
      document.body.appendChild(modal);

      document.getElementById('pinCancel').addEventListener('click', function () {
        modal.classList.remove('visible');
      });

      document.getElementById('pinConfirm').addEventListener('click', function () {
        var pin = document.getElementById('pinInput').value;
        if (enterAdmin(pin)) {
          modal.classList.remove('visible');
          document.getElementById('pinInput').value = '';
          document.getElementById('pinError').textContent = '';
          renderPublishBar();
        } else {
          document.getElementById('pinError').textContent = 'Wrong PIN';
        }
      });

      document.getElementById('pinInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          document.getElementById('pinConfirm').click();
        }
      });

      modal.addEventListener('click', function (e) {
        if (e.target === modal) modal.classList.remove('visible');
      });
    }

    document.getElementById('pinInput').value = '';
    document.getElementById('pinError').textContent = '';
    modal.classList.add('visible');
    setTimeout(function () {
      document.getElementById('pinInput').focus();
    }, 100);
  }

  function showEditModal(item, categories) {
    var modal = document.getElementById('adminEditModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'adminEditModal';
      modal.className = 'admin-modal';
      document.body.appendChild(modal);
      modal.addEventListener('click', function (e) {
        if (e.target === modal) modal.classList.remove('visible');
      });
    }

    var isNew = !item;
    var data = item || {
      id: '',
      category: (categories && categories[0]) ? categories[0].id : '',
      sort: 99,
      price: 0,
      active: true,
      image: 'images/placeholder.webp',
      name: { ko: '', en: '' },
      description: { ko: '', en: '' }
    };

    var catOptions = (categories || []).map(function (c) {
      var selected = c.id === data.category ? ' selected' : '';
      return '<option value="' + c.id + '"' + selected + '>' + c.name.ko + '</option>';
    }).join('');

    modal.innerHTML =
      '<div class="admin-modal-content edit-modal">' +
        '<h3>' + (isNew ? 'Add Menu Item' : 'Edit: ' + (data.name.ko || '')) + '</h3>' +
        '<div class="edit-form">' +
          '<label>Category' +
            '<select id="editCategory">' + catOptions + '</select>' +
          '</label>' +
          '<label>Name (Korean)' +
            '<input type="text" id="editNameKo" value="' + escapeAttr(data.name.ko || '') + '">' +
          '</label>' +
          '<label>Name (English)' +
            '<input type="text" id="editNameEn" value="' + escapeAttr(data.name.en || '') + '">' +
          '</label>' +
          '<label>Price (KRW)' +
            '<input type="number" id="editPrice" value="' + (data.price || 0) + '" min="0" step="1000">' +
          '</label>' +
          '<label>Description (Korean)' +
            '<input type="text" id="editDescKo" value="' + escapeAttr((data.description && data.description.ko) || '') + '">' +
          '</label>' +
          '<label>Description (English)' +
            '<input type="text" id="editDescEn" value="' + escapeAttr((data.description && data.description.en) || '') + '">' +
          '</label>' +
          '<label>Sort Order' +
            '<input type="number" id="editSort" value="' + (data.sort || 99) + '" min="1">' +
          '</label>' +
        '</div>' +
        '<div class="edit-actions">' +
          '<button class="btn-cancel" id="editCancel">Cancel</button>' +
          '<button class="btn-confirm" id="editSave">' + (isNew ? 'Add' : 'Save') + '</button>' +
        '</div>' +
      '</div>';

    modal.classList.add('visible');

    document.getElementById('editCancel').addEventListener('click', function () {
      modal.classList.remove('visible');
    });

    document.getElementById('editSave').addEventListener('click', function () {
      var changes = {
        category: document.getElementById('editCategory').value,
        sort: parseInt(document.getElementById('editSort').value, 10) || 99,
        price: parseInt(document.getElementById('editPrice').value, 10) || 0,
        name: {
          ko: document.getElementById('editNameKo').value.trim(),
          en: document.getElementById('editNameEn').value.trim()
        },
        description: {
          ko: document.getElementById('editDescKo').value.trim(),
          en: document.getElementById('editDescEn').value.trim()
        }
      };

      if (!changes.name.ko) {
        alert('Korean name is required');
        return;
      }

      if (isNew) {
        changes.image = 'images/placeholder.webp';
        addItem(changes);
      } else {
        updateItem(data.id, changes);
      }

      modal.classList.remove('visible');
    });
  }

  function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Long-press detection for admin entry ---

  function setupLongPress(element) {
    var timer = null;
    var LONG_PRESS_MS = 3000;

    function startPress(e) {
      e.preventDefault();
      timer = setTimeout(function () {
        if (isAdminMode) {
          exitAdmin();
          renderPublishBar();
        } else {
          showPinPrompt();
        }
      }, LONG_PRESS_MS);
    }

    function cancelPress() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    element.addEventListener('touchstart', startPress, { passive: false });
    element.addEventListener('touchend', cancelPress);
    element.addEventListener('touchmove', cancelPress);
    element.addEventListener('mousedown', startPress);
    element.addEventListener('mouseup', cancelPress);
    element.addEventListener('mouseleave', cancelPress);
  }

  // --- Public API ---

  return {
    init: function (base, onChange) {
      baseData = base;
      onChangeCallback = onChange;
    },
    setBaseData: function (base) {
      baseData = base;
    },
    enterAdmin: enterAdmin,
    exitAdmin: exitAdmin,
    isAdmin: isAdmin,
    addItem: addItem,
    updateItem: updateItem,
    deleteItem: deleteItem,
    toggleActive: toggleActive,
    getMergedMenu: getMergedMenu,
    getChangeCount: getChangeCount,
    publishChanges: publishChanges,
    discardChanges: discardChanges,
    showPinPrompt: showPinPrompt,
    showEditModal: showEditModal,
    renderPublishBar: renderPublishBar,
    setupLongPress: setupLongPress,
    setPin: setPin,
    verifyPin: verifyPin
  };
})();
