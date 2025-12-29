// Check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({ error: 'Please login to continue' });
    }
    
    req.session.returnTo = req.originalUrl;
    res.redirect('/auth/login');
}

// Check if user is NOT authenticated (for login/register pages)
function isNotAuthenticated(req, res, next) {
    if (!req.isAuthenticated()) {
        return next();
    }
    res.redirect('/dashboard');
}

// Check if user is admin
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    }
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    res.status(403).render('error', { 
        message: 'Access Denied',
        error: { status: 403 }
    });
}

// Check if user account is active
function isActive(req, res, next) {
    if (req.isAuthenticated() && req.user.status === 'active') {
        return next();
    }
    
    if (req.user && req.user.status === 'pending') {
        return res.redirect('/auth/verify-email');
    }
    
    if (req.user && req.user.status === 'suspended') {
        req.logout(function(err) {
            res.redirect('/auth/login?error=suspended');
        });
        return;
    }
    
    res.redirect('/auth/login');
}

// Optional authentication - sets user if logged in but doesn't require it
function optionalAuth(req, res, next) {
    res.locals.user = req.user || null;
    next();
}

module.exports = {
    isAuthenticated,
    isNotAuthenticated,
    isAdmin,
    isActive,
    optionalAuth
};
