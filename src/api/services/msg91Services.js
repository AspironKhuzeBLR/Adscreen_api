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

const sendEmail = async (templateId, recipientEmail, variables, attachment = null) => {
    const url = 'https://api.msg91.com/api/v5/email/send';
    const payload = {
        template_id: templateId,
        recipients: [{ to: [{ email: recipientEmail }], variables }],
        from: { name: FROM_NAME, email: FROM_EMAIL },
        domain: "send.adscreenhub.com"
        

    };


   if (Array.isArray(attachment) && attachment.length > 0 && attachment[0].content && attachment[0].filename) {
        
        const attachmentObject = attachment[0];

        payload.attachments = [{
            file: `data:application/pdf;base64,${attachmentObject.content}`,
            fileName: attachmentObject.filename
        }];
    }

    const headers = { 'authkey': AUTH_KEY, 'Content-Type': 'application/json' };

    try {
        const response = await axios.post(url, payload, { headers });
        console.log('MSG91 sendEmail Response:', response.data);
        console.log('Payload Sent:', payload);
        return { success: true };
    } catch (error) {
        console.error('MSG91 sendEmail Error:', error.response ? error.response.data : error.message);
        throw new ApiError(500, 'There was an issue sending the email.');
    }
};

const sendEmailVerificationLink = async (email, customerName, verificationLink) => {
    const variables = { CUSTOMER_NAME: customerName, VERIFICATION_LINK: verificationLink };
    return sendEmail(EMAIL_VERIFY_TPL_ID, email, variables);
};


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
const sendOrderConfirmationEmail = async (orderDetails, recipientEmail, customerName, attachment) => {
    const ORDER_CONFIRM_TPL_ID = process.env.MSG91_ORDER_CONFIRMATION_TPL_ID;
    const orderLink = `${process.env.FRONTEND_URL}/my-orders`; 

    const variables = {
        CUSTOMER_NAME: customerName,
        ORDER_ID: orderDetails.order_uid || orderDetails.id, 
        start_date: new Date(orderDetails.start_date).toLocaleDateString('en-GB'), 
        location_name: orderDetails.location_name,
        plan_name: orderDetails.plan_name,
        gross_amount: orderDetails.final_amount || orderDetails.total_cost, 
        ORDER_LINK: orderLink,
    };

    
    return sendEmail(ORDER_CONFIRM_TPL_ID, recipientEmail, variables, attachment);
};

const sendAdminNotificationEmail = async (orderId) => {
    if(!orderId){
        console.error('Order ID is required to send admin notification email.');
        return;
    }   

    const ADMIN_EMAIL = process.env.ADMIN_CONTACT_EMAIL;
    const MSG91_ORDER_CREATION_NOTIFICATION_TPL_ID = process.env.MSG91_ORDER_CREATION_NOTIFICATION_TPL_ID; 
    const variables = {
        ORDER_ID: orderId,
    };

    try {
        await sendEmail(MSG91_ORDER_CREATION_NOTIFICATION_TPL_ID, ADMIN_EMAIL, variables);
        console.log(`Admin notification email sent for order ${orderId}`);
    } catch (emailError) {
        console.error(`Failed to send admin notification email for order ${orderId}:`, emailError);
    }
};

const sendContactUserConfirmationEmail = async (recipientEmail, formData) => {
    const CONTACT_USER_CONFIRM_TPL_ID = process.env.MSG91_CONTACT_USER_CONFIRM_TPL_ID;

    const variables = {
        user_name: formData.fullName,
        user_email: formData.email,
        user_phone: formData.phoneNumber,
        user_message: formData.message,
    };

    return sendEmail(CONTACT_USER_CONFIRM_TPL_ID, recipientEmail, variables);
};


const sendContactAdminNotificationEmail = async (formData) => {
    const CONTACT_ADMIN_NOTIFY_TPL_ID = process.env.MSG91_CONTACT_ADMIN_NOTIFY_TPL_ID;
    const ADMIN_EMAIL = process.env.ADMIN_CONTACT_EMAIL; 

    if (!ADMIN_EMAIL) {
        console.error('ADMIN_CONTACT_EMAIL is not set in environment variables. Admin notification email cannot be sent.');
        return false;
    }

    const variables = {
        user_name: formData.fullName,
        user_email: formData.email,
        user_phone: formData.phoneNumber,
        user_message: formData.message,
    };

    return sendEmail(CONTACT_ADMIN_NOTIFY_TPL_ID, ADMIN_EMAIL, variables);
};

const sendOrderStatusUpdateEmail = async (orderDetails) => {
    const ORDER_STATUS_UPDATE_TPL_ID = process.env.MSG91_ORDER_STATUS_UPDATE_TPL_ID;

    const recipientEmail = orderDetails.profiles.email;
    const customerName = orderDetails.profiles.full_name;

    const orderLink = `${process.env.FRONTEND_URL}/my-orders`;

    const variables = {
        CUSTOMER_NAME: customerName,
        ORDER_ID: orderDetails.order_uid,
        start_date: new Date(orderDetails.start_date).toLocaleDateString('en-GB'), 
        location_name: orderDetails.locations.name,
        plan_name: orderDetails.plans.name,
        ORDER_LINK: orderLink,
        NEW_STATUS: orderDetails.status 
    };

    return sendEmail(ORDER_STATUS_UPDATE_TPL_ID, recipientEmail, variables);
};
module.exports = {
    generateOtp,
    sendSmsWithOtp,
    sendSmsWithOtp_PhoneUpdate,
    verifySmsOtp,
    sendEmailVerificationLink,
    sendPasswordResetOtp,
    sendPasswordResetLink,
    sendEmailUpdateOtp,
    sendOrderConfirmationEmail,
    sendContactUserConfirmationEmail,
    sendContactAdminNotificationEmail,
    sendOrderStatusUpdateEmail,
    sendAdminNotificationEmail,
};
