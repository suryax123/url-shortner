const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const paymentMethodSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['upi', 'bank_transfer', 'paypal'],
        required: true
    },
    // UPI
    upiId: String,
    // Bank Transfer
    bankName: String,
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    // PayPal
    paypalEmail: String,
    // Common
    isDefault: {
        type: Boolean,
        default: false
    }
}, { _id: false });

const earningsSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    views: {
        type: Number,
        default: 0
    },
    earnings: {
        type: Number,
        default: 0
    },
    urlId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Url'
    }
}, { _id: false });

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: function() {
            return !this.googleId;
        }
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    googleId: {
        type: String,
        sparse: true
    },
    avatar: {
        type: String,
        default: null
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: String,
    verificationExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    
    // Earnings & Payments
    totalEarnings: {
        type: Number,
        default: 0
    },
    pendingEarnings: {
        type: Number,
        default: 0
    },
    paidEarnings: {
        type: Number,
        default: 0
    },
    dailyEarnings: [earningsSchema],
    paymentMethods: [paymentMethodSchema],
    
    // Referral System
    referralCode: {
        type: String,
        unique: true
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    referralEarnings: {
        type: Number,
        default: 0
    },
    referralCount: {
        type: Number,
        default: 0
    },
    
    // Settings
    cpmRate: {
        type: Number,
        default: 2.5 // Default CPM rate in dollars per 1000 views
    },
    referralCommission: {
        type: Number,
        default: 20 // 20% of referred user's earnings
    },
    
    // Account Status
    status: {
        type: String,
        enum: ['active', 'suspended', 'pending'],
        default: 'pending'
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) {
        return next();
    }
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Generate referral code before saving
userSchema.pre('save', function(next) {
    if (!this.referralCode) {
        this.referralCode = this._id.toString().slice(-6).toUpperCase() + 
                           Math.random().toString(36).substring(2, 5).toUpperCase();
    }
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

// Get available balance for withdrawal
userSchema.methods.getAvailableBalance = function() {
    return this.pendingEarnings;
};

// Check if can withdraw (minimum $5)
userSchema.methods.canWithdraw = function() {
    return this.pendingEarnings >= 5;
};

// Add indexes for better performance (only for non-unique fields)
userSchema.index({ status: 1 });
userSchema.index({ referredBy: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);
