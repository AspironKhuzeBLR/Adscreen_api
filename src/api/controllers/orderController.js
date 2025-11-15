const crypto = require("crypto");
const Razorpay = require("razorpay");
const supabase = require("../../config/supabase");
const asyncHandler = require("../../utils/asyncHandler");
const ApiError = require("../../utils/ApiError");
const ApiResponse = require("../../utils/ApiResponse");
const msg91Service = require("../services/msg91Services");
const {generateInvoicePdfBuffer} = require("../services/invoiceServices"); // Import the invoice generation service


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
    
   const totalAmountIncludingGST = (verifiedPrice * 1.18);
    // totalAmountIncludingGST = 1; // for testing
    const totalAmountInPaise = Math.round(totalAmountIncludingGST * 100);

    const calculatedEndDate = new Date(startDate);
    calculatedEndDate.setDate(calculatedEndDate.getDate() + durationDays - 1);
    const endDateString = calculatedEndDate.toISOString().split('T')[0];
    const { data: orderUID, error: uidError } = await supabase.rpc('get_next_order_uid');

    if (uidError || !orderUID) {
        throw new ApiError(500, "Could not reserve a new Order ID.", uidError);
    }
    
   
    const rpOrder = await razorpay.orders.create({
        amount: totalAmountInPaise,
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
        final_amount: totalAmountIncludingGST, 
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
        
    res.status(200).json(new ApiResponse(200, {
        order: newOrder,
        razorpayOrder: rpOrder
    }, "Order initiated. Please proceed to payment."));
});


const verifyPayment = asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;


    const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('status, final_amount') 
        .eq('id', orderId)
        .single();

    if (fetchError || !order) {
        throw new ApiError(404, `The order with ID ${orderId} could not be found.`);
    }
    // await handleSuccessfulPayment({ orderId, razorpay_payment_id, razorpay_signature });

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

    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body.toString()).digest('hex');
    if (expectedSignature !== razorpay_signature) {
        console.error(`Payment signature mismatch for order ${orderId}. Expected ${expectedSignature}, got ${razorpay_signature}.`);
        throw new ApiError(400, "Invalid payment signature.");
    }
    

    const { data: rpcResult, error: rpcError } = await supabase.rpc('confirm_booking_and_update_inventory', {
        p_order_id: orderId
    });
    
    switch (rpcResult) {
        case 'SUCCESS':
            try {
                console.log(`[SUCCESS] Slot confirmed for order ${orderId}. Attempting to capture payment ${razorpay_payment_id}.`);
                
                const amountInPaise = Math.round(order.final_amount * 100);
                // const amountInPaise =100; // Capturing a nominal amount for testing purposes
                await razorpay.payments.capture(razorpay_payment_id, amountInPaise, 'INR');
                
                console.log(`[CAPTURE] Successfully captured payment for order ${orderId}.`);

                await handleSuccessfulPayment({ orderId, razorpay_payment_id, razorpay_signature });

                return res.status(200).json(new ApiResponse(200, { orderId, status: 'Pending Approval' }, "Payment successful and booking confirmed!"));

            } catch (captureError) {
                await supabase.rpc('cancel_booking_and_release_inventory', { p_order_id: orderId });
                await razorpay.payments.refund(razorpay_payment_id);
                await supabase.from('orders').update({ status: 'Cancelled - Refunded', remarks: 'Payment capture failed after booking.' }).eq('id', orderId);
                console.error(`[CRITICAL] CAPTURE FAILED for order ${orderId} after slot was confirmed.`, captureError);
                console.log(`[ROLLBACK] Inventory slot for order ${orderId} has been released.`);
            
                throw new ApiError(500, "Your booking was confirmed, but the final payment capture failed. Please contact support immediately.");
            }

        case 'SLOT_UNAVAILABLE':
            console.warn(`[SLOT UNAVAILABLE] Booking failed for order ${orderId}. Releasing payment.`);
            try {
                await razorpay.payments.refund(razorpay_payment_id);
                
                await supabase.from('orders').update({ status: 'Cancelled - Refunded', remarks: 'Slot became unavailable during payment.' }).eq('id', orderId);
                
                return res.status(409).json(new ApiResponse(409, { orderId, status: 'Cancelled - Refunded' }, "This slot became unavailable just before your payment was confirmed. The payment has been cancelled and you will not be charged."));
            } catch (refundError) {
                console.error(`[CRITICAL] SLOT UNAVAILABLE for order ${orderId} AND PAYMENT RELEASE FAILED.`, refundError);
                throw new ApiError(500, "The slot became unavailable, and we failed to cancel the payment hold. Please contact support immediately.");
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
    const { data: invoiceNumber, error: invoiceNumError } = await supabase.rpc('get_next_invoice_number');

    if (invoiceNumError || !invoiceNumber) {    
        console.error(`[CRITICAL] FAILED TO GENERATE INVOICE NUMBER for order ${orderId}.`, invoiceNumError);
    }

    await supabase.from('orders').update({
        razorpay_payment_id,
        razorpay_signature,
        status: 'Pending Approval',
        invoice_number: invoiceNumber // <-- SAVING THE NEWLY GENERATED INVOICE NUMBER
    }).eq('id', orderId);

    const { data: fullOrderDetails, error: detailsError } = await supabase
        .from('orders')
        .select(`
            *,
            profiles ( id, full_name, email, phone_number), 
            locations ( name ),
            plans ( name )
        `)
        .eq('id', orderId)
        .single();

    if (detailsError || !fullOrderDetails) {
        console.error(`CRITICAL: Failed to fetch details for order ${orderId} after payment.`, detailsError);
        return; 
    }

    try {
        const pdfBuffer = await generateInvoicePdfBuffer(fullOrderDetails);
        const invoiceFileName = `invoice-${fullOrderDetails.order_uid}.pdf`;
        console.log(fullOrderDetails.profiles);

        const invoiceFilePath = `invoice/${fullOrderDetails.profiles.id}/${invoiceFileName}`;
        console.log(invoiceFilePath);
        const { error: uploadError } = await supabase.storage
            .from('invoice') 
            .upload(invoiceFilePath, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true 
            });

        if (uploadError) {
            console.error(`[CRITICAL] FAILED TO UPLOAD INVOICE for order ${orderId} to storage.`, uploadError);
        } 
        
        const attachment = [{ 
            filename: invoiceFileName, 
            content: pdfBuffer.toString('base64'), 
        }];

        await msg91Service.sendOrderConfirmationEmail(
            { 
                ...fullOrderDetails,
                location_name: fullOrderDetails.locations.name,
                plan_name: fullOrderDetails.plans.name,
            },
            fullOrderDetails.profiles.email,      
            fullOrderDetails.profiles.full_name,
            attachment
        );

        await msg91Service.sendAdminNotificationEmail(fullOrderDetails.order_uid);

    } catch (processError) {
        console.error(`Post-payment processing failed for order ${orderId}:`, processError);
    }
};

const getUserOrders = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    let { page = 1, limit = 10, status, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    let pageNum = parseInt(page, 10);
    let limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
        pageNum = 1;
    }
    if (isNaN(limitNum) || limitNum < 1) {
        limitNum = 10;
    } else if (limitNum > 50) { 
        limitNum = 50;
    }

    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = supabase
        .from('orders')
        .select(`
            *,
            plans (*),
            locations (*),
            creatives (*)
        `, { count: 'exact' }); 

    query = query.eq('user_id', userId);

    if (status) {
        query = query.eq('status', status);
    }

    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
        console.error("Error fetching user orders:", error);
        throw new ApiError(500, "Could not fetch user orders.");
    }

    res.status(200).json(
        new ApiResponse(
            200,
            {
                orders: data,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(count / limitNum),
                    totalOrders: count,
                    limit: limitNum
                }
            },
            "User orders retrieved successfully."
        )
    );
});
module.exports = { initiateOrder, verifyPayment, getUserOrders };
