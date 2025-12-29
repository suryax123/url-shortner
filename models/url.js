const mongoose = require('mongoose');

const clickSchema = new mongoose.Schema({
    timestamp: {
        type: Date,
        default: Date.now
    },
    country: String,
    city: String,
    region: String,
    ip: String,
    userAgent: String,
    referer: String,
    device: {
        type: String,
        enum: ['desktop', 'mobile', 'tablet', 'unknown'],
        default: 'unknown'
    },
    browser: String,
    os: String,
    earned: {
        type: Number,
        default: 0
    }
}, { _id: false });

const dailyStatsSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    clicks: {
        type: Number,
        default: 0
    },
    earnings: {
        type: Number,
        default: 0
    },
    countries: {
        type: Map,
        of: Number,
        default: {}
    }
}, { _id: false });

const urlSchema = new mongoose.Schema({
    originalUrl: {
        type: String,
        required: true
    },
    shortId: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        default: ''
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    clicks: {
        type: Number,
        default: 0
    },
    totalEarnings: {
        type: Number,
        default: 0
    },
    clickDetails: [clickSchema],
    dailyStats: [dailyStatsSchema],
    
    // Geographic summary
    countryStats: {
        type: Map,
        of: Number,
        default: {}
    },
    
    // Device summary
    deviceStats: {
        desktop: { type: Number, default: 0 },
        mobile: { type: Number, default: 0 },
        tablet: { type: Number, default: 0 },
        unknown: { type: Number, default: 0 }
    },
    
    // Status
    isActive: {
        type: Boolean,
        default: true
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
urlSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Indexes for performance (shortId already has unique: true)
urlSchema.index({ user: 1 });
urlSchema.index({ createdAt: -1 });
urlSchema.index({ 'dailyStats.date': 1 });

module.exports = mongoose.model('Url', urlSchema);