"""Read-only inspection of actual browser-produced synthetic CSV/PDF artifacts."""
import csv,hashlib,json,os,subprocess
from pathlib import Path
from decimal import Decimal as D
root=Path(os.environ.get('STOCK_RELEASE_EVIDENCE_ROOT','generated-artifacts/final-operational-gate'))
meta=json.loads((root/'export-evidence/downloads.json').read_text())
report={'status':'RUNNING','csv':[],'pdf':[],'basis':{}}
def load(name):
    record=next(r for r in meta['downloads'] if r['name']==name)
    path=Path(record['file']);raw=path.read_bytes()
    assert record['filename'].endswith('.csv')
    assert record['blob']['type'].startswith('text/csv')
    assert hashlib.sha256(raw).hexdigest()==record['sha256']
    rows=list(csv.reader(raw.decode('utf-8-sig').splitlines()))
    assert rows and all(len(r)==len(rows[0]) for r in rows)
    assert b'NaN' not in raw and b'undefined' not in raw
    report['csv'].append({'name':name,'filename':record['filename'],'mime':record['blob']['type'],
       'bytes':len(raw),'sha256':record['sha256'],'rows':len(rows)-1,'columns':rows[0],
       'scope':'Synthetic company/all branches; day2026-10-15 for sales, current physical snapshot for stock',
       'status':'PASS','httpStatus':'N/A browser Blob; source API status evidence in downloads.json'})
    return list(csv.DictReader(raw.decode('utf-8-sig').splitlines())),raw
try:
    stock,_=load('stock')
    assert sum(D(r['qty']) for r in stock)==101
    assert sum(D(r['availableQty']) for r in stock)==101
    assert sum(D(r['reservedQty'])+D(r['quarantinedQty']) for r in stock)==0
    assert {(r['locationType'],r['productName'],D(r['qty'])) for r in stock}=={
        ('warehouse','QA-TRANSFER-ITEM',D(70)),('branch','QA-TRANSFER-ITEM',D(28)),('branch','TEST-ITEM',D(3))}
    cost,_=load('original-cost')
    assert sum(D(r['frozen_sale_layer_cost']) for r in cost)==165
    assert sum(D(r['actual_sale_revenue_first_layer']) for r in cost)==3129
    assert sum(r['missing_import_reference']=='true' for r in cost)==7
    assert all(not r['complete_audit_profit_first_layer'] for r in cost if r['missing_import_reference']=='true')
    financial,_=load('financial-original');f={r['Measure']:r['Value'] for r in financial}
    for key,value in {'netSoldQuantity':9,'netSalesRevenue':3129,'netCostOfGoodsSold':165,
      'netSalesDP':2411,'grossProfitAfterReturns':2964,'writeOffExpense':0}.items():assert D(f[key])==value,(key,f[key])
    products,_=load('mis-products')
    assert sum(D(r['Net Sold']) for r in products)==9
    assert sum(D(r['DP Value (N$)']) for r in products)==2411
    receipts,raw=load('mis-receipts')
    assert len(receipts)==8 and len({r['Receipt #'] for r in receipts})==8
    assert sum(D(r['Recorded Amount (N$)']) for r in receipts)==3129
    assert all(r['Business Date (Africa/Windhoek)']=='2026-10-15' and r['Branch']=='townshop'
               and r['Calculation Basis']=='Original customer charge' for r in receipts)
    assert b'"QA CSV, ""Quoted"""' in raw
    assert next(r for r in receipts if r['Receipt #']=='TW-2026-000001')['Customer']=='QA CSV, "Quoted"'
    assert next(r for r in receipts if r['Receipt #']=='OPERATIONAL-NEW-PRICE')['Recorded Amount (N$)']=='453.00'
    finance,_=load('finance-sales');head='Walk-in DP Revenue (not customer receipts)'
    assert D(next(r for r in finance if r['Branch']=='Windhoek CBD')[head])==2411
    report['basis']={'companyPhysical':101,'warehouse':70,'branchAvailable':31,'held':0,'inTransit':0,
       'netUnits':9,'stableReceipts':8,'originalChargedRevenue':3129,'frozenSaleDP':2411,
       'knownOriginalCIFCOGS':165,'matchedOriginalGrossProfit':2964,'separateWriteOffExpense':0,
       'fullImportAuditComplete':False,'missingImportSourceRows':7,
       'note':'Seeded TEST opening layer lacks full import/expense provenance. Known frozen CIF is not proof of complete import audit. Do not substitute catalogue DP/CP.'}
    for path in sorted(list((root/'documents').glob('*.pdf'))+list((root/'transfer-document-evidence').glob('*.pdf'))):
        raw=path.read_bytes();assert raw.startswith(b'%PDF-')
        text=subprocess.check_output(['pdftotext','-layout',str(path),'-'],text=True)
        assert 'NaN' not in text and 'undefined' not in text
        info=subprocess.check_output(['pdfinfo',str(path)],text=True)
        pages=int(next(l.split(':')[1] for l in info.splitlines() if l.startswith('Pages:')))
        if 'receipt' in path.name:assert 'TW-2026-000001' in text and '443' in text
        if 'dispatch-note' in path.name:assert 'QA-TRANSFER' in text and '2035' in text and ('Delivered' in text or 'Received' in text)
        report['pdf'].append({'file':str(path),'mime':subprocess.check_output(['file','--mime-type','-b',str(path)],text=True).strip(),
          'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'pages':pages,'status':'BYTE_TEXT_PASS; visual review recorded separately',
          'method':'Chromium PDF of actual staff print output; NOT an HTTP PDF download or native OS print dialog test'})
    report['status']='PASS'
except Exception as e:
    report['status']='FAIL';report['error']=str(e);raise
finally:
    (root/'artifact-review.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'status':report['status'],'csv':len(report['csv']),'pdf':len(report['pdf']),'pages':sum(p['pages'] for p in report['pdf'])}))
