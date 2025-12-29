const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const Url = require('../models/Url');

// Create short URL - NO CAPTCHA HERE
router.post('/shorten', async function(req, res) {
    try {
        const originalUrl = req.body.originalUrl;

        // Validate URL
        try {
            new URL(originalUrl);
        } catch (err) {
            return res.status(400).json({ error: 'Invalid URL' });
        }

        // Generate short ID
        const shortId = nanoid(6);

        // Save to database
        const url = new Url({
            originalUrl:  originalUrl,
            shortId: shortId
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
        
        // Skip if it's step2 or step3 route
        if (shortId === 'step2' || shortId === 'step3') {
            return res.status(404).render('404');
        }
        
        const url = await Url.findOne({ shortId: shortId });

        if (!url) {
            return res.status(404).render('404');
        }

        // Increment clicks
        url.clicks = url.clicks + 1;
        await url.save();

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

module.exports = router;