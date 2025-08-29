const axios = require('axios');
const ApiError = require('../../utils/ApiError');
const AUTH_KEY = process.env.MSG91_AUTH_KEY;
const PHONE_TPL_ID = process.env.MSG91_PHONE_VERIFICATION_TPL_ID;
const EMAIL_VERIFY_TPL_ID = process.env.MSG91_EMAIL_VERIFICATION_TPL_ID;
const PASSWORD_RESET_TPL_ID = process.env.MSG91_PASSWORD_RESET_TPL_ID;
const FROM_EMAIL = process.env.MSG91_FROM_EMAIL;
const FROM_NAME = process.env.MSG91_FROM_NAME;


console.log('PHONE_TPL_ID:', PHONE_TPL_ID);

const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendSmsWithOtp = async (phoneNumber, otp) => {
    const url = 'https://control.msg91.com/api/v5/flow';
    
    // This payload structure matches the /flow API documentation
    const payload = {
        template_id: PHONE_TPL_ID,
        recipients: [
            {
                mobiles: `91${phoneNumber}`,
                // The variable name must match your template.
                // If your template has ##var##, use "var". If it has ##otp##, use "otp".
                // Based on your previous info, it's ##var##, so we use "var".
                // The API documentation shows VAR1, but it's usually based on the template variable name.
                // Let's stick to the template name for accuracy.
                var1: otp 
            }
        ]
    };
    
    const headers = {
        'authkey': AUTH_KEY,
        'Content-Type': 'application/json',
    };

    try {
        const response = await axios.post(url, payload, { headers });
        if (response.data.type !== 'success') {
            throw new Error(JSON.stringify(response.data));
        }
        
        console.log(`[MSG91 Service] SMS Flow request accepted for ${phoneNumber}`);
        // Log for development/testing ONLY. Remove in production.
        console.log(`[DEV-ONLY] OTP for ${phoneNumber} is: ${otp}`);
        return true;
    } catch (error) {
        console.error('MSG91 sendSmsWithOtp Error:', error.response ? error.response.data : error.message);
        throw new ApiError(500, 'There was an issue sending the SMS verification code.');
    }
};

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
        return false;
    }
};


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
    generateOtp,
    sendSmsWithOtp,
    verifySmsOtp,
    sendEmailVerificationLink,
    sendPasswordResetEmail,
};