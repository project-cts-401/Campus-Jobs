require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const db = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✓ Uploads directory created');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session configuration
app.use(session({
  secret: 'ump-job-connect-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Make user data available to all templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.userType = req.session.userType || null;
  next();
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const studentRoutes = require('./routes/students');
const facultyRoutes = require('./routes/faculty');
const applicationRoutes = require('./routes/applications');

app.use('/auth', authRoutes);
app.use('/jobs', jobRoutes);
app.use('/students', studentRoutes);
app.use('/faculty', facultyRoutes);
app.use('/applications', applicationRoutes);

// Home route
app.get('/', (req, res) => {
  const currentDate = new Date().toISOString().split('T')[0];

  db.all(
    `SELECT job_posts.*, faculty_admins.first_name, faculty_admins.last_name
     FROM job_posts
     JOIN faculty_admins ON job_posts.faculty_admin_id = faculty_admins.id
     WHERE job_posts.is_active = 1 AND job_posts.application_deadline >= ?
     ORDER BY job_posts.date_posted DESC`,
    [currentDate],
    (err, jobs) => {
      if (err) {
        console.error('Error loading jobs:', err);
        // You can still render the index page but with an empty jobs array
        return res.render('index', { jobs: [] });
      }
      res.render('index', { jobs });
    }
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`UMP Job Connect server running on http://localhost:${PORT}`);
});