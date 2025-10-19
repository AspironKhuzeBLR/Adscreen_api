const { Router } = require('express');
const { initiateOrder, verifyPayment, getUserOrders } = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

const router = Router();

router.use(protect);

router.post('/initiate', initiateOrder);
router.post('/verify-payment', verifyPayment);
router.get('/', getUserOrders); 

module.exports = router;