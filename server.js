require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const https = require('https');
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/zhexz_chat';
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB successfully!');
        seedDatabase();
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });

// Database Schemas & Models
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String },
    theme: { type: String, default: 'dark' }
});

const GroupSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    desc: { type: String },
    dp: { type: String }
});

const MessageSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    groupId: { type: String, required: true },
    user: { type: String, required: true },
    avatar: { type: String },
    text: { type: String },
    url: { type: String },
    type: { type: String },
    replyTo: {
        id: { type: String },
        user: { type: String },
        text: { type: String }
    },
    time: { type: String }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Group = mongoose.model('Group', GroupSchema);
const Message = mongoose.model('Message', MessageSchema);

// Database Seeding function for initial setup
async function seedDatabase() {
    try {
        // Seed default admin user
        const adminExists = await User.findOne({ username: 'KernelX' });
        if (!adminExists) {
            await User.create({ username: 'KernelX', password: 'Slrambo1234@', theme: 'default' });
            console.log('Seeded default admin user KernelX');
        }
        // Seed default core group
        const mainGroupExists = await Group.findOne({ id: 'group_main' });
        if (!mainGroupExists) {
            await Group.create({
                id: 'group_main',
                name: 'Zhexz Team',
                desc: 'Global Chat',
                dp: 'https://ui-avatars.com/api/?name=Zhexz+Team&background=6366f1&color=fff'
            });
            console.log('Seeded default group_main');
        }
    } catch (err) {
        console.error('Error seeding database:', err);
    }
}

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
const io = new Server(server);

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

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Auth API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
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
    } catch (e) {
        res.status(500).json({ success: false, message: 'Server database error' });
    }
});

// Update Profile API
app.post('/api/update-profile', async (req, res) => {
    const { username, password, avatar, theme } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (user) {
            if (avatar !== undefined) user.avatar = avatar;
            if (theme !== undefined) user.theme = theme;
            await user.save();
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: 'Unauthorized' });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

// Admin User Creation API
app.post('/api/create-user', async (req, res) => {
    const { adminUsername, adminPassword, newUsername, newPassword } = req.body;
    
    if (adminUsername !== 'KernelX' || adminPassword !== 'Slrambo1234@') {
        return res.status(403).json({ success: false, message: 'Unauthorized. Admin only.' });
    }

    try {
        const exists = await User.findOne({ username: newUsername });
        if (exists) {
            return res.status(400).json({ success: false, message: 'User already exists!' });
        }

        await User.create({ username: newUsername, password: newPassword });
        res.json({ success: true, message: `User ${newUsername} created!` });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/api/ai', async (req, res) => {
    try {
        const data = await fetchAI(req.query.prompt);
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/messages', async (req, res) => {
    try {
        const messages = await Message.find({}).sort({ createdAt: 1 });
        res.json({ success: true, messages });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/api/users-list', async (req, res) => {
    try {
        const rawUsers = await User.find({});
        const users = rawUsers.map(u => ({
            username: u.username,
            avatar: u.avatar || `https://ui-avatars.com/api/?name=${u.username}&background=random`
        }));
        res.json({ success: true, users });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/groups', async (req, res) => {
    try {
        const groups = await Group.find({});
        res.json({ success: true, groups });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/create-group', async (req, res) => {
    const { name, desc, dp } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    try {
        const newGroup = await Group.create({
            id: 'group_' + Date.now(),
            name,
            desc: desc || '',
            dp: dp || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
        });
        res.json({ success: true, group: newGroup });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

// Handle media upload
app.post('/upload', upload.single('media'), (req, res) => {
    if (req.file) {
        res.json({ success: true, fileUrl: `/uploads/${req.file.filename}`, type: req.file.mimetype });
    } else {
        res.status(400).json({ success: false, message: 'No file uploaded' });
    }
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // When a user joins
    socket.on('join', async (data) => {
        try {
            const user = await User.findOne({ username: data.username, password: data.password });
            if (user) {
                socket.username = data.username;
                socket.avatar = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=random`;
                activeUsers.set(data.username, socket.id);
                io.emit('system_message', { text: `${data.username} joined the chat`, groupId: 'group_main' });
            } else {
                socket.disconnect(); // Reject invalid socket connections
            }
        } catch (e) {
            socket.disconnect();
        }
    });

    // When a user sends a text message
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
        try {
            await Message.create(newMsg);
            io.emit('chat_message', newMsg);

            if (data.text.toLowerCase().includes('@ai') || data.groupId === 'ai_chat') {
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
                            await Message.create(aiMsg);
                            io.emit('chat_message', aiMsg);
                        }
                    } catch (e) {
                        console.error('AI Error:', e);
                    }
                }
            }
        } catch (e) {
            console.error('Error saving chat message:', e);
        }
    });

    // When a user sends media
    socket.on('media_message', async (data) => {
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
        try {
            await Message.create(newMsg);
            io.emit('media_message', newMsg);
        } catch (e) {
            console.error('Error saving media message:', e);
        }
    });

    // When a user deletes a message
    socket.on('delete_message', async (data) => {
        try {
            const msg = await Message.findOne({ id: data.id });
            if (msg) {
                if (msg.user === socket.username || socket.username === 'KernelX') {
                    await Message.deleteOne({ id: data.id });
                    io.emit('delete_message', { id: data.id, groupId: data.groupId });
                }
            }
        } catch (e) {
            console.error('Error deleting message:', e);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Zhexz Chat Server running on http://localhost:${PORT}`);
});

module.exports = server;
