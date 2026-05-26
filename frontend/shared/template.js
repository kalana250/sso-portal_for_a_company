// frontend/shared/template.js

function renderPage({ title, appName, appIcon, appColor, user, roles, content, currentApp }) {
    const initials = (user?.sub || 'U').substring(0, 2).toUpperCase();
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { font-family: 'Poppins', sans-serif; }
        body { background: #f3f4f6; }
        .sidebar { transition: all 0.3s; }
        @media (max-width: 768px) {
            .sidebar { transform: translateX(-100%); }
            .sidebar.open { transform: translateX(0); }
        }
        .gradient-${appColor} {
            background: linear-gradient(135deg, ${getColorGradient(appColor)});
        }
        .card-hover { transition: all 0.3s; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.1); }
    </style>
</head>
<body class="min-h-screen">
    <button onclick="toggleSidebar()" class="md:hidden fixed top-4 left-4 z-50 bg-white p-2 rounded-lg shadow-lg">
        <i class="fas fa-bars text-gray-700"></i>
    </button>

    <div class="flex min-h-screen">
        <aside class="sidebar fixed md:static w-64 bg-white shadow-xl h-screen z-40 overflow-y-auto">
            <div class="gradient-${appColor} p-6 text-white">
                <div class="text-4xl mb-2">${appIcon}</div>
                <h2 class="text-xl font-bold">${appName}</h2>
                <p class="text-sm opacity-90">Company Portal</p>
            </div>
            
            <div class="p-4 border-b">
                <div class="flex items-center space-x-3">
                    <div class="w-12 h-12 gradient-${appColor} rounded-full flex items-center justify-center text-white font-bold">
                        ${initials}
                    </div>
                    <div>
                        <p class="font-semibold text-gray-800">${user?.sub || 'User'}</p>
                        <p class="text-xs text-gray-500">${roles?.[0] || 'Employee'}</p>
                    </div>
                </div>
            </div>

            <nav class="p-4 space-y-2">
                <a href="/dashboard" class="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 ${currentApp === 'dashboard' ? 'bg-gray-100 font-semibold' : ''}">
                    <i class="fas fa-home text-gray-600"></i>
                    <span>Dashboard</span>
                </a>
                <a href="/profile" class="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 ${currentApp === 'profile' ? 'bg-gray-100 font-semibold' : ''}">
                    <i class="fas fa-user text-gray-600"></i>
                    <span>My Profile</span>
                </a>
                <a href="/setup-mfa" class="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 ${currentApp === 'mfa' ? 'bg-gray-100 font-semibold' : ''}">
                    <i class="fas fa-shield-alt text-gray-600"></i>
                    <span>Setup MFA</span>
                </a>
                
                <div class="pt-4 border-t mt-4">
                    <p class="text-xs uppercase text-gray-400 px-3 mb-2">Other Apps</p>
                    <a href="http://localhost:4001" class="flex items-center space-x-3 p-3 rounded-lg hover:bg-blue-50">
                        <span>👥</span><span>HR App</span>
                    </a>
                    <a href="http://localhost:4002" class="flex items-center space-x-3 p-3 rounded-lg hover:bg-green-50">
                        <span>💰</span><span>Finance App</span>
                    </a>
                    <a href="http://localhost:4003" class="flex items-center space-x-3 p-3 rounded-lg hover:bg-orange-50">
                        <span>📋</span><span>Project App</span>
                    </a>
                    <a href="http://localhost:4004" class="flex items-center space-x-3 p-3 rounded-lg hover:bg-purple-50">
                        <span>⚙️</span><span>Admin Panel</span>
                    </a>
                </div>

                <div class="pt-4 border-t mt-4">
                    <a href="/logout" class="flex items-center space-x-3 p-3 rounded-lg hover:bg-red-50 text-red-600">
                        <i class="fas fa-sign-out-alt"></i>
                        <span>Logout</span>
                    </a>
                </div>
            </nav>
        </aside>

        <main class="flex-1 p-4 md:p-8 md:ml-0">
            <div class="max-w-7xl mx-auto">
                ${content}
            </div>
        </main>
    </div>

    <script>
        function toggleSidebar() {
            document.querySelector('.sidebar').classList.toggle('open');
        }
    </script>
</body>
</html>`;
}

function getColorGradient(color) {
    const colors = {
        blue: '#3b82f6, #2563eb',
        green: '#10b981, #059669',
        orange: '#f59e0b, #d97706',
        purple: '#8b5cf6, #7c3aed'
    };
    return colors[color] || colors.blue;
}

function renderLoginPage({ appName, appIcon, appColor }) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${appName} - Login</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { font-family: 'Poppins', sans-serif; }
        body {
            background: linear-gradient(135deg, ${getColorGradient(appColor)});
            min-height: 100vh;
        }
    </style>
</head>
<body class="flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 md:p-10 text-center">
        <div class="text-6xl md:text-7xl mb-4">${appIcon}</div>
        <h1 class="text-2xl md:text-3xl font-bold text-gray-800 mb-2">${appName}</h1>
        <p class="text-gray-600 mb-8">Please login to continue</p>
        
        <a href="/login" class="block w-full text-white py-3 md:py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition shadow-lg"
           style="background: linear-gradient(135deg, ${getColorGradient(appColor)});">
            <i class="fas fa-lock mr-2"></i>
            Login with Company SSO
        </a>
        
        <div class="mt-6 text-sm text-gray-500">
            <p>Secure authentication powered by</p>
            <p class="font-semibold">WSO2 Identity Server</p>
        </div>
    </div>
</body>
</html>`;
}

// ============ RBAC HELPER FUNCTIONS ============

function hasRole(user, role) {
    const userRoles = user?.groups || user?.roles || [];
    return userRoles.includes(role);
}

function hasAnyRole(user, roles) {
    const userRoles = user?.groups || user?.roles || [];
    return roles.some(r => userRoles.includes(r));
}

function getUserRoles(user) {
    return user?.groups || user?.roles || [];
}

// ⚠️ IMPORTANT: Export all functions
module.exports = { 
    renderPage, 
    renderLoginPage, 
    hasRole, 
    hasAnyRole, 
    getUserRoles 
};