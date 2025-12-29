const nodemailer = require("nodemailer");

// Optimized transporter configuration for high-volume email delivery
let transporter = null;
let transporterInitialized = false;

/**
 * Initialize and configure the email transporter with optimized settings
 */
function initializeTransporter() {
  if (transporterInitialized) {
    return transporter;
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠️ Email configuration missing - SMTP_USER or SMTP_PASS not set');
    transporterInitialized = true;
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false, // Use TLS (port 587)
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // Optimized settings for high-volume delivery
      pool: true, // Use connection pooling
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 14, // Gmail limit is ~15/sec
      
      // Timeout settings
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      
      // TLS settings
      tls: {
        rejectUnauthorized: false,
      },
      
      // Debug mode
      debug: false,
      logger: false,
    });

    // Verify transporter connection
    transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Email transporter verification failed:', error);
        console.error('Error details:', {
          code: error.code,
          command: error.command,
          response: error.response,
          responseCode: error.responseCode
        });
        transporter = null;
      } else {
        console.log('✅ Email transporter verified and ready');
        console.log('📧 SMTP Configuration:');
        console.log(`   Host: ${process.env.SMTP_HOST || "smtp.gmail.com"}`);
        console.log(`   Port: ${process.env.SMTP_PORT || 587}`);
        console.log(`   User: ${process.env.SMTP_USER}`);
        console.log(`   From: ${process.env.SMTP_FROM || `"CodingGita Support" <${process.env.SMTP_USER}>`}`);
      }
    });

    transporterInitialized = true;
    return transporter;
  } catch (error) {
    console.error('❌ Error creating email transporter:', error);
    transporter = null;
    transporterInitialized = true;
    return null;
  }
}

/**
 * Send email with retry mechanism
 */
async function sendEmail(mailOptions, retries = 3) {
  const transporter = initializeTransporter();
  
  if (!transporter) {
    return {
      success: false,
      error: 'Email transporter not configured',
      message: 'Email service is not available. Please contact administrator.'
    };
  }

  // Set default from address
  if (!mailOptions.from) {
    mailOptions.from = process.env.SMTP_FROM || `"CodingGita Support" <${process.env.SMTP_USER}>`;
  }

  // Retry logic with exponential backoff
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`📧 Sending email (attempt ${attempt}/${retries})...`);
      console.log(`   To: ${mailOptions.to}`);
      console.log(`   Subject: ${mailOptions.subject}`);
      
      const info = await transporter.sendMail(mailOptions);
      
      console.log(`✅ Email sent successfully!`);
      console.log(`   Message ID: ${info.messageId}`);
      console.log(`   Response: ${info.response}`);
      
      return {
        success: true,
        info: info,
        message: 'Email sent successfully'
      };
    } catch (error) {
      lastError = error;
      
      console.error(`❌ Email send attempt ${attempt} failed:`, {
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
        message: error.message
      });
      
      // Don't retry on certain errors
      if (error.code === 'EAUTH' || error.code === 'EENVELOPE') {
        console.error('❌ Authentication or envelope error - not retrying');
        return {
          success: false,
          error: error.message,
          code: error.code,
          message: 'Email authentication or configuration error'
        };
      }

      // Exponential backoff
      if (attempt < retries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.warn(`⚠️ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    code: lastError?.code,
    message: `Failed to send email after ${retries} attempts`
  };
}

/**
 * Send email immediately
 */
async function sendEmailImmediate(to, subject, html, text = null) {
  const mailOptions = {
    to: to,
    subject: subject,
    html: html,
    text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
  };

  return await sendEmail(mailOptions);
}

module.exports = {
  initializeTransporter,
  sendEmail,
  sendEmailImmediate,
  getTransporter: () => initializeTransporter()
};

