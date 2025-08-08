// src/api/middleware/errorHandler.js
const ApiError = require('../../utils/ApiError');
const { z } = require('zod');

const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    // Handle specific Zod validation errors
    if (err instanceof z.ZodError) {
        statusCode = 400; // Bad Request
        message = "Validation failed";
        // We can even format the errors from Zod
        const errors = err.errors ? err.errors.map(e => ({ 
            path: e.path ? e.path.join('.') : 'unknown', 
            message: e.message 
        })) : [];
        return res.status(statusCode).json({
            success: false,
            message,
            errors: errors,
        });
    }
    
    // Handle custom ApiError instances
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            errors: err.errors || [],
        });
    }
    
    // Handle other types of errors (e.g., from Supabase)
    // You can add more specific checks here if needed
    if (err.code && typeof err.code === 'string') {
       // Potentially a database error
       // Be careful not to leak sensitive information
       // For now, we'll treat it as a generic server error
    }

    // Default to 500 server error
    return res.status(statusCode).json({
        success: false,
        message: message,
        // Only include stack trace in development mode for debugging
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

module.exports = errorHandler;