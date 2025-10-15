const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const supabase = require("../../config/supabase");
const asyncHandler = require("../../utils/asyncHandler");
const ApiError = require("../../utils/ApiError");
const ApiResponse = require("../../utils/ApiResponse");
const msg91Service = require("../services/msg91Services");

const generateVerificationToken = (payload) => {
  return jwt.sign(payload, process.env.VERIFICATION_TOKEN_SECRET, {
    expiresIn: process.env.VERIFICATION_TOKEN_EXPIRY || "15m",
  });
};

const startPhoneVerification = asyncHandler(async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) throw new ApiError(400, "Phone number is required.");

  const { data: existingProfile, error: profileError } = await supabase
    .from("profiles")
    .select("phone_number")
    .eq("phone_number", phoneNumber)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    throw new ApiError(
      500,
      "Something went wrong while checking phone number.",
      profileError
    );
  }

  if (existingProfile) {
    throw new ApiError(
      409,
      "An account with this phone number already exists."
    );
  }

  const otp = msg91Service.generateOtp();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await supabase
    .from("verifications")
    .update({ is_used: true })
    .eq("identifier", phoneNumber)
    .eq("type", "SMS");

  await supabase.from("verifications").insert({
    identifier: phoneNumber,
    validator_hash: hashedOtp,
    expires_at: expiresAt.toISOString(),
    type: "SMS",
  });
  await msg91Service.sendSmsWithOtp(
    phoneNumber,
    otp
  );

  res.status(200).json(new ApiResponse(200, null, "OTP sent successfully."));
});

const verifyPhone = asyncHandler(async (req, res) => {
  const { phoneNumber, otp } = req.body;
  if (!phoneNumber || !otp)
    throw new ApiError(400, "Phone number and OTP are required.");

  const { data: verificationRecord, error } = await supabase
    .from("verifications")
    .select("*")
    .eq("identifier", phoneNumber)
    .eq("type", "SMS")
    .eq("is_used", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !verificationRecord)
    throw new ApiError(400, "Invalid OTP. Please request a new one.");
  if (new Date(verificationRecord.expires_at) < new Date())
    throw new ApiError(400, "OTP has expired.");

  const isMatch = await bcrypt.compare(otp, verificationRecord.validator_hash);
  if (!isMatch) throw new ApiError(400, "Invalid OTP provided.");

  await supabase
    .from("verifications")
    .update({ is_used: true })
    .eq("id", verificationRecord.id);

  const token = generateVerificationToken({
    phoneNumber,
    verified: true,
    type: "phone",
  });
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { phoneToken: token },
        "Phone number verified successfully."
      )
    );
});

// --- Existing Email Verification Endpoints ---

const startEmailVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required.");

  const lowercasedEmail = email.toLowerCase();

  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("email", lowercasedEmail)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new ApiError(
      500,
      "Something went wrong while checking for existing user.",
      error
    );
  }

  if (data) {
    throw new ApiError(
      409,
      "An account with this email address already exists."
    );
  }

  // Invalidate old email verification links
  await supabase
    .from("verifications")
    .update({ is_used: true })
    .eq("identifier", lowercasedEmail)
    .eq("type", "EMAIL");

  const selector = crypto.randomBytes(16).toString("hex");
  const validator = crypto.randomBytes(32).toString("hex");
  const hashedValidator = await bcrypt.hash(validator, 10);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1-hour expiry

  await supabase.from("verifications").insert({
    identifier: lowercasedEmail,
    selector: selector,
    validator_hash: hashedValidator,
    expires_at: expiresAt.toISOString(),
    type: "EMAIL",
  });

  const verificationLink = `${process.env.FRONTEND_URL}/verify-email?selector=${selector}&validator=${validator}`;
  await msg91Service.sendEmailVerificationLink(
    email,
    "Valued User",
    verificationLink
  );

  res
    .status(200)
    .json(new ApiResponse(200, null, "Verification email sent successfully."));
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { selector, validator } = req.body;
  if (!selector || !validator) {
    throw new ApiError(
      400,
      "Selector and validator are required from the verification link."
    );
  }

  const { data: verificationRecord, error } = await supabase
    .from("verifications")
    .select("*")
    .eq("selector", selector)
    .eq("type", "EMAIL")
    .eq("is_used", false)
    .single();

  if (error || !verificationRecord)
    throw new ApiError(
      400,
      "Invalid verification link. Please request a new one."
    );
  if (new Date(verificationRecord.expires_at) < new Date())
    throw new ApiError(400, "This verification link has expired.");

  const isTokenValid = await bcrypt.compare(
    validator,
    verificationRecord.validator_hash
  );
  if (!isTokenValid) throw new ApiError(400, "Invalid verification link.");

  await supabase
    .from("verifications")
    .update({ is_used: true })
    .eq("id", verificationRecord.id);

  const verificationJwt = generateVerificationToken({
    email: verificationRecord.identifier,
    verified: true,
    type: "email",
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { emailToken: verificationJwt },
        "Email verified successfully."
      )
    );
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
    .from("profiles")
    .select("id, full_name") // fetch full_name for the email template
    .eq("email", lowercasedEmail)
    .single();

  if (error || !profile) {
    // SECURITY: We send a success response even if the user doesn't exist to prevent email enumeration attacks.
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          "If an account with this email exists, a password reset code has been sent."
        )
      );
  }

  // Step 2: Invalidate old password reset OTPs for this user
  await supabase
    .from("verifications")
    .update({ is_used: true })
    .eq("identifier", lowercasedEmail)
    .eq("type", "PASSWORD_RESET");

  // Step 3: Generate and hash the new OTP
  const otp = msg91Service.generateOtp();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10-minute expiry as per template

  await supabase.from("verifications").insert({
    identifier: lowercasedEmail,
    validator_hash: hashedOtp, // Storing hashed OTP here
    expires_at: expiresAt.toISOString(),
    type: "PASSWORD_RESET",
    // 'selector' is no longer needed for OTP flow
  });

  await msg91Service.sendPasswordResetOtp(
    lowercasedEmail,
    profile.full_name || "Valued User",
    otp
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "If an account with this email exists, a password reset code has been sent."
      )
    );
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;
  if (!email || !otp || !password) {
    throw new ApiError(400, "Email, OTP, and a new password are required.");
  }

  const lowercasedEmail = email.toLowerCase();

  const { data: verificationRecord, error } = await supabase
    .from("verifications")
    .select("*")
    .eq("identifier", lowercasedEmail)
    .eq("type", "PASSWORD_RESET")
    .eq("is_used", false)
    .order("created_at", { ascending: false }) // Important: get the latest one
    .limit(1)
    .single();

  if (error || !verificationRecord)
    throw new ApiError(400, "Invalid OTP. Please request a new one.");
  if (new Date(verificationRecord.expires_at) < new Date())
    throw new ApiError(400, "OTP has expired. Please request a new one.");

  const isTokenValid = await bcrypt.compare(
    otp,
    verificationRecord.validator_hash
  );
  if (!isTokenValid) throw new ApiError(400, "Invalid OTP provided.");

  const { data: user, error: userError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", verificationRecord.identifier)
    .single();

  if (userError || !user) {
    throw new ApiError(
      404,
      "User associated with this reset request not found."
    );
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { password: password }
  );

  if (updateError) {
    throw new ApiError(500, "Failed to update password.", updateError);
  }

  await supabase
    .from("verifications")
    .update({ is_used: true })
    .eq("id", verificationRecord.id);

  res
    .status(200)
    .json(new ApiResponse(200, null, "Password has been reset successfully."));
});

const completeRegistration = asyncHandler(async (req, res) => {
  const { fullName, password, phoneToken, emailToken } = req.body;

  let decodedEmail, decodedPhone;
  try {
    decodedEmail = jwt.verify(
      emailToken,
      process.env.VERIFICATION_TOKEN_SECRET
    );
    decodedPhone = jwt.verify(
      phoneToken,
      process.env.VERIFICATION_TOKEN_SECRET
    );
  } catch (err) {
    throw new ApiError(
      401,
      "Invalid or expired verification tokens. Please start over."
    );
  }

  if (decodedEmail.type !== "email" || decodedPhone.type !== "phone") {
    throw new ApiError(401, "Mismatched verification tokens.");
  }

  const { email } = decodedEmail;
  const { phoneNumber } = decodedPhone;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    console.error("Error creating user:", authError);
    throw new ApiError(409, "A user with this email already exists.");
  }
  if (!user) {
    console.error("Error creating user:", authError);
    throw new ApiError(500, "Failed to create user account.");
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: user.id,
    email: email,
    full_name: fullName,
    phone_number: phoneNumber,
    updated_at: new Date(),
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(user.id);
    console.error(
      "Error creating user profile, rolling back user creation:",
      profileError
    );
    throw new ApiError(500, "Failed to create user profile.", profileError);
  }

  res
    .status(201)
    .json(new ApiResponse(201, { userId: user.id }, "Registration complete!"));
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    throw new ApiError(400, "Email and password are required.");

  const { data: userProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('deleted_at')
        .eq('email', email)
        .single();
    
    if (profileCheckError && profileCheckError.code !== 'PGRST116') {

        throw new ApiError(500, "An error occurred while checking user status.", profileCheckError);
    }
    
   
    if (userProfile && userProfile.deleted_at) {
        throw new ApiError(403, "Your account has been deactivated. Please contact support to reactivate it.");
    }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new ApiError(401, "Invalid email or password.", error);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, user_role")
    .eq("id", data.user.id)
    .single();

  const responseData = {
    user: { id: data.user.id, email: data.user.email, ...profile },
    session: data.session,
  };
  res.status(200).json(new ApiResponse(200, responseData, "Login successful."));
});

const signOut = asyncHandler(async (req, res) => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new ApiError(500, "Failed to sign out.", error);
  }

  res.status(200).json(new ApiResponse(200, null, "Successfully signed out."));
});

const getMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  console.log(userId);
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("email, full_name, phone_number, gst_info, user_role")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    throw new ApiError(404, "User profile not found.");
  }

  res
    .status(200)
    .json(new ApiResponse(200, profile, "Profile retrieved successfully."));
});

const updateProfileDetails = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { fullName, gstInfo } = req.body;

  if (!fullName && !gstInfo) {
    throw new ApiError(
      400,
      "No valid fields (fullName, gstInfo) provided for update."
    );
  }

  const updates = {};
  if (fullName) updates.full_name = fullName;
  if (gstInfo) updates.gst_info = gstInfo;
  updates.updated_at = new Date();

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (error) {
    throw new ApiError(500, "Failed to update profile details.", error);
  }

  res
    .status(200)
    .json(new ApiResponse(200, null, "Profile details updated successfully."));
});

const updatePassword = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Current password and new password are required.");
  }

  // Get the user's current email from the 'profiles' table to verify the password
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();
  if (!profile) throw new ApiError(404, "User profile not found.");

  // Verify the current password by attempting to sign in
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: currentPassword,
  });

  if (signInError) {
    throw new ApiError(401, "Invalid current password provided.");
  }

  // Update the user's password in Supabase Auth
  const { error: updateAuthError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateAuthError) {
    throw new ApiError(500, "Failed to update password.", updateAuthError);
  }

  res
    .status(200)
    .json(new ApiResponse(200, null, "Password updated successfully."));
});


const startEmailUpdate = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { newEmail } = req.body;
  const lowercasedEmail = newEmail.toLowerCase();

  if (!lowercasedEmail) {
    throw new ApiError(400, "A new email address is required.");
  }

  const { data: existingUser, error: checkError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", lowercasedEmail)
    .single();

  if (checkError && checkError.code !== "PGRST116") {
    throw new ApiError(500, "Error checking email uniqueness.", checkError);
  }
  if (existingUser) {
    throw new ApiError(
      409,
      "This email is already registered to another account."
    );
  }

  const otp = msg91Service.generateOtp();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); 

  await supabase.from("verifications").insert({
    identifier: lowercasedEmail,
    validator_hash: hashedOtp,
    expires_at: expiresAt.toISOString(),
    type: "EMAIL_UPDATE",
    user_id: userId,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();
  await msg91Service.sendEmailUpdateOtp(
    lowercasedEmail,
    profile?.full_name || "Valued User",
    otp
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "A verification code has been sent to your new email address."
      )
    );
});

const completeEmailUpdate = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { newEmail, otp } = req.body;
  const lowercasedEmail = newEmail.toLowerCase();

  if (!lowercasedEmail || !otp) {
    throw new ApiError(400, "New email and OTP are required.");
  }

  const { data: verificationRecord, error } = await supabase
    .from("verifications")
    .select("*")
    .eq("identifier", lowercasedEmail)
    .eq("type", "EMAIL_UPDATE")
    .eq("user_id", userId)
    .eq("is_used", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !verificationRecord)
    throw new ApiError(
      400,
      "Invalid verification code. Please request a new one."
    );
  if (new Date(verificationRecord.expires_at) < new Date())
    throw new ApiError(400, "Verification code has expired.");

  const isMatch = await bcrypt.compare(otp, verificationRecord.validator_hash);
  if (!isMatch) throw new ApiError(400, "Invalid verification code provided.");

  const { data: updatedUser, error: adminUpdateError } =
    await supabase.auth.admin.updateUserById(userId, {
      email: lowercasedEmail,
      email_confirm: true, 
    });

  if (adminUpdateError) {
    console.error(
      `CRITICAL: Admin failed to update auth email for user ${userId}.`,
      adminUpdateError
    );
    throw new ApiError(
      500,
      "A server error occurred while updating your email. Please try again.",
      adminUpdateError
    );
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ email: lowercasedEmail, updated_at: new Date() })
    .eq("id", userId);
  if (profileError) {
    // This is a critical state. The auth email changed but the profile didn't.
    // Log this for manual admin intervention. The user needs to be notified.
    console.error(
      `CRITICAL: Auth email for user ${userId} updated to ${lowercasedEmail}, but failed to update 'profiles' table.`
    );
    throw new ApiError(
      500,
      "Your email was partially updated. Please contact support to resolve this issue."
    );
  }

  // Mark the OTP as used
  await supabase
    .from("verifications")
    .update({ is_used: true })
    .eq("id", verificationRecord.id);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Your email address has been updated successfully."
      )
    );
});

const startPhoneUpdate = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { newPhoneNumber } = req.body;

  if (!newPhoneNumber)
    throw new ApiError(400, "A new phone number is required.");
  
  const { data: currentUserProfile, error: currentProfileError } =
    await supabase
      .from("profiles")
      .select("phone_number")
      .eq("id", userId)
      .single();
  if (currentProfileError)
    throw new ApiError(
      500,
      "Error fetching current user profile.",
      currentProfileError
    );
  console.log(currentUserProfile.phone_number, newPhoneNumber);
  if (
    currentUserProfile &&
    currentUserProfile.phone_number === newPhoneNumber
  ) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          "Phone number is already set to this value. No update needed."
        )
      );
  }
  console.log(currentUserProfile);
  const otp = msg91Service.generateOtp();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const { data, error: insertError } = await supabase
    .from("verifications")
    .insert({
      identifier: newPhoneNumber,
      validator_hash: hashedOtp,
      expires_at: expiresAt.toISOString(),
      type: "PHONE_UPDATE",
      user_id: userId,
    });
  console.log(otp);
  await msg91Service.sendSmsWithOtp_PhoneUpdate(
    newPhoneNumber,
    otp
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "An OTP has been sent to your new phone number."
      )
    );
});

const completePhoneUpdate = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { newPhoneNumber, otp } = req.body;

  if (!newPhoneNumber || !otp)
    throw new ApiError(400, "New phone number and OTP are required.");

  const { data: verificationRecord, error } = await supabase
    .from("verifications")
    .select("*")
    .eq("identifier", newPhoneNumber)
    .eq("type", "PHONE_UPDATE")
    .eq("user_id", userId)
    .eq("is_used", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !verificationRecord)
    throw new ApiError(
      400,
      "Invalid OTP or Phone number. Please enter a new one."
    );
  if (new Date(verificationRecord.expires_at) < new Date())
    throw new ApiError(400, "OTP has expired.");

  const isMatch = await bcrypt.compare(otp, verificationRecord.validator_hash);
  if (!isMatch) throw new ApiError(400, "Invalid OTP provided.");

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ phone_number: newPhoneNumber, updated_at: new Date() })
    .eq("id", userId);
  if (updateError)
    throw new ApiError(
      500,
      "Failed to update phone number in profile.",
      updateError
    );

  await supabase
    .from("verifications")
    .update({ is_used: true })
    .eq("id", verificationRecord.id);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Your phone number has been updated successfully."
      )
    );
});


const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const userId = req.user.id;

  if (!password) {
    throw new ApiError(400, "Password is required to confirm account deletion.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    throw new ApiError(404, "User profile not found.");
  }

  // 2. --- VERIFY PASSWORD ---
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: password,
  });

  if (signInError) {
    throw new ApiError(
      401,
      "Invalid password. Account deletion failed.",
      signInError
    );
  }

  // 3. --- ANONYMIZE PROFILE DATA (The "Soft" part for DB integrity) ---
  // We must change the email in profiles to free it up if there's a unique constraint,
  // and to ensure PII is removed.
  const timestamp = Date.now();
  const anonymizedEmail = `deleted_${userId.slice(0, 8)}_${timestamp}@inactive.local`;

  const { error: anonymizeError } = await supabase
    .from("profiles")
    .update({
      email: anonymizedEmail,
      phone_number: null, // Assuming column allows NULL. If not, use a unique dummy format like `0000000000_${timestamp}`
      full_name: "Deleted User",
      gst_info: null, // Scrub other PII
      deleted_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (anonymizeError) {
    console.error("Failed to anonymize user profile:", anonymizeError);
    throw new ApiError(
      500,
      "Could not process account deletion. Please try again.",
      anonymizeError
    );
  }

  // 4. --- HARD DELETE FROM SUPABASE AUTH ---
  // This frees up the original email and phone for re-registration.
  // Use admin API to bypass RLS and ensure deletion.
  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

  if (deleteAuthError) {
    // CRITICAL SCENARIO: Profile is anonymized, but Auth user still exists.
    // User won't be able to login (email changed in profile, need to check logic),
    // but also can't re-register.
    console.error(
      `CRITICAL: Profile anonymized for ${userId}, but Auth deletion failed. Manual intervention required.`,
      deleteAuthError
    );
    
    // Ideally, rollback step 3 here, but supabase-js doesn't support multi-step transactions easily without RPC.
    // For now, throw error instructing user to contact support.
    throw new ApiError(
      500,
      "An error occurred during final deletion. Please contact support.",
      deleteAuthError
    );
  }

  // 5. --- CLEANUP VERIFICATIONS (Optional but recommended) ---
  // Delete pending OTPs/links associated with the anonymized profile to keep DB clean.
  await supabase
      .from("verifications")
      .delete()
      .eq("user_id", userId); // Assuming verifications has user_id, or use the old email before anonymizing.

  // 6. --- RESPOND WITH SUCCESS ---
  res
    .status(200)
    .json(new ApiResponse(200, null, "Your account has been permanently deleted. You may register again as a new user."));
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
  getMyProfile,
  updateProfileDetails,
  updatePassword,
  startEmailUpdate,
  completeEmailUpdate,
  startPhoneUpdate,
  completePhoneUpdate,
  deleteAccount,
};
