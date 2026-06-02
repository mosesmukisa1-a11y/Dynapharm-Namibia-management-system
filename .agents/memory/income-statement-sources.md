---
name: Income Statement expense aggregation
description: How operating expenses are computed for the Finance/Director Accounts tab
---

The AccountsTab Income Statement pulls operating expenses via a single
`GET /api/finance/income-statement?startDate=...&endDate=...` endpoint
(api/finance/income-statement.js) rather than individual scattered calls.

Sources aggregated server-side:
- salary_ledger (status != 'removed') → monthly_total × periodMonths
- branch_rent_payments (total_payable > 0) → monthly_total × periodMonths
- branch_expenses (date in range, status != 'rejected') → by category
- dept_expenses (date in range, status != 'rejected') → by category
- petty_cash_transactions (type='expense', created_at in range) → by category

**Why:** Earlier approach called 8 separate APIs (salary-ledger, rent-payments,
dept-expenses, branch-expenses, etc.) in Promise.all and silently caught
failures — causing salary/rent to silently return 0 when any call failed.
Consolidating into one backend endpoint eliminates silent failures and
field-name guessing between snake_case DB columns and camelCase responses.

**How to apply:** If the income statement ever shows N$0 expenses, check
this endpoint first. The salary/rent figures are fixed monthly schedules
(not period-filtered) multiplied by periodMonths on the frontend.
