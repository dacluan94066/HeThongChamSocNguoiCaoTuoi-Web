const nodemailer = require('nodemailer');

let transporter;

const getTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    const error = new Error('Chua cau hinh EMAIL_USER va EMAIL_APP_PASSWORD');
    error.statusCode = 503;
    throw error;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD.replace(/\s/g, ''),
      },
    });
  }

  return transporter;
};

const sendMail = async ({ to, subject, html }) => {
  const mailer = getTransporter();
  return mailer.sendMail({
    from: process.env.EMAIL_FROM || `CareSenior <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

module.exports = { sendMail };
