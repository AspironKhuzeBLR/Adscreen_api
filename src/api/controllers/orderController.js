const crypto = require('crypto');
const Razorpay = require('razorpay');
const supabase = require('../../config/supabase');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const initiateOrder = asyncHandler(async (req, res) => {
    const { nanoid } = await import('nanoid');

    // 1. DESTRUCTURE ALL required data from the request body
    const {
        planId,
        locationId,
        startDate,
        deliveryAddress,
        gstInfo,
        creativeFilePath, // Path from the direct upload to Supabase Storage
        creativeFileName  // Original file name for reference
    } = req.body;
    
    const userId = req.user.id; // From our isAuthenticated middleware

    // 2. VALIDATE the incoming data
    if (!planId || !locationId || !startDate || !creativeFilePath) {
        throw new ApiError(400, "planId, locationId, startDate, and a creative file are required.");
    }

    // 3. FETCH plan details to get price and duration for calculations
    const { data: plan, error: planError } = await supabase
        .from('plans')
        .select('price, duration_days')
        .eq('id', planId)
        .single();

    if (planError || !plan) {
        throw new ApiError(404, "Plan not found.");
    }
    
    // 4. PREPARE order details
    const orderUID = `ORD-${nanoid(12).toUpperCase()}`;
    const amountInPaise = Math.round(plan.price * 100);

    const calculatedEndDate = new Date(startDate);
    calculatedEndDate.setDate(calculatedEndDate.getDate() + plan.duration_days - 1);
    const endDateString = calculatedEndDate.toISOString().split('T')[0];

    // 5. CREATE a Razorpay order before touching our database
    const rpOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: orderUID,
        notes: {
            userId,
            planId,
            locationId
        }
    });

    // 6. CREATE the order record in our database
    const { data: newOrder, error: orderError } = await supabase.from('orders').insert({
        user_id: userId,
        plan_id: planId,
        location_id: locationId,
        start_date: startDate,
        end_date: endDateString,
        total_cost: plan.price,
        final_amount: plan.price, // Can be modified with coupon logic later
        delivery_address: deliveryAddress,
        gst_info: gstInfo,
        status: 'Pending Payment',
        order_uid: orderUID,
        razorpay_order_id: rpOrder.id
    }).select().single();
    
    if (orderError) {
        // If order creation fails, we don't proceed.
        throw new ApiError(500, "Could not create the initial order record.", orderError);
    }
    
    // 7. LINK the pre-uploaded creative to the newly created order
    const { error: creativeError } = await supabase.from('creatives').insert({
        order_id: newOrder.id,
        user_id: userId,
        file_path: creativeFilePath,
        file_name: creativeFileName, // Store the original file name for display purposes
        doc_type: 'design'
    });

    if (creativeError) {
        // CRITICAL ROLLBACK: If linking the creative fails, we must delete the order
        // we just created to prevent an inconsistent state.
        await supabase.from('orders').delete().eq('id', newOrder.id);
        throw new ApiError(500, "Could not link the creative file to the order. The order has been cancelled.", creativeError);
    }
        
    // 8. SEND the final response to the frontend
    res.status(200).json(new ApiResponse(200, {
        order: newOrder,
        razorpayOrder: rpOrder
    }, "Order initiated. Please proceed to payment."));
});

// Phase 2: Verify payment and confirm booking atomically
const verifyPayment = asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

    if (expectedSignature !== razorpay_signature) {
        throw new ApiError(400, "Invalid payment signature.");
    }

    // Signature is valid. Now, attempt to confirm the booking in the DB.
    const { data: rpcResult, error: rpcError } = await supabase.rpc('confirm_booking_and_update_inventory', {
        p_order_id: orderId
    });

    if (rpcError || rpcResult !== 'SUCCESS') {
        // CRITICAL: Payment was successful, but booking failed (race condition).
        // TODO: Trigger an automatic refund via Razorpay API.
        console.error(`CRITICAL: Payment for order ${orderId} succeeded but inventory booking failed with code: ${rpcResult}. Triggering refund.`);
        await razorpay.payments.refund(razorpay_payment_id, { amount: amountInPaise });
        await supabase.from('orders').update({ status: 'Cancelled' }).eq('id', orderId);
        throw new ApiError(409, "Slot became unavailable during payment. Your payment has been refunded.");
    }

     

    // Update our order with the final payment details
    await supabase.from('orders').update({
        razorpay_payment_id,
        razorpay_signature
    }).eq('id', orderId);

    res.status(200).json(new ApiResponse(200, { orderId: orderId, status: 'Pending Approval' }, "Payment successful and booking confirmed!"));
});

const getUserOrders = asyncHandler(async (req, res) => {
    const { data, error } = await supabase
        .from('orders')
        .select(`*, plans(*), locations(*)`)
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

    if (error) throw new ApiError(500, "Could not fetch user orders.");
    res.status(200).json(new ApiResponse(200, data, "User orders retrieved."));
});


module.exports = { initiateOrder, verifyPayment, getUserOrders };