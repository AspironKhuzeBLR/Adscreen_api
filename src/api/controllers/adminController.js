const supabase = require("../../config/supabase");
const asyncHandler = require("../../utils/asyncHandler");
const ApiError = require("../../utils/ApiError");
const ApiResponse = require("../../utils/ApiResponse");
const path = require("path");
const msg91Service = require("../services/msg91Services");

const BUCKET_NAME = "ad-creatives";
const updateOrderDetails = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status, remarks, adDisplayUrl, adDisplayPath } = req.body;

  if (!orderId) {
    throw new ApiError(400, "Order ID is required.");
  }
  if (!status && !remarks && !adDisplayUrl && !adDisplayPath) {
    throw new ApiError(400, "At least one field must be provided to update.");
  }
  const validStatuses = [
    "Pending Payment",
    "Payment Failed",
    "Pending Approval",
    "Design Revise",
    "Pending Display (Approved)",
    "In Display",
    "Completed",
    "Cancelled - Forfeited",
    "Cancelled - Refunded",
  ];
  if (status && !validStatuses.includes(status)) {
    throw new ApiError(
      400,
      `Invalid status value. Must be one of: ${validStatuses.join(", ")}`
    );
  }

  const { data: currentOrder, error: fetchError } = await supabase
    .from("orders")
    .select(`*, profiles (full_name, email), locations (name), plans (name)`)
    .eq("id", orderId)
    .single();

  if (fetchError || !currentOrder) {
    throw new ApiError(404, `Order with ID ${orderId} not found.`);
  }
  const oldStatus = currentOrder.status;

  if (status && status !== oldStatus) {
    const allowedManualStatuses = [
      "Pending Payment",
      "Payment Failed",
      "Pending Approval",
      "Design Revise",
      "Pending Display (Approved)",
      "In Display",
      "Completed",
      "Cancelled - Forfeited",
      "Cancelled - Refunded",
    ];

    if (!allowedManualStatuses.includes(status)) {
      throw new ApiError(
        400,
        `The status '${status}' is managed by the system and cannot be set manually. You can only set the status to: ${allowedManualStatuses.join(
          ", "
        )}.`
      );
    }
  }

  const updateData = {};
  if (status) updateData.status = status;
  if (remarks) updateData.remarks = remarks;
  if (adDisplayPath) {
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(adDisplayPath);
    const publicUrl = urlData.publicUrl;
    if (!publicUrl) {
      throw new ApiError(
        404,
        `Could not generate a public URL for the path: ${adDisplayPath}.`
      );
    }
    updateData.ad_display_url = publicUrl;
  } else if (adDisplayUrl) {
    updateData.ad_display_url = adDisplayUrl;
  }

  updateData.updated_at = new Date().toISOString();

  const { data: updatedOrder, error: updateError } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", orderId)
    .select()
    .single();

  if (updateError) {
    throw new ApiError(500, "Failed to update the order.", updateError);
  }

  if (status && status !== oldStatus) {
    console.log(
      `Order ${orderId} status changed from '${oldStatus}' to '${status}'. Triggering email.`
    );
    try {
      const emailPayload = { ...currentOrder, status: updatedOrder.status };
      await msg91Service.sendOrderStatusUpdateEmail(emailPayload);
    } catch (emailError) {
      console.error(
        `Email failed to send for successfully updated order ${orderId}:`,
        emailError
      );
    }
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, updatedOrder, "Order details updated successfully.")
    );
});

const getAllOrders = asyncHandler(async (req, res) => {
  let {
    page = 1,
    limit = 10,
    status,
    sortBy = "created_at",
    sortOrder = "desc",
  } = req.query;

  let pageNum = parseInt(page, 10);
  let limitNum = parseInt(limit, 10);

  if (isNaN(pageNum) || pageNum < 1) {
    pageNum = 1;
  }

  if (isNaN(limitNum) || limitNum < 1) {
    limitNum = 10;
  } else if (limitNum > 100) {
    limitNum = 100;
  }

  const from = (pageNum - 1) * limitNum;
  const to = from + limitNum - 1;

  let query = supabase.from("orders").select(
    `
            *,
            profiles (full_name, email),
            locations (name),
            plans (name)
        `,
    { count: "exact" }
  );

  if (status) {
    query = query.eq("status", status);
  }

  query = query.order(sortBy, { ascending: sortOrder === "asc" });
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new ApiError(500, "Failed to fetch orders.", error);
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        orders: data,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(count / limitNum),
          totalOrders: count,
          limit: limitNum,
        },
      },
      "Orders retrieved successfully."
    )
  );
});

const createDisplayAdUploadUrl = asyncHandler(async (req, res) => {
  const { nanoid } = await import("nanoid");
  const { orderId } = req.params;
  const { fileName, fileType } = req.body;

  if (!fileName || !fileType) {
    throw new ApiError(400, "fileName and fileType are required.");
  }

  const fileExtension = path.extname(fileName);
  const uniqueFileName = `${nanoid()}${fileExtension}`;
  const filePath = `AD-DISPLAY/${orderId}/${uniqueFileName}`;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(filePath);

  if (error) {
    throw new ApiError(500, "Could not create signed upload URL.", error);
  }

  const responseData = {
    signedUrl: data.signedUrl,
    path: filePath,
  };

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        responseData,
        "Signed URL for display ad created successfully."
      )
    );
});

module.exports = {
  updateOrderDetails,
  getAllOrders,
  createDisplayAdUploadUrl,
};
