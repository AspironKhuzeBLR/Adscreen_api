const { Router } = require('express');
const { initiateOrder, verifyPayment, getUserOrders,validateCoupon } = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

const router = Router();

router.use(protect);

router.post('/initiate', initiateOrder);
router.post('/verify-payment', verifyPayment);
router.get('/', getUserOrders); 
router.get('/validate/:couponCode',validateCoupon);
module.exports = router;