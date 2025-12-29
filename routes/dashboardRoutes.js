const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const User = require('../models/user');
const Url = require('../models/url');
const Payment = require('../models/payment');
const { isAuthenticated, isActive } = require('../middleware/auth');

// Dashboard home
router.get('/', isAuthenticated, async function(req, res) {
    try {
        const user = req.user;
        
        // Get user's links count
        const totalLinks = await Url.countDocuments({ user: user._id });
        
        // Get total clicks
        const clicksResult = await Url.aggregate([
            { $match: { user: user._id } },
            { $group: { _id: null, totalClicks: { $sum: '$clicks' } } }
        ]);
        const totalClicks = clicksResult[0] ? clicksResult[0].totalClicks : 0;
        
        // Get recent links
        const recentLinks = await Url.find({ user: user._id })
            .sort({ createdAt: -1 })
            .limit(5);
        
        // Get last 7 days stats
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const dailyStats = await Url.aggregate([
            { $match: { user: user._id } },
            { $unwind: '$dailyStats' },
            { $match: { 'dailyStats.date': { $gte: sevenDaysAgo } } },
            { 
                $group: { 
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$dailyStats.date' } },
                    clicks: { $sum: '$dailyStats.clicks' },
                    earnings: { $sum: '$dailyStats.earnings' }
                } 
            },
            { $sort: { _id: 1 } }
        ]);
        
        res.render('dashboard/index', {
            user: user,
            totalLinks: totalLinks,
            totalClicks: totalClicks,
            recentLinks: recentLinks,
            dailyStats: dailyStats,
            baseUrl: process.env.BASE_URL
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', { message: 'Server error' });
    }
});

// My Links
router.get('/links', isAuthenticated, async function(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        
        const totalLinks = await Url.countDocuments({ user: req.user._id });
        const totalPages = Math.ceil(totalLinks / limit);
        
        const links = await Url.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        res.render('dashboard/links', {
            user: req.user,
            links: links,
            currentPage: page,
            totalPages: totalPages,
            baseUrl: process.env.BASE_URL
        });
        
    } catch (error) {
        console.error('Links error:', error);
        res.status(500).render('error', { message: 'Server error' });
    }
});

// Create new link
router.post('/links/create', isAuthenticated, async function(req, res) {
    try {
        const { originalUrl, title } = req.body;
        
        // Validate URL
        try {
            new URL(originalUrl);
        } catch (err) {
            return res.status(400).json({ error: 'Invalid URL' });
        }
        
        // Generate short ID
        let shortId;
        let attempts = 0;
        while (attempts < 5) {
            shortId = nanoid(6);
            const existing = await Url.findOne({ shortId: shortId });
            if (!existing) break;
            attempts++;
        }
        
        if (attempts >= 5) {
            return res.status(500).json({ error: 'Failed to generate unique ID' });
        }
        
        const url = new Url({
            originalUrl: originalUrl,
            shortId: shortId,
            title: title || '',
            user: req.user._id
        });
        
        await url.save();
        
        res.json({ 
            success: true, 
            shortUrl: process.env.BASE_URL + '/' + shortId,
            shortId: shortId
        });
        
    } catch (error) {
        console.error('Create link error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete link
router.delete('/links/:id', isAuthenticated, async function(req, res) {
    try {
        const url = await Url.findOne({ _id: req.params.id, user: req.user._id });
        
        if (!url) {
            return res.status(404).json({ error: 'Link not found' });
        }
        
        await Url.deleteOne({ _id: req.params.id });
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Delete link error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Link analytics
router.get('/links/:id/analytics', isAuthenticated, async function(req, res) {
    try {
        const url = await Url.findOne({ _id: req.params.id, user: req.user._id });
        
        if (!url) {
            return res.status(404).render('error', { message: 'Link not found' });
        }
        
        // Get last 30 days stats
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const dailyStats = url.dailyStats
            .filter(s => s.date >= thirtyDaysAgo)
            .sort((a, b) => a.date - b.date);
        
        // Get country stats
        const countryStats = Object.fromEntries(url.countryStats || new Map());
        
        res.render('dashboard/analytics', {
            user: req.user,
            url: url,
            dailyStats: dailyStats,
            countryStats: countryStats,
            baseUrl: process.env.BASE_URL
        });
        
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).render('error', { message: 'Server error' });
    }
});

// Earnings page
router.get('/earnings', isAuthenticated, async function(req, res) {
    try {
        const user = req.user;
        
        // Get monthly earnings for last 6 months
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const monthlyEarnings = await Url.aggregate([
            { $match: { user: user._id } },
            { $unwind: '$dailyStats' },
            { $match: { 'dailyStats.date': { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: { 
                        year: { $year: '$dailyStats.date' },
                        month: { $month: '$dailyStats.date' }
                    },
                    clicks: { $sum: '$dailyStats.clicks' },
                    earnings: { $sum: '$dailyStats.earnings' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);
        
        // Get recent payments
        const payments = await Payment.find({ user: user._id })
            .sort({ createdAt: -1 })
            .limit(10);
        
        res.render('dashboard/earnings', {
            user: user,
            monthlyEarnings: monthlyEarnings,
            payments: payments
        });
        
    } catch (error) {
        console.error('Earnings error:', error);
        res.status(500).render('error', { message: 'Server error' });
    }
});

// Withdraw page
router.get('/withdraw', isAuthenticated, async function(req, res) {
    try {
        res.render('dashboard/withdraw', {
            user: req.user,
            minPayout: 5
        });
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).render('error', { message: 'Server error' });
    }
});

// Submit withdrawal request
router.post('/withdraw', isAuthenticated, async function(req, res) {
    try {
        const user = req.user;
        const { amount, paymentType, upiId, bankName, accountNumber, ifscCode, accountHolderName, paypalEmail } = req.body;
        
        const withdrawAmount = parseFloat(amount);
        
        // Validate amount
        if (isNaN(withdrawAmount) || withdrawAmount < 5) {
            return res.status(400).json({ error: 'Minimum withdrawal is $5' });
        }
        
        if (withdrawAmount > user.pendingEarnings) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        // Check for pending withdrawal
        const pendingPayment = await Payment.findOne({ 
            user: user._id, 
            status: { $in: ['pending', 'processing'] }
        });
        
        if (pendingPayment) {
            return res.status(400).json({ error: 'You already have a pending withdrawal' });
        }
        
        // Create payment details
        let paymentDetails = {};
        if (paymentType === 'upi') {
            if (!upiId) return res.status(400).json({ error: 'UPI ID is required' });
            paymentDetails = { upiId };
        } else if (paymentType === 'bank_transfer') {
            if (!bankName || !accountNumber || !ifscCode || !accountHolderName) {
                return res.status(400).json({ error: 'All bank details are required' });
            }
            paymentDetails = { bankName, accountNumber, ifscCode, accountHolderName };
        } else if (paymentType === 'paypal') {
            if (!paypalEmail) return res.status(400).json({ error: 'PayPal email is required' });
            paymentDetails = { paypalEmail };
        } else {
            return res.status(400).json({ error: 'Invalid payment method' });
        }
        
        // Create payment request
        const payment = new Payment({
            user: user._id,
            amount: withdrawAmount,
            paymentMethod: {
                type: paymentType,
                details: paymentDetails
            }
        });
        
        await payment.save();
        
        // Deduct from pending earnings
        user.pendingEarnings -= withdrawAmount;
        await user.save();
        
        res.json({ success: true, message: 'Withdrawal request submitted' });
        
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Referral page
router.get('/referral', isAuthenticated, async function(req, res) {
    try {
        const user = req.user;
        
        // Get referred users
        const referredUsers = await User.find({ referredBy: user._id })
            .select('name email createdAt')
            .sort({ createdAt: -1 })
            .limit(20);
        
        res.render('dashboard/referral', {
            user: user,
            referredUsers: referredUsers,
            referralLink: process.env.BASE_URL + '/auth/register?ref=' + user.referralCode
        });
        
    } catch (error) {
        console.error('Referral error:', error);
        res.status(500).render('error', { message: 'Server error' });
    }
});

// Settings page
router.get('/settings', isAuthenticated, async function(req, res) {
    try {
        res.render('dashboard/settings', {
            user: req.user,
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Settings error:', error);
        res.status(500).render('error', { message: 'Server error' });
    }
});

// Update profile
router.post('/settings/profile', isAuthenticated, async function(req, res) {
    try {
        const { name } = req.body;
        
        if (!name || name.trim().length < 2) {
            return res.redirect('/dashboard/settings?error=invalid_name');
        }
        
        req.user.name = name.trim();
        await req.user.save();
        
        res.redirect('/dashboard/settings?success=profile_updated');
        
    } catch (error) {
        console.error('Update profile error:', error);
        res.redirect('/dashboard/settings?error=update_failed');
    }
});

// Change password
router.post('/settings/password', isAuthenticated, async function(req, res) {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        if (req.user.googleId && !req.user.password) {
            return res.redirect('/dashboard/settings?error=google_account');
        }
        
        const isMatch = await req.user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.redirect('/dashboard/settings?error=wrong_password');
        }
        
        if (newPassword.length < 6) {
            return res.redirect('/dashboard/settings?error=password_short');
        }
        
        if (newPassword !== confirmPassword) {
            return res.redirect('/dashboard/settings?error=password_mismatch');
        }
        
        req.user.password = newPassword;
        await req.user.save();
        
        res.redirect('/dashboard/settings?success=password_changed');
        
    } catch (error) {
        console.error('Change password error:', error);
        res.redirect('/dashboard/settings?error=update_failed');
    }
});

// API: Get chart data
router.get('/api/chart-data', isAuthenticated, async function(req, res) {
    try {
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const stats = await Url.aggregate([
            { $match: { user: req.user._id } },
            { $unwind: '$dailyStats' },
            { $match: { 'dailyStats.date': { $gte: startDate } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$dailyStats.date' } },
                    clicks: { $sum: '$dailyStats.clicks' },
                    earnings: { $sum: '$dailyStats.earnings' }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        res.json(stats);
        
    } catch (error) {
        console.error('Chart data error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Get country data
router.get('/api/country-data', isAuthenticated, async function(req, res) {
    try {
        const stats = await Url.aggregate([
            { $match: { user: req.user._id } },
            { $project: { countryStats: { $objectToArray: '$countryStats' } } },
            { $unwind: '$countryStats' },
            {
                $group: {
                    _id: '$countryStats.k',
                    count: { $sum: '$countryStats.v' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        
        res.json(stats);
        
    } catch (error) {
        console.error('Country data error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
