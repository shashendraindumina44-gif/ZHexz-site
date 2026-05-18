const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const https = require('https');

const IS_VERCEL = process.env.VERCEL;
const MESSAGES_FILE = IS_VERCEL ? path.join('/tmp', 'messages.json') : path.join(__dirname, 'messages.json');
const USERS_FILE = IS_VERCEL ? path.join('/tmp', 'users.json') : path.join(__dirname, 'users.json');
const GROUPS_FILE = IS_VERCEL ? path.join('/tmp', 'groups.json') : path.join(__dirname, 'groups.json');

function getMessages() {
    if (!fs.existsSync(MESSAGES_FILE)) { fs.writeFileSync(MESSAGES_FILE, JSON.stringify([])); return []; }
    try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')); } catch(e) { return []; }
}
function saveMessages(msgs) { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(msgs, null, 2)); }

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

const uploadDir = IS_VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (IS_VERCEL) {
    app.use('/uploads', express.static('/tmp/uploads'));
}

function getUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        const defaultAdmin = [{ username: 'KernelX', password: 'Slrambo1234@' }];
        fs.writeFileSync(USERS_FILE, JSON.stringify(defaultAdmin, null, 2));
        return defaultAdmin;
    }
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch(e) { return []; }
}
function saveUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }

function getGroups() {
    if (!fs.existsSync(GROUPS_FILE)) {
        const defaultGroups = [{ id: 'group_main', name: 'Zhexz Team', desc: 'Global Chat', dp: 'https://ui-avatars.com/api/?name=Zhexz+Team&background=6366f1&color=fff' }];
        fs.writeFileSync(GROUPS_FILE, JSON.stringify(defaultGroups, null, 2));
        return defaultGroups;
    }
    try { return JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8')); } catch(e) { return []; }
}
function saveGroups(groups) { fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2)); }

// APIs
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
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
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/messages', (req, res) => { res.json({ success: true, messages: getMessages() }); });

app.get('/api/users-list', (req, res) => {
    const users = getUsers().map(u => ({ username: u.username, avatar: u.avatar || `https://ui-avatars.com/api/?name=${u.username}&background=random` }));
    res.json({ success: true, users });
});

app.get('/api/groups', (req, res) => { res.json({ success: true, groups: getGroups() }); });

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

app.post('/upload', upload.single('media'), (req, res) => {
    if (req.file) {
        res.json({ success: true, fileUrl: `/uploads/${req.file.filename}`, type: req.file.mimetype });
    } else { res.status(400).json({ success: false, message: 'No file uploaded' }); }
});

// HTML SPA Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Local run කිරීමට පමණක් listen භාවිතා කරයි, Vercel එකට මේක බලපාන්නේ නැත
if (!IS_VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
