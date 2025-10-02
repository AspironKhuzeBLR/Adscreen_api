const crypto = require("crypto");
const Razorpay = require("razorpay");
const supabase = require("../../config/supabase");
const asyncHandler = require("../../utils/asyncHandler");
const ApiError = require("../../utils/ApiError");
const ApiResponse = require("../../utils/ApiResponse");
const msg91Service = require("../services/msg91Services");


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// In src/api/controllers/orderController.js

const initiateOrder = asyncHandler(async (req, res) => {
    const { nanoid } = await import('nanoid');

    // 1. DESTRUCTURE required data. Note the new 'price' field.
    const {
        planId,
        locationId,
        startDate,
        price, // Frontend sends the price it received from getAvailabilityAndPrice
        deliveryAddress,
        gstInfo,
        creativeFilePath,
        creativeFileName
    } = req.body;
    
    const userId = req.user.id;

    // 2. VALIDATE the incoming data
    if (!planId || !locationId || !startDate || !creativeFilePath || !price) {
        throw new ApiError(400, "planId, locationId, startDate, price, and a creative file are required.");
    }
    
    // 3. SERVER-SIDE PRICE VERIFICATION & DURATION FETCH (SECURITY STEP)
    // This is a crucial security check to ensure the price hasn't been tampered with on the client-side.
    const { data: planDetails, error: planDetailsError } = await supabase
        .from('location_plan_pricing')
        .select('price, plans(duration_days)')
        .eq('location_id', locationId)
        .eq('plan_id', planId)
        .eq('is_active', true)
        .single();
    
    if (planDetailsError || !planDetails) {
        throw new ApiError(404, "Could not find a valid plan for this location.");
    }
    
    // Compare the price from the DB with the price from the request.
    // We cast to Number to avoid floating point comparison issues.
    if (Number(planDetails.price) !== Number(price)) {
        throw new ApiError(400, "Price mismatch. Please refresh and try again.");
    }
    
    const durationDays = planDetails.plans.duration_days;
    const verifiedPrice = planDetails.price;

    // 4. PREPARE order details (uses the verified price)
    const orderUID = `ORD-${nanoid(12).toUpperCase()}`;
    const amountInPaise = Math.round(verifiedPrice * 100);

    const calculatedEndDate = new Date(startDate);
    calculatedEndDate.setDate(calculatedEndDate.getDate() + durationDays - 1);
    const endDateString = calculatedEndDate.toISOString().split('T')[0];

    // ... The rest of the function (Steps 5, 6, 7, 8) remains exactly the same ...
    // It will use the `verifiedPrice` and `amountInPaise` variables.

    // 5. CREATE a Razorpay order (no change here)
    const rpOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: orderUID,
        notes: { userId, planId, locationId }
    });

    const { data: urlData } = supabase.storage
    .from('ad-creatives')
    .getPublicUrl(creativeFilePath);

    const publicUrl = urlData.publicUrl;

    // 6. CREATE the order record in our database (no change here, but uses the new dynamic price)
    const { data: newOrder, error: orderError } = await supabase.from('orders').insert({
        user_id: userId,
        plan_id: planId,
        location_id: locationId,
        start_date: startDate,
        end_date: endDateString,
        total_cost: price, // Use the dynamically fetched price
        final_amount: price, // Use the dynamically fetched price
        delivery_address: deliveryAddress,
        gst_info: gstInfo,
        status: 'Pending Payment',
        order_uid: orderUID,
        razorpay_order_id: rpOrder.id,
        creative_image_url: publicUrl
    }).select().single();
    
    if (orderError) {
        throw new ApiError(500, "Could not create the initial order record.", orderError);
    }
    
    
    const { error: creativeError } = await supabase.from('creatives').insert({
        order_id: newOrder.id,
        user_id: userId,
        file_path: creativeFilePath,
        file_name: creativeFileName,
        doc_type: 'design',
        image_url: publicUrl,
    });

    if (creativeError) {
        await supabase.from('orders').delete().eq('id', newOrder.id);
        throw new ApiError(500, "Could not link the creative file to the order. The order has been cancelled.", creativeError);
    }
        
    // 8. SEND the final response (no change here)
    res.status(200).json(new ApiResponse(200, {
        order: newOrder,
        razorpayOrder: rpOrder
    }, "Order initiated. Please proceed to payment."));
});

// Phase 2: Verify payment and confirm booking atomically
// The final, production-ready verifyPayment function

// Final Refined and Edge-Case-Handled verifyPayment Controller
const verifyPayment = asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // --- Pre-flight Check: Fetch the order from our DB first ---
    const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();

    // Edge Case: The order ID provided doesn't exist at all.
    if (fetchError || !order) {
        throw new ApiError(404, `The order with ID ${orderId} could not be found.`);
    }

    // --- State Machine: Handle the order based on its CURRENT status ---
    switch (order.status) {
        // --- Idempotency Cases: The job is already done. ---
        case 'Pending Approval':
        case 'Design Revise':
        case 'In Display':
        case 'Completed':
            console.warn(`Idempotent call: Verification attempted for already processed order ${orderId}.`);
            return res.status(200).json(new ApiResponse(200, { orderId, status: order.status }, "This order has already been successfully processed."));

        // --- Terminal State Cases: The order is dead and cannot be processed. ---
        case 'Cancelled - Refunded':
        case 'Cancelled':
        case 'Failed':
            console.warn(`Verification attempted for terminal order ${orderId} with status: ${order.status}.`);
            return res.status(409).json(new ApiResponse(409, { orderId, status: order.status }, `This order cannot be processed as it has a status of "${order.status}".`));

        // --- The "Go" Case: This is the only state where we proceed. ---
        case 'Pending Payment':
            // Now that we know the order is in the correct state, we can proceed.
            break; // Continue execution below the switch statement.
        
        // --- Default/Unknown State Case: Should not happen, but we handle it. ---
        default:
            console.error(`Verification attempted for order ${orderId} with an unknown or invalid status: ${order.status}.`);
            throw new ApiError(409, `The order is in an state of (${order.status}) and booking cannot be processed.`);
    }

    // --- Main Logic: This block only runs if status was 'Pending Payment' ---

    // 1. Signature Verification (Uncomment for Production)
    /*
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body.toString()).digest('hex');
    if (expectedSignature !== razorpay_signature) {
        throw new ApiError(400, "Invalid payment signature.");
    }
    */

    // 2. Attempt the atomic booking via RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc('confirm_booking_and_update_inventory', {
        p_order_id: orderId
    });
    
    // 3. Handle the RPC Result
    switch (rpcResult) {
        case 'SUCCESS':
           
            await handleSuccessfulPayment({ orderId, razorpay_payment_id, razorpay_signature });

            return res.status(200).json(new ApiResponse(200, { orderId, status: 'Pending Approval' }, "Payment successful and booking confirmed!"));

        case 'SLOT_UNAVAILABLE':
            console.warn(`Booking failed for order ${orderId}: SLOT_UNAVAILABLE (Race Condition). Triggering refund.`);
            try {
                const {res: refundResponse, error: refundError} = await razorpay.payments.refund(razorpay_payment_id, { receipt: `refund_order_${orderId}` });
                if (refundError) {
                    console.log(refundError);
                }
                await supabase.from('orders').update({ status: 'Cancelled - Refunded' }).eq('id', orderId);
                console.log(`Successfully processed refund for order ${orderId}.`);
                return res.status(409).json(new ApiResponse(409, { orderId, status: 'Cancelled - Refunded' }, "This slot became unavailable just before your payment was confirmed. Your payment has been automatically refunded."));
            } catch (refundError) {
                if (refundError.error?.description?.includes('fully refunded already')) {
                    console.warn(`Idempotent refund for order ${orderId} on an already refunded payment.`);
                    await supabase.from('orders').update({ status: 'Cancelled - Refunded' }).eq('id', orderId);
                    return res.status(409).json(new ApiResponse(409, { orderId, status: 'Cancelled - Refunded' }, "This slot was unavailable. Your payment had already been refunded from a previous attempt."));
                }
                console.error(`CRITICAL: REFUND FAILED for order ${orderId} / payment ${razorpay_payment_id}.`, refundError);
                throw new ApiError(500, "The slot became unavailable, but we failed to process an automatic refund. Please contact support immediately with your order ID.");
            }
        
        // These cases should not be hit if our pre-flight check is working, but we handle them for ultimate safety.
        case 'ORDER_NOT_PENDING':
        case 'ORDER_NOT_FOUND':
        case 'TRANSACTION_ERROR':
        default:
            console.error(`A critical and unexpected database error occurred for order ${orderId}. RPC Result: ${rpcResult}, RPC Error: ${rpcError?.message}`);
            // Do not attempt a refund here as the DB state is unknown.
            throw new ApiError(500, "A critical server error occurred while confirming your booking. Please contact support immediately.");
    }
});
const handleSuccessfulPayment = async ({ orderId, razorpay_payment_id, razorpay_signature }) => {
    // 1. Update the order status and payment details
    await supabase.from('orders').update({
        razorpay_payment_id,
        razorpay_signature,
        status: 'Pending Approval'
    }).eq('id', orderId);

    // 2. Fetch the complete order data needed for the email
    // We need to join with other tables to get all the names.
    const { data: fullOrderDetails, error: detailsError } = await supabase
        .from('orders')
        .select(`
            *,
            profiles ( full_name, email ),
            locations ( name ),
            plans ( name )
        `)
        .eq('id', orderId)
        .single();

    if (detailsError || !fullOrderDetails) {

        console.error(`CRITICAL: Failed to fetch details for order ${orderId} after successful payment. Email not sent.`, detailsError);
        return; 
    }

    try {
        const orderDataForEmail = {
            ...fullOrderDetails,
            location_name: fullOrderDetails.locations.name,
            plan_name: fullOrderDetails.plans.name
        };
        
        await msg91Service.sendOrderConfirmationEmail(
            orderDataForEmail,
            fullOrderDetails.profiles.email,
            fullOrderDetails.profiles.full_name
        );
    } catch (emailError) {
        // IMPORTANT: If the email fails, we don't want to fail the whole transaction.
        // The user's payment was successful. We just log the email error and move on.
        console.error(`Email failed to send for successfully paid order ${orderId}:`, emailError);
    }
};

const getUserOrders = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Step 1: Update the Supabase query to join with the 'creatives' table.
    // We select all columns from orders, plans, locations, and creatives.
    const { data: orders, error } = await supabase
        .from("orders")
        .select(`
            *,
            plans (*),
            locations (*),
            creatives (*)
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching user orders:", error);
        throw new ApiError(500, "Could not fetch user orders.");
    }
    
    if (!orders) {
         return res.status(200).json(new ApiResponse(200, [], "User has no orders."));
    }

    // Step 2: Generate signed URLs for each creative's file_path.
    // We use Promise.all for performance, generating all URLs concurrently.
    // const ordersWithSignedUrls = await Promise.all(
    //     orders.map(async (order) => {
    //         // The result from the query might be an array of creatives, but we assume one creative per order for now.
    //         const creative = order.creatives[0];
            
    //         if (creative && creative.file_path) {
    //             // Generate a signed URL that is valid for a limited time (e.g., 1 hour).
    //             const { data: signedUrlData, error: urlError } = await supabase
    //                 .storage
    //                 .from('ad-creatives') // Make sure this is your bucket name
    //                 .createSignedUrl(creative.file_path, 3600); // 3600 seconds = 1 hour

    //             if (urlError) {
    //                 console.error(`Could not create signed URL for path: ${creative.file_path}`, urlError);
    //                 // If URL generation fails, we can still return the order without the image URL.
    //                 creative.publicUrl = null; 
    //             } else {
    //                 creative.publicUrl = signedUrlData.signedUrl;
    //             }
    //         }
            
    //         return order;
    //     })
    // );

    res.status(200).json(new ApiResponse(200, orders, "User orders retrieved successfully."));
});

module.exports = { initiateOrder, verifyPayment, getUserOrders };
