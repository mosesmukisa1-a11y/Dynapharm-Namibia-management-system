# Online Shop Delivery & Pickup Implementation

## Overview
This document describes the implementation of the online shop checkout system with delivery and pickup options, including automatic delivery fee calculation based on distance from branches.

## Features Implemented

### 1. Cart Functionality
- ✅ Users can add items to cart **without selecting a branch**
- ✅ Cart persists across sessions
- ✅ Customer type selection (Customer/Distributor) determines pricing

### 2. Checkout Process
- ✅ Checkout modal with delivery method selection
- ✅ Two delivery options:
  - **Branch Pickup** (0% fee)
  - **Home Delivery** (15% or 20% fee based on distance)

### 3. Delivery Fee Calculation
- ✅ **0% fee** for branch pickup
- ✅ **15% fee** for delivery to towns < 50km from nearest branch
- ✅ **20% fee** for delivery to towns ≥ 50km from nearest branch
- ✅ Automatic distance calculation from nearest branch

### 4. Database Tables

#### `towns`
Stores all delivery towns/cities in Namibia
- `id`: Unique identifier
- `name`: Town name
- `region`: Region name
- `latitude`, `longitude`: GPS coordinates (optional)

#### `delivery_distances`
Stores distances from branches to towns
- `id`: Unique identifier
- `branch_id`: Reference to branches table
- `town_id`: Reference to towns table
- `distance_km`: Distance in kilometers
- `delivery_fee_percentage`: Fee percentage (15% or 20%)

#### `online_orders`
Enhanced order table with delivery information
- `id`: Unique identifier
- `order_number`: Human-readable order number
- `customer_name`, `customer_email`, `customer_phone`: Customer info
- `customer_type`: 'customer' or 'distributor'
- `delivery_method`: 'pickup' or 'delivery'
- `branch_id`: Selected branch (for pickup)
- `town_id`: Selected town (for delivery)
- `delivery_address`: Full address (for delivery)
- `subtotal`: Cart subtotal
- `delivery_fee`: Calculated delivery fee
- `delivery_fee_percentage`: Fee percentage applied
- `total_amount`: Final total (subtotal + delivery fee)
- `distance_km`: Distance from branch to town
- `status`: Order status (pending, confirmed, processing, shipped, delivered, cancelled)
- `payment_status`: Payment status
- `items`: JSON array of order items

### 5. API Endpoints

#### `/api/towns`
- `GET`: Get all towns or specific town by ID/name
- `POST`: Create new town
- `PUT`: Update town
- `DELETE`: Delete town

#### `/api/delivery`
- `GET`: Get delivery distances (filter by town_id or branch_id)
- `POST`: Calculate delivery fee for a cart
  - Request: `{ town_id, branch_id (optional), subtotal }`
  - Response: `{ delivery_fee, delivery_fee_percentage, distance_km, total_amount, fee_type }`

#### `/api/orders`
- `GET`: Get orders (filter by id, order_number, status, customer_email, customer_phone)
- `POST`: Create new order
  - Automatically calculates delivery fee
  - Generates unique order number
  - Saves to database and localStorage (fallback)
- `PUT`: Update order status

## Workflow

### Adding Items to Cart
1. User browses products
2. Clicks "Add to Cart" - **no branch selection required**
3. First item prompts for customer type (Customer/Distributor)
4. Subsequent items use same customer type
5. Cart displays with item count badge

### Checkout Process
1. User clicks "Proceed to Checkout"
2. Checkout modal opens with:
   - Order summary
   - Customer information form
   - Delivery method selection (Pickup/Delivery)
3. **If Pickup selected:**
   - Branch selection dropdown appears
   - No delivery fee (0%)
   - Total = Subtotal
4. **If Delivery selected:**
   - Town selection dropdown appears
   - Delivery address field appears
   - System calculates delivery fee:
     - Finds nearest branch to selected town
     - Checks distance from database
     - Applies 15% if < 50km, 20% if ≥ 50km
   - Total = Subtotal + Delivery Fee
5. User fills in required information
6. Clicks "Place Order"
7. Order is saved to database and localStorage
8. Success message with order number
9. Cart is cleared

## Database Setup

Run the SQL script to create tables:
```bash
psql $DATABASE_URL -f backend/create_delivery_tables.sql
```

This will:
- Create `towns`, `delivery_distances`, and `online_orders` tables
- Insert default towns (20 major towns in Namibia)
- Insert sample delivery distances
- Create indexes for performance

## Configuration

### Default Towns
The system includes 20 default towns:
- Windhoek, Oshakati, Ondangwa, Rundu, Walvis Bay, Swakopmund
- Katima Mulilo, Gobabis, Otjiwarongo, Okahandja
- Keetmanshoop, Luderitz, Tsumeb, Ongwediva
- Outapi, Okongo, Okahao, Nkurenkuru, Eenhana, Hochland Park

### Delivery Distances
Sample distances are pre-populated. Update with actual distances:
```sql
UPDATE delivery_distances 
SET distance_km = 45, delivery_fee_percentage = 15.00 
WHERE branch_id = 'townshop' AND town_id = 'town_windhoek';
```

## Testing

### Test Pickup Order
1. Add items to cart
2. Click checkout
3. Select "Branch Pickup"
4. Select a branch
5. Fill customer info
6. Submit order
7. Verify: Total = Subtotal (no delivery fee)

### Test Delivery Order (< 50km)
1. Add items to cart
2. Click checkout
3. Select "Home Delivery"
4. Select a town < 50km from nearest branch
5. Enter delivery address
6. Verify: Delivery fee = 15% of subtotal
7. Submit order

### Test Delivery Order (≥ 50km)
1. Add items to cart
2. Click checkout
3. Select "Home Delivery"
4. Select a town ≥ 50km from nearest branch
5. Enter delivery address
6. Verify: Delivery fee = 20% of subtotal
7. Submit order

## Files Modified/Created

### Created Files
- `backend/create_delivery_tables.sql` - Database schema
- `api/towns.js` - Towns API endpoint
- `api/delivery.js` - Delivery fee calculation API
- `api/orders.js` - Enhanced orders API with delivery support

### Modified Files
- `index.html` - Added checkout modal and delivery/pickup logic

## Future Enhancements

1. **Distance Calculation**: Integrate with Google Maps API for automatic distance calculation
2. **Delivery Zones**: Define delivery zones with different fee structures
3. **Delivery Time Slots**: Allow customers to select delivery time windows
4. **Order Tracking**: Real-time order status updates
5. **Payment Integration**: Online payment processing
6. **Delivery Scheduling**: Schedule deliveries for specific dates

## Notes

- Orders are saved to both database and localStorage for offline support
- Delivery fee calculation falls back to 20% if distance not found in database
- System automatically finds nearest branch if branch_id not provided for delivery
- All prices are in Namibian Dollars (N$)

