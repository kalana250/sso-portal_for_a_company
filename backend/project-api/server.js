const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://localhost:27017/sso_project')
    .then(() => console.log('✅ MongoDB Connected - Project'));

const projectSchema = new mongoose.Schema({
    name: String,
    description: String,
    status: { type: String, default: 'planning' },
    progress: { type: Number, default: 0 },
    team: [String],
    startDate: Date,
    endDate: Date,
    createdAt: { type: Date, default: Date.now }
});

const taskSchema = new mongoose.Schema({
    title: String,
    description: String,
    assignedTo: String,
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    status: { type: String, default: 'todo' },
    priority: { type: String, default: 'medium' },
    dueDate: Date,
    createdAt: { type: Date, default: Date.now }
});

const Project = mongoose.model('Project', projectSchema);
const Task = mongoose.model('Task', taskSchema);

// ============ ROUTES ============

app.get('/projects', async (req, res) => {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json({ success: true, data: projects });
});

app.post('/projects', async (req, res) => {
    const project = new Project(req.body);
    await project.save();
    res.json({ success: true, data: project });
});

app.get('/tasks', async (req, res) => {
    const tasks = await Task.find().populate('project').sort({ createdAt: -1 });
    res.json({ success: true, data: tasks });
});

app.get('/tasks/user/:user', async (req, res) => {
    const tasks = await Task.find({ assignedTo: req.params.user });
    res.json({ success: true, data: tasks });
});

app.post('/tasks', async (req, res) => {
    const task = new Task(req.body);
    await task.save();
    res.json({ success: true, data: task });
});

app.put('/tasks/:id', async (req, res) => {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: task });
});

app.delete('/tasks/:id', async (req, res) => {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.listen(3003, () => console.log('🚀 Project API on http://localhost:3003'));