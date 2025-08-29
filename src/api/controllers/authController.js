// src/api/controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');
const msg91Service = require('../services/msg91Services');

// --- Helper to generate verification JWTs ---
const generateVerificationToken = (payload) => {
    return jwt.sign(payload, process.env.VERIFICATION_TOKEN_SECRET, {
        expiresIn: process.env.VERIFICATION_TOKEN_EXPIRY
    });
};


const startPhoneVerification = asyncHandler(async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) throw new ApiError(400, "Phone number is required.");
    
    // 1. Generate OTP
    const otp = msg91Service.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry

    // 2. Store the hashed OTP in our database
    await supabase.from('verifications').insert({
        identifier: phoneNumber,
        token_hash: hashedOtp,
        expires_at: expiresAt.toISOString(),
        type: 'SMS'
    });

    // 3. Send the plain OTP via MSG91's /flow endpoint
    await msg91Service.sendSmsWithOtp(phoneNumber, otp);
    
    res.status(200).json(new ApiResponse(200, null, "OTP sent successfully."));
});

// Step 2: Verify Phone OTP from our Database
const verifyPhone = asyncHandler(async (req, res) => {
    const { phoneNumber, otp } = req.body;
    if (!phoneNumber || !otp) throw new ApiError(400, "Phone number and OTP are required.");

    // 1. Find the latest un-used OTP for this number
    const { data, error } = await supabase
        .from('verifications')
        .select('*')
        .eq('identifier', phoneNumber)
        .eq('type', 'SMS')
        .eq('is_used', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
    if (error || !data) throw new ApiError(400, "Invalid OTP. Please request a new one.");
    if (new Date(data.expires_at) < new Date()) throw new ApiError(400, "OTP has expired.");

    // 2. Compare the provided OTP with the stored hash
    const isMatch = await bcrypt.compare(otp, data.token_hash);
    if (!isMatch) throw new ApiError(400, "Invalid OTP provided.");

    // 3. Mark OTP as used to prevent replay attacks
    await supabase.from('verifications').update({ is_used: true }).eq('id', data.id);
    
    // 4. Generate the temporary verification token (JWT)
    const token = generateVerificationToken({ phoneNumber, verified: true, type: 'phone' });

    res.status(200).json(new ApiResponse(200, { phoneToken: token }, "Phone number verified successfully."));
});

// Step 3: Send Email verification link
const startEmailVerification = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ApiError(400, "Email is required.");
    
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(token, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry

    await supabase.from('verifications').insert({
        identifier: email,
        token_hash: hashedToken,
        expires_at: expiresAt.toISOString(),
        type: 'EMAIL'
    });

    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    await msg91Service.sendEmailVerificationLink(email, "Valued User", verificationLink); // Assuming we don't have name yet

    res.status(200).json(new ApiResponse(200, null, "Verification email sent."));
});

// Step 4: Verify Email link click and get a temporary token
const verifyEmail = asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) throw new ApiError(400, "Verification token is required.");

    const hashedToken = await bcrypt.hash(token, 10);

    const { data, error } = await supabase
        .from('verifications')
        .select('*')
        .eq('token_hash', hashedToken)
        .eq('type', 'EMAIL')
        .single();

    if (error || !data) throw new ApiError(400, "Invalid verification token.");
    if (data.is_used) throw new ApiError(400, "This verification link has already been used.");
    if (new Date(data.expires_at) < new Date()) throw new ApiError(400, "Verification link has expired.");

    await supabase.from('verifications').update({ is_used: true }).eq('id', data.id);
    
    const verificationJwt = generateVerificationToken({ email: data.identifier, verified: true, type: 'email' });
    
    res.status(200).json(new ApiResponse(200, { emailToken: verificationJwt }, "Email verified successfully."));
});

// Step 5: Finalize Registration
const completeRegistration = asyncHandler(async (req, res) => {
    const { fullName, password, phoneToken, emailToken } = req.body;

    // 1. Decode and verify temporary JWTs
    let decodedEmail, decodedPhone;
    try {
        decodedEmail = jwt.verify(emailToken, process.env.VERIFICATION_TOKEN_SECRET);
        decodedPhone = jwt.verify(phoneToken, process.env.VERIFICATION_TOKEN_SECRET);
    } catch (err) {
        throw new ApiError(401, "Invalid or expired verification tokens.");
    }

    if (decodedEmail.type !== 'email' || decodedPhone.type !== 'phone') {
        throw new ApiError(401, "Mismatched verification tokens.");
    }
    
    const { email } = decodedEmail;
    const { phoneNumber } = decodedPhone;
    
    // 2. Create Supabase Auth User
    const { data: { user }, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true // Already verified
    });

    if (authError) throw new ApiError(409, "User with this email already exists.", authError);
    if (!user) throw new ApiError(500, "Failed to create user account.");
    
    // 3. Create Public Profile
    const { error: profileError } = await supabase
        .from('profiles').insert({ id: user.id, full_name: fullName, phone_number: phoneNumber });
        
    if (profileError) {
        // Critical: Rollback auth user if profile fails
        await supabase.auth.admin.deleteUser(user.id);
        throw new ApiError(500, "Failed to create user profile.", profileError);
    }

    res.status(201).json(new ApiResponse(201, { userId: user.id }, "Registration complete!"));
});



const login = asyncHandler(async (req, res) => {
    // This logic remains the same as before
    const { email, password } = req.body;
    if (!email || !password) throw new ApiError(400, "Email and password are required.");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new ApiError(401, "Invalid email or password.", error);

    const { data: profile } = await supabase.from('profiles').select('full_name, user_role').eq('id', data.user.id).single();
    
    const responseData = { user: { ...data.user, ...profile }, session: data.session };
    res.status(200).json(new ApiResponse(200, responseData, "Login successful."));
});

// Export all controllers
module.exports = {
    startPhoneVerification,
    verifyPhone,
    startEmailVerification,
    verifyEmail,
    completeRegistration,
    login,
};