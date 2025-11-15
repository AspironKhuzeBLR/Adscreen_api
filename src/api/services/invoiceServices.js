const PDFDocument = require('pdfkit');
const fs = require('fs');

// Helper to extract state info from GSTIN
const getStateInfoFromGSTIN = (gstin) => {
  if (!gstin || gstin.length < 2) {
    return { stateName: 'N/A', stateCode: 'N/A' };
  }
  const stateCode = gstin.substring(0, 2);

  const stateMap = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
    "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
    "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
    "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "25": "Daman & Diu", "26": "Dadra & Nagar Haveli", "27": "Maharashtra", "28": "Goa",
    "29": "Karnataka", "30": "Kerala", "31": "Tamil Nadu", "32": "Puducherry",
    "33": "Andhra Pradesh (Old)", "34": "Telangana", "35": "Andaman & Nicobar Islands",
    "36": "Andhra Pradesh (New)", "37": "Ladakh", "38": "Lakshadweep",
    "97": "Other Territory", "99": "Centre Jurisdiction"
  };
  return { stateName: stateMap[stateCode] || 'N/A', stateCode };
};

// ----------------------------
// MAIN FUNCTION
// ----------------------------
const generateInvoicePdfBuffer = (orderData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // Company Info
      const COMPANY_NAME = 'ADSCREENHUB MEDIA';
      const COMPANY_ADDRESS = 'A/8, 80FT Main Road, 5th Block,\nKoramangala, Bengaluru - 560095';
      const COMPANY_GSTIN = '29ACKFA5754B1ZD';
      const COMPANY_PHONE = '+91 8548010203';
      const COMPANY_EMAIL = 'info@adscreenhub.com';

      // ============ HEADER ============
      const drawHeader = () => {
        const logoPath = 'src/Images/1563px.png';
        if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 40, { width: 120 });
        doc.font('Helvetica-Bold').fontSize(20).text(COMPANY_NAME, 180, 45);
        doc.font('Helvetica').fontSize(10).text(COMPANY_ADDRESS, 180, 70);
        doc.text(`GSTIN: ${COMPANY_GSTIN}`, 180, 100);
        doc.text(`Email: ${COMPANY_EMAIL}`, 180, 115);
        doc.text(`Phone No: ${COMPANY_PHONE}`, 180, 130);


        // TAX INVOICE RIGHT
        doc.font('Helvetica-Bold').fontSize(14).text('TAX INVOICE', 400, 45, { align: 'right' });
        doc.font('Helvetica').fontSize(10)
          .text(`Invoice #: ${orderData.invoice_number || 'N/A'}`, 400, 65, { align: 'right' })
          .text(`Date: ${new Date(orderData.created_at).toLocaleDateString('en-GB')}`, 400, 80, { align: 'right' });
      };

      // ============ CUSTOMER DETAILS ============
  const drawCustomerDetails = () => {
    const billingY = 160;
    let gstInfoObj = {};
    try {
        // Make parsing robust: handle if gst_info is already an object or a string
        if (orderData.gst_info && typeof orderData.gst_info === 'string') {
            gstInfoObj = JSON.parse(orderData.gst_info);
        } else if (orderData.gst_info && typeof orderData.gst_info === 'object') {
            gstInfoObj = orderData.gst_info;
        }
    } catch {
        gstInfoObj = {}; // Default to an empty object on any parsing error
    }
    const delivery = JSON.parse(orderData.delivery_address);

    // Determine if this is a business invoice based on key info
    const isBusinessInvoice = !!(gstInfoObj.company_name && gstInfoObj.gst_in);

    doc.font('Helvetica-Bold').fontSize(11).text('Billed to:', 50, billingY);
    doc.font('Helvetica').fontSize(10);
    let y = billingY + 15;
    const lineHeight = 12;

    if (isBusinessInvoice) {
        // --- RENDER AS A BUSINESS INVOICE ---
        const stateInfo = getStateInfoFromGSTIN(gstInfoObj.gst_in);

        // Company Name (always present for business invoice)
        doc.text(gstInfoObj.company_name, 50, y);
        y += lineHeight;

        // Address
        doc.text(`Address: ${delivery.street}, ${delivery.city}`, 50, y);
        y += lineHeight;

        // State (from GSTIN)
        if (stateInfo.stateName && stateInfo.stateName !== 'N/A') {
            doc.text(`State: ${stateInfo.stateName} (Code:'${stateInfo.stateCode}')`, 50, y);
            y += lineHeight;
        }

        // GSTIN
        if (gstInfoObj.gst_in) {
            doc.text(`GSTIN: ${gstInfoObj.gst_in}`, 50, y);
            y += lineHeight;
        }

        // Contact Name (from profiles.full_name)
        if (orderData.profiles.full_name) {
            doc.text(`Contact Name: ${orderData.profiles.full_name}`, 50, y);
            y += lineHeight;
        }

        // Email
        if (orderData.profiles.email) {
            doc.text(`Email: ${orderData.profiles.email}`, 50, y);
            y += lineHeight;
        }

        // Phone
        if (orderData.profiles.phone_number) {
            doc.text(`Phone: ${orderData.profiles.phone_number}`, 50, y);
        }

    } else {
        // --- RENDER AS A PERSONAL INVOICE ---

        // Customer's Full Name
        if (orderData.profiles.full_name) {
            doc.text(orderData.profiles.full_name, 50, y);
            y += lineHeight;
        }

        // Address
        doc.text(`Address: ${delivery.street}, ${delivery.city}`, 50, y);
        y += lineHeight;

        // State (from delivery address)
        if (delivery.state) {
            doc.text(`State: ${delivery.state}`, 50, y);
            y += lineHeight;
        }
        // Company, GSTIN, and Contact Name fields are omitted as they are for business invoices

        // Email
        if (orderData.profiles.email) {
            doc.text(`Email: ${orderData.profiles.email}`, 50, y);
            y += lineHeight;
        }

        // Phone
        if (orderData.profiles.phone_number) {
            doc.text(`Phone: ${orderData.profiles.phone_number}`, 50, y);
        }
    }
};


    // ============ INVOICE TABLE (CORRECTED & FULLY COMPLIANT) ============
const drawInvoiceTable = () => {
    const tableTop = 300;
    const headerLineY = tableTop + 22;

    const columnX = {
        description: 50,
        taxableAmount: 230,
        cgst: 310,
        sgst: 370,
        igst: 430,
        total: 480
    };
    const columnWidth = {
        description: 200,
        amount: 80,
        gst: 80,
        total: 80
    };

    // --- Draw Headers ---
    doc.font('Helvetica-Bold').fontSize(10)
        .text('Description', columnX.description, tableTop, { width: columnWidth.description })
        .text('Taxable Amount', columnX.taxableAmount, tableTop, { width: columnWidth.amount, align: 'right' })
        .text('CGST (9%)', columnX.cgst, tableTop, { width: columnWidth.gst, align: 'right' })
        .text('SGST (9%)', columnX.sgst, tableTop, { width: columnWidth.gst, align: 'right' })
        .text('IGST (18%)', columnX.igst, tableTop, { width: columnWidth.gst, align: 'right' })
        .text('Total', columnX.total, tableTop, { width: columnWidth.total, align: 'right' });
    doc.moveTo(50, headerLineY).lineTo(580, headerLineY).stroke();

    const taxableAmount = orderData.final_amount / 1.18;
    const totalGstAmount = orderData.final_amount - taxableAmount;
    let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;

    let gstInfoObj = {};
    try {
        if (orderData.gst_info && typeof orderData.gst_info === 'object') gstInfoObj = orderData.gst_info;
        else if (orderData.gst_info) gstInfoObj = JSON.parse(orderData.gst_info);
    } catch { }

    const { stateName: companyStateName, stateCode: companyStateCode } = getStateInfoFromGSTIN(COMPANY_GSTIN);
    const delivery = JSON.parse(orderData.delivery_address);

    // Determine the customer's state for GST calculation
    let customerStateForGstComparison = 'N/A';
    const isBusinessInvoice = !!(gstInfoObj.gst_in); // Simplified check for business invoice

    if (isBusinessInvoice) {
        const { stateName: customerGstStateName, stateCode: customerGstStateCode } = getStateInfoFromGSTIN(gstInfoObj.gst_in);
        customerStateForGstComparison = customerGstStateName;
    } else {
        // For personal orders, use the state from the delivery address
        customerStateForGstComparison = delivery.state || 'N/A'; // Ensure it's not undefined
    }

    // Convert both state names to lowercase for robust comparison
    const companyStateLower = companyStateName.toLowerCase();
    const customerStateLower = customerStateForGstComparison.toLowerCase();

    // Now apply the GST logic based on the refined state comparison
    if (customerStateLower === 'n/a' || companyStateLower !== customerStateLower) { // If customer state is unknown or different
        igstAmount = totalGstAmount;
    } else { // If customer state matches company state (both within Karnataka or same state)
        cgstAmount = totalGstAmount / 2;
        sgstAmount = totalGstAmount / 2;
    }

    let itemY = headerLineY + 10;
    const itemLineHeight = 15;
    doc.font('Helvetica').fontSize(10);
    doc.text(`Order #: ${orderData.order_uid}`, columnX.description, itemY);
    itemY += itemLineHeight;

    const fullDescription = `Subscription for Digital Advertisement Service - ${orderData.plans.name} Plan (${orderData.locations.name})`;
    const descriptionHeight = doc.heightOfString(fullDescription, { width: columnWidth.description, lineGap: 3 });
    doc.text(fullDescription, columnX.description, itemY, { width: columnWidth.description, lineGap: 3 });

    const amountsY = itemY;

    doc.text(`Rs. ${taxableAmount.toFixed(2)}`, columnX.taxableAmount, amountsY, { width: columnWidth.amount, align: 'right' });
    doc.text(`Rs. ${cgstAmount.toFixed(2)}`, columnX.cgst, amountsY, { width: columnWidth.gst, align: 'right' });
    doc.text(`Rs. ${sgstAmount.toFixed(2)}`, columnX.sgst, amountsY, { width: columnWidth.gst, align: 'right' });
    doc.text(`Rs. ${igstAmount.toFixed(2)}`, columnX.igst, amountsY, { width: columnWidth.gst, align: 'right' });
    doc.text(`Rs. ${orderData.final_amount.toFixed(2)}`, columnX.total, amountsY, { width: columnWidth.total, align: 'right' });

    const finalTableBottomY = itemY + descriptionHeight + 10;
    doc.moveTo(50, finalTableBottomY).lineTo(560, finalTableBottomY).stroke();

    return finalTableBottomY;
};

    const drawFooter = (tableEndY) => {
   
        const footerStartY = 750; 

        const grandTotalY = tableEndY + 20;
        doc.font('Helvetica-Bold').fontSize(12)
          .text('Grand Total', 390, grandTotalY, { width: 100, align: 'right' })
          .text(`Rs. ${orderData.final_amount.toFixed(2)}`, 490, grandTotalY, { width: 70, align: 'right' });

        doc.font('Helvetica').fontSize(8);
        doc.text('This is a computer-generated invoice and does not require a signature or stamp.', 50, footerStartY, { align: 'center' });
        doc.text(`${COMPANY_NAME}. All rights reserved.`, 50, footerStartY + 13, { align: 'center' });
        doc.text('Website: www.adscreenhub.com', 50, footerStartY + 26, { align: 'center' });
      };

      drawHeader();
      drawCustomerDetails();
      const tableEnd = drawInvoiceTable();
      drawFooter(tableEnd);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateInvoicePdfBuffer };