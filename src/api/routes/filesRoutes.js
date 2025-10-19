const { Router } = require('express');
const { createSignedUploadUrl,finalizeCreativeUpload,createReuploadUrl,finalizeReupload } = require('../controllers/filesController');
const { protect } = require('../middleware/authMiddleware');

const router = Router();

router.use(protect);

router.post('/signed-upload-url', createSignedUploadUrl);
router.post('/finalize-creative-upload', finalizeCreativeUpload);

router.post('/reupload-url/:orderId', createReuploadUrl);
router.patch('/finalize-reupload', finalizeReupload);   


module.exports = router;