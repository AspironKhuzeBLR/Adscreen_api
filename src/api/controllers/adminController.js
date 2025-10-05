const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');
const path = require("path");

const BUCKET_NAME = "ad-creatives"; 


const updateOrderDetails = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    // We now accept 'adDisplayPath' in addition to the other fields
    const { status, remarks, adDisplayUrl, adDisplayPath } = req.body;

    // 1. --- VALIDATE INPUT ---
    if (!orderId) {
        throw new ApiError(400, "Order ID is required.");
    }

    if (!status && !remarks && !adDisplayUrl && !adDisplayPath) {
        throw new ApiError(400, "At least one field (status, remarks, adDisplayUrl, or adDisplayPath) must be provided to update.");
    }
    
    const validStatuses = ['Pending Approval', 'In Display', 'Completed', 'Cancelled', 'Design Revise', 'Cancelled - Refunded'];
    if (status && !validStatuses.includes(status)) {
        throw new ApiError(400, `Invalid status value. Must be one of: ${validStatuses.join(', ')}`);
    }

    // 2. --- CONSTRUCT THE UPDATE PAYLOAD ---
    const updateData = {};
    if (status) updateData.status = status;
    if (remarks) updateData.remarks = remarks;

    // --- NEW LOGIC: Generate public URL from the path if provided ---
    if (adDisplayPath) {
        // Generate the full public URL on the backend. This is more secure and robust.
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(adDisplayPath);
        
        const publicUrl = urlData.publicUrl;

        if (!publicUrl) {
            // This can happen if the path is invalid. We should throw an error.
            throw new ApiError(404, `Could not generate a public URL for the provided path: ${adDisplayPath}. Please ensure the path is correct and the file was uploaded.`);
        }
        
        // Use snake_case for the database column name
        updateData.ad_display_url = publicUrl;

    } else if (adDisplayUrl) {
        // Keep this for backward compatibility or if an admin wants to paste a URL directly.
        updateData.ad_display_url = adDisplayUrl;
    }
    
    updateData.updated_at = new Date().toISOString();

    // 3. --- PERFORM THE UPDATE ---
    const { data: updatedOrder, error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId)
        .select()
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            throw new ApiError(404, `Order with ID ${orderId} not found.`);
        }
        throw new ApiError(500, "Failed to update the order.", error);
    }

    // 4. --- RESPOND WITH SUCCESS ---
    res.status(200).json(
        new ApiResponse(
            200,
            updatedOrder,
            "Order details updated successfully."
        )
    );
});


const getAllOrders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, status, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = supabase
        .from('orders')
        .select(`
            *,
            profiles (full_name, email),
            locations (name),
            plans (name)
        `);

    if (status) {
        query = query.eq('status', status);
    }

    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

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
                    totalOrders: count
                }
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
        path: filePath
    };

    res.status(200).json(new ApiResponse(200, responseData, "Signed URL for display ad created successfully."));
});


module.exports = {
    updateOrderDetails,
    getAllOrders, 
    createDisplayAdUploadUrl,
};
