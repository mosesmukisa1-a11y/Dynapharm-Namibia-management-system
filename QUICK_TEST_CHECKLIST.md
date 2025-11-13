# ✅ Quick Testing Checklist
## Dynapharm Namibia Management System

**Date:** January 2025  
**Purpose:** Pre-handover testing verification

---

## 🔐 Authentication Testing

### **Warehouse Manager Login (Ondangwa)**
- [ ] Navigate to Stock Management Portal
- [ ] Click "🏭 Warehouse Manager Login" button
- [ ] Select "Ondangwa Warehouse" from dropdown
- [ ] Enter valid credentials
- [ ] Verify login succeeds
- [ ] Verify "Ondangwa Warehouse Only" badge appears
- [ ] Verify only Ondangwa warehouse data is visible
- [ ] Verify other warehouse tabs are hidden/filtered

### **Regular Staff Login**
- [ ] Test login for each role (consultant, dispenser, admin, etc.)
- [ ] Verify correct portal access based on role
- [ ] Verify session timeout warning appears (after 25 minutes)
- [ ] Verify auto-logout works (after 30 minutes)
- [ ] Test "Remember Me" functionality
- [ ] Test password visibility toggle

---

## 📦 Stock Management Testing

### **Warehouse Filtering**
- [ ] Login as Ondangwa warehouse manager
- [ ] Verify stock inventory shows only Ondangwa items
- [ ] Verify reports show only Ondangwa data
- [ ] Verify stock transfers filtered by warehouse
- [ ] Verify cannot see Windhoek warehouse data
- [ ] Verify warehouse badge persists across page refreshes

### **Stock Operations**
- [ ] View stock inventory
- [ ] Search/filter products
- [ ] View stock reports
- [ ] Export data to CSV
- [ ] View stock movements
- [ ] Check low stock alerts

---

## 🔄 Real-Time Synchronization

- [ ] Open portal in two browser windows
- [ ] Make change in one window
- [ ] Verify change appears in other window automatically
- [ ] Check WebSocket connection status indicator
- [ ] Verify reconnection after disconnect

---

## 📱 Mobile Testing

- [ ] Test on mobile device (or browser dev tools mobile view)
- [ ] Verify hamburger menu works
- [ ] Verify forms are touch-friendly
- [ ] Verify tables scroll horizontally if needed
- [ ] Verify buttons are large enough for touch
- [ ] Test login on mobile

---

## 🛡️ Security Testing

- [ ] Test login with invalid credentials (should fail)
- [ ] Test login attempt lockout (5 attempts)
- [ ] Test session timeout
- [ ] Verify warehouse manager cannot access other warehouse data
- [ ] Verify role-based access restrictions
- [ ] Test logout functionality

---

## 📊 Data Validation

- [ ] Test form validation (required fields)
- [ ] Test email format validation
- [ ] Test phone number validation
- [ ] Test date validation
- [ ] Verify error messages display correctly
- [ ] Test form submission with invalid data

---

## 🐛 Error Handling

- [ ] Disconnect internet and test offline behavior
- [ ] Test API error handling (simulate API failure)
- [ ] Verify error messages are user-friendly
- [ ] Check browser console for errors (F12)
- [ ] Verify loading indicators appear during operations

---

## 📈 Performance Testing

- [ ] Test page load times
- [ ] Test with large datasets (1000+ items)
- [ ] Verify pagination works for large lists
- [ ] Check localStorage usage (should not exceed limits)
- [ ] Test export functions with large data

---

## ✅ Final Verification

- [ ] All critical features working
- [ ] No console errors (except expected image 404s)
- [ ] Mobile responsive
- [ ] Warehouse filtering working correctly
- [ ] Real-time sync working
- [ ] Security features active
- [ ] Error handling robust
- [ ] User experience smooth

---

## 📝 Notes

**Tested By:** _________________  
**Date:** _________________  
**Status:** ⬜ Pass ⬜ Fail ⬜ Needs Review

**Issues Found:**
- 
- 
- 

**Recommendations:**
- 
- 
- 

---

**End of Checklist**

