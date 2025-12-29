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
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.google.com", "https://www.gstatic.com", "https://*.effectivegatecpm.com", "https://cdn.jsdelivr.net"],
            frameSrc: ["https://www.google.com", "https://*.google.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://*.google.com", "https://*.googleapis.com"],
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

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(function() {
        console.log('✅ Connected to MongoDB');
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, '0.0.0.0', function() {
            console.log('🚀 Server running on http://localhost:' + PORT);
        });
    })
    .catch(function(err) {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });