// src/services/msg91.service.js
const axios = require('axios');
const ApiError = require('../../utils/ApiError');
// --- Configuration ---
const AUTH_KEY = process.env.MSG91_AUTH_KEY;
const PHONE_TPL_ID = process.env.MSG91_PHONE_VERIFICATION_TPL_ID;
const EMAIL_VERIFY_TPL_ID = process.env.MSG91_EMAIL_VERIFICATION_TPL_ID;
const PASSWORD_RESET_TPL_ID = process.env.MSG91_PASSWORD_RESET_TPL_ID;
const FROM_EMAIL = process.env.MSG91_FROM_EMAIL;
const FROM_NAME = process.env.MSG91_FROM_NAME;

/**
 * Sends an OTP to a given phone number using MSG91.
 * MSG91 generates the OTP and fills the ##var## placeholder.
 */
const sendSmsOtp = async (phoneNumber) => {
    const url = `https://control.msg91.com/api/v5/otp`;
    const payload = {
        template_id: PHONE_TPL_ID,
        mobile: `91${phoneNumber}`, // Assumes IN country code
        authkey: AUTH_KEY,
    };

    try {
        const response = await axios.post(url, payload);
        if (response.data.type !== 'success') {
            throw new Error(response.data.message || 'Failed to send OTP');
        }
        console.log(`[MSG91 Service] OTP sent successfully to ${phoneNumber} DATA : ${JSON.stringify(response.data)}`);
        return true;
    } catch (error) {
        console.error('MSG91 sendSmsOtp Error:', error.response ? error.response.data : error.message);
        throw new ApiError(500, 'There was an issue sending the SMS verification code.');
    }
};

/**
 * Verifies an OTP with MSG91.
 */
const verifySmsOtp = async (phoneNumber, otp) => {
    const url = `https://control.msg91.com/api/v5/otp/verify?otp=${otp}&mobile=91${phoneNumber}`;
    const headers = { 'authkey': AUTH_KEY };

    try {
        const response = await axios.get(url, { headers });
        if (response.data.type !== 'success') {
            throw new Error(response.data.message || 'OTP verification failed');
        }
        console.log(`[MSG91 Service] OTP for ${phoneNumber} verified successfully.`);
        return true;
    } catch (error) {
        console.error('MSG91 verifySmsOtp Error:', error.response ? error.response.data : error.message);
        // Do not throw a generic 500 here, let the controller handle it as a 400
        return false;
    }
};

/**
 * Generic function to send an email using MSG91 Transactional API.
 */
const sendEmail = async (templateId, recipientEmail, variables) => {
    const url = 'https://api.msg91.com/api/v5/email/send';
    const payload = {
        template_id: templateId,
        recipients: [{ to: [{ email: recipientEmail }], variables }],
        from: { name: FROM_NAME, email: FROM_EMAIL },
    };
    const headers = { 'authkey': AUTH_KEY, 'Content-Type': 'application/json' };

    try {
        await axios.post(url, payload, { headers });
        console.log(`[MSG91 Service] Email sent via template ${templateId} to ${recipientEmail}`);
        return true;
    } catch (error) {
        console.error('MSG91 sendEmail Error:', error.response ? error.response.data : error.message);
        throw new ApiError(500, 'There was an issue sending the email.');
    }
};

const sendEmailVerificationLink = async (email, customerName, verificationLink) => {
    const variables = { CUSTOMER_NAME: customerName, VERIFICATION_LINK: verificationLink };
    console.log(`[DEV-ONLY] Verification Link for ${email}: ${verificationLink}`);
    return sendEmail(EMAIL_VERIFY_TPL_ID, email, variables);
};

const sendPasswordResetEmail = async (email, customerName, otp) => {
    const variables = { CUSTOMER_NAME: customerName, OTP: otp };
    console.log(`[DEV-ONLY] Password Reset OTP for ${email}: ${otp}`);
    return sendEmail(PASSWORD_RESET_TPL_ID, email, variables);
};

module.exports = {
    sendSmsOtp,
    verifySmsOtp,
    sendEmailVerificationLink,
    sendPasswordResetEmail,
};