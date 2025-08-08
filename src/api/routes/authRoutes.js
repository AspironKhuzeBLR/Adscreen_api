// src/api/routes/authRoutes.js

const express = require('express');
const router = express.Router();
const { 
    registerUser, 
    loginUser, 
    getMe, 
    sendPhoneVerification, // Import
    verifyPhoneOtp         // Import
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Public Routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// Protected Routes
router.get('/me', protect, getMe);
router.post('/send-phone-otp', protect, sendPhoneVerification);
router.post('/verify-phone-otp', protect, verifyPhoneOtp);


module.exports = router;