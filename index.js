// index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./src/api/middleware/errorHandler'); // <-- IMPORT

// Route imports
const authRoutes = require('./src/api/routes/authRoutes');
// ... other route imports will go here ...

const app = express();
const port = process.env.PORT || 8000;

// --- GLOBAL MIDDLEWARE ---
// These should come first.
app.use(cors());
app.use(express.json());

// --- ROUTES ---
// All your API routes must be defined BEFORE the error handler.

// Health check route
app.get('/', (req, res) => {
  res.json({ 
    message: 'AdScreen Hub Backend API is running!',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
// ... other routes like app.use('/api/orders', orderRoutes) will go here ...


// --- GLOBAL ERROR HANDLER ---
// THIS MUST BE THE VERY LAST app.use() CALL.
// If it's placed before the routes, it won't catch errors from them.
app.use(errorHandler);

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});