// A standalone script to test invoice generation and upload to Supabase Storage.

// --- 1. REQUIRED IMPORTS ---
require("dotenv").config(); // Make sure your .env variables are loaded
const fs = require("fs");
const supabase = require("./src/config/supabase"); // Assumes your config file exports a standard client
const {
  generateInvoicePdfBuffer,
} = require("./src/api/services/invoiceServices"); // The function we want to test

// --- 2. CONFIGURE YOUR TEST DATA HERE ---
// -----------------------------------------------------------------------------
// IMPORTANT: You MUST provide a real User ID and a valid JWT for that user.
const TEST_USER_ID = "3d4a1bc4-0d4a-4150-95c0-8a3038711456"; // e.g., 'a1b2c3d4-e5f6-7890-abcd-1234567890ab'
const TEST_USER_JWT =
  "eyJhbGciOiJIUzI1NiIsImtpZCI6IkwrTkR6ZXE2NEYrMDNlSDAiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2VjeWZvdnh0amN6YXVnbXNzemloLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIzZDRhMWJjNC0wZDRhLTQxNTAtOTVjMC04YTMwMzg3MTE0NTYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzYzMzk3MjIzLCJpYXQiOjE3NjMzOTM2MjMsImVtYWlsIjoic2h1YmhhbXNhbG1hbjE0M0BnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsX3ZlcmlmaWVkIjp0cnVlfSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc2MzM5MzYyM31dLCJzZXNzaW9uX2lkIjoiOTg3NzJiZTQtZmUzYi00OTY0LWJkMmMtOWNmNWEzNWE0NTAzIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.ic2EvXbtJa1C-b47sXCHZv_aaGkdm7JiUATF8f2CsNo";
const createDummyOrder = (userId) => ({
  id: 999,
  order_uid: Math.floor(10000 + Math.random() * 90000).toString(),
  user_id: userId,
  created_at: new Date().toISOString(),
  total_cost: 25000.0,
  final_amount: 29500.0,

  profiles: {
    user_id: userId,
    full_name: "Shahrukh Khan",
    email: "shahrukh.khan@example.com",
    phone_number: "9876543210",
  },

  locations: { name: "Adugodi Towards Koramangala" },
  plans: { name: "Spark Plan" },

  gst_info: { company_name: "Compamy Name Pvt Ltd", gst_in: "29ABCDE1234F5Z6" }, // Karnataka GSTIN

  delivery_address: JSON.stringify({
    street:
      "Test Customer Non Karnataka\nState DropDown selected haryana\n GSTIn for tamilnadu 33 ",
    city: "Durg",
    state: "Karnataka",
    zip: "496001",
    country: "India",
  }),

  invoice_number: "000111", // As per your logic, this is for successful payments
  order_number_display: "000118", // As per your logic, this is for all orders
});

/**
 * The main test function.
 */
const runTest = async () => {
  console.log("--- Starting Invoice Storage Test ---");

  if (!TEST_USER_ID.includes("-")) {
    console.error(
      "\n❌ ERROR: Please configure TEST_USER_ID and TEST_USER_JWT at the top of the script."
    );
    return;
  }

  try {
    // --- Step 1: Authenticate the Supabase client as our test user ---
    // This is CRITICAL for the RLS policy to work.
    console.log(`Authenticating as user: ${TEST_USER_ID}...`);
    const { error: authError } = await supabase.auth.setSession({
      access_token: TEST_USER_JWT,
      refresh_token: "sxio73gm3mu7",
    });
    if (authError) {
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    console.log("✅ Authentication successful.");

    // --- Step 2: Generate a dummy invoice PDF in memory ---
    const dummyOrder = createDummyOrder(TEST_USER_ID);
    console.log(
      `Generating invoice for dummy order: ${dummyOrder.order_uid}...`
    );
    const pdfBuffer = await generateInvoicePdfBuffer(dummyOrder);
    console.log(
      `✅ PDF generated successfully in memory (${(
        pdfBuffer.length / 1024
      ).toFixed(2)} KB).`
    );

    // For verification, save a local copy.
    fs.writeFileSync("test-invoice-local.pdf", pdfBuffer);
    console.log("   -> Saved a local copy as 'test-invoice-local.pdf'");

    // --- Step 3: Define the storage path and attempt the upload ---
    const invoiceFileName = `TEST-invoice-${dummyOrder.order_uid}.pdf`;
    // This path structure MUST match what your RLS policy expects.

    const invoiceFilePath = `${dummyOrder.user_id}/${invoiceFileName}`;
    console.log(invoiceFilePath);
    const { error: uploadError } = await supabase.storage
      .from("invoice")
      .upload(invoiceFilePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error(
        `[CRITICAL] FAILED TO UPLOAD INVOICE for order ${dummyOrder.order_uid} to storage.`,
        uploadError
      );
    } else {
      console.log(
        `✅ Invoice uploaded successfully to Supabase Storage at path: ${invoiceFilePath}`
      );
      const { data: urlData } = supabase.storage
        .from("invoice")
        .getPublicUrl(invoiceFilePath);

      console.log("\n--- ✅ SUCCESS! ---");
      console.log("Invoice Public URL:", urlData.publicUrl);
      console.log("------------------\n");
    }
    // --- Step 4: Get the public URL as a final confirmation ---
  } catch (error) {
    console.error("\n--- ❌ TEST FAILED ---");
    console.error("An error occurred:", error);
    console.error("---------------------\n");
  }
};

// Run the test
runTest();
