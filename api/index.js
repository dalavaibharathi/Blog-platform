const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer'); // For processing file uploads
const fs = require('fs');

const app = express();

// --- FOOLPROOF ABSOLUTE PATH CONFIGURATION ---
const rootDir = path.join(__dirname, '..');

// --- SERVERLESS-SAFE MEDIA STORAGE CONFIGURATION ---
let upload;
if (process.env.NODE_ENV !== 'production') {
    // Local Development: Keep saving files directly to disk layout
    const uploadDir = path.join(rootDir, 'public/uploads');
    if (!fs.existsSync(uploadDir)){
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
    });
    upload = multer({ storage: storage });
} else {
    // Vercel Production Environment: Hold file safely in transient RAM stream to avoid disk errors
    const storage = multer.memoryStorage();
    upload = multer({ storage: storage });
}

// --- INSTANT MEMORY ARRAYS (Zero-Installation Database Architecture) ---
const users = [];
const posts = [];
const comments = [];

// Middleware Declarations
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(rootDir, 'public'))); // Exposes uploaded images/videos to browser
app.set('views', path.join(rootDir, 'views'));
app.set('view engine', 'ejs');

// Track user access sessions securely 
app.use(session({
    secret: 'supersecretkey', 
    resave: true,
    saveUninitialized: true,
    cookie: { maxAge: 600000 } // Active for 10 minutes
}));

// Route Security Guard
const redirectLogin = (req, res, next) => {
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        next();
    }
};

// Root Redirect Rule
app.get('/', (req, res) => {
    res.redirect('/login');
});

// --- AUTHENTICATION ROUTING BLOCKS ---
app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({ _id: Date.now().toString(), username, password: hashedPassword });
        res.redirect('/login');
    } catch {
        res.redirect('/register');
    }
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user._id;
        req.session.username = user.username;
        return res.redirect('/dashboard');
    }
    res.redirect('/login');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// --- MAIN BLOG AND COMMENTS ENGINE ---

// 1. Dashboard View
app.get('/dashboard', redirectLogin, (req, res) => {
    const sortedPosts = [...posts].sort((a, b) => b.createdAt - a.createdAt);
    res.render('dashboard', { username: req.session.username, userId: req.session.userId, posts: sortedPosts });
});

// 2. Action: Create Blog Post (with Optional Media Attachment processing)
app.post('/posts', redirectLogin, upload.single('media'), (req, res) => {
    const { title, content } = req.body;
    let mediaUrl = null;
    let mediaType = null;

    if (req.file) {
        if (process.env.NODE_ENV !== 'production') {
            // Local file reference pathway
            mediaUrl = '/public/uploads/' + req.file.filename;
        } else {
            // Serverless base64 data injection reference string
            const base64Data = req.file.buffer.toString('base64');
            mediaUrl = `data:${req.file.mimetype};base64,${base64Data}`;
        }
        mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    }
    
    const newPost = {
        _id: Date.now().toString(),
        title,
        content,
        mediaUrl,
        mediaType,
        author: { _id: req.session.userId, username: req.session.username },
        createdAt: new Date()
    };
    posts.push(newPost);
    res.redirect('/dashboard');
});

// 3. Post View Details with Inner Comments Section
app.get('/posts/:id', (req, res) => {
    const post = posts.find(p => p._id === req.params.id);
    if (!post) return res.status(404).send('Post not found');
    
    const postComments = comments.filter(c => c.post === post._id);
    res.render('view', { post, comments: postComments, userId: req.session.userId || null });
});

// 4. Action: Delete Blog Post
app.post('/posts/:id/delete', redirectLogin, (req, res) => {
    const postIndex = posts.findIndex(p => p._id === req.params.id);
    if (postIndex !== -1 && posts[postIndex].author._id === req.session.userId) {
        posts.splice(postIndex, 1);
        for (let i = comments.length - 1; i >= 0; i--) {
            if (comments[i].post === req.params.id) comments.splice(i, 1);
        }
    }
    res.redirect('/dashboard');
});

// 5. Action: Submit New Comment
app.post('/posts/:id/comments', redirectLogin, (req, res) => {
    comments.push({
        _id: Date.now().toString(),
        content: req.body.content,
        post: req.params.id,
        author: { username: req.session.username },
        createdAt: new Date()
    });
    res.redirect(`/posts/${req.params.id}`);
});

// --- ENVIRONMENT EXECUTION CONDITIONS ---
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => {
        console.log('⚡ Instant Engine Connected Successfully!');
        console.log('Server running safely at http://localhost:3000');
    });
}

module.exports = app; // 🌟 MANDATORY ENTRY EXPORT FOR VERCEL