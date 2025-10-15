const puppeteer = require("puppeteer-core"); // <-- Change this line

const getInvoiceHtml = (orderData) => {
    // Parse the delivery address from the JSON string
    const deliveryAddress = JSON.parse(orderData.delivery_address);

    // Calculate amounts
    const taxableAmount = orderData.final_amount / 1.18;
    const gstAmount = orderData.final_amount - taxableAmount;

    const css = `
        body { 
            font-family: 'Helvetica Neue', 'Helvetica', Arial, sans-serif; 
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }
        .invoice-box { 
            max-width: 800px; 
            margin: 20px auto; 
            padding: 30px; 
            border: 1px solid #eee; 
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.15); 
            font-size: 16px; 
            line-height: 24px; 
            background-color: #fff;
        }
        .invoice-box table { 
            width: 100%; 
            line-height: inherit; 
            text-align: left; 
            border-collapse: collapse;
        }
        .invoice-box table td { 
            padding: 8px; 
            vertical-align: top; 
        }
        .invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
        }
        .company-details, .invoice-details {
            width: 48%;
        }
        .company-details h1 {
            margin: 0;
            color: #333;
        }
        .invoice-details {
            text-align: right;
        }
        .invoice-details h2 {
            margin: 0;
        }
        .billing-details table {
            margin-bottom: 40px;
        }
        .billing-details table td {
            padding: 5px 0;
        }
        .items-table .heading {
            background: #eee;
            border-bottom: 1px solid #ddd;
            font-weight: bold;
        }
        .items-table .item td {
            border-bottom: 1px solid #eee;
        }
        .items-table .heading td, .items-table .item td {
             padding: 12px;
        }
        .totals-table {
            float: right;
            width: 40%;
        }
        .totals-table td {
            padding: 8px;
        }
        .totals-table .total {
            font-weight: bold;
            border-top: 2px solid #eee;
        }
        .footer {
            margin-top: 50px;
            text-align: center;
            font-size: 12px;
            color: #777;
        }
        .text-right {
            text-align: right;
        }
    `;

    return `
    <!doctype html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>GST Invoice - ${orderData.order_uid}</title>
        <style>${css}</style>
    </head>
    <body>
        <div class="invoice-box">
            <div class="invoice-header">
                <div class="company-details">
                    <img src="https://ad-screenhub.netlify.app/logo-2.png" alt="Company Logo" style="max-width: 150px; margin-bottom: 20px;">
                    <h1>ADSCREENHUB MEDIA</h1>
                    <div>Koramangala, Bengaluru - 560095</div>
                    <div><strong>GST:</strong> [Your Company GSTIN]</div>
                    <div><strong>PAN:</strong> [Your Company PAN]</div>
                </div>
                <div class="invoice-details">
                    <h2>TAX INVOICE</h2>
                    <p>
                        <strong>Invoice #:</strong> ${orderData.order_uid}<br>
                        <strong>Created:</strong> ${new Date(orderData.created_at).toLocaleDateString('en-GB')}
                    </p>
                </div>
            </div>

            <div class="billing-details">
                <table>
                    <tr>
                        <td><strong>Bill To:</strong></td>
                    </tr>
                    <tr>
                        <td>${orderData.profiles.full_name}</td>
                    </tr>
                    <tr>
                        <td>${deliveryAddress.street}, ${deliveryAddress.city}</td>
                    </tr>
                    <tr>
                        <td>${deliveryAddress.state} - ${deliveryAddress.zip}</td>
                    </tr>
                     <tr>
                        <td><strong>Email:</strong> ${orderData.profiles.email}</td>
                    </tr>
                    <tr>
                        <td><strong>GSTIN:</strong> ${orderData.gst_info}</td>
                    </tr>
                      <tr>
                        <td><strong>Phone Number:</strong> ${orderData.profiles.phone_number}</td>
                    </tr>
                </table>
            </div>

            <table class="items-table">
                <tr class="heading">
                    <td>Description</td>
                    <td class="text-right">Taxable Amount</td>
                    <td class="text-right">GST (18%)</td>
                    <td class="text-right">Total</td>
                </tr>
                <tr class="item">
                    <td>Subscription for Digital Advertisement Service - ${orderData.plans.name} Plan (${orderData.locations.name})</td>
                    <td class="text-right">₹${taxableAmount.toFixed(2)}</td>
                    <td class="text-right">₹${gstAmount.toFixed(2)}</td>
                    <td class="text-right">₹${orderData.final_amount.toFixed(2)}</td>
                </tr>
            </table>
            
            <table class="totals-table">
                 <tr>
                    <td>Subtotal:</td>
                    <td class="text-right">₹${taxableAmount.toFixed(2)}</td>
                </tr>
                 <tr>
                    <td>GST (18%):</td>
                    <td class="text-right">₹${gstAmount.toFixed(2)}</td>
                </tr>
                <tr class="total">
                    <td>Grand Total:</td>
                    <td class="text-right">₹${orderData.final_amount.toFixed(2)}</td>
                </tr>
            </table>

            <div style="clear: both;"></div>

            <div class="footer">
                This is a computer generated invoice and does not requires signature/stamp
            </div>
        </div>
    </body>
    </html>
    `;
};

orderData= {
  id: 196,
  user_id: '7de8010b-26ac-4cca-8705-e37ef03425c8',
  location_id: 20,
  plan_id: 1,
  start_date: '2027-12-27',
  end_date: '2027-12-27',
  total_cost: 4999,
  status: 'Pending Approval',
  razorpay_order_id: 'order_RTKs1Nuz79Ii8h',
  razorpay_payment_id: 'pay_RQ7HiCS8YcOuvT',
  razorpay_signature: 'this_is_still_a_fake_signature_for_testing',
  created_at: '2025-10-14T11:25:00.75262+00:00',
  updated_at: '2025-10-14T11:25:00.75262+00:00',
  delivery_address: '{"street":"123 API Lane","city":"Postman City","state":"Testland","zip":"12345"}',
  gst_info: '27AAPCU1234A1Z5',
  coupon_code: null,
  final_amount: 5898.82,
  order_uid: '85460',
  creative_image_url: 'https://ecyfovxtjczaugmsszih.supabase.co/storage/v1/object/public/ad-creatives/7de8010b-26ac-4cca-8705-e37ef03425c8/GphlZZVHyrUEhI5EXboFD.png',
  ad_display_url: null,
  remarks: null,
  profiles: { email: 'ysamson07@gmail.com', full_name: 'Sam', phone_number: '9876543210' },
  locations: { name: 'Koramangala' },
  plans: { name: 'Spark' }
}



const generateInvoicePDF = async (orderData) => {
  const browser = await puppeteer.launch({
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: 'new' 
    });
    
    const page = await browser.newPage();
    const htmlContent = getInvoiceHtml(orderData);
    
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    
    await browser.close();
    return pdfBuffer;
};



module.exports = { generateInvoicePDF };