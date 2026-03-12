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
    currentRoomId = 'genel-sohbet';

    if (myUsername) {
        try {
            // Mikrofona erişim iste
            if (!localStream) {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }
            
            // UI Güncelle
            loginOverlay.classList.add('hidden');
            document.getElementById('display-username').innerText = myUsername;
            document.getElementById('user-avatar-initial').innerText = myUsername[0].toUpperCase();
            document.getElementById('chat-header').innerText = 'Genel Sohbet';

            // Sunucuya katılma isteği gönder
            socket.emit('join-room', { username: myUsername });
            
            // Kendimizi listeye ekle
            updateUserList(socket.id, myUsername, true);
            
            console.log('Genel odaya katılındı');
        } catch (err) {
            alert('Mikrofon erişimi reddedildi veya bulunamadı!');
            console.error('Medya hatası:', err);
        }
    }
});

// Odaya ilk girildiğinde mevcut kullanıcıları al
socket.on('initial-users', (users) => {
    users.forEach(user => {
        updateUserList(user.userId, user.username, true);
    });
});

// 2. Yeni Bir Kullanıcı Bağlandığında (Oda arkadaşı)
socket.on('user-connected', async ({ userId, username }) => {
    console.log('Yeni kullanıcı bağlandı:', username, userId);
    addMessage('Sistem', `${username} odaya katıldı.`, 'italic');
    updateUserList(userId, username, true);

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

    updateUserList(userId, username, true);
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
function updateUserList(userId, username, isOnline) {
    if (document.getElementById(`user-${userId}`)) return;

    const userDiv = document.createElement('div');
    userDiv.id = `user-${userId}`;
    userDiv.className = "flex items-center p-1 rounded hover:bg-gray-700 cursor-pointer group";
    userDiv.innerHTML = `
        <div class="relative">
            <div class="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center font-bold mr-3">
                ${username[0].toUpperCase()}
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
