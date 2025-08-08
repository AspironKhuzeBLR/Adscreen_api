// src/api/controllers/authController.js

const supabase = require('../../config/supabase');
const { z } = require('zod');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');

// --- Schemas ---
const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  fullName: z.string().min(2, "Full name is required"),
  phoneNumber: z.string().min(10, "A valid phone number is required"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const phoneSchema = z.object({
  phoneNumber: z.string().min(10, "A valid phone number is required"),
});

// --- Controller Functions ---

const registerUser = asyncHandler(async (req, res) => {
  const { email, password, fullName, phoneNumber } = registerSchema.parse(req.body);

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) throw new ApiError(400, authError.message);
  if (!authData.user) throw new ApiError(500, "Registration failed, user not created in auth.");

  // Insert into our custom profiles table. The phone number lives here until verified.
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: authData.user.id, full_name: fullName, phone_number: phoneNumber });

  if (profileError) {
    console.error("CRITICAL: Auth user created but profile insertion failed:", profileError);
    throw new ApiError(500, "User profile could not be created.");
  }
  
  return res.status(201).json(
    new ApiResponse(201, { userId: authData.user.id }, "User registered successfully. Please check your email.")
  );
});
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  // 1. Authenticate with Supabase. This checks if the email/password is valid.
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // Handle actual login failures
  if (error) {
    if (error.message === "Invalid login credentials") {
      throw new ApiError(401, error.message);
    }
    if (error.message.includes("Email not confirmed")) {
      throw new ApiError(403, "Please verify your email address before logging in.");
    }
    throw new ApiError(500, error.message || "An error occurred during login.");
  }

  // 2. Authorization Check: Is the user fully verified?
  const user = data.user;

  // --- THIS IS THE KEY CHANGE ---
  // If phone is not verified, we DON'T throw an error.
  // Instead, we return a special response telling the frontend what to do next.
  if (!user.phone_confirmed_at) {
    // The user is authenticated but not fully authorized.
    // We give them the token they need to complete the next step.
    const partialAuthResponse = {
      message: "Authentication successful, but phone verification is required.",
      // This flag tells the frontend to redirect to the OTP page.
      verificationRequired: "phone", 
      // This is the token needed to call the protected OTP endpoints.
      accessToken: data.session.access_token,
    };
    
    // We return a 200 OK because the password was correct.
    return res.status(200).json(new ApiResponse(200, partialAuthResponse));
  }
  // --- END OF KEY CHANGE ---


  // 3. If all checks pass, grant a full session.
  const fullAuthResponse = {
    message: "Login successful",
    user: data.user,
    session: data.session,
  };

  return res.status(200).json(
    new ApiResponse(200, fullAuthResponse)
  );
});

const sendPhoneVerification = asyncHandler(async (req, res) => {
    const { phoneNumber } = phoneSchema.parse(req.body);
    // This action adds/updates the phone number on the auth.users record AND sends the OTP.
    const { error } = await supabase.auth.updateUser({ phone: phoneNumber });
    if (error) throw new ApiError(400, "Failed to send OTP. " + error.message);
    return res.status(200).json(new ApiResponse(200, {}, "Verification OTP sent successfully."));
});

const verifyPhoneOtp = asyncHandler(async (req, res) => {
    const { phoneNumber, token } = req.body;
    if (!phoneNumber || !token) throw new ApiError(400, "Phone number and OTP token are required.");

    const { data, error } = await supabase.auth.verifyOtp({ phone: phoneNumber, token: token, type: 'sms' });
    if (error) throw new ApiError(400, "Invalid OTP. " + error.message);
    
    // If successful, Supabase automatically updates user.phone_confirmed_at.
    return res.status(200).json(new ApiResponse(200, data, "Phone number verified successfully. You can now log in."));
});

const getMe = asyncHandler(async (req, res) => {
    return res.status(200).json(new ApiResponse(200, req.user, "User profile fetched successfully"));
});

module.exports = {
  registerUser,
  loginUser,
  getMe,
  sendPhoneVerification,
  verifyPhoneOtp,
};