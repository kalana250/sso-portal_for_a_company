const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Mock Data
const salaryData = {
    basic: 50000,
    allowances: 10000,
    deductions: 5000,
    net: 55000
};

const payslips = [
    { month: "January 2025", amount: 55000 },
    { month: "February 2025", amount: 55000 },
    { month: "March 2025", amount: 56000 }
];

// Routes
app.get('/salary', (req, res) => {
    res.json({ success: true, data: salaryData });
});

app.get('/payslips', (req, res) => {
    res.json({ success: true, data: payslips });
});

app.post('/expenses', (req, res) => {
    console.log('Expense submitted:', req.body);
    res.json({ 
        success: true, 
        message: `Expense of $${req.body.amount} submitted`,
        data: req.body 
    });
});

app.listen(3002, () => {
    console.log('✅ Finance API running on http://localhost:3002');
});