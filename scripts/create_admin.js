// Creates an admin user directly in the database.
// Usage: node scripts/create_admin.js <email>
// The account is created with a temporary password (printed on success).
// Sign in normally, then update your password and profile from the app.

import bcrypt from "bcryptjs";
import mysql from "mysql";
import dotenv from "dotenv";

dotenv.config();

const email = process.argv[2];

if (!email) {
    console.error("Usage: node scripts/create_admin.js <email>");
    process.exit(1);
}

const TEMP_PASSWORD = "Admin1234!";

const db = mysql.createConnection({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset:  process.env.DB_CHARSET,
});

db.connect((err) => {
    if (err) {
        console.error("Could not connect to database:", err.message);
        process.exit(1);
    }

    // Reject if email is already registered
    db.query("SELECT id FROM users WHERE email = ?", [email], (err, data) => {
        if (err) { console.error(err); db.end(); process.exit(1); }
        if (data.length > 0) {
            console.error(`A user with email "${email}" already exists.`);
            db.end();
            process.exit(1);
        }

        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(TEMP_PASSWORD, salt);

        // Derive a username from the email local-part (e.g. "admin" from "admin@example.com")
        const username = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");

        const q = "INSERT INTO users (`username`, `email`, `password`, `account_type`, `is_admin`) VALUES (?)";
        const values = [username, email, hashedPassword, "admin", true];

        db.query(q, [values], (err, result) => {
            if (err) { console.error("Insert failed:", err.message); db.end(); process.exit(1); }

            console.log("─────────────────────────────────────────");
            console.log("Admin user created successfully.");
            console.log(`  ID:       ${result.insertId}`);
            console.log(`  Email:    ${email}`);
            console.log(`  Username: ${username}`);
            console.log(`  Password: ${TEMP_PASSWORD}  ← change this after first login`);
            console.log("─────────────────────────────────────────");

            db.end();
        });
    });
});
