const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'jobconnect.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Students table
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_number TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT,
    id_document TEXT,
    proof_of_tax TEXT,
    proof_of_bank TEXT,
    resume TEXT,
    academic_transcript TEXT,
    profile_complete INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Faculty admins table
  db.run(`CREATE TABLE IF NOT EXISTS faculty_admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_number TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    faculty TEXT NOT NULL,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Job posts table
  db.run(`CREATE TABLE IF NOT EXISTS job_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    faculty_admin_id INTEGER NOT NULL,
    job_title TEXT NOT NULL,
    faculty TEXT NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT NOT NULL,
    application_deadline DATE NOT NULL,
    date_posted DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (faculty_admin_id) REFERENCES faculty_admins(id)
  )`);

  // Applications table - UPDATED with transcript fields
  db.run(`CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    job_post_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    third_year_average REAL,
    third_year_subjects TEXT,
    transcript_parsed INTEGER DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (job_post_id) REFERENCES job_posts(id),
    UNIQUE(student_id, job_post_id)
  )`);

  console.log('Database tables created successfully');
});

module.exports = db;