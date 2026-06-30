// ==========================================
// 1. استدعاء مكتبات Firebase
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, query, where, limit, writeBatch, increment, orderBy, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDL5RFFP6WwxA5yGvhl0EF5mG0UKZi5GcA",
  authDomain: "a01116626962-82e29.firebaseapp.com",
  projectId: "a01116626962-82e29",
  storageBucket: "a01116626962-82e29.firebasestorage.app",
  messagingSenderId: "245357920580",
  appId: "1:245357920580:web:ef3fdd3d441db66ce31711",
  measurementId: "G-03K80R8RYM"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// ==========================================
// 2. المتغيرات العامة وإعدادات الأمان
// ==========================================
const ADMIN_PASSWORD_HASH = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";
const API_BASE_URL = "https://abogad.vercel.app";
const GLOBAL_CLIENT_NAME = "abogad";
let cart = [];
let productsList = [];
let quickItemsList = [];
let isAdminLoggedIn = false;

let currentShift = {
    active: false,
    cashierName: "",
    startCash: 0,
    sales: 0,
    drops: 0,
    cashierExpenses: 0,
    startTime: null
};

const barcodeDebounceTimers = {};

// ==========================================
// 3. دوال مساعدة
// ==========================================
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeText(text) {
    if (!text) return "";
    return text
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[^\u0621-\u063A\u0641-\u064Aa-zA-Z0-9\s]/g, '')
        .trim()
        .toLowerCase();
}

function roundMoney(value) {
    return Math.round(value * 100) / 100;
}

function compressImage(file, maxWidth = 200, maxHeight = 200, quality = 0.5) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function isValidProduct(product) {
    return product && product.quantity !== -99999 && product.quantity > 0;
}

function formatDate(dateString) {
    if (!dateString) return "";
    const d = new Date(dateString);
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function updateSidebarActive(activeButtonId) {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
        btn.classList.remove('active-nav', 'active-sub');
    });
    
    const activeBtn = document.getElementById(activeButtonId);
    if (activeBtn) {
        if (activeBtn.closest('.admin-sub-menu')) {
            activeBtn.classList.add('active-sub');
        } else {
            activeBtn.classList.add('active-nav');
        }
    }
}

// ==========================================
// مزامنة الوردية مع Firestore
// ==========================================
async function syncShiftToFirestore() {
    if (!currentShift.active || !currentShift.cashierName) return;
    try {
        const shiftRef = doc(db, "activeShifts", currentShift.cashierName);
        await setDoc(shiftRef, {
            ...currentShift,
            lastUpdated: new Date().toISOString()
        }, { merge: true });
    } catch(e) {
        console.error("Shift sync error:", e);
    }
}

async function loadShiftFromFirestore(cashierName) {
    try {
        const snap = await getDoc(doc(db, "activeShifts", cashierName));
        if (snap.exists()) {
            const data = snap.data();
            if (data.active) {
                return data;
            }
        }
        return null;
    } catch(e) {
        return null;
    }
}

async function clearShiftFromFirestore(cashierName) {
    try {
        await deleteDoc(doc(db, "activeShifts", cashierName));
    } catch(e) {}
}

async function saveShiftLocally() {
    localStorage.setItem('activeShift', JSON.stringify(currentShift));
    await syncShiftToFirestore();
}

// ==========================================
// كاتالوج المنتجات (Single Document)
// ==========================================
async function updateProductCatalog(productId, productData) {
    try {
        const catalogRef = doc(db, "catalog", "products_list");
        await setDoc(catalogRef, {
            [productId]: {
                name: productData.name || '',
                barcode: productData.barcode || '',
                sellPrice: productData.sellPrice || 0,
                priority: productData.priority || 4
            }
        }, { merge: true });
    } catch(e) {
        console.error("Catalog update error:", e);
    }
}

async function getProductCatalog() {
    try {
        const snap = await getDoc(doc(db, "catalog", "products_list"));
        if (snap.exists()) {
            return snap.data();
        }
        return {};
    } catch(e) {
        return {};
    }
}

async function deleteProductFromCatalog(productId) {
    try {
        const catalogRef = doc(db, "catalog", "products_list");
        const snap = await getDoc(catalogRef);
        if (snap.exists()) {
            const data = snap.data();
            delete data[productId];
            await setDoc(catalogRef, data);
        }
    } catch(e) {
        console.error("Catalog delete error:", e);
    }
}

// ==========================================
// 4. عناصر DOM الرئيسية
// ==========================================
const navPosBtn = document.getElementById('navPosBtn');
const navAdminBtn = document.getElementById('navAdminBtn');
const posSection = document.getElementById('posSection');
const adminSection = document.getElementById('adminSection');
const authModal = document.getElementById('authModal');
const startShiftModal = document.getElementById('startShiftModal');

const allAdminTabs = [
    'inventoryTab', 'expensesTab', 'cashiersTab', 'statsTab', 'restockTab', 
    'quickItemsAdminTab', 'searchPriorityTab', 'salesReportTab', 'expensesReportTab', 'profitsReportTab',
    'shiftsTab', 'invoicesTab', 'lowStockTab'
];

function hideAllAdminTabs() {
    allAdminTabs.forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (tab) tab.style.display = 'none';
    });
}

function hideAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

// ==========================================
// 5. دالة الأكورديون للقائمة الجانبية
// ==========================================
function toggleAccordion(titleBtn) {
    const group = titleBtn.closest('.nav-group');
    if (!group) return;
    group.classList.toggle('open');
}

window.toggleAccordion = toggleAccordion;

// ==========================================
// 6. نظام الفحص السحابي
// ==========================================
function getSubscriptionToken() {
    const tokenData = localStorage.getItem('subscription_token');
    if (!tokenData) return null;
    try {
        const { token, timestamp } = JSON.parse(tokenData);
        if (Date.now() - timestamp < 3600000) return token;
        localStorage.removeItem('subscription_token');
        return null;
    } catch(e) {
        localStorage.removeItem('subscription_token');
        return null;
    }
}

function setSubscriptionToken(token) {
    localStorage.setItem('subscription_token', JSON.stringify({
        token: token,
        timestamp: Date.now()
    }));
}

async function enforceCloudSubscriptionLogic() {
    try {
        const cachedToken = getSubscriptionToken();
        if (cachedToken) {
            try {
                const payload = JSON.parse(atob(cachedToken.split('.')[1]));
                if (payload.exp * 1000 > Date.now() && payload.site === 'PRO') {
                    updateSubscriptionUI(payload.days || 30);
                    checkMaxSubscription();
                    return;
                }
            } catch(e) {}
        }
        
        const [proResponse, maxResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/codes/check-subscription`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_name: GLOBAL_CLIENT_NAME, site_type: 'PRO' })
            }).catch(() => null),
            fetch(`${API_BASE_URL}/api/codes/check-subscription`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_name: GLOBAL_CLIENT_NAME, site_type: 'MAX' })
            }).catch(() => null)
        ]);

        let isProValid = false;
        let isMaxValid = false;
        let proDays = 0;

        if (proResponse && proResponse.ok) {
            const proData = await proResponse.json();
            isProValid = proData.active && proData.remaining_days > 0;
            proDays = proData.remaining_days || 0;
            if (isProValid && proData.token) {
                setSubscriptionToken(proData.token);
            }
        }

        if (!isProValid) {
            localStorage.removeItem('subscription_token');
            window.location.href = "subscribe.html";
            return;
        }
      
        updateSubscriptionUI(proDays);

        if (maxResponse && maxResponse.ok) {
            const maxData = await maxResponse.json();
            isMaxValid = maxData.active && maxData.remaining_days > 0;
        }

        checkMaxSubscription(isMaxValid);

        const quickItemsGrid = document.getElementById('quickItemsGrid');
        if (quickItemsGrid) quickItemsGrid.style.display = 'none';

    } catch (error) {
        console.error("Subscription validation integration error.");
    }
}

function checkMaxSubscription(isMaxValid) {
    const maxSidebarItem = document.getElementById('navLitePosBtn');
    if (maxSidebarItem) {
        if (isMaxValid !== undefined) {
            maxSidebarItem.style.display = isMaxValid ? '' : 'none';
        }
    }
}

function updateSubscriptionUI(proDays) {
    const badge = document.getElementById('subscriptionBadge');
    const daysText = document.getElementById('remainingDaysText');
    
    if (!badge || !daysText) return;
    
    badge.style.display = 'inline-flex';
    badge.style.cursor = 'pointer';
    badge.onclick = function() {
        window.location.href = 'subscribe.html';
    };
    
    if (proDays > 3) {
        badge.className = 'subscription-badge-mini active-subscription';
        daysText.textContent = `${proDays} يوم`;
    } else if (proDays >= 1 && proDays <= 3) {
        badge.className = 'subscription-badge-mini warning-subscription';
        daysText.textContent = `⚠️ ${proDays}`;
        
        const warningModal = document.getElementById('subscriptionWarningModal');
        if (warningModal) {
            document.getElementById('warningDaysLeft').textContent = proDays;
            warningModal.style.display = 'flex';
        }
    } else if (proDays <= 0) {
        badge.className = 'subscription-badge-mini expired-subscription';
        daysText.textContent = '❌ منتهي';
        localStorage.removeItem('subscription_token');
        
        setTimeout(() => {
            window.location.href = 'subscribe.html';
        }, 3000);
        
        alert("❌ انتهت صلاحية اشتراكك. سيتم توجيهك لصفحة التجديد.");
    }
}

// ==========================================
// 7. الزر العائم للكاميرا
// ==========================================
function initFloatingButton() {
    if (document.getElementById('floatingCameraBtn')) return;
    
    const floatBtn = document.createElement('button');
    floatBtn.id = 'floatingCameraBtn';
    floatBtn.innerHTML = '📷';
    
    const savedStyles = JSON.parse(localStorage.getItem('floatingBtnStyles'));
    if (savedStyles) {
        floatBtn.style.top = savedStyles.top || 'auto';
        floatBtn.style.right = savedStyles.right || '20px';
        floatBtn.style.bottom = savedStyles.bottom || '80px';
        floatBtn.style.width = savedStyles.width || '56px';
        floatBtn.style.height = savedStyles.height || '56px';
    } else {
        floatBtn.style.cssText = 'position: fixed; bottom: 80px; right: 20px; width: 56px; height: 56px;';
    }
    
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.style.display = 'none';
    floatBtn.appendChild(resizeHandle);
    
    document.body.appendChild(floatBtn);

    floatBtn.addEventListener('click', (e) => {
        if (e.target === resizeHandle) return;
        if (editMode) return;
        e.stopPropagation();
        document.getElementById('startCameraBtn')?.click();
    });

    let editMode = false;
    let longPressTimer;
    
    floatBtn.addEventListener('touchstart', (e) => {
        if (e.target === resizeHandle) return;
        longPressTimer = setTimeout(() => {
            editMode = true;
            resizeHandle.style.display = 'block';
            floatBtn.style.border = '3px dashed #f59e0b';
            floatBtn.style.opacity = '0.9';
            navigator.vibrate?.(200);
        }, 10000);
    });
    
    floatBtn.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
    });
    
    floatBtn.addEventListener('touchmove', (e) => {
        clearTimeout(longPressTimer);
    });

    document.addEventListener('click', (e) => {
        if (editMode && !floatBtn.contains(e.target)) {
            editMode = false;
            resizeHandle.style.display = 'none';
            floatBtn.style.border = 'none';
            floatBtn.style.opacity = '1';
            saveFloatingBtnPosition(floatBtn);
        }
    });

    let isDragging = false;
    floatBtn.addEventListener('touchstart', (e) => {
        if (!editMode || e.target === resizeHandle) return;
        isDragging = true;
        floatBtn.style.transition = 'none';
    });

    floatBtn.addEventListener('touchmove', (e) => {
        if (!isDragging || !editMode) return;
        e.preventDefault();
        const touch = e.touches[0];
        floatBtn.style.left = 'auto';
        floatBtn.style.bottom = 'auto';
        floatBtn.style.top = (touch.clientY - floatBtn.offsetHeight / 2) + 'px';
        floatBtn.style.right = (window.innerWidth - touch.clientX - floatBtn.offsetWidth / 2) + 'px';
    });

    floatBtn.addEventListener('touchend', () => {
        if (isDragging) {
            isDragging = false;
            saveFloatingBtnPosition(floatBtn);
        }
    });

    let resizing = false;
    resizeHandle.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        e.preventDefault();
        resizing = true;
    });

    document.addEventListener('touchmove', (e) => {
        if (!resizing) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = floatBtn.getBoundingClientRect();
        const size = Math.max(40, Math.min(120, touch.clientX - rect.left));
        floatBtn.style.width = size + 'px';
        floatBtn.style.height = size + 'px';
        floatBtn.style.fontSize = (size * 0.43) + 'px';
        floatBtn.style.borderRadius = '50%';
    });

    document.addEventListener('touchend', () => {
        if (resizing) {
            resizing = false;
            saveFloatingBtnPosition(floatBtn);
        }
    });
}

function saveFloatingBtnPosition(btn) {
    localStorage.setItem('floatingBtnStyles', JSON.stringify({
        top: btn.style.top || 'auto',
        right: btn.style.right || '20px',
        bottom: btn.style.bottom || 'auto',
        width: btn.style.width || '56px',
        height: btn.style.height || '56px'
    }));
}

function updateFloatingButtonVisibility() {
    const btn = document.getElementById('floatingCameraBtn');
    if (!btn) return;
    
    const isPosVisible = posSection && posSection.style.display !== 'none';
    if (isPosVisible) {
        btn.classList.add('show');
    } else {
        btn.classList.remove('show');
    }
}

// ==========================================
// 8. Scan Mode Toggle
// ==========================================
function initScanModeToggle() {
    const toggleCheckbox = document.getElementById('autoCloseCameraCheckbox');
    if (!toggleCheckbox) return;
    
    const savedMode = localStorage.getItem('scanMode');
    if (savedMode !== null) {
        toggleCheckbox.checked = savedMode === 'multi';
    }
    
    toggleCheckbox.addEventListener('change', () => {
        localStorage.setItem('scanMode', toggleCheckbox.checked ? 'multi' : 'single');
    });
}

// ==========================================
// 9. زر القائمة السريعة
// ==========================================
function initQuickItemsToggle() {
    const toggleBtn = document.getElementById('toggleQuickItemsBtn');
    const quickGrid = document.getElementById('quickItemsGrid');
    if (!toggleBtn || !quickGrid) return;
    
    toggleBtn.addEventListener('click', () => {
        if (quickGrid.style.display === 'none' || quickGrid.style.display === '') {
            quickGrid.style.display = 'grid';
            toggleBtn.style.background = 'var(--primary)';
            toggleBtn.style.color = 'white';
            toggleBtn.style.borderColor = 'var(--primary)';
        } else {
            quickGrid.style.display = 'none';
            toggleBtn.style.background = 'var(--light-bg)';
            toggleBtn.style.color = 'var(--text-secondary)';
            toggleBtn.style.borderColor = 'var(--border-color)';
        }
    });
}

// ==========================================
// 10. Dropdown البحث
// ==========================================
async function initSearchDropdown() {
    const input = document.getElementById('barcodeInput');
    const dropdown = document.getElementById('searchDropdown');
    if (!input || !dropdown) return;
    
    let catalog = {};
    
    input.addEventListener('input', async (e) => {
        const val = e.target.value.trim();
        if (val.length === 0) {
            dropdown.classList.remove('active');
            return;
        }
        
        if (Object.keys(catalog).length === 0) {
            catalog = await getProductCatalog();
        }
        
        const ns = normalizeText(val);
        const matches = Object.entries(catalog)
            .filter(([id, data]) => {
                const searchStr = normalizeText((data.name || '') + ' ' + (data.barcode || ''));
                return searchStr.includes(ns);
            })
            .sort((a, b) => (a[1].priority || 4) - (b[1].priority || 4))
            .slice(0, 8);
        
        if (matches.length > 0) {
            dropdown.innerHTML = matches.map(([id, data]) => {
                let badgeColor = '';
                if (data.priority === 1) badgeColor = 'priority-1';
                else if (data.priority === 2) badgeColor = 'priority-2';
                else if (data.priority === 3) badgeColor = 'priority-3';
                
                return `<div class="search-dropdown-item" data-id="${id}">
                    <span class="product-name">
                        <span class="priority-badge ${badgeColor}"></span>
                        ${data.name}
                    </span>
                    <span class="product-price">${data.sellPrice || 0} ج</span>
                </div>`;
            }).join('');
            
            dropdown.classList.add('active');
            
            dropdown.querySelectorAll('.search-dropdown-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const productId = item.dataset.id;
                    const product = productsList.find(p => p.id === productId && p.quantity !== -99999);
                    if (product) {
                        addToCart({...product});
                        input.value = '';
                        dropdown.classList.remove('active');
                        input.focus();
                    } else {
                        const docSnap = await getDoc(doc(db, "products", productId));
                        if (docSnap.exists() && docSnap.data().quantity !== -99999 && docSnap.data().quantity > 0) {
                            const p = docSnap.data();
                            p.id = docSnap.id;
                            addToCart(p);
                            input.value = '';
                            dropdown.classList.remove('active');
                            input.focus();
                        } else {
                            alert("المنتج غير متوفر");
                        }
                    }
                });
            });
        } else {
            dropdown.classList.remove('active');
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== input) {
            dropdown.classList.remove('active');
        }
    });
}

// ==========================================
// 11. التنقل بين الشاشات
// ==========================================
navPosBtn?.addEventListener('click', () => {
    posSection.style.display = 'block';
    adminSection.style.display = 'none';
    updateSidebarActive('navPosBtn');
    updateFloatingButtonVisibility();
    
    if (!currentShift.active) {
        startShiftModal.style.display = 'flex';
    } else {
        document.getElementById('barcodeInput')?.focus();
        loadQuickItems();
    }
    closeSidebar();
});

navAdminBtn?.addEventListener('click', () => {
    if (isAdminLoggedIn) {
        posSection.style.display = 'none';
        adminSection.style.display = 'block';
        updateFloatingButtonVisibility();
        updateSidebarActive('navAdminBtn');
        hideAllAdminTabs();
        document.getElementById('inventoryTab').style.display = 'block';
        document.getElementById('adminSubMenu').style.display = 'block';
        updateSidebarActive('navInventoryBtn');
        loadInventory();
        closeSidebar();
    } else {
        authModal.style.display = 'flex';
        document.getElementById('adminPasswordInput').focus();
        closeSidebar();
    }
});

document.getElementById('openAdminFromShiftBtn')?.addEventListener('click', () => {
    startShiftModal.style.display = 'none';
    authModal.style.display = 'flex';
    document.getElementById('adminPasswordInput').focus();
});

document.getElementById('closeAuthBtn')?.addEventListener('click', () => {
    authModal.style.display = 'none';
    document.getElementById('adminPasswordInput').value = '';
    if (!currentShift.active && posSection.style.display !== 'none') {
        startShiftModal.style.display = 'flex';
    }
});

document.getElementById('verifyAdminBtn')?.addEventListener('click', verifyPassword);
document.getElementById('adminPasswordInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyPassword();
});

async function verifyPassword() {
    const input = document.getElementById('adminPasswordInput').value;
    const inputHash = await sha256(input);
    
    if (inputHash === ADMIN_PASSWORD_HASH) {
        isAdminLoggedIn = true;
        authModal.style.display = 'none';
        posSection.style.display = 'none';
        adminSection.style.display = 'block';
        updateFloatingButtonVisibility();
        updateSidebarActive('navAdminBtn');
        document.getElementById('adminPasswordInput').value = '';
        hideAllAdminTabs();
        document.getElementById('inventoryTab').style.display = 'block';
        document.getElementById('adminSubMenu').style.display = 'block';
        updateSidebarActive('navInventoryBtn');
        loadInventory();
        window.playSound('success');
    } else {
        alert("كلمة المرور غير صحيحة!");
        window.playSound('error');
    }
}

function switchAdminTab(tabId, buttonId) {
    if (!isAdminLoggedIn) {
        authModal.style.display = 'flex';
        document.getElementById('adminPasswordInput').focus();
        return;
    }
    
    hideAllAdminTabs();
    const tab = document.getElementById(tabId);
    if (tab) tab.style.display = 'block';
    
    updateSidebarActive(buttonId);
    
    switch(tabId) {
        case 'inventoryTab': loadInventory(); break;
        case 'cashiersTab': loadCashiers(); break;
        case 'statsTab': loadStats(); break;
        case 'quickItemsAdminTab': loadQuickItemsAdmin(); break;
        case 'searchPriorityTab': loadSearchPriority(); break;
        case 'salesReportTab': loadSalesReport(); break;
        case 'expensesReportTab': loadExpensesReport(); break;
        case 'profitsReportTab': loadProfitsReport(); break;
        case 'shiftsTab': loadShifts(); break;
        case 'invoicesTab': loadInvoices(); break;
        case 'lowStockTab': loadLowStock(); break;
        case 'restockTab': 
            document.getElementById('restockForm')?.reset();
            const rpn = document.getElementById('restockProdName');
            if (rpn) { rpn.value = ''; rpn.dataset.productId = ''; }
            break;
    }
}

const navMappings = {
    'navInventoryBtn': ['inventoryTab', 'navInventoryBtn'],
    'navCashiersBtn': ['cashiersTab', 'navCashiersBtn'],
    'navStatsBtn': ['statsTab', 'navStatsBtn'],
    'navRestockBtn': ['restockTab', 'navRestockBtn'],
    'navQuickItemsAdminBtn': ['quickItemsAdminTab', 'navQuickItemsAdminBtn'],
    'navSearchPriorityBtn': ['searchPriorityTab', 'navSearchPriorityBtn'],
    'navSalesReportBtn': ['salesReportTab', 'navSalesReportBtn'],
    'navExpensesReportBtn': ['expensesReportTab', 'navExpensesReportBtn'],
    'navProfitsReportBtn': ['profitsReportTab', 'navProfitsReportBtn'],
    'navShiftsBtn': ['shiftsTab', 'navShiftsBtn'],
    'navInvoicesBtn': ['invoicesTab', 'navInvoicesBtn'],
    'navLowStockBtn': ['lowStockTab', 'navLowStockBtn'],
    'navQuickItemsFromInventoryBtn': ['quickItemsAdminTab', 'navQuickItemsFromInventoryBtn']
};

Object.entries(navMappings).forEach(([btnId, [tabId, activeId]]) => {
    document.getElementById(btnId)?.addEventListener('click', () => {
        switchAdminTab(tabId, activeId);
        closeSidebar();
    });
});

document.getElementById('navCashierExpBtn')?.addEventListener('click', () => {
    if (!currentShift.active) return alert("لا توجد وردية مفتوحة!");
    document.getElementById('cashierExpenseModal').style.display = 'flex';
    closeSidebar();
});

// ==========================================
// 12. إدارة الوردية
// ==========================================
document.getElementById('startShiftBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('cashierNameInput').value.trim();
    const pass = document.getElementById('cashierPasswordInput').value.trim();
    const startCash = parseFloat(document.getElementById('startCashInput').value);

    if (!name || !pass || isNaN(startCash)) return alert("برجاء استكمال جميع البيانات!");

    const btn = document.getElementById('startShiftBtn');
    btn.innerText = "جاري التحقق...";
    btn.disabled = true;

    try {
        const q = query(collection(db, "cashiers"), where("name", "==", name), where("password", "==", pass));
        const snap = await getDocs(q);
        if (snap.empty) {
            alert("اسم الكاشير أو كلمة المرور غير صحيحة!");
            window.playSound('error');
        } else {
            currentShift = {
                active: true, cashierName: name, startCash: startCash,
                sales: 0, drops: 0, cashierExpenses: 0, startTime: new Date().toISOString()
            };
            await saveShiftLocally();
            startShiftModal.style.display = 'none';
            document.getElementById('shiftInfoDisplay').innerText = `الكاشير: ${name} | العهدة: ${startCash} ج`;
            window.playSound('success');
            document.getElementById('barcodeInput')?.focus();
            loadQuickItems();
            updateFloatingButtonVisibility();
        }
    } catch (e) {
        alert("حدث خطأ في الاتصال.");
    } finally {
        btn.innerText = "استلام الوردية";
        btn.disabled = false;
    }
});

document.getElementById('navCashDropBtn')?.addEventListener('click', () => {
    if (!currentShift.active) return alert("لا توجد وردية مفتوحة!");
    if (!isAdminLoggedIn) return alert("يجب تسجيل دخول المدير أولاً!");
    document.getElementById('cashDropModal').style.display = 'flex';
    closeSidebar();
});
document.getElementById('closeDropBtn')?.addEventListener('click', () => document.getElementById('cashDropModal').style.display = 'none');

document.getElementById('confirmDropBtn')?.addEventListener('click', async () => {
    if (!isAdminLoggedIn) return alert("يجب تسجيل دخول المدير أولاً!");
    const amount = parseFloat(document.getElementById('dropAmountInput').value);
    const pass = document.getElementById('dropAdminPassword').value;
    if (isNaN(amount) || amount <= 0 || !pass) return alert("بيانات غير صحيحة");
    
    const passHash = await sha256(pass);
    if (passHash !== ADMIN_PASSWORD_HASH) return alert("كلمة مرور المدير غير صحيحة!");
    
    const available = roundMoney(currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0));
    if (amount > available) return alert(`الرصيد المتاح (${available} ج) لا يكفي`);
    
    currentShift.drops = roundMoney(currentShift.drops + amount);
    await saveShiftLocally();
    alert(`تم تسليم ${amount} ج بنجاح`);
    document.getElementById('cashDropModal').style.display = 'none';
    document.getElementById('dropAmountInput').value = '';
    document.getElementById('dropAdminPassword').value = '';
    window.playSound('success');
});

document.getElementById('confirmCashierExpBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('cashierExpTitle').value.trim();
    const amount = parseFloat(document.getElementById('cashierExpAmount').value);
    if (!title || isNaN(amount) || amount <= 0) return alert("بيانات غير صحيحة");
    
    const available = roundMoney(currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0));
    if (amount > available) return alert(`الرصيد المتاح (${available} ج) لا يكفي`);
    
    currentShift.cashierExpenses = roundMoney((currentShift.cashierExpenses || 0) + amount);
    await saveShiftLocally();
    try { await addDoc(collection(db, "cashierExpenses"), { title, amount, cashier: currentShift.cashierName, timestamp: new Date().toISOString() }); } catch(e) {}
    
    document.getElementById('cashierExpenseModal').style.display = 'none';
    document.getElementById('cashierExpTitle').value = '';
    document.getElementById('cashierExpAmount').value = '';
    alert(`تم تسجيل ${title} بقيمة ${amount} ج`);
    window.playSound('success');
});
document.getElementById('closeCashierExpBtn')?.addEventListener('click', () => document.getElementById('cashierExpenseModal').style.display = 'none');

document.getElementById('navEndShiftBtn')?.addEventListener('click', () => {
    if (!currentShift.active) return alert("لا توجد وردية مفتوحة!");
    document.getElementById('reportStartCash').innerText = currentShift.startCash;
    document.getElementById('reportSales').innerText = currentShift.sales;
    document.getElementById('reportDrops').innerText = currentShift.drops;
    document.getElementById('reportCashierExpenses').innerText = currentShift.cashierExpenses || 0;
    document.getElementById('reportExpectedCash').innerText = roundMoney(currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0));
    document.getElementById('endShiftModal').style.display = 'flex';
    closeSidebar();
});
document.getElementById('closeEndShiftBtn')?.addEventListener('click', () => document.getElementById('endShiftModal').style.display = 'none');

document.getElementById('confirmEndShiftBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('confirmEndShiftBtn');
    btn.innerText = "جاري الحفظ...";
    btn.disabled = true;
    try {
        const expected = roundMoney(currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0));
        const actualInput = prompt("النقدية الفعلية بالدرج:", expected);
        const actual = roundMoney(parseFloat(actualInput) || expected);
        const diff = roundMoney(actual - expected);
        
        await addDoc(collection(db, "shifts"), {
            ...currentShift, endTime: new Date().toISOString(),
            actualCash: actual, expectedCash: expected, difference: diff,
            status: diff >= 0 ? 'زيادة' : 'عجز'
        });
        
        await clearShiftFromFirestore(currentShift.cashierName);
        currentShift = { active: false, cashierName: "", startCash: 0, sales: 0, drops: 0, cashierExpenses: 0, startTime: null };
        localStorage.removeItem('activeShift');
        document.getElementById('shiftInfoDisplay').innerText = '';
        document.getElementById('endShiftModal').style.display = 'none';
        startShiftModal.style.display = 'flex';
        document.getElementById('cashierPasswordInput').value = '';
        document.getElementById('startCashInput').value = '';
        updateFloatingButtonVisibility();
        window.playSound('success');
        alert(`تم التقفيل. ${diff >= 0 ? 'زيادة' : 'عجز'}: ${Math.abs(diff)} ج`);
    } catch(e) {
        alert("خطأ في الحفظ");
    } finally {
        btn.innerText = "إنهاء الوردية وبدء وردية جديدة";
        btn.disabled = false;
    }
});

// ==========================================
// 13. المخزن
// ==========================================
document.getElementById('addProductForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerText = "جاري الإضافة...";
    btn.disabled = true;
    try {
        const barcode = document.getElementById('prodBarcode').value;
        const name = document.getElementById('prodName').value;
        const sellPrice = roundMoney(parseFloat(document.getElementById('prodSellPrice').value));
        const priority = parseInt(document.getElementById('prodPriority').value) || 4;
        
        const docRef = await addDoc(collection(db, "products"), {
            barcode: barcode,
            name: name,
            buyPrice: roundMoney(parseFloat(document.getElementById('prodBuyPrice').value)),
            sellPrice: sellPrice,
            quantity: parseInt(document.getElementById('prodQty').value),
            minAlert: parseInt(document.getElementById('prodMinAlert').value),
            priority: priority,
            image: "",
            searchKey: [normalizeText(name), normalizeText(barcode)]
        });
        
        await updateProductCatalog(docRef.id, {
            name: name,
            barcode: barcode,
            sellPrice: sellPrice,
            priority: priority
        });
        
        alert("تمت الإضافة!");
        document.getElementById('addProductForm').reset();
        loadInventory();
    } catch(e) { alert("خطأ: " + e.message); }
    finally { btn.innerText = "إضافة / تحديث المنتج"; btn.disabled = false; }
});

async function loadInventory() {
    const tbody = document.getElementById('inventoryBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">جاري التحميل...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "products"));
        productsList = [];
        tbody.innerHTML = '';
        snap.forEach(doc => {
            let p = doc.data(); p.id = doc.id;
            if (p.quantity === -99999) return;
            productsList.push(p);
            
            let priorityLabel = 'افتراضي';
            if (p.priority === 1) priorityLabel = '🔴 أولوية 1';
            else if (p.priority === 2) priorityLabel = '🟠 أولوية 2';
            else if (p.priority === 3) priorityLabel = '🟡 أولوية 3';
            
            tbody.innerHTML += `<tr class="${p.quantity <= p.minAlert ? 'low-stock' : ''}">
                <td>${p.barcode}</td><td>${p.name}</td><td>${p.quantity}</td>
                <td>${p.buyPrice}</td><td>${p.sellPrice}</td>
                <td>${priorityLabel}</td>
                <td><button onclick="window.editProduct('${p.id}')" class="btn-sm btn-outline-primary" style="margin-left:4px;">تعديل</button>
                <button onclick="window.deleteProduct('${p.id}')" class="btn-sm" style="background:var(--danger);color:white;">حذف</button></td></tr>`;
        });
    } catch(e) { tbody.innerHTML = '<tr><td colspan="7">خطأ</td></tr>'; }
}

async function loadLowStock() {
    const tbody = document.getElementById('lowStockBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">جاري التحميل...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "products"));
        tbody.innerHTML = '';
        let has = false;
        snap.forEach(doc => {
            let p = doc.data();
            if (p.quantity === -99999) return;
            if (p.quantity <= p.minAlert) {
                has = true;
                tbody.innerHTML += `<tr class="low-stock"><td>${p.barcode}</td><td>${p.name}</td><td>${p.quantity}</td><td>${p.minAlert}</td><td>⚠️ ناقص</td></tr>`;
            }
        });
        if (!has) tbody.innerHTML = '<tr><td colspan="5" style="color:var(--success);">✅ المخزون ممتاز</td></tr>';
    } catch(e) { tbody.innerHTML = '<tr><td colspan="5">خطأ</td></tr>'; }
}

window.editProduct = async function(id) {
    const p = productsList.find(x => x.id === id);
    if (!p) return alert("غير موجود");
    const name = prompt("الاسم:", p.name);
    if (!name) return;
    const price = prompt("سعر البيع:", p.sellPrice);
    if (!price) return;
    try {
        await updateDoc(doc(db, "products", id), { name, sellPrice: roundMoney(parseFloat(price)), searchKey: [normalizeText(name), normalizeText(p.barcode || '')] });
        await updateProductCatalog(id, { name, sellPrice: roundMoney(parseFloat(price)), barcode: p.barcode, priority: p.priority || 4 });
        alert("تم التعديل");
        loadInventory();
    } catch(e) { alert("خطأ"); }
};

window.deleteProduct = async function(id) {
    if (confirm("حذف المنتج؟")) {
        await updateDoc(doc(db, "products", id), { quantity: -99999 });
        await deleteProductFromCatalog(id);
        alert("تم الحذف");
        loadInventory();
    }
};

// ==========================================
// 14. أولويات البحث
// ==========================================
async function loadSearchPriority() {
    const tbody = document.getElementById('searchPriorityBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4">جاري التحميل...</td></tr>';
    
    try {
        const snap = await getDocs(collection(db, "products"));
        const products = [];
        snap.forEach(doc => {
            const p = doc.data();
            if (p.quantity === -99999) return;
            p.id = doc.id;
            products.push(p);
        });
        
        tbody.innerHTML = '';
        products.forEach(p => {
            const currentPriority = p.priority || 4;
            let priorityLabel = '';
            if (currentPriority === 1) priorityLabel = '🔴 أولوية 1';
            else if (currentPriority === 2) priorityLabel = '🟠 أولوية 2';
            else if (currentPriority === 3) priorityLabel = '🟡 أولوية 3';
            else priorityLabel = '⚪ افتراضي';
            
            tbody.innerHTML += `<tr>
                <td>${p.name}</td>
                <td>${p.barcode}</td>
                <td>${priorityLabel}</td>
                <td>
                    <select onchange="window.updateSearchPriority('${p.id}', this.value)" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border-color);">
                        <option value="4" ${currentPriority===4?'selected':''}>أولوية 4 - افتراضي</option>
                        <option value="1" ${currentPriority===1?'selected':''}>أولوية 1 - حمراء</option>
                        <option value="2" ${currentPriority===2?'selected':''}>أولوية 2 - برتقالية</option>
                        <option value="3" ${currentPriority===3?'selected':''}>أولوية 3 - صفراء</option>
                    </select>
                </td>
            </tr>`;
        });
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="4">خطأ في التحميل</td></tr>';
    }
}

window.updateSearchPriority = async (productId, newPriority) => {
    try {
        await updateDoc(doc(db, "products", productId), { priority: parseInt(newPriority) });
        
        const product = productsList.find(p => p.id === productId);
        if (product) {
            await updateProductCatalog(productId, {
                name: product.name,
                barcode: product.barcode,
                sellPrice: product.sellPrice,
                priority: parseInt(newPriority)
            });
        }
        
        window.playSound('success');
    } catch(e) {
        alert("خطأ في تحديث الأولوية");
    }
};

// ==========================================
// 15. تزويد بضاعة
// ==========================================
async function lookupProductForRestock(barcode) {
    const nameEl = document.getElementById('restockProdName');
    const qtyEl = document.getElementById('restockAddQty');
    if (!barcode) return;
    const local = productsList.find(p => p.barcode === barcode && p.quantity !== -99999);
    if (local) { nameEl.value = local.name; nameEl.dataset.productId = local.id; qtyEl.focus(); return; }
    const snap = await getDocs(query(collection(db, "products"), where("barcode", "==", barcode), limit(1)));
    if (!snap.empty) {
        const p = snap.docs[0].data();
        if (p.quantity === -99999) { alert("محذوف"); return; }
        nameEl.value = p.name;
        nameEl.dataset.productId = snap.docs[0].id;
        qtyEl.focus();
    } else alert("غير موجود");
}

document.getElementById('restockForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const barcode = document.getElementById('restockBarcode').value;
    const addQty = parseInt(document.getElementById('restockAddQty').value);
    const newBuy = roundMoney(parseFloat(document.getElementById('restockNewBuyPrice').value) || 0);
    const newSell = roundMoney(parseFloat(document.getElementById('restockNewSellPrice').value) || 0);
    if (isNaN(addQty) || addQty <= 0) return alert("كمية غير صالحة");
    try {
        const snap = await getDocs(query(collection(db, "products"), where("barcode", "==", barcode), limit(1)));
        if (snap.empty) return alert("غير موجود");
        const d = snap.docs[0], p = d.data();
        if (p.quantity === -99999) return alert("محذوف");
        let upd = { quantity: increment(addQty) };
        if (newBuy > 0 && p.buyPrice > 0 && p.quantity > 0) {
            upd.buyPrice = roundMoney((p.buyPrice * p.quantity + newBuy * addQty) / (p.quantity + addQty));
        } else if (newBuy > 0) upd.buyPrice = newBuy;
        if (newSell > 0) {
            upd.sellPrice = newSell;
        }
        await updateDoc(doc(db, "products", d.id), upd);
        
        if (newSell > 0) {
            await updateProductCatalog(d.id, { name: p.name, barcode: p.barcode, sellPrice: newSell, priority: p.priority || 4 });
        }
        
        document.getElementById('restockForm').reset();
        document.getElementById('restockProdName').value = '';
        alert(`تم تزويد ${p.name}. الكمية: ${p.quantity + addQty}`);
        loadInventory();
    } catch(e) { alert("خطأ"); }
});

// ==========================================
// 16. الكاشيرية
// ==========================================
document.getElementById('addCashierForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newCashierName').value.trim();
    const pass = document.getElementById('newCashierPass').value.trim();
    await addDoc(collection(db, "cashiers"), { name, password: pass, active: true });
    alert("تمت الإضافة");
    document.getElementById('addCashierForm').reset();
    loadCashiers();
});

async function loadCashiers() {
    const tbody = document.getElementById('cashiersBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">جاري التحميل...</td></tr>';
    const snap = await getDocs(collection(db, "cashiers"));
    tbody.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        if (d.active === false) return;
        tbody.innerHTML += `<tr><td>${d.name}</td><td>${d.password}</td><td><button onclick="window.deleteCashier('${doc.id}')" class="btn-sm" style="background:var(--danger);color:white;">حذف</button></td></tr>`;
    });
}
window.deleteCashier = async (id) => {
    if (confirm("حذف الكاشير؟")) { await updateDoc(doc(db, "cashiers", id), { active: false }); loadCashiers(); }
};

// ==========================================
// 17. شاشة البيع
// ==========================================
const barcodeInput = document.getElementById('barcodeInput');
barcodeInput?.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const code = barcodeInput.value.trim();
        if (!code) return;
        
        const lastScannedCode = barcodeInput.dataset.lastScanned;
        const isRepeat = lastScannedCode === code;
        
        if (isRepeat) {
            const existingItem = cart.find(item => item.barcode === code || item.id === code);
            if (existingItem && existingItem.cartQty < existingItem.quantity) {
                existingItem.cartQty++;
                window.playSound('success');
                renderCart();
                barcodeInput.value = '';
                return;
            }
        }
        
        if (barcodeDebounceTimers[code] && !isRepeat) return;
        barcodeDebounceTimers[code] = true;
        barcodeInput.dataset.lastScanned = code;
        setTimeout(() => delete barcodeDebounceTimers[code], 500);
        
        const ns = normalizeText(code);
        const local = productsList.find(p => (p.barcode === code || (p.searchKey && p.searchKey.includes(ns))) && p.quantity !== -99999);
        if (local) { addToCart({...local}); barcodeInput.value = ''; document.getElementById('searchDropdown')?.classList.remove('active'); return; }
        
        try {
            let found = false;
            const s1 = await getDocs(query(collection(db, "products"), where("barcode", "==", code), limit(1)));
            if (!s1.empty) { const p = s1.docs[0].data(); p.id = s1.docs[0].id; if (p.quantity !== -99999) { addToCart(p); found = true; } }
            if (!found) {
                const s2 = await getDocs(query(collection(db, "products"), where("searchKey", "array-contains", ns), limit(1)));
                if (!s2.empty) { const p = s2.docs[0].data(); p.id = s2.docs[0].id; if (p.quantity !== -99999) { addToCart(p); found = true; } }
            }
            if (found) {
                barcodeInput.value = '';
                document.getElementById('searchDropdown')?.classList.remove('active');
            }
            else { window.playSound('error'); alert("غير موجود!"); }
        } catch(e) { window.playSound('error'); }
    }
});

document.getElementById('restockBarcode')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); lookupProductForRestock(e.target.value); }
});

// ==========================================
// 18. السلة والبيع - مع إصلاح الفهرسة
// ==========================================
function addToCart(product) {
    if (!isValidProduct(product)) { window.playSound('error'); alert("غير متوفر"); return; }
    let exist = cart.find(i => i.id === product.id);
    if (exist) {
        if (exist.cartQty < product.quantity) { exist.cartQty++; window.playSound('success'); }
        else { window.playSound('error'); alert("الكمية لا تكفي"); return; }
    } else {
        cart.push({ ...product, cartQty: 1 });
        window.playSound('success');
    }
    renderCart();
}

function renderCart() {
    const tbody = document.getElementById('cartBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let total = 0;
    if (cart.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-cart-msg">السلة فارغة</td></tr>';
    }
    cart.forEach((item) => {
        const it = roundMoney(item.sellPrice * item.cartQty);
        total = roundMoney(total + it);
        tbody.innerHTML += `<tr>
            <td>${item.name}</td><td>${item.sellPrice}</td>
            <td><div class="qty-cell">
                <button class="qty-btn" data-product-id="${item.id}" data-change="-1">−</button>
                <span class="qty-value">${item.cartQty}</span>
                <button class="qty-btn" data-product-id="${item.id}" data-change="1">+</button>
            </div></td>
            <td>${it}</td>
            <td><button class="delete-btn" data-product-id="${item.id}">🗑</button></td>
        </tr>`;
    });
    
    tbody.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const productId = btn.dataset.productId;
            const change = parseInt(btn.dataset.change);
            window.changeQtyById(productId, change);
        });
    });
    
    tbody.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const productId = btn.dataset.productId;
            window.removeFromCartById(productId);
        });
    });
    
    document.getElementById('cartTotal').innerText = total;
}

window.changeQtyById = (productId, a) => {
    const itemIndex = cart.findIndex(i => i.id === productId);
    if (itemIndex === -1) return;
    const n = cart[itemIndex].cartQty + a;
    if (n > 0 && n <= cart[itemIndex].quantity) { cart[itemIndex].cartQty = n; renderCart(); }
    else if (n <= 0) window.removeFromCartById(productId);
    else { window.playSound('error'); alert("الكمية لا تكفي"); }
};

window.removeFromCartById = (productId) => {
    cart = cart.filter(i => i.id !== productId);
    renderCart();
};

window.changeQty = (i, a) => {
    window.changeQtyById(cart[i]?.id, a);
};
window.removeFromCart = (i) => {
    window.removeFromCartById(cart[i]?.id);
};

async function updateStatsInRealTime(sales, cost) {
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);
    try {
        const batch = writeBatch(db);
        batch.set(doc(db, "stats", `day_${today}`), { totalSales: increment(sales), totalCost: increment(cost), date: today }, { merge: true });
        batch.set(doc(db, "stats", `month_${month}`), { totalSales: increment(sales), totalCost: increment(cost), month }, { merge: true });
        await batch.commit();
    } catch(e) {}
}

document.getElementById('checkoutBtn')?.addEventListener('click', async () => {
    if (!currentShift.active) return alert("لا توجد وردية!");
    if (!cart.length) return alert("السلة فارغة");
    const btn = document.getElementById('checkoutBtn');
    btn.innerText = "جاري الحفظ...";
    btn.disabled = true;
    let ts = 0, tc = 0;
    const items = cart.map(i => {
        const subtotal = roundMoney(i.sellPrice * i.cartQty);
        const cost = roundMoney(i.buyPrice * i.cartQty);
        ts = roundMoney(ts + subtotal);
        tc = roundMoney(tc + cost);
        return { productId: i.id, name: i.name, qty: i.cartQty, price: i.sellPrice };
    });
    try {
        const batch = writeBatch(db);
        batch.set(doc(collection(db, "invoices")), { timestamp: new Date().toISOString(), cashier: currentShift.cashierName, items, totalSales: ts, totalCost: tc });
        cart.forEach(i => batch.update(doc(db, "products", i.id), { quantity: increment(-i.cartQty) }));
        await batch.commit();
        currentShift.sales = roundMoney(currentShift.sales + ts);
        await saveShiftLocally();
        await updateStatsInRealTime(ts, tc);
        window.playSound('success');
        alert("تم البيع!");
        cart = [];
        renderCart();
        document.getElementById('barcodeInput')?.focus();
    } catch(e) { window.playSound('error'); alert("خطأ"); }
    finally { btn.innerText = "💳 تأكيد البيع وحفظ الفاتورة"; btn.disabled = false; }
});

// ==========================================
// 19. القائمة السريعة
// ==========================================
async function loadQuickItems() {
    const grid = document.getElementById('quickItemsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    try {
        const snap = await getDocs(collection(db, "quickItems"));
        quickItemsList = [];
        snap.forEach(doc => {
            const item = doc.data();
            if (item.active === false) return;
            item.id = doc.id;
            quickItemsList.push(item);
            const btn = document.createElement('button');
            btn.innerHTML = `${item.image ? `<img src="${item.image}" alt="">` : ''}<span>${item.name}</span>`;
            btn.onclick = () => {
                const p = productsList.find(x => x.id === item.productId && x.quantity !== -99999);
                p ? addToCart({...p}) : alert("غير متوفر");
            };
            grid.appendChild(btn);
        });
    } catch(e) {}
}

document.getElementById('showQuickItemsPopupBtn')?.addEventListener('click', () => {
    const grid = document.getElementById('quickItemsPopupGrid');
    if (!grid) return;
    grid.innerHTML = quickItemsList.length ? '' : '<p style="grid-column:1/-1;text-align:center;">لا توجد منتجات</p>';
    quickItemsList.forEach(item => {
        const btn = document.createElement('button');
        btn.style.cssText = 'min-height:120px;font-size:0.9rem;';
        btn.innerHTML = `${item.image ? `<img src="${item.image}" style="width:60px;height:60px;object-fit:contain;border-radius:8px;" alt="">` : '<span style="font-size:2rem;">📦</span>'}<span>${item.name}</span>`;
        btn.onclick = () => {
            const p = productsList.find(x => x.id === item.productId && x.quantity !== -99999);
            if (p) { addToCart({...p}); document.getElementById('quickItemsPopupModal').style.display = 'none'; }
            else alert("غير متوفر");
        };
        grid.appendChild(btn);
    });
    document.getElementById('quickItemsPopupModal').style.display = 'flex';
});
document.getElementById('closeQuickItemsPopupBtn')?.addEventListener('click', () => document.getElementById('quickItemsPopupModal').style.display = 'none');

async function loadQuickItemsAdmin() {
    const list = document.getElementById('quickItemsAdminList');
    if (!list) return;
    list.innerHTML = 'جاري التحميل...';
    try {
        const snap = await getDocs(collection(db, "quickItems"));
        quickItemsList = [];
        list.innerHTML = '';
        snap.forEach(doc => {
            const item = doc.data();
            if (item.active === false) return;
            item.id = doc.id;
            quickItemsList.push(item);
            list.innerHTML += `<div>
                <p><strong>${item.name}</strong></p>
                ${item.image ? `<img src="${item.image}" alt="">` : '<p style="color:#999;">لا صورة</p>'}
                <button onclick="window.uploadQuickItemImage('${doc.id}')" class="btn btn-sm btn-primary" style="margin:3px;">📷 صورة</button>
                <button onclick="window.removeQuickItem('${doc.id}')" class="btn btn-sm" style="background:var(--danger);color:white;margin:3px;">حذف</button>
            </div>`;
        });
    } catch(e) { list.innerHTML = 'خطأ'; }
}

window.uploadQuickItemImage = async (docId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const b64 = await compressImage(file, 200, 200, 0.6);
            await updateDoc(doc(db, "quickItems", docId), { image: b64 });
            loadQuickItemsAdmin();
            loadQuickItems();
            alert("تم التحديث");
        } catch(e) { alert("خطأ"); }
    };
    input.click();
};

document.getElementById('addToQuickBtn')?.addEventListener('click', async () => {
    const search = document.getElementById('quickSearchInput').value.trim();
    if (!search) return alert("اكتب اسم المنتج");
    const ns = normalizeText(search);
    const prod = productsList.find(p => p.searchKey && p.searchKey.includes(ns) && p.quantity !== -99999);
    if (!prod) return alert("غير موجود");
    const snap = await getDocs(collection(db, "quickItems"));
    let count = 0;
    snap.forEach(d => { if (d.data().active !== false) count++; });
    if (count >= 15) return alert("الحد 15 منتج");
    await addDoc(collection(db, "quickItems"), { productId: prod.id, name: prod.name, image: "", active: true });
    document.getElementById('quickSearchInput').value = '';
    loadQuickItemsAdmin();
});
window.removeQuickItem = async (id) => {
    if (confirm("إزالة؟")) { await updateDoc(doc(db, "quickItems", id), { active: false }); loadQuickItemsAdmin(); loadQuickItems(); }
};

// ==========================================
// 20. المصروفات والتقارير - استعلامات محسنة
// ==========================================
document.getElementById('addExpenseForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "expenses"), { title: document.getElementById('expTitle').value, amount: roundMoney(parseFloat(document.getElementById('expAmount').value)), date: new Date().toISOString() });
    alert("تم");
    document.getElementById('addExpenseForm').reset();
});

async function getDateRange(filter) {
    const now = new Date();
    let start = null;
    const end = now.toISOString();
    
    switch(filter) {
        case 'lastShift':
            const shiftsSnap = await getDocs(query(collection(db, "shifts"), orderBy("startTime", "desc"), limit(1)));
            if (!shiftsSnap.empty) {
                const lastShift = shiftsSnap.docs[0].data();
                return { start: lastShift.startTime, end: lastShift.endTime || end };
            }
            break;
        case 'today': start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(); break;
        case 'week': start = new Date(now.getTime() - 7*86400000).toISOString(); break;
        case 'month': start = new Date(now.getTime() - 30*86400000).toISOString(); break;
        case '3months': start = new Date(now.getTime() - 90*86400000).toISOString(); break;
        case '6months': start = new Date(now.getTime() - 180*86400000).toISOString(); break;
        case 'year': start = new Date(now.getTime() - 365*86400000).toISOString(); break;
        case 'custom':
            const customStart = document.getElementById('customStartDate')?.value;
            const customEnd = document.getElementById('customEndDate')?.value;
            if (customStart) start = new Date(customStart).toISOString();
            const customEndDate = customEnd ? new Date(customEnd + 'T23:59:59').toISOString() : end;
            return { start, end: customEndDate };
    }
    return { start, end };
}

async function loadStats() {
    const filter = document.getElementById('statsFilter')?.value || 'all';
    const { start, end } = await getDateRange(filter);
    
    let ts = 0, tc = 0, te = 0;
    
    if (start) {
        const invQ = query(collection(db, "invoices"), where("timestamp", ">=", start), where("timestamp", "<=", end));
        (await getDocs(invQ)).forEach(d => {
            const data = d.data();
            ts = roundMoney(ts + (data.totalSales || 0));
            tc = roundMoney(tc + (data.totalCost || 0));
        });
        
        const expQ = query(collection(db, "expenses"), where("date", ">=", start), where("date", "<=", end));
        (await getDocs(expQ)).forEach(d => {
            te = roundMoney(te + (d.data().amount || 0));
        });
    } else {
        (await getDocs(collection(db, "invoices"))).forEach(d => {
            ts = roundMoney(ts + (d.data().totalSales || 0));
            tc = roundMoney(tc + (d.data().totalCost || 0));
        });
        (await getDocs(collection(db, "expenses"))).forEach(d => {
            te = roundMoney(te + (d.data().amount || 0));
        });
    }
    
    const np = roundMoney(ts - tc - te);
    document.getElementById('totalSalesStat').innerText = ts.toFixed(2) + ' ج';
    document.getElementById('totalExpensesStat').innerText = te.toFixed(2) + ' ج';
    const npEl = document.getElementById('netProfitStat');
    npEl.innerText = np.toFixed(2) + ' ج';
    npEl.style.color = np >= 0 ? 'var(--success)' : 'var(--danger)';
    
    await loadSmartAnalytics(start, end);
}

async function loadSmartAnalytics(start, end) {
    await loadTopSellers(start, end);
    await loadDormantProducts();
}

async function loadTopSellers(start, end) {
    const list = document.getElementById('topSellersList');
    if (!list) return;
    list.innerHTML = '<li class="analytics-empty">جاري تحليل المبيعات...</li>';
    
    try {
        let snap;
        if (start) {
            const q = query(collection(db, "invoices"), where("timestamp", ">=", start), where("timestamp", "<=", end));
            snap = await getDocs(q);
        } else {
            snap = await getDocs(collection(db, "invoices"));
        }
        
        const productSales = {};
        
        snap.forEach(doc => {
            const inv = doc.data();
            if (inv.items) {
                inv.items.forEach(item => {
                    const key = item.productId || item.name;
                    if (!productSales[key]) {
                        productSales[key] = { name: item.name, qty: 0 };
                    }
                    productSales[key].qty += (item.qty || 0);
                });
            }
        });
        
        const sorted = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 5);
        list.innerHTML = '';
        
        if (sorted.length === 0) {
            list.innerHTML = '<li class="analytics-empty">لا توجد مبيعات كافية بعد</li>';
            return;
        }
        
        sorted.forEach((item) => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="item-name">${item.name}</span><span class="item-stat">${item.qty} وحدة</span>`;
            list.appendChild(li);
        });
    } catch (error) {
        list.innerHTML = '<li class="analytics-empty">خطأ في تحميل البيانات</li>';
    }
}

async function loadDormantProducts() {
    const list = document.getElementById('dormantProductsList');
    if (!list) return;
    
    list.innerHTML = '<li class="analytics-empty">جاري تحليل المنتجات...</li>';
    
    try {
        const invoiceSnap = await getDocs(collection(db, "invoices"));
        const soldProductIds = new Set();
        
        invoiceSnap.forEach(doc => {
            const inv = doc.data();
            if (inv.items) {
                inv.items.forEach(item => {
                    if (item.productId) soldProductIds.add(item.productId);
                });
            }
        });
        
        const productSnap = await getDocs(collection(db, "products"));
        const dormant = [];
        
        productSnap.forEach(doc => {
            const p = doc.data();
            if (p.quantity === -99999) return;
            if (!soldProductIds.has(doc.id) && p.quantity > 0) {
                dormant.push({ name: p.name, qty: p.quantity });
            }
        });
        
        dormant.sort((a, b) => a.qty - b.qty);
        const topDormant = dormant.slice(0, 5);
        
        list.innerHTML = '';
        
        if (topDormant.length === 0) {
            list.innerHTML = '<li class="analytics-empty">✅ كل المنتجات تم بيعها - أداء ممتاز</li>';
            return;
        }
        
        topDormant.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="item-name">📦 ${item.name}</span><span class="item-stat">${item.qty} متبقية</span>`;
            list.appendChild(li);
        });
    } catch (error) {
        list.innerHTML = '<li class="analytics-empty">خطأ في تحميل البيانات</li>';
    }
}

document.getElementById('statsFilter')?.addEventListener('change', function() {
    const customDiv = document.getElementById('customDateRange');
    if (this.value === 'custom') {
        customDiv.style.display = 'flex';
    } else {
        customDiv.style.display = 'none';
    }
});

async function loadSalesReport(filter = 'all') {
    const tbody = document.getElementById('salesReportBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">جاري التحميل...</td></tr>';
    const { start, end } = await getDateRange(filter);
    
    let snap;
    if (start) {
        const q = query(collection(db, "invoices"), where("timestamp", ">=", start), where("timestamp", "<=", end));
        snap = await getDocs(q);
    } else {
        snap = await getDocs(collection(db, "invoices"));
    }
    
    const invoices = [];
    snap.forEach(d => { invoices.push(d.data()); });
    invoices.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    tbody.innerHTML = '';
    invoices.forEach(inv => {
        tbody.innerHTML += `<tr><td>${formatDate(inv.timestamp)}</td><td>${inv.cashier||''}</td><td>${inv.totalSales||0} ج</td></tr>`;
    });
    if (!invoices.length) tbody.innerHTML = '<tr><td colspan="3">لا توجد بيانات</td></tr>';
}

async function loadExpensesReport(filter = 'all') {
    const tbody = document.getElementById('expensesReportBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">جاري التحميل...</td></tr>';
    const { start, end } = await getDateRange(filter);
    
    let snap;
    if (start) {
        const q = query(collection(db, "expenses"), where("date", ">=", start), where("date", "<=", end));
        snap = await getDocs(q);
    } else {
        snap = await getDocs(collection(db, "expenses"));
    }
    
    const expenses = [];
    snap.forEach(d => { const data = d.data(); data.id = d.id; expenses.push(data); });
    expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = '';
    expenses.forEach(exp => {
        tbody.innerHTML += `<tr><td>${formatDate(exp.date)}</td><td>${exp.title}</td><td>${exp.amount} ج</td></tr>`;
    });
    if (!expenses.length) tbody.innerHTML = '<tr><td colspan="3">لا توجد بيانات</td></tr>';
}

async function loadProfitsReport(filter = 'all') {
    const tbody = document.getElementById('profitsReportBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">جاري التحميل...</td></tr>';
    const { start, end } = await getDateRange(filter);
    
    let invSnap, expSnap;
    if (start) {
        const invQ = query(collection(db, "invoices"), where("timestamp", ">=", start), where("timestamp", "<=", end));
        invSnap = await getDocs(invQ);
        const expQ = query(collection(db, "expenses"), where("date", ">=", start), where("date", "<=", end));
        expSnap = await getDocs(expQ);
    } else {
        invSnap = await getDocs(collection(db, "invoices"));
        expSnap = await getDocs(collection(db, "expenses"));
    }
    
    let ts = 0, tc = 0, te = 0;
    invSnap.forEach(d => { const data = d.data(); ts = roundMoney(ts + (data.totalSales||0)); tc = roundMoney(tc + (data.totalCost||0)); });
    expSnap.forEach(d => { te = roundMoney(te + (d.data().amount||0)); });
    
    const np = roundMoney(ts - tc - te);
    tbody.innerHTML = `<tr><td>${ts.toFixed(2)} ج</td><td>${tc.toFixed(2)} ج</td><td style="color:${np>=0?'var(--success)':'var(--danger)'};">${np.toFixed(2)} ج</td></tr>`;
}

document.getElementById('salesFilter')?.addEventListener('change', e => loadSalesReport(e.target.value));
document.getElementById('expensesFilter')?.addEventListener('change', e => loadExpensesReport(e.target.value));
document.getElementById('profitsFilter')?.addEventListener('change', e => loadProfitsReport(e.target.value));

document.getElementById('addExpenseFromReportBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('expenseTitleReport').value.trim();
    const amount = roundMoney(parseFloat(document.getElementById('expenseAmountReport').value));
    if (!title || isNaN(amount) || amount <= 0) return alert("بيانات غير صحيحة");
    await addDoc(collection(db, "expenses"), { title, amount, date: new Date().toISOString() });
    alert("تم");
    document.getElementById('expenseTitleReport').value = '';
    document.getElementById('expenseAmountReport').value = '';
    loadExpensesReport(document.getElementById('expensesFilter')?.value || 'all');
});

async function loadShifts() {
    const tbody = document.getElementById('shiftsBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4">جاري التحميل...</td></tr>';
    const shifts = [];
    (await getDocs(collection(db, "shifts"))).forEach(d => { const data = d.data(); data.id = d.id; shifts.push(data); });
    shifts.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    tbody.innerHTML = '';
    shifts.forEach(s => {
        const statusClass = s.status === 'زيادة' ? 'shift-surplus' : 'shift-deficit';
        tbody.innerHTML += `<tr style="cursor:pointer;" onclick="window.viewShiftDetails('${s.id}')">
            <td>${s.cashierName||''}</td>
            <td>${formatDate(s.startTime)}</td>
            <td>${formatDate(s.endTime)}</td>
            <td><span class="shift-status-badge ${statusClass}">${s.difference} ج (${s.status||''})</span></td>
        </tr>`;
    });
    if (!shifts.length) tbody.innerHTML = '<tr><td colspan="4">لا توجد ورديات</td></tr>';
}

window.viewShiftDetails = async (id) => {
    const shiftsSnap = await getDocs(collection(db, "shifts"));
    let shift = null;
    shiftsSnap.forEach(d => {
        const data = d.data();
        if (d.id === id) { data.id = d.id; shift = data; }
    });
    
    if (!shift) return alert("الوردية غير موجودة");
    
    let details = `📋 تقرير الوردية الكامل\n`;
    details += `━━━━━━━━━━━━━━━━━\n`;
    details += `👤 الكاشير: ${shift.cashierName}\n`;
    details += `📅 البداية: ${formatDate(shift.startTime)}\n`;
    details += `📅 النهاية: ${formatDate(shift.endTime)}\n`;
    details += `━━━━━━━━━━━━━━━━━\n`;
    details += `💵 العهدة المستلمة: ${shift.startCash} ج\n`;
    details += `🛒 إجمالي المبيعات: ${shift.sales} ج\n`;
    details += `📤 مسحوبات الإدارة: ${shift.drops} ج\n`;
    details += `🧾 مصروفات الكاشير: ${shift.cashierExpenses||0} ج\n`;
    details += `━━━━━━━━━━━━━━━━━\n`;
    details += `💰 النقدية المتوقعة: ${shift.expectedCash} ج\n`;
    details += `💳 النقدية الفعلية: ${shift.actualCash} ج\n`;
    details += `📊 الفرق: ${shift.difference} ج (${shift.status})\n`;
    
    alert(details);
};

async function loadInvoices() {
    const tbody = document.getElementById('invoicesBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">جاري التحميل...</td></tr>';
    const invoices = [];
    (await getDocs(collection(db, "invoices"))).forEach(d => { const data = d.data(); data.id = d.id; invoices.push(data); });
    invoices.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    tbody.innerHTML = '';
    invoices.slice(0, 100).forEach(inv => {
        tbody.innerHTML += `<tr style="cursor:pointer;" onclick="window.viewInvoiceDetails('${inv.id}')">
            <td>${formatDate(inv.timestamp)}</td>
            <td>${inv.cashier||''}</td>
            <td><span class="invoice-amount">${inv.totalSales||0} ج</span></td>
        </tr>`;
    });
    if (!invoices.length) tbody.innerHTML = '<tr><td colspan="3">لا توجد فواتير</td></tr>';
}

window.viewInvoiceDetails = async (id) => {
    const snap = await getDoc(doc(db, "invoices", id));
    if (snap.exists()) {
        const inv = snap.data();
        let details = `📋 تفاصيل الفاتورة\n`;
        details += `━━━━━━━━━━━━━━━━━\n`;
        details += `📅 التاريخ: ${formatDate(inv.timestamp)}\n`;
        details += `👤 الكاشير: ${inv.cashier}\n`;
        details += `📦 عدد الأصناف: ${inv.items.length}\n`;
        details += `━━━━━━━━━━━━━━━━━\n`;
        details += `المنتجات:\n`;
        inv.items.forEach((item, i) => {
            details += `  ${i+1}. ${item.name}\n`;
            details += `     ${item.qty} × ${item.price} = ${roundMoney(item.price * item.qty)} ج\n`;
        });
        details += `━━━━━━━━━━━━━━━━━\n`;
        details += `💰 الإجمالي: ${inv.totalSales} ج\n`;
        if (inv.totalCost) {
            details += `📊 التكلفة: ${inv.totalCost} ج\n`;
            details += `💎 الربح: ${roundMoney(inv.totalSales - inv.totalCost)} ج\n`;
        }
        alert(details);
    }
};

// ==========================================
// 21. القائمة الجانبية والصوتيات
// ==========================================
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
function openSidebar() { sidebar?.classList.add('active'); sidebarOverlay?.classList.add('active'); }
function closeSidebar() { sidebar?.classList.remove('active'); sidebarOverlay?.classList.remove('active'); }
document.getElementById('menuBtn')?.addEventListener('click', openSidebar);
document.getElementById('closeSidebarBtn')?.addEventListener('click', closeSidebar);
sidebarOverlay?.addEventListener('click', closeSidebar);

window.playSound = (type) => {
    try {
        const s = document.getElementById(type === 'success' ? 'successSound' : 'errorSound');
        if (s) { s.currentTime = 0; s.play().catch(() => {}); }
    } catch(e) {}
};

// ==========================================
// 22. الكاميرات - مع إصلاح تسرب الذاكرة
// ==========================================
function setupCamera(btnId, divId, inputId, checkId, callback) {
    const btn = document.getElementById(btnId), div = document.getElementById(divId), input = document.getElementById(inputId), check = document.getElementById(checkId);
    if (!btn || !div || !input) return;
    let qrCode = null, open = false;
    
    if (check) {
        if (localStorage.getItem(`${checkId}_checked`) === 'true') check.checked = true;
        check.addEventListener('change', () => localStorage.setItem(`${checkId}_checked`, check.checked));
    }
    
    btn.addEventListener('click', () => {
        if (!window.Html5Qrcode) return alert("الكاميرا لم تجهز بعد");
        if (open) {
            stopAndClearCamera();
        } else {
            startCamera();
        }
    });
    
    function startCamera() {
        div.style.display = 'block';
        qrCode = new window.Html5Qrcode(divId);
        qrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: { width: 250, height: 100 } },
            (text) => {
                input.value = text;
                if (check?.checked) { 
                    stopAndClearCamera();
                }
                if (callback) callback(text);
            }, 
            () => {}
        ).then(() => { 
            open = true; 
            btn.innerHTML = '❌'; 
        }).catch((err) => { 
            alert("تعذر فتح الكاميرا. تأكد من السماح بالوصول.");
            stopAndClearCamera();
        });
    }
    
    function stopAndClearCamera() {
        if (qrCode) {
            qrCode.stop().then(() => {
                qrCode.clear();
                qrCode = null;
            }).catch(() => {
                if (qrCode) {
                    try { qrCode.clear(); } catch(e) {}
                    qrCode = null;
                }
            });
        }
        div.style.display = 'none';
        open = false;
        btn.innerHTML = '📷';
    }
}

// ==========================================
// 23. الحماية
// ==========================================
(function() {
    document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F12' || e.keyCode === 123) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) { e.preventDefault(); return false; }
        if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) { e.preventDefault(); return false; }
        if (e.ctrlKey && (e.key === 'S' || e.key === 's' || e.keyCode === 83)) { e.preventDefault(); return false; }
    });
})();

// ==========================================
// 24. تهيئة الصفحة
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    enforceCloudSubscriptionLogic();
    initFloatingButton();
    initScanModeToggle();
    initQuickItemsToggle();
    initSearchDropdown();
    
    const observer = new MutationObserver(() => {
        updateFloatingButtonVisibility();
    });
    if (posSection) observer.observe(posSection, { attributes: true, attributeFilter: ['style'] });
    if (adminSection) observer.observe(adminSection, { attributes: true, attributeFilter: ['style'] });
    
    hideAllModals();
    updateFloatingButtonVisibility();
    
    const saved = localStorage.getItem('activeShift');
    if (saved) {
        try {
            currentShift = JSON.parse(saved);
            if (currentShift.active) {
                document.getElementById('shiftInfoDisplay').innerText = `الكاشير: ${currentShift.cashierName} | العهدة: ${currentShift.startCash} ج`;
                startShiftModal.style.display = 'none';
                posSection.style.display = 'block';
                document.getElementById('barcodeInput')?.focus();
                loadQuickItems();
                updateFloatingButtonVisibility();
                
                syncShiftToFirestore();
                return;
            }
        } catch(e) { localStorage.removeItem('activeShift'); }
    }
    
    if (!currentShift.active) {
        const backupShift = await loadShiftFromFirestore(
            JSON.parse(localStorage.getItem('lastCashierName') || '""')
        );
        if (backupShift && backupShift.active) {
            currentShift = backupShift;
            await saveShiftLocally();
            document.getElementById('shiftInfoDisplay').innerText = `الكاشير: ${currentShift.cashierName} | العهدة: ${currentShift.startCash} ج`;
            startShiftModal.style.display = 'none';
            posSection.style.display = 'block';
            document.getElementById('barcodeInput')?.focus();
            loadQuickItems();
            updateFloatingButtonVisibility();
            return;
        }
        
        startShiftModal.style.display = 'flex'; 
        posSection.style.display = 'block'; 
    }
    
    setTimeout(() => {
        setupCamera('startCameraBtn', 'reader', 'barcodeInput', 'autoCloseCameraCheckbox', () => barcodeInput?.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' })));
        setupCamera('startProdCameraBtn', 'prodReader', 'prodBarcode', '', () => document.getElementById('prodName')?.focus());
        setupCamera('startRestockCameraBtn', 'restockReader', 'restockBarcode', '', (t) => lookupProductForRestock(t));
    }, 1000);
});
