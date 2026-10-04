// إعدادات فايربيز
const firebaseConfig = {
  apiKey: "AIzaSyBB_U4C880PW4GxZd8FALv8yBSiP2mNeBY",
  authDomain: "malaboushi.firebaseapp.com",
  projectId: "malaboushi",
  storageBucket: "malaboushi.firebasestorage.app",
  messagingSenderId: "110336819350",
  appId: "1:110336819350:web:2b1b0488e72b811f0602b7",
  measurementId: "G-94ZT4TQYZY"
};

// تهيئة فايربيز
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const firestore = firebase.firestore();

// تفعيل ميزة الأوفلاين السحابي
firestore.enablePersistence().catch(function(err) {
    console.log("Offline error: ", err.code);
});

// المتغيرات الأساسية (نجلبها من الذاكرة المحلية أولاً ليعمل التطبيق كزائر)
let db = JSON.parse(localStorage.getItem('debt_manager_db')) || {
  customers: [],
  exchangeRate: 89000
};
let activeCurrency = 'lbp';
let inputValue = '0';
let currentCustomerId = null;
let selectMode = false;
let selectedCustomers = new Set();
let currentInvoiceId = null;
let pendingConfirmResolve = null;
let pendingPromptResolve = null;
let pendingAmount = null;
let pendingCurrency = null;
let currentSort = 'newest';
let historySearchTerm = '';
let currentUser = null;
let unsubscribeNotes = null;
let isBackAction = false; 

// ===== فايربيز والمزامنة السحابية =====

auth.onAuthStateChanged(user => {
  currentUser = user;
  const dot = document.getElementById('auth-status-dot');
  const authText = document.getElementById('auth-text');
  const authIcon = document.getElementById('auth-icon');
  const userPic = document.getElementById('user-pic');

  if (user) {
    dot.className = 'status-dot green';
    authText.textContent = 'تسجيل الخروج';
    authIcon.classList.add('hidden');
    userPic.src = user.photoURL || '';
    userPic.classList.remove('hidden');
    
    syncOnceThenListen(user.uid);
  } else {
    dot.className = 'status-dot red';
    authText.textContent = 'تسجيل الدخول لجوجل';
    authIcon.classList.remove('hidden');
    userPic.classList.add('hidden');
    
    if (unsubscribeNotes) {
        unsubscribeNotes();
        unsubscribeNotes = null;
    }
    
    db = JSON.parse(localStorage.getItem('debt_manager_db')) || { customers: [], exchangeRate: db.exchangeRate || 89000 };
    updateRateDisplay();
    renderCustomersList();
    if(currentCustomerId) renderInvoices();
  }
});

function toggleAuth() {
  closeMoreMenu();
  if (currentUser) {
    showConfirm('تسجيل الخروج', 'هل تريد تسجيل الخروج؟ سيتم مسح البيانات من الشاشة لحمايتها.').then(ok => {
        if(!ok) return;
        auth.signOut().then(() => {
            localStorage.removeItem('debt_manager_db');
            db = { customers: [], exchangeRate: 89000 };
            inputValue = '0';
            currentCustomerId = null;
            updateDisplays();
            renderCustomersList();
            showScreen('screen-main');
            showAlert('تم', 'تم تسجيل الخروج وتأمين بياناتك.', '✅');
        });
    });
  } else {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
      showAlert('خطأ', 'فشل تسجيل الدخول: ' + error.message, '❌');
    });
  }
}

function mergeLocalAndCloud(cloudData) {
  let localData = JSON.parse(localStorage.getItem('debt_manager_db'));
  if (!localData || !localData.customers || localData.customers.length === 0) {
      return cloudData || { customers: [], exchangeRate: 89000 };
  }
  if (!cloudData || !cloudData.customers) {
      return localData;
  }

  let mergedCustomers = [...cloudData.customers];
  localData.customers.forEach(localCust => {
      let existing = mergedCustomers.find(c => c.name === localCust.name);
      if (existing) {
          localCust.invoices.forEach(inv => {
              if (!existing.invoices.find(i => i.id === inv.id)) {
                  existing.invoices.push(inv);
              }
          });
          existing.invoices.sort((a,b) => b.timestamp - a.timestamp); 
      } else {
          mergedCustomers.push(localCust);
      }
  });
  
  localStorage.removeItem('debt_manager_db');
  
  return {
      customers: mergedCustomers,
      exchangeRate: localData.exchangeRate || cloudData.exchangeRate || 89000
  };
}

function syncOnceThenListen(uid) {
  const userRef = firestore.collection('users').doc(uid);
  userRef.get().then(doc => {
      let cloudData = doc.exists ? doc.data() : null;
      db = mergeLocalAndCloud(cloudData);
      saveData(); 
      setupRealtimeListener(uid); 
  }).catch(err => {
      setupRealtimeListener(uid); 
  });
}

function setupRealtimeListener(uid) {
  unsubscribeNotes = firestore.collection('users').doc(uid).onSnapshot(docSnap => {
    if (docSnap.exists) {
      const data = docSnap.data();
      if(data.customers) db.customers = data.customers;
      if(data.exchangeRate) db.exchangeRate = data.exchangeRate;
    }
    updateRateDisplay();
    if (document.getElementById('screen-history').classList.contains('active')) {
      renderCustomersList();
    }
    if (document.getElementById('screen-customer').classList.contains('active')) {
      renderInvoices();
    }
  }, error => {
    console.error('Sync Error:', error.message);
  });
}

function saveData() {
  if (currentUser) {
    firestore.collection('users').doc(currentUser.uid).set(db).catch(error => {
      console.error('Error saving to cloud:', error.message);
    });
  } else {
    localStorage.setItem('debt_manager_db', JSON.stringify(db));
  }
}


// ===== الأرقام والتنسيق =====
function adjustFontSize(elementId) {
  const el = document.getElementById(elementId);
  let fontSize = 26;
  el.style.fontSize = fontSize + 'px';
  while (el.scrollWidth > el.clientWidth && fontSize > 12) {
    fontSize--;
    el.style.fontSize = fontSize + 'px';
  }
}

function formatNum(n) {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US');
  return n.toString();
}

function formatAmount(amount, currency) {
  const n = parseFloat(amount) || 0;
  if (currency === 'usd') return `$${formatNum(n)}`;
  return `${formatNum(n)} L.L`;
}

// ===== لوحة المفاتيح =====
function keyPress(key) {
  if (key === 'C') { inputValue = '0'; updateDisplays(); return; }
  if (key === '-') {
    if (inputValue.startsWith('-')) inputValue = inputValue.slice(1);
    else if (inputValue !== '0') inputValue = '-' + inputValue;
    updateDisplays(); return;
  }
  if (key === '.') {
    if (inputValue.includes('.')) return;
    inputValue = (inputValue === '0' ? '0' : inputValue) + '.';
    updateDisplays(); return;
  }
  if (key === '0' || key === '00' || key === '000') {
    if (inputValue === '0') return;
    if (inputValue === '-0') return;
    inputValue += key;
    if (inputValue.length > 15) return;
    updateDisplays(); return;
  }
  if (inputValue === '0') inputValue = key;
  else if (inputValue === '-0') inputValue = '-' + key;
  else inputValue += key;
  if (Math.abs(inputValue.replace('-','').replace('.','')).toString().length > 13) {
    inputValue = inputValue.slice(0, -1);
  }
  updateDisplays();
}

function setActiveCurrency(cur) {
  activeCurrency = cur;
  document.getElementById('box-lbp').classList.toggle('active', cur === 'lbp');
  document.getElementById('box-usd').classList.toggle('active', cur === 'usd');
  inputValue = '0';
  updateDisplays();
}

function updateDisplays() {
  const val = parseFloat(inputValue) || 0;
  if (activeCurrency === 'lbp') {
    document.getElementById('display-lbp').textContent = formatNum(parseFloat(inputValue) || 0);
    document.getElementById('display-usd').textContent = formatNum(+(val / db.exchangeRate).toFixed(4));
  } else {
    document.getElementById('display-usd').textContent = formatNum(parseFloat(inputValue) || 0);
    document.getElementById('display-lbp').textContent = formatNum(+(val * db.exchangeRate).toFixed(0));
  }
  adjustFontSize('display-lbp');
  adjustFontSize('display-usd');
}

function updateRateDisplay() {
  const rateEl = document.getElementById('rate-value');
  if (rateEl) {
    rateEl.textContent = formatNum(db.exchangeRate);
  }
  updateDisplays();
}

// ===== تأكيد العملية =====
function confirmAmount() {
  const val = parseFloat(inputValue);
  if (!val || val === 0) { showAlert('تنبيه', 'الرجاء إدخال مبلغ صحيح', '⚠️'); return; }
  pendingAmount = val;
  pendingCurrency = activeCurrency;
  openSelectCustomerModal();
}

// ===== اختيار الزبون Modal =====
function openSelectCustomerModal() {
  renderModalCustomers('');
  document.getElementById('customer-search').value = '';
  showModal('modal-select-customer');
}
function closeSelectCustomerModal() {
  hideModal('modal-select-customer');
}

function renderModalCustomers(filter) {
  const list = document.getElementById('modal-customers-list');
  const filtered = db.customers.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
  if (filtered.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-hint);padding:20px;font-size:14px;">لا توجد نتائج</div>';
    return;
  }
  list.innerHTML = filtered.map(c => `
    <div class="modal-customer-item" onclick="selectCustomerForInvoice('${c.id}')">
      <div class="mc-avatar">${c.name.charAt(0)}</div>
      <span>${c.name}</span>
    </div>
  `).join('');
}

function filterCustomersModal(val) { renderModalCustomers(val); }

function selectCustomerForInvoice(customerId) {
  hideModal('modal-select-customer');
  addInvoice(customerId, pendingAmount, pendingCurrency);
  inputValue = '0';
  updateDisplays();
}

function addNewCustomerFromModal() {
  hideModal('modal-select-customer');
  showPrompt('زبون جديد', 'أدخل اسم الزبون').then(name => {
    if (!name || !name.trim()) return;
    name = name.trim();
    if (db.customers.find(c => c.name === name)) { showAlert('تنبيه', 'هذا الاسم موجود مسبقاً', '⚠️'); return; }
    const newC = { id: Date.now().toString(), name: name, createdAt: Date.now(), invoices: [] };
    db.customers.push(newC);
    saveData();
    selectCustomerForInvoice(newC.id);
  });
}

// ===== الفواتير =====
function addInvoice(customerId, amount, currency) {
  const customer = db.customers.find(c => c.id === customerId);
  if (!customer) return;
  const now = new Date();
  
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const dateString = `${day}/${month}/${year}`;

  const invoice = {
    id: Date.now().toString(),
    amount: amount,
    currency: currency,
    date: dateString,
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    timestamp: Date.now(),
    note: ''
  };
  customer.invoices.unshift(invoice);
  saveData();
  showAlert('تم التسجيل ✓', `تم إضافة ${formatAmount(amount, currency)} إلى ${customer.name}`, '✅');
}

// ===== المحفوظات =====
function openHistory() {
  historySearchTerm = '';
  document.getElementById('history-search-input').value = '';
  document.getElementById('history-search-container').classList.add('hidden');
  renderCustomersList();
  showScreen('screen-history');
}
function closeHistory() {
  selectMode = false;
  selectedCustomers.clear();
  updateSelectModeUI();
  showScreen('screen-main');
}

function toggleHistorySearch() {
  const container = document.getElementById('history-search-container');
  container.classList.toggle('hidden');
  if (!container.classList.contains('hidden')) {
    document.getElementById('history-search-input').focus();
  } else {
    historySearchTerm = '';
    document.getElementById('history-search-input').value = '';
    renderCustomersList();
  }
}

function filterHistoryList(val) {
  historySearchTerm = val.toLowerCase();
  renderCustomersList();
}

function openSortMenu() {
  showModal('modal-sort');
}

function setSortMode(mode) {
  currentSort = mode;
  hideModal('modal-sort');
  renderCustomersList();
}

function renderCustomersList() {
  const list = document.getElementById('customers-list');
  const empty = document.getElementById('empty-history');
  
  if (db.customers.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  
  empty.classList.add('hidden');

  let filteredCustomers = db.customers.filter(c => c.name.toLowerCase().includes(historySearchTerm));

  // الفرز
  filteredCustomers.sort((a, b) => {
    if (currentSort === 'newest') return (b.createdAt || parseInt(b.id)) - (a.createdAt || parseInt(a.id));
    if (currentSort === 'oldest') return (a.createdAt || parseInt(a.id)) - (b.createdAt || parseInt(b.id));
    if (currentSort === 'alpha') return a.name.localeCompare(b.name, 'ar');
    return 0;
  });

  list.innerHTML = filteredCustomers.map((c, i) => {
    const totals = getCustomerTotals(c);
    const isSelected = selectedCustomers.has(c.id);
    return `
    <div class="customer-card ${isSelected ? 'selected' : ''}"
         onclick="${selectMode ? `toggleSelectCustomer('${c.id}')` : `openCustomer('${c.id}')`}"
         style="animation-delay:${i * 0.02}s">
      ${selectMode ? `
        <div class="select-checkbox">
          <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>
      ` : ''}
      <div class="customer-avatar">${c.name.charAt(0)}</div>
      <div class="customer-info">
        <div class="customer-name">${c.name}</div>
        <div class="customer-debt">
          <span class="debt-usd">$${formatNum(totals.usd)}</span>
          <span>•</span>
          <span class="debt-lbp">${formatNum(totals.lbp)} L.L</span>
        </div>
      </div>
      ${!selectMode ? `<div class="customer-chevron"><svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg></div>` : ''}
    </div>`;
  }).join('');
}

function getCustomerTotals(customer) {
  let usd = 0, lbp = 0;
  customer.invoices.forEach(inv => {
    if (inv.currency === 'usd') { usd += inv.amount; lbp += inv.amount * db.exchangeRate; }
    else { lbp += inv.amount; usd += inv.amount / db.exchangeRate; }
  });
  return { usd: +usd.toFixed(2), lbp: +lbp.toFixed(0) };
}

function toggleSelectMode() {
  selectMode = !selectMode;
  selectedCustomers.clear();
  updateSelectModeUI();
  renderCustomersList();
}

function updateSelectModeUI() {
  const btnSelect = document.getElementById('btn-select');
  const actionsContainer = document.getElementById('delete-actions-container');
  const delBtn = document.getElementById('btn-delete-selected');

  if (selectMode) {
    btnSelect.querySelector('span').textContent = 'إلغاء';
    actionsContainer.style.display = 'flex';
    delBtn.classList.remove('hidden');
  } else {
    btnSelect.querySelector('span').textContent = 'تحديد';
    actionsContainer.style.display = 'none';
    delBtn.classList.add('hidden');
  }
}

function toggleSelectCustomer(id) {
  if (selectedCustomers.has(id)) selectedCustomers.delete(id);
  else selectedCustomers.add(id);
  renderCustomersList();
}

function addNewCustomer() {
  showPrompt('زبون جديد', 'أدخل اسم الزبون').then(name => {
    if (!name || !name.trim()) return;
    name = name.trim();
    if (db.customers.find(c => c.name === name)) { showAlert('تنبيه', 'هذا الاسم موجود مسبقاً', '⚠️'); return; }
    db.customers.push({ id: Date.now().toString(), name: name, createdAt: Date.now(), invoices: [] });
    saveData();
    renderCustomersList();
  });
}

function deleteSelected() {
  if (selectedCustomers.size === 0) { showAlert('تنبيه', 'لم تحدد أي زبون', '⚠️'); return; }
  showConfirm('حذف الزبائن', `هل تريد حذف ${selectedCustomers.size} زبون/زبائن وجميع فواتيرهم؟`).then(ok => {
    if (!ok) return;
    db.customers = db.customers.filter(c => !selectedCustomers.has(c.id));
    saveData();
    selectedCustomers.clear();
    selectMode = false;
    updateSelectModeUI();
    renderCustomersList();
  });
}

// ===== شاشة الزبون =====
function openCustomer(id) {
  currentCustomerId = id;
  const customer = db.customers.find(c => c.id === id);
  if (!customer) return;
  document.getElementById('customer-name-header').textContent = customer.name;
  renderInvoices();
  showScreen('screen-customer');
}
function closeCustomer() {
  showScreen('screen-history');
  renderCustomersList();
}

function renderInvoices() {
  const customer = db.customers.find(c => c.id === currentCustomerId);
  const list = document.getElementById('invoices-list');
  const empty = document.getElementById('empty-invoices');
  if (!customer || customer.invoices.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    updateCustomerSummary(customer);
    return;
  }
  empty.classList.add('hidden');
  updateCustomerSummary(customer);
  list.innerHTML = customer.invoices.map((inv, i) => {
    const isUsd = inv.currency === 'usd';
    return `
    <div class="invoice-card" onclick="openInvoiceDetail('${inv.id}')" style="animation-delay:${i*0.04}s">
      <div class="invoice-icon ${isUsd ? 'usd-icon' : 'lbp-icon'}">${isUsd ? '💵' : '💴'}</div>
      <div class="invoice-info">
        <div class="invoice-amount ${isUsd ? 'usd-col' : 'lbp-col'}">${formatAmount(inv.amount, inv.currency)}</div>
        <div class="invoice-datetime">${inv.date} — ${inv.time}</div>
        ${inv.note ? `<div class="invoice-note-preview">📝 ${inv.note}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function updateCustomerSummary(customer) {
  if (!customer) { document.getElementById('total-usd-customer').textContent = '$0'; document.getElementById('total-lbp-customer').textContent = '0 L.L'; return; }
  const t = getCustomerTotals(customer);
  document.getElementById('total-usd-customer').textContent = `$${formatNum(t.usd)}`;
  document.getElementById('total-lbp-customer').textContent = `${formatNum(t.lbp)} L.L`;
}

function deleteAllCustomerInvoices() {
  const customer = db.customers.find(c => c.id === currentCustomerId);
  if (!customer) return;
  showConfirm('حذف جميع الفواتير', `هل تريد حذف جميع فواتير ${customer.name}؟`).then(ok => {
    if (!ok) return;
    customer.invoices = [];
    saveData();
    renderInvoices();
  });
}

// ===== تفاصيل الفاتورة =====
function openInvoiceDetail(invoiceId) {
  const customer = db.customers.find(c => c.id === currentCustomerId);
  if (!customer) return;
  const inv = customer.invoices.find(i => i.id === invoiceId);
  if (!inv) return;
  currentInvoiceId = invoiceId;
  document.getElementById('detail-amount').textContent = formatAmount(inv.amount, inv.currency);
  document.getElementById('detail-amount').className = 'invoice-detail-amount ' + (inv.currency === 'usd' ? 'usd-color' : 'lbp-color');
  document.getElementById('detail-date').textContent = `${inv.date} — ${inv.time}`;
  document.getElementById('detail-note').value = inv.note || '';
  showModal('modal-invoice-detail');
}
function closeInvoiceDetail() { hideModal('modal-invoice-detail'); }

function saveInvoiceNote() {
  const customer = db.customers.find(c => c.id === currentCustomerId);
  if (!customer) return;
  const inv = customer.invoices.find(i => i.id === currentInvoiceId);
  if (!inv) return;
  inv.note = document.getElementById('detail-note').value.trim();
  saveData();
  renderInvoices();
  closeInvoiceDetail();
  showAlert('تم الحفظ', 'تم حفظ الملاحظة بنجاح', '✅');
}

function deleteInvoiceFromDetail() {
  closeInvoiceDetail();
  showConfirm('حذف الفاتورة', 'هل تريد حذف هذه الفاتورة؟').then(ok => {
    if (!ok) return;
    const customer = db.customers.find(c => c.id === currentCustomerId);
    if (!customer) return;
    customer.invoices = customer.invoices.filter(i => i.id !== currentInvoiceId);
    saveData();
    renderInvoices();
  });
}

// ===== سعر الصرف =====
function openExchangeRate() {
  closeMoreMenu();
  document.getElementById('exchange-input').value = db.exchangeRate;
  showModal('modal-exchange');
}
function closeExchangeModal(save) {
  if (save) {
    const val = parseFloat(document.getElementById('exchange-input').value);
    if (!val || val <= 0) { showAlert('خطأ', 'الرجاء إدخال سعر صرف صحيح', '❌'); return; }
    db.exchangeRate = val;
    saveData();
    updateRateDisplay();
    hideModal('modal-exchange'); 
    showAlert('تم', 'تم تغيير سعر الصرف بنجاح', '✅'); 
    return;
  }
  hideModal('modal-exchange');
}

// ===== تصدير/استيراد =====
function exportData() {
  closeMoreMenu();
  const json = JSON.stringify(db, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `debt-manager-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showAlert('تم التصدير', 'تم تصدير البيانات بنجاح', '✅');
}
function importData() {
  closeMoreMenu();
  document.getElementById('import-file').click();
}
function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.customers) throw new Error();
      showConfirm('استيراد البيانات', 'هل تريد استيراد البيانات؟ سيتم استبدال البيانات الحالية.').then(ok => {
        if (!ok) return;
        db = data;
        saveData();
        updateRateDisplay();
        showAlert('تم الاستيراد', 'تم استيراد البيانات بنجاح', '✅');
      });
    } catch { showAlert('خطأ', 'الملف غير صحيح أو تالف', '❌'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function clearAllData() {
  closeMoreMenu();
  showConfirm('مسح البيانات', 'هل تريد مسح جميع البيانات نهائياً؟ لا يمكن التراجع عن هذا الإجراء.').then(ok => {
    if (!ok) return;
    db = { customers: [], exchangeRate: 89000 };
    saveData();
    updateRateDisplay();
    showAlert('تم المسح', 'تم مسح جميع البيانات', '✅');
  });
}

// ===== قائمة المزيد =====
function toggleMoreMenu() {
  const menu = document.getElementById('more-menu');
  menu.classList.toggle('hidden');
  if (!menu.classList.contains('hidden') && !isBackAction) {
      window.history.pushState({ menu: true }, null, '');
  }
  isBackAction = false;
}
function closeMoreMenu() {
  document.getElementById('more-menu').classList.add('hidden');
}

// ===== التنقل بين الشاشات =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  
  if (!isBackAction && id !== 'screen-main') {
      window.history.pushState({ screen: id }, null, '');
  }
  isBackAction = false;
}

// ===== النوافذ المنبثقة =====
function showModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  el.style.display = 'flex';
  
  if (!isBackAction) {
      window.history.pushState({ modal: id }, null, '');
  }
  isBackAction = false;
}
function hideModal(id) {
  const el = document.getElementById(id);
  el.classList.add('hidden');
  el.style.display = '';
}

function showAlert(title, message, icon = '⚠️') {
  document.getElementById('alert-title').textContent = title;
  document.getElementById('alert-message').textContent = message;
  document.getElementById('alert-icon').textContent = icon;
  showModal('modal-alert');
}
function closeAlert() { hideModal('modal-alert'); }

function showConfirm(title, message) {
  return new Promise(resolve => {
    pendingConfirmResolve = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    showModal('modal-confirm');
  });
}
function closeConfirm(result) {
  hideModal('modal-confirm');
  if (pendingConfirmResolve) { pendingConfirmResolve(result); pendingConfirmResolve = null; }
}

function showPrompt(title, message, defaultVal = '') {
  return new Promise(resolve => {
    pendingPromptResolve = resolve;
    document.getElementById('prompt-title').textContent = title;
    document.getElementById('prompt-message').textContent = message;
    const input = document.getElementById('prompt-input');
    input.value = defaultVal;
    showModal('modal-prompt');
    setTimeout(() => input.focus(), 100);
  });
}
function closePrompt(result) {
  hideModal('modal-prompt');
  if (pendingPromptResolve) { pendingPromptResolve(result); pendingPromptResolve = null; }
}

function handleAndroidBack() {
  isBackAction = true;

  const modals = ['modal-sort', 'modal-invoice-detail', 'modal-select-customer', 'modal-exchange', 'modal-prompt', 'modal-confirm', 'modal-alert'];
  for (const id of modals) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) {
      if (id === 'modal-confirm') closeConfirm(false);
      else if (id === 'modal-prompt') closePrompt(null);
      else if (id === 'modal-alert') closeAlert();
      else if (id === 'modal-invoice-detail') closeInvoiceDetail();
      else if (id === 'modal-exchange') closeExchangeModal(false);
      else if (id === 'modal-select-customer') closeSelectCustomerModal();
      else if (id === 'modal-sort') hideModal('modal-sort');
      return true;
    }
  }
  
  const menu = document.getElementById('more-menu');
  if (menu && !menu.classList.contains('hidden')) { closeMoreMenu(); return true; }

  const customerScreen = document.getElementById('screen-customer');
  if (customerScreen && customerScreen.classList.contains('active')) { closeCustomer(); return true; }

  const historyScreen = document.getElementById('screen-history');
  if (historyScreen && historyScreen.classList.contains('active')) { closeHistory(); return true; }

  isBackAction = false;
  return false;
}

function init() {
  updateDisplays();
  document.getElementById('screen-main').classList.add('active');
  window.handleAndroidBack = handleAndroidBack;

  document.addEventListener('click', function(e) {
    const menu = document.getElementById('more-menu');
    const btnMore = document.getElementById('btn-more');
    if (!menu.classList.contains('hidden') && !menu.contains(e.target) && !btnMore.contains(e.target)) {
      closeMoreMenu();
    }

    if (e.target.classList.contains('modal-overlay')) {
      const id = e.target.id;
      if (id === 'modal-confirm') closeConfirm(false);
      else if (id === 'modal-prompt') closePrompt(null);
      else if (id === 'modal-alert') closeAlert();
      else if (id === 'modal-invoice-detail') closeInvoiceDetail();
      else if (id === 'modal-exchange') closeExchangeModal(false);
      else if (id === 'modal-select-customer') closeSelectCustomerModal();
      else if (id === 'modal-sort') hideModal('modal-sort');
    }
  });

  window.addEventListener('popstate', function(event) {
    handleAndroidBack();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}