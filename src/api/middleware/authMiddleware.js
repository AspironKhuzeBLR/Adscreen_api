const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');


const protect = asyncHandler(async (req, res, next) => {
  try {
    let token ;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        throw new ApiError(401, "Not authorized, no token provided.");
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return next(new ApiError(401, 'Invalid token'));
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
    }

    req.user = {
      ...user,
      profile: profile || null
    };
    next();
  } catch (error) {
    return next(new ApiError(401, 'Token verification failed'));
  }
});

const checkAdminRole = asyncHandler(async (req, res, next) => {
    const userRole = req.user?.profile?.user_role;

    if (userRole && userRole === 'admin') {
        return next();
    }
    throw new ApiError(403, "Access denied. You do not have permission to perform this action.");
});


module.exports = { protect, checkAdminRole };