# Setup Guide: Online Shop Delivery System

## Quick Start

### 1. Run Database Migration

Execute the SQL script to create the necessary tables:

```bash
# Using psql
psql $DATABASE_URL -f backend/create_delivery_tables.sql

# Or using Railway CLI
railway run psql $DATABASE_URL -f backend/create_delivery_tables.sql
```

### 2. Verify Tables Created

Check that the tables were created successfully:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('towns', 'delivery_distances', 'online_orders');
```

### 3. Verify Default Data

Check that towns were inserted:

```sql
SELECT COUNT(*) FROM towns;  -- Should return 20
SELECT * FROM towns LIMIT 5;
```

### 4. Update Delivery Distances

Update the delivery distances with actual values. Example:

```sql
-- Update distance for Windhoek from Townshop (5km = 15% fee)
UPDATE delivery_distances 
SET distance_km = 5, delivery_fee_percentage = 15.00 
WHERE id = 'dd_townshop_windhoek';

-- Update distance for Oshakati from Townshop (750km = 20% fee)
UPDATE delivery_distances 
SET distance_km = 750, delivery_fee_percentage = 20.00 
WHERE id = 'dd_townshop_oshakati';
```

### 5. Test the System

1. Open `index.html` in a browser
2. Add products to cart
3. Click "Proceed to Checkout"
4. Test both pickup and delivery options
5. Verify delivery fee calculation

## API Endpoints

### Test Towns API
```bash
# Get all towns
curl http://localhost:3000/api/towns

# Get specific town
curl http://localhost:3000/api/towns?name=Windhoek
```

### Test Delivery API
```bash
# Calculate delivery fee
curl -X POST http://localhost:3000/api/delivery \
  -H "Content-Type: application/json" \
  -d '{
    "town_id": "town_windhoek",
    "subtotal": 1000
  }'
```

### Test Orders API
```bash
# Create order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "John Doe",
    "customer_phone": "+264811234567",
    "delivery_method": "pickup",
    "branch_id": "townshop",
    "subtotal": 1000,
    "items": [{"name": "Product 1", "price": 500, "quantity": 2}]
  }'
```

## Troubleshooting

### Issue: Delivery fee not calculating
- Check that `delivery_distances` table has data
- Verify town_id and branch_id are correct
- Check API logs for errors

### Issue: Towns not loading
- Verify `towns` table has data
- Check API endpoint is accessible
- Check browser console for errors

### Issue: Orders not saving
- Verify database connection
- Check `online_orders` table exists
- Verify API endpoint is working
- Check browser console for errors

## Next Steps

1. Update delivery distances with actual values
2. Add more towns if needed
3. Configure delivery zones
4. Set up order notifications
5. Integrate payment processing

