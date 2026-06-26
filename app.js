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
const ADMIN_PASSWORD = "1234";
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
    'quickItemsAdminTab', 'salesReportTab', 'expensesReportTab', 'profitsReportTab',
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
// ✅ 6. نظام الفحص السحابي (Cloud Verification)
// ==========================================
async function enforceCloudSubscriptionLogic() {
    try {
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

        if (proResponse && proResponse.ok) {
            const proData = await proResponse.json();
            isProValid = proData.active && proData.remaining_days > 0;
        }

        // 🚨 الطرد الإجباري إذا انتهى اشتراك PRO
        if (!isProValid) {
            window.location.href = "subscribe.html";
            return;
        }
      
updateSubscriptionUI(proDays);

        if (maxResponse && maxResponse.ok) {
            const maxData = await maxResponse.json();
            isMaxValid = maxData.active && maxData.remaining_days > 0;
        }

        // 🚨 إخفاء عنصر MAX من القائمة إذا لم يكن مجدداً
        const maxSidebarItem = document.getElementById('navLitePosBtn');
        if (maxSidebarItem) {
            maxSidebarItem.style.display = isMaxValid ? '' : 'none';
        }

        // ✅ إخفاء القائمة السريعة بشكل افتراضي
        const quickItemsGrid = document.getElementById('quickItemsGrid');
        if (quickItemsGrid) quickItemsGrid.style.display = 'none';

    } catch (error) {
        console.error("Subscription validation integration error.");
    }
}

// ==========================================
// ✅ 7. الزر العائم للكاميرا (Floating Camera Button)
// ==========================================
function initFloatingButton() {
    if (!document.getElementById('posSection')) return;
    if (document.getElementById('floatingCameraBtn')) return;
    
    const floatBtn = document.createElement('button');
    floatBtn.id = 'floatingCameraBtn';
    floatBtn.innerHTML = '📷';
    
    const savedStyles = JSON.parse(localStorage.getItem('floatingBtnStyles'));
    if (savedStyles) {
        floatBtn.style.cssText = savedStyles;
    } else {
        floatBtn.style.cssText = 'position: fixed; bottom: 80px; right: 20px; z-index: 1500; width: 56px; height: 56px; border-radius: 50%; background: #2563eb; color: white; border: none; font-size: 24px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); cursor: pointer; transition: none;';
    }
    
    document.body.appendChild(floatBtn);

    floatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('startCameraBtn')?.click();
    });

    let pressTimer;
    let isDragging = false;

    floatBtn.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
            isDragging = true;
            floatBtn.style.transition = 'none';
            floatBtn.style.opacity = '0.8';
        }, 3000);
    });

    floatBtn.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        floatBtn.style.left = 'auto';
        floatBtn.style.top = (touch.clientY - 28) + 'px';
        floatBtn.style.right = (window.innerWidth - touch.clientX - 28) + 'px';
    });

    floatBtn.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
        if (isDragging) {
            isDragging = false;
            floatBtn.style.opacity = '1';
            localStorage.setItem('floatingBtnStyles', JSON.stringify(floatBtn.style.cssText));
        }
    });
}

// ==========================================
// ✅ 8. إصلاح زر وضع المسح (Scan Mode Toggle)
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
// ✅ 9. زر إظهار/إخفاء القائمة السريعة
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
// 10. التنقل بين شاشة البيع والإدارة
// ==========================================
navPosBtn?.addEventListener('click', () => {
    posSection.style.display = 'block';
    adminSection.style.display = 'none';
    updateSidebarActive('navPosBtn');
    
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

function verifyPassword() {
    const input = document.getElementById('adminPasswordInput').value;
    if (input === ADMIN_PASSWORD) {
        isAdminLoggedIn = true;
        authModal.style.display = 'none';
        posSection.style.display = 'none';
        adminSection.style.display = 'block';
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
    'navExpensesBtn': ['expensesTab', 'navExpensesBtn'],
    'navCashiersBtn': ['cashiersTab', 'navCashiersBtn'],
    'navStatsBtn': ['statsTab', 'navStatsBtn'],
    'navRestockBtn': ['restockTab', 'navRestockBtn'],
    'navQuickItemsAdminBtn': ['quickItemsAdminTab', 'navQuickItemsAdminBtn'],
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
// 11. إدارة الوردية
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
            localStorage.setItem('activeShift', JSON.stringify(currentShift));
            startShiftModal.style.display = 'none';
            document.getElementById('shiftInfoDisplay').innerText = `الكاشير: ${name} | العهدة: ${startCash} ج`;
            window.playSound('success');
            document.getElementById('barcodeInput')?.focus();
            loadQuickItems();
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

document.getElementById('confirmDropBtn')?.addEventListener('click', () => {
    if (!isAdminLoggedIn) return alert("يجب تسجيل دخول المدير أولاً!");
    const amount = parseFloat(document.getElementById('dropAmountInput').value);
    const pass = document.getElementById('dropAdminPassword').value;
    if (isNaN(amount) || amount <= 0 || !pass) return alert("بيانات غير صحيحة");
    
    const available = currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0);
    if (amount > available) return alert(`الرصيد المتاح (${available} ج) لا يكفي`);
    if (pass !== ADMIN_PASSWORD) return alert("كلمة مرور المدير غير صحيحة!");
    
    currentShift.drops += amount;
    localStorage.setItem('activeShift', JSON.stringify(currentShift));
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
    
    const available = currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0);
    if (amount > available) return alert(`الرصيد المتاح (${available} ج) لا يكفي`);
    
    currentShift.cashierExpenses += amount;
    localStorage.setItem('activeShift', JSON.stringify(currentShift));
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
    document.getElementById('reportExpectedCash').innerText = currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0);
    document.getElementById('endShiftModal').style.display = 'flex';
    closeSidebar();
});
document.getElementById('closeEndShiftBtn')?.addEventListener('click', () => document.getElementById('endShiftModal').style.display = 'none');

document.getElementById('confirmEndShiftBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('confirmEndShiftBtn');
    btn.innerText = "جاري الحفظ...";
    btn.disabled = true;
    try {
        const expected = currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0);
        const actualInput = prompt("النقدية الفعلية بالدرج:", expected);
        const actual = parseFloat(actualInput) || expected;
        const diff = actual - expected;
        
        await addDoc(collection(db, "shifts"), {
            ...currentShift, endTime: new Date().toISOString(),
            actualCash: actual, expectedCash: expected, difference: diff,
            status: diff >= 0 ? 'زيادة' : 'عجز'
        });
        
        currentShift = { active: false, cashierName: "", startCash: 0, sales: 0, drops: 0, cashierExpenses: 0, startTime: null };
        localStorage.removeItem('activeShift');
        document.getElementById('shiftInfoDisplay').innerText = '';
        document.getElementById('endShiftModal').style.display = 'none';
        startShiftModal.style.display = 'flex';
        document.getElementById('cashierPasswordInput').value = '';
        document.getElementById('startCashInput').value = '';
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
// 12. المخزن
// ==========================================
document.getElementById('addProductForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerText = "جاري الإضافة...";
    btn.disabled = true;
    try {
        await addDoc(collection(db, "products"), {
            barcode: document.getElementById('prodBarcode').value,
            name: document.getElementById('prodName').value,
            buyPrice: parseFloat(document.getElementById('prodBuyPrice').value),
            sellPrice: parseFloat(document.getElementById('prodSellPrice').value),
            quantity: parseInt(document.getElementById('prodQty').value),
            minAlert: parseInt(document.getElementById('prodMinAlert').value),
            image: "",
            searchKey: [normalizeText(document.getElementById('prodName').value), normalizeText(document.getElementById('prodBarcode').value)]
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
    tbody.innerHTML = '<tr><td colspan="6">جاري التحميل...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "products"));
        productsList = [];
        tbody.innerHTML = '';
        snap.forEach(doc => {
            let p = doc.data(); p.id = doc.id;
            if (p.quantity === -99999) return;
            productsList.push(p);
            tbody.innerHTML += `<tr class="${p.quantity <= p.minAlert ? 'low-stock' : ''}">
                <td>${p.barcode}</td><td>${p.name}</td><td>${p.quantity}</td>
                <td>${p.buyPrice}</td><td>${p.sellPrice}</td>
                <td><button onclick="window.editProduct('${p.id}')" class="btn-sm btn-outline-primary" style="margin-left:4px;">تعديل</button>
                <button onclick="window.deleteProduct('${p.id}')" class="btn-sm" style="background:var(--danger);color:white;">حذف</button></td></tr>`;
        });
    } catch(e) { tbody.innerHTML = '<tr><td colspan="6">خطأ</td></tr>'; }
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
        await updateDoc(doc(db, "products", id), { name, sellPrice: parseFloat(price), searchKey: [normalizeText(name), normalizeText(p.barcode || '')] });
        alert("تم التعديل");
        loadInventory();
    } catch(e) { alert("خطأ"); }
};

window.deleteProduct = async function(id) {
    if (confirm("حذف المنتج؟")) {
        await updateDoc(doc(db, "products", id), { quantity: -99999 });
        alert("تم الحذف");
        loadInventory();
    }
};

// ==========================================
// 13. تزويد بضاعة
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
    const newBuy = parseFloat(document.getElementById('restockNewBuyPrice').value) || 0;
    const newSell = parseFloat(document.getElementById('restockNewSellPrice').value) || 0;
    if (isNaN(addQty) || addQty <= 0) return alert("كمية غير صالحة");
    try {
        const snap = await getDocs(query(collection(db, "products"), where("barcode", "==", barcode), limit(1)));
        if (snap.empty) return alert("غير موجود");
        const d = snap.docs[0], p = d.data();
        if (p.quantity === -99999) return alert("محذوف");
        let upd = { quantity: increment(addQty) };
        if (newBuy > 0 && p.buyPrice > 0 && p.quantity > 0) {
            upd.buyPrice = Math.round(((p.buyPrice * p.quantity + newBuy * addQty) / (p.quantity + addQty)) * 100) / 100;
        } else if (newBuy > 0) upd.buyPrice = newBuy;
        if (newSell > 0) upd.sellPrice = newSell;
        await updateDoc(doc(db, "products", d.id), upd);
        document.getElementById('restockForm').reset();
        document.getElementById('restockProdName').value = '';
        alert(`تم تزويد ${p.name}. الكمية: ${p.quantity + addQty}`);
        loadInventory();
    } catch(e) { alert("خطأ"); }
});

// ==========================================
// 14. الكاشيرية
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
// 15. شاشة البيع
// ==========================================
const barcodeInput = document.getElementById('barcodeInput');
barcodeInput?.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const code = barcodeInput.value.trim();
        if (!code) return;
        if (barcodeDebounceTimers[code]) return;
        barcodeDebounceTimers[code] = true;
        setTimeout(() => delete barcodeDebounceTimers[code], 4000);
        
        const ns = normalizeText(code);
        const local = productsList.find(p => (p.barcode === code || (p.searchKey && p.searchKey.includes(ns))) && p.quantity !== -99999);
        if (local) { addToCart({...local}); barcodeInput.value = ''; return; }
        
        try {
            let found = false;
            const s1 = await getDocs(query(collection(db, "products"), where("barcode", "==", code), limit(1)));
            if (!s1.empty) { const p = s1.docs[0].data(); p.id = s1.docs[0].id; if (p.quantity !== -99999) { addToCart(p); found = true; } }
            if (!found) {
                const s2 = await getDocs(query(collection(db, "products"), where("searchKey", "array-contains", ns), limit(1)));
                if (!s2.empty) { const p = s2.docs[0].data(); p.id = s2.docs[0].id; if (p.quantity !== -99999) { addToCart(p); found = true; } }
            }
            if (found) barcodeInput.value = '';
            else { window.playSound('error'); alert("غير موجود!"); }
        } catch(e) { window.playSound('error'); }
    }
});

document.getElementById('restockBarcode')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); lookupProductForRestock(e.target.value); }
});

// ==========================================
// 16. السلة والبيع
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
    cart.forEach((item, i) => {
        const it = item.sellPrice * item.cartQty;
        total += it;
        tbody.innerHTML += `<tr>
            <td>${item.name}</td><td>${item.sellPrice}</td>
            <td><div class="qty-cell">
                <button class="qty-btn" onclick="window.changeQty(${i}, -1)">−</button>
                <span class="qty-value">${item.cartQty}</span>
                <button class="qty-btn" onclick="window.changeQty(${i}, 1)">+</button>
            </div></td>
            <td>${it}</td>
            <td><button class="delete-btn" onclick="window.removeFromCart(${i})">🗑</button></td>
        </tr>`;
    });
    document.getElementById('cartTotal').innerText = total;
}

window.changeQty = (i, a) => {
    const n = cart[i].cartQty + a;
    if (n > 0 && n <= cart[i].quantity) { cart[i].cartQty = n; renderCart(); }
    else if (n <= 0) window.removeFromCart(i);
    else { window.playSound('error'); alert("الكمية لا تكفي"); }
};
window.removeFromCart = (i) => { cart.splice(i, 1); renderCart(); };

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
    const items = cart.map(i => { ts += i.sellPrice * i.cartQty; tc += i.buyPrice * i.cartQty; return { productId: i.id, name: i.name, qty: i.cartQty, price: i.sellPrice }; });
    try {
        const batch = writeBatch(db);
        batch.set(doc(collection(db, "invoices")), { timestamp: new Date().toISOString(), cashier: currentShift.cashierName, items, totalSales: ts, totalCost: tc });
        cart.forEach(i => batch.update(doc(db, "products", i.id), { quantity: increment(-i.cartQty) }));
        await batch.commit();
        currentShift.sales += ts;
        localStorage.setItem('activeShift', JSON.stringify(currentShift));
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
// 17. القائمة السريعة
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
        btn.innerHTML = `${item.image ? `<img src="${item.image}" alt="">` : ''}<span>${item.name}</span>`;
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
// 18. المصروفات والتقارير
// ==========================================
document.getElementById('addExpenseForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "expenses"), { title: document.getElementById('expTitle').value, amount: parseFloat(document.getElementById('expAmount').value), date: new Date().toISOString() });
    alert("تم");
    document.getElementById('addExpenseForm').reset();
});

async function loadStats() {
    let ts = 0, tc = 0, te = 0;
    (await getDocs(collection(db, "invoices"))).forEach(d => { ts += d.data().totalSales || 0; tc += d.data().totalCost || 0; });
    (await getDocs(collection(db, "expenses"))).forEach(d => { te += d.data().amount || 0; });
    const np = ts - tc - te;
    document.getElementById('totalSalesStat').innerText = ts.toFixed(2) + ' ج';
    document.getElementById('totalExpensesStat').innerText = te.toFixed(2) + ' ج';
    const npEl = document.getElementById('netProfitStat');
    npEl.innerText = np.toFixed(2) + ' ج';
    npEl.style.color = np >= 0 ? 'var(--success)' : 'var(--danger)';
    
    await loadSmartAnalytics();
}

async function loadSmartAnalytics() {
    await loadTopSellers();
    await loadDormantProducts();
}

async function loadTopSellers() {
    const list = document.getElementById('topSellersList');
    if (!list) return;
    
    list.innerHTML = '<li class="analytics-empty">جاري تحليل المبيعات...</li>';
    
    try {
        const snap = await getDocs(collection(db, "invoices"));
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
        
        const sorted = Object.values(productSales)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);
        
        list.innerHTML = '';
        
        if (sorted.length === 0) {
            list.innerHTML = '<li class="analytics-empty">لا توجد مبيعات كافية بعد</li>';
            return;
        }
        
        const medals = ['🥇', '🥈', '🥉', '⭐', '📌'];
        
        sorted.forEach((item, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="item-name">${medals[index] || '•'} ${item.name}</span>
                <span class="item-stat">${item.qty} وحدة</span>
            `;
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
            li.innerHTML = `
                <span class="item-name">📦 ${item.name}</span>
                <span class="item-stat">${item.qty} متبقية</span>
            `;
            list.appendChild(li);
        });
        
    } catch (error) {
        list.innerHTML = '<li class="analytics-empty">خطأ في تحميل البيانات</li>';
    }
}

function getDateRange(filter) {
    const now = new Date();
    let start = null;
    const end = now.toISOString();
    switch(filter) {
        case 'today': start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(); break;
        case 'yesterday': const y = new Date(now); y.setDate(y.getDate()-1); start = new Date(y.getFullYear(), y.getMonth(), y.getDate()).toISOString(); break;
        case 'week': start = new Date(now.getTime() - 7*86400000).toISOString(); break;
        case 'month': start = new Date(now.getTime() - 30*86400000).toISOString(); break;
        case '3months': start = new Date(now.getTime() - 90*86400000).toISOString(); break;
        case '6months': start = new Date(now.getTime() - 180*86400000).toISOString(); break;
        case 'year': start = new Date(now.getTime() - 365*86400000).toISOString(); break;
    }
    return { start, end };
}

async function loadSalesReport(filter = 'all') {
    const tbody = document.getElementById('salesReportBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">جاري التحميل...</td></tr>';
    const { start, end } = getDateRange(filter);
    const invoices = [];
    (await getDocs(collection(db, "invoices"))).forEach(d => {
        const data = d.data();
        if (!start || (data.timestamp >= start && data.timestamp <= end)) invoices.push(data);
    });
    invoices.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    tbody.innerHTML = '';
    let total = 0;
    invoices.forEach(inv => {
        total += inv.totalSales || 0;
        tbody.innerHTML += `<tr><td>${formatDate(inv.timestamp)}</td><td>${inv.cashier||''}</td><td>${inv.items?inv.items.length:0}</td><td>${inv.totalSales||0}</td><td>${inv.totalCost||0}</td><td>${(inv.totalSales||0)-(inv.totalCost||0)}</td></tr>`;
    });
    if (!invoices.length) tbody.innerHTML = '<tr><td colspan="6">لا توجد بيانات</td></tr>';
    document.getElementById('salesReportTotal').innerText = total.toFixed(2) + ' ج';
}

async function loadExpensesReport(filter = 'all') {
    const tbody = document.getElementById('expensesReportBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4">جاري التحميل...</td></tr>';
    const { start, end } = getDateRange(filter);
    const expenses = [];
    (await getDocs(collection(db, "expenses"))).forEach(d => {
        const data = d.data(); data.id = d.id;
        if (!start || (data.date >= start && data.date <= end)) expenses.push(data);
    });
    expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = '';
    let total = 0;
    expenses.forEach(exp => {
        total += exp.amount || 0;
        tbody.innerHTML += `<tr><td>${formatDate(exp.date)}</td><td>${exp.title}</td><td>${exp.amount}</td><td><button onclick="window.deleteExpense('${exp.id}')" class="btn-sm" style="background:var(--danger);color:white;">حذف</button></td></tr>`;
    });
    if (!expenses.length) tbody.innerHTML = '<tr><td colspan="4">لا توجد بيانات</td></tr>';
    document.getElementById('expensesReportTotal').innerText = total.toFixed(2) + ' ج';
}
window.deleteExpense = async (id) => {
    if (confirm("حذف المصروف؟")) { await deleteDoc(doc(db, "expenses", id)); loadExpensesReport(document.getElementById('expensesFilter')?.value || 'all'); }
};

async function loadProfitsReport(filter = 'all') {
    const tbody = document.getElementById('profitsReportBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">جاري التحميل...</td></tr>';
    const { start, end } = getDateRange(filter);
    let ts = 0, tc = 0, te = 0, count = 0;
    (await getDocs(collection(db, "invoices"))).forEach(d => {
        const data = d.data();
        if (!start || (data.timestamp >= start && data.timestamp <= end)) { ts += data.totalSales||0; tc += data.totalCost||0; count++; }
    });
    (await getDocs(collection(db, "expenses"))).forEach(d => {
        const data = d.data();
        if (!start || (data.date >= start && data.date <= end)) te += data.amount||0;
    });
    const np = ts - tc - te;
    tbody.innerHTML = `<tr><td>${count}</td><td>${ts.toFixed(2)}</td><td>${tc.toFixed(2)}</td><td>${te.toFixed(2)}</td><td style="color:${np>=0?'var(--success)':'var(--danger)'};">${np.toFixed(2)}</td></tr>`;
}

document.getElementById('salesFilter')?.addEventListener('change', e => loadSalesReport(e.target.value));
document.getElementById('expensesFilter')?.addEventListener('change', e => loadExpensesReport(e.target.value));
document.getElementById('profitsFilter')?.addEventListener('change', e => loadProfitsReport(e.target.value));

document.getElementById('addExpenseFromReportBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('expenseTitleReport').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmountReport').value);
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
    tbody.innerHTML = '<tr><td colspan="8">جاري التحميل...</td></tr>';
    const shifts = [];
    (await getDocs(collection(db, "shifts"))).forEach(d => shifts.push(d.data()));
    shifts.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    tbody.innerHTML = '';
    shifts.forEach(s => {
        tbody.innerHTML += `<tr><td>${s.cashierName||''}</td><td>${formatDate(s.startTime)}</td><td>${formatDate(s.endTime)}</td><td>${s.startCash}</td><td>${s.sales}</td><td>${s.drops}</td><td>${s.expectedCash}</td><td style="color:${s.status==='زيادة'?'var(--success)':'var(--danger)'};">${s.difference} (${s.status||''})</td></tr>`;
    });
    if (!shifts.length) tbody.innerHTML = '<tr><td colspan="8">لا توجد ورديات</td></tr>';
}

async function loadInvoices() {
    const tbody = document.getElementById('invoicesBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">جاري التحميل...</td></tr>';
    const invoices = [];
    (await getDocs(collection(db, "invoices"))).forEach(d => { const data = d.data(); data.id = d.id; invoices.push(data); });
    invoices.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    tbody.innerHTML = '';
    let total = 0;
    invoices.slice(0, 100).forEach(inv => {
        total += inv.totalSales || 0;
        tbody.innerHTML += `<tr><td>${formatDate(inv.timestamp)}</td><td>${inv.cashier||''}</td><td>${inv.items?inv.items.length:0}</td><td>${inv.totalSales||0}</td><td><button onclick="window.viewInvoiceDetails('${inv.id}')" class="btn-sm btn-outline-primary">تفاصيل</button></td></tr>`;
    });
    if (!invoices.length) tbody.innerHTML = '<tr><td colspan="5">لا توجد فواتير</td></tr>';
    document.getElementById('invoicesTotal').innerText = total.toFixed(2) + ' ج';
}
window.viewInvoiceDetails = async (id) => {
    const snap = await getDoc(doc(db, "invoices", id));
    if (snap.exists()) {
        const inv = snap.data();
        let details = `فاتورة - ${formatDate(inv.timestamp)}\nالكاشير: ${inv.cashier}\n\n`;
        inv.items.forEach((item, i) => details += `${i+1}. ${item.name} x${item.qty} = ${item.price * item.qty} ج\n`);
        details += `\nالإجمالي: ${inv.totalSales} ج`;
        alert(details);
    }
};

// ==========================================
// 19. القائمة الجانبية والصوتيات
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
// 20. الكاميرات
// ==========================================
function setupCamera(btnId, divId, inputId, checkId, callback) {
    const btn = document.getElementById(btnId), div = document.getElementById(divId), input = document.getElementById(inputId), check = document.getElementById(checkId);
    if (!btn || !div || !input) return;
    let qrCode, open = false;
    if (check) {
        if (localStorage.getItem(`${checkId}_checked`) === 'true') check.checked = true;
        check.addEventListener('change', () => localStorage.setItem(`${checkId}_checked`, check.checked));
    }
    btn.addEventListener('click', () => {
        if (!window.Html5Qrcode) return alert("الكاميرا لم تجهز بعد");
        if (open) {
            qrCode.stop().then(() => { div.style.display = 'none'; open = false; btn.innerHTML = '📷'; });
        } else {
            div.style.display = 'block';
            qrCode = new window.Html5Qrcode(divId);
            qrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 100 } },
                (text) => {
                    input.value = text;
                    if (check?.checked) { qrCode.stop(); div.style.display = 'none'; open = false; btn.innerHTML = '📷'; }
                    if (callback) callback(text);
                }, () => {}
            ).then(() => { open = true; btn.innerHTML = '❌'; }).catch(() => { alert("اسمح بالكاميرا"); div.style.display = 'none'; });
        }
    });
}

// ==========================================
// 21. الحماية من جهة العميل
// ==========================================
(function() {
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F12' || e.keyCode === 123) {
            e.preventDefault();
            return false;
        }
        
        if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
            e.preventDefault();
            return false;
        }
        
        if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
            e.preventDefault();
            return false;
        }
        
        if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
            e.preventDefault();
            return false;
        }
        
        if (e.ctrlKey && (e.key === 'S' || e.key === 's' || e.keyCode === 83)) {
            e.preventDefault();
            return false;
        }
    });
    
    let devtoolsOpen = false;
    setInterval(function() {
        const widthThreshold = window.outerWidth - window.innerWidth > 160;
        const heightThreshold = window.outerHeight - window.innerHeight > 160;
        
        if (widthThreshold || heightThreshold) {
            if (!devtoolsOpen) {
                devtoolsOpen = true;
                console.clear();
            }
        } else {
            devtoolsOpen = false;
        }
    }, 1000);
})();

// ==========================================
// 22. تهيئة الصفحة
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // ✅ الفحص السحابي أولاً
    enforceCloudSubscriptionLogic();
    
    // ✅ تهيئة الزر العائم
    initFloatingButton();
    
    // ✅ تهيئة Toggle المسح
    initScanModeToggle();
    
    // ✅ تهيئة زر القائمة السريعة
    initQuickItemsToggle();
    
    hideAllModals();
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
                return;
            }
        } catch(e) { localStorage.removeItem('activeShift'); }
    }
    if (!currentShift.active) { startShiftModal.style.display = 'flex'; posSection.style.display = 'block'; }
    
    setTimeout(() => {
        setupCamera('startCameraBtn', 'reader', 'barcodeInput', 'autoCloseCameraCheckbox', () => barcodeInput?.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' })));
        setupCamera('startProdCameraBtn', 'prodReader', 'prodBarcode', '', () => document.getElementById('prodName')?.focus());
        setupCamera('startRestockCameraBtn', 'restockReader', 'restockBarcode', '', (t) => lookupProductForRestock(t));
    }, 1000);
});
