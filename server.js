const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const https = require('https');

const MESSAGES_FILE = path.join(__dirname, 'messages.json');
function getMessages() {
    if (!fs.existsSync(MESSAGES_FILE)) { fs.writeFileSync(MESSAGES_FILE, JSON.stringify([])); return []; }
    try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')); } catch(e) { return []; }
}
function saveMessages(msgs) { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(msgs, null, 2)); }

const activeUsers = new Map();

function fetchAI(prompt) {
    return new Promise((resolve, reject) => {
        https.get(`https://apis.prexzyvilla.site/ai/aichat?prompt=${encodeURIComponent(prompt)}`, (resp) => {
            let data = '';
            resp.on('data', (chunk) => data += chunk);
            resp.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on("error", (err) => reject(err));
    });
}

const app = express();
const server = http.createServer(app);

// Cors සෙට් කරලා Socket.io එක හරියටම configure කිරීම
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration for media sharing
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// User Management
const USERS_FILE = path.join(__dirname, 'users.json');

function getUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        const defaultAdmin = [{ username: 'KernelX', password: 'Slrambo1234@' }];
        fs.writeFileSync(USERS_FILE, JSON.stringify(defaultAdmin, null, 2));
        return defaultAdmin;
    }
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch(e) { return []; }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

const GROUPS_FILE = path.join(__dirname, 'groups.json');
function getGroups() {
    if (!fs.existsSync(GROUPS_FILE)) {
        const defaultGroups = [{ id: 'group_main', name: 'Zhexz Team', desc: 'Global Chat', dp: 'https://ui-avatars.com/api/?name=Zhexz+Team&background=6366f1&color=fff' }];
        fs.writeFileSync(GROUPS_FILE, JSON.stringify(defaultGroups, null, 2));
        return defaultGroups;
    }
    try { return JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8')); } catch(e) { return []; }
}
function saveGroups(groups) {
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2));
}

// Auth API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
        if (activeUsers.has(username)) {
            return res.status(403).json({ success: false, message: 'Account is already logged in on another device.' });
        }
        res.json({ 
            success: true, 
            isAdmin: username === 'KernelX',
            avatar: user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`,
            theme: user.theme || 'default'
        });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Update Profile API
app.post('/api/update-profile', (req, res) => {
    const { username, password, avatar, theme } = req.body;
    const users = getUsers();
    const userIndex = users.findIndex(u => u.username === username && u.password === password);
    
    if (userIndex !== -1) {
        if (avatar !== undefined) users[userIndex].avatar = avatar;
        if (theme !== undefined) users[userIndex].theme = theme;
        saveUsers(users);
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Unauthorized' });
    }
});

// Admin User Creation API
app.post('/api/create-user', (req, res) => {
    const { adminUsername, adminPassword, newUsername, newPassword } = req.body;
    
    if (adminUsername !== 'KernelX' || adminPassword !== 'Slrambo1234@') {
        return res.status(403).json({ success: false, message: 'Unauthorized. Admin only.' });
    }

    const users = getUsers();
    if (users.find(u => u.username === newUsername)) {
        return res.status(400).json({ success: false, message: 'User already exists!' });
    }

    users.push({ username: newUsername, password: newPassword });
    saveUsers(users);
    
    res.json({ success: true, message: `User ${newUsername} created!` });
});

app.get('/api/ai', async (req, res) => {
    try {
        const data = await fetchAI(req.query.prompt);
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/messages', (req, res) => {
    res.json({ success: true, messages: getMessages() });
});

app.get('/api/users-list', (req, res) => {
    const users = getUsers().map(u => ({ username: u.username, avatar: u.avatar || `https://ui-avatars.com/api/?name=${u.username}&background=random` }));
    res.json({ success: true, users });
});

app.get('/api/groups', (req, res) => {
    res.json({ success: true, groups: getGroups() });
});

app.post('/api/create-group', (req, res) => {
    const { name, desc, dp } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    const groups = getGroups();
    const newGroup = {
        id: 'group_' + Date.now(),
        name,
        desc: desc || '',
        dp: dp || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
    };
    groups.push(newGroup);
    saveGroups(groups);
    res.json({ success: true, group: newGroup });
});

// Handle media upload
app.post('/upload', upload.single('media'), (req, res) => {
    if (req.file) {
        res.json({ success: true, fileUrl: `/uploads/${req.file.filename}`, type: req.file.mimetype });
    } else {
        res.status(400).json({ success: false, message: 'No file uploaded' });
    }
});

// Socket.io Realtime Logic
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', (data) => {
        const users = getUsers();
        const user = users.find(u => u.username === data.username && u.password === data.password);
        if (user) {
            socket.username = data.username;
            socket.avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=random`;
            activeUsers.set(data.username, socket.id);
            io.emit('system_message', { text: `${data.username} joined the chat`, groupId: 'group_main' });
        } else {
            socket.disconnect();
        }
    });

    socket.on('chat_message', async (data) => {
        const msgId = Date.now() + Math.random().toString(36).substr(2, 9);
        const newMsg = {
            id: msgId,
            groupId: data.groupId || 'group_main',
            user: socket.username,
            avatar: socket.avatar,
            text: data.text,
            replyTo: data.replyTo || null,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        const messages = getMessages();
        messages.push(newMsg);
        saveMessages(messages);
        io.emit('chat_message', newMsg);

        if (data.text && (data.text.toLowerCase().includes('@ai') || data.groupId === 'ai_chat')) {
            const prompt = data.text.replace(/@ai/gi, '').trim();
            if (prompt) {
                try {
                    const aiData = await fetchAI(prompt);
                    if (aiData && aiData.response) {
                        const aiMsg = {
                            id: Date.now() + Math.random().toString(36).substr(2, 9),
                            groupId: data.groupId || 'group_main',
                            user: 'AI Assistant',
                            avatar: 'https://ui-avatars.com/api/?name=AI&background=0D8ABC&color=fff',
                            text: aiData.response,
                            replyTo: { id: msgId, user: socket.username, text: data.text },
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        };
                        messages.push(aiMsg);
                        saveMessages(messages);
                        io.emit('chat_message', aiMsg);
                    }
                } catch (e) {
                    console.error('AI Error:', e);
                }
            }
        }
    });

    socket.on('media_message', (data) => {
        const msgId = Date.now() + Math.random().toString(36).substr(2, 9);
        const newMsg = {
            id: msgId,
            groupId: data.groupId || 'group_main',
            user: socket.username,
            avatar: socket.avatar,
            url: data.url,
            type: data.type,
            replyTo: data.replyTo || null,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        const messages = getMessages();
        messages.push(newMsg);
        saveMessages(messages);
        io.emit('media_message', newMsg);
    });

    socket.on('delete_message', (data) => {
        const messages = getMessages();
        const msgIndex = messages.findIndex(m => m.id === data.id);
        if (msgIndex !== -1) {
            const msg = messages[msgIndex];
            if (msg.user === socket.username || socket.username === 'KernelX') {
                messages.splice(msgIndex, 1);
                saveMessages(messages);
                io.emit('delete_message', { id: data.id, groupId: data.groupId });
            }
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            io.emit('system_message', { text: `${socket.username} left the chat`, groupId: 'group_main' });
            activeUsers.delete(socket.username);
        }
        console.log('User disconnected:', socket.id);
    });
});

// Front-end Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Zhexz Chat Server running on port ${PORT}`);
});
