const bcrypt = require('bcryptjs');
const jwt =require('jsonwebtoken');
const crypto = require('crypto');
const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');
const msg91Service = require('../services/msg91Services');

const generateVerificationToken = (payload) => {
    return jwt.sign(payload, process.env.VERIFICATION_TOKEN_SECRET, {
        expiresIn: process.env.VERIFICATION_TOKEN_EXPIRY || '15m'
    });
};


const startPhoneVerification = asyncHandler(async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) throw new ApiError(400, "Phone number is required.");

    const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select('phone_number')
        .eq('phone_number', phoneNumber)
        .single();

    if (profileError && profileError.code !== 'PGRST116') {
        throw new ApiError(500, "Something went wrong while checking phone number.", profileError);
    }

    if (existingProfile) {
        throw new ApiError(409, "An account with this phone number already exists.");
    }

    const otp = msg91Service.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); 

    await supabase.from('verifications')
      .update({ is_used: true })
      .eq('identifier', phoneNumber)
      .eq('type', 'SMS');

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

// --- Existing Email Verification Endpoints ---

const startEmailVerification = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ApiError(400, "Email is required.");
    
    const lowercasedEmail = email.toLowerCase();

    const { data , error } =  await supabase
        .from('profiles')
        .select('email')
        .eq('email', lowercasedEmail)
        .single();

    if (error && error.code !== 'PGRST116') {
        throw new ApiError(500, "Something went wrong while checking for existing user.", error);
    }
    
    if (data) {
        throw new ApiError(409, "An account with this email address already exists.");
    }
    
    // Invalidate old email verification links
    await supabase.from('verifications')
      .update({ is_used: true })
      .eq('identifier', lowercasedEmail)
      .eq('type', 'EMAIL');

    const selector = crypto.randomBytes(16).toString('hex');
    const validator = crypto.randomBytes(32).toString('hex');
    const hashedValidator = await bcrypt.hash(validator, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1-hour expiry

    await supabase.from('verifications').insert({
        identifier: lowercasedEmail,
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
        .eq('is_used', false)
        .single();

    if (error || !verificationRecord) throw new ApiError(400, "Invalid verification link. Please request a new one.");
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


const resendOtp = asyncHandler(async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) throw new ApiError(400, "Phone number is required.");


    await startPhoneVerification(req, res); // Reuse the start phone verification logic
});

const resendEmailVerification = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ApiError(400, "Email is required.");
    
    await startEmailVerification(req, res); // Reuse the start email verification logic
});


const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ApiError(400, "Email is required.");

    const lowercasedEmail = email.toLowerCase();
    
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name') // fetch full_name for the email template
        .eq('email', lowercasedEmail)
        .single();

    if (error || !profile) {
        // SECURITY: We send a success response even if the user doesn't exist to prevent email enumeration attacks.
        return res.status(200).json(new ApiResponse(200, null, "If an account with this email exists, a password reset code has been sent."));
    }

    // Step 2: Invalidate old password reset OTPs for this user
    await supabase.from('verifications')
      .update({ is_used: true })
      .eq('identifier', lowercasedEmail)
      .eq('type', 'PASSWORD_RESET');

    // Step 3: Generate and hash the new OTP
    const otp = msg91Service.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10-minute expiry as per template

    await supabase.from('verifications').insert({
        identifier: lowercasedEmail,
        validator_hash: hashedOtp, // Storing hashed OTP here
        expires_at: expiresAt.toISOString(),
        type: 'PASSWORD_RESET'
        // 'selector' is no longer needed for OTP flow
    });

    await msg91Service.sendPasswordResetOtp(lowercasedEmail, profile.full_name || "Valued User", otp);

    res.status(200).json(new ApiResponse(200, null, "If an account with this email exists, a password reset code has been sent."));
});

const resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, password } = req.body;
    if (!email || !otp || !password) {
        throw new ApiError(400, "Email, OTP, and a new password are required.");
    }
    
    const lowercasedEmail = email.toLowerCase();
    
    const { data: verificationRecord, error } = await supabase
        .from('verifications')
        .select('*')
        .eq('identifier', lowercasedEmail)
        .eq('type', 'PASSWORD_RESET')
        .eq('is_used', false)
        .order('created_at', { ascending: false }) // Important: get the latest one
        .limit(1)
        .single();

    if (error || !verificationRecord) throw new ApiError(400, "Invalid OTP. Please request a new one.");
    if (new Date(verificationRecord.expires_at) < new Date()) throw new ApiError(400, "OTP has expired. Please request a new one.");

    const isTokenValid = await bcrypt.compare(otp, verificationRecord.validator_hash);
    if (!isTokenValid) throw new ApiError(400, "Invalid OTP provided.");

    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', verificationRecord.identifier)
      .single();

    if (userError || !user) {
      throw new ApiError(404, "User associated with this reset request not found.");
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: password }
    );

    if (updateError) {
        throw new ApiError(500, "Failed to update password.", updateError);
    }
    
    await supabase.from('verifications').update({ is_used: true }).eq('id', verificationRecord.id);

    res.status(200).json(new ApiResponse(200, null, "Password has been reset successfully."));
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

    if (authError) {
        console.error("Error creating user:", authError);
        throw new ApiError(409, "A user with this email already exists.");
    }
    if (!user) {
        console.error("Error creating user:", authError);
        throw new ApiError(500, "Failed to create user account.");
    }

    const { error: profileError } = await supabase
        .from('profiles').insert({ id: user.id, email: email, full_name: fullName, phone_number: phoneNumber });

    if (profileError) {
        await supabase.auth.admin.deleteUser(user.id);
        console.error("Error creating user profile, rolling back user creation:", profileError);
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

const signOut = asyncHandler(async (req, res) => {
    
    const { error } = await supabase.auth.signOut();

    if (error) {
        throw new ApiError(500, "Failed to sign out.", error);
    }

    res.status(200).json(new ApiResponse(200, null, "Successfully signed out."));
});

const deleteAccount = asyncHandler(async (req, res) => {
    const { password } = req.body;
    const userId = req.user.id; 
    if (!password) {
        throw new ApiError(400, "Password is required to confirm account deletion.");
    }
    if (!userId) {
        throw new ApiError(401, "User not authenticated.");
    }

  
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single();

    if (profileError || !profile) {
        throw new ApiError(404, "User profile not found.");
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: password,
    });

    if (signInError) {
        throw new ApiError(401, "Invalid password. Account deletion failed.", signInError);
    }

    const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

    if (deleteProfileError) {
        console.error("Failed to delete user profile, aborting account deletion:", deleteProfileError);
        throw new ApiError(500, "Could not delete user profile. Please try again.", deleteProfileError);
    }

    const { error: deleteAuthUserError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteAuthUserError) {
      
        console.error(`CRITICAL: User profile ${userId} was deleted but failed to delete auth user.`, deleteAuthUserError);
        throw new ApiError(500, "Failed to completely delete user account. Please contact support.", deleteAuthUserError);
    }
    
    res.status(200).json(new ApiResponse(200, null, "Your account has been permanently deleted."));
});

module.exports = {
    startPhoneVerification,
    verifyPhone,
    startEmailVerification,
    verifyEmail,
    resendOtp,
    resendEmailVerification,
    forgotPassword,
    resetPassword,
    completeRegistration,
    login,
    signOut,
    deleteAccount
};