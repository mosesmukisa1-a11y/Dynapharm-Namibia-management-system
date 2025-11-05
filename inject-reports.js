// Script to inject reports data into the website's localStorage
// Run this in the browser console after opening the website

fetch('reports_data.json')
    .then(response => response.json())
    .then(data => {
        localStorage.setItem('dyna_reports', JSON.stringify(data));
        console.log(`✅ Injected ${data.length} reports into localStorage`);
        alert(`${data.length} reports loaded successfully! Please refresh the page.`);
    })
    .catch(error => {
        console.error('Error loading reports:', error);
        alert('Error loading reports. Please check the console.');
    });
