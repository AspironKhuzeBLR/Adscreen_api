require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./src/api/middleware/errorHandler'); 

const authRoutes = require('./src/api/routes/authRoutes');
const dataRouter = require('./src/api/routes/dataRoutes');
const orderRouter = require('./src/api/routes/orderRoutes');  
const fileRouter = require('./src/api/routes/filesRoutes'); 
const contactRoutes = require('./src/api/routes/contactRoutes'); 
const adminRoutes = require('./src/api/routes/adminRoutes');
const { initializeScheduler } = require('./src/utils/orderStatusScheduler'); // Adjust path as needed


const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ 
    message: 'AdScreen Hub Backend API is running!',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/data', dataRouter); 
app.use('/api/v1/orders',orderRouter);
app.use('/api/v1/files', fileRouter); 
app.use('/api/v1/contact', contactRoutes); 

app.use('/api/v1/admin', adminRoutes);

app.use(errorHandler);


initializeScheduler();

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});