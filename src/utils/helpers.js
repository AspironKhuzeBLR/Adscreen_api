const generateRandomString = (length = 10) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};


const formatDate = (date) => {
  return new Date(date).toISOString();
};


const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const createSuccessResponse = (data, message = 'Success') => {
  return {
    success: true,
    message,
    data
  };
};


const createErrorResponse = (message, statusCode = 400) => {
  return {
    success: false,
    message,
    statusCode
  };
};

module.exports = {
  generateRandomString,
  formatDate,
  isValidEmail,
  createSuccessResponse,
  createErrorResponse
};
