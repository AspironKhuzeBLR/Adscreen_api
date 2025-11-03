// A standalone script to test invoice generation and upload to Supabase Storage.

// --- 1. REQUIRED IMPORTS ---
require('dotenv').config(); // Make sure your .env variables are loaded
const fs = require('fs');
const { supabase } = require('./config/supabase'); // Assumes your config file exports a standard client
const { generateInvoicePdfBuffer } = require('./services/invoiceServices'); // The function we want to test

// --- 2. CONFIGURE YOUR TEST DATA HERE ---
// -----------------------------------------------------------------------------
// IMPORTANT: You MUST provide a real User ID and a valid JWT for that user.
const TEST_USER_ID = 'f827018d-2d2a-44c7-b582-73159d02e0e0'; // e.g., 'a1b2c3d4-e5f6-7890-abcd-1234567890ab'
// const TEST_USER_JWT = 'YOUR_TEST_USER_JWT_ACCESS_TOKEN'; // The long string from your browser's local storage
// -----------------------------------------------------------------------------


/**
 * A dummy order object that simulates the data needed to generate an invoice.
 */
const createDummyOrder = (userId) => ({
    id: 999,
    order_uid: Math.floor(10000 + Math.random() * 90000).toString(),
    user_id: userId,
    created_at: new Date().toISOString(),
    total_cost: 2500.00,
    final_amount: 2950.00, // 2500 + 18% GST
    profiles: {
        user_id: userId,
        full_name: 'Test User',
        email: 'test.user@example.com'
    },
    locations: { name: 'Test Location Alpha' },
    plans: { name: 'Test Plan Bravo' }
});


/**
 * The main test function.
 */
const runTest = async () => {
    console.log("--- Starting Invoice Storage Test ---");

    if (!TEST_USER_ID.includes('-') ) {
        console.error("\n❌ ERROR: Please configure TEST_USER_ID and TEST_USER_JWT at the top of the script.");
        return;
    }

    try {
        // --- Step 1: Authenticate the Supabase client as our test user ---
        // This is CRITICAL for the RLS policy to work.
        console.log(`Authenticating as user: ${TEST_USER_ID}...`);
        const { error: authError } = await supabase.auth.setSession({ access_token: TEST_USER_JWT, refresh_token: '' });
        if (authError) {
            throw new Error(`Authentication failed: ${authError.message}`);
        }
        console.log("✅ Authentication successful.");

        // --- Step 2: Generate a dummy invoice PDF in memory ---
        const dummyOrder = createDummyOrder(TEST_USER_ID);
        console.log(`Generating invoice for dummy order: ${dummyOrder.order_uid}...`);
        const pdfBuffer = await generateInvoicePdfBuffer(dummyOrder);
        console.log(`✅ PDF generated successfully in memory (${(pdfBuffer.length / 1024).toFixed(2)} KB).`);

        // For verification, save a local copy.
        fs.writeFileSync('test-invoice-local.pdf', pdfBuffer);
        console.log("   -> Saved a local copy as 'test-invoice-local.pdf'");

        // --- Step 3: Define the storage path and attempt the upload ---
        const invoiceFileName = `invoice-${dummyOrder.order_uid}.pdf`;
        // This path structure MUST match what your RLS policy expects.
        const invoiceFilePath = `${dummyOrder.user_id}/${invoiceFileName}`;

        console.log(`Uploading to Supabase Storage at path: invoices/${invoiceFilePath}...`);
        const { error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(invoiceFilePath, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) {
            // If it fails, throw the error to be caught by the catch block.
            throw uploadError;
        }
        console.log("✅ Upload to Supabase Storage successful!");

        // --- Step 4: Get the public URL as a final confirmation ---
        const { data: urlData } = supabase.storage
            .from('invoices')
            .getPublicUrl(invoiceFilePath);
        
        console.log("\n--- ✅ SUCCESS! ---");
        console.log("Invoice Public URL:", urlData.publicUrl);
        console.log("------------------\n");

    } catch (error) {
        console.error("\n--- ❌ TEST FAILED ---");
        console.error("An error occurred:", error);
        console.error("---------------------\n");
    }
};

// Run the test
runTest();