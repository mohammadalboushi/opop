const firebaseConfig = {
  apiKey: "AIzaSyC_iEb4UhUREVJ2mfj00BounPVaeGQr7wI",
  authDomain: "mohammadalboushi-e9231.firebaseapp.com",
  databaseURL: "https://mohammadalboushi-e9231-default-rtdb.firebaseio.com",
  projectId: "mohammadalboushi-e9231",
  storageBucket: "mohammadalboushi-e9231.firebasestorage.app",
  messagingSenderId: "236925802081",
  appId: "1:236925802081:web:2e26094ab5ecdf988f3c20",
  measurementId: "G-H9TLS38YXV"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

db.enablePersistence().catch(function(err) {
      console.log("خطأ في تفعيل الأوفلاين: ", err.code);
});

let accounts = [];
let folders = ["عام", "فيسبوك", "جوجل"];
let unsubscribeVault = null;

let longPressTimer, isLongPress = false;
let currentCtxId = null, currentCtxType = null;
let pendingCallback = null;
let activeFolder = 'All'; 
let isSelectionMode = false;
let selectedIds = new Set();
let isMoveAction = false; 
let folderRenameTarget = null;
let vaultPressTimer = null;
let currentSort = 'newest';
let renderCounter = 0; // لمنع تداخل عمليات البحث غير المتزامنة

// 🛡️ دالة تعقيم المدخلات لقتل هجمات XSS نهائياً
function escapeHTML(str) {
    if (!str) return "";
    return str.toString().replace(/[&<>'"]/g, function(tag) {
        const charsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return charsToReplace[tag] || tag;
    });
}

let authMode = 'login'; // 'login', 'signup', or 'unlock'

// ================= نظام التشفير العسكري الجديد (Web Crypto API) =================
let cryptoKey = null; // الاحتفاظ بالمفتاح في الذاكرة الحية فقط
let SECRET_KEY = null; // يستخدم فقط كدعم للبيانات القديمة

// تحويل رموز PIN إلى طلاسم لمنع قراءتها من الـ LocalStorage
async function hashString(text) {
    const msgBuffer = new TextEncoder().encode(text + "AbuFayez_Vault_PIN_Salt");
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// توليد مفتاح قوي جداً باستخدام PBKDF2 في المتصفح
async function generateKey(password) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw", enc.encode(password), {name: "PBKDF2"}, false, ["deriveBits", "deriveKey"]
    );
    cryptoKey = await window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode("AbuFayez_Vault_Salt_2026_V2"), iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
}

// التشفير بوضعية AES-GCM الآمنة (مع التوقيع المدمج)
async function encryptPass(text) {
    if (!text || !cryptoKey) return "";
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const ciphertext = await window.crypto.subtle.encrypt({name: "AES-GCM", iv: iv}, cryptoKey, encoded);
    
    const ivBase64 = btoa(String.fromCharCode(...iv));
    const cipherBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
    return `v2:${ivBase64}:${cipherBase64}`; // v2 لتمييز التشفير الجديد
}

// فك التشفير مع دعم النسخ القديمة
async function decryptPass(ciphertext) {
    if (!ciphertext) return "";
    
    // النظام الجديد GCM
    if (ciphertext.startsWith("v2:") && cryptoKey) {
        try {
            const parts = ciphertext.split(":");
            const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
            const cipher = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
            const decrypted = await window.crypto.subtle.decrypt({name: "AES-GCM", iv: iv}, cryptoKey, cipher);
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            return "خطأ بالفك (GCM)";
        }
    } 
    
    // دعم النظام القديم (CryptoJS) حتى لا يضيع تعبك القديم
    if (typeof CryptoJS !== 'undefined') {
        try {
            let DERIVED_KEY_OLD = CryptoJS.PBKDF2(SECRET_KEY || 'guest_offline_key', CryptoJS.enc.Utf8.parse("AbuFayez_Vault_Salt_2026_V2"), { keySize: 256 / 32, iterations: 20000 });
            
            if (ciphertext.includes(":")) {
                const parts = ciphertext.split(":");
                const iv = CryptoJS.enc.Hex.parse(parts[0]);
                const bytes = CryptoJS.AES.decrypt(parts[1], DERIVED_KEY_OLD, { iv: iv });
                return bytes.toString(CryptoJS.enc.Utf8) || ciphertext;
            } else {
                const bytes = CryptoJS.AES.decrypt(ciphertext, DERIVED_KEY_OLD, { iv: CryptoJS.enc.Utf8.parse("AbuFayez_Vault_Salt_2026") });
                let originalText = bytes.toString(CryptoJS.enc.Utf8);
                if (!originalText) originalText = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY || "").toString(CryptoJS.enc.Utf8);
                return originalText || ciphertext;
            }
        } catch(e) { return ciphertext; }
    }
    return ciphertext;
}
// =====================================================================


// ================= نظام إدارة المستخدمين =================
auth.onAuthStateChanged(async user => {
    const userNameEl = document.getElementById('userName');
    const userEmailEl = document.getElementById('userEmail');
    const userAvatarEl = document.getElementById('userAvatar');
    const loginContainer = document.getElementById('emailLoginContainer');
    const logoutContainer = document.getElementById('emailLogoutContainer');

    if (user) {
        loginContainer.style.display = 'none';
        logoutContainer.style.display = 'block';
        
        const emailName = user.email.split('@')[0];
        if(userNameEl) userNameEl.innerText = emailName;
        if(userEmailEl) userEmailEl.innerText = user.email;
        
        if(userAvatarEl) {
            userAvatarEl.innerHTML = `<span style="font-size:24px; font-weight:bold; color:var(--primary); font-family: sans-serif;">${emailName.charAt(0).toUpperCase()}</span>`;
            userAvatarEl.style.background = 'rgba(139, 92, 246, 0.1)';
            userAvatarEl.style.borderColor = 'rgba(139, 92, 246, 0.3)';
        }
        
        // التحقق من وجود المفتاح بالذاكرة (لحماية الجلسة عند عمل Refresh)
        if (!cryptoKey) {
            openAuthModal('unlock', user.email);
        } else {
            setupRealtimeListener(user.uid);
        }
        
    } else {
        loginContainer.style.display = 'block';
        logoutContainer.style.display = 'none';
        
        if(userNameEl) userNameEl.innerText = "مستخدم زائر";
        if(userEmailEl) userEmailEl.innerText = "سجل الدخول للمزامنة";
        if(userAvatarEl) {
            userAvatarEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
            userAvatarEl.style.background = 'var(--bg)';
            userAvatarEl.style.borderColor = 'var(--gray-border)';
        }
        
        if(unsubscribeVault) {
            unsubscribeVault();
            unsubscribeVault = null;
        }
        
        // تفعيل وضع الزائر وتوليد مفتاح مؤقت
        SECRET_KEY = 'guest_offline_key';
        await generateKey(SECRET_KEY);
        
        const localAccs = localStorage.getItem('localVaultEmailAccounts');
        const localFolds = localStorage.getItem('localVaultEmailFolders');
        accounts = localAccs ? JSON.parse(localAccs) : [];
        folders = localFolds ? JSON.parse(localFolds) : ["عام"];
        
        renderVault();
        setSyncLoader(false, true);
    }
});

function openAuthModal(mode = 'login', email = '') {
    closeSideMenu();
    authMode = mode;
    updateAuthUI();
    
    if (mode === 'unlock') {
        document.getElementById('authEmail').value = email;
        document.getElementById('authEmail').disabled = true;
        document.getElementById('authPass').value = '';
    } else {
        document.getElementById('authEmail').disabled = false;
        document.getElementById('authEmail').value = '';
        document.getElementById('authPass').value = '';
    }
    showOverlay('authModal');
}

function toggleAuthMode() {
    authMode = authMode === 'login' ? 'signup' : 'login';
    updateAuthUI();
}

function updateAuthUI() {
    const title = document.getElementById('authTitle');
    const sub = document.getElementById('authSub');
    const submitBtn = document.getElementById('authSubmitBtn');
    const toggleBtn = document.getElementById('authToggleBtn');

    if (authMode === 'login') {
        title.innerText = 'تسجيل الدخول';
        sub.innerText = 'لحفظ ومزامنة بياناتك سحابياً';
        submitBtn.innerText = 'دخول للخزنة';
        toggleBtn.style.display = 'block';
        toggleBtn.innerText = 'إنشاء حساب جديد';
    } else if (authMode === 'signup') {
        title.innerText = 'حساب جديد';
        sub.innerText = 'لحفظ ومزامنة بياناتك سحابياً';
        submitBtn.innerText = 'إنشاء الحساب';
        toggleBtn.style.display = 'block';
        toggleBtn.innerText = 'لدي حساب بالفعل';
    } else if (authMode === 'unlock') {
        title.innerText = 'فك تشفير الخزنة 🔒';
        sub.innerText = 'أدخل كلمة المرور لفك التشفير (حماية الذاكرة)';
        submitBtn.innerText = 'فك التشفير';
        toggleBtn.style.display = 'none';
    }
}

async function submitAuth() {
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPass').value;

    if (!email || !pass) return showToast("أدخل الإيميل وكلمة المرور");

    const btn = document.getElementById('authSubmitBtn');
    const originalText = btn.innerText;
    btn.innerText = "جاري...";

    // 🔴 التعديل الأمني هنا: التحقق من صحة كلمة المرور قبل فك التشفير
    if (authMode === 'unlock') {
        auth.signInWithEmailAndPassword(email, pass)
            .then(async () => {
                await generateKey(pass);
                SECRET_KEY = pass;
                setupRealtimeListener(auth.currentUser.uid);
                goBack();
                showToast("تم فتح الخزنة! 🔓");
            })
            .catch(err => {
                showToast("كلمة المرور خاطئة ❌ لا يمكن فك التشفير");
            })
            .finally(() => btn.innerText = originalText);
        return;
    }

    if (authMode === 'login') {
        auth.signInWithEmailAndPassword(email, pass)
            .then(async () => { 
                await generateKey(pass);
                SECRET_KEY = pass;
                goBack(); 
                showToast("أهلاً بك مجدداً في خزنتك! 🔒"); 
            })
            .catch(err => showToast(getAuthError(err.code)))
            .finally(() => btn.innerText = originalText);
    } else {
        auth.createUserWithEmailAndPassword(email, pass)
            .then(async () => { 
                await generateKey(pass);
                SECRET_KEY = pass;
                goBack(); 
                showToast("تم إنشاء الحساب بنجاح! 🎉"); 
            })
            .catch(err => showToast(getAuthError(err.code)))
            .finally(() => btn.innerText = originalText);
    }
}


function handleResetPassword() {
    const email = document.getElementById('authEmail').value.trim();
    if(!email) return showToast("اكتب إيميلك بالخانة لنرسل لك الرابط");
    auth.sendPasswordResetEmail(email)
        .then(() => { goBack(); showToast("تم إرسال رابط استعادة كلمة المرور إلى بريدك 📧"); })
        .catch(err => showToast("تأكد من كتابة إيميلك بشكل صحيح"));
}

function getAuthError(code) {
    if(code === 'auth/user-not-found' || code === 'auth/invalid-credential') return "الحساب غير موجود أو البيانات خاطئة";
    if(code === 'auth/wrong-password') return "كلمة المرور خاطئة";
    if(code === 'auth/email-already-in-use') return "هذا الإيميل مسجل مسبقاً";
    if(code === 'auth/weak-password') return "كلمة المرور ضعيفة (6 أحرف على الأقل)";
    return "الخطأ هو: " + code; 
}

function handleLogout() {
    closeSideMenu();
    customConfirm("هل تريد تسجيل الخروج؟", () => {
        auth.signOut().then(() => {
            cryptoKey = null;
            SECRET_KEY = null;
            localStorage.removeItem('localVaultEmailAccounts');
            localStorage.removeItem('localVaultEmailFolders');
            accounts = [];
            folders = ["عام"];
            renderVault();
            showToast("تم تسجيل الخروج وتأمين الخزنة");
        });
    });
}

// ================= القوائم والقفل =================
async function safeToggleMenu(e) {
    if(e) e.stopPropagation();
    const menu = document.getElementById('sideMenu');
    const overlay = document.getElementById('sideMenuOverlay');
    
    if (menu.classList.contains('open')) {
        menu.classList.remove('open');
        overlay.classList.remove('active');
    } else {
        const appHash = localStorage.getItem('appHash');
        if (appHash) {
            openPasswordModal("رمز القائمة", async (v) => {
                if (await hashString(v) === appHash) {
                    menu.classList.add('open');
                    overlay.classList.add('active');
                    updateLockText(true);
                } else {
                    showToast("خطأ بالرمز");
                }
            });
        } else {
            menu.classList.add('open');
            overlay.classList.add('active');
            updateLockText(false);
        }
    }
}

function closeSideMenu() {
    const menu = document.getElementById('sideMenu');
    const overlay = document.getElementById('sideMenuOverlay');
    if(menu) menu.classList.remove('open');
    if(overlay) overlay.classList.remove('active');
}

function updateLockText(hasLock) {
    const lockText = document.getElementById('lockMenuText');
    if(lockText) lockText.innerText = (hasLock || localStorage.getItem('appHash')) ? "إلغاء قفل التطبيق" : "تعيين قفل للتطبيق";
}

function setSyncLoader(isSyncing, isError = false) { 
    const dot = document.getElementById('syncDot');
    if (dot) {
        if (isError) dot.className = 'sync-dot error';
        else dot.className = isSyncing ? 'sync-dot syncing' : 'sync-dot synced';
    }
}

// ================= جلب البيانات =================
function setupRealtimeListener(uid) {
    setSyncLoader(true);
    unsubscribeVault = db.collection('vaults').doc(uid).onSnapshot(docSnap => {
        let cloudAccounts = [];
        let cloudFolders = ["عام", "فيسبوك", "جوجل"];
        let needsMerge = false;

        if(docSnap.exists) {
            const data = docSnap.data();
            cloudAccounts = data.accounts || [];
            cloudFolders = data.folders || ["عام", "فيسبوك", "جوجل"];
        }

        const localAccs = localStorage.getItem('localVaultEmailAccounts');
        const localFolds = localStorage.getItem('localVaultEmailFolders');
        
        if (localAccs) {
            const parsedLocalAccs = JSON.parse(localAccs);
            if (parsedLocalAccs.length > 0) {
                needsMerge = true;
                cloudAccounts = [...cloudAccounts, ...parsedLocalAccs];
                if (localFolds) {
                    const parsedLocalFolds = JSON.parse(localFolds);
                    parsedLocalFolds.forEach(f => {
                        if (!cloudFolders.includes(f)) cloudFolders.push(f);
                    });
                }
            }
            localStorage.removeItem('localVaultEmailAccounts');
            localStorage.removeItem('localVaultEmailFolders');
        }

        accounts = cloudAccounts;
        folders = cloudFolders;

        if (needsMerge || !docSnap.exists) saveToCloud();

        applySort(currentSort, false); 
        renderFoldersBar();
        renderVault();
        setSyncLoader(false);
    }, error => {
        setSyncLoader(false, true);
        showToast("فشل جلب البيانات");
    });
}

function saveToCloud() {
    const user = auth.currentUser;
    if(user) {
        setSyncLoader(true);
        db.collection('vaults').doc(user.uid).set({ accounts: accounts, folders: folders })
          .then(() => setSyncLoader(false))
          .catch(error => { setSyncLoader(false, true); showToast("حدث خطأ أثناء الحفظ"); });
    } else {
        localStorage.setItem('localVaultEmailAccounts', JSON.stringify(accounts));
        localStorage.setItem('localVaultEmailFolders', JSON.stringify(folders));
    }
}

function exportDataAuto() {
    closeSideMenu();
    if (!cryptoKey) return showToast("يجب فك التشفير لتتمكن من تصدير النسخة");
    const dataToSave = { accounts: accounts, folders: folders };
    const blob = new Blob([JSON.stringify(dataToSave)], {type: "application/json"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "secrets_vault_backup.json";
    a.click();
}

// 🛡️ دالة حماية زر الاستيراد قبل فتح ملفات الهاتف
function triggerImport() {
    closeSideMenu();
    if (!cryptoKey) return showToast("عذراً، يجب فك تشفير الخزنة أولاً لاستيراد البيانات");
    document.getElementById('importFile').click();
}

function importDataWrapper(e) {
    closeSideMenu();
    if (!cryptoKey) {
        showToast("فك تشفير الخزنة أولاً قبل استيراد بيانات جديدة");
        e.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = async (f) => {
        try {
            const imported = JSON.parse(f.target.result);
            const rawAccounts = Array.isArray(imported) ? imported : (imported.accounts || []);
            const newFolders = imported.folders || ["عام"];

            const seenCombinations = new Set(accounts.map(a => {
                const em = (a.email || "").trim().toLowerCase();
                const fol = a.folder || "عام";
                return `${em}|${fol}`;
            }));
            
            const cleanAccounts = [];
            const OLD_KEY = "AbuFayez_Secure_Vault_2026"; 

            for (let importedAcc of rawAccounts) {
                const rawEmail = importedAcc.email || importedAcc.title || "مستورد";
                const emailLower = rawEmail.trim().toLowerCase();
                const folder = importedAcc.folder || "عام";
                const combo = `${emailLower}|${folder}`;

                if (!seenCombinations.has(combo)) {
                    seenCombinations.add(combo);
                    let finalPass = importedAcc.pass || "...";
                    
                    if (finalPass.startsWith("U2FsdGVkX1") && typeof CryptoJS !== 'undefined') {
                        try {
                            const bytes = CryptoJS.AES.decrypt(finalPass, OLD_KEY);
                            const plainText = bytes.toString(CryptoJS.enc.Utf8);
                            if (plainText) finalPass = await encryptPass(plainText); 
                        } catch(err) { console.log("خطأ بفك تشفير حساب:", rawEmail); }
                    } else if (!finalPass.startsWith("v2:")) {
                        finalPass = await encryptPass(finalPass);
                    }
                    
                    cleanAccounts.push({
                        id: importedAcc.id || Date.now() + Math.random(),
                        email: rawEmail,
                        pass: finalPass,
                        folder: folder
                    });
                }
            }

            accounts = [...accounts, ...cleanAccounts];
            newFolders.forEach(f => { if(!folders.includes(f)) folders.push(f); });

            saveToCloud();
            renderFoldersBar();
            applySort(currentSort);

            showToast("تم استعادة البيانات بنجاح! 🚀");
        } catch(err){
            showToast("ملف غير صالح");
        }
    };
    if(e.target.files.length > 0) reader.readAsText(e.target.files[0]);
}

async function handleAppLockSettings() {
    closeSideMenu();
    if (!cryptoKey) return showToast("يجب فك التشفير للتحكم بإعدادات القفل");
    const appHash = localStorage.getItem('appHash');
    if(appHash) {
        openPasswordModal("أدخل الرمز لإزالته", async (v) => {
            if(await hashString(v) === appHash) { 
                localStorage.removeItem('appHash'); 
                showToast("تم إزالة القفل");
            } else showToast("خطأ في الرمز");
        });
    } else {
        openPasswordModal("تعيين رمز جديد", async (v) => { 
            if(v) { 
                localStorage.setItem('appHash', await hashString(v)); 
                showToast("تم القفل");
            } 
        });
    }
}

function confirmDeleteAll() {
    closeSideMenu();
    if (!cryptoKey) return showToast("عذراً، يجب فك تشفير الخزنة أولاً للقيام بهذا الإجراء");
    customConfirm("حذف كل البيانات نهائياً؟", () => {
        accounts = []; folders = ["عام"];
        saveToCloud();
        showToast("تم تفريغ الخزنة");
    });
}

// ================= التنقل والنوافذ =================
function pushHistory(type = 'modal') { window.history.pushState({modal: type}, null, window.location.href); }

function goBack() { 
    if(window.history.state) {
        setTimeout(() => window.history.back(), 20);
        return;
    }
    const overlays = document.querySelectorAll('.overlay');
    let visible = false;
    overlays.forEach(o => { 
        if(o.classList.contains('show')) { 
            o.classList.remove('show'); 
            setTimeout(()=>o.style.display='none',200); 
            visible=true; 
        } 
    });
    
    if(!visible && document.getElementById('vaultPage').style.display === 'flex') {
        document.getElementById('vaultPage').style.display = 'none';
    }
}

window.onpopstate = () => {
    const overlays = document.querySelectorAll('.overlay');
    let closedModal = false;
    overlays.forEach(o => {
        if(o.classList.contains('show')) {
            o.classList.remove('show');
            setTimeout(()=>o.style.display='none', 200);
            closedModal = true;
        }
    });
    if(!closedModal) {
        const vault = document.getElementById('vaultPage');
        if(vault && vault.style.display === 'flex') vault.style.display = 'none';
        else closeSideMenu();
    }
};

function showOverlay(id) {
    pushHistory();
    const el = document.getElementById(id);
    el.style.display = 'flex';
    el.offsetHeight; 
    el.classList.add('show');
}

function submitPassword() {
    const val = document.getElementById('globalPassInput').value;
    const cb = pendingCallback;
    goBack(); 
    if(cb) { setTimeout(() => { cb(val); }, 200); }
    pendingCallback = null;
}

// ================= حفظ وعرض الحسابات =================
function prepareSaveAccount() {
    // 🛡️ فحص الأمان: منع إضافة أي حساب قبل فك التشفير
    if (!cryptoKey) return showToast("عذراً، يجب فك تشفير الخزنة أولاً لحفظ حساب جديد");
    
    const email = document.getElementById('emailInput').value.trim();
    if (!email) {
        showToast("أدخل البيانات أولاً");
        return;
    }
    isMoveAction = false;
    openFolderSelectModal("حفظ في");
}


async function saveAccount(targetFolder) {
    const email = document.getElementById('emailInput').value.trim();
    const pass = document.getElementById('passInput').value;
    const notes = document.getElementById('notesInput').value;
    
    const lowerEmail = email.toLowerCase();
    const isDuplicate = accounts.some(acc => (acc.email || "").trim().toLowerCase() === lowerEmail && acc.folder === targetFolder);

    if (isDuplicate) return showToast("هذا الحساب موجود مسبقاً في هذا القسم");

    // التشفير بالنظام الجديد
    const encryptedPass = await encryptPass(pass);
    const encryptedNotes = notes ? await encryptPass(notes) : "";
    
    accounts.unshift({ id: Date.now(), email, pass: encryptedPass, notes: encryptedNotes, folder: targetFolder });

    saveToCloud();
    document.getElementById('emailInput').value = '';
    document.getElementById('passInput').value = '';
    document.getElementById('notesInput').value = '';
    applySort(currentSort); 
    showToast("تم الحفظ بنجاح");
}

function renderFoldersBar() {
    const bar = document.getElementById('foldersBar');
    bar.innerHTML = '';
    
    const allChip = document.createElement('div');
    allChip.className = `chip ${activeFolder === 'All' ? 'active' : ''}`;
    allChip.innerText = `الكل (${accounts.length})`;
    allChip.onclick = () => { activeFolder = 'All'; renderVault(); renderFoldersBar(); };
    bar.appendChild(allChip);
    
    folders.forEach(f => {
        let folderCount = accounts.filter(a => a.folder === f).length;
        const chip = document.createElement('div');
        chip.className = `chip ${activeFolder === f ? 'active' : ''}`;
        chip.innerText = `${f} (${folderCount})`;
        chip.onclick = () => { activeFolder = f; renderVault(); renderFoldersBar(); };
        chip.onmousedown = () => startFolderPress(f);
        chip.ontouchstart = () => startFolderPress(f);
        chip.ontouchmove = cancelPress;
        chip.onmouseup = cancelPress;
        chip.ontouchend = cancelPress;
        bar.appendChild(chip);
    });
    
    const addBtn = document.createElement('div');
    addBtn.className = 'chip add-folder';
    addBtn.innerText = '+ مجلد جديد';
    addBtn.onclick = () => openAddFolderModal();
    bar.appendChild(addBtn);
}

// دالة Render متزامنة وتمنع مشاكل الـ Async أثناء البحث السريع
async function renderVault() {
    renderCounter++;
    const currentRender = renderCounter;
    
    const list = document.getElementById('vaultList');
    const searchVal = document.getElementById('searchInput').value ? document.getElementById('searchInput').value.toLowerCase() : '';
    
    let displayAccounts = accounts;
    if (activeFolder !== 'All') displayAccounts = displayAccounts.filter(acc => acc.folder === activeFolder);
    
    let finalDisplay = [];
    
    // فك تشفير سريع في الذاكرة للعرض والبحث فقط
    for (let acc of displayAccounts) {
        let decryptedPass = "";
        if (searchVal) decryptedPass = await decryptPass(acc.pass);
        
        if(searchVal) {
            const matchEmail = acc.email && acc.email.toLowerCase().includes(searchVal);
            const matchPass = decryptedPass && decryptedPass.toLowerCase().includes(searchVal);
            if (!matchEmail && !matchPass) continue;
        }
        finalDisplay.push(acc);
    }
    
    // إذا قام المستخدم بكتابة حرف جديد أثناء فك التشفير، يتم إهمال الدورة القديمة
    if (currentRender !== renderCounter) return;

    list.innerHTML = '';
    
    if(finalDisplay.length === 0) { 
        list.innerHTML = '<div style="text-align:center; padding:60px 20px; color:var(--text-3);"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.3; margin-bottom:10px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><h3>لا توجد حسابات</h3></div>'; 
        return; 
    }
    
    finalDisplay.forEach(acc => {
        const card = document.createElement('div');
        card.className = `account-card ${selectedIds.has(acc.id) ? 'selected-card' : ''}`;
        card.setAttribute('data-id', acc.id);
        
        // 🛡️ تمرير الإيميل على فلتر التعقيم قبل عرضه بالواجهة
        const displayName = escapeHTML(acc.email) || "بدون عنوان";
        
        let leftSide = '';
        if (isSelectionMode) {
            leftSide = `<div class="selection-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg></div>`;
        } else if (!searchVal && activeFolder !== 'All') {
            leftSide = `<div class="drag-handle-visible" onmousedown="initDrag(event)" ontouchstart="initDrag(event)"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg></div>`;
        } else {
             leftSide = `<div class="card-favicon">${displayName[0].toUpperCase()}</div>`;
        }
        
        card.innerHTML = `
            ${leftSide}
            <div class="card-main" onclick="handleCardClick(event, ${acc.id})">
                <div class="card-email" 
                     onmousedown="startPress('email', ${acc.id})" ontouchstart="startPress('email', ${acc.id})" 
                     ontouchmove="cancelPress()"
                     onmouseup="cancelPress()" ontouchend="cancelPress()">
                    <span>${displayName}</span>
                    ${acc.notes ? '<svg style="margin-right: 5px; opacity: 0.5; vertical-align: middle;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>' : ''}
                </div>
                <div id="pass-${acc.id}" class="card-pass-pill hidden-pass"
                    onmousedown="startPress('pass', ${acc.id})" ontouchstart="startPress('pass', ${acc.id})" 
                    ontouchmove="cancelPress()"
                    onmouseup="cancelPress()" ontouchend="cancelPress()">••••••••</div>
                ${acc.notes ? `<div id="notes-${acc.id}" class="card-notes hidden-notes" style="display: none; padding: 10px; background: var(--bg); border-radius: 8px; margin-top: 8px; font-size: 13px; white-space: pre-wrap; border: 1px solid var(--gray-border); color: var(--text-2); text-align: right; direction: ltr;"
                    onmousedown="startPress('notes', ${acc.id})" ontouchstart="startPress('notes', ${acc.id})" 
                    ontouchmove="cancelPress()"
                    onmouseup="cancelPress()" ontouchend="cancelPress()"></div>` : ''}
            </div>
        `;
        list.appendChild(card);
    });
}

function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    selectedIds.clear();
    const btn = document.getElementById('selectToggleBtn');
    const bottomBar = document.getElementById('bottomBar');
    if (isSelectionMode) {
        btn.classList.add('active');
        bottomBar.style.display = 'flex';
        document.getElementById('selectedCount').innerText = "محدد صفر";
    } else {
        btn.classList.remove('active');
        bottomBar.style.display = 'none';
    }
    renderVault();
}

async function deleteSelected() {
    if(selectedIds.size === 0) return;
    const appHash = localStorage.getItem('appHash');
    
    const doDelete = () => {
        customConfirm(`هل أنت متأكد من الحذف؟`, () => {
            accounts = accounts.filter(acc => !selectedIds.has(acc.id));
            saveToCloud();
            toggleSelectionMode(); 
            renderFoldersBar();
            showToast("تم الحذف");
        });
    };

    if (appHash) {
        openPasswordModal("أدخل الرمز للحذف", async (v) => {
            if (await hashString(v) === appHash) doDelete();
            else showToast("رمز خاطئ");
        });
    } else doDelete();
}

function handleCardClick(e, id) {
    if (isSelectionMode) {
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
        document.getElementById('selectedCount').innerText = selectedIds.size + " محدد";
        renderVault();
    } else {
        if(e.target.closest('.drag-handle-visible')) return;
        handlePassClick(id);
    }
}

async function handlePassClick(id) {
    if(isLongPress) return;
    const el = document.getElementById(`pass-${id}`);
    const notesEl = document.getElementById(`notes-${id}`);
    const acc = accounts.find(a => a.id === id);
    
    if(el.classList.contains('hidden-pass')) {
         el.innerText = await decryptPass(acc.pass) || '...'; 
         el.classList.remove('hidden-pass');
         el.style.fontSize = "16px"; el.style.letterSpacing = "0";
         
         if (notesEl && acc.notes) {
             notesEl.innerText = await decryptPass(acc.notes) || '';
             notesEl.style.display = 'block';
         }
         
         setTimeout(() => {
             if(!el.classList.contains('hidden-pass')) {
                 el.innerText = '••••••••'; 
                 el.classList.add('hidden-pass'); 
                 el.style.fontSize = "22px"; el.style.letterSpacing = "4px";
                 if (notesEl) notesEl.style.display = 'none';
             }
         }, 4000); // زدنا الوقت قليلاً لتتمكن من قراءة التفاصيل
    } else { 
         el.innerText = '••••••••'; 
         el.classList.add('hidden-pass'); 
         el.style.fontSize = "22px"; el.style.letterSpacing = "4px";
         if (notesEl) notesEl.style.display = 'none';
    }
}

// ================= المجلدات =================
function openFolderSelectModal(title) {
    showOverlay('folderSelectModal');
    document.getElementById('folderModalTitle').innerText = title;
    const listBody = document.getElementById('folderListModalBody');
    listBody.innerHTML = '';
    const addRow = document.createElement('div');
    addRow.className = 'move-folder-option';
    addRow.style.color = 'var(--primary)';
    addRow.innerHTML = '+ مجلد جديد';
    addRow.onclick = () => { setTimeout(openAddFolderModal, 200); goBack(); };
    listBody.appendChild(addRow);
    
    folders.forEach(f => {
        const row = document.createElement('div');
        row.className = 'move-folder-option';
        row.innerText = f;
        row.onclick = () => {
            if (isMoveAction) executeMove(f);
            else saveAccount(f);
            setTimeout(() => goBack(), 50);
        };
        listBody.appendChild(row);
    });
}

function openMoveModal() {
    if(selectedIds.size === 0) return;
    isMoveAction = true;
    openFolderSelectModal("نقل عناصر");
}

function executeMove(targetFolder) {
    accounts.forEach(acc => { if(selectedIds.has(acc.id)) acc.folder = targetFolder; });
    saveToCloud();
    toggleSelectionMode(); activeFolder = targetFolder;
    showToast("تم النقل");
}

function openAddFolderModal(renameTarget = null) {
    // 🛡️ فحص الأمان: منع إنشاء مجلدات قبل فك التشفير
    if (!cryptoKey) return showToast("عذراً، يجب فك تشفير الخزنة أولاً");
    
    folderRenameTarget = renameTarget;
    document.getElementById('addFolderTitle').innerText = renameTarget ? "تعديل المجلد" : "مجلد جديد";
    const input = document.getElementById('folderNameInput');
    input.value = renameTarget || '';
    showOverlay('addFolderModal');
    input.focus();
}

function submitFolder() {
    const name = document.getElementById('folderNameInput').value.trim();
    if(!name) return;
    if (folderRenameTarget) {
        const index = folders.indexOf(folderRenameTarget);
        if(index !== -1) folders[index] = name;
        accounts.forEach(acc => { if(acc.folder === folderRenameTarget) acc.folder = name; });
    } else {
        if(!folders.includes(name)) folders.push(name);
    }
    saveToCloud(); 
    setTimeout(() => goBack(), 50);
}

// ================= السحب والإفلات =================
let draggingItem = null;
function initDrag(e) {
    if(isSelectionMode) return;
    const handle = e.target.closest('.drag-handle-visible');
    if(!handle) return;
    draggingItem = handle.closest('.account-card');
    const list = document.getElementById('vaultList');
    list.addEventListener('mousemove', onDragMove);
    list.addEventListener('touchmove', onDragMove, {passive: false});
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchend', onDragEnd);
    draggingItem.classList.add('dragging');
    if(navigator.vibrate) navigator.vibrate(20);
}
function onDragMove(e) {
    if(!draggingItem) return;
    e.preventDefault();
    const list = document.getElementById('vaultList');
    let clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    const siblings = [...list.querySelectorAll('.account-card:not(.dragging)')];
    let nextSibling = siblings.find(sibling => clientY <= sibling.getBoundingClientRect().top + sibling.offsetHeight / 2);
    list.insertBefore(draggingItem, nextSibling);
}
function onDragEnd() {
    if(!draggingItem) return;
    draggingItem.classList.remove('dragging');
    draggingItem = null;
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchend', onDragEnd);
    saveNewOrder();
}
function saveNewOrder() {
    const list = document.getElementById('vaultList');
    const cards = list.querySelectorAll('.account-card');
    const reorderedIds = [];
    cards.forEach(c => reorderedIds.push(Number(c.getAttribute('data-id'))));
    
    if(activeFolder !== 'All') {
        const folderItems = accounts.filter(a => a.folder === activeFolder);
        const sortedFolderItems = [];
        reorderedIds.forEach(id => {
            const item = folderItems.find(a => a.id === id);
            if(item) sortedFolderItems.push(item);
        });
        const otherItems = accounts.filter(a => a.folder !== activeFolder);
        accounts = [...sortedFolderItems, ...otherItems]; 
    } else {
         const newAccounts = [];
         reorderedIds.forEach(id => {
             const acc = accounts.find(a => a.id === id);
             if(acc) newAccounts.push(acc);
         });
         accounts = newAccounts;
    }
    saveToCloud();
}

// ================= قائمة السياق (نسخ/تعديل/حذف) =================
let currentCtxFolder = null;

function startFolderPress(f) {
    isLongPress = false;
    longPressTimer = setTimeout(() => { 
        isLongPress = true; 
        if(f !== 'عام') {
            currentCtxFolder = f;
            showOverlay('folderContextModal');
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }, 600);
}

function folderCtxAction(action) {
    goBack();
    setTimeout(() => {
        if (action === 'edit') {
            openAddFolderModal(currentCtxFolder);
        } else if (action === 'delete') {
            const appHash = localStorage.getItem('appHash');
            const doDelete = () => {
                customConfirm(`سيتم حذف المجلد "${currentCtxFolder}" وجميع الحسابات الموجودة بداخله نهائياً. هل أنت متأكد؟`, () => {
                    folders = folders.filter(f => f !== currentCtxFolder);
                    accounts = accounts.filter(a => a.folder !== currentCtxFolder);
                    
                    if (activeFolder === currentCtxFolder) activeFolder = 'All';
                    
                    saveToCloud();
                    renderVault();
                    renderFoldersBar();
                    showToast("تم حذف المجلد ومحتوياته بنجاح");
                });
            };

            if (appHash) {
                openPasswordModal("أدخل الرمز للحذف", async (v) => {
                    if (await hashString(v) === appHash) doDelete();
                    else showToast("رمز خاطئ");
                });
            } else doDelete();
        }
    }, 200);
}

function startPress(type, id) {
    isLongPress = false;
    longPressTimer = setTimeout(() => { isLongPress = true; openContextMenu(type, id); }, 800);
}
function cancelPress() { clearTimeout(longPressTimer); }

function openContextMenu(type, id) {
    currentCtxId = id; currentCtxType = type;
    showOverlay('contextModal');
    if (navigator.vibrate) navigator.vibrate(50);
}

function ctxAction(action) {
    goBack();
    const acc = accounts.find(a => a.id === currentCtxId);
    const appHash = localStorage.getItem('appHash');
    
    setTimeout(async () => {
        if (!acc) return;
        
        if (action === 'copy') {
            let textToCopy = acc.email;
            if (currentCtxType === 'pass') textToCopy = await decryptPass(acc.pass);
            if (currentCtxType === 'notes') textToCopy = await decryptPass(acc.notes);
            copyToClipboard(textToCopy);
        } 
        else if (action === 'delete') {
            const doDelete = () => {
                customConfirm("حذف نهائي؟", () => {
                    accounts = accounts.filter(a => a.id !== currentCtxId);
                    saveToCloud();
                    renderVault();
                    renderFoldersBar();
                    showToast("تم الحذف");
                });
            };

            if (appHash) {
                openPasswordModal("أدخل الرمز للحذف", async (v) => {
                    if (await hashString(v) === appHash) doDelete();
                    else showToast("رمز خاطئ");
                });
            } else doDelete();
        } 
        else if (action === 'edit') {
            const doEdit = async () => {
                document.getElementById('emailInput').value = acc.email;
                document.getElementById('passInput').value = await decryptPass(acc.pass);
                const notesInput = document.getElementById('notesInput');
                if (notesInput) notesInput.value = acc.notes ? await decryptPass(acc.notes) : '';
                accounts = accounts.filter(a => a.id !== currentCtxId);
                saveToCloud(); 
                renderVault();
                renderFoldersBar();
                if(document.getElementById('vaultPage').style.display === 'flex') goBack();
            };

            if (appHash) {
                openPasswordModal("أدخل الرمز للتعديل", async (v) => {
                    if (await hashString(v) === appHash) await doEdit();
                    else showToast("رمز خاطئ");
                });
            } else await doEdit();
        }
    }, 200);
}

// ================= الأمان العام والمساعدات =================
function openPasswordModal(t, cb) {
    document.getElementById('passModalTitle').innerText = t;
    document.getElementById('globalPassInput').value = '';
    showOverlay('passwordModal');
    pendingCallback = cb;
    setTimeout(()=>document.getElementById('globalPassInput').focus(), 100);
}

function customConfirm(m, cb) {
    document.getElementById('confirmMessage').innerText = m;
    const btn = document.getElementById('confirmYesBtn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.onclick = () => { goBack(); setTimeout(cb, 100); };
    showOverlay('confirmModal');
}

function startVaultPress() {
    isLongPress = false;
    vaultPressTimer = setTimeout(() => { isLongPress = true; handleVaultLongPress(); }, 800);
}
function cancelVaultPress() { clearTimeout(vaultPressTimer); }

async function handleVaultLongPress() {
    const vpHash = localStorage.getItem('vaultHash');
    if(vpHash) {
        openPasswordModal("إزالة قفل الخزنة", async v => { 
            if(await hashString(v) === vpHash){ 
                localStorage.removeItem('vaultHash'); 
                showToast("تم الإلغاء"); 
            } else showToast("خطأ"); 
        });
    } else {
        openPasswordModal("قفل الخزنة", async v => { 
            if(v){ 
                localStorage.setItem('vaultHash', await hashString(v)); 
                showToast("تم القفل");
            } 
        });
    }
}

async function openVaultCheck() {
    if(isLongPress) return;
    
    const vpHash = localStorage.getItem('vaultHash');
    if(vpHash) {
        openPasswordModal("رمز الخزنة", async v => { 
            if(await hashString(v) === vpHash) openVault(); 
            else showToast("خطأ"); 
        });
    } else openVault();
}

function openVault() {
    pushHistory('vault');
    document.getElementById('vaultPage').style.display = 'flex';
    renderFoldersBar(); renderVault();
}

function copyToClipboard(t) { navigator.clipboard.writeText(t).then(()=>showToast("تم النسخ")); }
function showToast(m) { const t=document.getElementById('toast'); t.innerText=m; t.style.opacity='1'; setTimeout(()=>t.style.opacity='0',2000); }

function toggleTheme() {
    const body = document.body;
    document.documentElement.removeAttribute('data-theme');
    
    body.classList.toggle('dark-theme');
    const isDark = body.classList.contains('dark-theme');
    
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) themeIcon.innerText = isDark ? "☀️" : "🌙";
    
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.removeAttribute('data-theme');
    const savedTheme = localStorage.getItem('theme');
    const themeIcon = document.getElementById('themeIcon');
    
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        if(themeIcon) themeIcon.innerText = "☀️";
    } else {
        document.body.classList.remove('dark-theme');
        if(themeIcon) themeIcon.innerText = "🌙";
    }

    const vaultList = document.getElementById('vaultList');
    if (vaultList) vaultList.addEventListener('scroll', cancelPress);
});

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('clearSearchBtn').style.display = 'none';
    renderVault();
}

let searchTimeout;
document.getElementById('searchInput')?.addEventListener('input', function() {
    document.getElementById('clearSearchBtn').style.display = this.value ? 'block' : 'none';
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        renderVault();
    }, 300); // تأخير 300 ملي ثانية قبل تنفيذ فك التشفير والبحث
});

function openSortModal() {
    showOverlay('sortModal');
    document.getElementById('check-newest').style.display = currentSort === 'newest' ? 'inline' : 'none';
    document.getElementById('check-oldest').style.display = currentSort === 'oldest' ? 'inline' : 'none';
    document.getElementById('check-az').style.display = currentSort === 'az' ? 'inline' : 'none';
}

function applySort(type, render = true) {
    currentSort = type;
    if(type === 'newest') accounts.sort((a,b) => b.id - a.id);
    if(type === 'oldest') accounts.sort((a,b) => a.id - b.id);
    if(type === 'az') accounts.sort((a,b) => (a.email||'').localeCompare(b.email||''));
    if (render) {
        renderVault();
        goBack();
    }
}
