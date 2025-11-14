const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database/init');



const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✓ Uploads directory created');
}

// Middleware to check if user is a student
function isStudent(req, res, next) {
  if (req.session.userType === 'student') {
    return next();
  }
  res.redirect('/auth/login');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // This now works because folder exists
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, req.session.user.student_number + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname) === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Student dashboard
router.get('/dashboard', isStudent, (req, res) => {
  const studentId = req.session.user.id;

  db.get('SELECT * FROM students WHERE id = ?', [studentId], (err, student) => {
    if (err) return res.status(500).send('Error loading dashboard');

    db.all(`
      SELECT applications.*, job_posts.job_title, job_posts.faculty, 
             job_posts.application_deadline
      FROM applications
      JOIN job_posts ON applications.job_post_id = job_posts.id
      WHERE applications.student_id = ?
      ORDER BY applications.applied_at DESC
    `, [studentId], (err, applications) => {
      if (err) return res.status(500).send('Error loading applications');

      req.session.user = student;
      res.render('students/dashboard', { student, applications });
    });
  });
});

// Student profile page
router.get('/profile', isStudent, (req, res) => {
  const studentId = req.session.user.id;

  db.get('SELECT * FROM students WHERE id = ?', [studentId], (err, student) => {
    if (err) {
      console.error('DB Error:', err);
      return res.status(500).send('Error loading profile');
    }

    if (!student) {
      return res.status(404).send('Student not found');
    }

    // === Calculate Profile Completion Progress ===
    const requiredFields = [
      'first_name',
      'last_name',
      'email',
      'student_number',
      'phone',
      'emergency_contact_name',
      'emergency_contact_phone',
      'emergency_contact_relationship',
      'id_document',
      'proof_of_tax',
      'proof_of_bank',
      'resume',
      'academic_transcript'
    ];

    const filledCount = requiredFields.filter(field => 
      student[field] && student[field].toString().trim() !== ''
    ).length;

    const profileProgress = Math.round((filledCount / requiredFields.length) * 100);

    // Optional: Auto-set profile_complete flag (if you store it in DB)
    const profile_complete = profileProgress === 100;

    // Optional: Update DB (uncomment if you have the column)
    // db.run('UPDATE students SET profile_complete = ? WHERE id = ?', [profile_complete, studentId]);

    // === Render Template ===
    res.render('students/profile', {
      student,
      profileProgress,
      message: null
    });
  });
});

// Update student profile
router.post('/profile/update', isStudent, (req, res) => {
  const studentId = req.session.user.id;
  const { phone, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship } = req.body;

  db.run(
    `UPDATE students SET phone = ?, emergency_contact_name = ?, 
     emergency_contact_phone = ?, emergency_contact_relationship = ?
     WHERE id = ?`,
    [phone, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, studentId],
    function(err) {
      if (err) {
        return res.status(500).send('Error updating profile');
      }
      res.redirect('/students/profile');
    }
  );
});

// Upload documents
router.post('/profile/upload', isStudent, upload.fields([
  { name: 'id_document', maxCount: 1 },
  { name: 'proof_of_tax', maxCount: 1 },
  { name: 'proof_of_bank', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
  { name: 'academic_transcript', maxCount: 1 }
]), (req, res) => {
  const studentId = req.session.user.id;
  const files = req.files;

  let updates = [];
  let values = [];

  if (files.id_document) {
    updates.push('id_document = ?');
    values.push(files.id_document[0].filename);
  }
  if (files.proof_of_tax) {
    updates.push('proof_of_tax = ?');
    values.push(files.proof_of_tax[0].filename);
  }
  if (files.proof_of_bank) {
    updates.push('proof_of_bank = ?');
    values.push(files.proof_of_bank[0].filename);
  }
  if (files.resume) {
    updates.push('resume = ?');
    values.push(files.resume[0].filename);
  }
  if (files.academic_transcript) {
    updates.push('academic_transcript = ?');
    values.push(files.academic_transcript[0].filename);
  }

  if (updates.length === 0) {
    return res.redirect('/students/profile');
  }

  values.push(studentId);

  db.run(
    `UPDATE students SET ${updates.join(', ')} WHERE id = ?`,
    values,
    function(err) {
      if (err) {
        return res.status(500).send('Error uploading documents');
      }

      // Check if profile is complete
      db.get('SELECT * FROM students WHERE id = ?', [studentId], (err, student) => {
        if (err) return res.redirect('/students/profile');

        const isComplete = student.phone && student.emergency_contact_name && 
                          student.emergency_contact_phone && student.id_document && 
                          student.proof_of_tax && student.proof_of_bank && 
                          student.resume && student.academic_transcript;

        if (isComplete) {
          db.run('UPDATE students SET profile_complete = 1 WHERE id = ?', [studentId]);
        }

        res.redirect('/students/profile');
      });
    }
  );
});

module.exports = router;