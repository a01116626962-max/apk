// ==========================================
// 1. استدعاء مكتبات Firebase
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, query, where, limit, writeBatch, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

// --- كود تفعيل الأوفلاين الجديد ---
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log("لا يمكن تفعيل الأوفلاين: هناك أكثر من تبويب مفتوح");
    } else if (err.code == 'unimplemented') {
        console.log("المتصفح لا يدعم التخزين الأوفلاين");
    }
});
// ---------------------------

// ==========================================
// 2. المتغيرات العامة وإعدادات الأمان
// ==========================================
const ADMIN_PASSWORD = "1234";
let cart = [];
let productsList = [];

// المتغير اللي شايل بيانات الوردية (الـ id مهم عشان نحدث الداتا في السيرفر)
let currentShift = {
    id: null,
    active: false,
    cashierName: "",
    startCash: 0,
    sales: 0,
    drops: 0,
    startTime: null
};

// ==========================================
// 3. استرجاع بيانات الوردية من السيرفر (بديل التخزين المحلي)
// ==========================================
const startShiftModal = document.getElementById('startShiftModal');

async function checkActiveShift() {
    try {
        // البحث عن أي وردية حالتها نشطة (مفتوحة)
        const q = query(collection(db, "shifts"), where("status", "==", "active"), limit(1));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            const shiftDoc = snap.docs[0];
            currentShift = { id: shiftDoc.id, active: true, ...shiftDoc.data() };
            
            startShiftModal.style.display = 'none';
            document.getElementById('shiftInfoDisplay').innerText = `الكاشير: ${currentShift.cashierName} | العهدة: ${currentShift.startCash} ج`;
        } else {
            // لو مفيش وردية نشطة، اطلب منه يفتح وردية
            startShiftModal.style.display = 'flex';
        }
    } catch (error) {
        console.error("Error checking shift:", error);
        startShiftModal.style.display = 'flex';
    }
}

// استدعاء الدالة فور تشغيل الموقع
checkActiveShift();

// ==========================================
// 4. التنقل ونظام الحماية (المدير والوردية)
// ==========================================
const navPosBtn = document.getElementById('navPosBtn');
const navAdminBtn = document.getElementById('navAdminBtn');
const posSection = document.getElementById('posSection');
const adminSection = document.getElementById('adminSection');
const authModal = document.getElementById('authModal');
const adminSubMenu = document.getElementById('adminSubMenu');

// فتح شاشة البيع
navPosBtn.addEventListener('click', () => {
    posSection.style.display = 'block';
    adminSection.style.display = 'none';
    navPosBtn.classList.add('active');
    navAdminBtn.classList.remove('active');
    
    // إخفاء القائمة المنسدلة للإدارة وتغيير النص
    adminSubMenu.style.display = 'none';
    navAdminBtn.innerText = "لوحة الإدارة (مغلق)";
    
    if (!currentShift.active) {
        startShiftModal.style.display = 'flex';
    } else {
        document.getElementById('barcodeInput').focus();
    }
    closeSidebar();
});

// فتح نافذة الباسورد للمدير
navAdminBtn.addEventListener('click', () => {
    if (adminSection.style.display === 'block') {
        closeSidebar();
        return;
    }
    authModal.style.display = 'flex';
    document.getElementById('adminPasswordInput').focus();
    closeSidebar();
});

document.getElementById('openAdminFromShiftBtn').addEventListener('click', () => {
    startShiftModal.style.display = 'none';
    authModal.style.display = 'flex';
    document.getElementById('adminPasswordInput').focus();
});

document.getElementById('closeAuthBtn').addEventListener('click', () => {
    authModal.style.display = 'none';
    document.getElementById('adminPasswordInput').value = '';
    if (!currentShift.active && posSection.style.display !== 'none') {
        startShiftModal.style.display = 'flex';
    }
});

document.getElementById('verifyAdminBtn').addEventListener('click', verifyPassword);
document.getElementById('adminPasswordInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyPassword();
});

function verifyPassword() {
    const input = document.getElementById('adminPasswordInput').value;
    if (input === ADMIN_PASSWORD) {
        authModal.style.display = 'none';
        posSection.style.display = 'none';
        adminSection.style.display = 'block';
        
        navAdminBtn.innerText = "لوحة الإدارة (مفتوح)";
        navAdminBtn.classList.add('active');
        navPosBtn.classList.remove('active');
        adminSubMenu.style.display = 'flex'; // إظهار القائمة المنسدلة
        
        document.getElementById('adminPasswordInput').value = '';
        loadInventory();
        openSidebar(); 
    } else {
        alert("كلمة المرور غير صحيحة!");
    }
}

// تبويبات الإدارة المنسدلة
document.getElementById('navInventoryBtn').addEventListener('click', () => { switchAdminTab('inventoryTab', 'navInventoryBtn'); closeSidebar(); });
document.getElementById('navExpensesBtn').addEventListener('click', () => { switchAdminTab('expensesTab', 'navExpensesBtn'); closeSidebar(); });
document.getElementById('navCashiersBtn').addEventListener('click', () => { switchAdminTab('cashiersTab', 'navCashiersBtn'); loadCashiers(); closeSidebar(); });
document.getElementById('navStatsBtn').addEventListener('click', () => { switchAdminTab('statsTab', 'navStatsBtn'); loadStats(); closeSidebar(); });

function switchAdminTab(tabId, btnId) {
    document.getElementById('inventoryTab').style.display = 'none';
    document.getElementById('expensesTab').style.display = 'none';
    document.getElementById('cashiersTab').style.display = 'none';
    document.getElementById('statsTab').style.display = 'none';
    
    document.getElementById('navInventoryBtn').classList.remove('active-sub');
    document.getElementById('navExpensesBtn').classList.remove('active-sub');
    document.getElementById('navCashiersBtn').classList.remove('active-sub');
    document.getElementById('navStatsBtn').classList.remove('active-sub');

    document.getElementById(tabId).style.display = 'block';
    document.getElementById(btnId).classList.add('active-sub');
}

// ==========================================
// 5. إدارة الوردية (حفظ وتحديث مباشر في السيرفر)
// ==========================================

// بدء الوردية
document.getElementById('startShiftBtn').addEventListener('click', async () => {
    const name = document.getElementById('cashierNameInput').value.trim();
    const pass = document.getElementById('cashierPasswordInput').value.trim();
    const startCash = parseFloat(document.getElementById('startCashInput').value);

    if (!name || !pass || isNaN(startCash)) {
        alert("برجاء استكمال جميع البيانات!");
        return;
    }

    const btn = document.getElementById('startShiftBtn');
    btn.innerText = "جاري الاتصال بالسيرفر...";
    btn.disabled = true;

    try {
        const q = query(collection(db, "cashiers"), where("name", "==", name), where("password", "==", pass));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            alert("اسم الكاشير أو كلمة المرور غير صحيحة!");
            window.playSound('error');
        } else {
            // إنشاء الوردية في السيرفر وتحديد إنها (نشطة)
            const shiftData = {
                status: "active",
                cashierName: name,
                startCash: startCash,
                sales: 0,
                drops: 0,
                startTime: new Date().toISOString()
            };
            
            const docRef = await addDoc(collection(db, "shifts"), shiftData);
            
            currentShift = { id: docRef.id, active: true, ...shiftData };
            
            startShiftModal.style.display = 'none';
            document.getElementById('shiftInfoDisplay').innerText = `الكاشير: ${name} | العهدة: ${startCash} ج`;
            window.playSound('success');
            document.getElementById('barcodeInput').focus();
        }
    } catch (error) {
        alert("حدث خطأ في الاتصال بقاعدة البيانات.");
    } finally {
        btn.innerText = "استلام الوردية";
        btn.disabled = false;
    }
});

// تسليم نقدية للمدير
const cashDropModal = document.getElementById('cashDropModal');
document.getElementById('navCashDropBtn').addEventListener('click', () => {
    if (!currentShift.active) return alert("لا توجد وردية مفتوحة!");
    cashDropModal.style.display = 'flex';
    closeSidebar();
});
document.getElementById('closeDropBtn').addEventListener('click', () => {
    cashDropModal.style.display = 'none';
});

document.getElementById('confirmDropBtn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('dropAmountInput').value);
    const pass = document.getElementById('dropAdminPassword').value;

    if (isNaN(amount) || amount <= 0 || !pass) {
        alert("برجاء إدخال المبلغ وكلمة المرور بشكل صحيح.");
        return;
    }

    if (pass === ADMIN_PASSWORD) {
        const btn = document.getElementById('confirmDropBtn');
        btn.innerText = "جاري الحفظ...";
        btn.disabled = true;

        try {
            currentShift.drops += amount;
            // تحديث السحب في السيرفر فوراً
            await updateDoc(doc(db, "shifts", currentShift.id), { drops: currentShift.drops });
            
            alert(`تم تسليم مبلغ ${amount} جنيه للمدير بنجاح.`);
            cashDropModal.style.display = 'none';
            document.getElementById('dropAmountInput').value = '';
            document.getElementById('dropAdminPassword').value = '';
            window.playSound('success');
        } catch (error) {
            alert("حدث خطأ أثناء الحفظ في السيرفر!");
            currentShift.drops -= amount; // التراجع عن العملية لو فشلت
        } finally {
            btn.innerText = "تأكيد السحب";
            btn.disabled = false;
        }
    } else {
        alert("كلمة مرور المدير غير صحيحة!");
        window.playSound('error');
    }
});

// تقفيل الوردية
const endShiftModal = document.getElementById('endShiftModal');
document.getElementById('navEndShiftBtn').addEventListener('click', () => {
    if (!currentShift.active) return alert("لا توجد وردية مفتوحة!");
    
    document.getElementById('reportStartCash').innerText = currentShift.startCash;
    document.getElementById('reportSales').innerText = currentShift.sales;
    document.getElementById('reportDrops').innerText = currentShift.drops;
    
    const expected = currentShift.startCash + currentShift.sales - currentShift.drops;
    document.getElementById('reportExpectedCash').innerText = expected;

    endShiftModal.style.display = 'flex';
    closeSidebar();
});
document.getElementById('closeEndShiftBtn').addEventListener('click', () => {
    endShiftModal.style.display = 'none';
});

document.getElementById('confirmEndShiftBtn').addEventListener('click', async () => {
    const btn = document.getElementById('confirmEndShiftBtn');
    btn.innerText = "جاري إغلاق الوردية...";
    btn.disabled = true;

    try {
        // تحديث حالة الوردية في السيرفر لـ "مغلقة"
        await updateDoc(doc(db, "shifts", currentShift.id), {
            status: "closed",
            endTime: new Date().toISOString(),
            sales: currentShift.sales // للتأكيد فقط
        });

        currentShift = { id: null, active: false, cashierName: "", startCash: 0, sales: 0, drops: 0, startTime: null };
        document.getElementById('shiftInfoDisplay').innerText = '';
        endShiftModal.style.display = 'none';
        
        if (posSection.style.display !== 'none') {
            startShiftModal.style.display = 'flex';
        }
        
        document.getElementById('cashierPasswordInput').value = '';
        document.getElementById('startCashInput').value = '';
        window.playSound('success');
        alert("تم تقفيل الوردية بنجاح.");
    } catch (error) {
        alert("حدث خطأ أثناء الاتصال بالسيرفر لإغلاق الوردية!");
    } finally {
        btn.innerText = "إنهاء الوردية وبدء وردية جديدة";
        btn.disabled = false;
    }
});

// ==========================================
// 6. إدارة المخزن والكاشيرية
// ==========================================
document.getElementById('addProductForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = "جاري الإضافة...";
    btn.disabled = true;

    const newProduct = {
        barcode: document.getElementById('prodBarcode').value,
        name: document.getElementById('prodName').value,
        buyPrice: parseFloat(document.getElementById('prodBuyPrice').value),
        sellPrice: parseFloat(document.getElementById('prodSellPrice').value),
        quantity: parseInt(document.getElementById('prodQty').value),
        minAlert: parseInt(document.getElementById('prodMinAlert').value)
    };

    try {
        await addDoc(collection(db, "products"), newProduct);
        alert("تمت إضافة المنتج بنجاح!");
        document.getElementById('addProductForm').reset();
        loadInventory();
    } catch (error) {
        alert("حدث خطأ أثناء الإضافة.");
    } finally {
        btn.innerText = "إضافة / تحديث المنتج";
        btn.disabled = false;
    }
});

async function loadInventory() {
    const tbody = document.getElementById('inventoryBody');
    tbody.innerHTML = '<tr><td colspan="6">جاري التحميل...</td></tr>';
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        productsList = [];
        tbody.innerHTML = '';
        querySnapshot.forEach((doc) => {
            let prod = doc.data();
            prod.id = doc.id;
            productsList.push(prod);
            let isLowStock = prod.quantity <= prod.minAlert ? 'low-stock' : '';
            tbody.innerHTML += `
                <tr class="${isLowStock}">
                    <td>${prod.barcode}</td>
                    <td>${prod.name}</td>
                    <td>${prod.quantity}</td>
                    <td>${prod.buyPrice}</td>
                    <td>${prod.sellPrice}</td>
                    <td><button onclick="alert('سيتم إضافة التعديل لاحقاً')">تعديل</button></td>
                </tr>`;
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6">خطأ في تحميل البيانات</td></tr>';
    }
}

document.getElementById('addCashierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newCashierName').value.trim();
    const pass = document.getElementById('newCashierPass').value.trim();

    try {
        await addDoc(collection(db, "cashiers"), { name: name, password: pass });
        alert("تم إضافة الكاشير بنجاح!");
        document.getElementById('addCashierForm').reset();
        loadCashiers();
    } catch (error) {
        alert("حدث خطأ أثناء إضافة الكاشير.");
    }
});

async function loadCashiers() {
    const tbody = document.getElementById('cashiersBody');
    tbody.innerHTML = '<tr><td colspan="3">جاري التحميل...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "cashiers"));
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const data = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${data.name}</td>
                    <td>${data.password}</td>
                    <td><button style="background:var(--danger-color)" onclick="alert('سيتم تفعيل الحذف لاحقاً')">حذف</button></td>
                </tr>`;
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="3">خطأ في تحميل البيانات</td></tr>';
    }
}

// ==========================================
// 7. شاشة البيع وتأكيد الفاتورة
// ==========================================

const barcodeInput = document.getElementById('barcodeInput');
barcodeInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const code = barcodeInput.value.trim();
        if(code === "") return;

        try {
            const q = query(collection(db, "products"), where("barcode", "==", code), limit(1));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const productDoc = querySnapshot.docs[0];
                let product = productDoc.data();
                product.id = productDoc.id;
                addToCart(product);
                barcodeInput.value = '';
            } else {
                const qName = query(collection(db, "products"), where("name", ">=", code), where("name", "<=", code + '\uf8ff'), limit(1));
                const nameSnapshot = await getDocs(qName);
                
                if (!nameSnapshot.empty) {
                    const productDoc = nameSnapshot.docs[0];
                    let product = productDoc.data();
                    product.id = productDoc.id;
                    addToCart(product);
                    barcodeInput.value = '';
                } else {
                    window.playSound('error');
                    alert("المنتج غير موجود!");
                }
            }
        } catch (error) {
            window.playSound('error');
            alert("حدث خطأ في البحث!");
        }
    }
});

function addToCart(product) {
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
        if(product.quantity > 0) {
            cart.push({ ...product, cartQty: 1 });
            window.playSound('success'); 
        } else {
            window.playSound('error'); 
            alert("المنتج نفذ من المخزن!");
            return;
        }
    }
    renderCart();
}

function renderCart() {
    const tbody = document.getElementById('cartBody');
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

document.getElementById('checkoutBtn').addEventListener('click', async () => {
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
        
        // 1. إضافة الفاتورة
        const invoiceRef = doc(collection(db, "invoices")); 
        batch.set(invoiceRef, newInvoice);

        // 2. خصم الكميات من المخزن
        for (const item of cart) {
            const productRef = doc(db, "products", item.id);
            const newQty = item.quantity - item.cartQty;
            batch.update(productRef, { quantity: newQty });
        }

        // 3. تحديث مبيعات الوردية في السيرفر في نفس اللحظة
        const shiftRef = doc(db, "shifts", currentShift.id);
        batch.update(shiftRef, { sales: currentShift.sales + totalSales });

        // تنفيذ كل العمليات مرة واحدة (عشان مفيش حاجة تتحفظ والتانية تقع)
        await batch.commit();

        currentShift.sales += totalSales; // تحديث الرقم في الشاشة

        window.playSound('success'); 
        alert("تم البيع وحفظ الفاتورة بنجاح!");
        cart = [];
        renderCart();
        document.getElementById('barcodeInput').focus();

    } catch (error) {
        console.error(error);
        window.playSound('error'); 
        alert("حدث خطأ! لم يتم حفظ الفاتورة.");
    } finally {
        btn.innerText = "تأكيد البيع وحفظ الفاتورة";
        btn.disabled = false;
    }
});

// ==========================================
// 8. المصروفات والإحصائيات
// ==========================================
document.getElementById('addExpenseForm').addEventListener('submit', async (e) => {
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

        document.getElementById('totalSalesStat').innerText = totalSales + " جنيه";
        document.getElementById('totalExpensesStat').innerText = totalExpenses + " جنيه";
        
        const netProfitEl = document.getElementById('netProfitStat');
        netProfitEl.innerText = netProfit + " جنيه";
        netProfitEl.style.color = netProfit >= 0 ? "var(--success-color)" : "var(--danger-color)";

    } catch (error) {
        console.error("Error loading stats: ", error);
    }
}

// ==========================================
// 9. القائمة الجانبية والكاميرا والصوتيات
// ==========================================
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const menuBtn = document.getElementById('menuBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');

function openSidebar() { sidebar.classList.add('active'); sidebarOverlay.classList.add('active'); }
function closeSidebar() { sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); }

menuBtn.addEventListener('click', openSidebar);
closeSidebarBtn.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

const successSound = document.getElementById('successSound');
const errorSound = document.getElementById('errorSound');

window.playSound = function(type) {
    try {
        if (type === 'success') { successSound.currentTime = 0; successSound.play(); }
        else if (type === 'error') { errorSound.currentTime = 0; errorSound.play(); }
    } catch (error) {}
};

// --- هنا التعديل الجديد للكاميرا المتقدمة ---
const startCameraBtn = document.getElementById('startCameraBtn');
const readerDiv = document.getElementById('reader');
let html5QrCode;
let isCameraOpen = false;

// متغيرات للتحكم في المسح المتتالي
let lastScanTime = 0;
let lastScannedCode = "";

startCameraBtn.addEventListener('click', () => {
    if (isCameraOpen) {
        html5QrCode.stop().then(() => {
            readerDiv.style.display = 'none';
            isCameraOpen = false;
            startCameraBtn.innerHTML = '📷'; 
            readerDiv.style.boxShadow = "none"; // إعادة ضبط التأثير البصري
        }).catch(err => console.log("خطأ في إغلاق الكاميرا"));
    } else {
        readerDiv.style.display = 'block';
        html5QrCode = new window.Html5Qrcode("reader");
        
        // إعدادات الكاميرا المتقدمة (30 فريم)
        const cameraConfig = {
            fps: 30, 
            qrbox: { width: 250, height: 100 }
        };

        const videoConstraints = { facingMode: "environment" };

        html5QrCode.start(
            videoConstraints, 
            cameraConfig,
            (decodedText) => {
                const currentTime = new Date().getTime();
                
                // 1. لو نفس المنتج ولسه معداش 4 ثواني، وقف الكود هنا تماماً (حائط الصد لمنع التكرار)
                if (decodedText === lastScannedCode && (currentTime - lastScanTime) < 4000) {
                    return; 
                }

                // 2. لو منتج جديد أو عدى 4 ثواني، كمل عادي وسجل البيانات
                lastScanTime = currentTime;
                lastScannedCode = decodedText;
                
                const barcodeInput = document.getElementById('barcodeInput');
                barcodeInput.value = decodedText;
                
                // التأكيد الصوتي
                window.playSound('success');
                
                // التأكيد المرئي (وميض أخضر حول الكاميرا)
                readerDiv.style.transition = "box-shadow 0.2s ease";
                readerDiv.style.boxShadow = "0px 0px 20px 5px var(--success-color)";
                
                // إخفاء الوميض بعد نصف ثانية
                setTimeout(() => {
                    readerDiv.style.boxShadow = "none";
                }, 500);

                // محاكاة الضغط على Enter للبحث وإضافته للسلة فوراً
                barcodeInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));

                // 3. تأمين أخير عشان لو الدالة صفرت الخانة، الكاميرا متتخدعش وتقراه من تاني
                setTimeout(() => {
                    if (barcodeInput.value === "") {
                        // لا تفعل شيء، فقط حافظ على الذاكرة
                    }
                }, 50);
            },
            (errorMessage) => {
                // يتم تجاهل أخطاء الفريمات الفارغة هنا
            } 
        ).then(() => {
            isCameraOpen = true;
            startCameraBtn.innerHTML = '❌ إغلاق الكاميرا';
        }).catch(() => {
            alert("برجاء السماح للمتصفح باستخدام الكاميرا!");
            readerDiv.style.display = 'none';
        });
    }
});
