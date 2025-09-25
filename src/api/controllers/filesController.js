// src/api/controllers/file.controller.js
const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');
const path = require('path');

const BUCKET_NAME = 'ad-creatives'; // The name of your Supabase Storage bucket

const createSignedUploadUrl = asyncHandler(async (req, res) => {
    const { nanoid } = await import('nanoid');

    const { fileName, fileType } = req.body;
    const userId = req.user.id;

    if (!fileName || !fileType) {
        throw new ApiError(400, "fileName and fileType are required.");
    }

    // Sanitize the file name and create a unique path
    const fileExtension = path.extname(fileName);
    const uniqueFileName = `${nanoid()}${fileExtension}`;
    const filePath = `${userId}/${uniqueFileName}`; // Organize files by user ID

    const { data, error } = await supabase
        .storage
        .from(BUCKET_NAME)
        .createSignedUploadUrl(filePath);

    if (error) {
        throw new ApiError(500, "Could not create signed upload URL.", error);
    }

   
    res.status(200).json(new ApiResponse(200, data, "Signed URL created successfully."));
});

module.exports = { createSignedUploadUrl };