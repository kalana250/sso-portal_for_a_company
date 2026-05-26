// frontend-apps/admin-app/app.js
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
    CLIENT_ID: 'skTa_dwSeLBzdcEqvx6OjVNdpvga',          
    CLIENT_SECRET: 'k6gD_T2XIofoFrCh8y5bBZtdJAbYPpHd_7alM8y6whUa',  
    REDIRECT_URI: 'http://localhost:4004/callback',
    SCOPE: 'openid profile email groups',
    BACKEND_API: 'http://localhost:3004'
};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'admin-app-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ============ MIDDLEWARE ============

function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/');
    next();
}

function requireAdmin(req, res, next) {
    if (!hasRole(req.session.user, 'admin-team')) {
        return res.status(403).send(renderPage({
            title: 'Access Denied',
            appName: 'Admin Panel',
            appIcon: '⚙️',
            appColor: 'purple',
            user: req.session.user,
            roles: getUserRoles(req.session.user),
            content: `
                <div class="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg p-8 md:p-12 text-center">
                    <div class="text-7xl mb-4">🚫</div>
                    <h1 class="text-3xl font-bold text-red-600 mb-3">Access Denied</h1>
                    <p class="text-gray-600 mb-4">You need admin privileges to access this panel.</p>
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4 my-6 text-left">
                        <p class="text-sm text-red-700"><strong>Required:</strong> admin-team</p>
                        <p class="text-sm text-red-700 mt-2"><strong>You have:</strong> ${getUserRoles(req.session.user).join(', ') || 'No roles'}</p>
                    </div>
                    <a href="http://localhost:5500" class="inline-block bg-purple-500 text-white px-8 py-3 rounded-lg font-semibold">
                        <i class="fas fa-home mr-2"></i>Back to Portal
                    </a>
                </div>
            `,
            currentApp: 'dashboard'
        }));
    }
    next();
}

// ============ ROUTES ============

app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.send(renderLoginPage({
        appName: 'Admin Panel',
        appIcon: '⚙️',
        appColor: 'purple'
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
    console.log('\n========== ADMIN APP CALLBACK ==========');
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
        console.log('=========================================\n');
        
        res.redirect('/dashboard');
        
    } catch (e) {
        console.error('\n========== ADMIN LOGIN ERROR ==========');
        console.error('Message:', e.message);
        console.error('Status:', e.response?.status);
        console.error('Data:', JSON.stringify(e.response?.data, null, 2));
        console.error('========================================\n');
        
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
                    <a href="/" class="inline-block mt-4 bg-purple-500 text-white px-6 py-2 rounded-lg">← Try Again</a>
                </div>
            </body>
            </html>
        `);
    }
});

// Dashboard - Admin Only
app.get('/dashboard', requireLogin, requireAdmin, async (req, res) => {
    try {
        const usersRes = await axios.get(`${CONFIG.BACKEND_API}/users`);
        const userRoles = getUserRoles(req.session.user);

        const content = `
            <div class="mb-8">
                <h1 class="text-3xl md:text-4xl font-bold text-gray-800">Admin Dashboard</h1>
                <p class="text-gray-600 mt-2">Welcome, ${req.session.user.sub}! 👑</p>
                <div class="mt-3 flex flex-wrap gap-2">
                    ${userRoles.map(r => `
                        <span class="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-semibold">
                            <i class="fas fa-crown mr-1"></i>${r}
                        </span>
                    `).join('')}
                </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="card-hover bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 shadow-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm opacity-90">Total Users</p>
                            <p class="text-3xl md:text-4xl font-bold">${usersRes.data.data.length}</p>
                        </div>
                        <div class="text-4xl opacity-50">👥</div>
                    </div>
                </div>
                <div class="card-hover bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm opacity-90">Active Apps</p>
                            <p class="text-3xl md:text-4xl font-bold">4</p>
                        </div>
                        <div class="text-4xl opacity-50">📱</div>
                    </div>
                </div>
                <div class="card-hover bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm opacity-90">Total Roles</p>
                            <p class="text-3xl md:text-4xl font-bold">3</p>
                        </div>
                        <div class="text-4xl opacity-50">🎭</div>
                    </div>
                </div>
                <div class="card-hover bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6 shadow-lg">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm opacity-90">System Status</p>
                            <p class="text-lg md:text-xl font-bold">✅ Online</p>
                        </div>
                        <div class="text-4xl opacity-50">🟢</div>
                    </div>
                </div>
            </div>

            <!-- Users Management -->
            <div class="bg-white rounded-2xl shadow-lg p-6 md:p-8 mb-8">
                <div class="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                    <h2 class="text-xl md:text-2xl font-bold text-gray-800">
                        <i class="fas fa-users-cog text-purple-500 mr-2"></i>User Management
                    </h2>
                </div>
                
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">ID</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                                <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usersRes.data.data.map(u => `
                                <tr class="border-t hover:bg-gray-50">
                                    <td class="px-4 py-3">#${u.id}</td>
                                    <td class="px-4 py-3 font-semibold">${u.name}</td>
                                    <td class="px-4 py-3 text-sm text-gray-600">${u.email}</td>
                                    <td class="px-4 py-3">
                                        <span class="px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                                            ${u.role}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- System Info -->
            <div class="bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-2xl shadow-lg p-6 md:p-8">
                <h2 class="text-xl md:text-2xl font-bold mb-4">
                    <i class="fas fa-server mr-2"></i>System Information
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <p class="text-sm opacity-80">WSO2 IS Version</p>
                        <p class="text-lg font-bold">7.2.0</p>
                    </div>
                    <div>
                        <p class="text-sm opacity-80">API Manager</p>
                        <p class="text-lg font-bold">4.7.0</p>
                    </div>
                    <div>
                        <p class="text-sm opacity-80">Status</p>
                        <p class="text-lg font-bold">🟢 Operational</p>
                    </div>
                </div>
            </div>
        `;

        res.send(renderPage({
            title: 'Admin Dashboard',
            appName: 'Admin Panel',
            appIcon: '⚙️',
            appColor: 'purple',
            user: req.session.user,
            roles: userRoles,
            content,
            currentApp: 'dashboard'
        }));
    } catch (error) {
        res.send('Error: ' + error.message);
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
                <div class="w-24 h-24 md:w-32 md:h-32 mx-auto bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl md:text-5xl font-bold mb-4">
                    ${(user.sub || 'U').substring(0, 2).toUpperCase()}
                </div>
                <h2 class="text-xl md:text-2xl font-bold text-gray-800">${user.sub || 'User'}</h2>
                <p class="text-gray-600">${user.email || 'No email'}</p>
                <div class="mt-4 space-y-2">
                    ${userRoles.map(role => `
                        <span class="inline-block bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-semibold">${role}</span>
                    `).join('')}
                </div>
                ${hasRole(user, 'admin-team') ? `
                    <div class="mt-4 bg-yellow-100 text-yellow-700 px-3 py-2 rounded-lg text-sm font-semibold">
                        <i class="fas fa-crown mr-1"></i>System Administrator
                    </div>
                ` : ''}
            </div>

            <div class="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6">
                <h3 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-id-card text-purple-500 mr-2"></i>Account Details
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
                    <i class="fas fa-key text-purple-500 mr-2"></i>OIDC Token Information
                </h3>
                <div class="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto">
                    <pre class="text-xs md:text-sm">${JSON.stringify(user, null, 2)}</pre>
                </div>
            </div>
        </div>
    `;

    res.send(renderPage({
        title: 'My Profile',
        appName: 'Admin Panel',
        appIcon: '⚙️',
        appColor: 'purple',
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
        res.redirect(`${CONFIG.IS_URL}/oidc/logout?id_token_hint=${idToken}&post_logout_redirect_uri=http://localhost:4004`);
    });
});

app.listen(4004, () => console.log('🚀 Admin App on http://localhost:4004'));