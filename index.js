import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "data.json");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({ storage });

// Helper to read data
function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return { blogs: [], careers: [], applications: [] };
  }
}

// Helper to write data
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

const JWT_SECRET = process.env.JWT_SECRET || "fallback_super_secret_key";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });
  
  const token = authHeader.split(" ")[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Invalid token" });
    next();
  });
}

const app = express();
const PORT = process.env.PORT || 3001;

/* ── Middleware ─────────────────────────────────────────── */
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        process.env.ALLOWED_ORIGIN,
        "http://localhost:8080",
        "http://localhost:5173"
      ];
      // Allow if no origin (like Postman), or if it matches allowed ones, or if ALLOWED_ORIGIN is "*"
      if (!origin || allowedOrigins.includes(origin) || process.env.ALLOWED_ORIGIN === "*") {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ── SMTP Transporter ──────────────────────────────────── */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true, // SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verified connection is removed because Serverless platforms (like Vercel) 
// will time out and crash if we try to verify the SMTP connection on every cold boot.

/* ── HTML Email Builder ────────────────────────────────── */
function buildConfirmationEmail(data) {
  const {
    name = "there",
    email,
    phone,
    company,
    date,
    timeSlot,
    service,
    meetLink,
  } = data;

  const meetURL = meetLink || process.env.DEFAULT_MEET_LINK || "#";
  const appointmentDate = date || "To be confirmed";
  const appointmentTime = timeSlot || "To be confirmed";
  const serviceName = Array.isArray(service) ? service.join(", ") : service || "General Consultation";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Appointment Confirmation – TechSolvent</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6fb; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb; padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0D2E8C 0%, #165DFB 100%); padding:40px 40px 30px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:28px; font-weight:800; letter-spacing:-0.5px;">
                ✅ Appointment Confirmed!
              </h1>
              <p style="margin:10px 0 0; color:rgba(255,255,255,0.85); font-size:15px;">
                Thank you for choosing TechSolvent, ${name}.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 20px;">
              <p style="margin:0 0 20px; color:#333; font-size:15px; line-height:1.7;">
                We're excited to connect with you! Here are your appointment details:
              </p>

              <!-- Details Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8faff; border-radius:12px; border:1px solid #e5eaf5;">
                <tr>
                  <td style="padding:24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0; color:#6b7280; font-size:13px; width:140px; vertical-align:top;">📅 Date</td>
                        <td style="padding:8px 0; color:#111827; font-size:14px; font-weight:600;">${appointmentDate}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0; color:#6b7280; font-size:13px; vertical-align:top;">🕐 Time</td>
                        <td style="padding:8px 0; color:#111827; font-size:14px; font-weight:600;">${appointmentTime}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0; color:#6b7280; font-size:13px; vertical-align:top;">🎯 Service</td>
                        <td style="padding:8px 0; color:#111827; font-size:14px; font-weight:600;">${serviceName}</td>
                      </tr>
                      ${company ? `
                      <tr>
                        <td style="padding:8px 0; color:#6b7280; font-size:13px; vertical-align:top;">🏢 Company</td>
                        <td style="padding:8px 0; color:#111827; font-size:14px; font-weight:600;">${company}</td>
                      </tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Meet Link Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
                <tr>
                  <td align="center">
                    <a href="${meetURL}" target="_blank" style="display:inline-block; background:linear-gradient(135deg, #0D2E8C 0%, #165DFB 100%); color:#ffffff; text-decoration:none; padding:16px 40px; border-radius:12px; font-size:16px; font-weight:700; letter-spacing:0.3px;">
                      🔗 Join Google Meet
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:10px;">
                    <p style="margin:0; color:#9ca3af; font-size:12px;">
                      Click the button above to join the meeting at the scheduled time.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none; border-top:1px solid #e5e7eb; margin:10px 0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 36px; text-align:center;">
              <p style="margin:0 0 6px; color:#6b7280; font-size:13px;">
                Need to reschedule? Reply to this email or call us.
              </p>
              <p style="margin:0 0 16px; color:#6b7280; font-size:13px;">
                📞 +91 77720 22077 &nbsp;|&nbsp; ✉️ astitva@techsolvent.in
              </p>
              <p style="margin:0; color:#9ca3af; font-size:11px;">
                © ${new Date().getFullYear()} TechSolvent — India's AI Marketing Agency
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ── Sitemap Generation ────────────────────────────────── */
app.get("/sitemap.xml", (req, res) => {
  const data = readData();
  const frontendUrl = process.env.FRONTEND_URL || "https://techsolvent.in";
  
  const staticPages = ["", "/about", "/services", "/blog", "/career"];
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  // Static pages
  staticPages.forEach(page => {
    xml += `  <url>\n`;
    xml += `    <loc>${frontendUrl}${page}</loc>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>${page === "" ? "1.0" : "0.8"}</priority>\n`;
    xml += `  </url>\n`;
  });

  // Dynamic Blog pages
  if (data.blogs && Array.isArray(data.blogs)) {
    data.blogs.forEach(blog => {
      xml += `  <url>\n`;
      xml += `    <loc>${frontendUrl}/blog/${blog.id}</loc>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    });
  }

  xml += `</urlset>`;

  res.header("Content-Type", "application/xml");
  res.send(xml);
});

/* ── Admin Auth & Dynamic API ──────────────────────────── */
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
    return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, error: "Invalid credentials" });
});

app.post("/api/upload", authenticateAdmin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `https://techsolvent.techsolvent.cloud/uploads/${req.file.filename}`;
  res.json({ success: true, url });
});

/* Blogs API */
app.get("/api/blogs", (req, res) => res.json(readData().blogs));

app.post("/api/blogs", authenticateAdmin, (req, res) => {
  const data = readData();
  const newBlog = { id: Date.now().toString(), ...req.body };
  data.blogs.unshift(newBlog); // add to top
  writeData(data);
  res.json({ success: true, blog: newBlog });
});

app.put("/api/blogs/:id", authenticateAdmin, (req, res) => {
  const data = readData();
  const index = data.blogs.findIndex(b => b.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  data.blogs[index] = { ...data.blogs[index], ...req.body };
  writeData(data);
  res.json({ success: true, blog: data.blogs[index] });
});

app.delete("/api/blogs/:id", authenticateAdmin, (req, res) => {
  const data = readData();
  data.blogs = data.blogs.filter(b => b.id !== req.params.id);
  writeData(data);
  res.json({ success: true });
});

/* Careers API */
app.get("/api/careers", (req, res) => res.json(readData().careers));

app.post("/api/careers", authenticateAdmin, (req, res) => {
  const data = readData();
  const newCareer = { id: Date.now().toString(), ...req.body };
  data.careers.push(newCareer);
  writeData(data);
  res.json({ success: true, career: newCareer });
});

app.put("/api/careers/:id", authenticateAdmin, (req, res) => {
  const data = readData();
  const index = data.careers.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  data.careers[index] = { ...data.careers[index], ...req.body };
  writeData(data);
  res.json({ success: true, career: data.careers[index] });
});

app.delete("/api/careers/:id", authenticateAdmin, (req, res) => {
  const data = readData();
  data.careers = data.careers.filter(c => c.id !== req.params.id);
  writeData(data);
  res.json({ success: true });
});

/* ── API Endpoint ──────────────────────────────────────── */
app.post("/api/send-confirmation", async (req, res) => {
  const { name, email, phone, company, date, timeSlot, service, meetLink } = req.body;

  // Validate required fields
  if (!email) {
    return res.status(400).json({ success: false, error: "Email is required." });
  }

  try {
    const html = buildConfirmationEmail(req.body);

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: `Your Appointment is Confirmed – TechSolvent 🎉`,
      html,
    });

    console.log(`✅ Confirmation email sent to ${email}`);
    res.json({ success: true, message: "Confirmation email sent!" });
  } catch (err) {
    console.error("❌ Email error:", err.message);
    res.status(500).json({ success: false, error: "Failed to send email. Please try again." });
  }
});

/* ── Job Application Endpoint ──────────────────────────── */
app.post("/api/apply-job", upload.single("resume"), async (req, res) => {
  const { name, email, phone, linkedin, position, coverLetter } = req.body;
  const resume = req.file;

  if (!email || !name || !position) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  const data = readData();
  if (!data.applications) data.applications = [];

  const resumeUrl = resume ? `https://techsolvent.techsolvent.cloud/uploads/${resume.filename}` : null;
  const newApp = {
    id: Date.now().toString(),
    name,
    email,
    phone,
    linkedin,
    position,
    coverLetter,
    resumeUrl,
    appliedAt: new Date().toISOString(),
  };

  data.applications.unshift(newApp); // Add to top
  writeData(data);

  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || email,
      to: process.env.SMTP_USER, // send to admin
      subject: `New Job Application: ${name} for ${position}`,
      text: `You have received a new job application!

Position: ${position}
Name: ${name}
Email: ${email}
Phone: ${phone || 'N/A'}
LinkedIn: ${linkedin || 'N/A'}

Cover Letter:
${coverLetter || 'None provided.'}`,
      attachments: []
    };

    if (resume) {
      mailOptions.attachments.push({
        filename: resume.originalname,
        path: resume.path
      });
    }

    await transporter.sendMail(mailOptions);

    console.log(`✅ Job application from ${email} sent to admin.`);
    res.json({ success: true, message: "Application submitted successfully!" });
  } catch (err) {
    console.error("❌ Job application email error:", err.message);
    res.status(500).json({ success: false, error: "Failed to submit application. Please try again." });
  }
});

/* ── Applications API (Admin) ──────────────────────────── */
app.get("/api/applications", authenticateAdmin, (req, res) => {
  const data = readData();
  res.json(data.applications || []);
});

app.delete("/api/applications/:id", authenticateAdmin, (req, res) => {
  const data = readData();
  if (!data.applications) data.applications = [];
  data.applications = data.applications.filter(a => a.id !== req.params.id);
  writeData(data);
  res.json({ success: true });
});

/* ── Health Check ──────────────────────────────────────── */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* ── Test API ──────────────────────────────────────────── */
app.get("/api/test", (req, res) => {
  res.json({ 
    success: true,
    message: "Test API is working perfectly! 🚀", 
    timestamp: new Date().toISOString(),
    corsOrigin: process.env.ALLOWED_ORIGIN || "Not set",
    smtpStatus: process.env.SMTP_USER ? "Configured" : "Missing"
  });
});

/* ── Start ─────────────────────────────────────────────── */
// Vercel Serverless Functions don't need app.listen()
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`🚀 TechSolvent Email Server running on port ${PORT}`);
  });
}

// Export for Vercel
export default app;
