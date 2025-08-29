// debug-msg91.js
require('dotenv').config();
const axios = require('axios');

async function testMsg91() {
    const AUTH_KEY = process.env.MSG91_AUTH_KEY;
    const PHONE_TPL_ID = process.env.MSG91_PHONE_VERIFICATION_TPL_ID;
    const TEST_PHONE_NUMBER = '8719022379'; 

    if (!AUTH_KEY || !PHONE_TPL_ID) {
        console.error('Missing Auth Key or Template ID in .env file!');
        return;
    }

    console.log(`Testing with Template ID: ${PHONE_TPL_ID}`);

    const baseUrl = 'https://control.msg91.com/api/v5/otp';
    const params = new URLSearchParams({
        template_id: PHONE_TPL_ID,
        mobile: `91${TEST_PHONE_NUMBER}`,
        authkey: AUTH_KEY,
        // --- ADD THIS CRUCIAL PARAMETER ---
        DLT_TE_ID: process.env.MSG91_DLT_TE_ID
    });
    const url = `${baseUrl}?${params.toString()}`;

    console.log(`Calling URL: ${url}`);

    try {
        const response = await axios.post(url, {});
        console.log('SUCCESS:', response.data);
    } catch (error) {
        console.error('ERROR:', error.response ? error.response.data : error.message);
    }
}

testMsg91();