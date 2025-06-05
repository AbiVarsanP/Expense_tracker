const express = require('express');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const moment = require('moment');
const bcrypt = require('bcrypt');
const cors = require('cors'); // Add CORS
const app = express();
const port = 3000;

app.use(cors()); // Enable CORS
app.use(express.json());
app.use(express.static('public'));

// MySQL Connection
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Mysql001',
    database: 'expense_tracker'
});

// Nodemailer setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'website2k5@gmail.com',
        pass: 'sxxt opyh kzrq hffm'
    }
});

// OTP Storage
const otps = new Map();

// Initialize Database
async function initDb() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                email VARCHAR(255) PRIMARY KEY,
                password VARCHAR(255),
                verified BOOLEAN DEFAULT FALSE
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS profiles (
                email VARCHAR(255) PRIMARY KEY,
                name VARCHAR(100),
                profile_picture MEDIUMTEXT,
                FOREIGN KEY (email) REFERENCES users(email)
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS expenses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255),
                date DATE,
                category VARCHAR(50),
                amount DECIMAL(10,2),
                description TEXT,
                FOREIGN KEY (email) REFERENCES users(email)
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS budgets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255),
                category VARCHAR(50),
                amount DECIMAL(10,2),
                period VARCHAR(20),
                FOREIGN KEY (email) REFERENCES users(email)
            )
        `);
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// Handle favicon.ico requests
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Test route
app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'Server is running' });
});

// Register User
app.post('/api/register', async (req, res) => {
    console.log('Received request for /api/register:', req.body);
    const { email, password } = req.body;
    try {
        const [existing] = await db.query('SELECT email FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.json({ success: false, message: 'Email already registered' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (email, password, verified) VALUES (?, ?, FALSE)', [email, hashedPassword]);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otps.set(email, otp);
        await transporter.sendMail({
            from: 'website2k5@gmail.com',
            to: email,
            subject: 'Expense Tracker OTP',
            text: `Your OTP for email verification is: ${otp}`
        });
        res.json({ success: true, message: 'OTP sent to email' });
    } catch (error) {
        console.error('Error registering user:', error);
        res.json({ success: false, message: 'Failed to register' });
    }
});

// Verify OTP
app.post('/api/verify-otp', async (req, res) => {
    console.log('Received request for /api/verify-otp:', req.body);
    const { email, otp } = req.body;
    if (otps.get(email) === otp) {
        otps.delete(email);
        await db.query('UPDATE users SET verified = TRUE WHERE email = ?', [email]);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Invalid OTP' });
    }
});

// Login User
app.post('/api/login', async (req, res) => {
    console.log('Received request for /api/login:', req.body);
    const { email, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.json({ success: false, message: 'Email not found' });
        }
        const user = users[0];
        if (!user.verified) {
            return res.json({ success: false, message: 'Email not verified' });
        }
        if (await bcrypt.compare(password, user.password)) {
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Invalid password' });
        }
    } catch (error) {
        console.error('Error logging in:', error);
        res.json({ success: false, message: 'Failed to login' });
    }
});

// Get Profile
app.get('/api/profile', async (req, res) => {
    console.log('Received request for /api/profile:', req.query);
    const { email } = req.query;
    try {
        const [rows] = await db.query('SELECT * FROM profiles WHERE email = ?', [email]);
        res.json(rows[0] || { email, name: '', profile_picture: '' });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.json({ success: false, message: 'Failed to fetch profile' });
    }
});

// Update Profile
app.post('/api/profile', async (req, res) => {
    console.log('Received request for /api/profile:', req.body);
    const { email, name, profile_picture } = req.body;
    try {
        // Validate profile picture
        if (profile_picture && !profile_picture.startsWith('data:image/')) {
            return res.json({ success: false, message: 'Invalid image format' });
        }
        // Limit base64 string size (approx. 5MB)
        if (profile_picture && profile_picture.length > 7 * 1024 * 1024) {
            return res.json({ success: false, message: 'Image size exceeds 5MB limit' });
        }
        await db.query(
            'INSERT INTO profiles (email, name, profile_picture) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, profile_picture = ?',
            [email, name, profile_picture, name, profile_picture]
        );
        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.json({ success: false, message: 'Failed to update profile' });
    }
});

// Set Budget
app.post('/api/set-budget', async (req, res) => {
    console.log('Received request for /api/set-budget:', req.body);
    const { email, category, amount, period } = req.body;
    try {
        await db.query(
            'INSERT INTO budgets (email, category, amount, period) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = ?, period = ?',
            [email, category, amount, period, amount, period]
        );
        res.json({ success: true, message: 'Budget set successfully' });
    } catch (error) {
        console.error('Error setting budget:', error);
        res.json({ success: false, message: 'Failed to set budget' });
    }
});

// Add/Edit Expense
app.post('/api/expense', async (req, res) => {
    console.log('Received request for /api/expense (POST):', req.body);
    const { email, date, category, amount, description } = req.body;
    try {
        await db.query(
            'INSERT INTO expenses (email, date, category, amount, description) VALUES (?, ?, ?, ?, ?)',
            [email, moment(date).format('YYYY-MM-DD'), category, amount, description]
        );
        await checkBudget(email);
        res.json({ success: true, message: 'Expense added successfully' });
    } catch (error) {
        console.error('Error adding expense:', error);
        res.json({ success: false, message: 'Failed to add expense' });
    }
});

app.put('/api/expense', async (req, res) => {
    console.log('Received request for /api/expense (PUT):', req.body);
    const { id, email, date, category, amount, description } = req.body;
    try {
        await db.query(
            'UPDATE expenses SET date = ?, category = ?, amount = ?, description = ? WHERE id = ? AND email = ?',
            [moment(date).format('YYYY-MM-DD'), category, amount, description, id, email]
        );
        await checkBudget(email);
        res.json({ success: true, message: 'Expense updated successfully' });
    } catch (error) {
        console.error('Error updating expense:', error);
        res.json({ success: false, message: 'Failed to update expense' });
    }
});

// Get Expense
app.get('/api/expense/:id', async (req, res) => {
    console.log('Received request for /api/expense/:id:', req.params, req.query);
    const { id } = req.params;
    const { email } = req.query;
    try {
        const [rows] = await db.query('SELECT * FROM expenses WHERE id = ? AND email = ?', [id, email]);
        res.json(rows[0] || {});
    } catch (error) {
        console.error('Error fetching expense:', error);
        res.json({ success: false, message: 'Failed to fetch expense' });
    }
});

// Delete Expense
app.delete('/api/expense/:id', async (req, res) => {
    console.log('Received request for /api/expense/:id (DELETE):', req.params, req.query);
    const { id } = req.params;
    const { email } = req.query;
    try {
        await db.query('DELETE FROM expenses WHERE id = ? AND email = ?', [id, email]);
        await checkBudget(email);
        res.json({ success: true, message: 'Expense deleted successfully' });
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.json({ success: false, message: 'Failed to delete expense' });
    }
});

// Get All Expenses
app.get('/api/expenses', async (req, res) => {
    console.log('Received request for /api/expenses:', req.query);
    const { email } = req.query;
    try {
        const [rows] = await db.query('SELECT * FROM expenses WHERE email = ? ORDER BY date DESC', [email]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.json({ success: false, message: 'Failed to fetch expenses' });
    }
});

// Import GPay Transactions
app.post('/api/import-gpay', async (req, res) => {
    console.log('Received request for /api/import-gpay:', req.body);
    const { email, transactions } = req.body;
    let importedCount = 0;
    try {
        for (const tnx of transactions) {
            if (tnx['Debit Amount'] && !isNaN(tnx['Debit Amount']) && tnx['Txn Date']) {
                const date = moment(tnx['Txn Date'], ['DD/MM/YYYY', 'YYYY-MM-DD'], true);
                if (!date.isValid()) {
                    console.log('Skipping invalid date:', tnx['Txn Date']);
                    continue;
                }
                await db.query(
                    'INSERT INTO expenses (email, date, category, amount, description) VALUES (?, ?, ?, ?, ?)',
                    [email, date.format('YYYY-MM-DD'), 'Other', parseFloat(tnx['Debit Amount']), 'GPay Transaction']
                );
                importedCount++;
            }
        }
        await checkBudget(email);
        res.json({ success: true, message: `Imported ${importedCount} GPay transactions successfully` });
    } catch (error) {
        console.error('Error importing GPay transactions:', error);
        res.json({ success: false, message: 'Failed to import transactions' });
    }
});

// Generate Report
app.get('/api/report', async (req, res) => {
    console.log('Received request for /api/report:', req.query);
    const { email, period } = req.query;
    let dateFilter = '';
    if (period === 'day') dateFilter = 'DATE(date) = CURDATE()';
    else if (period === 'week') dateFilter = 'YEARWEEK(date) = YEARWEEK(CURDATE())';
    else if (period === 'month') dateFilter = 'MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())';
    else if (period === 'year') dateFilter = 'YEAR(date) = YEAR(CURDATE())';

    try {
        const [rows] = await db.query(
            `SELECT category, SUM(amount) as total FROM expenses WHERE email = ? AND ${dateFilter} GROUP BY category`,
            [email]
        );
        if (rows.length === 0) {
            return res.json({ success: true, total: 0, byCategory: {}, chartData: [], message: 'No expenses found for the selected period' });
        }
        const total = rows.reduce((sum, row) => sum + parseFloat(row.total), 0);
        const byCategory = rows.reduce((acc, row) => ({ ...acc, [row.category]: parseFloat(row.total) }), {});
        const chartData = rows.map(row => ({ category: row.category, total: parseFloat(row.total) }));
        res.json({ success: true, total, byCategory, chartData });
    } catch (error) {
        console.error('Error generating report:', error);
        res.json({ success: false, message: 'Failed to generate report' });
    }
});

// Check Budget and Send Alerts
async function checkBudget(email) {
    try {
        const [budgets] = await db.query('SELECT category, amount, period FROM budgets WHERE email = ?', [email]);
        const [monthlyExpenses] = await db.query(
            'SELECT category, SUM(amount) as total FROM expenses WHERE email = ? AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE()) GROUP BY category',
            [email]
        );

        for (const budget of budgets) {
            if (budget.period !== 'monthly') continue;
            const spent = monthlyExpenses.find(exp => exp.category === budget.category)?.total || 0;
            const budgetAmount = parseFloat(budget.amount);
            const threshold = budgetAmount * 0.9;

            if (spent >= budgetAmount) {
                await transporter.sendMail({
                    from: 'website2k5@gmail.com',
                    to: email,
                    subject: `Budget Exceeded Alert: ${budget.category}`,
                    text: `You have exceeded your monthly ${budget.category} budget of ${budgetAmount}. Total spent: ${spent}`
                });
            } else if (spent >= threshold) {
                await transporter.sendMail({
                    from: 'website2k5@gmail.com',
                    to: email,
                    subject: `Budget Warning: ${budget.category}`,
                    text: `You are nearing your monthly ${budget.category} budget of ${budgetAmount}. Total spent: ${spent}`
                });
            }
        }
    } catch (error) {
        console.error('Error checking budget:', error);
    }
}

app.listen(port, async () => {
    await initDb();
    console.log(`Server running on port ${port}`);
});
