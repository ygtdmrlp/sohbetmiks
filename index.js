const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidV4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Statik dosyaları sun (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Ana sayfa yönlendirmesi
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Odalar ve kullanıcıları tutacak basit bir nesne
const rooms = {
    'genel-sohbet': {
        name: 'Genel Sohbet',
        users: new Set()
    }
};

// Basit kullanıcı veritabanı (Render'da her deploy'da sıfırlanır)
const registeredUsers = {}; // username -> { password, avatar }

io.on('connection', (socket) => {
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);

    // Kullanıcı odaya katılmak istediğinde
    socket.on('join-room', ({ username, password, avatar }) => {
        const roomId = 'genel-sohbet';
        
        // Şifre kontrolü
        if (registeredUsers[username]) {
            if (registeredUsers[username].password !== password) {
                return socket.emit('login-error', 'Hatalı şifre! Bu kullanıcı adı rezerve edilmiş.');
            }
        } else {
            // İlk kez giriş yapıyorsa "mersin" şifresini zorunlu tut (kullanıcı bazlı)
            if (password !== 'mersin') {
                return socket.emit('login-error', 'İlk giriş için doğru şifreyi girmelisiniz!');
            }
            // Kaydet
            registeredUsers[username] = { password: password, avatar: avatar || null };
        }

        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;
        socket.avatar = avatar || registeredUsers[username].avatar;

        // Mevcut kullanıcı listesini (kendisi hariç) yeni kullanıcıya gönder
        const usersInRoom = [];
        rooms[roomId].users.forEach(id => {
            const userSocket = io.sockets.sockets.get(id);
            if (userSocket) {
                usersInRoom.push({
                    userId: id,
                    username: userSocket.username,
                    avatar: userSocket.avatar
                });
            }
        });
        
        // Yeni kullanıcıya mevcut listeyi gönder
        socket.emit('initial-users', usersInRoom);

        // Şimdi kendisini listeye ekle
        rooms[roomId].users.add(socket.id);

        // Odaya yeni birinin katıldığını diğerlerine bildir
        socket.to(roomId).emit('user-connected', {
            userId: socket.id,
            username: username,
            avatar: socket.avatar
        });

        console.log(`${username} (${socket.id}) ${roomId} odasına katıldı.`);

        // Bağlantı koptuğunda
        socket.on('disconnect', () => {
            console.log(`${username} ayrıldı.`);
            if (rooms[roomId]) {
                rooms[roomId].users.delete(socket.id);
                socket.to(roomId).emit('user-disconnected', socket.id);
            }
        });
    });

    // Profil Güncelleme
    socket.on('update-profile', ({ username, avatar }) => {
        if (socket.username && registeredUsers[socket.username]) {
            // Sadece avatar güncelleniyor (basitlik için)
            socket.avatar = avatar;
            registeredUsers[socket.username].avatar = avatar;
            
            io.to(socket.roomId).emit('user-profile-updated', {
                userId: socket.id,
                username: socket.username,
                avatar: avatar
            });
        }
    });

    // WebRTC Sinyalleşme (Offer, Answer, ICE Candidate)
    socket.on('signal', (data) => {
        // Hedef kullanıcıya sinyal bilgisini ilet
        io.to(data.to).emit('signal', {
            from: socket.id,
            signal: data.signal,
            username: socket.username
        });
    });

    // Yazılı sohbet mesajı
    socket.on('chat-message', (message) => {
        io.to(socket.roomId).emit('chat-message', {
            username: socket.username,
            message: message,
            time: new Date().toLocaleTimeString()
        });
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor.`);
});
