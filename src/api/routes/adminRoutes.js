const express = require("express");
const { protect, checkAdminRole } = require("../middleware/authMiddleware");

const {
  updateOrderDetails,
  getAllOrders,
  createDisplayAdUploadUrl,
} = require("../controllers/adminController");

const   router = express.Router();

router.use(protect);
router.use(checkAdminRole);

router.get("/orders", getAllOrders);
router.post("/orders/:orderId/upload-url", createDisplayAdUploadUrl);
router.patch("/orders/:orderId", updateOrderDetails);

module.exports = router;
