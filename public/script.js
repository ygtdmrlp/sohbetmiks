/**
 * Sohbet DC - Client-side JavaScript
 * WebRTC ve Socket.io entegrasyonu
 */

const socket = io();
const loginOverlay = document.getElementById('login-overlay');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const messagesContainer = document.getElementById('messages-container');
const chatInput = document.getElementById('chat-input');
const onlineUsersList = document.getElementById('online-users-list');
const audioContainer = document.getElementById('audio-container');
const toggleMicBtn = document.getElementById('toggle-mic');
const toggleAudioBtn = document.getElementById('toggle-audio');
const sidebar = document.getElementById('sidebar');
const usersPanel = document.getElementById('users-panel');
const mobileOverlay = document.getElementById('mobile-overlay');
const passwordInput = document.getElementById('password-input');
const settingsModal = document.getElementById('settings-modal');
const avatarUpload = document.getElementById('avatar-upload');
const settingsAvatarPreview = document.getElementById('settings-avatar-preview');

let myAvatar = localStorage.getItem('chat-avatar') || null;

// Sayfa yüklendiğinde hatırlanan bilgileri doldur
window.addEventListener('load', () => {
    const savedName = localStorage.getItem('chat-username');
    const savedPass = localStorage.getItem('chat-password');
    if (savedName) {
        usernameInput.value = savedName;
    }
    if (savedPass) {
        passwordInput.value = savedPass;
    }
});

// Mobil Menü Fonksiyonları
function toggleSidebar() {
    sidebar.classList.toggle('mobile-sidebar-active');
    mobileOverlay.classList.toggle('hidden');
    // Eğer diğer panel açıksa kapat
    if (usersPanel.classList.contains('mobile-users-active')) {
        usersPanel.classList.remove('mobile-users-active');
    }
}

function toggleUsers() {
    usersPanel.classList.toggle('mobile-users-active');
    mobileOverlay.classList.toggle('hidden');
    // Eğer diğer panel açıksa kapat
    if (sidebar.classList.contains('mobile-sidebar-active')) {
        sidebar.classList.remove('mobile-sidebar-active');
    }
}

// Overlay'e tıklandığında her şeyi kapat
mobileOverlay.addEventListener('click', () => {
    sidebar.classList.remove('mobile-sidebar-active');
    usersPanel.classList.remove('mobile-users-active');
    mobileOverlay.classList.add('hidden');
});

// WebRTC Yapılandırması (Ücretsiz STUN sunucuları kullanılır)
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let localStream;
let myPeerConnections = {}; // socketId -> RTCPeerConnection
let myUsername = '';
let currentRoomId = '';
let isMicOn = true;
let isAudioOn = true;

// 1. Giriş Yapma
joinBtn.addEventListener('click', async () => {
    myUsername = usernameInput.value.trim() || 'Anonim';
    const password = passwordInput.value.trim();
    currentRoomId = 'genel-sohbet';

    if (myUsername) {
        if (!password) {
            alert('Lütfen şifrenizi girin!');
            return;
        }

        try {
            // Mikrofona erişim iste
            if (!localStream) {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }
            
            // Sunucuya katılma isteği gönder (Şifre ile birlikte)
            socket.emit('join-room', { 
                username: myUsername, 
                password: password,
                avatar: myAvatar 
            });
            
        } catch (err) {
            alert('Mikrofon erişimi reddedildi veya bulunamadı!');
            console.error('Medya hatası:', err);
        }
    }
});

// Giriş Hatası
socket.on('login-error', (msg) => {
    alert(msg);
});

// Giriş Başarılı (İlk kullanıcı listesi gelince girişi tamamla)
socket.on('initial-users', (users) => {
    // UI Güncelle
    loginOverlay.classList.add('hidden');
    document.getElementById('display-username').innerText = myUsername;
    document.getElementById('user-avatar-initial').innerText = myUsername[0].toUpperCase();
    if (myAvatar) {
        document.getElementById('user-avatar-initial').innerHTML = `<img src="${myAvatar}" class="w-full h-full object-cover">`;
    }
    document.getElementById('chat-header').innerText = 'Genel Sohbet';

    // Bilgileri hatırla
    localStorage.setItem('chat-username', myUsername);
    localStorage.setItem('chat-password', passwordInput.value.trim());
    
    // Listeyi doldur
    users.forEach(user => {
        updateUserList(user.userId, user.username, true, user.avatar);
    });

    // Kendimizi listeye ekle
    updateUserList(socket.id, myUsername, true, myAvatar);
    console.log('Genel odaya katılındı');
});

// Ayarlar Fonksiyonları
function openSettings() {
    settingsModal.classList.remove('hidden');
    document.getElementById('settings-username').value = myUsername;
    if (myAvatar) {
        settingsAvatarPreview.innerHTML = `<img src="${myAvatar}" class="w-full h-full object-cover">`;
    } else {
        settingsAvatarPreview.innerText = myUsername[0].toUpperCase();
    }
}

function closeSettings() {
    settingsModal.classList.add('hidden');
}

avatarUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            myAvatar = event.target.result;
            settingsAvatarPreview.innerHTML = `<img src="${myAvatar}" class="w-full h-full object-cover">`;
        };
        reader.readAsDataURL(file);
    }
});

function saveSettings() {
    // Avatarı kaydet
    if (myAvatar) {
        localStorage.setItem('chat-avatar', myAvatar);
        document.getElementById('user-avatar-initial').innerHTML = `<img src="${myAvatar}" class="w-full h-full object-cover">`;
    }
    
    // Sunucuya bildir
    socket.emit('update-profile', { 
        username: myUsername, 
        avatar: myAvatar 
    });
    
    // Kendi listemizi güncelle
    const myUserEl = document.getElementById(`user-${socket.id}`);
    if (myUserEl) {
        const avatarEl = myUserEl.querySelector('.w-8.h-8');
        if (myAvatar) {
            avatarEl.innerHTML = `<img src="${myAvatar}" class="w-full h-full object-cover">`;
        }
    }

    closeSettings();
}

// Profil Güncelleme Dinle
socket.on('user-profile-updated', ({ userId, username, avatar }) => {
    const userEl = document.getElementById(`user-${userId}`);
    if (userEl) {
        const avatarEl = userEl.querySelector('.w-8.h-8');
        if (avatar) {
            avatarEl.innerHTML = `<img src="${avatar}" class="w-full h-full object-cover">`;
        } else {
            avatarEl.innerHTML = username[0].toUpperCase();
        }
    }
});

// 2. Yeni Bir Kullanıcı Bağlandığında (Oda arkadaşı)
socket.on('user-connected', async ({ userId, username, avatar }) => {
    console.log('Yeni kullanıcı bağlandı:', username, userId);
    addMessage('Sistem', `${username} odaya katıldı.`, 'italic');
    updateUserList(userId, username, true, avatar);

    // Yeni gelen kullanıcıya bir "Offer" (Teklif) gönder (Bağlantıyı başlatan taraf biziz)
    createPeerConnection(userId, username, true);
});

// 3. Bir Kullanıcı Ayrıldığında
socket.on('user-disconnected', (userId) => {
    console.log('Kullanıcı ayrıldı:', userId);
    if (myPeerConnections[userId]) {
        myPeerConnections[userId].close();
        delete myPeerConnections[userId];
    }
    const userEl = document.getElementById(`user-${userId}`);
    if (userEl) userEl.remove();
    const audioEl = document.getElementById(`audio-${userId}`);
    if (audioEl) audioEl.remove();
    updateOnlineCount();
});

// 4. WebRTC Sinyalleşme Mesajlarını Al
socket.on('signal', async ({ from, signal, username }) => {
    if (!myPeerConnections[from]) {
        // Eğer henüz bir bağlantı yoksa oluştur (Cevap veren tarafız)
        // Not: Yeni gelen kullanıcının avatar bilgisini buradan alamıyoruz ama updateUserList'te zaten eklenmiş olacak
        createPeerConnection(from, username, false);
    }

    const pc = myPeerConnections[from];

    if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: from, signal: answer });
    } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(signal));
        } catch (e) {
            console.error('ICE Candidate hatası:', e);
        }
    }
});

// 5. PeerConnection Oluşturma Fonksiyonu
function createPeerConnection(userId, username, isInitiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    myPeerConnections[userId] = pc;

    // Yerel ses akışını ekle
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    // Karşı taraftan gelen ses akışını yakala
    pc.ontrack = (event) => {
        console.log('Ses akışı alındı:', username);
        let audioEl = document.getElementById(`audio-${userId}`);
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = `audio-${userId}`;
            audioEl.autoplay = true;
            audioContainer.appendChild(audioEl);
        }
        audioEl.srcObject = event.streams[0];
    };

    // ICE adaylarını gönder
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { to: userId, signal: event.candidate });
        }
    };

    // Eğer biz başlatıyorsak (Initiator), bir Offer oluştur
    if (isInitiator) {
        pc.onnegotiationneeded = async () => {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('signal', { to: userId, signal: offer });
            } catch (err) {
                console.error('Offer hatası:', err);
            }
        };
    }
}

// 6. Yazılı Sohbet İşlemleri
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
        socket.emit('chat-message', chatInput.value);
        chatInput.value = '';
    }
});

socket.on('chat-message', ({ username, message, time }) => {
    addMessage(username, message);
});

function addMessage(user, msg, style = '') {
    const div = document.createElement('div');
    div.className = `flex flex-col ${style}`;
    div.innerHTML = `
        <div class="flex items-baseline space-x-2">
            <span class="font-bold text-indigo-400">${user}</span>
            <span class="text-xs text-gray-500">${new Date().toLocaleTimeString()}</span>
        </div>
        <div class="text-gray-200">${msg}</div>
    `;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 7. UI Yardımcı Fonksiyonları
function updateUserList(userId, username, isOnline, avatar = null) {
    if (document.getElementById(`user-${userId}`)) {
        // Varsa avatarı güncelle
        const avatarEl = document.getElementById(`user-${userId}`).querySelector('.w-8.h-8');
        if (avatar) avatarEl.innerHTML = `<img src="${avatar}" class="w-full h-full object-cover">`;
        return;
    }

    const userDiv = document.createElement('div');
    userDiv.id = `user-${userId}`;
    userDiv.className = "flex items-center p-1 rounded hover:bg-gray-700 cursor-pointer group";
    
    const avatarContent = avatar 
        ? `<img src="${avatar}" class="w-full h-full object-cover">` 
        : username[0].toUpperCase();

    userDiv.innerHTML = `
        <div class="relative">
            <div class="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center font-bold mr-3 overflow-hidden">
                ${avatarContent}
            </div>
            <div class="absolute bottom-0 right-2 w-3 h-3 bg-green-500 border-2 border-gray-800 rounded-full"></div>
        </div>
        <span class="text-gray-400 group-hover:text-white truncate">${username}</span>
    `;
    onlineUsersList.appendChild(userDiv);
    updateOnlineCount();
}

function updateOnlineCount() {
    const count = onlineUsersList.children.length;
    document.getElementById('online-count').innerText = count;
}

// 8. Mikrofon ve Ses Kontrolleri
toggleMicBtn.addEventListener('click', () => {
    isMicOn = !isMicOn;
    localStream.getAudioTracks()[0].enabled = isMicOn;
    toggleMicBtn.innerHTML = isMicOn ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash text-red-500"></i>';
    toggleMicBtn.classList.toggle('bg-red-900', !isMicOn);
});

toggleAudioBtn.addEventListener('click', () => {
    isAudioOn = !isAudioOn;
    const remoteAudios = audioContainer.querySelectorAll('audio');
    remoteAudios.forEach(audio => {
        audio.muted = !isAudioOn;
    });
    toggleAudioBtn.innerHTML = isAudioOn ? '<i class="fas fa-headphones"></i>' : '<i class="fas fa-volume-mute text-red-500"></i>';
    toggleAudioBtn.classList.toggle('bg-red-900', !isAudioOn);
});
