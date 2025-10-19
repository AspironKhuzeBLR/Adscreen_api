const { Router } = require('express');
const { getPlans,
  getPlansForLocation,
  getLocationsWithAvailability,
  getAvailabilityAndPrice,} = require('../controllers/dataController');
const { protect } = require('../middleware/authMiddleware');
const router = Router();

router.use(protect); 
router.get('/plans', getPlans);

router.get('/plans/location/:locationId', getPlansForLocation);
router.get('/locations/availability/:Date', getLocationsWithAvailability);

router.get('/availability/:locationId', getAvailabilityAndPrice);


module.exports = router;