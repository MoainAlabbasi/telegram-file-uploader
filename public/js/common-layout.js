/**
 * MoTech Cloud - Common Layout Components
 * Sidebar & Header للاستخدام في جميع الصفحات
 */

// دالة لإنشاء Sidebar
function createSidebar(activePage = '') {
    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.id = 'sidebar';
    
    sidebar.innerHTML = `
        <div class="sidebar-logo">
            <h2>MoTech Cloud</h2>
            <p>نظام إدارة ملفات ذكي</p>
        </div>
        <nav>
            <ul class="sidebar-nav">
                <li><a href="/" class="${activePage === 'home' ? 'active' : ''}"><span class="icon">🏠</span> لوحة التحكم</a></li>
                <li><a href="/gallery.html" class="${activePage === 'gallery' ? 'active' : ''}"><span class="icon">🖼️</span> معرض الملفات</a></li>
                <li><a href="/study.html" class="${activePage === 'study' ? 'active' : ''}"><span class="icon">🤖</span> المساعد الذكي</a></li>
                <li><a href="/quizzes.html" class="${activePage === 'quizzes' ? 'active' : ''}"><span class="icon">📚</span> الاختبارات</a></li>
                <li><a href="/summaries.html" class="${activePage === 'summaries' ? 'active' : ''}"><span class="icon">📝</span> الملخصات</a></li>
                <li><a href="/quiz-creator.html" class="${activePage === 'quiz-creator' ? 'active' : ''}"><span class="icon">➕</span> إنشاء اختبار</a></li>
            </ul>
        </nav>
    `;
    
    return sidebar;
}

// دالة لإنشاء Header
function createHeader(title = 'مرحباً بك 👋', subtitle = 'إدارة ملفاتك بذكاء وسهولة', showBackButton = false) {
    const header = document.createElement('header');
    header.className = 'header';
    
    header.innerHTML = `
        <div class="header-left">
            ${showBackButton ? '<button class="back-button" onclick="window.history.back()">🔙 رجوع</button>' : ''}
            <div>
                <h1>${title}</h1>
                <p>${subtitle}</p>
            </div>
        </div>
        <div class="header-right">
            <div class="search-box">
                <input type="text" placeholder="ابحث عن ملف..." id="searchInput">
                <span class="search-icon">🔍</span>
            </div>
            <button class="theme-toggle" id="themeToggle" title="تبديل الوضع">🌙</button>
            <button class="menu-toggle" id="menuToggle">☰</button>
        </div>
    `;
    
    return header;
}

// دالة لتهيئة Layout
function initializeLayout(config = {}) {
    const {
        activePage = '',
        title = 'مرحباً بك 👋',
        subtitle = 'إدارة ملفاتك بذكاء وسهولة',
        showBackButton = false
    } = config;
    
    // إنشاء dashboard-layout إذا لم يكن موجوداً
    let dashboardLayout = document.querySelector('.dashboard-layout');
    if (!dashboardLayout) {
        dashboardLayout = document.createElement('div');
        dashboardLayout.className = 'dashboard-layout';
        document.body.appendChild(dashboardLayout);
    }
    
    // إضافة Sidebar
    const sidebar = createSidebar(activePage);
    dashboardLayout.insertBefore(sidebar, dashboardLayout.firstChild);
    
    // إضافة أو تحديث main-content
    let mainContent = document.querySelector('.main-content');
    if (!mainContent) {
        mainContent = document.createElement('main');
        mainContent.className = 'main-content';
        mainContent.id = 'mainContent';
        dashboardLayout.appendChild(mainContent);
    }
    
    // إضافة Header في بداية main-content
    const header = createHeader(title, subtitle, showBackButton);
    mainContent.insertBefore(header, mainContent.firstChild);
    
    // تهيئة الوظائف
    initializeThemeToggle();
    initializeMenuToggle();
}

// دالة لتبديل الوضع الليلي/النهاري
function initializeThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeToggle.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
    
    themeToggle.addEventListener('click', () => {
        const theme = document.documentElement.getAttribute('data-theme');
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeToggle.textContent = newTheme === 'dark' ? '🌙' : '☀️';
    });
}

// دالة لتبديل القائمة الجانبية على الموبايل
function initializeMenuToggle() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        mainContent.classList.toggle('sidebar-active');
    });
    
    // إغلاق Sidebar عند الضغط خارجها على الموبايل
    mainContent.addEventListener('click', () => {
        if (window.innerWidth <= 1024 && sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
            mainContent.classList.remove('sidebar-active');
        }
    });
}

// دالة لتحميل الإحصائيات (للصفحة الرئيسية)
async function loadDashboardStats() {
    try {
        const response = await fetch('/api/stats/system');
        if (!response.ok) throw new Error('Failed to fetch stats');
        
        const stats = await response.json();
        
        // تحديث الأرقام
        document.getElementById('totalFiles').textContent = stats.totalFiles || 0;
        document.getElementById('totalStorage').textContent = formatBytes(stats.totalStorage || 0);
        document.getElementById('totalQuizzes').textContent = stats.totalQuizzes || 0;
        document.getElementById('totalSummaries').textContent = stats.totalSummaries || 0;
    } catch (error) {
        console.error('Error loading stats:', error);
        // عرض 0 في حالة الخطأ
        document.getElementById('totalFiles').textContent = '0';
        document.getElementById('totalStorage').textContent = '0 MB';
        document.getElementById('totalQuizzes').textContent = '0';
        document.getElementById('totalSummaries').textContent = '0';
    }
}

// دالة لتحويل Bytes إلى تنسيق قابل للقراءة
function formatBytes(bytes) {
    if (bytes === 0) return '0 MB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// تصدير الدوال للاستخدام العام
window.MoTechLayout = {
    createSidebar,
    createHeader,
    initializeLayout,
    loadDashboardStats,
    formatBytes
};
