// frontend-apps/project-app/app.js
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const https = require('https');
const { renderPage, renderLoginPage, hasRole, hasAnyRole, getUserRoles } = require('../shared/template');

const app = express();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const CONFIG = {
    IS_URL: 'https://localhost:9443',
    CLIENT_ID: 'ox0Q8lGDk3s8ui1bNDRrTDMWZpYa',          
    CLIENT_SECRET: 'JQTjzLgHsVmUwtjHCmSf9_bEzc_eEyus2pJR7QvIaZUa',  
    REDIRECT_URI: 'http://localhost:4003/callback',
    SCOPE: 'openid profile email groups',
    BACKEND_API: 'http://localhost:3003'
};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'project-app-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ============ MIDDLEWARE ============

function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/');
    next();
}

function requireAnyRole(roles) {
    return (req, res, next) => {
        if (!hasAnyRole(req.session.user, roles)) {
            return res.status(403).send(renderPage({
                title: 'Access Denied',
                appName: 'Project App',
                appIcon: '📋',
                appColor: 'orange',
                user: req.session.user,
                roles: getUserRoles(req.session.user),
                content: `
                    <div class="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg p-8 md:p-12 text-center">
                        <div class="text-7xl mb-4">🚫</div>
                        <h1 class="text-3xl font-bold text-red-600 mb-3">Access Denied</h1>
                        <p class="text-gray-600 mb-4">You don't have permission to view this page.</p>
                        <div class="bg-red-50 border border-red-200 rounded-lg p-4 my-6 text-left">
                            <p class="text-sm text-red-700 font-semibold mb-2">Required Role(s):</p>
                            <div class="flex flex-wrap gap-2 mb-4">
                                ${roles.map(r => `
                                    <span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-semibold">${r}</span>
                                `).join('')}
                            </div>
                            <p class="text-sm text-red-700 font-semibold mb-2">Your Role(s):</p>
                            <div class="flex flex-wrap gap-2">
                                ${getUserRoles(req.session.user).length > 0 ? getUserRoles(req.session.user).map(r => `
                                    <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-semibold">${r}</span>
                                `).join('') : '<span class="text-gray-500 text-sm">No roles assigned</span>'}
                            </div>
                        </div>
                        <a href="http://localhost:5500" class="inline-block bg-orange-500 text-white px-8 py-3 rounded-lg font-semibold">
                            <i class="fas fa-home mr-2"></i>Back to Portal
                        </a>
                    </div>
                `,
                currentApp: 'dashboard'
            }));
        }
        next();
    };
}

// ============ ROUTES ============

app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.send(renderLoginPage({
        appName: 'Project Management',
        appIcon: '📋',
        appColor: 'orange'
    }));
});

app.get('/login', (req, res) => {
    const authURL = `${CONFIG.IS_URL}/oauth2/authorize?` +
        `response_type=code&client_id=${CONFIG.CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&` +
        `scope=${encodeURIComponent(CONFIG.SCOPE)}`;
    res.redirect(authURL);
});

// ⭐ FIXED CALLBACK
app.get('/callback', async (req, res) => {
    console.log('\n========== PROJECT APP CALLBACK ==========');
    console.log('Code received:', req.query.code ? 'YES' : 'NO');
    
    if (!req.query.code) {
        return res.send('No authorization code received');
    }

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', req.query.code);
        params.append('redirect_uri', CONFIG.REDIRECT_URI);
        params.append('client_id', CONFIG.CLIENT_ID);
        params.append('client_secret', CONFIG.CLIENT_SECRET);

        const tokenRes = await axios.post(
            `${CONFIG.IS_URL}/oauth2/token`, 
            params, 
            { httpsAgent }
        );

        console.log('✅ Token received');

        const userInfo = await axios.get(
            `${CONFIG.IS_URL}/oauth2/userinfo`, 
            {
                headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
                httpsAgent
            }
        );

        console.log('✅ User Info:', JSON.stringify(userInfo.data, null, 2));

        const userData = userInfo.data;
        
        if (userData.sub && userData.sub.includes('@')) {
            userData.sub = userData.sub.split('@')[0];
        }
        
        if (userData.groups) {
            userData.groups = userData.groups.map(g => 
                g.replace(/^(Application\/|Internal\/|PRIMARY\/)/, '')
            );
        }

        req.session.user = userData;
        req.session.access_token = tokenRes.data.access_token;
        req.session.id_token = tokenRes.data.id_token;
        
        console.log('✅ Login successful for:', userData.sub);
        console.log('===========================================\n');
        
        res.redirect('/dashboard');
        
    } catch (e) {
        console.error('\n========== PROJECT LOGIN ERROR ==========');
        console.error('Message:', e.message);
        console.error('Status:', e.response?.status);
        console.error('Data:', JSON.stringify(e.response?.data, null, 2));
        console.error('==========================================\n');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Login Error</title>
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body class="bg-gray-100 p-8">
                <div class="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
                    <h1 class="text-2xl font-bold text-red-600 mb-4">❌ Login Failed</h1>
                    <p><strong>Error:</strong> ${e.message}</p>
                    <pre class="bg-gray-100 p-4 mt-4 rounded text-sm overflow-auto">${JSON.stringify(e.response?.data || {}, null, 2)}</pre>
                    <a href="/" class="inline-block mt-4 bg-orange-500 text-white px-6 py-2 rounded-lg">← Try Again</a>
                </div>
            </body>
            </html>
        `);
    }
});

// Dashboard
app.get('/dashboard', requireLogin, async (req, res) => {
    try {
        const projectsRes = await axios.get(`${CONFIG.BACKEND_API}/projects`);
        const tasksRes = await axios.get(`${CONFIG.BACKEND_API}/tasks`);
        const userRoles = getUserRoles(req.session.user);
        const isAdmin = hasRole(req.session.user, 'admin-team');

        const content = `
            <div class="mb-8">
                <h1 class="text-3xl md:text-4xl font-bold text-gray-800">Project Dashboard</h1>
                <p class="text-gray-600 mt-2">Welcome, ${req.session.user.sub}! 🚀</p>
                <div class="mt-3 flex flex-wrap gap-2">
                    ${userRoles.map(r => `
                        <span class="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-semibold">
                            <i class="fas fa-user-tag mr-1"></i>${r}
                        </span>
                    `).join('')}
                </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="card-hover bg-white rounded-xl p-4 md:p-6 shadow-md">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">Total Projects</p>
                            <p class="text-2xl md:text-3xl font-bold text-orange-600">${projectsRes.data.data.length}</p>
                        </div>
                        <div class="text-3xl md:text-4xl">📊</div>
                    </div>
                </div>
                <div class="card-hover bg-white rounded-xl p-4 md:p-6 shadow-md">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">Active</p>
                            <p class="text-2xl md:text-3xl font-bold text-green-600">${projectsRes.data.data.filter(p => p.status === 'active').length}</p>
                        </div>
                        <div class="text-3xl md:text-4xl">🟢</div>
                    </div>
                </div>
                <div class="card-hover bg-white rounded-xl p-4 md:p-6 shadow-md">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">Total Tasks</p>
                            <p class="text-2xl md:text-3xl font-bold text-blue-600">${tasksRes.data.data.length}</p>
                        </div>
                        <div class="text-3xl md:text-4xl">✅</div>
                    </div>
                </div>
                <div class="card-hover bg-white rounded-xl p-4 md:p-6 shadow-md">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">Completed</p>
                            <p class="text-2xl md:text-3xl font-bold text-purple-600">${tasksRes.data.data.filter(t => t.status === 'done').length}</p>
                        </div>
                        <div class="text-3xl md:text-4xl">🎯</div>
                    </div>
                </div>
            </div>

            <!-- Projects -->
            <div class="bg-white rounded-2xl shadow-lg p-6 mb-8">
                <h2 class="text-xl md:text-2xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-rocket text-orange-500 mr-2"></i>Active Projects
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${projectsRes.data.data.map(p => `
                        <div class="border-2 border-gray-100 rounded-xl p-5 hover:border-orange-300 hover:shadow-lg transition">
                            <div class="flex items-center justify-between mb-3">
                                <h3 class="text-lg font-bold text-gray-800">${p.name}</h3>
                                <span class="px-3 py-1 rounded-full text-xs font-semibold ${
                                    p.status === 'active' ? 'bg-green-100 text-green-700' :
                                    p.status === 'planning' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-gray-100 text-gray-700'
                                }">${p.status}</span>
                            </div>
                            <div class="mb-3">
                                <div class="flex justify-between text-sm text-gray-600 mb-1">
                                    <span>Progress</span>
                                    <span class="font-semibold">${p.progress}%</span>
                                </div>
                                <div class="bg-gray-200 rounded-full h-2 overflow-hidden">
                                    <div class="bg-gradient-to-r from-orange-500 to-orange-600 h-full" style="width: ${p.progress}%"></div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Tasks -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="bg-white rounded-2xl shadow-lg p-6">
                    <h2 class="text-xl md:text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-plus-circle text-orange-500 mr-2"></i>New Task
                    </h2>
                    <form action="/add-task" method="POST" class="space-y-4">
                        <input type="text" name="title" required placeholder="Task title"
                            class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500">
                        <select name="priority" class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500">
                            <option value="low">Low Priority</option>
                            <option value="medium" selected>Medium Priority</option>
                            <option value="high">High Priority</option>
                        </select>
                        <button type="submit" class="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-3 rounded-lg font-semibold hover:opacity-90">
                            <i class="fas fa-plus mr-2"></i>Add Task
                        </button>
                    </form>
                </div>

                <div class="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6">
                    <h2 class="text-xl md:text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-tasks text-orange-500 mr-2"></i>Recent Tasks
                    </h2>
                    <div class="space-y-3">
                        ${tasksRes.data.data.map(t => `
                            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                                <div class="flex items-center space-x-3">
                                    <input type="checkbox" ${t.status === 'done' ? 'checked' : ''} class="w-5 h-5 text-orange-500">
                                    <div>
                                        <p class="font-semibold text-gray-800 ${t.status === 'done' ? 'line-through' : ''}">${t.title}</p>
                                        <p class="text-xs text-gray-500">${t.priority || 'medium'} priority</p>
                                    </div>
                                </div>
                                <span class="px-3 py-1 rounded-full text-xs font-semibold ${
                                    t.status === 'done' ? 'bg-green-100 text-green-700' :
                                    t.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                                    'bg-gray-100 text-gray-700'
                                }">${t.status}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        res.send(renderPage({
            title: 'Project Dashboard',
            appName: 'Project App',
            appIcon: '📋',
            appColor: 'orange',
            user: req.session.user,
            roles: userRoles,
            content,
            currentApp: 'dashboard'
        }));
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

// Add Task
app.post('/add-task', requireLogin, async (req, res) => {
    try {
        await axios.post(`${CONFIG.BACKEND_API}/tasks`, {
            title: req.body.title,
            priority: req.body.priority,
            assignedTo: req.session.user.sub
        });
        res.redirect('/dashboard');
    } catch (e) {
        res.send('Error: ' + e.message);
    }
});

// Profile
app.get('/profile', requireLogin, (req, res) => {
    const user = req.session.user;
    const userRoles = getUserRoles(user);
    
    const content = `
        <div class="mb-8">
            <h1 class="text-3xl md:text-4xl font-bold text-gray-800">My Profile</h1>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="bg-white rounded-2xl shadow-lg p-6 text-center">
                <div class="w-24 h-24 md:w-32 md:h-32 mx-auto bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-3xl md:text-5xl font-bold mb-4">
                    ${(user.sub || 'U').substring(0, 2).toUpperCase()}
                </div>
                <h2 class="text-xl md:text-2xl font-bold text-gray-800">${user.sub || 'User'}</h2>
                <p class="text-gray-600">${user.email || 'No email'}</p>
                <div class="mt-4 space-y-2">
                    ${userRoles.map(role => `
                        <span class="inline-block bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-semibold">${role}</span>
                    `).join('')}
                </div>
            </div>

            <div class="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6">
                <h3 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-id-card text-orange-500 mr-2"></i>Account Details
                </h3>
                <div class="space-y-4">
                    <div class="flex flex-col md:flex-row md:items-center border-b pb-3">
                        <div class="text-gray-600 md:w-1/3"><i class="fas fa-user mr-2"></i>Username</div>
                        <div class="font-semibold text-gray-800">${user.sub || 'N/A'}</div>
                    </div>
                    <div class="flex flex-col md:flex-row md:items-center border-b pb-3">
                        <div class="text-gray-600 md:w-1/3"><i class="fas fa-envelope mr-2"></i>Email</div>
                        <div class="font-semibold text-gray-800">${user.email || 'N/A'}</div>
                    </div>
                    <div class="flex flex-col md:flex-row md:items-center border-b pb-3">
                        <div class="text-gray-600 md:w-1/3"><i class="fas fa-users mr-2"></i>Roles</div>
                        <div class="font-semibold text-gray-800">${userRoles.join(', ') || 'No roles'}</div>
                    </div>
                </div>
            </div>

            <div class="lg:col-span-3 bg-white rounded-2xl shadow-lg p-6">
                <h3 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-key text-orange-500 mr-2"></i>OIDC Token Information
                </h3>
                <div class="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto">
                    <pre class="text-xs md:text-sm">${JSON.stringify(user, null, 2)}</pre>
                </div>
            </div>
        </div>
    `;

    res.send(renderPage({
        title: 'My Profile',
        appName: 'Project App',
        appIcon: '📋',
        appColor: 'orange',
        user: user,
        roles: userRoles,
        content,
        currentApp: 'profile'
    }));
});

// Logout
app.get('/logout', (req, res) => {
    const idToken = req.session.id_token;
    req.session.destroy(() => {
        res.redirect(`${CONFIG.IS_URL}/oidc/logout?id_token_hint=${idToken}&post_logout_redirect_uri=http://localhost:4003`);
    });
});

app.listen(4003, () => console.log('🚀 Project App on http://localhost:4003'));