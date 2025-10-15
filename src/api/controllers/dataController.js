// src/api/controllers/data.controller.js
const supabase = require("../../config/supabase");
const asyncHandler = require("../../utils/asyncHandler");
const ApiResponse = require("../../utils/ApiResponse");
const ApiError = require("../../utils/ApiError");

const getPlans = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true);

  if (error) throw new ApiError(500, "Could not fetch plans.");

  res
    .status(200)
    .json(new ApiResponse(200, data, "Plans retrieved successfully."));
});

// In src/api/controllers/data.controller.js

const getPlansForLocation = asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    if (!locationId) {
        throw new ApiError(400, "Location ID is required.");
    }

    const { data, error } = await supabase
        .from('location_plan_pricing')
        .select(`
            price,
            plans ( id, name, description, duration_days, features )
        `)
        .eq('location_id', locationId)
        .eq('is_active', true);

    if (error) {
        console.error("Error fetching plans for location:", error);
        throw new ApiError(500, "Could not fetch plans for the selected location.");
    }
    
    // We reshape the data to be more frontend-friendly
    const formattedData = data.map(item => ({
        price: item.price,
        id: item.plans.id,
        name: item.plans.name,
        description: item.plans.description,
        duration_days: item.plans.duration_days
    }));

    res.status(200).json(new ApiResponse(200, formattedData, "Plans for the selected location retrieved successfully."));
});

const getLocationsWithAvailability = asyncHandler(async (req, res) => {
  const { Date: date } = req.params;
  if (!date)
    throw new ApiError(400, "A date query parameter is required (YYYY-MM-DD).");

  const { data, error } = await supabase.rpc(
    "get_locations_with_availability",
    {
      booking_date_param: date,
    }
  );

  if (error) {
    console.error("Supabase RPC Error:", error);
    throw new ApiError(500, "Could not fetch location availability.");
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        data,
        "Locations and availability retrieved successfully."
      )
    );
});

// In src/api/controllers/data.controller.js
// Renamed from checkPlanAvailability

const getAvailabilityAndPrice = asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const { startDate, planId } = req.query;

    if (!locationId || !startDate || !planId) {
        throw new ApiError(400, "locationId, startDate, and planId are required query parameters.");
    }

    // Step 1: Fetch the plan's duration and its specific price for this location in one go.
    const { data: planDetails, error: planDetailsError } = await supabase
        .from('location_plan_pricing')
        .select(`
            price,
            plans ( duration_days )
        `)
        .eq('location_id', locationId)
        .eq('plan_id', planId)
        .eq('is_active', true)
        .single();
    
    if (planDetailsError || !planDetails) {
        throw new ApiError(404, "A valid price could not be found for the selected plan and location.");
    }

    // Step 2: Check the availability for the entire date range using the fetched duration.
    const { data: isAvailable, error: rpcError } = await supabase.rpc(
        'check_availability_for_range',
        {
            p_location_id: locationId,
            p_start_date: startDate,
            p_duration_days: planDetails.plans.duration_days,
        }
    );

    if (rpcError) {
        console.error("Supabase RPC Error:", rpcError);
        throw new ApiError(500, "Error checking availability.");
    }

    // Step 3: Return the result.
    // If available, include the price and duration. If not, just indicate it's not available.
    if (isAvailable) {
        res.status(200).json(new ApiResponse(200, {
            isAvailable: true,
            price: planDetails.price,
            duration_days: planDetails.plans.duration_days
        }, "Slot is available."));
    } else {
        res.status(200).json(new ApiResponse(200, {
            isAvailable: false
        }, "Slot is not available for the selected date range."));
    }
});


module.exports = {
  getPlans,
  getPlansForLocation,
  getLocationsWithAvailability,
  getAvailabilityAndPrice,
};

