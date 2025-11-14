const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../database/init');

// Login page
router.get('/login', (req, res) => {
  res.render('auth/login', { error: null });
});

// Register page
router.get('/register', (req, res) => {
  res.render('auth/register', { error: null });
});

// Student registration
router.post('/register/student', async (req, res) => {
  const { student_number, email, password, first_name, last_name } = req.body;

  try {
    // Validate student number (9 digits)
    if (!/^\d{9}$/.test(student_number)) {
      return res.render('auth/register', { error: 'Student number must be 9 digits' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      `INSERT INTO students (student_number, email, password, first_name, last_name) 
       VALUES (?, ?, ?, ?, ?)`,
      [student_number, email, hashedPassword, first_name, last_name],
      function(err) {
        if (err) {
          return res.render('auth/register', { error: 'Email or student number already exists' });
        }
        res.redirect('/auth/login');
      }
    );
  } catch (error) {
    res.render('auth/register', { error: 'Registration failed' });
  }
});

// Faculty registration
router.post('/register/faculty', async (req, res) => {
  const { staff_number, email, password, first_name, last_name, faculty, phone } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      `INSERT INTO faculty_admins (staff_number, email, password, first_name, last_name, faculty, phone) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [staff_number, email, hashedPassword, first_name, last_name, faculty, phone],
      function(err) {
        if (err) {
          return res.render('auth/register', { error: 'Email or staff number already exists' });
        }
        res.redirect('/auth/login');
      }
    );
  } catch (error) {
    res.render('auth/register', { error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password, userType } = req.body;

  const table = userType === 'student' ? 'students' : 'faculty_admins';

  db.get(`SELECT * FROM ${table} WHERE email = ?`, [email], async (err, user) => {
    if (err || !user) {
      return res.render('auth/login', { error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('auth/login', { error: 'Invalid credentials' });
    }

    req.session.user = user;
    req.session.userType = userType;

    if (userType === 'student') {
      res.redirect('/students/dashboard');
    } else {
      res.redirect('/faculty/dashboard');
    }
  });
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;