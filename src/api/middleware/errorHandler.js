const ApiError = require('../../utils/ApiError');
const { z } = require('zod');

const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    if (err instanceof z.ZodError) {
        statusCode = 400; 
        message = "Validation failed";
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
    
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            errors: err.errors || [],
        });
    }
    
    if (err.code && typeof err.code === 'string') {
       
    }

    return res.status(statusCode).json({
        success: false,
        message: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

module.exports = errorHandler;