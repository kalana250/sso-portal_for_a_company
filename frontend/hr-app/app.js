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
    CLIENT_ID: 'fQ_6PpfAYAk7gVBbLghmc3TteSAa',
    CLIENT_SECRET: 'TXCYHyG_Gy21mhF9AoE96_r_t5GJChI09AKIXfWla78a',
    REDIRECT_URI: 'http://localhost:4001/callback',
    SCOPE: 'openid profile email groups roles internal_login hr_read hr_write',
    BACKEND_API: 'http://localhost:3001'
};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'hr-app-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ============ MIDDLEWARE ============

function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/');
    next();
}

// RBAC Middleware - Allow if user has ANY of the specified roles
function requireAnyRole(roles) {
    return (req, res, next) => {
        if (!hasAnyRole(req.session.user, roles)) {
            return res.status(403).send(renderAccessDenied(req, roles));
        }
        next();
    };
}

// Render Access Denied Page
function renderAccessDenied(req, requiredRoles) {
    const userRoles = getUserRoles(req.session.user);
    return renderPage({
        title: 'Access Denied',
        appName: 'HR App',
        appIcon: '👥',
        appColor: 'blue',
        user: req.session.user,
        roles: userRoles,
        content: `
            <div class="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg p-8 md:p-12 text-center">
                <div class="text-7xl mb-4">🚫</div>
                <h1 class="text-3xl font-bold text-red-600 mb-3">Access Denied</h1>
                <p class="text-gray-600 mb-4">You don't have permission to view this page.</p>
                
                <div class="bg-red-50 border border-red-200 rounded-lg p-4 my-6 text-left">
                    <p class="text-sm text-red-700 font-semibold mb-2">Required Role(s):</p>
                    <div class="flex flex-wrap gap-2 mb-4">
                        ${requiredRoles.map(r => `
                            <span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-semibold">${r}</span>
                        `).join('')}
                    </div>
                    <p class="text-sm text-red-700 font-semibold mb-2">Your Role(s):</p>
                    <div class="flex flex-wrap gap-2">
                        ${userRoles.length > 0 ? userRoles.map(r => `
                            <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-semibold">${r}</span>
                        `).join('') : '<span class="text-gray-500 text-sm">No roles assigned</span>'}
                    </div>
                </div>
                
                <a href="/dashboard" class="inline-block bg-blue-500 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-600">
                    <i class="fas fa-home mr-2"></i>Back to Dashboard
                </a>
            </div>
        `,
        currentApp: 'dashboard'
    });
}

// ============ ROUTES ============

app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.send(renderLoginPage({
        appName: 'HR Application',
        appIcon: '👥',
        appColor: 'blue'
    }));
});

app.get('/login', (req, res) => {
    const authURL = `${CONFIG.IS_URL}/oauth2/authorize?` +
        `response_type=code&client_id=${CONFIG.CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&` +
        `scope=${encodeURIComponent(CONFIG.SCOPE)}`;
    res.redirect(authURL);
});

app.get('/callback', async (req, res) => {
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', req.query.code);
        params.append('redirect_uri', CONFIG.REDIRECT_URI);
        params.append('client_id', CONFIG.CLIENT_ID);
        params.append('client_secret', CONFIG.CLIENT_SECRET);

        const tokenRes = await axios.post(`${CONFIG.IS_URL}/oauth2/token`, params, { httpsAgent });
        const userInfo = await axios.get(`${CONFIG.IS_URL}/oauth2/userinfo`, {
            headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
            httpsAgent
        });

        // Debug: Log user info to see what's available
        console.log('User Info from IS:', JSON.stringify(userInfo.data, null, 2));

        req.session.user = userInfo.data;
        req.session.access_token = tokenRes.data.access_token;
        req.session.id_token = tokenRes.data.id_token;
        res.redirect('/dashboard');
    } catch (e) {
        console.error('Login error:', e.response?.data || e.message);
        res.send('Login failed: ' + JSON.stringify(e.response?.data));
    }
});

// Dashboard - Available to ALL authenticated users
app.get('/dashboard', requireLogin, async (req, res) => {
    try {
        const leavesRes = await axios.get(`${CONFIG.BACKEND_API}/leaves`);
        const userRoles = getUserRoles(req.session.user);
        const isAdmin = hasRole(req.session.user, 'admin-team');
        const isFinance = hasRole(req.session.user, 'finance-team');
        const isEmployee = hasRole(req.session.user, 'employee');

        // Filter leaves based on role
        let displayLeaves = leavesRes.data.data;
        if (isEmployee && !isAdmin && !isFinance) {
            // Employees see only their own leaves
            displayLeaves = displayLeaves.filter(l => l.employee === req.session.user.sub);
        }

        const content = `
            <div class="mb-8">
                <h1 class="text-3xl md:text-4xl font-bold text-gray-800">HR Dashboard</h1>
                <p class="text-gray-600 mt-2">Welcome back, ${req.session.user.sub}! 👋</p>
                <div class="mt-3 flex flex-wrap gap-2">
                    ${userRoles.map(r => `
                        <span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                            <i class="fas fa-user-tag mr-1"></i>${r}
                        </span>
                    `).join('')}
                </div>
            </div>

            <!-- Role-Based Banner -->
            ${isAdmin ? `
                <div class="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-4 rounded-lg mb-6">
                    <p class="font-bold"><i class="fas fa-crown mr-2"></i>Admin Access</p>
                    <p class="text-sm opacity-90">You have full HR management permissions.</p>
                </div>
            ` : isFinance ? `
                <div class="bg-gradient-to-r from-green-500 to-teal-500 text-white p-4 rounded-lg mb-6">
                    <p class="font-bold"><i class="fas fa-check-circle mr-2"></i>Finance Team Access</p>
                    <p class="text-sm opacity-90">You can view all HR data for financial planning.</p>
                </div>
            ` : `
                <div class="bg-gradient-to-r from-blue-500 to-cyan-500 text-white p-4 rounded-lg mb-6">
                    <p class="font-bold"><i class="fas fa-user mr-2"></i>Employee Access</p>
                    <p class="text-sm opacity-90">You can view and manage your own leaves only.</p>
                </div>
            `}

            <!-- Stats Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="card-hover bg-white rounded-xl p-4 md:p-6 shadow-md">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">${isEmployee && !isAdmin ? 'My Leaves' : 'Total Leaves'}</p>
                            <p class="text-2xl md:text-3xl font-bold text-blue-600">${displayLeaves.length}</p>
                        </div>
                        <div class="text-3xl md:text-4xl">📅</div>
                    </div>
                </div>
                <div class="card-hover bg-white rounded-xl p-4 md:p-6 shadow-md">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">Approved</p>
                            <p class="text-2xl md:text-3xl font-bold text-green-600">${displayLeaves.filter(l => l.status === 'approved').length}</p>
                        </div>
                        <div class="text-3xl md:text-4xl">✅</div>
                    </div>
                </div>
                <div class="card-hover bg-white rounded-xl p-4 md:p-6 shadow-md">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">Pending</p>
                            <p class="text-2xl md:text-3xl font-bold text-yellow-600">${displayLeaves.filter(l => l.status === 'pending').length}</p>
                        </div>
                        <div class="text-3xl md:text-4xl">⏳</div>
                    </div>
                </div>
                <div class="card-hover bg-white rounded-xl p-4 md:p-6 shadow-md">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm">Your Role</p>
                            <p class="text-sm md:text-base font-bold text-purple-600">${userRoles[0] || 'Employee'}</p>
                        </div>
                        <div class="text-3xl md:text-4xl">🎯</div>
                    </div>
                </div>
            </div>

            <!-- Apply Leave (All can apply) -->
            <div class="bg-white rounded-2xl shadow-lg p-6 md:p-8 mb-8">
                <h2 class="text-xl md:text-2xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-plus-circle text-blue-500 mr-2"></i>Apply for Leave
                </h2>
                <form action="/apply-leave" method="POST" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <select name="type" required class="px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                        <option value="">Leave Type</option>
                        <option value="Annual">Annual Leave</option>
                        <option value="Sick">Sick Leave</option>
                        <option value="Personal">Personal Leave</option>
                    </select>
                    <input type="number" name="days" placeholder="Number of days" required min="1" max="30"
                        class="px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                    <button type="submit" class="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90">
                        <i class="fas fa-paper-plane mr-2"></i>Apply
                    </button>
                </form>
            </div>

            <!-- Leaves Table -->
            <div class="bg-white rounded-2xl shadow-lg p-6 md:p-8 mb-8">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl md:text-2xl font-bold text-gray-800">
                        <i class="fas fa-list text-blue-500 mr-2"></i>${isEmployee && !isAdmin ? 'My Leave Requests' : 'All Leave Requests'}
                    </h2>
                    ${(isAdmin || isFinance) ? `
                        <span class="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-semibold">
                            <i class="fas fa-eye mr-1"></i>Viewing All Employees
                        </span>
                    ` : ''}
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Employee</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Days</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                                ${isAdmin ? '<th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${displayLeaves.map(l => `
                                <tr class="border-t hover:bg-gray-50">
                                    <td class="px-4 py-3">${l.employee}</td>
                                    <td class="px-4 py-3">${l.type}</td>
                                    <td class="px-4 py-3">${l.days}</td>
                                    <td class="px-4 py-3">
                                        <span class="px-3 py-1 rounded-full text-xs font-semibold ${
                                            l.status === 'approved' ? 'bg-green-100 text-green-700' :
                                            l.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-red-100 text-red-700'
                                        }">${l.status}</span>
                                    </td>
                                    ${isAdmin ? `
                                        <td class="px-4 py-3">
                                            ${l.status === 'pending' ? `
                                                <button class="text-green-600 hover:text-green-800 mr-2" title="Approve">
                                                    <i class="fas fa-check"></i>
                                                </button>
                                                <button class="text-red-600 hover:text-red-800" title="Reject">
                                                    <i class="fas fa-times"></i>
                                                </button>
                                            ` : '-'}
                                        </td>
                                    ` : ''}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Admin-Only Section -->
            ${isAdmin ? `
                <div class="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl p-6 md:p-8 mb-8">
                    <h2 class="text-xl md:text-2xl font-bold text-purple-800 mb-4">
                        <i class="fas fa-crown text-purple-500 mr-2"></i>Admin Tools
                    </h2>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <a href="/manage-employees" class="bg-white p-4 rounded-lg hover:shadow-lg transition border border-purple-200">
                            <i class="fas fa-users-cog text-purple-500 text-2xl mb-2"></i>
                            <h3 class="font-bold text-gray-800">Manage Employees</h3>
                            <p class="text-sm text-gray-600">Add, edit, remove employees</p>
                        </a>
                        <a href="/reports" class="bg-white p-4 rounded-lg hover:shadow-lg transition border border-purple-200">
                            <i class="fas fa-chart-line text-purple-500 text-2xl mb-2"></i>
                            <h3 class="font-bold text-gray-800">View Reports</h3>
                            <p class="text-sm text-gray-600">Analytics and statistics</p>
                        </a>
                        <a href="/settings" class="bg-white p-4 rounded-lg hover:shadow-lg transition border border-purple-200">
                            <i class="fas fa-cog text-purple-500 text-2xl mb-2"></i>
                            <h3 class="font-bold text-gray-800">HR Settings</h3>
                            <p class="text-sm text-gray-600">Configure policies</p>
                        </a>
                    </div>
                </div>
            ` : ''}
        `;

        res.send(renderPage({
            title: 'HR Dashboard',
            appName: 'HR App',
            appIcon: '👥',
            appColor: 'blue',
            user: req.session.user,
            roles: userRoles,
            content,
            currentApp: 'dashboard'
        }));
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

// Admin-Only Routes
app.get('/manage-employees', requireLogin, requireAnyRole(['admin-team']), (req, res) => {
    const userRoles = getUserRoles(req.session.user);
    const content = `
        <div class="mb-8">
            <h1 class="text-3xl md:text-4xl font-bold text-gray-800">
                <i class="fas fa-users-cog text-purple-500 mr-2"></i>Manage Employees
            </h1>
            <p class="text-gray-600 mt-2">Admin-only employee management</p>
        </div>
        <div class="bg-white rounded-2xl shadow-lg p-8">
            <p class="text-gray-600">This is admin-only content. Only users with <strong>admin-team</strong> role can see this page.</p>
        </div>
    `;
    res.send(renderPage({
        title: 'Manage Employees',
        appName: 'HR App',
        appIcon: '👥',
        appColor: 'blue',
        user: req.session.user,
        roles: userRoles,
        content,
        currentApp: 'dashboard'
    }));
});

app.get('/reports', requireLogin, requireAnyRole(['admin-team', 'finance-team']), (req, res) => {
    const userRoles = getUserRoles(req.session.user);
    const content = `
        <div class="mb-8">
            <h1 class="text-3xl md:text-4xl font-bold text-gray-800">
                <i class="fas fa-chart-line text-purple-500 mr-2"></i>HR Reports
            </h1>
            <p class="text-gray-600 mt-2">Available to admin and finance teams</p>
        </div>
        <div class="bg-white rounded-2xl shadow-lg p-8">
            <p class="text-gray-600">Reports page - accessible to <strong>admin-team</strong> and <strong>finance-team</strong>.</p>
        </div>
    `;
    res.send(renderPage({
        title: 'HR Reports',
        appName: 'HR App',
        appIcon: '👥',
        appColor: 'blue',
        user: req.session.user,
        roles: userRoles,
        content,
        currentApp: 'dashboard'
    }));
});

app.get('/settings', requireLogin, requireAnyRole(['admin-team']), (req, res) => {
    const userRoles = getUserRoles(req.session.user);
    const content = `
        <div class="mb-8">
            <h1 class="text-3xl md:text-4xl font-bold text-gray-800">
                <i class="fas fa-cog text-purple-500 mr-2"></i>HR Settings
            </h1>
        </div>
        <div class="bg-white rounded-2xl shadow-lg p-8">
            <p class="text-gray-600">Admin-only settings page.</p>
        </div>
    `;
    res.send(renderPage({
        title: 'Settings',
        appName: 'HR App',
        appIcon: '👥',
        appColor: 'blue',
        user: req.session.user,
        roles: userRoles,
        content,
        currentApp: 'dashboard'
    }));
});

// Apply Leave
app.post('/apply-leave', requireLogin, async (req, res) => {
    try {
        await axios.post(`${CONFIG.BACKEND_API}/leaves`, {
            employee: req.session.user.sub,
            type: req.body.type,
            days: parseInt(req.body.days),
            reason: 'Applied via portal'
        });
        res.redirect('/dashboard');
    } catch (e) {
        res.send('Error: ' + e.message);
    }
});

// Profile Page
app.get('/profile', requireLogin, (req, res) => {
    const user = req.session.user;
    const userRoles = getUserRoles(user);
    
    const content = `
        <div class="mb-8">
            <h1 class="text-3xl md:text-4xl font-bold text-gray-800">My Profile</h1>
            <p class="text-gray-600 mt-2">View your account information</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="bg-white rounded-2xl shadow-lg p-6 text-center">
                <div class="w-24 h-24 md:w-32 md:h-32 mx-auto bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-3xl md:text-5xl font-bold mb-4">
                    ${(user.sub || 'U').substring(0, 2).toUpperCase()}
                </div>
                <h2 class="text-xl md:text-2xl font-bold text-gray-800">${user.sub || 'User'}</h2>
                <p class="text-gray-600">${user.email || 'No email'}</p>
                <div class="mt-4 space-y-2">
                    ${userRoles.map(role => `
                        <span class="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                            ${role}
                        </span>
                    `).join('')}
                </div>
            </div>

            <div class="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6">
                <h3 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-shield-alt text-blue-500 mr-2"></i>Your Permissions
                </h3>
                <div class="space-y-3">
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-gray-700">View HR Dashboard</span>
                        <span class="text-green-600"><i class="fas fa-check-circle"></i> Allowed</span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-gray-700">Apply for Leave</span>
                        <span class="text-green-600"><i class="fas fa-check-circle"></i> Allowed</span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-gray-700">View All Employees</span>
                        <span class="${hasAnyRole(user, ['admin-team', 'finance-team']) ? 'text-green-600' : 'text-red-600'}">
                            <i class="fas ${hasAnyRole(user, ['admin-team', 'finance-team']) ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                            ${hasAnyRole(user, ['admin-team', 'finance-team']) ? 'Allowed' : 'Denied'}
                        </span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-gray-700">Manage Employees</span>
                        <span class="${hasRole(user, 'admin-team') ? 'text-green-600' : 'text-red-600'}">
                            <i class="fas ${hasRole(user, 'admin-team') ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                            ${hasRole(user, 'admin-team') ? 'Allowed' : 'Denied'}
                        </span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-gray-700">Approve/Reject Leaves</span>
                        <span class="${hasRole(user, 'admin-team') ? 'text-green-600' : 'text-red-600'}">
                            <i class="fas ${hasRole(user, 'admin-team') ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                            ${hasRole(user, 'admin-team') ? 'Allowed' : 'Denied'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="lg:col-span-3 bg-white rounded-2xl shadow-lg p-6">
                <h3 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-key text-blue-500 mr-2"></i>OIDC Token Information
                </h3>
                <div class="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto">
                    <pre class="text-xs md:text-sm">${JSON.stringify(user, null, 2)}</pre>
                </div>
            </div>
        </div>
    `;

    res.send(renderPage({
        title: 'My Profile',
        appName: 'HR App',
        appIcon: '👥',
        appColor: 'blue',
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
        res.redirect(`${CONFIG.IS_URL}/oidc/logout?id_token_hint=${idToken}&post_logout_redirect_uri=http://localhost:4001`);
    });
});

app.get('/setup-mfa', requireLogin, (req, res) => {
    const user = req.session.user;
    const userRoles = getUserRoles(user);
    
    const content = `
        <div class="mb-8">
            <h1 class="text-3xl md:text-4xl font-bold text-gray-800">🔐 Multi-Factor Authentication</h1>
            <p class="text-gray-600 mt-2">Secure your account with TOTP</p>
        </div>

        <div class="max-w-3xl mx-auto">
            <!-- Info Card -->
            <div class="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg mb-6">
                <h3 class="text-lg font-bold text-blue-900 mb-2">
                    <i class="fas fa-info-circle mr-2"></i>What is MFA?
                </h3>
                <p class="text-blue-800">
                    Multi-Factor Authentication adds an extra layer of security to your account.
                    Even if your password is stolen, attackers can't access your account without your phone.
                </p>
            </div>

            <!-- Setup Steps -->
            <div class="bg-white rounded-2xl shadow-lg p-8">
                <h2 class="text-2xl font-bold text-gray-800 mb-6">Setup Steps</h2>
                
                <div class="space-y-6">
                    <!-- Step 1 -->
                    <div class="flex items-start space-x-4">
                        <div class="flex-shrink-0 w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                            1
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-gray-800 mb-2">Install an Authenticator App</h3>
                            <p class="text-gray-600 text-sm mb-3">Download one of these apps on your phone:</p>
                            <div class="flex flex-wrap gap-2">
                                <span class="bg-gray-100 px-3 py-1 rounded-full text-sm">📱 Google Authenticator</span>
                                <span class="bg-gray-100 px-3 py-1 rounded-full text-sm">📱 Microsoft Authenticator</span>
                                <span class="bg-gray-100 px-3 py-1 rounded-full text-sm">📱 Authy</span>
                            </div>
                        </div>
                    </div>

                    <!-- Step 2 -->
                    <div class="flex items-start space-x-4">
                        <div class="flex-shrink-0 w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                            2
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-gray-800 mb-2">Open MyAccount Portal</h3>
                            <p class="text-gray-600 text-sm mb-3">Click the button below to open WSO2 MyAccount:</p>
                            <a href="https://localhost:9443/myaccount" target="_blank" 
                               class="inline-block bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-600">
                                <i class="fas fa-external-link-alt mr-2"></i>Open MyAccount
                            </a>
                        </div>
                    </div>

                    <!-- Step 3 -->
                    <div class="flex items-start space-x-4">
                        <div class="flex-shrink-0 w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                            3
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-gray-800 mb-2">Setup TOTP</h3>
                            <p class="text-gray-600 text-sm">
                                In MyAccount, go to: <strong>Security → Multi-Factor Authentication → Setup TOTP</strong>
                            </p>
                        </div>
                    </div>

                    <!-- Step 4 -->
                    <div class="flex items-start space-x-4">
                        <div class="flex-shrink-0 w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                            4
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-gray-800 mb-2">Scan QR Code</h3>
                            <p class="text-gray-600 text-sm">
                                Open your authenticator app and scan the QR code shown.
                                Enter the 6-digit code to verify.
                            </p>
                        </div>
                    </div>

                    <!-- Step 5 -->
                    <div class="flex items-start space-x-4">
                        <div class="flex-shrink-0 w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center font-bold">
                            ✓
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-green-800 mb-2">All Done!</h3>
                            <p class="text-gray-600 text-sm">
                                Next time you login, you'll be asked for the 6-digit code from your app.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Warning -->
            <div class="mt-6 bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-lg">
                <h3 class="text-lg font-bold text-yellow-900 mb-2">
                    <i class="fas fa-exclamation-triangle mr-2"></i>Important
                </h3>
                <ul class="text-yellow-800 space-y-1 text-sm">
                    <li>• Don't lose your phone! You'll need it to login.</li>
                    <li>• Save backup codes when offered.</li>
                    <li>• You can disable MFA in MyAccount if needed.</li>
                </ul>
            </div>
        </div>
    `;

    res.send(renderPage({
        title: 'Setup MFA',
        appName: 'HR App',
        appIcon: '👥',
        appColor: 'blue',
        user: user,
        roles: userRoles,
        content,
        currentApp: 'mfa'
    }));
});

app.listen(4001, () => console.log('🚀 HR App on http://localhost:4001'));