const geoip = require('geoip-lite');

// Parse user agent to get device, browser, OS
function parseUserAgent(userAgent) {
    if (!userAgent) {
        return { device: 'unknown', browser: 'unknown', os: 'unknown' };
    }
    
    const ua = userAgent.toLowerCase();
    
    // Detect device
    let device = 'desktop';
    if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) {
        device = 'mobile';
    } else if (/ipad|tablet/i.test(ua)) {
        device = 'tablet';
    }
    
    // Detect browser
    let browser = 'unknown';
    if (ua.includes('firefox')) {
        browser = 'Firefox';
    } else if (ua.includes('edg')) {
        browser = 'Edge';
    } else if (ua.includes('chrome')) {
        browser = 'Chrome';
    } else if (ua.includes('safari')) {
        browser = 'Safari';
    } else if (ua.includes('opera') || ua.includes('opr')) {
        browser = 'Opera';
    }
    
    // Detect OS
    let os = 'unknown';
    if (ua.includes('windows')) {
        os = 'Windows';
    } else if (ua.includes('mac')) {
        os = 'macOS';
    } else if (ua.includes('linux')) {
        os = 'Linux';
    } else if (ua.includes('android')) {
        os = 'Android';
    } else if (ua.includes('iphone') || ua.includes('ipad')) {
        os = 'iOS';
    }
    
    return { device, browser, os };
}

// Get geo location from IP
function getGeoLocation(ip) {
    // Handle localhost and private IPs
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return { country: 'Unknown', city: 'Unknown', region: 'Unknown' };
    }
    
    // Remove IPv6 prefix if present
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }
    
    const geo = geoip.lookup(ip);
    
    if (!geo) {
        return { country: 'Unknown', city: 'Unknown', region: 'Unknown' };
    }
    
    return {
        country: geo.country || 'Unknown',
        city: geo.city || 'Unknown',
        region: geo.region || 'Unknown'
    };
}

// Get client IP from request
function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.connection.remoteAddress || req.socket.remoteAddress || req.ip;
}

// Calculate earnings based on country and CPM rate
function calculateEarnings(country, cpmRate) {
    // Tier 1 countries get full CPM
    const tier1 = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'NL', 'SE', 'NO', 'DK', 'CH', 'AT', 'BE', 'IE', 'NZ'];
    // Tier 2 countries get 70% CPM
    const tier2 = ['IT', 'ES', 'PT', 'PL', 'CZ', 'GR', 'JP', 'KR', 'SG', 'HK', 'TW', 'IL', 'AE', 'SA'];
    // Tier 3 countries get 40% CPM
    const tier3 = ['BR', 'MX', 'AR', 'CL', 'CO', 'IN', 'PH', 'TH', 'MY', 'ID', 'VN', 'TR', 'RU', 'UA', 'ZA'];
    // Rest get 20% CPM
    
    let multiplier = 0.2; // Default for tier 4
    
    if (tier1.includes(country)) {
        multiplier = 1.0;
    } else if (tier2.includes(country)) {
        multiplier = 0.7;
    } else if (tier3.includes(country)) {
        multiplier = 0.4;
    }
    
    // CPM is per 1000 views, so divide by 1000
    return (cpmRate * multiplier) / 1000;
}

// Get date string for daily stats (YYYY-MM-DD)
function getDateString(date) {
    return date.toISOString().split('T')[0];
}

// Get start of day
function getStartOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Get start of month
function getStartOfMonth(date) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

module.exports = {
    parseUserAgent,
    getGeoLocation,
    getClientIP,
    calculateEarnings,
    getDateString,
    getStartOfDay,
    getStartOfMonth
};
