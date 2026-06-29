

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
