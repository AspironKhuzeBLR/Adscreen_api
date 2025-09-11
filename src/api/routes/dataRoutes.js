const { Router } = require('express');
const { getPlans, getLocationsWithAvailability ,checkPlanAvailability} = require('../controllers/dataController');
const { protect } = require('../middleware/authMiddleware');
const router = Router();

router.use(protect); // Protect all routes in this router

router.get('/plans', getPlans);
router.get('/locations/availability/:Date', getLocationsWithAvailability);

router.get('/locations/:locationId/check-availability', checkPlanAvailability);


module.exports = router;