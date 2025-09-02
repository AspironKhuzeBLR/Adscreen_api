
// src/api/controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');
const msg91Service = require('../services/msg91Services');
// --- Helper to generate temporary verification JWTs ---
const generateVerificationToken = (payload) => {
    return jwt.sign(payload, process.env.VERIFICATION_TOKEN_SECRET, {
        expiresIn: process.env.VERIFICATION_TOKEN_EXPIRY || '15m'
    });
};


const startPhoneVerification = asyncHandler(async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) throw new ApiError(400, "Phone number is required.");
    
    const otp = msg91Service.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry

    await supabase.from('verifications').insert({
        identifier: phoneNumber,
        validator_hash: hashedOtp, 
        expires_at: expiresAt.toISOString(),
        type: 'SMS'
    });

    await msg91Service.sendSmsWithOtp(phoneNumber, otp);
    
    res.status(200).json(new ApiResponse(200, null, "OTP sent successfully."));
});

const verifyPhone = asyncHandler(async (req, res) => {
    const { phoneNumber, otp } = req.body;
    if (!phoneNumber || !otp) throw new ApiError(400, "Phone number and OTP are required.");

    const { data: verificationRecord, error } = await supabase
        .from('verifications')
        .select('*')
        .eq('identifier', phoneNumber)
        .eq('type', 'SMS')
        .eq('is_used', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
    if (error || !verificationRecord) throw new ApiError(400, "Invalid OTP. Please request a new one.");
    if (new Date(verificationRecord.expires_at) < new Date()) throw new ApiError(400, "OTP has expired.");

    const isMatch = await bcrypt.compare(otp, verificationRecord.validator_hash);
    if (!isMatch) throw new ApiError(400, "Invalid OTP provided.");

    await supabase.from('verifications').update({ is_used: true }).eq('id', verificationRecord.id);
    
    const token = generateVerificationToken({ phoneNumber, verified: true, type: 'phone' });
    res.status(200).json(new ApiResponse(200, { phoneToken: token }, "Phone number verified successfully."));
});



const startEmailVerification = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ApiError(400, "Email is required.");

    const selector = crypto.randomBytes(16).toString('hex');
    const validator = crypto.randomBytes(32).toString('hex');

    const hashedValidator = await bcrypt.hash(validator, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    await supabase.from('verifications').insert({
        identifier: email.toLowerCase(),
        selector: selector,
        validator_hash: hashedValidator,
        expires_at: expiresAt.toISOString(),
        type: 'EMAIL'
    });

    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?selector=${selector}&validator=${validator}`;
    await msg91Service.sendEmailVerificationLink(email, "Valued User", verificationLink);

    res.status(200).json(new ApiResponse(200, null, "Verification email sent successfully."));
});

const verifyEmail = asyncHandler(async (req, res) => {
    const { selector, validator } = req.body;
    if (!selector || !validator) {
        throw new ApiError(400, "Selector and validator are required from the verification link.");
    }

    const { data: verificationRecord, error } = await supabase
        .from('verifications')
        .select('*')
        .eq('selector', selector)
        .eq('type', 'EMAIL')
        .single();

    if (error || !verificationRecord) throw new ApiError(400, "Invalid verification link. Please request a new one.");
    if (verificationRecord.is_used) throw new ApiError(400, "This verification link has already been used.");
    if (new Date(verificationRecord.expires_at) < new Date()) throw new ApiError(400, "This verification link has expired.");

    const isTokenValid = await bcrypt.compare(validator, verificationRecord.validator_hash);
    if (!isTokenValid) throw new ApiError(400, "Invalid verification link.");

    await supabase.from('verifications').update({ is_used: true }).eq('id', verificationRecord.id);
    
    const verificationJwt = generateVerificationToken({ 
        email: verificationRecord.identifier, 
        verified: true, 
        type: 'email' 
    });
    
    res.status(200).json(new ApiResponse(200, { emailToken: verificationJwt }, "Email verified successfully."));
});

const completeRegistration = asyncHandler(async (req, res) => {
    const { fullName, password, phoneToken, emailToken } = req.body;

    let decodedEmail, decodedPhone;
    try {
        decodedEmail = jwt.verify(emailToken, process.env.VERIFICATION_TOKEN_SECRET);
        decodedPhone = jwt.verify(phoneToken, process.env.VERIFICATION_TOKEN_SECRET);
    } catch (err) {
        throw new ApiError(401, "Invalid or expired verification tokens. Please start over.");
    }

    if (decodedEmail.type !== 'email' || decodedPhone.type !== 'phone') {
        throw new ApiError(401, "Mismatched verification tokens.");
    }
    
    const { email } = decodedEmail;
    const { phoneNumber } = decodedPhone;
    
    const { data: { user }, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });

    if (authError) throw new ApiError(409, "A user with this email already exists.", authError);
    if (!user) throw new ApiError(500, "Failed to create user account.");
    
    const { error: profileError } = await supabase
        .from('profiles').insert({ id: user.id, full_name: fullName, phone_number: phoneNumber });
        
    if (profileError) {
        await supabase.auth.admin.deleteUser(user.id);
        throw new ApiError(500, "Failed to create user profile.", profileError);
    }

    res.status(201).json(new ApiResponse(201, { userId: user.id }, "Registration complete!"));
});

const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw new ApiError(400, "Email and password are required.");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new ApiError(401, "Invalid email or password.", error);

    const { data: profile } = await supabase.from('profiles').select('full_name, user_role').eq('id', data.user.id).single();
    
    const responseData = { user: { id: data.user.id, email: data.user.email, ...profile }, session: data.session };
    res.status(200).json(new ApiResponse(200, responseData, "Login successful."));
});


module.exports = {
    startPhoneVerification,
    verifyPhone,
    startEmailVerification,
    verifyEmail,
    completeRegistration,
    login,
};