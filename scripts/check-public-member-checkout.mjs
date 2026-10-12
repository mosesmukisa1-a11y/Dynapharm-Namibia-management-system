import {dir,manifest,db,b,report,save} from './check-stock-lifecycle-stage1.mjs';
let page,originalRole;
report.method='Actual public member selection, inline staff/session authentication, cart, checkout form and order submission in the browser';
try{
 originalRole=(await db.query("SELECT role FROM users WHERE username='ui_gm'")).rows[0].role;
 await db.query("UPDATE users SET role='distributor' WHERE username='ui_gm'");
 page=await b.newPage({viewport:{width:1440,height:1000}});
 await page.goto(manifest.frontend+'/shop',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Registered Member/}).click();
 await page.getByText('Sign in for member pricing',{exact:true}).waitFor();
 await page.screenshot({path:`${dir}/member-sign-in.jpg`});
 await page.getByLabel('Member username').fill('ui_gm');
 await page.getByLabel('Member password',{exact:true}).fill('DisposableStockUi-2026!');
 await page.getByRole('button',{name:'Sign in and continue shopping',exact:true}).click();
 await page.getByText('Sign in with another membership',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Add',exact:true}).first().click();
 await page.getByRole('button',{name:/Cart.*1/}).click();
 await page.getByRole('button',{name:/Proceed to Checkout/}).click();
 await page.getByPlaceholder('Enter your full name').fill('Synthetic public member');
 await page.getByPlaceholder('+264 81 123 4567').fill('000000000');
 const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/orders') && r.request().method()==='POST'),page.getByRole('button',{name:/Place Order/}).click()]);
 report.order={status:response.status(),response:await response.json()};await save();
 if(response.status()!==201)throw Error('Public member checkout failed');
 await page.getByText(/Order placed successfully/).waitFor();
 await page.screenshot({path:`${dir}/member-public-order.jpg`});
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;await page?.screenshot({path:`${dir}/member-checkout-failure.jpg`}).catch(()=>{});}
finally{if(originalRole)await db.query("UPDATE users SET role=$1 WHERE username='ui_gm'",[originalRole]);await save();await b.close();await db.end();}
console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
