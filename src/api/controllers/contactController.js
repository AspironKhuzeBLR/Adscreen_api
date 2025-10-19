// src/api/controllers/contactController.js

const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');
const {
    sendContactUserConfirmationEmail,
    sendContactAdminNotificationEmail
} = require('../services/msg91Services'); // Adjust path if needed

const submitContactForm = asyncHandler(async (req, res) => {
    const { fullName, email, phoneNumber, message } = req.body;
    if (!fullName || !email || !phoneNumber || !message) {
        throw new ApiError(400, "All fields (Full Name, Email, Phone Number, Message) are required.");
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
        throw new ApiError(400, "Please provide a valid email address.");
    }

    const formData = { fullName, email, phoneNumber, message };


    try {
        await sendContactUserConfirmationEmail(email, formData);
    } catch (emailError) {
        console.error(`Failed to send user contact confirmation email to ${email}:`, emailError);
           }

    try {
        await sendContactAdminNotificationEmail(formData);
    } catch (emailError) {
        console.error('Failed to send admin contact notification email:', emailError);
    }

    res.status(200).json(
        new ApiResponse(
            200,
            null,
            "Your message has been sent successfully! We've sent a confirmation email to you."
        )
    );
});

module.exports = {
    submitContactForm,
};