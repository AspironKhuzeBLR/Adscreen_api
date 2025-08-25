require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./src/api/middleware/errorHandler'); 

const authRoutes = require('./src/api/routes/authRoutes');

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const supabase = require('./src/config/supabase');
const asyncHandler = require('./src/utils/asyncHandler');
const ApiError = require('./src/utils/ApiError');
const ApiResponse = require('./src/utils/ApiResponse');

app.get('/test/auth', asyncHandler(async (req, res) => {
    const userId = 'a553e5a7-a623-412d-84f6-86e69ec5f757';

     const { data, error } = await supabase
        .from('user_profiles_view') // <-- Querying the new view
        .select('*')               // <-- Select all columns from the view
        .eq('id', userId)          // <-- Filter for the logged-in user
        .single();

    if (error) {
        console.error("Error fetching full user profile:", error);
        throw new ApiError(500, "Could not fetch user profile data.");
    }

    if (!data) {
        throw new ApiError(404, "User profile not found.");
    }

    

    res.status(200).json(new ApiResponse(200, data, "Full user profile fetched successfully."));
}));
// --- NEW TEST ROUTE TO UPDATE A PHONE NUMBER ---
app.get('/test/ ', asyncHandler(async (req, res) => {
    // Hardcode the user ID and the new phone number for this test
    const userIdToUpdate = 'a553e5a7-a623-412d-84f6-86e69ec5f757'; // <<< The user you want to change
    const newPhoneNumber = '9999988888'; // <<< The new phone number

    console.log(`Attempting to update phone for user ${userIdToUpdate} to ${newPhoneNumber}`);

    // Use the admin client to update the user's data in the auth.users table
    const { data, error } = await supabase.auth.admin.updateUserById(
        userIdToUpdate,
        { 
            phone: newPhoneNumber,
            // IMPORTANT: When a user changes their phone, you should always require re-verification.
            // Setting phone_confirm to false will reset the phone_confirmed_at timestamp to null.
            phone_confirm: false 
        }
    );

    if (error) {
        console.error("Error updating user phone:", error);
        throw new ApiError(500, "Could not update user's phone number.");
    }

    const responseMessage = `Successfully initiated phone number change for user ${data.user.id}. New phone is ${data.user.phone}. Re-verification is now required.`;

    res.status(200).json(new ApiResponse(200, { updatedUser: data.user }, responseMessage));
}));

app.get('/', (req, res) => {
  res.json({ 
    message: 'AdScreen Hub Backend API is running!',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/v1/auth', authRoutes);




app.use(errorHandler);

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});