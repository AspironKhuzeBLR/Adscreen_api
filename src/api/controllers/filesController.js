const supabase = require("../../config/supabase");
const asyncHandler = require("../../utils/asyncHandler");
const ApiError = require("../../utils/ApiError");
const ApiResponse = require("../../utils/ApiResponse");
const path = require("path");

const BUCKET_NAME = "ad-creatives"; 

const createSignedUploadUrl = asyncHandler(async (req, res) => {
  const { nanoid } = await import("nanoid");

  const { fileName, fileType } = req.body;
  const userId = req.user.id;

  if (!fileName || !fileType) {
    throw new ApiError(400, "fileName and fileType are required.");
  }

  const fileExtension = path.extname(fileName);
  const uniqueFileName = `${nanoid()}${fileExtension}`;
  const filePath = `${userId}/${uniqueFileName}`; 

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(filePath);

  if (error) {
    throw new ApiError(500, "Could not create signed upload URL.", error);
  }

  res
    .status(200)
    .json(new ApiResponse(200, data, "Signed URL created successfully."));
});

const finalizeCreativeUpload = asyncHandler(async (req, res) => {
  const { orderId, filePath, fileName, docType } = req.body;
  const userId = req.user.id;

  if (!orderId || !filePath || !docType) {
    throw new ApiError(400, "orderId, filePath, and docType are required.");
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("user_id", userId)
    .single();

  if (orderError || !order) {
    throw new ApiError(
      404,
      "Order not found or you do not have permission to access it."
    );
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  const publicUrl = urlData.publicUrl;

  if (!publicUrl) {
    throw new ApiError(
      500,
      "Could not retrieve the public URL for the uploaded file."
    );
  }

  // 3. Create a record in the 'creatives' table
  const { error: creativeInsertError } = await supabase
    .from("creatives")
    .insert({
      order_id: orderId,
      user_id: userId,
      file_path: filePath,
      file_name: fileName, // Optional, but good to have
      doc_type: docType, // e.g., 'IMAGE', 'VIDEO'
    });

  if (creativeInsertError) {
    throw new ApiError(
      500,
      "Failed to save creative record.",
      creativeInsertError
    );
  }

  // 4. Update the 'orders' table with the direct URL for easy access
  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({ creative_url: publicUrl })
    .eq("id", orderId);

  if (orderUpdateError) {
    // This is not ideal, but the creative is saved. We log the error.
    console.error(
      `Failed to update order ${orderId} with creative_url.`,
      orderUpdateError
    );
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { creativeUrl: publicUrl },
        "Creative uploaded and linked to order successfully."
      )
    );
});

const createReuploadUrl = asyncHandler(async (req, res) => {
    const { nanoid } = await import("nanoid");
    const { orderId } = req.params;
    const { fileName, fileType } = req.body;
    const userId = req.user.id;

    if (!fileName || !fileType) {
        throw new ApiError(400, "fileName and fileType are required.");
    }
    console.log(orderId, userId);

    const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id")
        .eq("id", orderId)
        .eq("user_id", userId)
        .single();

    if (orderError || !order) {
        throw new ApiError(404, "Order not found or you do not have permission to modify it.");
    }
    const fileExtension = path.extname(fileName);
    const uniqueFileName = `${nanoid()}${fileExtension}`;
    const filePath = `${userId}/${uniqueFileName}`;

    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUploadUrl(filePath);

    if (error) {
        throw new ApiError(500, "Could not create signed upload URL.", error);
    }

    res.status(200).json(new ApiResponse(200, { signedUrl: data.signedUrl, path: filePath }, "Signed URL for re-upload created successfully."));
});

const finalizeReupload = asyncHandler(async (req, res) => {
    const { orderId, filePath, fileName, docType } = req.body;
    const userId = req.user.id;

    if (!orderId || !filePath || !docType) {
        throw new ApiError(400, "orderId, filePath, and docType are required.");
    }

    const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id")
        .eq("id", orderId)
        .eq("user_id", userId)
        .single();

    if (orderError || !order) {
        throw new ApiError(404, "Order not found or you do not have permission to modify it.");
    }
   const { data: oldCreative } = await supabase
        .from("creatives")
        .select("file_path")
        .eq("order_id", orderId)
        .single();

    const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;

    if (!publicUrl) {
        throw new ApiError(500, "Could not retrieve the public URL for the newly uploaded file.");
    }

    // 3. UPDATE the existing record in the 'creatives' table.
    const { error: creativeUpdateError } = await supabase
        .from("creatives")
        .update({
            file_path: filePath,
            file_name: fileName,
            doc_type: docType,
            uploaded_at: new Date().toISOString()
        })
        .eq("order_id", orderId);

    if (creativeUpdateError) {
        throw new ApiError(500, "Failed to update creative record.", creativeUpdateError);
    }

    // 4. UPDATE the 'orders' table with the new direct URL.
    const { error: orderUpdateError } = await supabase
        .from("orders")
        .update({ creative_url: publicUrl })
        .eq("id", orderId);

    if (orderUpdateError) {
        console.error(`Failed to update order ${orderId} with new creative_url.`, orderUpdateError);
    }
    
    // 5. (Optional but Recommended) Delete the old file from storage.
    if (oldCreative && oldCreative.file_path) {
        try {
            await supabase.storage.from(BUCKET_NAME).remove([oldCreative.file_path]);
        } catch (removeError) {
            console.error(`Failed to remove old creative file at path: ${oldCreative.file_path}`, removeError);
        }
    }

    res.status(200).json(new ApiResponse(200, { creativeUrl: publicUrl }, "Creative has been successfully re-uploaded and updated."));
});


module.exports = {
    createSignedUploadUrl,
    finalizeCreativeUpload,
    createReuploadUrl,
    finalizeReupload
};