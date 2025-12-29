const nodemailer = require('nodemailer');

// Create transporter
let transporter = null;

function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }
    return transporter;
}

// Send verification email
async function sendVerificationEmail(user, token) {
    const verifyUrl = `${process.env.BASE_URL}/auth/verify/${token}`;
    
    const mailOptions = {
        from: `"FlashURL" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: 'Verify your FlashURL account',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #6c5ce7 0%, #00cec9 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">⚡ FlashURL</h1>
                </div>
                <div style="padding: 30px; background: #f5f6fa;">
                    <h2 style="color: #2d3436;">Welcome, ${user.name}!</h2>
                    <p style="color: #636e72; font-size: 16px;">
                        Thank you for signing up. Please verify your email address to activate your account.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verifyUrl}" style="background: #6c5ce7; color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold;">
                            Verify Email
                        </a>
                    </div>
                    <p style="color: #636e72; font-size: 14px;">
                        Or copy this link: <br>
                        <a href="${verifyUrl}" style="color: #6c5ce7;">${verifyUrl}</a>
                    </p>
                    <p style="color: #636e72; font-size: 14px;">
                        This link expires in 24 hours.
                    </p>
                </div>
                <div style="padding: 20px; text-align: center; color: #636e72; font-size: 12px;">
                    © ${new Date().getFullYear()} FlashURL. All rights reserved.
                </div>
            </div>
        `
    };
    
    try {
        await getTransporter().sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
}

// Send password reset email
async function sendPasswordResetEmail(user, token) {
    const resetUrl = `${process.env.BASE_URL}/auth/reset-password/${token}`;
    
    const mailOptions = {
        from: `"FlashURL" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: 'Reset your FlashURL password',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #6c5ce7 0%, #00cec9 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">⚡ FlashURL</h1>
                </div>
                <div style="padding: 30px; background: #f5f6fa;">
                    <h2 style="color: #2d3436;">Password Reset Request</h2>
                    <p style="color: #636e72; font-size: 16px;">
                        Hi ${user.name}, we received a request to reset your password.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background: #d63031; color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: bold;">
                            Reset Password
                        </a>
                    </div>
                    <p style="color: #636e72; font-size: 14px;">
                        Or copy this link: <br>
                        <a href="${resetUrl}" style="color: #6c5ce7;">${resetUrl}</a>
                    </p>
                    <p style="color: #636e72; font-size: 14px;">
                        This link expires in 1 hour. If you didn't request this, please ignore this email.
                    </p>
                </div>
                <div style="padding: 20px; text-align: center; color: #636e72; font-size: 12px;">
                    © ${new Date().getFullYear()} FlashURL. All rights reserved.
                </div>
            </div>
        `
    };
    
    try {
        await getTransporter().sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
}

// Send payment notification
async function sendPaymentNotification(user, payment, status) {
    const statusMessages = {
        processing: 'Your withdrawal request is being processed',
        completed: 'Your withdrawal has been completed',
        rejected: 'Your withdrawal request was rejected'
    };
    
    const mailOptions = {
        from: `"FlashURL" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: `FlashURL - ${statusMessages[status]}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #6c5ce7 0%, #00cec9 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0;">⚡ FlashURL</h1>
                </div>
                <div style="padding: 30px; background: #f5f6fa;">
                    <h2 style="color: #2d3436;">Payment Update</h2>
                    <p style="color: #636e72; font-size: 16px;">
                        Hi ${user.name}, ${statusMessages[status]}.
                    </p>
                    <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
                        <p><strong>Amount:</strong> $${payment.amount.toFixed(2)}</p>
                        <p><strong>Method:</strong> ${payment.paymentMethod.type.toUpperCase()}</p>
                        <p><strong>Status:</strong> ${status.toUpperCase()}</p>
                        ${payment.transactionId ? `<p><strong>Transaction ID:</strong> ${payment.transactionId}</p>` : ''}
                        ${payment.adminNote ? `<p><strong>Note:</strong> ${payment.adminNote}</p>` : ''}
                    </div>
                </div>
                <div style="padding: 20px; text-align: center; color: #636e72; font-size: 12px;">
                    © ${new Date().getFullYear()} FlashURL. All rights reserved.
                </div>
            </div>
        `
    };
    
    try {
        await getTransporter().sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
}

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendPaymentNotification
};
