
const PDFDocument = require('pdfkit');
const fs = require('fs'); 


const generateInvoicePdfBuffer = (orderData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      const drawHeader = () => {
        const imagePath = 'src/Images/image.png'; 
        if (fs.existsSync(imagePath)) {
          doc.image(imagePath, 40, 40, { width: 120 });
        } else {
          console.error(`Invoice image not found at path: ${imagePath}`);
          doc.fontSize(10).text('[ADSCREEN HUB]', 40, 45); 
        }
        
        doc.font('Helvetica-Bold').fontSize(20).text('ADSCREENHUB MEDIA', 170, 50);
        doc.font('Helvetica').fontSize(10).text('Koramangala, Bengaluru - 560095', 172, 75);
        doc.font('Helvetica').fontSize(10).text('GSTIN: 29ACKFA5754B1ZD', 172, 90);

        doc.font('Helvetica-Bold').fontSize(16).text('TAX INVOICE', 400, 50, { align: 'right' });
        doc.font('Helvetica').fontSize(10).text(`Invoice #: ${orderData.order_uid}`, 400, 72, { align: 'right' });
        doc.text(`Date: ${new Date(orderData.created_at).toLocaleDateString("en-GB")}`, 400, 86, { align: 'right' });

        doc.moveDown(5); 
      };

      const drawCustomerInfo = () => {
        const deliveryAddress = JSON.parse(orderData.delivery_address);
        doc.font('Helvetica-Bold').fontSize(11).text('Bill To:', 40, 150);
        doc.font('Helvetica').fontSize(10);
        const customerInfoY = 165;
        doc.text(orderData.profiles.full_name, 40, customerInfoY);
        doc.text(`${deliveryAddress.street}, ${deliveryAddress.city}`, 40, customerInfoY + 12);
        doc.text(`${deliveryAddress.state} - ${deliveryAddress.zip}`, 40, customerInfoY + 24);
        doc.text(`Email: ${orderData.profiles.email}`, 40, customerInfoY + 36);
        doc.text(`GSTIN: ${orderData.gst_info || 'N/A'}`, 40, customerInfoY + 48);
        doc.text(`Phone: ${orderData.profiles.phone_number}`, 40, customerInfoY + 60);
      };

      const drawInvoiceTable = () => {
        const tableTop = 270;
        doc.font('Helvetica-Bold');
        doc.fontSize(10)
           .text('Description', 50, tableTop)
           .text('Taxable Amount', 280, tableTop, { width: 90, align: 'right' })
           .text('GST (18%)', 380, tableTop, { width: 90, align: 'right' })
           .text('Total', 470, tableTop, { width: 90, align: 'right' });
        
        doc.moveTo(40, tableTop + 15).lineTo(560, tableTop + 15).stroke();

        const taxableAmount = orderData.final_amount / 1.18;
        const gstAmount = orderData.final_amount - taxableAmount;
        const itemY = tableTop + 25;
        
        doc.font('Helvetica').fontSize(10)
           .text(`Subscription for Digital Advertisement Service - ${orderData.plans.name} Plan (${orderData.locations.name})`, 50, itemY, { width: 230 })
           .text(`Rs. ${taxableAmount.toFixed(2)}`, 280, itemY, { width: 90, align: 'right' })
           .text(`Rs. ${gstAmount.toFixed(2)}`, 380, itemY, { width: 90, align: 'right' })
           .text(`Rs. ${orderData.final_amount.toFixed(2)}`, 470, itemY, { width: 90, align: 'right' });
           
        doc.moveTo(40, itemY + 25).lineTo(560, itemY + 25).stroke();
      };
      
      const drawFooter = () => {
        const grandTotalY = 350;
        doc.font('Helvetica-Bold').fontSize(12)
           .text('Grand Total:', 350, grandTotalY)
           .text(`Rs. ${orderData.final_amount.toFixed(2)}`, 470, grandTotalY, { width: 90, align: 'right' });
           
        doc.fontSize(8).font('Helvetica')
           .text('This is a computer generated invoice and does not require a signature/stamp.', 50, 750, { align: 'center' })
           .text('All rights reserved www.adscreenhub.com', 50, 765, { align: 'center' });
      };

      drawHeader();
      drawCustomerInfo();
      drawInvoiceTable();
      drawFooter();

      doc.end();

    } catch (error) {
      console.error("Failed to generate PDF:", error);
      reject(error);
    }
  });
};

module.exports = { generateInvoicePdfBuffer };         
