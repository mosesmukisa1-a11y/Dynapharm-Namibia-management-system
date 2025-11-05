# How to Load Reports and Prescriptions into the System

## Quick Method (Console)

1. Go to: https://mosesmukisa1-a11y.github.io/dynapharm-namibia-health/
2. Open browser console (F12 → Console tab)
3. Copy and paste this code:

```javascript
fetch('inject-data.js')
    .then(response => response.text())
    .then(text => {
        // Extract and execute the injectData function
        const script = document.createElement('script');
        script.textContent = text;
        document.body.appendChild(script);
        // Call the function
        if (typeof injectData === 'function') {
            injectData();
            alert('✅ All 24 reports loaded! Refreshing page...');
            setTimeout(() => location.reload(), 1000);
        }
    })
    .catch(err => console.error('Error:', err));
```

4. Press Enter
5. Page will reload automatically with all reports loaded

## Alternative: Manual Console Method

Run this in the console:

```javascript
fetch('reports_data.json')
    .then(r => r.json())
    .then(data => {
        localStorage.setItem('dyna_reports', JSON.stringify(data));
        console.log(`✅ Loaded ${data.length} reports`);
        location.reload();
    });
```

## What's Loaded:
- ✅ 24 health consultation reports
- ✅ All prescription data with medicines
- ✅ Client information for each report
- ✅ Dispensing status and payment tracking
- ✅ Follow-up dates and notes

## Verify:
After loading, check the reports count in console:
```javascript
JSON.parse(localStorage.getItem('dyna_reports')).length
```
Should show: 24

