const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let users = [
    { id: 1, name: "John Smith", role: "employee", email: "john@company.com" },
    { id: 2, name: "Sara Johnson", role: "finance-team", email: "sara@company.com" }
];

app.get('/users', (req, res) => {
    res.json({ success: true, data: users });
});

app.post('/users', (req, res) => {
    const newUser = {
        id: users.length + 1,
        ...req.body
    };
    users.push(newUser);
    res.json({ success: true, message: "User created", data: newUser });
});

app.delete('/users/:id', (req, res) => {
    users = users.filter(u => u.id !== parseInt(req.params.id));
    res.json({ success: true, message: `User ${req.params.id} deleted` });
});

app.listen(3004, () => {
    console.log('✅ Admin API running on http://localhost:3004');
});