    const axios = require('axios');
const ApiError = require('../../utils/ApiError');
const AUTH_KEY = process.env.MSG91_AUTH_KEY;
const PHONE_TPL_ID = process.env.MSG91_PHONE_VERIFICATION_TPL_ID;
const EMAIL_VERIFY_TPL_ID = process.env.MSG91_EMAIL_VERIFICATION_TPL_ID;
const PASSWORD_RESET_TPL_ID = process.env.MSG91_PASSWORD_RESET_TPL_ID;
const FROM_EMAIL = process.env.MSG91_FROM_EMAIL;
const FROM_NAME = process.env.MSG91_FROM_NAME;
const MSG91_EMAIL_UPDATE_TPL_ID = process.env.MSG91_EMAIL_UPDATE_TPL_ID;
const MSG91_PHONE_UPDATE_TPL_ID = process.env.MSG91_PHONE_UPDATE_TPL_ID;


const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendSmsWithOtp = async (phoneNumber, otp) => {
    const url = 'https://control.msg91.com/api/v5/flow';
    
    const payload = {
        template_id: PHONE_TPL_ID,
        recipients: [
            {
                mobiles: `91${phoneNumber}`,
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
        
        return true;
    } catch (error) {
        console.error('MSG91 sendSmsWithOtp Error:', error.response ? error.response.data : error.message);
        throw new ApiError(500, 'There was an issue sending the SMS verification code.');
    }
};
const sendSmsWithOtp_PhoneUpdate = async (phoneNumber, otp) => {
    const url = 'https://control.msg91.com/api/v5/flow';
    console.log(MSG91_PHONE_UPDATE_TPL_ID,phoneNumber,otp);
    const payload = {
        template_id: MSG91_PHONE_UPDATE_TPL_ID,
        recipients: [
            {
                mobiles: `91${phoneNumber}`,
                var: otp 
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
        return true;
    } catch (error) {
        console.error('MSG91 sendEmail Error:', error.response ? error.response.data : error.message);
        throw new ApiError(500, 'There was an issue sending the email.');
    }
};

const sendEmailVerificationLink = async (email, customerName, verificationLink) => {
    const variables = { CUSTOMER_NAME: customerName, VERIFICATION_LINK: verificationLink };
    return sendEmail(EMAIL_VERIFY_TPL_ID, email, variables);
};


// NEW: Function to send a password reset OTP, as per your request
const sendPasswordResetOtp = async (email, customerName, otp) => {
    const variables = { CUSTOMER_NAME: customerName, OTP: otp };
    return sendEmail(PASSWORD_RESET_TPL_ID, email, variables);
};
const sendEmailUpdateOtp = async (email, customerName, otp) => {
    const variables = { CUSTOMER_NAME: customerName, OTP: otp };
    return sendEmail(MSG91_EMAIL_UPDATE_TPL_ID, email, variables);
};
const sendPasswordResetLink = async (email, customerName, resetLink) => {
   
    const LINK_BASED_RESET_TPL_ID = process.env.MSG91_PASSWORD_RESET_LINK_TPL_ID;
    const variables = { CUSTOMER_NAME: customerName, RESET_LINK: resetLink };
    return sendEmail(LINK_BASED_RESET_TPL_ID, email, variables);
};
module.exports = {
    generateOtp,
    sendSmsWithOtp,
    sendSmsWithOtp_PhoneUpdate,
    verifySmsOtp,
    sendEmailVerificationLink,
    sendPasswordResetOtp,
    sendPasswordResetLink,
    sendEmailUpdateOtp
};