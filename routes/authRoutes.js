const express = require('express');
const router = express.Router();
const passport = require('passport');
const crypto = require('crypto');
const User = require('../models/user');
const { isAuthenticated, isNotAuthenticated } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

// Login page
router.get('/login', isNotAuthenticated, function(req, res) {
    res.render('auth/login', { 
        error: req.query.error,
        success: req.query.success
    });
});

// Register page
router.get('/register', isNotAuthenticated, function(req, res) {
    res.render('auth/register', { 
        error: null,
        referral: req.query.ref || null
    });
});

// Register POST
router.post('/register', isNotAuthenticated, async function(req, res) {
    try {
        const { name, email, password, confirmPassword, referralCode } = req.body;
        
        // Validation
        if (!name || !email || !password) {
            return res.render('auth/register', { 
                error: 'All fields are required',
                referral: referralCode
            });
        }
        
        if (password.length < 6) {
            return res.render('auth/register', { 
                error: 'Password must be at least 6 characters',
                referral: referralCode
            });
        }
        
        if (password !== confirmPassword) {
            return res.render('auth/register', { 
                error: 'Passwords do not match',
                referral: referralCode
            });
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.render('auth/register', { 
                error: 'Email already registered',
                referral: referralCode
            });
        }
        
        // Find referrer if referral code provided
        let referrer = null;
        if (referralCode) {
            referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
        }
        
        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        // Create user
        const user = new User({
            name: name.trim(),
            email: email.toLowerCase(),
            password: password,
            verificationToken: verificationToken,
            verificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
            referredBy: referrer ? referrer._id : null,
            status: 'pending'
        });
        
        await user.save();
        
        // Update referrer's count
        if (referrer) {
            referrer.referralCount += 1;
            await referrer.save();
        }
        
        // Send verification email
        await sendVerificationEmail(user, verificationToken);
        
        res.redirect('/auth/login?success=registered');
        
    } catch (error) {
        console.error('Registration error:', error);
        res.render('auth/register', { 
            error: 'Registration failed. Please try again.',
            referral: req.body.referralCode
        });
    }
});

// Login POST
router.post('/login', isNotAuthenticated, function(req, res, next) {
    passport.authenticate('local', function(err, user, info) {
        if (err) {
            return next(err);
        }
        
        if (!user) {
            return res.render('auth/login', { 
                error: info.message,
                success: null
            });
        }
        
        req.logIn(user, function(err) {
            if (err) {
                return next(err);
            }
            
            const returnTo = req.session.returnTo || '/dashboard';
            delete req.session.returnTo;
            return res.redirect(returnTo);
        });
    })(req, res, next);
});

// Google OAuth
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}));

// Google OAuth callback
router.get('/google/callback', passport.authenticate('google', {
    failureRedirect: '/auth/login?error=google_failed'
}), function(req, res) {
    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);
});

// Logout
router.get('/logout', function(req, res) {
    req.logout(function(err) {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// Verify email
router.get('/verify/:token', async function(req, res) {
    try {
        const user = await User.findOne({
            verificationToken: req.params.token,
            verificationExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.redirect('/auth/login?error=invalid_token');
        }
        
        user.isVerified = true;
        user.status = 'active';
        user.verificationToken = undefined;
        user.verificationExpires = undefined;
        await user.save();
        
        res.redirect('/auth/login?success=verified');
        
    } catch (error) {
        console.error('Verification error:', error);
        res.redirect('/auth/login?error=verification_failed');
    }
});

// Forgot password page
router.get('/forgot-password', isNotAuthenticated, function(req, res) {
    res.render('auth/forgot-password', { error: null, success: null });
});

// Forgot password POST
router.post('/forgot-password', isNotAuthenticated, async function(req, res) {
    try {
        const { email } = req.body;
        
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            // Don't reveal if email exists
            return res.render('auth/forgot-password', { 
                error: null,
                success: 'If an account exists, a reset link has been sent.'
            });
        }
        
        if (user.googleId && !user.password) {
            return res.render('auth/forgot-password', { 
                error: 'This account uses Google login. Please login with Google.',
                success: null
            });
        }
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
        await user.save();
        
        // Send reset email
        await sendPasswordResetEmail(user, resetToken);
        
        res.render('auth/forgot-password', { 
            error: null,
            success: 'If an account exists, a reset link has been sent.'
        });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.render('auth/forgot-password', { 
            error: 'Something went wrong. Please try again.',
            success: null
        });
    }
});

// Reset password page
router.get('/reset-password/:token', isNotAuthenticated, async function(req, res) {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.redirect('/auth/forgot-password?error=invalid_token');
        }
        
        res.render('auth/reset-password', { 
            token: req.params.token,
            error: null
        });
        
    } catch (error) {
        res.redirect('/auth/forgot-password?error=invalid_token');
    }
});

// Reset password POST
router.post('/reset-password/:token', isNotAuthenticated, async function(req, res) {
    try {
        const { password, confirmPassword } = req.body;
        
        if (password.length < 6) {
            return res.render('auth/reset-password', { 
                token: req.params.token,
                error: 'Password must be at least 6 characters'
            });
        }
        
        if (password !== confirmPassword) {
            return res.render('auth/reset-password', { 
                token: req.params.token,
                error: 'Passwords do not match'
            });
        }
        
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.redirect('/auth/forgot-password?error=invalid_token');
        }
        
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        
        res.redirect('/auth/login?success=password_reset');
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.render('auth/reset-password', { 
            token: req.params.token,
            error: 'Something went wrong. Please try again.'
        });
    }
});

// Resend verification email
router.post('/resend-verification', isAuthenticated, async function(req, res) {
    try {
        const user = req.user;
        
        if (user.isVerified) {
            return res.json({ error: 'Email already verified' });
        }
        
        const verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationToken = verificationToken;
        user.verificationExpires = Date.now() + 24 * 60 * 60 * 1000;
        await user.save();
        
        await sendVerificationEmail(user, verificationToken);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Resend verification error:', error);
        res.json({ error: 'Failed to send email' });
    }
});

module.exports = router;
