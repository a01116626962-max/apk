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
// 3. دوال مساعدة (Utility Functions)
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

function createSearchKey(name) {
    return normalizeText(name);
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
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

// ✅ دالة لتحديث التظليل في القائمة الجانبية
function updateSidebarActive(activeButtonId) {
    document.querySelectorAll('.sidebar-nav button').forEach(btn => {
        btn.classList.remove('active-nav');
    });
    document.querySelectorAll('.admin-sub-menu button').forEach(btn => {
        btn.classList.remove('active-sub');
    });
    
    const activeBtn = document.getElementById(activeButtonId);
    if (activeBtn) {
        activeBtn.classList.add('active-nav');
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
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.style.display = 'none';
    });
}

// ==========================================
// 5. التنقل بين شاشة البيع والإدارة
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
        document.getElementById('adminSubMenu').style.display = 'flex';
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
        document.getElementById('adminSubMenu').style.display = 'flex';
        loadInventory();
        window.playSound('success');
    } else {
        alert("كلمة المرور غير صحيحة!");
        window.playSound('error');
    }
}

// ✅ تفعيل التنقل بين التبويبات مع التظليل
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
            document.getElementById('restockProdName').value = '';
            break;
    }
}

// ربط أزرار القائمة الجانبية
document.getElementById('navInventoryBtn')?.addEventListener('click', () => {
    switchAdminTab('inventoryTab', 'navInventoryBtn');
    closeSidebar();
});

document.getElementById('navExpensesBtn')?.addEventListener('click', () => {
    switchAdminTab('expensesTab', 'navExpensesBtn');
    closeSidebar();
});

document.getElementById('navCashiersBtn')?.addEventListener('click', () => {
    switchAdminTab('cashiersTab', 'navCashiersBtn');
    closeSidebar();
});

document.getElementById('navStatsBtn')?.addEventListener('click', () => {
    switchAdminTab('statsTab', 'navStatsBtn');
    closeSidebar();
});

document.getElementById('navRestockBtn')?.addEventListener('click', () => {
    switchAdminTab('restockTab', 'navRestockBtn');
    closeSidebar();
});

document.getElementById('navQuickItemsAdminBtn')?.addEventListener('click', () => {
    switchAdminTab('quickItemsAdminTab', 'navQuickItemsAdminBtn');
    closeSidebar();
});

// ✅ أزرار التقارير الجديدة
document.getElementById('navSalesReportBtn')?.addEventListener('click', () => {
    switchAdminTab('salesReportTab', 'navSalesReportBtn');
    closeSidebar();
});

document.getElementById('navExpensesReportBtn')?.addEventListener('click', () => {
    switchAdminTab('expensesReportTab', 'navExpensesReportBtn');
    closeSidebar();
});

document.getElementById('navProfitsReportBtn')?.addEventListener('click', () => {
    switchAdminTab('profitsReportTab', 'navProfitsReportBtn');
    closeSidebar();
});

document.getElementById('navShiftsBtn')?.addEventListener('click', () => {
    switchAdminTab('shiftsTab', 'navShiftsBtn');
    closeSidebar();
});

document.getElementById('navInvoicesBtn')?.addEventListener('click', () => {
    switchAdminTab('invoicesTab', 'navInvoicesBtn');
    closeSidebar();
});

// ✅ أزرار المخزن الإضافية
document.getElementById('navLowStockBtn')?.addEventListener('click', () => {
    switchAdminTab('lowStockTab', 'navLowStockBtn');
    closeSidebar();
});

document.getElementById('navQuickItemsFromInventoryBtn')?.addEventListener('click', () => {
    switchAdminTab('quickItemsAdminTab', 'navQuickItemsFromInventoryBtn');
    closeSidebar();
});

document.getElementById('navCashierExpBtn')?.addEventListener('click', () => {
    if (!currentShift.active) {
        alert("لا توجد وردية مفتوحة!");
        return;
    }
    document.getElementById('cashierExpenseModal').style.display = 'flex';
    closeSidebar();
});

// ==========================================
// 6. إدارة الوردية
// ==========================================

document.getElementById('startShiftBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('cashierNameInput').value.trim();
    const pass = document.getElementById('cashierPasswordInput').value.trim();
    const startCash = parseFloat(document.getElementById('startCashInput').value);

    if (!name || !pass || isNaN(startCash)) {
        alert("برجاء استكمال جميع البيانات!");
        return;
    }

    const btn = document.getElementById('startShiftBtn');
    btn.innerText = "جاري التحقق...";
    btn.disabled = true;

    try {
        const q = query(collection(db, "cashiers"), where("name", "==", name), where("password", "==", pass));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            alert("اسم الكاشير أو كلمة المرور غير صحيحة!");
            window.playSound('error');
        } else {
            currentShift = {
                active: true,
                cashierName: name,
                startCash: startCash,
                sales: 0,
                drops: 0,
                cashierExpenses: 0,
                startTime: new Date().toISOString()
            };
            
            localStorage.setItem('activeShift', JSON.stringify(currentShift));
            
            startShiftModal.style.display = 'none';
            document.getElementById('shiftInfoDisplay').innerText = `الكاشير: ${name} | العهدة: ${startCash} ج`;
            window.playSound('success');
            document.getElementById('barcodeInput')?.focus();
            loadQuickItems();
        }
    } catch (error) {
        console.error("Shift Start Error:", error);
        alert("حدث خطأ في الاتصال بقاعدة البيانات.");
    } finally {
        btn.innerText = "استلام الوردية";
        btn.disabled = false;
    }
});

// نافذة سحب نقدية
const cashDropModal = document.getElementById('cashDropModal');
document.getElementById('navCashDropBtn')?.addEventListener('click', () => {
    if (!currentShift.active) {
        alert("لا توجد وردية مفتوحة!");
        return;
    }
    if (!isAdminLoggedIn) {
        alert("يجب تسجيل دخول المدير أولاً!");
        return;
    }
    cashDropModal.style.display = 'flex';
    closeSidebar();
});

document.getElementById('closeDropBtn')?.addEventListener('click', () => {
    cashDropModal.style.display = 'none';
});

document.getElementById('confirmDropBtn')?.addEventListener('click', () => {
    if (!isAdminLoggedIn) {
        alert("يجب تسجيل دخول المدير أولاً!");
        return;
    }
    
    const amount = parseFloat(document.getElementById('dropAmountInput').value);
    const pass = document.getElementById('dropAdminPassword').value;

    if (isNaN(amount) || amount <= 0 || !pass) {
        alert("برجاء إدخال المبلغ وكلمة المرور بشكل صحيح.");
        return;
    }

    const availableCash = currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0);
    if (amount > availableCash) {
        return alert(`الرصيد المتاح (${availableCash} ج) لا يكفي`);
    }

    if (pass === ADMIN_PASSWORD) {
        currentShift.drops += amount;
        localStorage.setItem('activeShift', JSON.stringify(currentShift));
        alert(`تم تسليم مبلغ ${amount} جنيه للمدير بنجاح.`);
        cashDropModal.style.display = 'none';
        document.getElementById('dropAmountInput').value = '';
        document.getElementById('dropAdminPassword').value = '';
        window.playSound('success');
    } else {
        alert("كلمة مرور المدير غير صحيحة!");
        window.playSound('error');
    }
});

// مصروفات الكاشير
document.getElementById('confirmCashierExpBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('cashierExpTitle').value.trim();
    const amount = parseFloat(document.getElementById('cashierExpAmount').value);
    
    if (!title || isNaN(amount) || amount <= 0) return alert("بيانات غير صحيحة");
    
    const availableCash = currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0);
    if (amount > availableCash) {
        return alert(`الرصيد المتاح (${availableCash} ج) لا يكفي`);
    }
    
    currentShift.cashierExpenses += amount;
    localStorage.setItem('activeShift', JSON.stringify(currentShift));
    
    try {
        await addDoc(collection(db, "cashierExpenses"), {
            title: title,
            amount: amount,
            cashier: currentShift.cashierName,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("خطأ في حفظ المصروف:", error);
    }
    
    document.getElementById('cashierExpenseModal').style.display = 'none';
    document.getElementById('cashierExpTitle').value = '';
    document.getElementById('cashierExpAmount').value = '';
    alert(`تم تسجيل مصروف ${title} بقيمة ${amount} ج`);
    window.playSound('success');
});

document.getElementById('closeCashierExpBtn')?.addEventListener('click', () => {
    document.getElementById('cashierExpenseModal').style.display = 'none';
});

// تقفيل الوردية
const endShiftModal = document.getElementById('endShiftModal');
document.getElementById('navEndShiftBtn')?.addEventListener('click', () => {
    if (!currentShift.active) return alert("لا توجد وردية مفتوحة!");
    
    document.getElementById('reportStartCash').innerText = currentShift.startCash;
    document.getElementById('reportSales').innerText = currentShift.sales;
    document.getElementById('reportDrops').innerText = currentShift.drops;
    document.getElementById('reportCashierExpenses').innerText = currentShift.cashierExpenses || 0;
    
    const expected = currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0);
    document.getElementById('reportExpectedCash').innerText = expected;

    endShiftModal.style.display = 'flex';
    closeSidebar();
});

document.getElementById('closeEndShiftBtn')?.addEventListener('click', () => {
    endShiftModal.style.display = 'none';
});

document.getElementById('confirmEndShiftBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('confirmEndShiftBtn');
    btn.innerText = "جاري الحفظ...";
    btn.disabled = true;

    try {
        const expectedCash = currentShift.startCash + currentShift.sales - currentShift.drops - (currentShift.cashierExpenses || 0);
        const actualCashInput = prompt("أدخل النقدية الفعلية الموجودة بالدرج الآن:", expectedCash);
        const actualCash = parseFloat(actualCashInput);
        
        const difference = (actualCash || expectedCash) - expectedCash;

        const shiftData = {
            ...currentShift,
            endTime: new Date().toISOString(),
            actualCash: actualCash || expectedCash,
            expectedCash: expectedCash,
            difference: difference || 0,
            status: (difference || 0) >= 0 ? 'زيادة' : 'عجز'
        };
        
        await addDoc(collection(db, "shifts"), shiftData);

        currentShift = { active: false, cashierName: "", startCash: 0, sales: 0, drops: 0, cashierExpenses: 0, startTime: null };
        localStorage.removeItem('activeShift');
        document.getElementById('shiftInfoDisplay').innerText = '';
        endShiftModal.style.display = 'none';
        startShiftModal.style.display = 'flex';
        
        document.getElementById('cashierPasswordInput').value = '';
        document.getElementById('startCashInput').value = '';
        
        window.playSound('success');
        const diffMsg = (difference || 0) >= 0 ? `زيادة: ${Math.abs(difference || 0)} ج` : `عجز: ${Math.abs(difference || 0)} ج`;
        alert(`تم تقفيل الوردية بنجاح. ${diffMsg}`);
    } catch (error) {
        console.error("End Shift Error:", error);
        alert("حدث خطأ أثناء حفظ تقرير الوردية!");
    } finally {
        btn.innerText = "إنهاء الوردية وبدء وردية جديدة";
        btn.disabled = false;
    }
});

// ==========================================
// 7. إدارة المخزن (بدون صور للمنتجات العادية)
// ==========================================

document.getElementById('addProductForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = "جاري الإضافة...";
    btn.disabled = true;

    // ✅ المنتجات العادية لا تحتوي على صور - تم إزالة حقل الصورة
    const newProduct = {
        barcode: document.getElementById('prodBarcode').value,
        name: document.getElementById('prodName').value,
        buyPrice: parseFloat(document.getElementById('prodBuyPrice').value),
        sellPrice: parseFloat(document.getElementById('prodSellPrice').value),
        quantity: parseInt(document.getElementById('prodQty').value),
        minAlert: parseInt(document.getElementById('prodMinAlert').value),
        image: "", // بدون صورة للمنتجات العادية
        searchKey: [
            normalizeText(document.getElementById('prodName').value),
            normalizeText(document.getElementById('prodBarcode').value)
        ]
    };

    try {
        await addDoc(collection(db, "products"), newProduct);
        alert("تمت إضافة المنتج بنجاح!");
        document.getElementById('addProductForm').reset();
        loadInventory();
    } catch (error) {
        alert("حدث خطأ أثناء الإضافة: " + error.message);
    } finally {
        btn.innerText = "إضافة / تحديث المنتج";
        btn.disabled = false;
    }
});

async function loadInventory() {
    const tbody = document.getElementById('inventoryBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6">جاري التحميل...</td></tr>';
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        productsList = [];
        tbody.innerHTML = '';
        querySnapshot.forEach((doc) => {
            let prod = doc.data();
            prod.id = doc.id;
            
            if (prod.quantity === -99999) return;
            
            productsList.push(prod);
            let isLowStock = prod.quantity <= prod.minAlert ? 'low-stock' : '';
            tbody.innerHTML += `
                <tr class="${isLowStock}">
                    <td>${prod.barcode}</td>
                    <td>${prod.name}</td>
                    <td>${prod.quantity}</td>
                    <td>${prod.buyPrice}</td>
                    <td>${prod.sellPrice}</td>
                    <td>
                        <button onclick="window.editProduct('${prod.id}')" style="margin-right:5px;">تعديل</button>
                        <button onclick="window.deleteProduct('${prod.id}')" style="background:var(--danger-color)">حذف</button>
                    </td>
                </tr>`;
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6">خطأ في تحميل البيانات</td></tr>';
    }
}

// ✅ نواقص المخزون
async function loadLowStock() {
    const tbody = document.getElementById('lowStockBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="5">جاري التحميل...</td></tr>';
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        tbody.innerHTML = '';
        let hasLowStock = false;
        
        querySnapshot.forEach((doc) => {
            let prod = doc.data();
            prod.id = doc.id;
            if (prod.quantity === -99999) return;
            
            if (prod.quantity <= prod.minAlert) {
                hasLowStock = true;
                tbody.innerHTML += `
                    <tr class="low-stock">
                        <td>${prod.barcode}</td>
                        <td>${prod.name}</td>
                        <td>${prod.quantity}</td>
                        <td>${prod.minAlert}</td>
                        <td><span style="color: var(--danger-color); font-weight: bold;">⚠️ ناقص</span></td>
                    </tr>`;
            }
        });
        
        if (!hasLowStock) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--success-color);">✅ المخزون ممتاز - لا توجد نواقص</td></tr>';
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5">خطأ في تحميل البيانات</td></tr>';
    }
}

window.editProduct = async function(productId) {
    const product = productsList.find(p => p.id === productId);
    if (!product) return alert("المنتج غير موجود");
    
    const newName = prompt("اسم المنتج الجديد:", product.name);
    if (!newName) return;
    const newSellPrice = prompt("سعر البيع الجديد:", product.sellPrice);
    if (!newSellPrice) return;
    
    try {
        const productRef = doc(db, "products", productId);
        await updateDoc(productRef, {
            name: newName,
            sellPrice: parseFloat(newSellPrice),
            image: "", // بدون صورة للمنتجات العادية
            searchKey: [normalizeText(newName), normalizeText(product.barcode || '')]
        });
        alert("تم التعديل بنجاح");
        loadInventory();
    } catch (error) {
        alert("خطأ في التعديل");
    }
};

window.deleteProduct = async function(productId) {
    if (confirm("هل أنت متأكد من حذف هذا المنتج؟")) {
        try {
            await updateDoc(doc(db, "products", productId), { quantity: -99999 });
            alert("تم الحذف بنجاح");
            loadInventory();
        } catch (error) {
            alert("خطأ في الحذف");
        }
    }
};

// ==========================================
// 8. تزويد البضاعة (Restock)
// ==========================================

async function lookupProductForRestock(barcode) {
    const prodNameInput = document.getElementById('restockProdName');
    const addQtyInput = document.getElementById('restockAddQty');
    
    if (!barcode) return;
    
    const localProduct = productsList.find(p => p.barcode === barcode && p.quantity !== -99999);
    if (localProduct) {
        prodNameInput.value = localProduct.name;
        prodNameInput.dataset.productId = localProduct.id;
        addQtyInput.focus();
        return;
    }
    
    const q = query(collection(db, "products"), where("barcode", "==", barcode), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
        const prod = snap.docs[0].data();
        if (prod.quantity === -99999) {
            alert("هذا المنتج محذوف من المخزن!");
            prodNameInput.value = '';
            prodNameInput.dataset.productId = '';
            return;
        }
        prodNameInput.value = prod.name;
        prodNameInput.dataset.productId = snap.docs[0].id;
        addQtyInput.focus();
    } else {
        alert("المنتج غير موجود في المخزن!");
        prodNameInput.value = '';
        prodNameInput.dataset.productId = '';
    }
}

document.getElementById('restockForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const barcode = document.getElementById('restockBarcode').value;
    const addQty = parseInt(document.getElementById('restockAddQty').value);
    const newBuyPrice = parseFloat(document.getElementById('restockNewBuyPrice').value) || 0;
    const newSellPrice = parseFloat(document.getElementById('restockNewSellPrice').value) || 0;
    
    if (isNaN(addQty) || addQty <= 0) return alert("الكمية غير صالحة");
    
    try {
        const q = query(collection(db, "products"), where("barcode", "==", barcode), limit(1));
        const snap = await getDocs(q);
        if (snap.empty) return alert("المنتج غير موجود!");
        
        const productDoc = snap.docs[0];
        const product = productDoc.data();
        
        if (product.quantity === -99999) return alert("هذا المنتج محذوف من المخزن!");
        
        const productRef = doc(db, "products", productDoc.id);
        
        let updatedData = { quantity: increment(addQty) };
        
        if (newBuyPrice > 0 && product.buyPrice > 0 && product.quantity > 0) {
            const oldTotalCost = product.buyPrice * product.quantity;
            const newTotalCost = newBuyPrice * addQty;
            const totalQuantity = product.quantity + addQty;
            const newAvgBuyPrice = (oldTotalCost + newTotalCost) / totalQuantity;
            updatedData.buyPrice = Math.round(newAvgBuyPrice * 100) / 100;
        } else if (newBuyPrice > 0) {
            updatedData.buyPrice = newBuyPrice;
        }
        
        if (newSellPrice > 0) {
            updatedData.sellPrice = newSellPrice;
        }
        
        await updateDoc(productRef, updatedData);
        
        document.getElementById('restockForm').reset();
        document.getElementById('restockProdName').value = '';
        alert(`تم تزويد ${product.name} بنجاح. الكمية الجديدة: ${product.quantity + addQty}`);
        loadInventory();
    } catch (error) {
        console.error(error);
        alert("خطأ في التزويد");
    }
});

// ==========================================
// 9. الكاشيرية
// ==========================================

document.getElementById('addCashierForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newCashierName').value.trim();
    const pass = document.getElementById('newCashierPass').value.trim();

    try {
        await addDoc(collection(db, "cashiers"), { name: name, password: pass, active: true });
        alert("تم إضافة الكاشير بنجاح!");
        document.getElementById('addCashierForm').reset();
        loadCashiers();
    } catch (error) {
        alert("حدث خطأ أثناء إضافة الكاشير.");
    }
});

async function loadCashiers() {
    const tbody = document.getElementById('cashiersBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="3">جاري التحميل...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "cashiers"));
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const data = doc.data();
            if (data.active === false) return;
            tbody.innerHTML += `
                <tr>
                    <td>${data.name}</td>
                    <td>${data.password}</td>
                    <td><button style="background:var(--danger-color)" onclick="window.deleteCashier('${doc.id}')">حذف</button></td>
                </tr>`;
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="3">خطأ في تحميل البيانات</td></tr>';
    }
}

window.deleteCashier = async function(cashierId) {
    if (confirm("هل أنت متأكد من حذف هذا الكاشير؟")) {
        try {
            await updateDoc(doc(db, "cashiers", cashierId), { active: false });
            alert("تم الحذف بنجاح");
            loadCashiers();
        } catch (error) {
            alert("خطأ في الحذف");
        }
    }
};

// ==========================================
// 10. شاشة البيع
// ==========================================

const barcodeInput = document.getElementById('barcodeInput');
barcodeInput?.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const code = barcodeInput.value.trim();
        if(code === "") return;

        if (barcodeDebounceTimers[code]) return;
        barcodeDebounceTimers[code] = true;
        setTimeout(() => { delete barcodeDebounceTimers[code]; }, 4000);

        const normalizedSearch = normalizeText(code);
        const localProduct = productsList.find(p => 
            (p.barcode === code || (p.searchKey && p.searchKey.includes(normalizedSearch))) && 
            p.quantity !== -99999
        );
        
        if (localProduct) {
            addToCart({...localProduct});
            barcodeInput.value = '';
            return;
        }

        try {
            let found = false;
            
            const qBarcode = query(collection(db, "products"), where("barcode", "==", code), limit(1));
            const barcodeSnap = await getDocs(qBarcode);
            
            if (!barcodeSnap.empty) {
                const productDoc = barcodeSnap.docs[0];
                let product = productDoc.data();
                product.id = productDoc.id;
                if (product.quantity !== -99999) {
                    addToCart(product);
                    barcodeInput.value = '';
                    found = true;
                }
            }
            
            if (!found) {
                const qName = query(collection(db, "products"), where("searchKey", "array-contains", normalizedSearch), limit(1));
                const nameSnap = await getDocs(qName);
                
                if (!nameSnap.empty) {
                    const productDoc = nameSnap.docs[0];
                    let product = productDoc.data();
                    product.id = productDoc.id;
                    if (product.quantity !== -99999) {
                        addToCart(product);
                        barcodeInput.value = '';
                        found = true;
                    }
                }
            }
            
            if (!found) {
                window.playSound('error');
                alert("المنتج غير موجود!");
            }
        } catch (error) {
            window.playSound('error');
            alert("حدث خطأ في البحث!");
        }
    }
});

document.getElementById('prodBarcode')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('prodName').focus();
    }
});

document.getElementById('restockBarcode')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        lookupProductForRestock(e.target.value);
    }
});

// ==========================================
// 11. دوال السلة والبيع
// ==========================================

function addToCart(product) {
    if (!isValidProduct(product)) {
        window.playSound('error');
        alert("المنتج غير متوفر أو نفذ من المخزن!");
        return;
    }
    
    let existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
        if(existingItem.cartQty < product.quantity) {
            existingItem.cartQty += 1;
            window.playSound('success'); 
        } else {
            window.playSound('error'); 
            alert("الكمية المتاحة في المخزن لا تكفي!");
            return;
        }
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">السلة فارغة</td></tr>';
    }

    cart.forEach((item, index) => {
        let itemTotal = item.sellPrice * item.cartQty;
        total += itemTotal;
        tbody.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>${item.sellPrice}</td>
                <td>
                    <button onclick="window.changeQty(${index}, -1)">-</button>
                    <span style="margin: 0 10px;">${item.cartQty}</span>
                    <button onclick="window.changeQty(${index}, 1)">+</button>
                </td>
                <td>${itemTotal}</td>
                <td><button onclick="window.removeFromCart(${index})" style="background-color: var(--danger-color);">حذف</button></td>
            </tr>`;
    });
    document.getElementById('cartTotal').innerText = total;
}

window.changeQty = function(index, amount) {
    const newQty = cart[index].cartQty + amount;
    if (newQty > 0 && newQty <= cart[index].quantity) {
        cart[index].cartQty = newQty;
        renderCart();
    } else if (newQty <= 0) {
        window.removeFromCart(index);
    } else {
        window.playSound('error');
        alert("الكمية المتاحة في المخزن لا تكفي!");
    }
};

window.removeFromCart = function(index) {
    cart.splice(index, 1);
    renderCart();
};

async function updateStatsInRealTime(salesAmount, costAmount) {
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);
    
    try {
        const batch = writeBatch(db);
        
        const todayRef = doc(db, "stats", `day_${today}`);
        batch.set(todayRef, {
            totalSales: increment(salesAmount),
            totalCost: increment(costAmount),
            date: today
        }, { merge: true });
        
        const monthRef = doc(db, "stats", `month_${month}`);
        batch.set(monthRef, {
            totalSales: increment(salesAmount),
            totalCost: increment(costAmount),
            month: month
        }, { merge: true });
        
        await batch.commit();
    } catch (error) {
        console.error("Stats update error:", error);
    }
}

document.getElementById('checkoutBtn')?.addEventListener('click', async () => {
    if (!currentShift.active) {
        alert("لا توجد وردية مفتوحة! برجاء استلام الوردية أولاً.");
        return;
    }
    if (cart.length === 0) {
        alert("السلة فارغة!");
        return;
    }

    const btn = document.getElementById('checkoutBtn');
    btn.innerText = "جاري حفظ الفاتورة...";
    btn.disabled = true;

    let totalSales = 0;
    let totalCost = 0;
    
    const invoiceItems = cart.map(item => {
        totalSales += (item.sellPrice * item.cartQty);
        totalCost += (item.buyPrice * item.cartQty);
        return {
            productId: item.id,
            name: item.name,
            qty: item.cartQty,
            price: item.sellPrice
        };
    });

    const newInvoice = {
        timestamp: new Date().toISOString(),
        cashier: currentShift.cashierName,
        items: invoiceItems,
        totalSales: totalSales,
        totalCost: totalCost
    };

    try {
        const batch = writeBatch(db);
        const invoiceRef = doc(collection(db, "invoices")); 
        batch.set(invoiceRef, newInvoice);

        for (const item of cart) {
            const productRef = doc(db, "products", item.id);
            batch.update(productRef, { quantity: increment(-item.cartQty) });
        }

        await batch.commit();

        currentShift.sales += totalSales;
        localStorage.setItem('activeShift', JSON.stringify(currentShift));
        await updateStatsInRealTime(totalSales, totalCost);

        window.playSound('success'); 
        alert("تم البيع وحفظ الفاتورة بنجاح!");
        cart = [];
        renderCart();
        document.getElementById('barcodeInput')?.focus();

    } catch (error) {
        window.playSound('error'); 
        alert("حدث خطأ! لم يتم حفظ الفاتورة.");
    } finally {
        btn.innerText = "تأكيد البيع وحفظ الفاتورة";
        btn.disabled = false;
    }
});

// ==========================================
// 12. القائمة السريعة (Quick Items) - للصور فقط
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
            btn.innerHTML = `${item.image ? `<img src="${item.image}" alt="${item.name}">` : ''} <span>${item.name}</span>`;
            btn.onclick = () => {
                const product = productsList.find(p => p.id === item.productId);
                if (product && product.quantity !== -99999) {
                    addToCart({...product});
                } else {
                    alert("المنتج لم يعد متوفرًا");
                }
            };
            grid.appendChild(btn);
        });
    } catch (error) {
        console.error("خطأ في تحميل القائمة السريعة:", error);
    }
}

// ✅ نافذة منبثقة للقائمة السريعة
document.getElementById('showQuickItemsPopupBtn')?.addEventListener('click', () => {
    const popupGrid = document.getElementById('quickItemsPopupGrid');
    if (!popupGrid) return;
    
    popupGrid.innerHTML = '';
    
    if (quickItemsList.length === 0) {
        popupGrid.innerHTML = '<p style="text-align:center; grid-column:1/-1;">لا توجد منتجات في القائمة السريعة</p>';
    }
    
    quickItemsList.forEach(item => {
        const btn = document.createElement('button');
        btn.innerHTML = `${item.image ? `<img src="${item.image}" alt="${item.name}">` : ''} <span>${item.name}</span>`;
        btn.onclick = () => {
            const product = productsList.find(p => p.id === item.productId);
            if (product && product.quantity !== -99999) {
                addToCart({...product});
                document.getElementById('quickItemsPopupModal').style.display = 'none';
            } else {
                alert("المنتج لم يعد متوفرًا");
            }
        };
        popupGrid.appendChild(btn);
    });
    
    document.getElementById('quickItemsPopupModal').style.display = 'flex';
});

document.getElementById('closeQuickItemsPopupBtn')?.addEventListener('click', () => {
    document.getElementById('quickItemsPopupModal').style.display = 'none';
});

// ✅ إدارة القائمة السريعة للمدير (مع الصور)
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
            
            list.innerHTML += `
                <div>
                    <p><strong>${item.name}</strong></p>
                    ${item.image ? `<img src="${item.image}" alt="${item.name}">` : '<p style="color:#999;">لا توجد صورة</p>'}
                    <button onclick="window.uploadQuickItemImage('${doc.id}')" style="background:var(--primary-color); margin:5px;">📷 تغيير الصورة</button>
                    <button onclick="window.removeQuickItem('${doc.id}')" style="background:var(--danger-color); margin:5px;">حذف</button>
                </div>`;
        });
    } catch (error) {
        list.innerHTML = 'خطأ في التحميل';
    }
}

// ✅ رفع صورة للقائمة السريعة فقط
window.uploadQuickItemImage = async function(docId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const base64 = await compressImage(file, 200, 200, 0.6);
            await updateDoc(doc(db, "quickItems", docId), { image: base64 });
            loadQuickItemsAdmin();
            loadQuickItems();
            alert("تم تحديث الصورة بنجاح");
        } catch (error) {
            alert("خطأ في رفع الصورة");
        }
    };
    
    input.click();
};

document.getElementById('addToQuickBtn')?.addEventListener('click', async () => {
    const searchInput = document.getElementById('quickSearchInput').value.trim();
    if (!searchInput) return alert("اكتب اسم المنتج للبحث");
    
    const normalizedSearch = normalizeText(searchInput);
    const product = productsList.find(p => 
        (p.searchKey && p.searchKey.includes(normalizedSearch)) && p.quantity !== -99999
    );
    if (!product) return alert("المنتج غير موجود");
    
    const snap = await getDocs(collection(db, "quickItems"));
    let activeCount = 0;
    snap.forEach(doc => {
        if (doc.data().active !== false) activeCount++;
    });
    if (activeCount >= 15) return alert("لا يمكن إضافة أكثر من 15 منتج");
    
    try {
        await addDoc(collection(db, "quickItems"), {
            productId: product.id,
            name: product.name,
            image: "", // يبدأ بدون صورة
            active: true
        });
        document.getElementById('quickSearchInput').value = '';
        alert("تمت الإضافة للقائمة السريعة");
        loadQuickItemsAdmin();
    } catch (error) {
        alert("خطأ في الإضافة");
    }
});

window.removeQuickItem = async (docId) => {
    if (confirm("إزالة هذا المنتج من القائمة السريعة؟")) {
        await updateDoc(doc(db, "quickItems", docId), { active: false });
        loadQuickItemsAdmin();
        loadQuickItems();
    }
};

// ==========================================
// 13. المصروفات والإحصائيات الأساسية
// ==========================================

document.getElementById('addExpenseForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = "جاري التسجيل...";
    btn.disabled = true;

    const newExpense = {
        title: document.getElementById('expTitle').value,
        amount: parseFloat(document.getElementById('expAmount').value),
        date: new Date().toISOString()
    };

    try {
        await addDoc(collection(db, "expenses"), newExpense);
        alert("تم تسجيل المصروف!");
        document.getElementById('addExpenseForm').reset();
    } catch (error) {
        alert("حدث خطأ أثناء تسجيل المصروف.");
    } finally {
        btn.innerText = "تسجيل المصروف";
        btn.disabled = false;
    }
});

async function loadStats() {
    try {
        let totalSales = 0; let totalCost = 0; let totalExpenses = 0;

        const invoicesSnap = await getDocs(collection(db, "invoices"));
        invoicesSnap.forEach(doc => {
            const data = doc.data();
            totalSales += data.totalSales || 0;
            totalCost += data.totalCost || 0;
        });

        const expensesSnap = await getDocs(collection(db, "expenses"));
        expensesSnap.forEach(doc => {
            totalExpenses += doc.data().amount || 0;
        });

        let grossProfit = totalSales - totalCost;
        let netProfit = grossProfit - totalExpenses;

        const totalSalesEl = document.getElementById('totalSalesStat');
        const totalExpensesEl = document.getElementById('totalExpensesStat');
        const netProfitEl = document.getElementById('netProfitStat');
        
        if (totalSalesEl) totalSalesEl.innerText = totalSales.toFixed(2) + " جنيه";
        if (totalExpensesEl) totalExpensesEl.innerText = totalExpenses.toFixed(2) + " جنيه";
        
        if (netProfitEl) {
            netProfitEl.innerText = netProfit.toFixed(2) + " جنيه";
            netProfitEl.style.color = netProfit >= 0 ? "var(--success-color)" : "var(--danger-color)";
        }
    } catch (error) {
        console.error("Error loading stats: ", error);
    }
}

// ==========================================
// 14. التقارير المالية مع الفلاتر الزمنية
// ==========================================

function getDateRange(filterType) {
    const now = new Date();
    let startDate = null;
    let endDate = new Date().toISOString();
    
    switch(filterType) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            break;
        case 'yesterday':
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            break;
        case 'week':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            startDate = startDate.toISOString();
            break;
        case 'month':
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 1);
            startDate = startDate.toISOString();
            break;
        case '3months':
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 3);
            startDate = startDate.toISOString();
            break;
        case '6months':
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 6);
            startDate = startDate.toISOString();
            break;
        case 'year':
            startDate = new Date(now);
            startDate.setFullYear(now.getFullYear() - 1);
            startDate = startDate.toISOString();
            break;
        default:
            startDate = null;
    }
    
    return { startDate, endDate };
}

// ✅ تقرير المبيعات
async function loadSalesReport(filterType = 'all') {
    const tbody = document.getElementById('salesReportBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6">جاري التحميل...</td></tr>';
    
    try {
        const { startDate, endDate } = getDateRange(filterType);
        let allInvoices = [];
        
        const invoicesSnap = await getDocs(collection(db, "invoices"));
        invoicesSnap.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            
            if (startDate) {
                if (data.timestamp >= startDate && data.timestamp <= endDate) {
                    allInvoices.push(data);
                }
            } else {
                allInvoices.push(data);
            }
        });
        
        allInvoices.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        tbody.innerHTML = '';
        let totalAmount = 0;
        
        allInvoices.forEach(inv => {
            totalAmount += inv.totalSales || 0;
            tbody.innerHTML += `
                <tr>
                    <td>${formatDate(inv.timestamp)}</td>
                    <td>${inv.cashier || ''}</td>
                    <td>${inv.items ? inv.items.length : 0} منتج</td>
                    <td>${inv.totalSales || 0} ج</td>
                    <td>${inv.totalCost || 0} ج</td>
                    <td>${(inv.totalSales || 0) - (inv.totalCost || 0)} ج</td>
                </tr>`;
        });
        
        if (allInvoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">لا توجد فواتير في هذه الفترة</td></tr>';
        }
        
        const totalEl = document.getElementById('salesReportTotal');
        if (totalEl) totalEl.innerText = totalAmount.toFixed(2) + " جنيه";
        
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6">خطأ في تحميل البيانات</td></tr>';
    }
}

// ✅ تقرير المصروفات
async function loadExpensesReport(filterType = 'all') {
    const tbody = document.getElementById('expensesReportBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4">جاري التحميل...</td></tr>';
    
    try {
        const { startDate, endDate } = getDateRange(filterType);
        let allExpenses = [];
        
        const expensesSnap = await getDocs(collection(db, "expenses"));
        expensesSnap.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            
            if (startDate) {
                if (data.date >= startDate && data.date <= endDate) {
                    allExpenses.push(data);
                }
            } else {
                allExpenses.push(data);
            }
        });
        
        allExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        tbody.innerHTML = '';
        let totalAmount = 0;
        
        allExpenses.forEach(exp => {
            totalAmount += exp.amount || 0;
            tbody.innerHTML += `
                <tr>
                    <td>${formatDate(exp.date)}</td>
                    <td>${exp.title}</td>
                    <td>${exp.amount} ج</td>
                    <td><button onclick="window.deleteExpense('${exp.id}')" style="background:var(--danger-color); padding:5px 10px; font-size:0.8rem;">حذف</button></td>
                </tr>`;
        });
        
        if (allExpenses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">لا توجد مصروفات في هذه الفترة</td></tr>';
        }
        
        const totalEl = document.getElementById('expensesReportTotal');
        if (totalEl) totalEl.innerText = totalAmount.toFixed(2) + " جنيه";
        
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4">خطأ في تحميل البيانات</td></tr>';
    }
}

// ✅ حذف مصروف
window.deleteExpense = async function(expenseId) {
    if (confirm("هل أنت متأكد من حذف هذا المصروف؟")) {
        try {
            await deleteDoc(doc(db, "expenses", expenseId));
            alert("تم حذف المصروف بنجاح");
            loadExpensesReport(document.getElementById('expensesFilter')?.value || 'all');
        } catch (error) {
            alert("خطأ في الحذف");
        }
    }
};

// ✅ تقرير الأرباح
async function loadProfitsReport(filterType = 'all') {
    const tbody = document.getElementById('profitsReportBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="5">جاري التحميل...</td></tr>';
    
    try {
        const { startDate, endDate } = getDateRange(filterType);
        let invoices = [];
        let expenses = [];
        
        const invoicesSnap = await getDocs(collection(db, "invoices"));
        invoicesSnap.forEach(doc => {
            const data = doc.data();
            if (startDate) {
                if (data.timestamp >= startDate && data.timestamp <= endDate) {
                    invoices.push(data);
                }
            } else {
                invoices.push(data);
            }
        });
        
        const expensesSnap = await getDocs(collection(db, "expenses"));
        expensesSnap.forEach(doc => {
            const data = doc.data();
            if (startDate) {
                if (data.date >= startDate && data.date <= endDate) {
                    expenses.push(data);
                }
            } else {
                expenses.push(data);
            }
        });
        
        let totalSales = 0, totalCost = 0, totalExpenses = 0;
        
        invoices.forEach(inv => {
            totalSales += inv.totalSales || 0;
            totalCost += inv.totalCost || 0;
        });
        
        expenses.forEach(exp => {
            totalExpenses += exp.amount || 0;
        });
        
        const grossProfit = totalSales - totalCost;
        const netProfit = grossProfit - totalExpenses;
        
        tbody.innerHTML = `
            <tr>
                <td>${invoices.length} فاتورة</td>
                <td>${totalSales.toFixed(2)} ج</td>
                <td>${totalCost.toFixed(2)} ج</td>
                <td>${totalExpenses.toFixed(2)} ج</td>
                <td style="font-weight: 700; color: ${netProfit >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${netProfit.toFixed(2)} ج</td>
            </tr>`;
        
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5">خطأ في تحميل البيانات</td></tr>';
    }
}

// ✅ ربط الفلاتر
document.getElementById('salesFilter')?.addEventListener('change', (e) => {
    loadSalesReport(e.target.value);
});

document.getElementById('expensesFilter')?.addEventListener('change', (e) => {
    loadExpensesReport(e.target.value);
});

document.getElementById('profitsFilter')?.addEventListener('change', (e) => {
    loadProfitsReport(e.target.value);
});

// ✅ إضافة مصروف من شاشة تقرير المصروفات
document.getElementById('addExpenseFromReportBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('expenseTitleReport').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmountReport').value);
    
    if (!title || isNaN(amount) || amount <= 0) return alert("بيانات غير صحيحة");
    
    try {
        await addDoc(collection(db, "expenses"), {
            title: title,
            amount: amount,
            date: new Date().toISOString()
        });
        alert("تم إضافة المصروف بنجاح");
        document.getElementById('expenseTitleReport').value = '';
        document.getElementById('expenseAmountReport').value = '';
        loadExpensesReport(document.getElementById('expensesFilter')?.value || 'all');
    } catch (error) {
        alert("خطأ في إضافة المصروف");
    }
});

// ==========================================
// 15. شاشة الورديات
// ==========================================

async function loadShifts() {
    const tbody = document.getElementById('shiftsBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="8">جاري التحميل...</td></tr>';
    
    try {
        const shiftsSnap = await getDocs(collection(db, "shifts"));
        const shifts = [];
        shiftsSnap.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            shifts.push(data);
        });
        
        shifts.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        
        tbody.innerHTML = '';
        
        shifts.forEach(shift => {
            tbody.innerHTML += `
                <tr>
                    <td>${shift.cashierName || ''}</td>
                    <td>${formatDate(shift.startTime)}</td>
                    <td>${formatDate(shift.endTime)}</td>
                    <td>${shift.startCash} ج</td>
                    <td>${shift.sales} ج</td>
                    <td>${shift.drops} ج</td>
                    <td>${shift.expectedCash} ج</td>
                    <td style="color: ${shift.status === 'زيادة' ? 'var(--success-color)' : 'var(--danger-color)'};">${shift.difference} ج (${shift.status || ''})</td>
                </tr>`;
        });
        
        if (shifts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">لا توجد ورديات مسجلة</td></tr>';
        }
        
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="8">خطأ في تحميل البيانات</td></tr>';
    }
}

// ==========================================
// 16. شاشة الفواتير (للكاشير)
// ==========================================

async function loadInvoices() {
    const tbody = document.getElementById('invoicesBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="5">جاري التحميل...</td></tr>';
    
    try {
        const invoicesSnap = await getDocs(collection(db, "invoices"));
        const invoices = [];
        invoicesSnap.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            invoices.push(data);
        });
        
        invoices.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        tbody.innerHTML = '';
        let total = 0;
        
        invoices.slice(0, 100).forEach(inv => {
            total += inv.totalSales || 0;
            tbody.innerHTML += `
                <tr>
                    <td>${formatDate(inv.timestamp)}</td>
                    <td>${inv.cashier || ''}</td>
                    <td>${inv.items ? inv.items.length : 0}</td>
                    <td>${inv.totalSales || 0} ج</td>
                    <td><button onclick="window.viewInvoiceDetails('${inv.id}')" class="btn-sm">تفاصيل</button></td>
                </tr>`;
        });
        
        if (invoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">لا توجد فواتير</td></tr>';
        }
        
        const totalEl = document.getElementById('invoicesTotal');
        if (totalEl) totalEl.innerText = total.toFixed(2) + " جنيه";
        
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5">خطأ في تحميل البيانات</td></tr>';
    }
}

window.viewInvoiceDetails = async function(invoiceId) {
    try {
        const docSnap = await getDoc(doc(db, "invoices", invoiceId));
        if (docSnap.exists()) {
            const inv = docSnap.data();
            let details = `فاتورة - ${formatDate(inv.timestamp)}\nالكاشير: ${inv.cashier}\n\n`;
            inv.items.forEach((item, i) => {
                details += `${i+1}. ${item.name} x${item.qty} = ${item.price * item.qty} ج\n`;
            });
            details += `\nالإجمالي: ${inv.totalSales} ج`;
            alert(details);
        }
    } catch (error) {
        alert("خطأ في تحميل التفاصيل");
    }
};

// ==========================================
// 17. القائمة الجانبية والكاميرا والصوتيات
// ==========================================

const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const menuBtn = document.getElementById('menuBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');

function openSidebar() { 
    sidebar?.classList.add('active'); 
    sidebarOverlay?.classList.add('active'); 
}

function closeSidebar() { 
    sidebar?.classList.remove('active'); 
    sidebarOverlay?.classList.remove('active'); 
}

menuBtn?.addEventListener('click', openSidebar);
closeSidebarBtn?.addEventListener('click', closeSidebar);
sidebarOverlay?.addEventListener('click', closeSidebar);

navAdminBtn?.addEventListener('click', () => {
    const subMenu = document.getElementById('adminSubMenu');
    if (isAdminLoggedIn) {
        subMenu.style.display = 'flex';
    }
});

const observer = new MutationObserver(() => {
    const subMenu = document.getElementById('adminSubMenu');
    if (adminSection.style.display === 'block') {
        subMenu.style.display = 'flex';
    } else {
        subMenu.style.display = 'none';
    }
});
observer.observe(adminSection, { attributes: true, attributeFilter: ['style'] });

window.playSound = function(type) {
    try {
        const successSound = document.getElementById('successSound');
        const errorSound = document.getElementById('errorSound');
        if (type === 'success' && successSound) { 
            successSound.currentTime = 0; 
            successSound.play().catch(() => {}); 
        }
        else if (type === 'error' && errorSound) { 
            errorSound.currentTime = 0; 
            errorSound.play().catch(() => {}); 
        }
    } catch (error) {}
};

// ==========================================
// 18. إعداد الكاميرات
// ==========================================

function setupCamera(buttonId, readerDivId, inputId, autoCloseCheckboxId, onScanCallback) {
    const btn = document.getElementById(buttonId);
    const readerDiv = document.getElementById(readerDivId);
    const input = document.getElementById(inputId);
    const autoCloseCheckbox = document.getElementById(autoCloseCheckboxId);
    
    if (!btn || !readerDiv || !input) return;
    
    let html5QrCode;
    let isCameraOpen = false;

    if (autoCloseCheckbox) {
        const saved = localStorage.getItem(`${autoCloseCheckboxId}_checked`);
        if (saved === 'true') autoCloseCheckbox.checked = true;
        autoCloseCheckbox.addEventListener('change', () => {
            localStorage.setItem(`${autoCloseCheckboxId}_checked`, autoCloseCheckbox.checked);
        });
    }

    btn.addEventListener('click', () => {
        if (!window.Html5Qrcode) {
            alert("مكتبة الكاميرا لم تحمل بعد، برجاء الانتظار والمحاولة مرة أخرى.");
            return;
        }
        
        if (isCameraOpen) {
            html5QrCode.stop().then(() => {
                readerDiv.style.display = 'none';
                isCameraOpen = false;
                btn.innerHTML = '📷';
            }).catch(err => console.log("خطأ في إغلاق الكاميرا"));
        } else {
            readerDiv.style.display = 'block';
            html5QrCode = new window.Html5Qrcode(readerDivId);
            
            html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 10, qrbox: { width: 250, height: 100 } },
                (decodedText) => {
                    input.value = decodedText;
                    
                    if (autoCloseCheckbox && autoCloseCheckbox.checked) {
                        html5QrCode.stop().then(() => {
                            readerDiv.style.display = 'none';
                            isCameraOpen = false;
                            btn.innerHTML = '📷';
                        });
                    }
                    
                    if (onScanCallback) onScanCallback(decodedText);
                },
                () => {}
            ).then(() => {
                isCameraOpen = true;
                btn.innerHTML = '❌ إغلاق الكاميرا';
            }).catch(() => {
                alert("برجاء السماح للمتصفح باستخدام الكاميرا!");
                readerDiv.style.display = 'none';
            });
        }
    });
}

// ==========================================
// 19. تهيئة الصفحة عند التحميل
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    hideAllModals();
    
    const savedShift = localStorage.getItem('activeShift');
    if (savedShift) {
        try {
            currentShift = JSON.parse(savedShift);
            if (currentShift.active) {
                document.getElementById('shiftInfoDisplay').innerText = 
                    `الكاشير: ${currentShift.cashierName} | العهدة: ${currentShift.startCash} ج`;
                startShiftModal.style.display = 'none';
                posSection.style.display = 'block';
                document.getElementById('barcodeInput')?.focus();
                loadQuickItems();
                return;
            }
        } catch (e) {
            localStorage.removeItem('activeShift');
        }
    }
    
    if (!currentShift.active) {
        startShiftModal.style.display = 'flex';
        posSection.style.display = 'block';
    }
    
    setTimeout(() => {
        setupCamera('startCameraBtn', 'reader', 'barcodeInput', 'autoCloseCameraCheckbox', (text) => {
            barcodeInput?.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
        });

        setupCamera('startProdCameraBtn', 'prodReader', 'prodBarcode', 'autoCloseProdCameraCheckbox', (text) => {
            document.getElementById('prodName')?.focus();
        });

        setupCamera('startRestockCameraBtn', 'restockReader', 'restockBarcode', 'autoCloseRestockCameraCheckbox', async (text) => {
            await lookupProductForRestock(text);
        });
    }, 1000);
});
