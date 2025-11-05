# Quick Debug Checklist

Please check these in your browser console (F12):

## 1. Check if reports are loaded
Run this command and tell me the number:
```javascript
console.log('Reports count:', JSON.parse(localStorage.getItem('dyna_reports') || '[]').length);
```

## 2. Check the consultant name match
Run this:
```javascript
const reports = JSON.parse(localStorage.getItem('dyna_reports') || '[]');
const consultants = [...new Set(reports.map(r => r.consultant))];
console.log('Consultants in reports:', consultants);
```

## 3. Check your logged-in name
After logging in as "moses", run:
```javascript
console.log('Logged in as:', currentUser.fullName);
```

## 4. Manually test the filter
Run this after login:
```javascript
const reports = JSON.parse(localStorage.getItem('dyna_reports') || '[]');
const myReports = reports.filter(r => r.consultant === 'MOSES MUKISA');
console.log('Reports for MOSES MUKISA:', myReports.length);
myReports.forEach((r, i) => console.log(`${i+1}. ${r.clientInfo.fullName}`));
```

