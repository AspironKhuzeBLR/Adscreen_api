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
// src/api/controllers/data.controller.js
// ... (add to existing file)
const checkPlanAvailability = asyncHandler(async (req, res) => {
  const { locationId } = req.params;
  const { startDate, planId } = req.query;

  if (!startDate || !planId) {
    throw new ApiError(
      400,
      "startDate and planId are required query parameters."
    );
  }

  // Get plan duration
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("duration_days")
    .eq("id", planId)
    .single();

  if (planError || !plan) throw new ApiError(404, "Plan not found.");

  const { data: isAvailable, error: rpcError } = await supabase.rpc(
    "check_availability_for_range",
    {
      p_location_id: locationId,
      p_start_date: startDate,
      p_duration_days: plan.duration_days,
    }
  );

  if (rpcError) throw new ApiError(500, "Error checking availability.");

  res
    .status(200)
    .json(new ApiResponse(200, { isAvailable }, "Availability checked."));
});
// Remember to export it at the bottom
// module.exports = { ..., checkPlanAvailability };

module.exports = {
  getPlans,
  getLocationsWithAvailability,
  checkPlanAvailability,
};

