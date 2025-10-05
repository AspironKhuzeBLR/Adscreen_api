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


const initiateOrder = asyncHandler(async (req, res) => {
    const { nanoid } = await import('nanoid');

    const {
        planId,
        locationId,
        startDate,
        price, 
        deliveryAddress,
        gstInfo,
        creativeFilePath,
        creativeFileName
    } = req.body;
    
    const userId = req.user.id;

    if (!planId || !locationId || !startDate || !creativeFilePath || !price) {
        throw new ApiError(400, "planId, locationId, startDate, price, and a creative file are required.");
    }
    
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

    const { data: newOrder, error: orderError } = await supabase.from('orders').insert({
        user_id: userId,
        plan_id: planId,
        location_id: locationId,
        start_date: startDate,
        end_date: endDateString,
        total_cost: price, 
        final_amount: price, 
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


const verifyPayment = asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();

    if (fetchError || !order) {
        throw new ApiError(404, `The order with ID ${orderId} could not be found.`);
    }

    switch (order.status) {
        case 'Pending Approval':
        case 'Design Revise':
        case 'In Display':
        case 'Completed':
            console.warn(`Idempotent call: Verification attempted for already processed order ${orderId}.`);
            return res.status(200).json(new ApiResponse(200, { orderId, status: order.status }, "This order has already been successfully processed."));

        case 'Cancelled - Refunded':
        case 'Cancelled':
        case 'Failed':
            console.warn(`Verification attempted for terminal order ${orderId} with status: ${order.status}.`);
            return res.status(409).json(new ApiResponse(409, { orderId, status: order.status }, `This order cannot be processed as it has a status of "${order.status}".`));

        case 'Pending Payment':
            break; 
        
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

    const { data: rpcResult, error: rpcError } = await supabase.rpc('confirm_booking_and_update_inventory', {
        p_order_id: orderId
    });
    
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
        
        case 'ORDER_NOT_PENDING':
        case 'ORDER_NOT_FOUND':
        case 'TRANSACTION_ERROR':
        default:
            console.error(`A critical and unexpected database error occurred for order ${orderId}. RPC Result: ${rpcResult}, RPC Error: ${rpcError?.message}`);
            throw new ApiError(500, "A critical server error occurred while confirming your booking. Please contact support immediately.");
    }
});
const handleSuccessfulPayment = async ({ orderId, razorpay_payment_id, razorpay_signature }) => {
    await supabase.from('orders').update({
        razorpay_payment_id,
        razorpay_signature,
        status: 'Pending Approval'
    }).eq('id', orderId);


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
        console.error(`Email failed to send for successfully paid order ${orderId}:`, emailError);
    }
};

const getUserOrders = asyncHandler(async (req, res) => {
    const userId = req.user.id;

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

    res.status(200).json(new ApiResponse(200, orders, "User orders retrieved successfully."));
});

module.exports = { initiateOrder, verifyPayment, getUserOrders };
