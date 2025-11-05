# GM Business Portal - User Guide

## Overview

The GM Portal is a comprehensive business transaction monitoring dashboard designed for General Managers to track and analyze all business activities across the Dynapharm Namibia system.

## Features

### 📊 Real-time Dashboard
- **Total Revenue**: Current financial performance tracking
- **Transactions Today**: Daily transaction volume
- **Active Clients**: Number of unique active clients
- **Pending Orders**: Orders requiring attention

### 🔍 Advanced Filtering
- **Date Range**: Filter by Today, This Week, This Month, This Year, or All Time
- **Status Filter**: Filter by Completed, Pending, or Cancelled transactions
- **Branch Filter**: View transactions by specific branch
- **Search**: Real-time search across transaction IDs, clients, and branches

### 📋 Transaction Management
- Complete transaction history
- Detailed client information
- Branch-wise breakdown
- Status tracking and monitoring

### 📈 Recent Activity Feed
- Real-time activity updates
- Chronological display of business events
- Quick view of recent transactions

## Access the Portal

### Method 1: Direct Access
Simply open `gm-portal.html` in your web browser.

### Method 2: Integration with Main System
The portal can be integrated into the main Dynapharm system by adding a navigation link.

## Usage Instructions

### Viewing Dashboard Statistics

1. **Open the Portal**: Navigate to `gm-portal.html`
2. **View Statistics**: The top cards show key business metrics:
   - Total Revenue (with month-over-month change)
   - Today's Transactions
   - Active Clients
   - Pending Orders

### Filtering Transactions

1. **Select Date Range**: Use the "Date Range" dropdown to filter by time period
2. **Filter by Status**: Select transaction status (All, Completed, Pending, Cancelled)
3. **Filter by Branch**: Choose a specific branch or view all branches
4. **Search**: Type in the search box to find specific transactions

### Viewing Transaction Details

The main table displays:
- **Transaction ID**: Unique identifier for each transaction
- **Client Name**: Who the transaction is with
- **Branch**: Which branch processed the transaction
- **Amount**: Transaction value in NAD
- **Date**: When the transaction occurred
- **Status**: Current status (Completed, Pending, Cancelled)

### Monitoring Recent Activity

The right panel shows the most recent business activities, including:
- Transaction type and client
- Transaction amount and branch
- Timestamp

### Refreshing Data

1. Click the "🔄 Refresh" button to reload all data
2. The portal auto-refreshes every 30 seconds
3. A success indicator confirms when data is updated

## Data Sources

The portal pulls data from:
- `reports_data.json` - Report and transaction data
- `api/clients.js` - Client information
- `api/branches.js` - Branch details

## Technical Details

### API Endpoints

The portal uses the following API:
- `api/transactions.js` - Main transactions API
  - `getTransactions(filters)` - Fetch filtered transactions
  - `getTransactionSummary()` - Get monthly summaries
  - `getBranchPerformance()` - Get branch-wise performance

### Data Transformation

Reports are automatically transformed into transaction format:
- Product quantities and prices are calculated
- Client details are attached
- Branch information is included
- Timestamps are standardized

### Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive design
- Requires JavaScript enabled

## Troubleshooting

### No Data Displayed

1. Check that `reports_data.json` exists and has data
2. Verify API endpoints are accessible
3. Check browser console for errors
4. Ensure JavaScript is enabled

### Filter Not Working

1. Clear browser cache
2. Refresh the page
3. Check filter dropdown selections
4. Try different date ranges

### Update Data Manually

If auto-refresh isn't working:
1. Click the "🔄 Refresh" button manually
2. Check network connectivity
3. Verify API endpoints are responding

## Customization

### Adding New Filters

Edit the HTML to add new filter options:
```html
<select class="filter-select" id="newFilter">
    <option value="option1">Option 1</option>
</select>
```

### Modifying Statistics

Edit the `updateDashboard()` function to add new metrics:
```javascript
const newStat = filtered.reduce((sum, t) => sum + t.newField, 0);
document.getElementById('newStat').textContent = newStat;
```

### Changing Auto-Refresh Interval

Modify the interval in `initializePortal()`:
```javascript
setInterval(() => {
    refreshData();
}, 60000); // Change to 60 seconds
```

## Security Notes

- The portal is designed for internal use
- No authentication is included by default
- Consider adding authentication for production use
- Data is read-only; no modifications are made to source data

## Support

For issues or questions:
1. Check this guide first
2. Review browser console for errors
3. Verify data files exist and contain data
4. Contact system administrator

## Future Enhancements

Potential improvements:
- Export to Excel/PDF
- Advanced charts and graphs
- Email notifications for pending orders
- Multi-user support with roles
- Historical trend analysis
- Comparative reporting
