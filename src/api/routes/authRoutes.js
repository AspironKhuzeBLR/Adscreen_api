const { Router } = require('express');
const authController = require('../controllers/authController');
const {protect} = require('../middleware/authMiddleware');

const router = Router();

// --- Registration Flow ---
router.post('/start-phone-verification', authController.startPhoneVerification);
router.post('/verify-phone', authController.verifyPhone);
router.post('/start-email-verification', authController.startEmailVerification);
router.post('/verify-email', authController.verifyEmail);
router.post('/complete-registration', authController.completeRegistration);


router.post('/resend-otp', authController.resendOtp);
router.post('/resend-email-verification', authController.resendEmailVerification);

router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

router.post('/login', authController.login);

router.post('/signout', protect, authController.signOut);

router.get('/profile', protect, authController.getMyProfile);
router.patch('/profile', protect, authController.updateProfileDetails); // For fullName, gstInfo

router.post('/profile/update-password', protect, authController.updatePassword);

router.post('/start-email-update', protect, authController.startEmailUpdate);
router.post('/complete-email-update', protect, authController.completeEmailUpdate);

router.post('/start-phone-update', protect, authController.startPhoneUpdate);
router.post('/complete-phone-update', protect, authController.completePhoneUpdate);

router.delete('/delete-account', protect, authController.deleteAccount);


module.exports = router;
