const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user');

// Serialize user for session
passport.serializeUser(function(user, done) {
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async function(id, done) {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Local Strategy (Email/Password)
passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async function(email, password, done) {
    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return done(null, false, { message: 'Invalid email or password' });
        }
        
        if (user.googleId && !user.password) {
            return done(null, false, { message: 'Please login with Google' });
        }
        
        const isMatch = await user.comparePassword(password);
        
        if (!isMatch) {
            return done(null, false, { message: 'Invalid email or password' });
        }
        
        if (user.status === 'suspended') {
            return done(null, false, { message: 'Your account has been suspended' });
        }
        
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        
        return done(null, user);
    } catch (error) {
        return done(error);
    }
}));

// Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/auth/google/callback'
    }, async function(accessToken, refreshToken, profile, done) {
        try {
            // Check if user exists with Google ID
            let user = await User.findOne({ googleId: profile.id });
            
            if (user) {
                user.lastLogin = new Date();
                await user.save();
                return done(null, user);
            }
            
            // Check if user exists with same email
            const email = profile.emails[0].value;
            user = await User.findOne({ email: email.toLowerCase() });
            
            if (user) {
                // Link Google account to existing user
                user.googleId = profile.id;
                user.isVerified = true;
                if (!user.avatar && profile.photos[0]) {
                    user.avatar = profile.photos[0].value;
                }
                user.lastLogin = new Date();
                await user.save();
                return done(null, user);
            }
            
            // Create new user
            user = new User({
                email: email.toLowerCase(),
                name: profile.displayName,
                googleId: profile.id,
                avatar: profile.photos[0] ? profile.photos[0].value : null,
                isVerified: true,
                status: 'active'
            });
            
            await user.save();
            return done(null, user);
            
        } catch (error) {
            return done(error);
        }
    }));
}

module.exports = passport;
