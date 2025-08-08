const supabase = require('../../config/supabase');
const ApiError = require('../../utils/ApiError');

const protect = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return next(new ApiError(401, 'Access denied. No token provided'));
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return next(new ApiError(401, 'Invalid token'));
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
    }

    // Attach user and profile to request
    req.user = {
      ...user,
      profile: profile || null
    };

    next();
  } catch (error) {
    return next(new ApiError(401, 'Token verification failed'));
  }
};

module.exports = { protect };