# Permissions Overview

## Roles

- GM/Director: Full system access. View CIF values, remittance metrics, stock depletion graphs, BV, margins, and all dashboards.
- Finance: Finance dashboards and approvals. CIF visible (Finance Manager only). No warehouse operations.
- Warehouse/Stock Manager: Dispatch, requisitions, FEFO enforcement. No CIF visibility.
- Sales Rep/Dispenser: POS, own sales/BV, Namibia internal statement only. No CIF.

### HR Roles

- HR Manager (`hr_manager`): Manage attendance, leave approvals, timesheets, and HR reports.
- HR Administrator (`hr_admin`): Full HR configuration, employee records, shift templates, export.

## Notes

- CIF refers to landed cost (approximated here as CP from price list where available).
- Director Portal: `director-portal.html` provides KPIs and stock depletion visualization using `reports_data.json`.
- GM Portal remains available at `gm-portal.html` for operational monitoring.
 - HR Portal available at `hr-portal.html` (Attendance, Leave, Approvals, and basic exports).
