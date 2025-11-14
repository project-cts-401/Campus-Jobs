const express = require('express');
const router = express.Router();
const db = require('../database/init');

router.get('/', (req, res) => {
    // --- 1. Get Filters & Pagination Params ---
    const searchTerm = req.query.search || '';
    const jobType = req.query.category || '';
    const departmentFilter = req.query.department || '';

    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit <= 0) {
        limit = 10; // Default limit
    }

    let currentPage = parseInt(req.query.page, 10);
    if (isNaN(currentPage) || currentPage <= 0) {
        currentPage = 1; // Default to page 1
    }

    const offset = (currentPage - 1) * limit;
    const currentDate = new Date().toISOString().split('T')[0];

    // --- 2. Base SQL parts & Build Conditions ---
    const baseSqlSelect = `
        SELECT j.*, f.first_name, f.last_name
        FROM job_posts j
        JOIN faculty_admins f ON j.faculty_admin_id = f.id
    `;
    const baseSqlCount = `
        SELECT COUNT(*) as count
        FROM job_posts j
        JOIN faculty_admins f ON j.faculty_admin_id = f.id
    `;

    const conditions = [];
    const params = [];

    conditions.push("j.is_active = ?");
    params.push(1);

    conditions.push("j.application_deadline >= ?");
    params.push(currentDate);

    if (searchTerm) {
        conditions.push("j.job_title LIKE ?");
        params.push(`%${searchTerm}%`);
    }
    if (jobType) {
        conditions.push("j.job_type = ?");
        params.push(jobType);
    }
    if (departmentFilter) {
        conditions.push("j.faculty = ?");
        params.push(departmentFilter);
    }

    // --- 3. Construct WHERE clause ---
    let whereClause = '';
    if (conditions.length > 0) {
        whereClause = " WHERE " + conditions.join(" AND ");
    }

    // --- 4. Construct Count Query ---
    const countSql = baseSqlCount + whereClause;

    // --- 5. Execute Count Query ---
    db.all(countSql, params, (errCount, countResult) => {
        if (errCount) {
            console.error("DB Error fetching job count:", errCount.message);
            return res.render('jobs/list', {
                jobs: [],
                error: 'Could not retrieve job count at this time.',
                currentPage: 1,
                totalPages: 0,
                limit: limit,
                totalJobs: 0,
                search: searchTerm,
                category: jobType,
                department: departmentFilter,
                user: req.user || null,
                userType: req.user ? req.user.user_type : null
            });
        }

        const totalJobs = countResult ? countResult[0].count : 0;
        const totalPages = Math.ceil(totalJobs / limit);

        if (currentPage > totalPages && totalPages > 0) {
            currentPage = totalPages;
        }

        // --- 6. Construct Jobs Query (with LIMIT/OFFSET) ---
        const jobsSql = baseSqlSelect + whereClause + " ORDER BY j.date_posted DESC LIMIT ? OFFSET ?";
        const currentOffset = (currentPage - 1) * limit;
        const jobsParams = [...params, limit, currentOffset];

        // --- 7. Execute Jobs Query ---
        db.all(jobsSql, jobsParams, (errJobs, jobs) => {
            if (errJobs) {
                console.error("DB Error fetching jobs:", errJobs.message);
                return res.render('jobs/list', {
                    jobs: [],
                    error: 'Could not retrieve jobs at this time.',
                    currentPage: currentPage,
                    totalPages: totalPages,
                    limit: limit,
                    totalJobs: totalJobs,
                    search: searchTerm,
                    category: jobType,
                    department: departmentFilter,
                    user: req.user || null,
                    userType: req.user ? req.user.user_type : null
                });
            }

            // --- 8. Render Template with All Data ---
            res.render('jobs/list', {
                jobs: jobs,
                error: null,
                currentPage: currentPage,
                totalPages: totalPages,
                limit: limit,
                totalJobs: totalJobs,
                search: searchTerm,
                category: jobType,
                department: departmentFilter,
                user: req.user || null,
                userType: req.user ? req.user.user_type : null,
                buildQueryString: (queryParams) => {
                    const currentParams = { 
                        search: searchTerm, 
                        category: jobType, 
                        department: departmentFilter, 
                        limit: limit, 
                        ...queryParams 
                    };
                    Object.keys(currentParams).forEach(key => {
                        if (currentParams[key] === '' || currentParams[key] === null || currentParams[key] === undefined) {
                            delete currentParams[key];
                        }
                    });
                    return new URLSearchParams(currentParams).toString();
                }
            });
        });
    });
});

// Search jobs
router.get('/search', (req, res) => {
  const searchQuery = req.query.q || '';
  const currentDate = new Date().toISOString().split('T')[0];

  db.all(
    `SELECT job_posts.*, faculty_admins.first_name, faculty_admins.last_name
     FROM job_posts
     JOIN faculty_admins ON job_posts.faculty_admin_id = faculty_admins.id
     WHERE job_posts.is_active = 1 
     AND job_posts.application_deadline >= ?
     AND (job_posts.job_title LIKE ? OR job_posts.faculty LIKE ? OR job_posts.description LIKE ?)
     ORDER BY job_posts.date_posted DESC`,
    [currentDate, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`],
    (err, jobs) => {
      if (err) {
        return res.status(500).send('Error searching jobs');
      }
      res.render('jobs/list', { jobs, searchQuery });
    }
  );
});

// View single job details
router.get('/:id', (req, res) => {
  const jobId = req.params.id;

  db.get(
    `SELECT job_posts.*, faculty_admins.first_name, faculty_admins.last_name, faculty_admins.email
     FROM job_posts
     JOIN faculty_admins ON job_posts.faculty_admin_id = faculty_admins.id
     WHERE job_posts.id = ?`,
    [jobId],
    (err, job) => {
      if (err || !job) {
        return res.status(404).send('Job not found');
      }

      // Check if student has already applied
      let hasApplied = false;
      if (req.session.userType === 'student') {
        db.get(
          'SELECT * FROM applications WHERE student_id = ? AND job_post_id = ?',
          [req.session.user.id, jobId],
          (err, application) => {
            hasApplied = !!application;
            res.render('jobs/details', { job, hasApplied });
          }
        );
      } else {
        res.render('jobs/details', { job, hasApplied });
      }
    }
  );
});

module.exports = router;