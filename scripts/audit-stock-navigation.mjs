import fs from 'node:fs/promises';
const root='client/src/pages/portals/StockPortal.jsx';
const source=await fs.readFile(root,'utf8');
const entries=[
['aiDashboard','Command Center','AICommandCenter','Action queues and national overview','batches, movements, transfers, branch sales','Stock staff','KEEP','Compare with Overview and Realtime; action queues are distinct.'],
['overview','Overview','OverviewTab','Stock summary by location','batches, transfers, supplier imports, field stock, branch summaries','Stock staff','KEEP','Summary is not proven equivalent to Command Center.'],
['realtime','Realtime','RealtimeTab','Live movement and operational monitoring','realtime stock endpoints','Stock staff','KEEP','Live monitoring distinct; websocket reconnect unverified.'],
['countryStock','Country Stock','CountryStockTab','Release received imports to warehouses','country stock and import layers','Stock intake staff','KEEP','Source stock is not interchangeable with warehouse or branch stock.'],
['warehouses','Warehouses','WarehousesTab','Warehouse receipts, dispatches, returns and write-offs','stock_batches, transfers, warehouse movements','Warehouse/stock staff','KEEP','WarehouseTab supplies specialist subviews, including write-offs.'],
['branchStock','Branch Stock','BranchStockTab','Branch quantities and product range reports','branch stock summary and range report','Authorized branch/stock staff','KEEP','Do not combine branch ownership with warehouse ownership.'],
['inventory','Inventory','InventoryTab','Movement history and stock operations','central movements, batches, imports, transfers','Stock staff','FIX','Multiple representations; filter and export parity require workflow tests.'],
['batch','Batches','BatchTab','Create and inspect product lots','stock_batches','Stock staff','KEEP','Bulk lot management distinct from barcode printing.'],
['fieldStock','Field Stock','FieldStockTab','Allocate and reconcile stock held by field staff','field stock assignments','Authorized stock staff','KEEP','Staff accountability is not a warehouse transfer.'],
['barcode','Barcode','BarcodeTab','Generate, scan and print lot labels','stock_batches and prices','Stock staff','KEEP','Bulk label workflow justifies separate access pending tests.'],
['distribution','Distribution','DistributionTab','Country-to-warehouse distribution','transfers, source layers and batches','Stock distribution staff','KEEP','Different source/receipt rules from branch dispatch.'],
['orders','Warehouse dispatch','OrdersTab','Fulfil branch requests from warehouses','stock_requests, FEFO batches, transfers','Stock dispatch staff','KEEP','Legacy Orders is this view, not an extra destination.'],
['transfers','Branch transfers','TransfersTab','Branch-to-branch transfer workflow','stock transfers','Authorized stock/branch staff','KEEP','Preserve destination confirmation and source reservations.'],
['dispatchReturns','Dispatch returns','DispatchReturnsTab','Receive linked dispatch returns','linked returns and original dispatch evidence','Stock/GM/admin roles allowed by current UI','KEEP','Distinct from customer refunds and physical counting.'],
['refundApprovals','Refund Approvals','RefundApprovalsTab','Review monetary/customer returns','refund requests and linked evidence','Authorized refund approver','KEEP','Financial approval differs from disposal or transfer receipt.'],
['adjustments','Edit Requests','AdjustmentsTab','Approve or reject proposed stock corrections','stock adjustments','GM approval','KEEP','Historical correction approval must remain separate.'],
['controlledOperations','Counts & returns','ControlledStockOperations','Physical counting, holds and controlled returns','controlled operations and stock cost layers','Stock staff; approval where required','KEEP','Counting and returns remain distinct workflows within existing component.'],
['writeOffs','Write-offs','WriteOffsTab','Write-off requests, disposal and audit history','stock_movements and lot data','GM write-off approval; stock disposal','FIX / MOVE','Confirmed disposal status mismatch and false success; move to Adjustments & Disposal.'],
['stockReports','Stock Reports','StockReportsTab','Quantity and movement reporting','branch summaries, MIS stock report, batches','Authorized reporting staff','KEEP','Quantity report is not cost or valuation.'],
['costReport','Cost Report','StockCostReport','Original received cost reporting','stock cost report endpoints','Authorized reporting staff','KEEP','Do not replace original cost with current list prices.'],
['valuation','Valuation','ValuationTab','Current stock valuation','stock valuation endpoint','Authorized reporting staff','KEEP','Separate valuation basis must be preserved.'],
['reorder','Reorder','SmartReorderTab','Create and manage supplier orders','supplier_orders, batches and movements','Stock purchasing staff','MOVE','Writes supplier orders; operational Replenishment, not merely Reports.'],
['supplierImport','Supplier Import','SupplierImportTab','Receive imports and carton/pack quantities','supplier imports, products, packs and batches','Stock intake staff','MOVE','Incoming inventory belongs under Stock Intake.'],
['alertSettings','Alert Settings','StockAlertSettings','Configure stock alert policy','stock alert policy','Policy canEdit permission','KEEP','Shared with alert provider; cannot assume only reorder uses it.'],
['campaigns','Campaigns','StockCampaignsTab','Manage campaign stock activities','campaign endpoints','Authorized campaign staff','KEEP','Global placement requires confirming stock-specific actions are retained.'],
['staffServices','Staff Services','StaffServicesTab','Shared staff service requests','staff services endpoints','Current signed-in staff','KEEP','Shared component, but replacement global navigation not yet verified.'],
['messages','My Messages','StaffMessagesTab','Read and act on staff messages','staff message endpoints','Current signed-in recipient','KEEP','Do not remove without testing alternative recipient-scoped destination.'],
];
const functions=[...source.matchAll(/^function (\w+)\(/gm)];
function body(name){const i=functions.findIndex(m=>m[1]===name);return i<0?'':source.slice(functions[i].index,functions[i+1]?.index??source.length);}
const records=[];
for(const [id,label,component,purpose,data,users,recommendation,reason] of entries){
 let file=root,text=body(component);
 if(!text){
   const imp=source.match(new RegExp(`import [^;]*\\b${component}\\b[^;]*from ['"]([^'"]+)`));
   if(imp){const path=await import('node:path');file=path.normalize(path.join(path.dirname(root),imp[1]))+'.jsx';try{text=await fs.readFile(file,'utf8');}catch{text='';}}
 }
 if(component==='WarehousesTab')text+='\n'+body('WarehouseTab');
 const calls=[...new Set([...text.matchAll(/api\.([\w.]+)\(/g)].map(m=>m[1]))];
 const literals=[...new Set([...text.matchAll(/['"`](\/(?:api\/)?[\w/-]+)(?:[?'\"`])/g)].map(m=>m[1]))];
 records.push({id,label,route:`/stock?view=${id}`,component,file,purpose,intendedUsers:users,dataSource:data,
   apis:[...calls,...literals].join('; ')||'Provider/nested component; further endpoint tracing required',
   actions:calls.join('; ')||'Nested/provider actions: not independently executed',
   permissions:`${users}; ProtectedRoute(stock) plus endpoint guards. Full role/location matrix NOT VERIFIED.`,
   dependencies:`Shared authenticated session, location model, stock APIs; ${component==='alertSettings'?'StockAlertPolicyProvider':'related intake/receipt/ledger histories'}`,
   overlap:reason,recommendation,evidence:`Source inspected: ${file}; ${component}.`,
   tests:'STATIC SOURCE REVIEW ONLY. Browser and stock-changing workflows NOT VERIFIED in this initial matrix.',
   blocker:'Per-workflow fixtures, roles, pagination/export and failure/replay cases have not all been executed.'});
}
const dir='generated-artifacts/stock-navigation-audit';await fs.mkdir(dir,{recursive:true});
await fs.writeFile(`${dir}/initial-matrix.json`,JSON.stringify(records,null,2));
const keys=Object.keys(records[0]),csv=[keys.join(','),...records.map(r=>keys.map(k=>`"${String(r[k]).replaceAll('"','""')}"`).join(','))].join('\n');
await fs.writeFile(`${dir}/initial-matrix.csv`,csv);
await fs.writeFile(`${dir}/initial-matrix.md`,'# Initial stock portal audit matrix\n\nStatus: PARTIALLY VERIFIED. Generated before application changes. Source review is not workflow verification.\n\n27 top-level destinations; role-gated Dispatch returns makes 26 for other roles. Orders is labelled Warehouse dispatch. Nested warehouse tools are retained. No independent 28th destination was found in the portal dispatcher.\n\n'+records.map(r=>`## ${r.label}\n`+Object.entries(r).map(([k,v])=>`- **${k}:** ${v}`).join('\n')).join('\n\n'));
console.log(`Saved complete initial source inventory: ${records.length} destinations.`);
