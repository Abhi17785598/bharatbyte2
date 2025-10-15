import express from 'express';
import cors from 'cors';
import multer from 'multer';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// Multer in-memory storage for attachments
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Transporter
function buildTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration missing. Please set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function toArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function fileToAttachment(f) {
  return {
    filename: f.originalname,
    content: f.buffer,
    contentType: f.mimetype || 'application/octet-stream',
  };
}

function buildHtmlFromFields(fields) {
  const rows = Object.entries(fields).map(([k, v]) => {
    const val = Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v));
    return `<tr><td style="padding:6px 10px;border:1px solid #eee;font-weight:600">${k}</td><td style="padding:6px 10px;border:1px solid #eee">${val}</td></tr>`;
  }).join('');
  return `
    <div style="font-family:Inter,Arial,sans-serif">
      <h2 style="margin:0 0 8px 0">New Form Submission</h2>
      <table style="border-collapse:collapse;border:1px solid #eee">${rows}</table>
    </div>
  `;
}

// Partner With Us endpoint (text-only, but supports optional attachments as 'attachments')
app.post('/api/partner', upload.any(), async (req, res) => {
  try {
    const transporter = buildTransporter();

    // Collect fields
    const { name = '', email = '', organisation = '', enquiry = '' } = req.body || {};

    const fields = {
      form: 'Partner With Us',
      name,
      email,
      organisation,
      enquiry,
      submitted_at: new Date().toISOString(),
      ip: req.ip,
    };

    const attachments = (req.files || [])?.map(fileToAttachment);

    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.MAIL_TO || process.env.SMTP_USER,
      subject: `Partner enquiry from ${name || organisation || email || 'Unknown'}`,
      html: buildHtmlFromFields(fields),
      attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    console.error('PARTNER SEND ERROR', err);
    res.status(500).json({ ok: false, error: err.message || 'Send failed' });
  }
});

// Apply Now endpoint with multiple attachments
// Expected file field names: pitch_deck, dpiit_certificate, ip_files (multi), balance_sheets
const applyUpload = upload.fields([
  { name: 'pitch_deck', maxCount: 10 },
  { name: 'dpiit_certificate', maxCount: 10 },
  { name: 'ip_files', maxCount: 20 },
  { name: 'balance_sheets', maxCount: 10 },
]);

app.post('/api/apply', applyUpload, async (req, res) => {
  try {
    const transporter = buildTransporter();

    const body = req.body || {};
    const mode = body.mode || 'startup';
    const subject = body.subject || (mode === 'startup' ? `Application: ${body.startupName || body.organisation || ''}` : 'Application: Individual');

    // Combine known fields; include all body by default
    const fields = { ...body, form: 'Apply Now', submitted_at: body.submitted_at || new Date().toISOString(), ip: req.ip };

    // Collect attachments from known fields
    const files = [];
    const push = (arr) => { if (arr?.length) files.push(...arr); };
    push(req.files?.pitch_deck);
    push(req.files?.dpiit_certificate);
    push(req.files?.ip_files);
    push(req.files?.balance_sheets);

    // Also include any other uploaded files
    const otherAny = Object.values(req.files || {}).flat();
    const allFiles = otherAny.length ? otherAny : [];

    const attachments = toArray(allFiles).map(fileToAttachment);

    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.MAIL_TO || process.env.SMTP_USER,
      subject,
      html: buildHtmlFromFields(fields),
      attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    console.error('APPLY SEND ERROR', err);
    res.status(500).json({ ok: false, error: err.message || 'Send failed' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

export default app;
