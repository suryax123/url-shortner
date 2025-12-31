require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const path = require('path');

const passport = require('./config/passport');
const Url = require('./models/url');
const urlRoutes = require('./routes/urlRoutes');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { optionalAuth } = require('./middleware/auth');

const app = express();

// Trust proxy for Render/Heroku
app.set('trust proxy', 1);

 // Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "'unsafe-eval'",
                "https://www.google.com",
                "https://www.gstatic.com",
                "https://*.effectivegatecpm.com",
                "https://pl28355881.effectivegatecpm.com",
                "https://www.highperformanceformat.com",
                "https://*.highperformanceformat.com",
                "https://cdn.jsdelivr.net",
                "https://preferencenail.com",
                "https://creative-sb1.com"
            ],
            frameSrc: [
                "https://www.google.com",
                "https://*.google.com",
                "https://www.highperformanceformat.com",
                "https://*.effectivegatecpm.com",
                "https://pl28355881.effectivegatecpm.com",
                "https://kettledroopingcontinuation.com",
                "https://skinnycrawlinglax.com",
                "https://sourshaped.com"
            ],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: [
                "'self'",
                "https://*.google.com",
                "https://*.googleapis.com",
                "https://pl28355881.effectivegatecpm.com",
                "https://www.highperformanceformat.com",
                "https://preferencenail.com",
                "https://skinnycrawlinglax.com",
                "https://sourshaped.com",
                "https:"
            ],
        },
    },
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'flashurl-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 24 * 60 * 60 // 1 day
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Make user available to all templates
app.use(function(req, res, next) {
    res.locals.user = req.user || null;
    res.locals.baseUrl = process.env.BASE_URL;
    next();
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: 'Too many requests, please try again later.'
});
app.use(limiter);

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many login attempts, please try again later.'
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Homepage
app.get('/', optionalAuth, function(req, res) {
    res.render('index', { user: req.user });
});

 // Auth routes
app.use('/auth', authLimiter, authRoutes);

// Dashboard routes
app.use('/dashboard', dashboardRoutes);

 // Public pages (before URL catch-all)
app.get('/publisher-rates', optionalAuth, function(req, res) {
    res.render('publisher-rates', { user: req.user });
});

app.get('/about', optionalAuth, function(req, res) {
    res.render('about', { user: req.user });
});

// Sitemap (dynamically generated from DB)
app.get('/sitemap.xml', async function(req, res) {
    try {
        const base = process.env.BASE_URL || 'http://localhost:3000';
        const urls = await Url.find({ isActive: true }).select('shortId updatedAt').lean().limit(50000);
        const items = urls.map(u => {
            const loc = `${base}/${u.shortId}`;
            const lastmod = u.updatedAt ? new Date(u.updatedAt).toISOString() : new Date().toISOString();
            return `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`;
        }).join('');
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</urlset>`;
        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (err) {
        console.error('Sitemap error:', err);
        res.status(500).send('Error generating sitemap');
    }
});

// robots.txt
app.get('/robots.txt', function(req, res) {
    const base = process.env.BASE_URL || 'http://localhost:3000';
    const content = `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
    res.header('Content-Type', 'text/plain');
    res.send(content);
});

// URL routes (must be last due to /:shortId catch-all)
app.use('/', urlRoutes);

// 404 handler
app.use(function(req, res) {
    res.status(404).render('404');
});

// Error handler
app.use(function(err, req, res, next) {
    console.error('Error:', err);
    res.status(500).render('error', { 
        message: 'Something went wrong',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

 // Connect to MongoDB (non-blocking)
const startServer = () => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', function() {
        console.log('🚀 Server running on http://localhost:' + PORT);
    });
};

// Start the server immediately so Render sees the process as started
startServer();

// Attempt initial MongoDB connection with a short timeout, and retry in background if it fails
(async function connectWithTimeout() {
    if (!process.env.MONGODB_URI) {
        console.warn('⚠️ MONGODB_URI not set — skipping MongoDB initial connect');
        return;
    }
    try {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('✅ Connected to MongoDB');
    } catch (err) {
        console.warn('⚠️ Initial MongoDB connection failed (will retry):', err.message);
        const reconnect = () => {
            mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
                .then(() => console.log('✅ MongoDB reconnected'))
                .catch(e => {
                    console.warn('Mongo reconnect failed:', e.message);
                    setTimeout(reconnect, 10000);
                });
        };
        setTimeout(reconnect, 10000);
    }
})();
