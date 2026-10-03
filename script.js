/* ═══════════════════════════════════
   FIREBASE INIT & GLOBAL STATE
═══════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyBB_U4C880PW4GxZd8FALv8yBSiP2mNeBY",
  authDomain: "malaboushi.firebaseapp.com",
  databaseURL: "https://malaboushi-default-rtdb.firebaseio.com/",
  projectId: "malaboushi",
  storageBucket: "malaboushi.firebasestorage.app",
  messagingSenderId: "110336819350",
  appId: "1:110336819350:web:2b1b0488e72b811f0602b7"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const messaging = firebase.messaging();
const VERCEL_URL = 'https://neonchat-five.vercel.app';
const VAPID_KEY = 'BLyGo78MotBcNontRvYa14hdbwWLxjJBJ4AWFIj35Ek125D-SO2445PpX1tNuSgBv5MPQSZhgPyzNynvVitg68I'; 

// 🚀 تم إزالة نظام مزامنة السيرفر الوهمي والعودة للاعتماد على توقيت الجهاز (Date.now) لضمان دقة الترتيب
function getTrueTime() {
  return Date.now();
}

let internalMicId = null; 
let currentUser = null;
let myProfile = null;
let currentChat = null;
let chatsData = {};
let messagesRef = null;
let messagesListener = null;
let msgChangedListener = null;
let chatsListener = null;
let friendStatusRef = null;
let friendStatusListener = null;
let typingRef = null;
let typingListener = null;
let friendRequestsListener = null;
let myCallListener = null;
let friendsListListener = null;

let localStream = null;
let peerConnection = null;
let currentCallPeer = null;
let callDurationInt = null;
let callIsCaller = false;

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isRecordingCanceled = false;
let recordStart = 0;
let recordTimerInt = null;
let recordDurationStr = '0:00';
let isSingingMode = false;

let typingTimeout = null;
let baseStatusText = '';
let baseStatusColor = 'var(--text-secondary)';

let lastMsgDate = '';
let replyingToMsg = null;
let editingMsgKey = null;
let lastUnreads = {};
let isFirstChatsLoad = true;

const msgReadObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const msgKey = entry.target.getAttribute('data-msg-key');
      if (msgKey && currentChat) {
        db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({ read: true });
        db.ref('userChats/' + currentUser.uid + '/' + currentChat.chatId + '/unread').set(0);
        observer.unobserve(entry.target);
      }
    }
  });
}, { threshold: 0.1 });

/* ═══════════════════════════════════
   BACKGROUND CANVAS (مُحسن للبطارية)
═══════════════════════════════════ */
(function initBg() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function mkP() {
    return {
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.5 + .3,
      vx: (Math.random() - .5) * .15, vy: (Math.random() - .5) * .15,
      a: Math.random() * .6 + .2
    };
  }
  for (let i = 0; i < 40; i++) particles.push(mkP()); 

  function draw() {
    if (document.hidden || (document.getElementById('screen-chat') && document.getElementById('screen-chat').classList.contains('active'))) {
      setTimeout(() => requestAnimationFrame(draw), 500);
      return;
    }
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,240,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,240,255,${p.a})`; ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

/* ═══════════════════════════════════
   NAVIGATION & UTILS
═══════════════════════════════════ */
history.pushState({ screen: 'home' }, '', '');
window.addEventListener('popstate', e => {
  const imgOverlay = document.getElementById('img-preview-overlay');
  const videoOverlay = document.getElementById('video-preview-overlay');
  const msgMenuOverlay = document.getElementById('msg-menu-overlay');
  const modalOverlay = document.getElementById('modal-overlay');
  let isPopupOpen = false;

  if (imgOverlay && imgOverlay.classList.contains('open')) {
    closeImgPreview();
    isPopupOpen = true;
  }
  
  if (videoOverlay && videoOverlay.classList.contains('open')) {
    closeVideoPlayer();
    isPopupOpen = true;
  }
  
  if (msgMenuOverlay && msgMenuOverlay.classList.contains('open')) { closeMsgMenu(); isPopupOpen = true; }
  if (modalOverlay && modalOverlay.classList.contains('open')) { modalOverlay.classList.remove('open'); isPopupOpen = true; }

  let currentActiveScreen = 'home';
  document.querySelectorAll('.screen').forEach(s => { if (s.classList.contains('active')) currentActiveScreen = s.id.replace('screen-', ''); });
  
  if (isPopupOpen) { history.pushState({ screen: currentActiveScreen }, '', ''); return; }
  const targetScreen = e.state && e.state.screen ? e.state.screen : 'home';
  if (currentActiveScreen === 'home') { history.pushState({ screen: 'home' }, '', ''); return; }
  renderScreenUI(targetScreen);
  history.pushState({ screen: targetScreen }, '', '');
});

function showScreen(name) {
  history.pushState({ screen: name }, '', '');
  renderScreenUI(name);
}

function renderScreenUI(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  if (name === 'home') loadChats();
  if (name === 'profile') populateProfile();
  if (name === 'add-friend') { document.getElementById('friend-id-input').value = ''; document.getElementById('search-result-area').innerHTML = ''; }
  if (name === 'blocked-users') loadBlockedUsers();
  if (name !== 'chat') detachMessages();
}

let toastTimer;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast ${type} show`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function openModal(title, text) {
  return new Promise(resolve => {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').textContent = text;
    document.getElementById('modal-overlay').classList.add('open');
    const ok = document.getElementById('modal-ok'), can = document.getElementById('modal-cancel');
    function cleanup(v) { document.getElementById('modal-overlay').classList.remove('open'); ok.onclick = null; can.onclick = null; resolve(v); }
    ok.onclick = () => cleanup(true); can.onclick = () => cleanup(false);
  });
}

function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 150) + 'px'; }
function escHtml(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatTime(ts) { return ts ? new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''; }
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'اليوم';
  const yes = new Date(now); yes.setDate(now.getDate() - 1);
  if (d.toDateString() === yes.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' });
}

/* ═══════════════════════════════════
   AUTH & PRESENCE
═══════════════════════════════════ */
function formatEmail(input) {
  input = input.trim().toLowerCase();
  if (!input) return '';
  return !input.includes('@') ? input + '@neonchat.app' : input;
}

const emailInput = document.getElementById('login-email');
const passInput = document.getElementById('login-pass');
const passConfirmInput = document.getElementById('login-pass-confirm');
const btnLogin = document.getElementById('btn-custom-login');
const btnSignup = document.getElementById('btn-custom-signup');

if(btnLogin) {
  btnLogin.addEventListener('click', async () => {
    const rawEmail = emailInput.value, pass = passInput.value;
    if (!rawEmail || !pass) { showToast('الرجاء إدخال اسم المستخدم وكلمة المرور', 'error'); return; }
    const email = formatEmail(rawEmail);
    btnLogin.disabled = true; btnLogin.textContent = 'جاري الدخول...';
    try { await auth.signInWithEmailAndPassword(email, pass); } 
    catch (e) { showToast(e.code === 'auth/wrong-password' ? 'كلمة المرور غير صحيحة!' : 'تأكد من البيانات', 'error'); } 
    finally { btnLogin.disabled = false; btnLogin.textContent = 'دخول'; }
  });
}

if(btnSignup) {
  btnSignup.addEventListener('click', async () => {
    const rawEmail = emailInput.value, pass = passInput.value, passConf = passConfirmInput.value;
    if (!rawEmail || !pass || !passConf) { showToast('الرجاء تعبئة جميع الحقول', 'error'); return; }
    if (pass !== passConf) { showToast('كلمتي المرور غير متطابقتين!', 'error'); return; }
    if (pass.length < 6) { showToast('كلمة المرور 6 أحرف على الأقل', 'error'); return; }
    const email = formatEmail(rawEmail);
    btnSignup.disabled = true; btnSignup.textContent = 'جاري الإنشاء...';
    try {
      const userCred = await auth.createUserWithEmailAndPassword(email, pass);
      if (!rawEmail.includes('@')) await userCred.user.updateProfile({ displayName: rawEmail });
      showToast('تم إنشاء الحساب بنجاح!', 'success');
    } catch (e) { showToast('فشل الإنشاء', 'error'); } 
    finally { btnSignup.disabled = false; btnSignup.textContent = 'إنشاء حساب'; }
  });
}

async function initMicrophone() {
  try {
    let temp = await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    temp.getTracks().forEach(t => t.stop());
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    for (let dev of audioInputs) {
      const label = dev.label.toLowerCase();
      if (!label.includes('bluetooth') && !label.includes('bt') && !label.includes('headset')) {
        if (label.includes('built-in') || label.includes('internal') || label.includes('phone') || label.includes('مدمج')) {
          internalMicId = dev.deviceId; break;
        }
      }
    }
  } catch (e) { console.log('تعذر تجهيز المايك مسبقاً'); }
}

window.localImageCache = {}; // 🚀 السحر هون: ذاكرة تخزين مؤقتة لمنع رجفة الصورة وإعادة تحميلها

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => console.log("Auth Error:", err)).finally(() => {
  auth.onAuthStateChanged(async user => {
    const loader = document.getElementById('loader-screen');
    if (loader) loader.classList.add('hidden');
    if (user) {
      currentUser = user;
      try { await ensureUserProfile(user); } catch(e) {}
      if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') Notification.requestPermission();
      setupPresence(user.uid);
      try {
        const swReg = await navigator.serviceWorker.register('./sw.js');
        const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
        if (token) await db.ref('users/' + user.uid + '/fcmToken').set(token);
        
        // تحديث التوكن تلقائياً بصمت إذا تغير بالخلفية لضمان استمرار وصول الإشعارات
        messaging.onTokenRefresh(async () => {
          try {
            const newToken = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
            if (newToken) await db.ref('users/' + user.uid + '/fcmToken').set(newToken);
          } catch (e) {}
        });
      } catch (err) {}
      initCallListener(user.uid); initFriendRequestsListener(user.uid); initFriendsListListener(user.uid); 
      initMicrophone(); 
      syncPendingMessages();
      wakeUpCloudinary(); // 🚀 إرسال النبضة الخفية أول ما يشتغل التطبيق
      showScreen('home');
    } else {
      if (!navigator.onLine && localStorage.getItem('myProfile')) return; 
      currentUser = null; myProfile = null;
      renderScreenUI('login');
    }
  });
});

function setupPresence(uid) {
  const myStatusRef = db.ref('users/' + uid + '/status');
  const connectedRef = db.ref('.info/connected');

  let isConnected = false;
  let lastHiddenTime = 0; // لضبط وقت الخروج من الشاشة

  // مراقبة اتصال الإنترنت من سيرفر فايربيس
  connectedRef.on('value', snap => {
    isConnected = snap.val() === true;
    if (isConnected) {
      // السحر هون: تسجيل توقيت السيرفر لحظة الانقطاع الفعلي بدل توقيت الجوال لحظة الاتصال
      myStatusRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
      if (document.visibilityState === 'visible') {
        myStatusRef.set('online');
      } else {
        myStatusRef.set(firebase.database.ServerValue.TIMESTAMP);
      }
    }
  });

  // مراقبة الشاشة (نظامية) - مع إنعاش الاتصال الإجباري
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // إذا مر على الخروج من الشاشة أكثر من 3 ثواني، نعمل إنعاش للاتصال لقتل "الزومبي سوكيت"
      if (Date.now() - lastHiddenTime > 3000) {
        firebase.database().goOffline();
        firebase.database().goOnline();
      }
      
      if (isConnected && navigator.onLine) {
        myStatusRef.set('online');
        // إعادة ضبط أمر الانقطاع لضمان الدقة
        myStatusRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
        syncPendingMessages(); // تأكيد إرسال أي رسايل كانت معلقة أثناء القفل
      }
    } else {
      lastHiddenTime = Date.now();
      if (isConnected && navigator.onLine) {
        myStatusRef.set(firebase.database.ServerValue.TIMESTAMP);
        if (currentChat && currentUser) {
          db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove();
        }
      }
    }
  });

  // 🚀 إضافة استشعار فصل الواي فاي أو البيانات فورياً من الجوال
  window.addEventListener('offline', () => {
    myStatusRef.set(firebase.database.ServerValue.TIMESTAMP);
    if (currentChat && currentUser) {
      db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove();
    }
  });

  window.addEventListener('online', () => {
    // فور رجوع النت، اقطع الاتصال الوهمي واتصل من جديد فوراً
    firebase.database().goOffline();
    firebase.database().goOnline();
    
    if (document.visibilityState === 'visible') {
      myStatusRef.set('online');
      myStatusRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
      syncPendingMessages();
      wakeUpCloudinary(); // 🚀 إنعاش كلاوديناري مع رجعة النت
    }
  });
}

async function ensureUserProfile(user) {
  const ref = db.ref('users/' + user.uid);
  const snap = await ref.once('value');
  if (snap.exists()) {
    myProfile = snap.val();
    if (!myProfile.uniqueId) {
      myProfile.uniqueId = await generateUniqueId();
      await ref.update({ uniqueId: myProfile.uniqueId });
    } else await db.ref('userIds/' + myProfile.uniqueId).set(user.uid);
  } else {
    const uniqueId = await generateUniqueId();
    myProfile = { uid: user.uid, name: user.displayName || 'مستخدم', photo: user.photoURL || '', uniqueId, createdAt: Date.now() };
    await ref.set(myProfile);
  }
  updateHomeHeader();
  localStorage.setItem('myProfile', JSON.stringify(myProfile));
}

async function generateUniqueId() {
  while (true) {
    const id = String(Math.floor(100000 + Math.random() * 900000));
    const snap = await db.ref('userIds/' + id).once('value');
    if (!snap.exists()) { await db.ref('userIds/' + id).set(currentUser.uid); return id; }
  }
}

function cleanupListeners() {
  if (currentUser) {
    if (chatsListener) db.ref('userChats/' + currentUser.uid).off('value', chatsListener);
    if (friendRequestsListener) db.ref('friendRequests/' + currentUser.uid).off('value', friendRequestsListener);
    if (friendsListListener) db.ref('friendsList/' + currentUser.uid).off();
    if (myCallListener) db.ref('calls/' + currentUser.uid).off('value', myCallListener);
    Object.keys(presenceListeners).forEach(fUid => db.ref('users/' + fUid).off('value', presenceListeners[fUid]));
    presenceListeners = {};
    if (typeof blockedByThemListeners !== 'undefined') {
      Object.keys(blockedByThemListeners).forEach(fUid => db.ref('blockedUsers/' + fUid + '/' + currentUser.uid).off('value', blockedByThemListeners[fUid]));
      blockedByThemListeners = {};
    }
  }
  detachMessages();
}

function confirmLogout() {
  openModal('تسجيل الخروج', 'هل أنت متأكد أنك تريد تسجيل الخروج؟').then(ok => {
    if (ok) {
      if (currentUser) db.ref('users/' + currentUser.uid + '/status').set(Date.now());
      cleanupListeners();
      auth.signOut().then(() => {
        localStorage.removeItem('myProfile');
        const avatarEl = document.getElementById('profile-avatar');
        if(avatarEl) avatarEl.outerHTML = `<div class="profile-avatar" id="profile-avatar">أ</div>`;
        renderScreenUI('login');
      });
    }
  });
}

function updateHomeHeader() {
  if (!myProfile) return;
  document.getElementById('home-subtitle').textContent = 'مرحباً، ' + myProfile.name.split(' ')[0];
  document.getElementById('my-id-badge').textContent = myProfile.uniqueId;
  const av = document.getElementById('home-avatar');
  if (myProfile.photo) av.outerHTML = `<img class="home-avatar" src="${myProfile.photo}" onclick="showScreen('profile')" id="home-avatar"/>`;
  else { av.className = 'home-avatar-placeholder'; av.textContent = myProfile.name.charAt(0); }
}

function copyMyId() {
  if (!myProfile) return;
  navigator.clipboard.writeText(myProfile.uniqueId).then(() => showToast('تم نسخ الـ ID', 'success')).catch(() => showToast('رقمك: ' + myProfile.uniqueId));
}

function populateProfile() {
  if (!myProfile) return;
  document.getElementById('profile-name-input').value = myProfile.name;
  document.getElementById('profile-id-value').textContent = myProfile.uniqueId;
  const av = document.getElementById('profile-avatar');
  if (myProfile.photo) av.outerHTML = `<img class="profile-avatar" src="${myProfile.photo}" id="profile-avatar"/>`;
  else av.textContent = myProfile.name.charAt(0);
}

async function saveProfileName() {
  const newName = document.getElementById('profile-name-input').value.trim();
  if (!newName || !myProfile) return;
  showToast('جاري الحفظ...');
  try {
    await db.ref('users/' + myProfile.uid).update({ name: newName });
    myProfile.name = newName; localStorage.setItem('myProfile', JSON.stringify(myProfile));
    updateHomeHeader(); showToast('تم تغيير الاسم بنجاح', 'success');
  } catch (e) { showToast('فشل الحفظ', 'error'); }
}

document.getElementById('file-avatar-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !myProfile) return;
  e.target.value = ''; showToast('جاري رفع الصورة...');
  try {
    const SUPA_URL = 'https://boksjjglizmzmqoxzmhy.supabase.co';
    const SUPA_KEY = 'sb_publishable_Vil5AiRd1aZ6GwiHZUaNmg_N8I47i1y';
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    const cleanName = `avatar_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    
    const res = await fetch(`${SUPA_URL}/storage/v1/object/chat-media/${cleanName}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPA_KEY}`, 'apikey': SUPA_KEY, 'Content-Type': file.type || 'image/jpeg' },
        body: file
    });
    
    if (res.ok) {
      const finalUrl = `${SUPA_URL}/storage/v1/object/public/chat-media/${cleanName}`;
      await db.ref('users/' + myProfile.uid).update({ photo: finalUrl });
      myProfile.photo = finalUrl; localStorage.setItem('myProfile', JSON.stringify(myProfile));
      updateHomeHeader(); populateProfile(); showToast('تم تحديث الصورة', 'success');
    } else throw new Error('تعذر الرفع');
  } catch (e) { showToast('فشل رفع الصورة', 'error'); }
});

/* ═══════════════════════════════════
   CHATS & FRIENDS LIST
═══════════════════════════════════ */
let friendsStatus = {};
let friendsLiveProfiles = {};
let presenceListeners = {};
let myBlockedUsers = {};
let myBlockedUsersListener = null;
let blockedByThemStatus = {};
let blockedByThemListeners = {};

function loadChats() {
  if (!currentUser) return;
  if (!myBlockedUsersListener) {
    myBlockedUsersListener = db.ref('blockedUsers/' + currentUser.uid).on('value', snap => {
      myBlockedUsers = snap.val() || {};
      renderChatsList();
      if (document.getElementById('screen-my-friends').classList.contains('active')) {
         const container = document.getElementById('my-friends-container');
         if(container) { Array.from(container.children).forEach(child => {
            const fId = child.id.replace('friend-card-', '');
            if(myBlockedUsers[fId]) child.style.display = 'none'; else child.style.display = 'flex';
         });}
      }
    });
  }
  if (chatsListener) db.ref('userChats/' + currentUser.uid).off('value', chatsListener);
  chatsListener = db.ref('userChats/' + currentUser.uid).orderByChild('updatedAt').on('value', snap => {
    chatsData = {}; let hasNew = false;
    if (snap.exists()) {
      snap.forEach(c => {
        const d = c.val(); chatsData[c.key] = d;
        if (!isFirstChatsLoad && d.unread > (lastUnreads[c.key] || 0)) hasNew = true;
        lastUnreads[c.key] = d.unread;
        
        if (!presenceListeners[d.friendUid]) {
          presenceListeners[d.friendUid] = db.ref('users/' + d.friendUid).on('value', sSnap => {
            const fData = sSnap.val() || {};
            friendsStatus[d.friendUid] = fData.status;
            friendsLiveProfiles[d.friendUid] = fData;
            renderChatsList();
          });
        }
        
        // 🚀 السحر هون: الاستماع إذا هاد الشخص حظرني عشان أخفي صورته وحالته بالرئيسية
        if (!blockedByThemListeners[d.friendUid]) {
          blockedByThemListeners[d.friendUid] = db.ref('blockedUsers/' + d.friendUid + '/' + currentUser.uid).on('value', bSnap => {
            blockedByThemStatus[d.friendUid] = bSnap.exists();
            renderChatsList();
          });
        }
      });
    }
    renderChatsList();
    if (hasNew && !document.getElementById('screen-chat').classList.contains('active') && navigator.vibrate) navigator.vibrate([100, 50, 100]);
    setTimeout(() => isFirstChatsLoad = false, 1000);
  });
}

function renderChatsList(filter = '') {
  const list = document.getElementById('chats-list'), empty = document.getElementById('chats-empty');
  const items = Object.entries(chatsData).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  
  const getFriendData = (uid, data) => {
    let name = (friendsLiveProfiles[uid] && friendsLiveProfiles[uid].name) ? friendsLiveProfiles[uid].name : data.friendName;
    let photo = (friendsLiveProfiles[uid] && friendsLiveProfiles[uid].photo) ? friendsLiveProfiles[uid].photo : data.friendPhoto;
    
    // إذا كان حاظرني، مخفي صورته فوراً من الرئيسية
    if (blockedByThemStatus[uid]) {
      photo = '';
    }
    
    return { name, photo };
  };

  let filtered = filter ? items.filter(([, v]) => getFriendData(v.friendUid, v).name && getFriendData(v.friendUid, v).name.includes(filter)) : items;
  filtered = filtered.filter(([, v]) => !myBlockedUsers[v.friendUid]);
  if (!filtered.length) { empty.style.display = 'flex'; list.querySelectorAll('.chat-item').forEach(e => e.remove()); return; }
  empty.style.display = 'none'; list.querySelectorAll('.chat-item').forEach(e => e.remove());
  
  filtered.forEach(([chatId, data]) => {
    const div = document.createElement('div'); div.className = 'chat-item';
    const liveData = getFriendData(data.friendUid, data);
    
    const initials = (liveData.name || '?').charAt(0);
    const avatarHtml = liveData.photo ? `<img src="${liveData.photo}" class="chat-avatar" style="object-fit:cover; cursor:pointer;" onclick="event.stopPropagation(); window.previewImg('${liveData.photo}')"/>` : `<div class="chat-avatar">${initials}</div>`;
    
    // إذا حاظرني، ما بخليه يطلع "متصل الآن" أبداً
    const isOnline = !blockedByThemStatus[data.friendUid] && friendsStatus[data.friendUid] === 'online';
    const onlineBadge = isOnline ? `<div style="position:absolute; bottom:2px; right:2px; width:13px; height:13px; background:var(--neon-green); border-radius:50%; border:2px solid var(--bg-surface); z-index:2;"></div>` : '';
    
    const lastMsg = data.lastMsg || 'اضغط لبدء المحادثة';
    div.innerHTML = `<div style="position:relative; display:inline-block; flex-shrink:0;">${avatarHtml}${onlineBadge}</div><div class="chat-info"><div class="chat-name">${escHtml(liveData.name||'مستخدم')}</div><div class="chat-last-msg">${escHtml(lastMsg)}</div></div><div class="chat-meta"><div class="chat-time">${data.updatedAt ? formatTime(data.updatedAt) : ''}</div>${data.unread > 0 ? `<div class="chat-badge">${data.unread}</div>` : ''}</div>`;
    
    // التمرير السريع الفوري مع إرسال البيانات المحدثة
    div.addEventListener('click', () => openChat(chatId, data.friendUid, { name: liveData.name, photo: liveData.photo }));
    
    let pressTimer;
    div.addEventListener('touchstart', () => { pressTimer = setTimeout(() => { openHomeChatMenu(chatId, data.friendUid, liveData.name); }, 600); }, { passive: true });
    div.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
    div.addEventListener('touchend', () => clearTimeout(pressTimer));
    div.addEventListener('contextmenu', e => { e.preventDefault(); openHomeChatMenu(chatId, data.friendUid, liveData.name); });
    list.appendChild(div);
  });
}

function filterChats(val) { renderChatsList(val); }

async function searchFriend() {
  const idVal = document.getElementById('friend-id-input').value.trim();
  if (idVal.length !== 6) { showToast('أدخل 6 أرقام صحيحة', 'error'); return; }
  document.getElementById('btn-search-friend').textContent = 'جاري البحث…';
  try {
    const snap = await db.ref('userIds/' + idVal).once('value');
    if (!snap.exists()) { showToast('لم يُعثر على مستخدم', 'error'); return; }
    const uid = snap.val();
    if (uid === currentUser.uid) { showToast('هذا رقمك أنت 😄', 'error'); return; }
    const userSnap = await db.ref('users/' + uid).once('value');
    renderSearchResult(userSnap.val(), uid);
  } catch (e) {} finally { document.getElementById('btn-search-friend').textContent = 'بحث'; }
}

function renderSearchResult(friend, uid) {
  document.getElementById('search-result-area').innerHTML = `<div class="search-result-card"><div class="search-result-avatar">${(friend.name || '?').charAt(0)}</div><div class="search-result-info"><div class="search-result-name">${escHtml(friend.name)}</div><div class="search-result-id">${friend.uniqueId}</div></div><button class="btn-primary" id="btn-send-req-${uid}" style="width:auto;padding:11px 20px;font-size:13px" onclick="sendFriendRequest('${uid}')">إرسال طلب</button></div>`;
}

async function sendFriendRequest(friendUid) {
  if (!currentUser || !myProfile) return;
  const btn = document.getElementById(`btn-send-req-${friendUid}`);
  btn.disabled = true; btn.textContent = 'جاري الإرسال...';
  try {
    const isBlockedByMe = (await db.ref('blockedUsers/' + currentUser.uid + '/' + friendUid).once('value')).exists();
    if (isBlockedByMe) { showToast('لقد قمت بحظر هذا الشخص', 'error'); btn.disabled = false; btn.textContent = 'إرسال طلب'; return; }
    
    const isBlockedByThem = (await db.ref('blockedUsers/' + friendUid + '/' + currentUser.uid).once('value')).exists();
    if (isBlockedByThem) { showToast('لا يمكنك إرسال طلب لهذا المستخدم', 'error'); btn.disabled = false; btn.textContent = 'إرسال طلب'; return; }

    await db.ref('friendRequests/' + friendUid + '/' + currentUser.uid).set({ uid: currentUser.uid, name: myProfile.name, timestamp: Date.now() });
    showToast('تم إرسال طلب الصداقة بنجاح', 'success'); btn.textContent = 'تم الإرسال ✔';
  } catch (e) { btn.disabled = false; btn.textContent = 'إرسال طلب'; }
}

function initFriendRequestsListener(uid) {
  if (friendRequestsListener) db.ref('friendRequests/' + uid).off('value', friendRequestsListener);
  friendRequestsListener = db.ref('friendRequests/' + uid).on('value', snap => {
    const list = document.getElementById('friend-requests-list'), badge = document.getElementById('home-req-badge');
    if (!snap.exists()) { if (badge) badge.style.display = 'none'; if (list) list.innerHTML = '<div style="text-align:center;">لا توجد طلبات</div>'; return; }
    let count = 0, htmlStr = '';
    snap.forEach(reqSnap => {
      count++; const req = reqSnap.val();
      htmlStr += `<div class="search-result-card" style="padding:12px 16px;"><div class="search-result-avatar" style="width:40px;height:40px;">${(req.name || '?').charAt(0)}</div><div class="search-result-info"><div class="search-result-name" style="font-size:14px;margin-bottom:0;">${escHtml(req.name)}</div></div><div style="display:flex;gap:6px;"><button class="btn-primary" style="width:auto;padding:6px 12px;font-size:12px;background:var(--neon-green);box-shadow:none;" onclick="acceptFriendRequest('${req.uid}')">موافقة</button><button class="btn-danger" style="width:auto;padding:6px 12px;font-size:12px;" onclick="rejectFriendRequest('${req.uid}')">رفض</button></div></div>`;
    });
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
    if (list) list.innerHTML = htmlStr;
  });
}

async function acceptFriendRequest(friendUid) {
  try {
    await db.ref('friendRequests/' + currentUser.uid + '/' + friendUid).remove();
    await startChat(friendUid); showToast('تم القبول وبدء المحادثة!', 'success');
  } catch (e) {}
}

async function rejectFriendRequest(friendUid) {
  await db.ref('friendRequests/' + currentUser.uid + '/' + friendUid).remove(); showToast('تم رفض الطلب');
}

async function startChat(friendUid) {
  if (!currentUser || !myProfile) return;
  const friendSnap = await db.ref('users/' + friendUid).once('value'); const friend = friendSnap.val();
  const chatId = [currentUser.uid, friendUid].sort().join('_');
  await db.ref('chats/' + chatId + '/meta').update({ participants: [currentUser.uid, friendUid], createdAt: Date.now() });
  await db.ref('userChats/' + currentUser.uid + '/' + chatId).update({ friendUid, friendName: friend.name, friendPhoto: friend.photo || '', updatedAt: Date.now(), lastMsg: 'ابدأ المحادثة الآن!', unread: 0 });
  await db.ref('userChats/' + friendUid + '/' + chatId).update({ friendUid: currentUser.uid, friendName: myProfile.name, friendPhoto: myProfile.photo || '', updatedAt: Date.now(), lastMsg: 'ابدأ المحادثة الآن!', unread: 0 });
  await db.ref('friendsList/' + currentUser.uid + '/' + friendUid).update({ name: friend.name, photo: friend.photo || '', timestamp: Date.now() });
  await db.ref('friendsList/' + friendUid + '/' + currentUser.uid).update({ name: myProfile.name, photo: myProfile.photo || '', timestamp: Date.now() });
  openChat(chatId, friendUid, friend);
}

function initFriendsListListener(uid) {
  const container = document.getElementById('my-friends-container'); if (!container) return;
  db.ref('friendsList/' + uid).off(); container.innerHTML = '';
  db.ref('friendsList/' + uid).on('child_added', snap => {
    const friendUid = snap.key, fData = snap.val();
    if (document.getElementById('friend-card-' + friendUid)) return;
    const card = document.createElement('div'); card.className = 'search-result-card'; card.id = 'friend-card-' + friendUid;
    card.style.cssText = `padding:12px 16px; margin-bottom:8px; display:${myBlockedUsers[friendUid] ? 'none' : 'flex'}; align-items:center;`;
    card.innerHTML = `<div class="search-result-avatar" style="width:40px;height:40px;font-size:15px;">${fData.photo ? `<img src="${fData.photo}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"/>` : (fData.name || '?').charAt(0)}</div><div class="search-result-info" style="flex:1; margin-right:12px;"><div class="search-result-name" id="friend-name-text-${friendUid}" style="font-size:16px;margin-bottom:0;">${escHtml(fData.name)}</div></div><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:13px;" onclick="startChat('${friendUid}')">مراسلة</button>`;
    container.appendChild(card);
  });
}

/* ═══════════════════════════════════
   OPEN CHAT & MESSAGES
═══════════════════════════════════ */
let currentMessagesQuery = null;

let iAmBlockedRef = null;
let iAmBlockedListener = null;

function detachMessages() {
  if (messagesRef) { messagesRef.off(); messagesListener = null; msgChangedListener = null; }
  if (friendStatusRef && friendStatusListener) { friendStatusRef.off('value', friendStatusListener); friendStatusRef = null; friendStatusListener = null; }
  if (typingRef && typingListener) { typingRef.off('value', typingListener); typingRef = null; typingListener = null; }
  if (iAmBlockedRef && iAmBlockedListener) { iAmBlockedRef.off('value', iAmBlockedListener); iAmBlockedRef = null; iAmBlockedListener = null; }
}

// 🚀 نظام النبضة الخفية: لإبقاء كلاوديناري مستيقظاً ومنع تعليق أول تسجيل صوتي
let lastCloudinaryWake = 0;
function wakeUpCloudinary() {
  const now = Date.now();
  // نبعت النبضة مرة وحدة كل 5 دقايق عشان ما نعمل ضغط عالفاضي
  if (now - lastCloudinaryWake < 300000) return; 
  lastCloudinaryWake = now;
  
  const fd = new FormData();
  fd.append('upload_preset', 'omarhweh1');
  // نبعت طلب ناقص (بدون ملف) عن قصد.. السيرفر بيصحى، بيهيئ الاتصال، وبضل جاهز للتسجيل الحقيقي!
  fetch('https://api.cloudinary.com/v1_1/sggwmi1c/auto/upload', { method: 'POST', body: fd }).catch(()=>{});
}

async function openChat(chatId, friendUid, friendProfile = null) {
  renderScreenUI('chat'); 
  detachMessages();
  wakeUpCloudinary(); // 🚀 تسخين السيرفر أول ما تفتح المحادثة

  if (!friendProfile) {
    const snap = await db.ref('users/' + friendUid).once('value');
    friendProfile = snap.val();
  }
  currentChat = { chatId, friendUid, friendProfile };

  const avatarEl = document.getElementById('chat-header-avatar');
  if (friendProfile.photo) {
    avatarEl.outerHTML = `<img src="${friendProfile.photo}" class="chat-header-avatar" id="chat-header-avatar" style="object-fit:cover; cursor:pointer;" onclick="window.previewImg('${friendProfile.photo}')"/>`;
  } else {
    avatarEl.outerHTML = `<div class="chat-header-avatar" id="chat-header-avatar">${(friendProfile.name||'?').charAt(0)}</div>`;
  }
  document.getElementById('chat-header-name').textContent = friendProfile.name;

  db.ref('userChats/' + currentUser.uid + '/' + chatId + '/unread').set(0);

  attachMessages(chatId);

  const statusEl = document.getElementById('chat-header-status');
  statusEl.textContent = 'جاري التحقق...';
  statusEl.style.color = 'var(--text-muted)';

  friendStatusRef = db.ref('users/' + friendUid);
  
  let isBlockedByThem = false;
  let blockTimestamp = null;
  let realFriendData = {};

  function updateChatHeaderUI() {
    const fData = { ...realFriendData };
    if (isBlockedByThem) {
       fData.photo = ''; 
       fData.status = blockTimestamp; 
    }
    
    currentChat.friendProfile = fData;
    
    const avatarEl = document.getElementById('chat-header-avatar');
    if (avatarEl) {
      if (fData.photo) {
        avatarEl.outerHTML = `<img src="${fData.photo}" class="chat-header-avatar" id="chat-header-avatar" style="object-fit:cover; cursor:pointer;" onclick="window.previewImg('${fData.photo}')"/>`;
      } else {
        avatarEl.outerHTML = `<div class="chat-header-avatar" id="chat-header-avatar">${(fData.name||'?').charAt(0)}</div>`;
      }
    }
    
    const nameEl = document.getElementById('chat-header-name');
    if (nameEl) nameEl.textContent = fData.name || 'مستخدم';
    
    document.querySelectorAll('.msg-friend-avatar').forEach(el => {
      let commonStyle = 'width:32px !important; height:32px !important; min-width:32px !important; min-height:32px !important; max-width:32px !important; max-height:32px !important; border-radius:50%; object-fit:cover; flex-shrink:0; align-self:flex-end; border:1px solid rgba(0, 240, 255, 0.4); margin: 0 6px; z-index:2;';
      let bgStyle = 'background:linear-gradient(135deg, var(--neon-blue), var(--neon-purple));';
      
      if (fData.photo) {
        if (el.tagName !== 'IMG') {
          const newEl = document.createElement('img');
          newEl.className = 'msg-friend-avatar';
          newEl.src = fData.photo;
          newEl.style.cssText = commonStyle + 'cursor:pointer;';
          newEl.onclick = (e) => { e.stopPropagation(); window.previewImg(fData.photo); };
          el.replaceWith(newEl);
        } else {
          el.src = fData.photo;
          el.style.cssText = commonStyle + 'cursor:pointer;';
          el.onclick = (e) => { e.stopPropagation(); window.previewImg(fData.photo); };
        }
      } else {
        if (el.tagName === 'IMG') {
          const newEl = document.createElement('div');
          newEl.className = 'msg-friend-avatar';
          newEl.textContent = (fData.name || '?').charAt(0);
          newEl.style.cssText = commonStyle + bgStyle + 'display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:bold; color:white;';
          el.replaceWith(newEl);
        } else {
          el.textContent = (fData.name || '?').charAt(0);
        }
      }
    });

    const statusEl = document.getElementById('chat-header-status');
    const val = fData.status;
    if (val === 'online') {
      baseStatusText = '🟢 متصل الآن';
      baseStatusColor = 'var(--neon-green)';
    } else if (val && typeof val === 'number') {
      const d = new Date(val);
      const now = new Date();
      let prefix = '';
      if (d.toDateString() === now.toDateString()) {
        prefix = 'اليوم';
      } else {
        const yes = new Date(now);
        yes.setDate(now.getDate() - 1);
        prefix = d.toDateString() === yes.toDateString() ? 'أمس' : d.toLocaleDateString('ar-EG', {
          day: '2-digit', month: 'short'
        });
      }
      baseStatusText = '🔴 آخر ظهور: ' + prefix + ' ' + formatTime(val);
      baseStatusColor = 'var(--text-secondary)';
    } else {
      baseStatusText = '🔴 غير متصل';
      baseStatusColor = 'var(--text-secondary)';
    }
    
    if (statusEl) {
       const cur = statusEl.textContent;
       if (!cur.includes('يكتب') && !cur.includes('يسجل')) {
         statusEl.textContent = baseStatusText;
         statusEl.style.color = baseStatusColor;
       }
    }
  }

  iAmBlockedRef = db.ref('blockedUsers/' + friendUid + '/' + currentUser.uid);
  iAmBlockedListener = iAmBlockedRef.on('value', bSnap => {
     isBlockedByThem = bSnap.exists();
     blockTimestamp = bSnap.val();
     updateChatHeaderUI();
  });

  friendStatusListener = friendStatusRef.on('value', snap => {
    realFriendData = snap.val() || {};
    updateChatHeaderUI();
  });

  typingRef = db.ref('chats/' + chatId + '/typing/' + friendUid);
  typingListener = typingRef.on('value', snap => {
    if (isBlockedByThem) return; // منع إظهار حالة الكتابة للمحظور
    const state = snap.val();
    const statusEl = document.getElementById('chat-header-status');
    if (!statusEl) return;
    
    if (state === 'typing') {
      statusEl.textContent = '✍️ يكتب الآن...';
      statusEl.style.color = 'var(--neon-cyan)';
    } else if (state === 'recording') {
      statusEl.textContent = '🎙️ يسجل مقطع صوتي...';
      statusEl.style.color = 'var(--neon-pink)';
    } else {
      statusEl.textContent = baseStatusText;
      statusEl.style.color = baseStatusColor;
    }
  });
}

function attachMessages(chatId) {
  const area = document.getElementById('messages-area');
  area.innerHTML = '';
  lastMsgDate = '';
  oldestMsgTimestamp = null;
  oldestMsgKey = null; 
  isLoadingHistory = false;
  hasMoreHistory = true;
  
  // منع تدخل المتصفح العشوائي
  area.style.overflowAnchor = 'none';

  // 🚀 إنشاء زر النزول السريع برمجياً مع عداد الرسائل الجديدة
  let scrollFab = document.getElementById('scroll-bottom-fab');
  if (!scrollFab) {
    scrollFab = document.createElement('div');
    scrollFab.id = 'scroll-bottom-fab';
    scrollFab.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg><div id="scroll-fab-badge" style="display:none; position:absolute; top:-6px; right:-6px; background:var(--neon-pink); color:white; font-size:11px; font-weight:bold; width:20px; height:20px; border-radius:50%; align-items:center; justify-content:center; box-shadow:0 0 10px var(--neon-pink); border:2px solid var(--bg-surface); font-family:var(--font-en);">0</div>`;
    scrollFab.style.cssText = `position:absolute; bottom:calc(var(--input-h) + 20px); right:20px; width:44px; height:44px; background:var(--bg-glass); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border:1px solid var(--border-glow); border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--neon-cyan); box-shadow:var(--shadow-neon); cursor:pointer; z-index:50; opacity:0; pointer-events:none; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); transform:translateY(20px) scale(0.9);`;
    document.getElementById('screen-chat').appendChild(scrollFab);
    scrollFab.onclick = () => { area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' }); };
  }
  scrollFab.style.opacity = '0';
  scrollFab.style.pointerEvents = 'none';
  scrollFab.style.transform = 'translateY(20px) scale(0.9)';
  const fabBadge = document.getElementById('scroll-fab-badge');
  if (fabBadge) { fabBadge.style.display = 'none'; fabBadge.textContent = '0'; }

  db.ref('userChats/' + currentChat.friendUid + '/' + chatId).update({
    friendName: myProfile.name,
    friendPhoto: myProfile.photo || ''
  });

  const cacheKey = 'chat_cache_' + chatId;
  const cachedData = localStorage.getItem(cacheKey);
  let liveMsgsCache = [];
  
  if (cachedData) {
    try {
      liveMsgsCache = JSON.parse(cachedData);
      const fragment = document.createDocumentFragment();
      let tempLastDate = '';
      
      liveMsgsCache.forEach(m => {
        const dStr = formatDate(m.timestamp);
        if (dStr !== tempLastDate) {
          const sep = document.createElement('div');
          sep.className = 'date-sep';
          sep.innerHTML = `<span>${dStr}</span>`;
          fragment.appendChild(sep);
          tempLastDate = dStr;
        }
        fragment.appendChild(buildMsgEl(m, true));
      });
      
      area.appendChild(fragment);
      area.scrollTop = area.scrollHeight;
      
                        if (liveMsgsCache.length > 0) {
                    lastMsgDate = tempLastDate;
                    oldestMsgKey = liveMsgsCache[0].key;
                    oldestMsgTimestamp = liveMsgsCache[0].timestamp;
                  }
                } catch (e) {
                  liveMsgsCache = [];
                }
              }

              // 🚀 عرض الرسائل المعلقة (الأوفلاين) مباشرة عند فتح المحادثة لتجنب اختفاء الفويسات
              let pending = JSON.parse(localStorage.getItem('neon_pending_msgs') || '[]');
              pending.filter(p => p.chatId === chatId).forEach(p => {
                 const el = buildMsgEl(p.msg, true);
                 el.id = 'row_' + p.key;
                 area.appendChild(el);
              });

              messagesRef = db.ref('chats/' + chatId + '/messages');
  
  // 🚀 الحل الجذري: نلغي الاعتماد على startAt نهائياً لأنه يسبب اختفاء الرسائل لو توقيت الأجهزة مختلف
  currentMessagesQuery = messagesRef.orderByKey().limitToLast(100);
  
  if (liveMsgsCache.length > 0) {
    // التحديث الصامت: جلب حالة آخر 50 رسالة وتحديث المؤشرات بدون إعادة بناء الواجهة
    messagesRef.orderByKey().limitToLast(50).once('value', snapshot => {
      if(snapshot.exists()) {
        snapshot.forEach(child => {
          const m = child.val();
          const ticksEl = document.getElementById('ticks-' + child.key);
          if (ticksEl) {
            if (m.type === 'voice' && m.listened) {
              ticksEl.setAttribute('stroke', '#00ff88');
              ticksEl.style.stroke = '#00ff88';
              ticksEl.innerHTML = '<polyline points="24 6 13 17 8 12"></polyline><polyline points="20 6 9 17 4 12"></polyline>';
            } else if (m.read) {
              ticksEl.setAttribute('stroke', '#00f0ff');
              ticksEl.style.stroke = '#00f0ff';
              ticksEl.innerHTML = '<polyline points="24 6 13 17 8 12"></polyline><polyline points="20 6 9 17 4 12"></polyline>';
            }
          }
          // تحديث الكاش المحلي إذا في اختلاف بالحالة
          const cacheIdx = liveMsgsCache.findIndex(cached => cached.key === child.key);
          if (cacheIdx !== -1 && (liveMsgsCache[cacheIdx].read !== m.read || liveMsgsCache[cacheIdx].listened !== m.listened)) {
             liveMsgsCache[cacheIdx].read = m.read;
             liveMsgsCache[cacheIdx].listened = m.listened;
             localStorage.setItem(cacheKey, JSON.stringify(liveMsgsCache));
          }
        });
      }
    });
  }

  let scrollTimeout;

  messagesListener = currentMessagesQuery.on('child_added', snap => {
    const msg = { ...snap.val(), key: snap.key };
    
    // 🚀 تنظيف فوري لأي رسالة علقت بالداتا بيز بمفتاح خاطئ عشان ما تضل تطبع بآخر الشاشة
    if (msg.key && (msg.key.startsWith('pending_') || msg.key.startsWith('temp_'))) {
        db.ref('chats/' + chatId + '/messages/' + msg.key).remove();
        return;
    }

    if ((msg.type === 'video' || msg.type === 'audio' || msg.type === 'image') && msg.timestamp) {
      // الصور والفيديو 24 ساعة، الصوت ساعة واحدة
                      // الصور والفيديو 24 ساعة، الصوت ساعة واحدة
                const EXPIRY_TIME = (msg.type === 'video' || msg.type === 'image') ? (24 * 60 * 60 * 1000) : (60 * 60 * 1000);
                // 🚀 استخدام الوقت الحقيقي لحساب العمر ومنع التدمير الفوري إذا كان توقيت أحد الجوالين غير دقيق
                const age = getTrueTime() - msg.timestamp;
                
                if (age > EXPIRY_TIME) {
    deleteExpiredMedia(chatId, msg);
        return; 
      } else {
        setTimeout(() => {
          deleteExpiredMedia(chatId, msg);
        }, EXPIRY_TIME - age);
      }
    }

    const existsInCache = liveMsgsCache.some(m => m.key === msg.key);
    if (!existsInCache) {
      liveMsgsCache.push(msg);
      if (liveMsgsCache.length > 100) liveMsgsCache.shift(); 
      localStorage.setItem(cacheKey, JSON.stringify(liveMsgsCache));
    }

    if (document.getElementById('msg-' + msg.key)) {
      // 🚀 إصلاح اختفاء الرسالة: إذا كانت الرسالة موجودة مسبقاً كرسالة معلقة (أوفلاين)، نستبدلها بالنسخة الرسمية
      const existingRow = document.getElementById('msg-' + msg.key).closest('.msg-row');
      if (existingRow && existingRow.querySelector('.pending-overlay')) {
         existingRow.replaceWith(buildMsgEl(msg, false));
      }
      return; 
    }

    if (!oldestMsgKey || snap.key < oldestMsgKey) {
      oldestMsgKey = snap.key;
    }
    if (!oldestMsgTimestamp || msg.timestamp < oldestMsgTimestamp) {
      oldestMsgTimestamp = msg.timestamp;
    }

    const dateStr = formatDate(msg.timestamp);
    if (dateStr !== lastMsgDate) {
      const sep = document.createElement('div');
      sep.className = 'date-sep';
      sep.innerHTML = `<span>${dateStr}</span>`;
      area.appendChild(sep);
      lastMsgDate = dateStr;
    }
    
    // فحص إذا المستخدم قريب من الأسفل قبل إضافة الرسالة
    const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 150;
    
    area.appendChild(buildMsgEl(msg, false)); 
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      // بينزل لتحت بس إذا كنت أصلاً تحت أو أنت اللي بعتت الرسالة
      if (isNearBottom || msg.senderUid === currentUser.uid) {
        area.scrollTop = area.scrollHeight;
      } else if (msg.senderUid !== currentUser.uid) {
        // 🚀 تشغيل عداد الرسائل في الزر إذا كنت عم تقرأ فوق
        const fab = document.getElementById('scroll-bottom-fab');
        const badge = document.getElementById('scroll-fab-badge');
        if (fab && badge) {
          fab.style.opacity = '1';
          fab.style.pointerEvents = 'all';
          fab.style.transform = 'translateY(0) scale(1)';
          let count = parseInt(badge.textContent || '0') + 1;
          badge.textContent = count;
          badge.style.display = 'flex';
        }
      }
    }, 50);

  });

  area.addEventListener('scroll', async () => {
    // 🚀 إغلاق القائمة المنسدلة تلقائياً عند التمرير مشان ما تضل معلقة
    const menuOverlay = document.getElementById('msg-menu-overlay');
    if (menuOverlay && menuOverlay.classList.contains('open')) closeMsgMenu();

    // 🚀 التحكم بظهور زر النزول السريع وإخفاؤه
    const fab = document.getElementById('scroll-bottom-fab');
    const badge = document.getElementById('scroll-fab-badge');
    if (fab && badge) {
      if (area.scrollHeight - area.scrollTop - area.clientHeight < 150) {
        fab.style.opacity = '0';
        fab.style.pointerEvents = 'none';
        fab.style.transform = 'translateY(20px) scale(0.9)';
        badge.style.display = 'none';
        badge.textContent = '0';
      } else {
        fab.style.opacity = '1';
        fab.style.pointerEvents = 'all';
        fab.style.transform = 'translateY(0) scale(1)';
      }
    }

    if (area.scrollTop <= 5 && !isLoadingHistory && hasMoreHistory && oldestMsgKey) {
      isLoadingHistory = true;
      
      const oldScrollTop = area.scrollTop;

      const loader = document.createElement('div');
      loader.id = 'history-loader';
      loader.innerHTML = '<div style="text-align:center; padding:10px; font-size:12px; color:var(--neon-cyan);">جاري التحميل...</div>';
      area.insertBefore(loader, area.firstChild);

      const snap = await messagesRef.orderByKey().endAt(oldestMsgKey).limitToLast(100).once('value');
      
      loader.remove(); 

      if (snap.exists()) {
        const msgs = [];
        snap.forEach(child => {
          if (child.key !== oldestMsgKey) { 
            msgs.push({ ...child.val(), key: child.key });
          }
        });
        
        if (msgs.length > 0) {
          oldestMsgKey = msgs[0].key;
          oldestMsgTimestamp = msgs[0].timestamp;
          
          const baseScrollHeight = area.scrollHeight;
          
          const fragment = document.createDocumentFragment();
          let tempLastDate = '';
          msgs.forEach(m => {
            const dStr = formatDate(m.timestamp);
            if (dStr !== tempLastDate) {
              const sep = document.createElement('div');
              sep.className = 'date-sep';
              sep.innerHTML = `<span>${dStr}</span>`;
              fragment.appendChild(sep);
              tempLastDate = dStr;
            }
            fragment.appendChild(buildMsgEl(m, true)); 
          });
          
          area.insertBefore(fragment, area.firstChild);
          
          const allSeps = area.querySelectorAll('.date-sep');
          let lastTxt = '';
          allSeps.forEach(sep => {
             if(sep.innerText === lastTxt) sep.remove();
             else lastTxt = sep.innerText;
          });

          // ─── السحر الثاني: إيقاف النعومة مؤقتاً لمنع الطيران ───
          area.style.scrollBehavior = 'auto'; 
          area.scrollTop = area.scrollHeight - baseScrollHeight + oldScrollTop;
          
          // إعادة النعومة بعد جزء من الثانية
          setTimeout(() => {
            area.style.scrollBehavior = 'smooth';
          }, 50);
          // ──────────────────────────────────────────────────────
        } else {
          hasMoreHistory = false;
        }
      } else {
        hasMoreHistory = false;
      }
      
      isLoadingHistory = false;
    }
  });

  msgChangedListener = messagesRef.on('child_changed', snap => {
    const msg = { ...snap.val(), key: snap.key };
    
    const idx = liveMsgsCache.findIndex(m => m.key === msg.key);
    if (idx !== -1) {
      liveMsgsCache[idx] = msg;
      localStorage.setItem(cacheKey, JSON.stringify(liveMsgsCache));
    }

    if (msg.isEdited && !msg.isDeleted && msg.type === 'text') {
      const bubbleEl = document.getElementById('msg-' + msg.key);
      if (bubbleEl) {
        const tempRow = buildMsgEl(msg, true);
        const tempBubble = tempRow.querySelector('.msg-bubble');
        if (tempBubble) {
          bubbleEl.innerHTML = tempBubble.innerHTML;
        }
      }
    }
    
    if (msg.type === 'voice' && msg.listened) {
      const dot = document.getElementById('unplayed-' + msg.key);
      if (dot) {
        dot.style.background = 'transparent';
        dot.style.boxShadow = 'none';
      }
    }

    const ticksEl = document.getElementById('ticks-' + msg.key);
    if (ticksEl) {
      if (msg.type === 'voice' && msg.listened) {
        ticksEl.setAttribute('stroke', '#00ff88');
        ticksEl.style.stroke = '#00ff88';
        ticksEl.innerHTML = '<polyline points="24 6 13 17 8 12"></polyline><polyline points="20 6 9 17 4 12"></polyline>';
      } else if (msg.read) {
        ticksEl.setAttribute('stroke', '#00f0ff');
        ticksEl.style.stroke = '#00f0ff';
        ticksEl.innerHTML = '<polyline points="24 6 13 17 8 12"></polyline><polyline points="20 6 9 17 4 12"></polyline>';
      }
    }
    const reactEl = document.getElementById('react-' + msg.key);
    if (reactEl) {
      if (msg.reaction) {
        reactEl.style.display = 'flex';
        reactEl.innerHTML = msg.reaction;
      } else {
        reactEl.style.display = 'none';
      }
    }
    if (msg.isDeleted) {
      const bubbleEl = document.getElementById('msg-' + msg.key);
      if (bubbleEl) {
        bubbleEl.style.background = 'transparent';
        bubbleEl.style.border = '1px solid var(--border-subtle)';
        bubbleEl.innerHTML = '<div style="color:var(--text-muted);font-style:italic;font-size:12px;">🚫 تم حذف هذه الرسالة</div>';
      }
    }
  });
}

function buildMsgEl(msg, isBackground = false) {
  // فحص أمان: إذا الرسالة صوت أو صورة وما فيها رابط، أو نص وفاضي، منعطل ظهورها
  if ((msg.type === 'voice' || msg.type === 'audio' || msg.type === 'image' || msg.type === 'video') && !msg.url && !msg.isPending) {
    const dummy = document.createElement('div');
    dummy.style.display = 'none';
    return dummy;
  }
  if (msg.type === 'text' && (!msg.text || !msg.text.trim())) {
    const dummy = document.createElement('div');
    dummy.style.display = 'none';
    return dummy;
  }

  if (msg.isDeleted) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + (msg.senderUid === currentUser.uid ? 'out' : 'in');
    if (isBackground) row.style.animation = 'none';
    row.innerHTML = `<div class="msg-bubble" id="msg-${msg.key}" style="background:transparent;border:1px solid var(--border-subtle);color:var(--text-muted);font-style:italic;font-size:12px;">🚫 تم حذف هذه الرسالة</div>`;
    return row;
  }
  const row = document.createElement('div');
  const isOut = msg.senderUid === currentUser.uid;
  row.className = 'msg-row ' + (isOut ? 'out' : 'in');
  
  if (isBackground || (msg.url && window.lastUploadedUrl === msg.url)) {
    row.style.animation = 'none';
    if (msg.url === window.lastUploadedUrl) window.lastUploadedUrl = null; 
  }

  // 🚀 تعريف الصورة بناءً على مين اللي باعت (أنت أو صديقك)
  const profile = isOut ? myProfile : (currentChat.friendProfile || {});
  let avatarNode = document.createElement(profile.photo ? 'img' : 'div');
  avatarNode.className = isOut ? 'msg-my-avatar' : 'msg-friend-avatar';
  
  // 🚀 السحر هون: ستايل إجباري مدمج مشان المتصفح المعند ما يكبرها أبداً
  let commonStyle = 'width:32px !important; height:32px !important; min-width:32px !important; min-height:32px !important; max-width:32px !important; max-height:32px !important; border-radius:50%; object-fit:cover; flex-shrink:0; align-self:flex-end; border:1px solid rgba(0, 240, 255, 0.4); margin: 0 6px; z-index:2;';
  let bgStyle = isOut ? 'background:linear-gradient(135deg, var(--neon-cyan), var(--neon-blue));' : 'background:linear-gradient(135deg, var(--neon-blue), var(--neon-purple));';
  
  if (profile.photo) {
    avatarNode.src = profile.photo;
    avatarNode.style.cssText = commonStyle + 'cursor:pointer;';
    avatarNode.onclick = (e) => {
      e.stopPropagation();
      window.previewImg(profile.photo);
    };
  } else {
    avatarNode.textContent = (profile.name || '?').charAt(0);
    avatarNode.style.cssText = commonStyle + bgStyle + 'display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:bold; color:white;';
  }

  // إذا صديقك اللي باعت، الصورة بتنحط قبل فقاعة الدردشة
  if (!isOut) {
    row.appendChild(avatarNode);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble'; 
  if (msg.type === 'image' || msg.type === 'video') bubble.classList.add('msg-bubble-media');
  bubble.id = 'msg-' + msg.key;
  let replyIcon = document.createElement('div');
  replyIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--neon-cyan)" stroke-width="2.5"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>`;
  replyIcon.style.cssText = `position:absolute; top:50%; margin-top:-11px; transform:scale(0); opacity:0; transition:all 0.2s ease-out; z-index:-1;`;
  row.style.position = 'relative'; row.appendChild(replyIcon);
  
    let lastTap = 0, pressTimer, singleTapTimer, touchStartX = 0, touchStartY = 0, isSwiping = false, isVertical = false;

  bubble.addEventListener('touchstart', e => {
    if (e.target.tagName === 'A') return;
    
    const now = Date.now();
    if (now - lastTap < 300 && now - lastTap > 0) { 
      clearTimeout(singleTapTimer); 
      toggleReaction(msg.key); 
      lastTap = 0; 
      if (e.cancelable) e.preventDefault(); 
      return; 
    }
    lastTap = now;
    touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
    isSwiping = false; isVertical = false;
    bubble.style.transition = 'none';

    if (e.target.tagName === 'IMG' && !e.target.closest('.video-thumb-container')) { e.target.style.opacity = '0.85'; } 

    pressTimer = setTimeout(() => { if (!isSwiping && !isVertical && !msg.isPending) openMsgMenu(msg, isOut); }, 500);
  }, { passive: false });

  bubble.addEventListener('touchmove', e => {
    if (e.target.tagName === 'A' || !touchStartX) return;
    const dx = e.touches[0].clientX - touchStartX, dy = e.touches[0].clientY - touchStartY;
    
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      isVertical = true; clearTimeout(pressTimer);
      bubble.style.transition = 'transform 0.2s ease-out'; bubble.style.transform = 'translateX(0)';
      replyIcon.style.transform = `scale(0)`; replyIcon.style.opacity = '0'; return;
    }
    
    if (Math.abs(dx) > 15 && !isVertical && !msg.isPending) {
      isSwiping = true; clearTimeout(pressTimer);
      let limit = Math.min(Math.abs(dx), 65) * Math.sign(dx); bubble.style.transform = `translateX(${limit}px)`;
      
      let pullPerc = Math.min(Math.abs(dx) / 50, 1);
      replyIcon.style.transition = 'none'; replyIcon.style.opacity = pullPerc; replyIcon.style.transform = `scale(${pullPerc})`;
      
      if (dx > 0) { replyIcon.style.left = '55px'; replyIcon.style.right = 'auto'; } 
      else { replyIcon.style.right = '20px'; replyIcon.style.left = 'auto'; }
      
      if (pullPerc > 0.85) {
        replyIcon.style.filter = `drop-shadow(0 0 8px var(--neon-cyan))`;
        if (navigator.vibrate && !bubble.hasVibrated) { navigator.vibrate(15); bubble.hasVibrated = true; }
      } else { replyIcon.style.filter = 'none'; bubble.hasVibrated = false; }
    }
  }, { passive: true });

  bubble.addEventListener('touchend', e => {
    if (e.target.tagName === 'A') return;

    if (e.target.tagName === 'IMG' && !e.target.closest('.video-thumb-container')) { 
      e.target.style.opacity = '1'; 
    }
    
    clearTimeout(pressTimer);
    bubble.style.transition = 'transform 0.2s ease-out'; bubble.style.transform = 'translateX(0)';
    replyIcon.style.transition = 'all 0.2s ease-out'; replyIcon.style.transform = `scale(0)`; replyIcon.style.opacity = '0';
    bubble.hasVibrated = false;

    if (isSwiping && Math.abs(e.changedTouches[0].clientX - touchStartX) > 45) { 
      prepareReply(msg); if (navigator.vibrate) navigator.vibrate(40); 
    } else if (!isSwiping && !isVertical && lastTap > 0 && (Date.now() - lastTap < 400)) {
      singleTapTimer = setTimeout(() => {
        if (e.target.closest('.video-thumb-container')) {
          openVideoPlayer(msg.url);
        } else if (e.target.tagName === 'IMG') {
          window.previewImg(e.target.src);
        }
      }, 250);
    }
    isSwiping = false; touchStartX = 0; touchStartY = 0;
  });

  bubble.addEventListener('contextmenu', e => { if (e.target.tagName === 'A' || msg.isPending) return; e.preventDefault(); clearTimeout(pressTimer); openMsgMenu(msg, isOut); });

  let ticks = '';
  if (isOut && !msg.isPending) {
    let color = msg.read ? '#00f0ff' : 'var(--text-muted)';
    if (msg.type === 'voice' && msg.listened) color = '#00ff88'; 
    const content = (msg.read || msg.listened) ? '<polyline points="24 6 13 17 8 12"></polyline><polyline points="20 6 9 17 4 12"></polyline>' : '<polyline points="20 6 9 17 4 12"></polyline>';
    ticks = `<svg id="ticks-${msg.key}" width="14" height="14" viewBox="0 0 28 18" fill="none" stroke="${color}" stroke-width="2" style="margin-left:4px;margin-bottom:-2px;">${content}</svg>`;
  }
  const timeEl = `<div class="msg-time">${msg.isEdited ? '<span style="font-size:10px;opacity:0.7;">(معدلة)</span>' : ''}${ticks}${formatTime(msg.timestamp)}</div>`;
  const reactHtml = `<div id="react-${msg.key}" class="msg-reaction" style="display:${msg.reaction?'flex':'none'}">${msg.reaction||''}</div>`;
  
  let replyHtml = '';
  if (msg.replyTo) { replyHtml = `<div onclick="scrollToMessage('${msg.replyTo.key}')" style="cursor:pointer;"><div class="reply-badge">↩ رد على رسالة</div><div style="background:rgba(0,0,0,0.2);padding:6px;border-radius:6px;margin-bottom:6px;border-right:2px solid var(--neon-cyan);font-size:12px;opacity:0.8;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escHtml(msg.replyTo.text)}</div></div>`; }

  if (msg.type === 'text') {
    let safeText = escHtml(msg.text).replace(/(https?:\/\/[^\s]+)/g, function(url) {
      if (url.includes('instagram.com')) {
        let intentUrl = 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;end;';
        return `<a href="${intentUrl}" target="_top" rel="noopener noreferrer" style="color: var(--neon-cyan); text-decoration: underline; word-break: break-all;">${url}</a>`;
      }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--neon-cyan); text-decoration: underline; word-break: break-all;">${url}</a>`;
    });
    bubble.innerHTML = `${replyHtml}<div>${safeText}</div>${timeEl}${reactHtml}`;
  } else if (msg.type === 'image') {
    const imgId = 'img_' + msg.key;
    const isEncrypted = msg.url.includes('enc_img_') || msg.url.endsWith('.bin');
    
    if (window.localImageCache && window.localImageCache[msg.url]) {
        bubble.innerHTML = `${replyHtml}<img id="${imgId}" class="msg-img" src="${window.localImageCache[msg.url]}" style="pointer-events: auto;" onclick="window.previewImg(this.src)"/>${timeEl}${reactHtml}`;
    } else {
        bubble.innerHTML = `${replyHtml}
            <div id="loader_${imgId}" style="width:200px; height:150px; background:rgba(0,240,255,0.05); border-radius:12px; display:flex; align-items:center; justify-content:center; border:1px solid var(--border-subtle);">
                <div style="width:24px; height:24px; border:2px solid var(--neon-cyan); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>
            </div>
            <img id="${imgId}" class="msg-img" src="" style="display:none; pointer-events: auto;" onclick="window.previewImg(this.src)"/>
            ${timeEl}${reactHtml}`;
        
        if (!msg.isPending) {
            setTimeout(async () => {
                const decryptedUrl = isEncrypted ? await decryptImageUrl(msg.url) : msg.url;
                const imgEl = document.getElementById(imgId);
                const loaderEl = document.getElementById(`loader_${imgId}`);
                if (imgEl && loaderEl) {
                    imgEl.src = decryptedUrl;
                    imgEl.onload = () => {
                        loaderEl.style.display = 'none';
                        imgEl.style.display = 'block';
                    };
                }
            }, 50);
        }
    }
    } else if (msg.type === 'video') {
    const fileSize = msg.size ? `<div class="video-meta-badge">${msg.size} MB</div>` : '';
    bubble.innerHTML = `${replyHtml}<div class="video-thumb-container" style="background:#050b12; border:1px solid var(--border-subtle);">
        <div class="video-play-icon" style="pointer-events: none;"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
        ${fileSize}
      </div>${timeEl}${reactHtml}`;
  } else if (msg.type === 'audio') {
    const bars = Array.from({ length: 20 }, () => `<div class="voice-bar" style="height:${Math.floor(Math.random()*70)+20}%"></div>`).join('');
    let unplayedDot = (!isOut && !msg.isPending && !msg.listened) ? `<div id="unplayed-${msg.key}" style="width:10px;height:10px;background:var(--neon-green);border-radius:50%;margin-left:8px;box-shadow:0 0 6px var(--neon-green);flex-shrink:0;"></div>` : '';
    
    let btnStyle = typeof globalVoiceSpeed !== 'undefined' && globalVoiceSpeed > 1 ? 'background:var(--neon-cyan); color:var(--bg-void);' : 'background:rgba(0,240,255,0.1); color:var(--neon-cyan);';
    let currentSpd = typeof globalVoiceSpeed !== 'undefined' ? globalVoiceSpeed : 1;
    let speedBtn = `<button id="speed-${msg.key}" onclick="toggleVoiceSpeed(this, '${msg.key}')" style="${btnStyle} border:1px solid var(--neon-cyan); border-radius:6px; padding:0 4px; font-size:10px; font-family:var(--font-en); cursor:pointer; margin-right:8px; font-weight:bold; height:18px; line-height:1;">${currentSpd}x</button>`;
    
    bubble.innerHTML = `${replyHtml}<div class="voice-msg">${unplayedDot}<button class="voice-play-btn" onclick="playVoice(this,'${msg.url}', '${msg.key}', ${isOut})"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button><div class="voice-waveform" style="position:relative; cursor:pointer;" onclick="seekVoice(event, '${msg.url}', '${msg.key}')">${bars}<div id="progress-${msg.key}" class="voice-progress-fill" style="position:absolute; right:0; top:0; bottom:0; width:0%; background:rgba(0,240,255,0.4); pointer-events:none; z-index:1; border-radius:2px; transition: width 0.1s linear;"></div></div><div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;">${speedBtn}<span id="dur-${msg.key}" class="voice-duration" data-orig="${msg.duration||'🎵 أغنية'}">${msg.duration||'🎵 أغنية'}</span></div></div>${timeEl}${reactHtml}`;
  } else if (msg.type === 'voice') {
 if ('caches' in window && !msg.isPending) caches.open('media-cache').then(c => c.match(msg.url).then(cached => { if (!cached) fetch(msg.url).then(res => c.put(msg.url, res)).catch(()=>{}); }));
    const bars = Array.from({ length: 20 }, () => `<div class="voice-bar" style="height:${Math.floor(Math.random()*70)+20}%"></div>`).join('');
    let unplayedDot = (!isOut && !msg.isPending && !msg.listened) ? `<div id="unplayed-${msg.key}" style="width:10px;height:10px;background:var(--neon-green);border-radius:50%;margin-left:8px;box-shadow:0 0 6px var(--neon-green);flex-shrink:0;"></div>` : '';
    
    let btnStyle = typeof globalVoiceSpeed !== 'undefined' && globalVoiceSpeed > 1 ? 'background:var(--neon-cyan); color:var(--bg-void);' : 'background:rgba(0,240,255,0.1); color:var(--neon-cyan);';
    let currentSpd = typeof globalVoiceSpeed !== 'undefined' ? globalVoiceSpeed : 1;
    let speedBtn = `<button id="speed-${msg.key}" onclick="toggleVoiceSpeed(this, '${msg.key}')" style="${btnStyle} border:1px solid var(--neon-cyan); border-radius:6px; padding:0 4px; font-size:10px; font-family:var(--font-en); cursor:pointer; margin-right:8px; font-weight:bold; height:18px; line-height:1;">${currentSpd}x</button>`;
    
    bubble.innerHTML = `${replyHtml}<div class="voice-msg">${unplayedDot}<button class="voice-play-btn" onclick="playVoice(this,'${msg.url}', '${msg.key}', ${isOut})"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button><div class="voice-waveform" style="position:relative; cursor:pointer;" onclick="seekVoice(event, '${msg.url}', '${msg.key}')">${bars}<div id="progress-${msg.key}" class="voice-progress-fill" style="position:absolute; right:0; top:0; bottom:0; width:0%; background:rgba(0,240,255,0.4); pointer-events:none; z-index:1; border-radius:2px; transition: width 0.1s linear;"></div></div><div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;">${speedBtn}<span id="dur-${msg.key}" class="voice-duration" data-orig="${msg.duration||'0:00'}">${msg.duration||'0:00'}</span></div></div>${timeEl}${reactHtml}`;
  }
  
  if (msg.isPending) {
    const overlay = document.createElement('div'); overlay.className = 'pending-overlay';
    overlay.style.cssText = 'position:absolute; inset:0; background:rgba(0,0,0,0.6); border-radius:inherit; display:flex; align-items:center; justify-content:center; z-index:10; flex-direction:column; gap:8px;';
    overlay.innerHTML = `<div style="width:24px; height:24px; border:3px solid rgba(0, 240, 255, 0.3); border-top-color:var(--neon-cyan); border-radius:50%; animation:spin .8s linear infinite;"></div>`;
    bubble.style.overflow = 'hidden'; bubble.appendChild(overlay);
  }
  row.appendChild(bubble);

  // 🚀 إذا أنت اللي باعت، الصورة بتنحط بعد فقاعة الدردشة (عشان تطلع عاليسار ويكون الشكل متوازن)
  if (isOut) {
    row.appendChild(avatarNode);
  }

  if (!isOut && !msg.read && !msg.isDeleted) {
    row.setAttribute('data-msg-key', msg.key);
    msgReadObserver.observe(row);
  }

  return row;
}

/* ═══════════════════════════════════
   ملاحظة: تم إزالة الكود المكرر من هنا
   لأنه كان يسبب تعارضاً مع دالة الرفع المخصصة
   للفيديوهات والمقاطع الصوتية الموجودة في الأسفل.
═══════════════════════════════════ */

/* تم تنظيف دالة تشغيل الصوت القديمة من هنا لمنع التكرار */

/* ═══════════════════════════════════
   SEND MESSAGES (TEXT), REACTION & MENU
═══════════════════════════════════ */
let lastTypingTime = 0; // لضبط الإرسال لفايربيز

document.getElementById('msg-input').addEventListener('input', () => {
  if (!currentChat || isRecording || myBlockedUsers[currentChat.friendUid]) return;
  
  const now = Date.now();
  const typingRef = db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid);
  
  if (now - lastTypingTime > 1500) {
    typingRef.set('typing');
    // هون السحر: لو فصل النت أو تسكر التطبيق فجأة، السيرفر بيمسح جاري الكتابة لحاله
    typingRef.onDisconnect().remove(); 
    lastTypingTime = now;
  }
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (currentChat) {
      typingRef.remove();
      typingRef.onDisconnect().cancel(); // نلغي أمر الحذف التلقائي لأننا حذفناه نظامي
    }
    lastTypingTime = 0;
  }, 2000);
});

function handleMsgKey(e) { if (e.key === 'Enter' && !e.shiftKey) { return; } }

async function sendTextMsg() {
  if (isRecording) { stopRecording(); return; }
  if (currentChat) { db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove(); clearTimeout(typingTimeout); }
  
  const inp = document.getElementById('msg-input');
  const text = inp.value.trim();

  // فحص ذكي لحالة الكيبورد الحقيقية بالاعتماد على مساحة الشاشة (أدق بمليون مرة)
  let isKbReallyOpen = false;
  if (window.visualViewport) {
    isKbReallyOpen = window.visualViewport.height < window.screen.height * 0.75;
  } else {
    isKbReallyOpen = window.innerHeight < window.screen.height * 0.75;
  }

  if (!text || !currentChat) {
    if (isKbReallyOpen) inp.focus();
    return;
  }
  
  inp.value = ''; autoResize(inp); 
  
  if (isKbReallyOpen) {
    inp.focus(); 
  } else {
    inp.blur(); // إجبار الكيبورد يضل مسكر
  }

  if (editingMsgKey) { await db.ref('chats/' + currentChat.chatId + '/messages/' + editingMsgKey).update({ text, isEdited: true }); updateLastMsgAfterChange(); editingMsgKey = null; showToast('تم تعديل الرسالة', 'success'); return; }
  let replyData = null;
  if (replyingToMsg) { replyData = { key: replyingToMsg.key, text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : replyingToMsg.type === 'video' ? '🎥 فيديو' : '🎙️ صوت' }; cancelReply(); }
  await pushMessage({ type: 'text', text, senderUid: currentUser.uid, timestamp: Date.now(), replyTo: replyData });
}

async function syncPendingMessages() {
  if (window.isSyncingMsgs) return;
  window.isSyncingMsgs = true;

  let pending = JSON.parse(localStorage.getItem('neon_pending_msgs') || '[]');
  if (pending.length === 0) { window.isSyncingMsgs = false; return; }
  
  const now = Date.now();
  const validPending = [];
  let hasChanges = false;
  
  for (const p of pending) {
    // 🚀 تقليل مدة الاحتفاظ بالرسائل المعلقة لـ 1 ساعة لقتل أي رسالة زومبي معطوبة تلقائياً وتنظيف جوالك
    if (now - p.time > 3600000) { hasChanges = true; continue; } 
    
    // الرفع لـ Supabase أولاً
    if (p.msg.type === 'voice' && p.msg.url && p.msg.url.startsWith('data:audio')) {
        try {
            const res = await fetch(p.msg.url);
            const blob = await res.blob();
            const SUPA_URL = 'https://boksjjglizmzmqoxzmhy.supabase.co';
            const SUPA_KEY = 'sb_publishable_Vil5AiRd1aZ6GwiHZUaNmg_N8I47i1y';
            const cleanName = `voice_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.webm`;
            
            const uploadRes = await fetch(`${SUPA_URL}/storage/v1/object/chat-media/${cleanName}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${SUPA_KEY}`, 'apikey': SUPA_KEY, 'Content-Type': blob.type || 'audio/webm' },
                body: blob
            });
            
            if (uploadRes.ok) {
                p.msg.url = `${SUPA_URL}/storage/v1/object/public/chat-media/${cleanName}`;
                hasChanges = true;
            } else {
                validPending.push(p); continue;
            }
        } catch (err) {
            validPending.push(p); continue; 
        }
    }

    // الإرسال لفايربيس
    try {
        delete p.msg.isPending;
        
        const msgRef = db.ref('chats/' + p.chatId + '/messages/' + p.key);
        const snapshot = await msgRef.once('value');
        const trueTime = getTrueTime();
        
        // 🚀 نمنع تحديث الوقت إذا كانت الرسالة واصلة مسبقاً، عشان ما تنطبع تحت كأنها جديدة!
        if (!snapshot.exists()) {
            p.msg.timestamp = trueTime; 
            await msgRef.set(p.msg);
        }
        
        // 🚀 عزلنا كود التحديثات الجانبية بـ try-catch خاص عشان لو فشل ما يرجع الرسالة للطابور
        try {
            const lastMsg = p.msg.type === 'text' ? p.msg.text : p.msg.type === 'image' ? '📷 صورة' : p.msg.type === 'video' ? '🎥 فيديو' : p.msg.type === 'audio' ? '🎵 أغنية' : '🎙️ رسالة صوتية';
            if (p.friendUid) {
                await db.ref().update({
                  [`userChats/${currentUser.uid}/${p.chatId}/lastMsg`]: lastMsg, [`userChats/${currentUser.uid}/${p.chatId}/updatedAt`]: trueTime,
                  [`userChats/${p.friendUid}/${p.chatId}/lastMsg`]: lastMsg, [`userChats/${p.friendUid}/${p.chatId}/updatedAt`]: trueTime
                });
                db.ref(`userChats/${p.friendUid}/${p.chatId}/unread`).transaction(v => (v || 0) + 1);
            }
        } catch(metaErr) { console.error("تجاهل خطأ القائمة الجانبية", metaErr); }
        
        // 🚀 الإصلاح الجذري: نلغي الحذف الأعمى للرسالة.
        // فايربيز أصلاً بيحدث الرسالة وبيشيل شاشة التحميل لحاله (عن طريق messagesListener).
        // هون بس بنتأكد إذا لسا فيها pending-overlay (بحال ما تحدثت لسبب ما) نستبدلها بالرسالة النظيفة.
        const existingRow = document.getElementById('msg-' + p.key)?.closest('.msg-row');
        if (existingRow && existingRow.querySelector('.pending-overlay')) {
            existingRow.replaceWith(buildMsgEl(p.msg, false));
        } else if (document.getElementById('row_' + p.key)) {
            // تنظيف بحال علق الـ row المؤقت بدون msg id
            document.getElementById('row_' + p.key).remove();
        }
        
        hasChanges = true;
    } catch (e) {
        p.msg.isPending = true; 
        validPending.push(p);
    }
  }
  
  if (hasChanges || validPending.length !== pending.length) {
     localStorage.setItem('neon_pending_msgs', JSON.stringify(validPending));
  }
  window.isSyncingMsgs = false;
}

window.addEventListener('online', syncPendingMessages);

async function pushMessage(msg) {
  const { chatId, friendUid } = currentChat;
  
  // 🚀 توحيد التوقيت ليكون دقيق 100% مع السيرفر قبل الإرسال لمنع رمي الرسائل في الماضي
  msg.timestamp = getTrueTime();

  // فحص الحظر السريع: الاعتماد على المتغيرات المحلية لتفادي تجميد إرسال الرسائل والصوت
  let isBlockedByMe = false, isBlockedByThem = false;
  if (typeof myBlockedUsers !== 'undefined') {
     isBlockedByMe = !!myBlockedUsers[friendUid];
     isBlockedByThem = typeof blockedByThemStatus !== 'undefined' ? !!blockedByThemStatus[friendUid] : false;
  } else {
     // إذا ما كانت جاهزة، منعطيها مهلة نصف ثانية بس كرمال ما يعلق الإرسال
     try {
        isBlockedByMe = await Promise.race([db.ref('blockedUsers/' + currentUser.uid + '/' + friendUid).once('value').then(s => s.exists()), new Promise(r => setTimeout(() => r(false), 500))]);
        isBlockedByThem = await Promise.race([db.ref('blockedUsers/' + friendUid + '/' + currentUser.uid).once('value').then(s => s.exists()), new Promise(r => setTimeout(() => r(false), 500))]);
     } catch(e) {}
  }

  if (isBlockedByMe) { showToast('لقد قمت بحظر هذا الشخص، لا يمكنك المراسلة', 'error'); return; }
  if (isBlockedByThem) { showToast('لا يمكنك إرسال رسالة لهذا المستخدم', 'error'); return; }

  const ref = db.ref('chats/' + chatId + '/messages').push(); 
  msg.key = ref.key; // 🚀 تحديث المفتاح ليكون متطابق دائماً
  
  // 🚀 وضع الرسالة كمعلقة فقط إذا كان المتصفح أوفلاين فعلياً
  if (!navigator.onLine) {
      msg.isPending = true;
      let pending = JSON.parse(localStorage.getItem('neon_pending_msgs') || '[]');
      pending.push({ chatId, friendUid, msg, key: ref.key, time: Date.now() });
      localStorage.setItem('neon_pending_msgs', JSON.stringify(pending));
      
      // إضافتها للشاشة مباشرة كمعلقة ليراها المستخدم
      const area = document.getElementById('messages-area');
      if (area && !document.getElementById('row_' + ref.key)) {
         const el = buildMsgEl(msg, false);
         el.id = 'row_' + ref.key;
         area.appendChild(el);
         setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
      }
      return; // خروج لعدم وجود نت
  }

  // محاولة الإرسال الفوري للسيرفر
  try {
      await ref.set(msg);
  } catch(e) {
      // إذا فشل الرفع لسبب ما، نعيدها للمعلقات
      msg.isPending = true;
      let pending = JSON.parse(localStorage.getItem('neon_pending_msgs') || '[]');
      pending.push({ chatId, friendUid, msg, key: ref.key, time: Date.now() });
      localStorage.setItem('neon_pending_msgs', JSON.stringify(pending));
  }

  const lastMsg = msg.type === 'text' ? msg.text : msg.type === 'image' ? '📷 صورة' : msg.type === 'video' ? '🎥 فيديو' : msg.type === 'audio' ? '🎵 أغنية' : '🎙️ رسالة صوتية';
  await db.ref().update({
    [`userChats/${currentUser.uid}/${chatId}/lastMsg`]: lastMsg, [`userChats/${currentUser.uid}/${chatId}/updatedAt`]: msg.timestamp,
    [`userChats/${friendUid}/${chatId}/lastMsg`]: lastMsg, [`userChats/${friendUid}/${chatId}/updatedAt`]: msg.timestamp
  });
  db.ref(`userChats/${friendUid}/${chatId}/unread`).transaction(v => (v || 0) + 1);
  try {
    const friendSnap = await db.ref('users/' + friendUid).once('value');
    if (friendSnap.exists() && friendSnap.val().fcmToken) {
      fetch(`${VERCEL_URL}/api/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: friendSnap.val().fcmToken, title: myProfile.name, body: lastMsg, icon: 'icon-192.png' }) });
    }
  } catch (err) {}
}

function toggleReaction(msgKey) {
  if (!currentChat) return;
  const reactEl = document.getElementById('react-' + msgKey);
  let newEmoji = '❤️';
  if (reactEl && reactEl.style.display !== 'none' && reactEl.textContent.trim() === '❤️') {
    newEmoji = null;
  }
  // تحديث الشاشة فوراً بدون انتظار السيرفر
  if (reactEl) {
    reactEl.style.display = newEmoji ? 'flex' : 'none';
    reactEl.textContent = newEmoji || '';
  }
  db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({ reaction: newEmoji });
}

function updateLastMsgAfterChange() {
  if (!currentChat) return;
  db.ref('chats/' + currentChat.chatId + '/messages').orderByChild('timestamp').limitToLast(1).once('value', snap => {
    if (snap.exists()) { snap.forEach(child => {
        const m = child.val(), text = m.isDeleted ? '🚫 رسالة محذوفة' : (m.type === 'text' ? m.text : m.type === 'image' ? '📷 صورة' : m.type === 'video' ? '🎥 فيديو' : m.type === 'audio' ? '🎵 أغنية' : '🎙️ مقطع صوتي');
        db.ref().update({ [`userChats/${currentUser.uid}/${currentChat.chatId}/lastMsg`]: text, [`userChats/${currentChat.friendUid}/${currentChat.chatId}/lastMsg`]: text });
    }); }
  });
}

function openMsgMenu(msg, isOut) {
  const menu = document.getElementById('msg-menu'); menu.innerHTML = '';
  const emojis = ['😂', '😅', '🤣', '😍', '🥰','❤️', '🙂','🫠', '🙄', '😱', '🥺','😳','🤭','😝','😥', '😴', '🔥', '💯', '🙏🏻', '👍🏻', '👏🏻', '👊🏻', '🎧', '🎶', '💙'];
  let emojiHtml = `<div style="display:flex; flex-wrap:wrap; gap:6px; padding:8px; background:rgba(0,240,255,0.05); border-radius:12px; margin-bottom:8px; justify-content:center;">`;
  emojis.forEach(em => { emojiHtml += `<div style="font-size:18px; cursor:pointer; padding:2px;" onclick="addReaction('${msg.key}', '${em}'); closeMsgMenu();">${em}</div>`; }); emojiHtml += `</div>`; menu.innerHTML += emojiHtml;
  
  const btnReply = document.createElement('button'); btnReply.className = 'msg-menu-btn'; btnReply.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> رد`;
  btnReply.onclick = () => { prepareReply(msg); closeMsgMenu(); }; menu.appendChild(btnReply);
  
     if (msg.type === 'text') {
    const btnCopy = document.createElement('button'); btnCopy.className = 'msg-menu-btn'; btnCopy.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> نسخ النص`;
    btnCopy.onclick = () => { navigator.clipboard.writeText(msg.text).then(() => showToast('تم النسخ', 'success')); closeMsgMenu(); }; menu.appendChild(btnCopy);
  }
  if (msg.type === 'audio' || msg.type === 'voice' || msg.type === 'video' || msg.type === 'image') {
    const btnDownload = document.createElement('button'); btnDownload.className = 'msg-menu-btn'; btnDownload.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ${msg.type === 'video' ? 'تنزيل الفيديو' : (msg.type === 'image' ? 'تنزيل الصورة' : 'تنزيل المقطع')}`;
    btnDownload.onclick = async () => { 
        showToast('جاري التجهيز للتنزيل...');
        let dlUrl = msg.url;
        
        // إضافة الصيغ للاسم لتتعرف عليها استوديوهات الهواتف مباشرة
        let uniqueName = msg.type === 'video' ? `Video_${Date.now()}.mp4` : msg.type === 'image' ? `Image_${Date.now()}.jpg` : (msg.type === 'audio' ? `Song_${Date.now()}.mp3` : `Voice_${Date.now()}.mp3`);
        
        if (dlUrl.includes('cloudinary.com') && dlUrl.includes('/upload/')) {
            dlUrl = dlUrl.replace('/upload/', `/upload/fl_attachment:${uniqueName.split('.')[0]}/`);
            if (msg.type === 'voice' || msg.type === 'audio') { dlUrl = dlUrl.replace(/\.[^/.]+$/, ".mp3"); } 
            else if (msg.type === 'video') { dlUrl = dlUrl.replace(/\.[^/.]+$/, ".mp4"); } 
            else if (msg.type === 'image') { dlUrl = dlUrl.replace(/\.[^/.]+$/, ".jpg"); }
        } else if (msg.type === 'image' && (dlUrl.includes('enc_img_') || dlUrl.endsWith('.bin'))) {
            // إذا كانت الصورة مشفرة، لا ننزل الطلاسم بل ننزل الصورة المفكوكة!
            if (window.localImageCache && window.localImageCache[msg.url]) {
                dlUrl = window.localImageCache[msg.url];
            } else {
                dlUrl = await decryptImageUrl(msg.url);
            }
        }
        
        // استخدام fetch لفرض التنزيل بدل الفتح بنافذة جديدة (تضمن حفظها كملف فعلي)
        try {
            const response = await fetch(dlUrl);
            const blob = await response.blob();
            const objectUrl = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = objectUrl;
            a.download = uniqueName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(objectUrl);
            showToast('تم التنزيل بنجاح ✔️', 'success');
        } catch (err) {
            showToast('فشل التنزيل', 'error');
        }
        
        closeMsgMenu(); 
    }; 
    menu.appendChild(btnDownload);
  }
  if (isOut) {
    // 🚀 السحر هون: حساب فارق الوقت.. مسموح التعديل والحذف فقط إذا مر أقل من دقيقتين (120,000 ميلي ثانية)
    const timeDiff = Date.now() - msg.timestamp;
    const canModify = timeDiff <= 120000;

    if (msg.type === 'text' && canModify) {
      const btnEdit = document.createElement('button'); btnEdit.className = 'msg-menu-btn'; btnEdit.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> تعديل`;
      btnEdit.onclick = () => { prepareEdit(msg.key, msg.text); closeMsgMenu(); }; menu.appendChild(btnEdit);
    }
    
    if (canModify) {
      const btnDel = document.createElement('button'); btnDel.className = 'msg-menu-btn danger'; btnDel.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> حذف الرسالة`;
      btnDel.onclick = () => { confirmDeleteMsg(msg.key); closeMsgMenu(); }; menu.appendChild(btnDel);
    } else {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:11px; color:var(--text-muted); text-align:center; margin-top:8px; pointer-events:none;';
      note.textContent = 'لا يمكن الحذف أو التعديل بعد مرور دقيقتين';
      menu.appendChild(note);
    }
  }
  document.getElementById('msg-menu-overlay').classList.add('open');
}

function addReaction(msgKey, emoji) {
  if (!currentChat) return;
  const reactEl = document.getElementById('react-' + msgKey);
  if (reactEl) {
    reactEl.style.display = 'flex';
    reactEl.textContent = emoji;
  }
  db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({ reaction: emoji });
}
function closeMsgMenu() { document.getElementById('msg-menu-overlay').classList.remove('open'); }
function prepareReply(msg) { replyingToMsg = msg; editingMsgKey = null; document.getElementById('msg-reply-preview').classList.add('active'); document.getElementById('msg-reply-text').textContent = 'رد على: ' + (msg.type === 'text' ? msg.text : msg.type === 'image' ? '📷 صورة' : msg.type === 'video' ? '🎥 فيديو' : '🎙️ صوتية'); document.getElementById('msg-input').focus(); }
function cancelReply() { replyingToMsg = null; document.getElementById('msg-reply-preview').classList.remove('active'); }
function prepareEdit(msgKey, oldText) { editingMsgKey = msgKey; cancelReply(); const inp = document.getElementById('msg-input'); inp.value = oldText; autoResize(inp); inp.focus(); showToast('وضع التعديل مفعل ✏️'); }
function confirmDeleteMsg(msgKey) {
  openModal('حذف نهائي', 'هل تريد حذف الرسالة للجميع ومن السيرفر؟').then(async ok => {
    if (ok && currentChat) {
      try {
        const msgRef = db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey);
        const snap = await msgRef.once('value');
        const msg = snap.val();

        // 1. الحذف من واجهة الدردشة (فايربيز) للطرفين
        await msgRef.update({ isDeleted: true, text: null, url: null, type: 'deleted' });
        updateLastMsgAfterChange();
        showToast('تم حذف الرسالة بنجاح', 'success');

        // 2. التدمير المادي من السيرفر لتفريغ المساحة فوراً
        if (msg && msg.url) {
          if (msg.url.includes('supabase.co')) {
            // حذف من Supabase
            const fileName = msg.url.split('/').pop();
            const SUPA_URL = 'https://boksjjglizmzmqoxzmhy.supabase.co';
            const SUPA_KEY = 'sb_publishable_Vil5AiRd1aZ6GwiHZUaNmg_N8I47i1y';
            fetch(`${SUPA_URL}/storage/v1/object/chat-media/${fileName}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${SUPA_KEY}`, 'apikey': SUPA_KEY }
            }).catch(e => console.log('تعذر الحذف من Supabase'));
            
          } else if (msg.deleteToken) {
            // حذف من كلاوديناري (للملفات القديمة أو الصوتيات)
            const fd = new FormData(); 
            fd.append('token', msg.deleteToken);
            fetch('https://api.cloudinary.com/v1_1/sggwmi1c/delete_by_token', { 
              method: 'POST', body: fd 
            }).catch(e => console.log('تعذر الحذف'));
          }
        }
      } catch (e) {
        showToast('حدث خطأ أثناء الحذف', 'error');
      }
    }
  });
}

/* ═══════════════════════════════════
   IMAGE PREVIEW, ZOOM & PAN
═══════════════════════════════════ */
let currentScale = 1; let imgTx = 0, imgTy = 0; let imgStartX = 0, imgStartY = 0;

window.previewImg = function(url) {
  const img = document.getElementById('img-preview-el');
  img.src = url;
  currentScale = 1; imgTx = 0; imgTy = 0;
  img.style.transform = `translate(0px, 0px) scale(1)`;
  document.getElementById('img-preview-overlay').classList.add('open');
  try { history.pushState({ overlay: 'image' }, '', ''); } catch(e){}
};

// الدالة المسؤولة عن إغلاق الصورة والعودة للمحادثة
function closeImgPreview() {
  document.getElementById('img-preview-overlay').classList.remove('open');
  setTimeout(() => { document.getElementById('img-preview-el').src = ''; }, 250);
}

const imgEl = document.getElementById('img-preview-el');
const overlayEl = document.getElementById('img-preview-overlay');

// الخروج عند الضغط خارج الصورة
overlayEl.addEventListener('click', (e) => { 
  if (e.target === overlayEl) history.back(); 
});

let imgLastTap = 0;
let initialPinchDist = null;
let initialScale = 1;
let pinchStartX = 0, pinchStartY = 0;
let initialImgTx = 0, initialImgTy = 0;

imgEl.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    initialPinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    initialScale = currentScale;
    pinchStartX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    pinchStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    initialImgTx = imgTx;
    initialImgTy = imgTy;
    imgEl.style.transition = 'none';
  } else if (e.touches.length === 1) {
    const now = Date.now();
    if (now - imgLastTap < 300 && now - imgLastTap > 0) {
      currentScale = currentScale === 1 ? 2.5 : 1; imgTx = 0; imgTy = 0;
      imgEl.style.transition = 'transform 0.2s ease';
      imgEl.style.transform = `translate(0px, 0px) scale(${currentScale})`;
      imgLastTap = 0;
      e.preventDefault();
    } else {
      imgStartX = e.touches[0].clientX - imgTx; imgStartY = e.touches[0].clientY - imgTy;
      imgEl.style.transition = 'none';
      imgLastTap = now;
    }
  }
});

imgEl.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const currentDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const currentMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const currentMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    
    if (initialPinchDist) {
      currentScale = Math.min(Math.max(0.5, initialScale * (currentDist / initialPinchDist)), 5);
      imgTx = initialImgTx + (currentMidX - pinchStartX);
      imgTy = initialImgTy + (currentMidY - pinchStartY);
      
      const maxTx = Math.max(0, (imgEl.offsetWidth * currentScale - window.innerWidth) / 2);
      const maxTy = Math.max(0, (imgEl.offsetHeight * currentScale - window.innerHeight) / 2);
      if (imgTx > maxTx) { imgTx = maxTx; pinchStartX = currentMidX - (imgTx - initialImgTx); }
      else if (imgTx < -maxTx) { imgTx = -maxTx; pinchStartX = currentMidX - (imgTx - initialImgTx); }
      if (imgTy > maxTy) { imgTy = maxTy; pinchStartY = currentMidY - (imgTy - initialImgTy); }
      else if (imgTy < -maxTy) { imgTy = -maxTy; pinchStartY = currentMidY - (imgTy - initialImgTy); }

      imgEl.style.transform = `translate(${imgTx}px, ${imgTy}px) scale(${currentScale})`;
    }
  } else if (e.touches.length === 1 && currentScale > 1) {
    e.preventDefault();
    imgTx = e.touches[0].clientX - imgStartX; 
    imgTy = e.touches[0].clientY - imgStartY;

    const maxTx = Math.max(0, (imgEl.offsetWidth * currentScale - window.innerWidth) / 2);
    const maxTy = Math.max(0, (imgEl.offsetHeight * currentScale - window.innerHeight) / 2);
    if (imgTx > maxTx) { imgTx = maxTx; imgStartX = e.touches[0].clientX - imgTx; }
    else if (imgTx < -maxTx) { imgTx = -maxTx; imgStartX = e.touches[0].clientX - imgTx; }
    if (imgTy > maxTy) { imgTy = maxTy; imgStartY = e.touches[0].clientY - imgTy; }
    else if (imgTy < -maxTy) { imgTy = -maxTy; imgStartY = e.touches[0].clientY - imgTy; }

    imgEl.style.transform = `translate(${imgTx}px, ${imgTy}px) scale(${currentScale})`;
  }
});

imgEl.addEventListener('touchend', (e) => {
  initialPinchDist = null;
  if (currentScale < 1) {
    currentScale = 1; imgTx = 0; imgTy = 0;
    imgEl.style.transition = 'transform 0.2s ease';
    imgEl.style.transform = `translate(0px, 0px) scale(1)`;
  } else {
    const maxTx = Math.max(0, (imgEl.offsetWidth * currentScale - window.innerWidth) / 2);
    const maxTy = Math.max(0, (imgEl.offsetHeight * currentScale - window.innerHeight) / 2);
    let outOfBounds = false;
    if (imgTx > maxTx) { imgTx = maxTx; outOfBounds = true; }
    else if (imgTx < -maxTx) { imgTx = -maxTx; outOfBounds = true; }
    if (imgTy > maxTy) { imgTy = maxTy; outOfBounds = true; }
    else if (imgTy < -maxTy) { imgTy = -maxTy; outOfBounds = true; }
    if (outOfBounds) {
      imgEl.style.transition = 'transform 0.2s ease';
      imgEl.style.transform = `translate(${imgTx}px, ${imgTy}px) scale(${currentScale})`;
    }
  }
  if (e.touches.length === 1) {
    imgStartX = e.touches[0].clientX - imgTx;
    imgStartY = e.touches[0].clientY - imgTy;
  }
});

/* ═══════════════════════════════════
   IMAGE ENCRYPTION ENGINE (AES-GCM)
═══════════════════════════════════ */
const SECRET_KEY_STR = 'NeonChat_Super_Secret_Key_123!'; 

async function getEncryptionKey() {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(SECRET_KEY_STR.padEnd(32, '0')),
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
    );
    return keyMaterial;
}

async function encryptImageBlob(blob) {
    const key = await getEncryptionKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const arrayBuffer = await blob.arrayBuffer();
    const encryptedContent = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        arrayBuffer
    );
    return new Blob([iv, encryptedContent], { type: 'application/octet-stream' });
}

async function decryptImageUrl(encryptedUrl) {
    if (window.localImageCache && window.localImageCache[encryptedUrl]) {
        return window.localImageCache[encryptedUrl];
    }
    try {
        const response = await fetch(encryptedUrl);
        const encryptedBlob = await response.blob();
        const arrayBuffer = await encryptedBlob.arrayBuffer();
        const iv = new Uint8Array(arrayBuffer.slice(0, 12));
        const data = arrayBuffer.slice(12);
        const key = await getEncryptionKey();
        const decryptedContent = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            data
        );
        const decryptedBlob = new Blob([decryptedContent], { type: 'image/jpeg' });
        const objectUrl = URL.createObjectURL(decryptedBlob);
        if (window.localImageCache) window.localImageCache[encryptedUrl] = objectUrl;
        return objectUrl;
    } catch (e) {
        console.error("خطأ في فك تشفير الصورة:", e);
        return encryptedUrl;
    }
}

/* ═══════════════════════════════════
   UNIVERSAL UPLOAD ENGINE
═══════════════════════════════════ */
window.pendingUploads = {};
window.lastUploadedUrl = null;

async function uploadMediaWithUI(file, type, extraData = null) {
  const tempId = 'temp_' + Date.now();
  const tempUrl = URL.createObjectURL(file);
  const area = document.getElementById('messages-area');

  const tempMsg = {
    key: tempId, type: type, url: tempUrl, duration: extraData?.duration || '0:00',
    senderUid: currentUser.uid, timestamp: Date.now(), isPending: true,
    replyTo: replyingToMsg ? { key: replyingToMsg.key, text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : replyingToMsg.type === 'video' ? '🎥 فيديو' : '🎙️ صوت' } : null
  };
  if (replyingToMsg) cancelReply();

  if (area) {
    const el = buildMsgEl(tempMsg, false); el.id = 'row_' + tempId;
    area.appendChild(el); setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
  }

  const compressImage = (imageFile) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(imageFile);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1280; 
          const MAX_HEIGHT = 1280;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => { resolve(blob); }, 'image/jpeg', 0.6);
        };
      };
    });
  };

  const tryUpload = async () => {
    const row = document.getElementById('row_' + tempId);
    if (row) { 
      const ov = row.querySelector('.pending-overlay'); 
      if (ov) ov.innerHTML = `
        <div id="pct_${tempId}" style="font-size:16px; font-weight:bold; color:var(--neon-cyan); font-family:var(--font-en); text-shadow:0 0 5px #000;">0%</div>
        <div style="width:70%; height:6px; background:rgba(0,0,0,0.5); border-radius:3px; overflow:hidden; border:1px solid rgba(255,255,255,0.2);">
          <div id="bar_${tempId}" style="width:0%; height:100%; background:linear-gradient(90deg, var(--neon-purple), var(--neon-cyan)); transition:width 0.1s linear;"></div>
        </div>
      `; 
    }
    
    let finalFileToUpload = file;
    if (type === 'image') {
      const pctTxt = document.getElementById('pct_' + tempId);
      if(pctTxt) pctTxt.textContent = '🔒';
      
      const compressedBlob = await compressImage(file);
      finalFileToUpload = await encryptImageBlob(compressedBlob); 
    }

    const xhr = new XMLHttpRequest();
    const SUPA_URL = 'https://boksjjglizmzmqoxzmhy.supabase.co';
    const SUPA_KEY = 'sb_publishable_Vil5AiRd1aZ6GwiHZUaNmg_N8I47i1y';
    
    if (type === 'image') {
      const cleanName = `enc_img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.bin`; 
      xhr.open('POST', `${SUPA_URL}/storage/v1/object/chat-media/${cleanName}`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${SUPA_KEY}`);
      xhr.setRequestHeader('apikey', SUPA_KEY);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream'); 
    } else {
      xhr.open('POST', 'https://api.cloudinary.com/v1_1/sggwmi1c/auto/upload', true);
    }
    
    xhr.timeout = 25000; 
    
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        const bar = document.getElementById('bar_' + tempId);
        const pctTxt = document.getElementById('pct_' + tempId);
        if (bar) bar.style.width = percent + '%';
        if (pctTxt && pctTxt.textContent !== '🔒') pctTxt.textContent = percent + '%';
        if (percent === 100 && pctTxt) pctTxt.textContent = '⏳';
      }
    };
    
    const handleFail = (msg) => {
        if (row) { 
          const ov = row.querySelector('.pending-overlay'); 
          if (ov) ov.innerHTML = `<button onclick="window.pendingUploads['${tempId}']()" style="background:var(--bg-surface); border:1px solid var(--neon-pink); color:var(--neon-pink); padding:8px 16px; border-radius:12px; cursor:pointer; font-family:var(--font-ar); font-size:12px; font-weight:bold; box-shadow:var(--shadow-pink);">${msg} 🔄</button>`; 
        }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let finalUrl = '';
        if (type === 'image') {
          const cleanName = xhr.responseURL.split('/').pop();
          finalUrl = `${SUPA_URL}/storage/v1/object/public/chat-media/${cleanName}`;
        } else {
          let data = {}; try { data = JSON.parse(xhr.responseText); } catch(e) {}
          finalUrl = data.secure_url;
        }

        if (finalUrl) {
          window.lastUploadedUrl = finalUrl;
          if (type === 'image' && window.localImageCache) window.localImageCache[finalUrl] = tempUrl; 
          const currentRow = document.getElementById('row_' + tempId);
          if (currentRow) currentRow.remove();
          await pushMessage({ type: type, url: finalUrl, duration: extraData?.duration || null, senderUid: currentUser.uid, timestamp: Date.now(), replyTo: tempMsg.replyTo });
        } else {
          handleFail('فشل الرفع');
        }
      } else {
        handleFail('فشل الرفع');
      }
    };
    
    xhr.onerror = () => handleFail('خطأ اتصال');
    xhr.ontimeout = () => handleFail('انتهى الوقت');
    
    if (type === 'image') {
      xhr.send(finalFileToUpload);
    } else {
      const fd = new FormData(); fd.append('file', finalFileToUpload); fd.append('upload_preset', 'omarhweh1');
      xhr.send(fd);
    }
  };
  window.pendingUploads[tempId] = tryUpload;
  tryUpload();
}

document.getElementById('file-img-input').addEventListener('change', async e => {
  const files = e.target.files;
  if (!files.length || !currentChat) return;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = file.name.toLowerCase();
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/') || file.type.includes('ogg') || fileName.endsWith('.mp3') || fileName.endsWith('.m4a') || fileName.endsWith('.wav') || fileName.endsWith('.ogg') || fileName.endsWith('.aac') || fileName.endsWith('.amr');

    if (isImage) {
      uploadMediaWithUI(file, 'image');
    } else if (isVideo) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      if (file.size > 100 * 1024 * 1024) { 
        showToast('الفيديو كبير جداً! الحد الأقصى 100 ميغابايت', 'error'); 
        continue; 
      }
      uploadLargeMediaWithXHR(file, fileSizeMB, 'video');
    } else if (isAudio) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      if (file.size > 50 * 1024 * 1024) { 
        showToast('الملف الصوتي كبير جداً! الحد الأقصى 50 ميغابايت', 'error'); 
        continue; 
      }
      const tempAudio = new Audio(URL.createObjectURL(file));
      tempAudio.onloadedmetadata = () => {
        const m = Math.floor(tempAudio.duration / 60);
        const s = Math.floor(tempAudio.duration % 60);
        const durStr = `${m}:${s < 10 ? '0' : ''}${s}`;
        uploadLargeMediaWithXHR(file, fileSizeMB, 'audio', durStr);
      };
      tempAudio.onerror = () => {
        uploadLargeMediaWithXHR(file, fileSizeMB, 'audio');
      };
    } else {
      showToast('نوع الملف غير مدعوم!', 'error');
    }
    
    // تأخير 300 ميلي ثانية بين كل ملف كرمال يخف الضغط عالسيرفر وتنجح كلها
    await new Promise(r => setTimeout(r, 300));
  }
  
  e.target.value = '';
});

/* ═══════════════════════════════════
   VOICE RECORDING
═══════════════════════════════════ */
async function toggleRecording(isSinging = false) {
  if (isRecording) { stopRecording(); return; }
  if (!navigator.mediaDevices) { showToast('المتصفح لا يدعم التسجيل', 'error'); return; }
  try {
    isSingingMode = isSinging; 
    let audioConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 2 };
    if (internalMicId) audioConstraints.deviceId = { exact: internalMicId };
    const rawStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    
    // 🚀 السحر هون: نعطي المايك والمتصفح 300 ميلي ثانية لـ "يسخن" قبل ما نبدأ نعالج الصوت
    // هاد بيمنع إرسال ملفات WebM معطوبة بالثواني الأولى وبيعالج مشكلة التعليق على 100%
    await new Promise(r => setTimeout(r, 300));
    
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    
    const source = audioCtx.createMediaStreamSource(rawStream);
    const analyser = audioCtx.createAnalyser(); analyser.fftSize = 64; source.connect(analyser);

    const preGain = audioCtx.createGain(); preGain.gain.value = 0.5;
    const lowCutFilter = audioCtx.createBiquadFilter(); lowCutFilter.type = "highpass"; lowCutFilter.frequency.value = 160;
    const highCutFilter = audioCtx.createBiquadFilter(); highCutFilter.type = "lowpass"; highCutFilter.frequency.value = 10000;
    const presenceEQ = audioCtx.createBiquadFilter(); presenceEQ.type = "peaking"; presenceEQ.frequency.value = 3500; presenceEQ.Q.value = 1; presenceEQ.gain.value = 4; 
    const compressor = audioCtx.createDynamicsCompressor(); compressor.threshold.value = -15; compressor.knee.value = 30; compressor.ratio.value = 3; compressor.attack.value = 0.005; compressor.release.value = 0.25;

    function generateReverb(ctx) {
      const length = ctx.sampleRate * 3.5; const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      const left = impulse.getChannelData(0); const right = impulse.getChannelData(1);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 1.5); 
        left[i] = (Math.random() * 2 - 1) * decay; right[i] = (Math.random() * 2 - 1) * decay;
      }
      return impulse;
    }

    const convolver = audioCtx.createConvolver(); convolver.buffer = generateReverb(audioCtx);
    const dryGain = audioCtx.createGain(); dryGain.gain.value = 0.6; 
    const wetGain = audioCtx.createGain(); wetGain.gain.value = isSingingMode ? (10 / 100) * 3 : (3 / 100) * 3; 
    const dest = audioCtx.createMediaStreamDestination();

    source.connect(preGain); preGain.connect(lowCutFilter); lowCutFilter.connect(highCutFilter); highCutFilter.connect(presenceEQ); presenceEQ.connect(compressor);
    compressor.connect(dryGain); dryGain.connect(dest); compressor.connect(convolver); convolver.connect(wetGain); wetGain.connect(dest);

    audioChunks = []; isRecordingCanceled = false;
    // رجعنا الجودة لـ 256000 ليرجع الصوت نقي ومفتوح متل قبل
    mediaRecorder = new MediaRecorder(dest.stream, { audioBitsPerSecond: 256000 });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      rawStream.getTracks().forEach(t => t.stop()); if(audioCtx.state !== 'closed') audioCtx.close();
      if (isRecordingCanceled) { showToast('تم رمي التسجيل 🗑️'); return; }
      
      const localChunks = [...audioChunks];
      const blob = new Blob(localChunks, { type: 'audio/webm' });
      const finalDuration = recordDurationStr;
      
      // حماية صارمة
      if (blob.size < 3000 || finalDuration === '0:00') {
         showToast('لم يتم التقاط الصوت بشكل كافٍ، أعد المحاولة', 'error');
         return;
      }

      // 🚀 المعالجة الأوفلاين: تحويل المقطع لنص (Base64) لحفظه بالذاكرة حتى لو مافي نت
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
          const base64Audio = reader.result;
          // 🚀 توليد مفتاح فايربيس حقيقي وثابت منذ البداية لمنع التكرار لو اشتغلت المزامنة ألف مرة
          const tempRef = db.ref('chats/' + currentChat.chatId + '/messages').push();
          const tempKey = tempRef.key;
          
          let replyData = null;
          if (replyingToMsg) {
            replyData = { key: replyingToMsg.key, text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : '🎙️ صوت' };
            cancelReply();
          }

          // إنشاء كائن الرسالة المعلقة
          const tempMsg = {
              key: tempKey, type: 'voice', url: base64Audio, duration: finalDuration,
              senderUid: currentUser.uid, timestamp: Date.now(), isPending: true, replyTo: replyData
          };

          // 1. تنزيل الفقاعة بالمحادثة فوراً
          const area = document.getElementById('messages-area');
          if (area) {
              const el = buildMsgEl(tempMsg, false);
              el.id = 'row_' + tempKey;
              area.appendChild(el);
              setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
          }

          // 2. حفظها بالذاكرة الدائمة (LocalStorage) لترتفع لحالها لما يرجع النت
          let pendingQ = JSON.parse(localStorage.getItem('neon_pending_msgs') || '[]');
          pendingQ.push({ chatId: currentChat.chatId, friendUid: currentChat.friendUid, msg: tempMsg, key: tempKey, time: Date.now() });
          localStorage.setItem('neon_pending_msgs', JSON.stringify(pendingQ));

          // 3. محاولة المزامنة والرفع الفوري لـ Supabase
          syncPendingMessages();
      };
    };
    
    // 🚀 إزالة تقطيع 200 ميلي ثانية لتجنب تشوه رأس الملف WebM
    mediaRecorder.start(); isRecording = true; recordStart = Date.now();

    if (isSingingMode) { document.getElementById('btn-music-voice').classList.add('recording'); document.getElementById('btn-voice').style.display = 'none'; } 
    else { document.getElementById('btn-voice').classList.add('recording'); document.getElementById('btn-music-voice').style.display = 'none'; }

    document.getElementById('msg-input-wrap').style.display = 'none'; document.getElementById('btn-attach').style.display = 'none';
    document.getElementById('btn-cancel-voice').style.display = 'flex'; document.getElementById('recording-indicator').style.display = 'flex';
    
    let canvas = document.getElementById('neon-visualizer');
    if (!canvas) { canvas = document.createElement('canvas'); canvas.id = 'neon-visualizer'; canvas.width = 100; canvas.height = 25; canvas.style.marginLeft = '12px'; document.getElementById('recording-indicator').appendChild(canvas); }
    canvas.style.display = 'block'; const canvasCtx = canvas.getContext('2d'); const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    function drawVisualizer() {
      if (!isRecording) return;
      requestAnimationFrame(drawVisualizer); analyser.getByteFrequencyData(dataArray); canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      let x = 0; const barWidth = (canvas.width / analyser.frequencyBinCount) * 2;
      for (let i = 0; i < analyser.frequencyBinCount; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        canvasCtx.fillStyle = isSingingMode ? 'rgba(255, 0, 144, 0.9)' : 'rgba(0, 240, 255, 0.9)';
        canvasCtx.shadowBlur = 6; canvasCtx.shadowColor = isSingingMode ? '#ff0090' : '#00f0ff';
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight); x += barWidth + 1.5;
      }
    }
    drawVisualizer();

    if (currentChat) { const recRef = db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid); recRef.set('recording'); recRef.onDisconnect().remove(); }
    if (typeof recordTimerInt !== 'undefined') clearInterval(recordTimerInt);
    recordDurationStr = '0:00'; const timerSpan = document.getElementById('rec-timer-text'); if (timerSpan) timerSpan.textContent = '0:00';
    recordTimerInt = setInterval(() => {
      const sec = Math.floor((Date.now() - recordStart) / 1000), m = Math.floor(sec / 60), s = sec % 60;
      recordDurationStr = m + ':' + (s < 10 ? '0' : '') + s;
      if (timerSpan) timerSpan.textContent = recordDurationStr;
    }, 1000);
  } catch (e) { showToast('تعذر الوصول للمايكروفون', 'error'); }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  isRecording = false;
  if (currentChat) { const recRef = db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid); recRef.remove(); recRef.onDisconnect().cancel(); }
  document.getElementById('btn-voice').classList.remove('recording'); document.getElementById('btn-voice').style.display = 'flex';
  const btnMusic = document.getElementById('btn-music-voice'); if (btnMusic) { btnMusic.classList.remove('recording'); btnMusic.style.display = 'flex'; }
  document.getElementById('msg-input-wrap').style.display = 'block'; document.getElementById('btn-attach').style.display = 'flex';
  document.getElementById('btn-cancel-voice').style.display = 'none'; document.getElementById('recording-indicator').style.display = 'none';
  const canvas = document.getElementById('neon-visualizer'); if (canvas) canvas.style.display = 'none';
  clearInterval(recordTimerInt);
}

function cancelVoiceRecord() { isRecordingCanceled = true; stopRecording(); }

/* ═══════════════════════════════════
   VOICE PLAYBACK & PROGRESS
═══════════════════════════════════ */
// 🚀 استبدال currentAudioUrl بـ currentAudioMsgKey لضمان عدم تداخل الملفات المكررة
var currentAudio = null, currentAudioMsgKey = null, audioUpdateInterval = null;
var globalVoiceSpeed = 1;

function toggleVoiceSpeed(btn, msgKey) {
  if (globalVoiceSpeed === 1) globalVoiceSpeed = 1.5;
  else if (globalVoiceSpeed === 1.5) globalVoiceSpeed = 2;
  else globalVoiceSpeed = 1;
  
  document.querySelectorAll('button[id^="speed-"]').forEach(b => {
    b.textContent = globalVoiceSpeed + 'x';
    if (globalVoiceSpeed > 1) {
      b.style.background = 'var(--neon-cyan)';
      b.style.color = 'var(--bg-void)';
    } else {
      b.style.background = 'rgba(0, 240, 255, 0.1)';
      b.style.color = 'var(--neon-cyan)';
    }
  });

  if (currentAudio) currentAudio.playbackRate = globalVoiceSpeed;
}

function playVoice(btn, url, msgKey, isOut) {
  if (isOut === false && currentChat) {
    db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({ listened: true });
    const dot = document.getElementById('unplayed-' + msgKey); if (dot) { dot.style.background = 'transparent'; dot.style.boxShadow = 'none'; }
  }
  
  // 🚀 الفحص عبر مفتاح الرسالة وليس الرابط، لمنع تداخل تشغيل الرسائل المتشابهة
  if (currentAudio && currentAudioMsgKey === msgKey) {
    if (!currentAudio.paused) { 
        currentAudio.pause(); 
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`; 
        clearInterval(audioUpdateInterval); 
        return; 
    } else { 
        currentAudio.play(); 
        currentAudio.playbackRate = globalVoiceSpeed; 
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`; 
        startAudioProgress(msgKey); 
        return; 
    }
  }
  
  // إذا في صوت تاني شغال، وقفه ورجع أيقونته لزر التشغيل العادي
  if (currentAudio) {
    currentAudio.pause(); 
    currentAudio.src = ''; // 🚀 إفراغ المصدر يقتل التحميل المعلق فوراً
    document.querySelectorAll('.voice-play-btn').forEach(b => b.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`);
    document.querySelectorAll('.voice-progress-fill').forEach(f => f.style.width = '0%'); 
    clearInterval(audioUpdateInterval);
  }
  
  currentAudioMsgKey = msgKey; 
  
  // إجبار كلاوديناري يعطينا الملف بصيغة MP3 قابلة للتقديم والتأخير
  let optimizedUrl = url;
  if (optimizedUrl.includes('cloudinary.com') && optimizedUrl.includes('/upload/')) {
    if (!optimizedUrl.includes('f_mp3')) {
       optimizedUrl = optimizedUrl.replace('/upload/', '/upload/f_mp3,q_auto/');
    }
  }
  
  currentAudio = new Audio(optimizedUrl); 
  currentAudio.preload = 'auto'; 
  currentAudio.playbackRate = globalVoiceSpeed;
  
  btn.innerHTML = `<div style="width:16px;height:16px;border:2px solid rgba(0, 240, 255, 0.3);border-top-color:var(--bg-void);border-radius:50%;animation:spin .8s linear infinite;"></div>`;
  currentAudio.onplaying = () => { btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`; startAudioProgress(msgKey); };
  currentAudio.onwaiting = () => { btn.innerHTML = `<div style="width:16px;height:16px;border:2px solid rgba(0, 240, 255, 0.3);border-top-color:var(--bg-void);border-radius:50%;animation:spin .8s linear infinite;"></div>`; };
  
  let playPromise = currentAudio.play();
  if (playPromise !== undefined) {
    playPromise.catch(e => {
      console.log("Audio playback waiting...");
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      clearInterval(audioUpdateInterval);
    });
  }
  
  startAudioProgress(msgKey);

  currentAudio.onended = () => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const fill = document.getElementById('progress-' + msgKey); if (fill) fill.style.width = '0%';
    const durEl = document.getElementById('dur-' + msgKey); if (durEl) durEl.textContent = durEl.getAttribute('data-orig');
    let currentRow = btn.closest('.msg-row'), nextRow = currentRow ? currentRow.nextElementSibling : null;
    while (nextRow && nextRow.classList.contains('date-sep')) nextRow = nextRow.nextElementSibling;
    let nextBtn = nextRow && nextRow.classList.contains('msg-row') ? nextRow.querySelector('.voice-play-btn') : null;
    currentAudio = null; currentAudioMsgKey = null; clearInterval(audioUpdateInterval);
    if (nextBtn) nextBtn.click();
  };
}

function startAudioProgress(msgKey) {
  clearInterval(audioUpdateInterval);
  const durEl = document.getElementById('dur-' + msgKey);
  let origStr = durEl ? durEl.getAttribute('data-orig') : '0:00';
  let fallbackDuration = 0; 
  
  if (origStr && !origStr.includes('أغنية') && origStr !== '0:00') { 
    const parts = origStr.split(':'); 
    if (parts.length === 2) fallbackDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]); 
  }
  
  audioUpdateInterval = setInterval(() => {
    if (currentAudio && !currentAudio.paused) {
      let realDur = currentAudio.duration;
      
      if (realDur && realDur !== Infinity && !isNaN(realDur)) {
        if (origStr.includes('أغنية') || origStr === '0:00') {
          const totM = Math.floor(realDur / 60);
          const totS = Math.floor(realDur % 60);
          origStr = `${totM}:${totS < 10 ? '0' : ''}${totS}`;
          if (durEl) durEl.setAttribute('data-orig', origStr);
        }
        fallbackDuration = realDur;
      }
      
      const curSec = Math.floor(currentAudio.currentTime || 0);
      const m = Math.floor(curSec / 60);
      const s = curSec % 60;
      const currentFormatted = `${m}:${s < 10 ? '0' : ''}${s}`;

      if (fallbackDuration > 0) {
        let perc = (currentAudio.currentTime / fallbackDuration) * 100; 
        if (perc > 100) perc = 100;
        let fill = document.getElementById('progress-' + msgKey); 
        if (fill) fill.style.width = perc + '%';
      }
      
      if (durEl) durEl.textContent = `${currentFormatted} / ${origStr}`;
    }
  }, 30); 
}

function seekVoice(event, url, msgKey) {
  if (!currentAudio || currentAudioUrl !== url) return;
  const durEl = document.getElementById('dur-' + msgKey);
  let origStr = durEl ? durEl.getAttribute('data-orig') : '0:00';
  
  let fallbackDuration = 0; 
  if (origStr && !origStr.includes('أغنية') && origStr !== '0:00') { 
    const parts = origStr.split(':'); 
    if (parts.length === 2) fallbackDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]); 
  }
  
  let realDur = currentAudio.duration; 
  let totalDuration = (realDur && realDur !== Infinity && !isNaN(realDur)) ? realDur : fallbackDuration;
  
  if (!totalDuration || totalDuration <= 0) return;
  
  const rect = event.currentTarget.getBoundingClientRect();
  const clickX = rect.right - event.clientX; 
  let perc = clickX / rect.width; 
  if (perc < 0) perc = 0; if (perc > 1) perc = 1;
  
  currentAudio.currentTime = totalDuration * perc;
  const fill = document.getElementById('progress-' + msgKey); 
  if (fill) fill.style.width = (perc * 100) + '%';
}

/* ═══════════════════════════════════
   VIDEO UPLOAD & PLAYER LOGIC
═══════════════════════════════════ */
function uploadLargeMediaWithXHR(file, fileSizeMB, mediaType, extraDuration = null) {
  const tempId = 'temp_media_' + Date.now();
  const tempUrl = URL.createObjectURL(file);
  const area = document.getElementById('messages-area');

  const tempMsg = {
    key: tempId, type: mediaType, url: tempUrl, size: fileSizeMB + ' MB', duration: extraDuration || '0:00',
    senderUid: currentUser.uid, timestamp: Date.now(), isPending: true,
    replyTo: replyingToMsg ? { key: replyingToMsg.key, text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : replyingToMsg.type === 'video' ? '🎥 فيديو' : '🎙️ صوت' } : null
  };
  if (replyingToMsg) cancelReply();

  if (area) {
    const el = buildMsgEl(tempMsg, false); el.id = 'row_' + tempId;
    area.appendChild(el); setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
  }

  const tryUpload = () => {
      const row = document.getElementById('row_' + tempId);
      if (row) {
          const ov = row.querySelector('.pending-overlay');
          if (ov) ov.innerHTML = `
              <div id="pct_${tempId}" style="font-size:16px; font-weight:bold; color:var(--neon-cyan); font-family:var(--font-en); text-shadow:0 0 5px #000;">0%</div>
              <div style="width:70%; height:6px; background:rgba(0,0,0,0.5); border-radius:3px; overflow:hidden; border:1px solid rgba(255,255,255,0.2);">
                  <div id="bar_${tempId}" style="width:0%; height:100%; background:linear-gradient(90deg, var(--neon-purple), var(--neon-cyan)); transition:width 0.1s linear;"></div>
              </div>
          `;
      }

      const xhr = new XMLHttpRequest();
      const SUPA_URL = 'https://boksjjglizmzmqoxzmhy.supabase.co';
      const SUPA_KEY = 'sb_publishable_Vil5AiRd1aZ6GwiHZUaNmg_N8I47i1y';

      // توجيه الفيديوهات إلى Supabase، والصوتيات إلى Cloudinary
      if (mediaType === 'video') {
          const ext = file.name.includes('.') ? file.name.split('.').pop() : 'mp4';
          const cleanName = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
          xhr.open('POST', `${SUPA_URL}/storage/v1/object/chat-media/${cleanName}`, true);
          xhr.setRequestHeader('Authorization', `Bearer ${SUPA_KEY}`);
          xhr.setRequestHeader('apikey', SUPA_KEY);
          xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
      } else {
          xhr.open('POST', 'https://api.cloudinary.com/v1_1/sggwmi1c/auto/upload', true);
      }

      xhr.timeout = 180000; // 3 دقائق كحد أقصى للرفع

      xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          const bar = document.getElementById('bar_' + tempId);
          const pctTxt = document.getElementById('pct_' + tempId);
          if (bar) bar.style.width = percent + '%';
          if (pctTxt) {
              if (percent < 100) {
                  pctTxt.textContent = percent + '%';
              } else {
                  pctTxt.textContent = '⏳ بانتظار السيرفر...';
              }
          }
        }
      };

      const handleFail = (msg) => {
          if (row) {
            const ov = row.querySelector('.pending-overlay');
            if (ov) ov.innerHTML = `<button onclick="window.pendingUploads['${tempId}']()" style="background:var(--bg-surface); border:1px solid var(--neon-pink); color:var(--neon-pink); padding:8px 12px; border-radius:12px; cursor:pointer; font-family:var(--font-ar); font-size:12px; font-weight:bold; box-shadow:var(--shadow-pink); max-width:90%; white-space:normal; line-height:1.5;">${msg} 🔄</button>`;
          }
      };

      xhr.onload = async function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          let finalUrl = '';
          let deleteToken = null;

          if (mediaType === 'video') {
              // جلب رابط Supabase المباشر للفيديو
              const cleanName = xhr.responseURL.split('/').pop();
              finalUrl = `${SUPA_URL}/storage/v1/object/public/chat-media/${cleanName}`;
          } else {
              let data = {};
              try { data = JSON.parse(xhr.responseText); } catch(e) {}
              if (data && data.secure_url) {
                  finalUrl = data.secure_url;
                  deleteToken = data.delete_token || null;
              }
          }

          if (finalUrl) {
            const currentRow = document.getElementById('row_' + tempId);
            if (currentRow) currentRow.remove();

            await pushMessage({
              type: mediaType,
              url: finalUrl,
              size: fileSizeMB,
              duration: extraDuration,
              deleteToken: deleteToken,
              senderUid: currentUser.uid,
              timestamp: Date.now(),
              replyTo: tempMsg.replyTo
            });
          } else {
            handleFail('استجابة فارغة من السيرفر');
          }
        } else {
          handleFail('خطأ ' + xhr.status);
        }
      };

      xhr.onerror = function() { handleFail('مشكلة شبكة أو CORS'); };
      xhr.ontimeout = function() { handleFail('انتهى وقت الانتظار'); };

      // طريقة إرسال الملف تختلف حسب السيرفر
      if (mediaType === 'video') {
          xhr.send(file);
      } else {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('upload_preset', 'omarhweh1');
          xhr.send(fd);
      }
  };

  window.pendingUploads[tempId] = tryUpload;
  tryUpload();
}

let videoEl = document.getElementById('custom-video-el');
let videoUpdateInt = null;

// إضافة مستمعات أحداث ذكية لمعالجة التعليق والتحميل الفعلي من السيرفرات الخام
videoEl.addEventListener('waiting', () => {
  document.getElementById('video-loading-text').style.display = 'block';
});
videoEl.addEventListener('playing', () => {
  document.getElementById('video-loading-text').style.display = 'none';
});
videoEl.addEventListener('canplay', () => {
  document.getElementById('video-loading-text').style.display = 'none';
});

function openVideoPlayer(url) {
  const overlay = document.getElementById('video-preview-overlay');
  
  let optimizedUrl = url;
  if (optimizedUrl.includes('cloudinary.com') && optimizedUrl.includes('/upload/')) {
    optimizedUrl = optimizedUrl.replace('/upload/', '/upload/q_auto,vc_auto,f_mp4/');
  }
  
  videoEl.src = optimizedUrl;
  overlay.classList.add('open');
  
  document.getElementById('video-loading-text').style.display = 'block';
  document.getElementById('video-buffer-percent').textContent = '';
  
  videoEl.load();
  let playPromise = videoEl.play();
  if (playPromise !== undefined) {
    playPromise.then(_ => { 
        // التشغيل نجح
    }).catch(error => { 
        console.log("Auto-play prevented"); 
        document.getElementById('video-loading-text').style.display = 'none';
    });
  }

  updateVideoControls();
  // تقليل سرعة التحديث لتخفيف الضغط على معالج الهاتف أثناء فك التشفير
  videoUpdateInt = setInterval(updateVideoControls, 250);

  try { history.pushState({ overlay: 'video' }, '', ''); } catch(e){}
}

function closeVideoPlayer() {
  document.getElementById('video-preview-overlay').classList.remove('open');
  videoEl.pause();
  videoEl.src = '';
  clearInterval(videoUpdateInt);
}

function toggleVideoPlay() {
  const btn = document.getElementById('btn-video-play');
  if (videoEl.paused) {
    videoEl.play();
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  } else {
    videoEl.pause();
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  }
}

function skipVideo(seconds) {
  videoEl.currentTime += seconds;
}

function updateVideoControls() {
  if (!videoEl.duration || isNaN(videoEl.duration)) return;
  
  document.getElementById('video-time-current').textContent = formatVideoTime(videoEl.currentTime);
  document.getElementById('video-time-total').textContent = formatVideoTime(videoEl.duration);
  
  const percent = (videoEl.currentTime / videoEl.duration) * 100;
  document.getElementById('video-progress-fill').style.width = percent + '%';
  
  // إصلاح مشكلة حساب التحميل المسبق (Buffer) التي كانت تجمد الواجهة
  if (videoEl.buffered.length > 0) {
    let buffPercent = 0;
    // البحث عن النطاق المحمل الذي يقع فيه الوقت الحالي للمشاهدة
    for (let i = 0; i < videoEl.buffered.length; i++) {
        if (videoEl.currentTime >= videoEl.buffered.start(i) && videoEl.currentTime <= videoEl.buffered.end(i)) {
            buffPercent = (videoEl.buffered.end(i) / videoEl.duration) * 100;
            break;
        }
    }
    
    if (buffPercent === 0) {
       buffPercent = (videoEl.buffered.end(videoEl.buffered.length - 1) / videoEl.duration) * 100;
    }

    document.getElementById('video-buffer-bar').style.width = buffPercent + '%';
    
    const loadingText = document.getElementById('video-loading-text');
    if (loadingText.style.display === 'block') {
        document.getElementById('video-buffer-percent').textContent = Math.round(buffPercent) + '%';
    }
  }
  
  const btn = document.getElementById('btn-video-play');
  if (videoEl.paused) btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  else btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
}

function seekVideoClick(e) {
  const rect = document.getElementById('video-progress-container').getBoundingClientRect();
  
  // دعم لمس الموبايل بدقة أعلى
  let clientX = e.clientX;
  if (e.touches && e.touches.length > 0) clientX = e.touches[0].clientX;
  else if (e.changedTouches && e.changedTouches.length > 0) clientX = e.changedTouches[0].clientX;
  if (clientX === undefined) return;
  
  let clickX = clientX - rect.left;
  let percent = clickX / rect.width;
  
  if (percent < 0) percent = 0;
  if (percent > 1) percent = 1;
  
  if (videoEl.duration && videoEl.duration !== Infinity && !isNaN(videoEl.duration)) {
    videoEl.currentTime = percent * videoEl.duration;
  }
}

function formatVideoTime(sec_num) {
  sec_num = Math.floor(sec_num);
  let m = Math.floor(sec_num / 60);
  let s = sec_num % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

async function deleteExpiredMedia(chatId, msg) {
  if (msg.isDeleted) return;
  
  // 1. حذف الرسالة من الدردشة (Firebase)
  await db.ref(`chats/${chatId}/messages/${msg.key}`).update({
     isDeleted: true, text: null, url: null, type: 'deleted'
  });
  
  // 2. حذف الملف من السيرفر لتفريغ المساحة
  if (msg.url && msg.url.includes('supabase.co')) {
      // حذف الصور والفيديوهات من سيرفر Supabase
      const fileName = msg.url.split('/').pop();
      const SUPA_URL = 'https://boksjjglizmzmqoxzmhy.supabase.co';
      const SUPA_KEY = 'sb_publishable_Vil5AiRd1aZ6GwiHZUaNmg_N8I47i1y';
      
      fetch(`${SUPA_URL}/storage/v1/object/chat-media/${fileName}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${SUPA_KEY}`, 'apikey': SUPA_KEY }
      }).catch(e => console.log('تعذر مسح الملف من Supabase', e));
      
  } else if (msg.deleteToken) {
      // للملفات القديمة أو المقاطع الصوتية على Cloudinary
      const fd = new FormData();
      fd.append('token', msg.deleteToken);
      fetch('https://api.cloudinary.com/v1_1/sggwmi1c/delete_by_token', {
         method: 'POST', body: fd
      }).catch(e => console.log('تعذر حذف الميديا من كلاوديناري', e));
  }
}

/* ═══════════════════════════════════
   SCROLL & CHAT UTILS
═══════════════════════════════════ */
function scrollToMessage(msgKey) {
  const targetEl = document.getElementById('msg-' + msgKey);
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.style.transition = 'all 0.3s ease'; targetEl.style.boxShadow = '0 0 20px var(--neon-cyan)'; targetEl.style.transform = 'scale(1.05)';
    setTimeout(() => { targetEl.style.boxShadow = 'none'; targetEl.style.transform = 'scale(1)'; }, 1500);
  } else {
    // السحر هون: إذا الرسالة قديمة ومو محملة بالشاشة، استدعي دالة القفز للأرشيف فوراً
    if (typeof jumpToMessageContext === 'function') jumpToMessageContext(msgKey);
  }
}

document.body.style.overscrollBehavior = 'none';
document.documentElement.style.overscrollBehavior = 'none';

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const appEl = document.getElementById('app');
    appEl.style.height = window.visualViewport.height + 'px';
    appEl.style.position = 'fixed';
    appEl.style.top = '0';
    appEl.style.width = '100%';
    window.scrollTo(0, 0);
    const area = document.getElementById('messages-area');
    if (area) area.scrollTop = area.scrollHeight;
  });
}

document.body.addEventListener('touchmove', (e) => {
  const isScrollable = e.target.closest('#messages-area') || e.target.closest('.chats-list') || e.target.closest('.add-friend-body') || e.target.closest('.profile-body') || e.target.closest('#firebase-search-results') || e.target.closest('#msg-input');
  if (!isScrollable) {
    e.preventDefault();
  }
}, { passive: false });

const msgInputEl = document.getElementById('msg-input');
if(msgInputEl) {
  msgInputEl.addEventListener('focus', () => {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 50);
  });
}

/* ═══════════════════════════════════
   CALL SYSTEM & AGORA
═══════════════════════════════════ */
const AGORA_APP_ID = "7ca23eb56dfd45f7a89e9fd2a03a40ca";

function initCallListener(uid) {
  if (myCallListener) db.ref('calls/' + uid).off('value', myCallListener);
  myCallListener = db.ref('calls/' + uid).on('value', snap => {
    const data = snap.val();
    if (!data) { forceEndCallUI(); return; }
    
    currentCallPeer = data.peerUid; 
    window.currentCallId = data.chatId;
    
    const avatarView = document.getElementById('call-avatar-view'), nameView = document.getElementById('call-name-view'), statusView = document.getElementById('call-status-view'), acceptBtn = document.getElementById('btn-accept-call'), ringAudio = document.getElementById('ringtone-audio');
    
    if (nameView) nameView.textContent = data.peerName || 'مستخدم';
    if (avatarView) avatarView.textContent = (data.peerName || '?').charAt(0);
    
    if (data.status === 'incoming') {
      if(statusView) { statusView.textContent = 'يتصل بك... 📞'; statusView.style.color = 'var(--neon-cyan)'; }
      if(acceptBtn) acceptBtn.style.display = 'flex';
      if(ringAudio && ringAudio.paused) ringAudio.play().catch(e=>{});
      if (navigator.vibrate) navigator.vibrate([500, 300, 500, 300, 500]);
      renderScreenUI('call');
    } else if (data.status === 'answered') {
      if(ringAudio && !ringAudio.paused) { ringAudio.pause(); ringAudio.currentTime = 0; }
      if(acceptBtn) acceptBtn.style.display = 'none';
      
      if (data.role === 'caller' && !window.callTimerInt) {
        startCallTimer();
      }
    } else if (data.status === 'ended') {
      forceEndCallUI();
    }
  });
}

async function startCall() {
  if (!currentChat) return; 
  currentCallPeer = currentChat.friendUid; 
  window.currentCallId = [currentUser.uid, currentCallPeer].sort().join('_');
  
  const avatarView = document.getElementById('call-avatar-view'), nameView = document.getElementById('call-name-view'), statusView = document.getElementById('call-status-view'), acceptBtn = document.getElementById('btn-accept-call'), ringAudio = document.getElementById('ringtone-audio');
  
  if(nameView) nameView.textContent = currentChat.friendProfile.name; 
  if(avatarView) avatarView.textContent = (currentChat.friendProfile.name || '?').charAt(0);
  if(statusView) { statusView.textContent = 'جاري الاتصال...'; statusView.style.color = 'var(--neon-cyan)'; }
  if(acceptBtn) acceptBtn.style.display = 'none';
  
  renderScreenUI('call');
  
  // 🚀 المتصل يدخل غرفة الصوت فوراً (هذا يحل مشكلة كتم الصوت من المتصفح)
  await joinAgoraVoice(window.currentCallId);

  if(ringAudio && ringAudio.paused) ringAudio.play().catch(e=>{});

  await db.ref('calls/' + currentUser.uid).set({ status: 'calling', role: 'caller', peerUid: currentCallPeer, peerName: currentChat.friendProfile.name, chatId: window.currentCallId });
  await db.ref('calls/' + currentCallPeer).set({ status: 'incoming', role: 'callee', peerUid: currentUser.uid, peerName: myProfile.name, chatId: window.currentCallId });
}

async function acceptCall() {
  if (!currentCallPeer) return;
  const acceptBtn = document.getElementById('btn-accept-call'), statusView = document.getElementById('call-status-view'), ringAudio = document.getElementById('ringtone-audio');
  
  if(ringAudio && !ringAudio.paused) { ringAudio.pause(); ringAudio.currentTime = 0; }
  if(acceptBtn) acceptBtn.style.display = 'none'; 
  if(statusView) statusView.textContent = 'جاري التوصيل...';
  
  // 🚀 المستقبل يدخل غرفة الصوت فوراً بمجرد كبسة الزر
  await joinAgoraVoice(window.currentCallId);
  
  await db.ref('calls/' + currentUser.uid).update({ status: 'answered' }); 
  await db.ref('calls/' + currentCallPeer).update({ status: 'answered' });
  
  startCallTimer(); 
}

function endCall() {
  if (currentCallPeer) db.ref('calls/' + currentCallPeer).update({ status: 'ended' });
  db.ref('calls/' + currentUser.uid).remove(); 
  setTimeout(() => forceEndCallUI(), 500);
}

function forceEndCallUI() {
  if (window.callTimerInt) { clearInterval(window.callTimerInt); window.callTimerInt = null; }
  const ringAudio = document.getElementById('ringtone-audio'); 
  if (ringAudio && !ringAudio.paused) { ringAudio.pause(); ringAudio.currentTime = 0; }
  
  if (window.localCallTrack) { 
    window.localCallTrack.stop(); 
    window.localCallTrack.close(); 
    window.localCallTrack = null; 
  }
  if (window.rtcCallClient) { 
    window.rtcCallClient.leave(); 
  }
  // إغلاق فلاتر الصوت والمايكروفون المخصص لتنظيف الذاكرة
  if (window.callRawStream) {
    window.callRawStream.getTracks().forEach(t => t.stop());
    window.callRawStream = null;
  }
  if (window.callAudioCtx && window.callAudioCtx.state !== 'closed') {
    window.callAudioCtx.close();
    window.callAudioCtx = null;
  }
  window.currentCallId = null;
  if (document.getElementById('screen-call').classList.contains('active')) renderScreenUI('chat');
}

async function joinAgoraVoice(channelName) {
  try {
    if (!window.rtcCallClient) {
      window.rtcCallClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      window.rtcCallClient.on("user-published", async (user, mediaType) => { 
        await window.rtcCallClient.subscribe(user, mediaType); 
        if (mediaType === "audio") user.audioTrack.play(); 
      });
    }
    
    if (window.rtcCallClient.connectionState === "DISCONNECTED") {
      await window.rtcCallClient.join(AGORA_APP_ID, channelName, null, currentUser.uid);
      
      // 1. إغلاق عزل الصدى والضجيج للحصول على جودة الاستوديو المطلوبة
      window.callRawStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      window.callAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      // 2. تطبيق الفلاتر
      const source = window.callAudioCtx.createMediaStreamSource(window.callRawStream);
      const preGain = window.callAudioCtx.createGain(); 
      preGain.gain.value = 1.0; // قوة المايك الأساسية: 1
      
      const lowCutFilter = window.callAudioCtx.createBiquadFilter(); lowCutFilter.type = "highpass"; lowCutFilter.frequency.value = 160;
      const highCutFilter = window.callAudioCtx.createBiquadFilter(); highCutFilter.type = "lowpass"; highCutFilter.frequency.value = 10000;
      const presenceEQ = window.callAudioCtx.createBiquadFilter(); presenceEQ.type = "peaking"; presenceEQ.frequency.value = 3500; presenceEQ.Q.value = 1; presenceEQ.gain.value = 4;
      const compressor = window.callAudioCtx.createDynamicsCompressor(); compressor.threshold.value = -15; compressor.knee.value = 30; compressor.ratio.value = 3; compressor.attack.value = 0.005; compressor.release.value = 0.25;
      
      // 3. صدى الاستوديو
      function generateReverb(ctx) { const length = ctx.sampleRate * 2.0; const impulse = ctx.createBuffer(2, length, ctx.sampleRate); const left = impulse.getChannelData(0); const right = impulse.getChannelData(1); for (let i = 0; i < length; i++) { const decay = Math.pow(1 - i / length, 1.5); left[i] = (Math.random() * 2 - 1) * decay; right[i] = (Math.random() * 2 - 1) * decay; } return impulse; }
      const convolver = window.callAudioCtx.createConvolver(); convolver.buffer = generateReverb(window.callAudioCtx);
      
      const dryGain = window.callAudioCtx.createGain(); 
      dryGain.gain.value = 1.0; 
      const wetGain = window.callAudioCtx.createGain(); 
      wetGain.gain.value = 0.5; // كمية الصدى: 0.5
      
      const dest = window.callAudioCtx.createMediaStreamDestination();
      
      // ربط جميع الفلاتر مع بعضها
      source.connect(preGain); preGain.connect(lowCutFilter); lowCutFilter.connect(highCutFilter); highCutFilter.connect(presenceEQ); presenceEQ.connect(compressor);
      compressor.connect(dryGain); dryGain.connect(dest); 
      compressor.connect(convolver); convolver.connect(wetGain); wetGain.connect(dest);
      
      // إرسال الصوت لـ Agora
      window.localCallTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: dest.stream.getAudioTracks()[0], encoderConfig: "speech_standard" });
      await window.rtcCallClient.publish([window.localCallTrack]);
    }
  } catch (e) { 
    console.error("Agora Error:", e);
    showToast('خطأ بالصوت، تأكد من صلاحية المايك', 'error'); 
    endCall(); 
  }
}

/* ═══════════════════════════════════
   SEARCH LOGIC & CHAT MENU
═══════════════════════════════════ */
let chatSearchResults = []; let currentSearchIndex = -1; let searchTimeout = null;
function toggleChatSearch() {
  const bar = document.getElementById('chat-search-bar'), input = document.getElementById('chat-search-input');
  if (bar.style.display === 'none') { bar.style.display = 'flex'; input.value = ''; input.focus(); removeSearchOverlay(); } 
  else { bar.style.display = 'none'; removeSearchOverlay(); }
}
function removeSearchOverlay() {
  const el = document.getElementById('firebase-search-results'); if (el) el.remove();
  const area = document.getElementById('messages-area'); if (area) area.style.display = 'flex';
}
function searchInChat(query) {
  removeSearchOverlay(); if (!query.trim()) { document.getElementById('messages-area').style.display = 'flex'; return; }
  const area = document.getElementById('messages-area'); area.style.display = 'none';
  let overlay = document.createElement('div'); overlay.id = 'firebase-search-results'; overlay.style.cssText = 'flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; background:var(--bg-void); z-index:10;';
  overlay.innerHTML = `<div style="text-align:center; color:var(--neon-cyan); margin-top:40px;"><div style="width:30px; height:30px; border:3px solid var(--border-subtle); border-top-color:var(--neon-cyan); border-radius:50%; animation:spin .8s linear infinite; margin:0 auto 10px;"></div>جاري البحث في الأرشيف... 🔍</div>`;
  document.getElementById('screen-chat').insertBefore(overlay, document.getElementById('msg-reply-preview'));
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    if (!currentChat) return;
    try {
      const snap = await db.ref('chats/' + currentChat.chatId + '/messages').once('value'); let found = [];
      if (snap.exists()) snap.forEach(child => { const msg = child.val(); if (msg.type === 'text' && msg.text && msg.text.includes(query)) found.push({ ...msg, key: child.key }); });
      if (found.length === 0) { 
        chatSearchResults = []; currentSearchIndex = -1; 
        overlay.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin-top:40px;">لم يتم العثور على نتائج لكلمة "${escHtml(query)}"</div><button class="btn-primary" style="margin-top:20px; width:auto; align-self:center;" onclick="toggleChatSearch()">إغلاق البحث</button>`; 
        return; 
      }
      
      found.sort((a, b) => b.timestamp - a.timestamp);
      chatSearchResults = found;
      currentSearchIndex = 0; // 🚀 حفظنا النتيجة للأسهم

      let htmlStr = `<div style="color:var(--neon-green); margin-bottom:10px; font-weight:bold; text-align:center;">تم العثور على ${found.length} نتيجة</div>`;
      found.forEach((msg, idx) => {
        const isMe = msg.senderUid === currentUser.uid, senderName = isMe ? 'أنت' : currentChat.friendProfile.name, dateStr = new Date(msg.timestamp).toLocaleString('ar-EG', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
        const regex = new RegExp(`(${query})`, 'gi'), highlightedText = escHtml(msg.text).replace(regex, `<span style="background:var(--neon-cyan); color:var(--bg-void); padding:0 3px; border-radius:3px; font-weight:bold;">$1</span>`);
        htmlStr += `<div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:12px; padding:14px; border-right:4px solid ${isMe ? 'var(--neon-cyan)' : 'var(--neon-pink)'}; box-shadow:var(--shadow-neon); cursor:pointer; margin-bottom:8px;" onclick="currentSearchIndex = ${idx}; jumpToMessageContext('${msg.key}')"><div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-bottom:10px; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;"><span style="font-weight:bold; color:${isMe ? 'var(--neon-cyan)' : 'var(--neon-pink)'}">${senderName}</span><span>${dateStr}</span></div><div style="font-size:15px; line-height:1.6; color:var(--text-primary);">${highlightedText}</div><div style="text-align:left; margin-top:8px; font-size:11px; color:var(--neon-cyan);">اضغط للانتقال ↗️</div></div>`;
      });
      htmlStr += `<button class="btn-primary" style="margin-top:20px; margin-bottom:20px; width:auto; align-self:center;" onclick="toggleChatSearch()">إغلاق البحث</button>`;
      overlay.innerHTML = htmlStr;
    } catch (e) { overlay.innerHTML = `<div style="text-align:center; color:var(--neon-pink); margin-top:40px;">حدث خطأ أثناء البحث ❌</div>`; }
  }, 800);
}
async function jumpToMessageContext(msgKey) {
  removeSearchOverlay(); const area = document.getElementById('messages-area'); area.style.display = 'flex';
  
  if (document.getElementById('msg-' + msgKey)) { 
    const targetEl = document.getElementById('msg-' + msgKey);
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.style.transition = 'all 0.3s ease'; targetEl.style.boxShadow = '0 0 20px var(--neon-cyan)'; targetEl.style.transform = 'scale(1.05)';
    setTimeout(() => { targetEl.style.boxShadow = 'none'; targetEl.style.transform = 'scale(1)'; }, 1500);
    return; 
  }
  
  if (messagesRef && messagesListener) messagesRef.off('child_added', messagesListener);
  area.innerHTML = '<div style="text-align:center; padding:40px; color:var(--neon-cyan);">جاري الاسترجاع... ⏳</div>';
  try {
    const snapBefore = await db.ref('chats/' + currentChat.chatId + '/messages').orderByKey().endAt(msgKey).limitToLast(50).once('value');
    const snapAfter = await db.ref('chats/' + currentChat.chatId + '/messages').orderByKey().startAt(msgKey).limitToFirst(50).once('value');
    let msgsMap = {};
    if (snapBefore.exists()) snapBefore.forEach(c => { msgsMap[c.key] = { ...c.val(), key: c.key }; });
    if (snapAfter.exists()) snapAfter.forEach(c => { msgsMap[c.key] = { ...c.val(), key: c.key }; });
    let msgs = Object.values(msgsMap).sort((a, b) => a.timestamp - b.timestamp); area.innerHTML = '';
    const topBtn = document.createElement('div'); topBtn.innerHTML = `<div style="text-align:center; margin-bottom:15px;"><button class="btn-primary" style="width:auto; padding:8px 16px; font-size:13px; background:var(--neon-purple); border:none; box-shadow:var(--shadow-purple);" onclick="returnToLiveChat()">⬇️ العودة لآخر الرسائل ⬇️</button></div>`; area.appendChild(topBtn);
    let tempLastDate = '';
    msgs.forEach(m => {
      const dStr = formatDate(m.timestamp);
      if (dStr !== tempLastDate) { const sep = document.createElement('div'); sep.className = 'date-sep'; sep.innerHTML = `<span>${dStr}</span>`; area.appendChild(sep); tempLastDate = dStr; }
      area.appendChild(buildMsgEl(m, true));
    });
    const botBtn = document.createElement('div'); botBtn.innerHTML = `<div style="text-align:center; margin-top:15px; padding-bottom:20px;"><button class="btn-primary" style="width:auto; padding:8px 16px; font-size:13px; background:var(--neon-purple); border:none; box-shadow:var(--shadow-purple);" onclick="returnToLiveChat()">⬇️ العودة لآخر الرسائل ⬇️</button></div>`; area.appendChild(botBtn);
    
    setTimeout(() => { 
       const targetEl = document.getElementById('msg-' + msgKey);
       if (targetEl) {
         targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
         targetEl.style.transition = 'all 0.3s ease'; targetEl.style.boxShadow = '0 0 20px var(--neon-cyan)'; targetEl.style.transform = 'scale(1.05)';
         setTimeout(() => { targetEl.style.boxShadow = 'none'; targetEl.style.transform = 'scale(1)'; }, 1500);
       }
    }, 150);
  } catch (e) { area.innerHTML = '<div style="text-align:center; color:var(--neon-pink); padding:20px;">خطأ ❌</div><div style="text-align:center;"><button class="btn-primary" style="width:auto;" onclick="returnToLiveChat()">رجوع</button></div>'; }
}
function returnToLiveChat() { if (currentChat) attachMessages(currentChat.chatId); }
function nextSearchResult() { 
  if (!chatSearchResults || chatSearchResults.length === 0) return;
  currentSearchIndex++;
  if (currentSearchIndex >= chatSearchResults.length) currentSearchIndex = 0;
  jumpToMessageContext(chatSearchResults[currentSearchIndex].key);
  showToast(`النتيجة ${currentSearchIndex + 1} من ${chatSearchResults.length}`, 'info');
}
function prevSearchResult() { 
  if (!chatSearchResults || chatSearchResults.length === 0) return;
  currentSearchIndex--;
  if (currentSearchIndex < 0) currentSearchIndex = chatSearchResults.length - 1;
  jumpToMessageContext(chatSearchResults[currentSearchIndex].key);
  showToast(`النتيجة ${currentSearchIndex + 1} من ${chatSearchResults.length}`, 'info');
}

function openHomeChatMenu(chatId, friendUid, friendName) {
  const menu = document.getElementById('msg-menu');
  menu.innerHTML = `<div style="font-size:14px; font-weight:bold; color:var(--text-secondary); text-align:center; margin-bottom:10px; border-bottom:1px solid var(--border-subtle); padding-bottom:8px;">إعدادات المحادثة: ${escHtml(friendName)}</div>
  <button class="msg-menu-btn" onclick="clearChatHistory('${chatId}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg> مسح المحادثة الداخلية</button>
  <button class="msg-menu-btn danger" onclick="removeChatFromList('${chatId}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5c-1.1 0-2 .9-2 2v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg> حذف من الشاشة الرئيسية</button>
  <button class="msg-menu-btn danger" onclick="blockUser('${friendUid}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> حظر الشخص</button>`;
  document.getElementById('msg-menu-overlay').classList.add('open'); if (navigator.vibrate) navigator.vibrate(50);
}
function clearChatHistory(chatId) {
  openModal('مسح', 'مسح رسائل هذه المحادثة من جهازك؟').then(ok => {
    if (ok) {
      db.ref('chats/' + chatId + '/messages').remove().then(() => {
        localStorage.removeItem('chat_cache_' + chatId);
        if (currentChat && currentChat.chatId === chatId) {
          document.getElementById('messages-area').innerHTML = '';
        }
        showToast('تم مسح المحادثة', 'success');
      });
      db.ref('userChats/' + currentUser.uid + '/' + chatId + '/lastMsg').set('');
    }
  });
}
async function removeChatFromList(chatId) {
  const ok = await openModal('إخفاء المحادثة', 'سيتم إخفاء المحادثة، ولكن سيبقى الشخص في قائمة الأصدقاء.');
  if (ok) {
    showToast('جاري الإخفاء...');
    try {
      const uids = chatId.split('_'), friendUid = uids[0] === currentUser.uid ? uids[1] : uids[0];
      if (friendUid) {
        const fSnap = await db.ref('users/' + friendUid).once('value');
        if (fSnap.exists()) { const fData = fSnap.val(); await db.ref('friendsList/' + currentUser.uid + '/' + friendUid).update({ name: fData.name || 'مستخدم', photo: fData.photo || '', timestamp: Date.now() }); }
      }
      await db.ref('userChats/' + currentUser.uid + '/' + chatId).remove(); showToast('تم الإخفاء ✔️', 'success');
    } catch (err) { showToast('خطأ', 'error'); }
  }
}
function blockUser(friendUid) {
  openModal('حظر', 'هل أنت متأكد من حظر هذا الشخص؟').then(ok => {
    if (ok) {
      // نسجل توقيت الحظر عشان يظهر كآخر ظهور عنده
      db.ref('blockedUsers/' + currentUser.uid + '/' + friendUid).set(Date.now());
      showToast('تم الحظر بنجاح', 'success');
      showScreen('home'); // نرجعه للرئيسية عشان تختفي المحادثة قدامه فوراً
    }
  });
}

/* ═══════════════════════════════════
   THEME TOGGLE
═══════════════════════════════════ */
let isLightMode = localStorage.getItem('theme') === 'light';
if (isLightMode) document.body.classList.add('light-theme');

function toggleTheme() {
  isLightMode = !isLightMode;
  if (isLightMode) {
    document.body.classList.add('light-theme');
    localStorage.setItem('theme', 'light');
  } else {
    document.body.classList.remove('light-theme');
    localStorage.setItem('theme', 'dark');
  }
}
/* ═══════════════════════════════════
   BLOCKED USERS SYSTEM
═══════════════════════════════════ */
function loadBlockedUsers() {
  const container = document.getElementById('blocked-users-container');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center; color:var(--neon-cyan); margin-top:40px;">جاري التحميل... ⏳</div>';
  
  db.ref('blockedUsers/' + currentUser.uid).once('value', async snap => {
    if (!snap.exists()) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top:40px;">لا يوجد أشخاص محظورين</div>';
      return;
    }
    
    container.innerHTML = '';
    const blockedIds = Object.keys(snap.val());
    for (let i = 0; i < blockedIds.length; i++) {
      const bUid = blockedIds[i];
      const userSnap = await db.ref('users/' + bUid).once('value');
      if (userSnap.exists()) {
        const uData = userSnap.val();
        const card = document.createElement('div');
        card.className = 'search-result-card';
        card.style.cssText = 'padding:12px 16px; margin-bottom:8px; display:flex; align-items:center; border-color:rgba(255,0,144,0.3);';
        card.innerHTML = `
          <div class="search-result-avatar" style="width:40px;height:40px;font-size:15px; border-color:var(--neon-pink); background:rgba(255,0,144,0.1); color:var(--neon-pink);">
            ${uData.photo ? `<img src="${uData.photo}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"/>` : (uData.name || '?').charAt(0)}
          </div>
          <div class="search-result-info" style="flex:1; margin-right:12px;">
            <div class="search-result-name" style="font-size:16px;margin-bottom:0; color:var(--text-primary);">${escHtml(uData.name)}</div>
          </div>
          <button class="btn-danger" style="width:auto;padding:8px 16px;font-size:13px;" onclick="unblockUser('${bUid}', this)">إلغاء الحظر</button>
        `;
        container.appendChild(card);
      }
    }
  });
}

function unblockUser(bUid, btnEl) {
  openModal('إلغاء الحظر', 'هل أنت متأكد من فك الحظر عن هذا الشخص؟').then(ok => {
    if (ok) {
      db.ref('blockedUsers/' + currentUser.uid + '/' + bUid).remove().then(() => {
        showToast('تم إلغاء الحظر بنجاح', 'success');
        if (btnEl) btnEl.closest('.search-result-card').remove();
        const container = document.getElementById('blocked-users-container');
        if (container && container.children.length === 0) {
           container.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top:40px;">لا يوجد أشخاص محظورين</div>';
        }
      });
    }
  });
}
