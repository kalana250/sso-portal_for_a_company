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
    CLIENT_ID: 'SXrBZMzyyThmZ3s2SouohIOncYAa',
    CLIENT_SECRET: 'XGdDhSIFlfBPgVeEU7mYCxEC33JH86ijmHNipVwhatAa',
    REDIRECT_URI: 'http://localhost:4002/callback',
    SCOPE: 'openid profile email groups',
    BACKEND_API: 'http://localhost:3002'
};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'finance-app-secret',
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
                appName: 'Finance App',
                appIcon: '💰',
                appColor: 'green',
                user: req.session.user,
                roles: getUserRoles(req.session.user),
                content: `
                    <div class="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg p-8 md:p-12 text-center">
                        <div class="text-7xl mb-4">🚫</div>
                        <h1 class="text-3xl font-bold text-red-600 mb-3">Access Denied</h1>
                        <p class="text-gray-600 mb-4">Finance access requires special permissions.</p>
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
                        <a href="http://localhost:5500" class="inline-block bg-green-500 text-white px-8 py-3 rounded-lg font-semibold">
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
        appName: 'Finance Application',
        appIcon: '💰',
        appColor: 'green'
    }));
});

app.get('/login', (req, res) => {
    const authURL = `${CONFIG.IS_URL}/oauth2/authorize?` +
        `response_type=code&client_id=${CONFIG.CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&` +
        `scope=${encodeURIComponent(CONFIG.SCOPE)}`;
    res.redirect(authURL);
});

// ⭐ FIXED CALLBACK FUNCTION
app.get('/callback', async (req, res) => {
    console.log('\n========== CALLBACK ==========');
    console.log('Code received:', req.query.code ? 'YES' : 'NO');
    
    if (!req.query.code) {
        return res.send('No authorization code received');
    }

    try {
        // Step 1: Exchange code for token
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

        // Step 2: Get user info
        const userInfo = await axios.get(
            `${CONFIG.IS_URL}/oauth2/userinfo`, 
            {
                headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
                httpsAgent
            }
        );

        console.log('✅ User Info:', JSON.stringify(userInfo.data, null, 2));

        // Step 3: Clean up user data
        const userData = userInfo.data;
        
        // Remove @carbon.super from username
        if (userData.sub && userData.sub.includes('@')) {
            userData.sub = userData.sub.split('@')[0];
        }
        
        // Remove prefixes from groups
        if (userData.groups) {
            userData.groups = userData.groups.map(g => 
                g.replace(/^(Application\/|Internal\/|PRIMARY\/)/, '')
            );
        }

        // Step 4: Save to session
        req.session.user = userData;
        req.session.access_token = tokenRes.data.access_token;
        req.session.id_token = tokenRes.data.id_token;
        
        console.log('✅ Login successful for:', userData.sub);
        console.log('==============================\n');
        
        res.redirect('/dashboard');
        
    } catch (e) {
        console.error('\n========== LOGIN ERROR ==========');
        console.error('Message:', e.message);
        console.error('Status:', e.response?.status);
        console.error('Data:', JSON.stringify(e.response?.data, null, 2));
        console.error('=================================\n');
        
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
                    <div class="bg-red-50 border border-red-200 p-4 rounded-lg mb-4">
                        <p class="text-red-700"><strong>Error:</strong> ${e.message}</p>
                    </div>
                    <div class="bg-gray-100 p-4 rounded-lg mb-4">
                        <p class="font-semibold mb-2">Details:</p>
                        <pre class="text-sm overflow-auto">${JSON.stringify(e.response?.data || {}, null, 2)}</pre>
                    </div>
                    <a href="/" class="inline-block bg-blue-500 text-white px-6 py-2 rounded-lg">← Try Again</a>
                </div>
            </body>
            </html>
        `);
    }
});

// ⭐ DASHBOARD - PROTECTED BY RBAC
app.get('/dashboard', requireLogin, requireAnyRole(['finance-team', 'admin-team']), async (req, res) => {
    try {
        const salaryRes = await axios.get(`${CONFIG.BACKEND_API}/salary`);
        const payslipsRes = await axios.get(`${CONFIG.BACKEND_API}/payslips`);
        const userRoles = getUserRoles(req.session.user);
        const isAdmin = hasRole(req.session.user, 'admin-team');

        const content = `
            <div class="mb-8">
                <h1 class="text-3xl md:text-4xl font-bold text-gray-800">Finance Dashboard</h1>
                <p class="text-gray-600 mt-2">Welcome, ${req.session.user.sub}! 💼</p>
                <div class="mt-3 flex flex-wrap gap-2">
                    ${userRoles.map(r => `
                        <span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">
                            <i class="fas fa-user-tag mr-1"></i>${r}
                        </span>
                    `).join('')}
                </div>
            </div>

            ${isAdmin ? `
                <div class="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-4 rounded-lg mb-6">
                    <p class="font-bold"><i class="fas fa-crown mr-2"></i>Admin Access</p>
                    <p class="text-sm opacity-90">You have full financial management permissions.</p>
                </div>
            ` : `
                <div class="bg-gradient-to-r from-green-500 to-teal-500 text-white p-4 rounded-lg mb-6">
                    <p class="font-bold"><i class="fas fa-check-circle mr-2"></i>Finance Team Access</p>
                    <p class="text-sm opacity-90">You have full access to financial data.</p>
                </div>
            `}

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div class="card-hover bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm opacity-90">Basic Salary</p>
                            <p class="text-2xl md:text-3xl font-bold">$${(salaryRes.data.data.basic || 0).toLocaleString()}</p>
                        </div>
                        <div class="text-4xl opacity-50">💵</div>
                    </div>
                </div>
                <div class="card-hover bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm opacity-90">Allowances</p>
                            <p class="text-2xl md:text-3xl font-bold">$${(salaryRes.data.data.allowances || 0).toLocaleString()}</p>
                        </div>
                        <div class="text-4xl opacity-50">🎁</div>
                    </div>
                </div>
                <div class="card-hover bg-gradient-to-br from-red-500 to-red-600 text-white rounded-xl p-6 shadow-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm opacity-90">Deductions</p>
                            <p class="text-2xl md:text-3xl font-bold">$${(salaryRes.data.data.deductions || 0).toLocaleString()}</p>
                        </div>
                        <div class="text-4xl opacity-50">📉</div>
                    </div>
                </div>
                <div class="card-hover bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 shadow-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm opacity-90">Net Salary</p>
                            <p class="text-2xl md:text-3xl font-bold">$${(salaryRes.data.data.net || 0).toLocaleString()}</p>
                        </div>
                        <div class="text-4xl opacity-50">💎</div>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div class="bg-white rounded-2xl shadow-lg p-6">
                    <h2 class="text-xl md:text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-file-invoice text-green-500 mr-2"></i>Recent Payslips
                    </h2>
                    <div class="space-y-3">
                        ${payslipsRes.data.data.map(p => `
                            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                                <div>
                                    <p class="font-semibold text-gray-800">${p.month}</p>
                                    <p class="text-sm text-gray-500">Salary Payment</p>
                                </div>
                                <div class="text-right">
                                    <p class="text-lg font-bold text-green-600">$${p.amount.toLocaleString()}</p>
                                    <span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Paid</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="bg-white rounded-2xl shadow-lg p-6">
                    <h2 class="text-xl md:text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-receipt text-green-500 mr-2"></i>Submit Expense Claim
                    </h2>
                    <form action="/submit-expense" method="POST" class="space-y-4">
                        <select name="category" required class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500">
                            <option value="">Select category</option>
                            <option value="Travel">Travel</option>
                            <option value="Food">Food</option>
                            <option value="Office">Office Supplies</option>
                            <option value="Other">Other</option>
                        </select>
                        <input type="text" name="description" required placeholder="Brief description"
                            class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500">
                        <input type="number" name="amount" required min="1" placeholder="Amount ($)"
                            class="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500">
                        <button type="submit" class="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-lg font-semibold hover:opacity-90">
                            <i class="fas fa-paper-plane mr-2"></i>Submit Claim
                        </button>
                    </form>
                </div>
            </div>
        `;

        res.send(renderPage({
            title: 'Finance Dashboard',
            appName: 'Finance App',
            appIcon: '💰',
            appColor: 'green',
            user: req.session.user,
            roles: userRoles,
            content,
            currentApp: 'dashboard'
        }));
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

// Submit Expense
app.post('/submit-expense', requireLogin, requireAnyRole(['finance-team', 'admin-team']), async (req, res) => {
    try {
        await axios.post(`${CONFIG.BACKEND_API}/expenses`, {
            employee: req.session.user.sub,
            ...req.body
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
                <div class="w-24 h-24 md:w-32 md:h-32 mx-auto bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white text-3xl md:text-5xl font-bold mb-4">
                    ${(user.sub || 'U').substring(0, 2).toUpperCase()}
                </div>
                <h2 class="text-xl md:text-2xl font-bold text-gray-800">${user.sub || 'User'}</h2>
                <p class="text-gray-600">${user.email || 'No email'}</p>
                <div class="mt-4 space-y-2">
                    ${userRoles.map(role => `
                        <span class="inline-block bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">
                            ${role}
                        </span>
                    `).join('')}
                </div>
            </div>

            <div class="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6">
                <h3 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-shield-alt text-green-500 mr-2"></i>Your Finance Permissions
                </h3>
                <div class="space-y-3">
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-gray-700">Access Finance Dashboard</span>
                        <span class="${hasAnyRole(user, ['finance-team', 'admin-team']) ? 'text-green-600' : 'text-red-600'}">
                            <i class="fas ${hasAnyRole(user, ['finance-team', 'admin-team']) ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                            ${hasAnyRole(user, ['finance-team', 'admin-team']) ? 'Allowed' : 'Denied'}
                        </span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-gray-700">Submit Expense Claims</span>
                        <span class="${hasAnyRole(user, ['finance-team', 'admin-team']) ? 'text-green-600' : 'text-red-600'}">
                            <i class="fas ${hasAnyRole(user, ['finance-team', 'admin-team']) ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                            ${hasAnyRole(user, ['finance-team', 'admin-team']) ? 'Allowed' : 'Denied'}
                        </span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-gray-700">Admin Privileges</span>
                        <span class="${hasRole(user, 'admin-team') ? 'text-green-600' : 'text-red-600'}">
                            <i class="fas ${hasRole(user, 'admin-team') ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                            ${hasRole(user, 'admin-team') ? 'Allowed' : 'Denied'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="lg:col-span-3 bg-white rounded-2xl shadow-lg p-6">
                <h3 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-key text-green-500 mr-2"></i>OIDC Token Information
                </h3>
                <div class="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto">
                    <pre class="text-xs md:text-sm">${JSON.stringify(user, null, 2)}</pre>
                </div>
            </div>
        </div>
    `;

    res.send(renderPage({
        title: 'My Profile',
        appName: 'Finance App',
        appIcon: '💰',
        appColor: 'green',
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
        res.redirect(`${CONFIG.IS_URL}/oidc/logout?id_token_hint=${idToken}&post_logout_redirect_uri=http://localhost:4002`);
    });
});

app.listen(4002, () => console.log('🚀 Finance App on http://localhost:4002'));