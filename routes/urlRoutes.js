const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const axios = require('axios');
const Url = require('../models/url');
const User = require('../models/user');
const { parseUserAgent, getGeoLocation, getClientIP, calculateEarnings, getStartOfDay } = require('../utils/analytics');

// Helper function to verify reCAPTCHA
async function verifyCaptcha(token) {
    try {
        const response = await axios.post(
            'https://www.google.com/recaptcha/api/siteverify',
            null,
            {
                params: {
                    secret: process.env.RECAPTCHA_SECRET_KEY,
                    response: token
                }
            }
        );
        return response.data.success;
    } catch (error) {
        console.error('CAPTCHA verification error:', error);
        return false;
    }
}

// Create short URL - NO CAPTCHA HERE (for anonymous users)
router.post('/shorten', async function(req, res) {
    try {
        const originalUrl = req.body.originalUrl;

        // Validate URL
        try {
            new URL(originalUrl);
        } catch (err) {
            return res.status(400).json({ error: 'Invalid URL' });
        }

        // Generate short ID with collision handling
        let shortId;
        let attempts = 0;
        const maxAttempts = 5;
        
        while (attempts < maxAttempts) {
            shortId = nanoid(6);
            const existing = await Url.findOne({ shortId: shortId });
            if (!existing) break;
            attempts++;
        }
        
        if (attempts >= maxAttempts) {
            return res.status(500).json({ error: 'Failed to generate unique ID' });
        }

        // Save to database (anonymous link - no user)
        const url = new Url({
            originalUrl: originalUrl,
            shortId: shortId,
            user: req.user ? req.user._id : null
        });
        await url.save();

        // Return short URL
        const shortUrl = process.env.BASE_URL + '/' + shortId;
        res.json({ shortUrl: shortUrl, shortId: shortId });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GATE 1 - First page (8 seconds)
router.get('/:shortId', async function(req, res) {
    try {
        const shortId = req.params.shortId;
        
        // Skip reserved routes
        if (['step2', 'step3', 'verify', 'auth', 'dashboard', 'api'].includes(shortId)) {
            return res.status(404).render('404');
        }
        
        const url = await Url.findOne({ shortId: shortId, isActive: true });

        if (!url) {
            return res.status(404).render('404');
        }

        // Get visitor info
        const ip = getClientIP(req);
        const userAgent = req.headers['user-agent'];
        const referer = req.headers['referer'] || '';
        const { device, browser, os } = parseUserAgent(userAgent);
        const { country, city, region } = getGeoLocation(ip);
        
        // Calculate earnings if link has owner
        let earned = 0;
        if (url.user) {
            const owner = await User.findById(url.user);
            if (owner) {
                earned = calculateEarnings(country, owner.cpmRate);
            }
        }
        
        // Create click record
        const clickData = {
            timestamp: new Date(),
            country: country,
            city: city,
            region: region,
            ip: ip,
            userAgent: userAgent,
            referer: referer,
            device: device,
            browser: browser,
            os: os,
            earned: earned
        };
        
        // Update URL stats
        url.clicks += 1;
        url.totalEarnings += earned;
        
        // Update device stats
        url.deviceStats[device] = (url.deviceStats[device] || 0) + 1;
        
        // Update country stats
        const currentCountryCount = url.countryStats.get(country) || 0;
        url.countryStats.set(country, currentCountryCount + 1);
        
        // Update daily stats
        const today = getStartOfDay(new Date());
        let dailyStat = url.dailyStats.find(s => s.date.getTime() === today.getTime());
        
        if (dailyStat) {
            dailyStat.clicks += 1;
            dailyStat.earnings += earned;
            const countryCount = dailyStat.countries.get(country) || 0;
            dailyStat.countries.set(country, countryCount + 1);
        } else {
            url.dailyStats.push({
                date: today,
                clicks: 1,
                earnings: earned,
                countries: new Map([[country, 1]])
            });
        }
        
        // Keep only last 100 click details to save space
        if (url.clickDetails.length >= 100) {
            url.clickDetails.shift();
        }
        url.clickDetails.push(clickData);
        
        await url.save();
        
        // Update user earnings if link has owner
        if (url.user && earned > 0) {
            await User.findByIdAndUpdate(url.user, {
                $inc: { 
                    totalEarnings: earned,
                    pendingEarnings: earned
                }
            });
            
            // Also update referrer earnings if applicable
            const owner = await User.findById(url.user);
            if (owner && owner.referredBy) {
                const referrer = await User.findById(owner.referredBy);
                if (referrer) {
                    const referralEarning = earned * (referrer.referralCommission / 100);
                    await User.findByIdAndUpdate(referrer._id, {
                        $inc: {
                            referralEarnings: referralEarning,
                            pendingEarnings: referralEarning,
                            totalEarnings: referralEarning
                        }
                    });
                }
            }
        }

        res.render('gate1', { shortId: shortId });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('404');
    }
});

// GATE 2 - Second page (8 seconds)
router.get('/step2/:shortId', async function(req, res) {
    try {
        const shortId = req.params.shortId;
        const url = await Url.findOne({ shortId: shortId });

        if (!url) {
            return res.status(404).render('404');
        }

        res.render('gate2', { shortId: shortId });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('404');
    }
});

// GATE 3 - Final page (5 seconds + CAPTCHA)
router.get('/step3/:shortId', async function(req, res) {
    try {
        const shortId = req.params.shortId;
        const url = await Url.findOne({ shortId: shortId });

        if (!url) {
            return res.status(404).render('404');
        }

        res.render('gate3', {
            shortId: shortId,
            originalUrl: url.originalUrl,
            siteKey: process.env.RECAPTCHA_SITE_KEY
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('404');
    }
});

// Verify CAPTCHA and redirect - Server-side verification
router.post('/verify/:shortId', async function(req, res) {
    try {
        const shortId = req.params.shortId;
        const captchaToken = req.body.captchaToken;

        // Verify CAPTCHA on server
        const isValid = await verifyCaptcha(captchaToken);
        
        if (!isValid) {
            return res.status(400).json({ error: 'CAPTCHA verification failed' });
        }

        const url = await Url.findOne({ shortId: shortId });

        if (!url) {
            return res.status(404).json({ error: 'Link not found' });
        }

        res.json({ success: true, redirectUrl: url.originalUrl });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;