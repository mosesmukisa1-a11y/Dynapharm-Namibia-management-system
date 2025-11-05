// Open browser console and run this to check localStorage
if (typeof localStorage !== 'undefined') {
    const barcodeStock = localStorage.getItem('dyna_barcode_stock');
    if (barcodeStock) {
        const stock = JSON.parse(barcodeStock);
        console.log('Total batches:', stock.length);
        console.log('Country stock batches:', stock.filter(b => b.location === 'country_stock').length);
        console.log('Available batches:', stock.filter(b => b.status === 'available').length);
        console.log('Sample batch:', stock[0]);
    } else {
        console.log('No barcode stock data found in localStorage');
    }
}
