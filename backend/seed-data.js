const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sso_project');

const Leave = mongoose.model('Leave', new mongoose.Schema({
    employee: String, type: String, days: Number,
    reason: String, status: String, appliedDate: Date
}));

const Salary = mongoose.model('Salary', new mongoose.Schema({
    employee: String, basic: Number, allowances: Number,
    deductions: Number, net: Number, month: String, year: Number, paid: Boolean
}));

const Project = mongoose.model('Project', new mongoose.Schema({
    name: String, description: String, status: String,
    progress: Number, team: [String], startDate: Date, endDate: Date
}));

async function seed() {
    await Leave.deleteMany({});
    await Salary.deleteMany({});
    await Project.deleteMany({});
    
    // Seed Leaves
    await Leave.insertMany([
        { employee: 'john', type: 'Annual', days: 10, reason: 'Vacation', status: 'approved' },
        { employee: 'sara', type: 'Sick', days: 3, reason: 'Fever', status: 'pending' }
    ]);
    
    // Seed Salaries
    await Salary.insertMany([
        { employee: 'john', basic: 50000, allowances: 10000, deductions: 5000, net: 55000, month: 'January', year: 2025, paid: true },
        { employee: 'sara', basic: 60000, allowances: 12000, deductions: 6000, net: 66000, month: 'January', year: 2025, paid: true }
    ]);
    
    // Seed Projects
    await Project.insertMany([
        { name: 'WSO2 Integration', description: 'Build SSO platform', status: 'active', progress: 75, team: ['john', 'sara'] },
        { name: 'Mobile App', description: 'iOS & Android app', status: 'planning', progress: 20, team: ['john'] }
    ]);
    
    console.log('✅ Data seeded successfully!');
    process.exit();
}

seed();