const express = require('express');
const router = express.Router();
const db = require('../database/init');

// Middleware to check if user is faculty
function isFaculty(req, res, next) {
  if (req.session.userType === 'faculty') {
    return next();
  }
  res.redirect('/auth/login');
}

// Faculty dashboard
router.get('/dashboard', isFaculty, (req, res) => {
  const facultyId = req.session.user.id;

  // Get all job posts by this faculty member
  db.all(
    'SELECT * FROM job_posts WHERE faculty_admin_id = ? ORDER BY date_posted DESC',
    [facultyId],
    (err, jobs) => {
      if (err) {
        return res.status(500).send('Error loading dashboard');
      }
      res.render('faculty/dashboard', { jobs });
    }
  );
});

// Create job post page
router.get('/jobs/create', isFaculty, (req, res) => {
  res.render('faculty/create-job', { error: null });
});

// Create job post
router.post('/jobs/create', isFaculty, (req, res) => {
  const { job_title, faculty, description, requirements, application_deadline } = req.body;
  const facultyId = req.session.user.id;

  db.run(
    `INSERT INTO job_posts (faculty_admin_id, job_title, faculty, description, requirements, application_deadline)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [facultyId, job_title, faculty, description, requirements, application_deadline],
    function(err) {
      if (err) {
        return res.render('faculty/create-job', { error: 'Error creating job post' });
      }
      res.redirect('/faculty/dashboard');
    }
  );
});

// Edit job post page
router.get('/jobs/edit/:id', isFaculty, (req, res) => {
  const jobId = req.params.id;
  const facultyId = req.session.user.id;

  db.get(
    'SELECT * FROM job_posts WHERE id = ? AND faculty_admin_id = ?',
    [jobId, facultyId],
    (err, job) => {
      if (err || !job) {
        return res.status(404).send('Job not found');
      }
      res.render('faculty/edit-job', { job, error: null });
    }
  );
});

// Update job post
router.post('/jobs/edit/:id', isFaculty, (req, res) => {
  const jobId = req.params.id;
  const facultyId = req.session.user.id;
  const { job_title, faculty, description, requirements, application_deadline, is_active } = req.body;

  db.run(
    `UPDATE job_posts SET job_title = ?, faculty = ?, description = ?, 
     requirements = ?, application_deadline = ?, is_active = ?
     WHERE id = ? AND faculty_admin_id = ?`,
    [job_title, faculty, description, requirements, application_deadline, is_active ? 1 : 0, jobId, facultyId],
    function(err) {
      if (err) {
        return res.status(500).send('Error updating job');
      }
      res.redirect('/faculty/dashboard');
    }
  );
});

// Delete job post
router.post('/jobs/delete/:id', isFaculty, (req, res) => {
  const jobId = req.params.id;
  const facultyId = req.session.user.id;

  db.run(
    'DELETE FROM job_posts WHERE id = ? AND faculty_admin_id = ?',
    [jobId, facultyId],
    function(err) {
      if (err) {
        return res.status(500).send('Error deleting job');
      }
      res.redirect('/faculty/dashboard');
    }
  );
});

// View applicants for a job
router.get('/jobs/:id/applicants', isFaculty, (req, res) => {
  const jobId = req.params.id;
  const facultyId = req.session.user.id;

  // First verify this job belongs to this faculty member
  db.get(
    'SELECT * FROM job_posts WHERE id = ? AND faculty_admin_id = ?',
    [jobId, facultyId],
    (err, job) => {
      if (err || !job) {
        return res.status(404).send('Job not found');
      }

      // Get only qualified applicants
      db.all(`
        SELECT applications.*, students.student_number, students.first_name, 
               students.last_name, students.email, students.phone,
               students.id_document, students.proof_of_tax, students.proof_of_bank,
               students.resume, students.academic_transcript
        FROM applications
        JOIN students ON applications.student_id = students.id
        WHERE applications.job_post_id = ?
          AND applications.third_year_average >= 67
        ORDER BY applications.applied_at DESC
      `, [jobId], (err, applicants) => {
        if (err) {
          return res.status(500).send('Error loading applicants');
        }
        res.render('faculty/applicants', { job, applicants });
      });
    }
  );
});


// Update application status
router.post('/applications/:id/status', isFaculty, (req, res) => {
  const applicationId = req.params.id;
  const { status } = req.body;
  const jobId = req.params.id;

  db.run(
    'UPDATE applications SET status = ? WHERE id = ?',
    [status, applicationId, jobId],
    function(err) {
      if (err) {
        return res.status(500).send('Error updating status');
      }
      res.redirect(`/faculty/jobs/${jobId}/applicants`);
    }
  );
});

// View individual applicant details
router.get('/applicants/:applicationId/details', isFaculty, (req, res) => {
  const applicationId = req.params.applicationId;
  const facultyId = req.session.user.id;
  
  db.get(`
    SELECT 
      applications.*,
      students.*,
      job_posts.job_title,
      job_posts.faculty as job_faculty,
      job_posts.faculty_admin_id
    FROM applications
    JOIN students ON applications.student_id = students.id
    JOIN job_posts ON applications.job_post_id = job_posts.id
    WHERE applications.id = ? AND job_posts.faculty_admin_id = ?
  `, [applicationId, facultyId], (err, applicant) => {
    if (err || !applicant) {
      return res.status(404).send('Applicant not found or you do not have permission to view this application');
    }
    
    res.render('faculty/applicant-details', { applicant });
  });
});

// Faculty profile
router.get('/profile', isFaculty, (req, res) => {
  const facultyId = req.session.user.id;

  db.get('SELECT * FROM faculty_admins WHERE id = ?', [facultyId], (err, faculty) => {
    if (err) {
      return res.status(500).send('Error loading profile');
    }
    res.render('faculty/profile', { faculty, message: null });
  });
});

// Update faculty profile
router.post('/profile/update', isFaculty, (req, res) => {
  const facultyId = req.session.user.id;
  const { first_name, last_name, faculty, phone } = req.body;

  db.run(
    'UPDATE faculty_admins SET first_name = ?, last_name = ?, faculty = ?, phone = ? WHERE id = ?',
    [first_name, last_name, faculty, phone, facultyId],
    function(err) {
      if (err) {
        return res.status(500).send('Error updating profile');
      }
      res.redirect('/faculty/profile');
    }
  );
});

module.exports = router;