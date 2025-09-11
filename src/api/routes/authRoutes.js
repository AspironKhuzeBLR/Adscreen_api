const { Router } = require('express');
const authController = require('../controllers/authController');

const router = Router();

// --- Registration Flow ---
router.post('/start-phone-verification', authController.startPhoneVerification);
router.post('/verify-phone', authController.verifyPhone);
router.post('/start-email-verification', authController.startEmailVerification);
router.post('/verify-email', authController.verifyEmail);
router.post('/complete-registration', authController.completeRegistration);

// --- Standard Auth ---
router.post('/login', authController.login);


module.exports = router;
