const express = require('express');
const router = express.Router();
const db = require('../database/init');
const { getTranscriptSummary } = require('../utils/transcriptParser');

function isStudent(req, res, next) {
  if (req.session.userType === 'student') return next();
  res.redirect('/auth/login');
}

router.post('/apply/:jobId', isStudent, async (req, res) => {
  const jobId = req.params.jobId;
  const studentId = req.session.user.id;

  try {
    db.get('SELECT * FROM students WHERE id = ?', [studentId], async (err, student) => {
      if (err) return res.status(500).send('Error checking profile');
      if (!student || !student.profile_complete) return res.status(400).send('Please complete your profile before applying');
      db.get('SELECT * FROM job_posts WHERE id = ?', [jobId], async (err, job) => {
        if (err || !job) return res.status(404).send('Job not found');
        const currentDate = new Date().toISOString().split('T')[0];
        if (job.application_deadline < currentDate) return res.status(400).send('Application deadline has passed');
        db.get(
          'SELECT * FROM applications WHERE student_id = ? AND job_post_id = ?',
          [studentId, jobId],
          async (err, existing) => {
            if (existing) return res.status(400).send('You have already applied for this job');

            // NEW: multi-year and overall parsing
            let overallAverage = null, allYearSubjects = null, transcriptParsed = 0, aiSummary = null, thirdYearAverage = null;

            if (student.academic_transcript) {
              try {
                console.log(`📄 Parsing transcript (all years) for student ${student.student_number}...`);
                const result = await getTranscriptSummary(student.academic_transcript);
                if (result.success) {
                  overallAverage = result.overall_average;
                  allYearSubjects = JSON.stringify(result.years); // saves all years & per-year averages
                  aiSummary = JSON.stringify(result.summary);     // full response for dashboards
                  transcriptParsed = 1;

                  // Optionally extract 3rd-year average for backward compatibility/filtering
                  const thirdYearObj = (result.years||[]).find(y => y.year.includes('2023') || y.year.includes('3'));
                  if (thirdYearObj && typeof thirdYearObj.average === 'number') {
                    thirdYearAverage = thirdYearObj.average;
                  }
                } else {
                  console.log(`⚠ Transcript parsing failed: ${result.error}`);
                }
              } catch (err) {
                console.log(`⚠ Parse error: ${err.message}`);
              }
            }

            db.run(
              `INSERT INTO applications (student_id, job_post_id, overall_average, all_year_subjects, ai_summary, third_year_average, transcript_parsed)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [studentId, jobId, overallAverage, allYearSubjects, aiSummary, thirdYearAverage, transcriptParsed],
              function(err) {
                if (err) {
                  console.error('DB error:', err);
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
