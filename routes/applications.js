const express = require('express');
const router = express.Router();
const db = require('../database/init');
const { getThirdYearAverage } = require('../utils/transcriptParser');

// Middleware to check if user is a student
function isStudent(req, res, next) {
  if (req.session.userType === 'student') {
    return next();
  }
  res.redirect('/auth/login');
}

// Apply for a job
router.post('/apply/:jobId', isStudent, async (req, res) => {
  const jobId = req.params.jobId;
  const studentId = req.session.user.id;

  try {
    // Check if profile is complete
    db.get('SELECT * FROM students WHERE id = ?', [studentId], async (err, student) => {
      if (err) {
        return res.status(500).send('Error checking profile');
      }

      if (!student || !student.profile_complete) {
        return res.status(400).send('Please complete your profile before applying');
      }

      // Check if job exists and deadline hasn't passed
      db.get('SELECT * FROM job_posts WHERE id = ?', [jobId], async (err, job) => {
        if (err || !job) {
          return res.status(404).send('Job not found');
        }

        const currentDate = new Date().toISOString().split('T')[0];
        if (job.application_deadline < currentDate) {
          return res.status(400).send('Application deadline has passed');
        }

        // Check if already applied
        db.get(
          'SELECT * FROM applications WHERE student_id = ? AND job_post_id = ?',
          [studentId, jobId],
          async (err, existing) => {
            if (existing) {
              return res.status(400).send('You have already applied for this job');
            }

            // Parse transcript if available
            let thirdYearAverage = null;
            let thirdYearSubjects = null;
            let transcriptParsed = 0;

            if (student.academic_transcript) {
              try {
                console.log(`📄 Parsing transcript for student ${student.student_number}...`);
                const transcriptResult = await getThirdYearAverage(student.academic_transcript);

                if (transcriptResult.success) {
                  thirdYearAverage = transcriptResult.average;
                  thirdYearSubjects = JSON.stringify(transcriptResult.subjects);
                  transcriptParsed = 1;
                  console.log(`✓ Transcript parsed successfully: Average = ${thirdYearAverage}%`);
                } else {
                  console.log(`⚠ Transcript parsing failed: ${transcriptResult.error}`);
                  // Application still continues without transcript data
                }
              } catch (parseError) {
                console.error(`⚠ Transcript parsing error: ${parseError.message}`);
                // Application continues gracefully even if parsing fails
              }
            } else {
              console.log('ℹ No transcript uploaded for this student');
            }

            // Create application with transcript data
            db.run(
              `INSERT INTO applications (student_id, job_post_id, third_year_average, third_year_subjects, transcript_parsed)
               VALUES (?, ?, ?, ?, ?)`,
              [studentId, jobId, thirdYearAverage, thirdYearSubjects, transcriptParsed],
              function(err) {
                if (err) {
                  console.error('Database error:', err);
                  return res.status(500).send('Error submitting application');
                }
                console.log(`✓ Application created for student ${studentId} to job ${jobId}`);
                res.redirect('/students/dashboard');
              }
            );
          }
        );
      });
    });
  } catch (error) {
    console.error('Application error:', error);
    res.status(500).send('Error submitting application');
  }
});

// Withdraw application
router.post('/withdraw/:id', isStudent, (req, res) => {
  const applicationId = req.params.id;
  const studentId = req.session.user.id;

  db.run(
    'DELETE FROM applications WHERE id = ? AND student_id = ?',
    [applicationId, studentId],
    function(err) {
      if (err) {
        console.error('Withdrawal error:', err);
        return res.status(500).send('Error withdrawing application');
      }
      console.log(`✓ Application ${applicationId} withdrawn by student ${studentId}`);
      res.redirect('/students/dashboard');
    }
  );
});

module.exports = router;
