// src/api/routes/file.routes.js
const { Router } = require('express');
const { createSignedUploadUrl,finalizeCreativeUpload } = require('../controllers/filesController');
const { protect } = require('../middleware/authMiddleware');

const router = Router();

// File operations require a logged-in user.
router.use(protect);

// This route will be used to get a secure URL for uploading a new creative.
router.post('/signed-upload-url', createSignedUploadUrl);
router.post('/finalize-creative-upload', finalizeCreativeUpload);

module.exports = router;