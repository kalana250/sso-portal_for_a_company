const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/sso_project')
    .then(() => console.log('✅ MongoDB Connected - HR'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// Leave Schema
const leaveSchema = new mongoose.Schema({
    employee: String,
    type: String,
    days: Number,
    reason: String,
    status: { type: String, default: 'pending' },
    appliedDate: { type: Date, default: Date.now }
});

const Leave = mongoose.model('Leave', leaveSchema);

// Attendance Schema
const attendanceSchema = new mongoose.Schema({
    employee: String,
    date: Date,
    checkIn: String,
    checkOut: String,
    status: String
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

// ============ ROUTES ============

// Get All Leaves
app.get('/leaves', async (req, res) => {
    try {
        const leaves = await Leave.find().sort({ appliedDate: -1 });
        res.json({ success: true, data: leaves });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get User's Leaves
app.get('/leaves/:employee', async (req, res) => {
    try {
        const leaves = await Leave.find({ employee: req.params.employee });
        res.json({ success: true, data: leaves });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Apply Leave
app.post('/leaves', async (req, res) => {
    try {
        const leave = new Leave(req.body);
        await leave.save();
        res.json({ success: true, message: 'Leave applied successfully', data: leave });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update Leave Status
app.put('/leaves/:id', async (req, res) => {
    try {
        const leave = await Leave.findByIdAndUpdate(
            req.params.id,
            { status: req.body.status },
            { new: true }
        );
        res.json({ success: true, data: leave });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get Attendance
app.get('/attendance/:employee', async (req, res) => {
    try {
        const records = await Attendance.find({ employee: req.params.employee });
        const present = records.filter(r => r.status === 'present').length;
        const absent = records.filter(r => r.status === 'absent').length;
        const late = records.filter(r => r.status === 'late').length;
        
        res.json({
            success: true,
            data: { present, absent, late, total: records.length, records }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Mark Attendance
app.post('/attendance', async (req, res) => {
    try {
        const attendance = new Attendance(req.body);
        await attendance.save();
        res.json({ success: true, data: attendance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(3001, () => {
    console.log('🚀 HR API running on http://localhost:3001');
});