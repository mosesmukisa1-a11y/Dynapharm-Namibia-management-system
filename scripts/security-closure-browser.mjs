// Invoked only by the owned fixture through IPC. Never prints private material.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
process.once('message',async({baseUrl,material,out,markers,adminOnly=false})=>{
  const rows=[];let browser,page,checkpoint='initialize';
  try{await fs.copyFile(out+'/browser-results.json',out+'/browser-results-prior-'+Date.now()+'.json');}catch{}
  async function record(name,status,expected,extra={}){
    rows.push({name,status,expected,result:status===expected?'PASS':'FAIL',...extra});
    await fs.writeFile(out+'/browser-results.json',JSON.stringify({isolated:true,
      credentialsPersisted:false,results:rows},null,2));
    if(status!==expected)throw Error('Assertion failed');
  }
  async function test(name,run){
    if(adminOnly&&!['unrelated session preparation','Admin reset rendered workflow'].includes(name))return;
    checkpoint=name;await run();
  }
  try{
    if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl))throw Error('Non-loopback refused');
    browser=await chromium.launch({executablePath:'/repl/tools/bin/chromium',
      headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({serviceWorkers:'block'});page=await context.newPage();
    const login=async(c,id,password)=>c.request.post(baseUrl+'/api/auth/login',
      {data:{username:id.toLowerCase(),password}});
    if(adminOnly)await record('affected temporary session preparation',
      (await login(context,'CLOSURE-USER',material.password)).status(),200);
    await test('temporary-password login',async()=>{
      checkpoint='open consultant route';
      const nav=await page.goto(baseUrl+'/');
      await record('public login page response',nav.status(),200);
      checkpoint='open Staff Login modal';
      await page.getByRole('button',{name:'Staff Login',exact:true}).first().click();
      checkpoint='fill staff login username';
      await page.getByPlaceholder('Enter your username').fill('closure-user');
      checkpoint='fill masked temporary password';
      await page.getByPlaceholder('Enter your password').fill(material.password);
      checkpoint='submit staff login';
      const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
      await page.getByRole('button',{name:'Sign In',exact:true}).click();
      await record('temporary-password login',(await response).status(),200);
      await page.getByRole('heading',{name:'Replace your temporary password'}).waitFor();
    });
    await test('restricted-session denial',async()=>{
      await record(checkpoint,(await context.request.get(baseUrl+'/api/prices')).status(),403);
    });
    await test('password-change explicit POST',async()=>{
      await page.getByLabel('Current temporary password').fill(material.password);
      await page.getByLabel('New password (at least 12 characters)').fill(material.permanent);
      await page.getByLabel('Confirm new password').fill(material.permanent);
      const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/credential-security')&&r.request().method()==='POST');
      await page.getByRole('button',{name:'Change password and sign out'}).click();
      const r=await response;
      await record(checkpoint,r.status(),200,{endpoint:'/api/auth/credential-security',
        cacheControl:r.headers()['cache-control']});
    });
    await test('automatic sign-out',async()=>{
      await page.waitForTimeout(400);
      await record(checkpoint,(await context.request.get(baseUrl+'/api/auth/me')).status(),401);
    });
    await test('old temporary rejection',async()=>{
      await record(checkpoint,(await login(context,'CLOSURE-USER',material.password)).status(),401);
    });
    await test('permanent login and reload',async()=>{
      await record(checkpoint,(await login(context,'CLOSURE-USER',material.permanent)).status(),200);
      await page.goto(baseUrl+'/consultant');await page.reload();
      const r=await context.request.get(baseUrl+'/api/auth/me'),body=await r.json();
      const u=body.user||body;
      await record('auth/me after reload',r.status(),200,
        {role:u.role,branch:u.branch,mustChangePassword:u.mustChangePassword});
      if(u.role!=='consultant'||u.branch!=='townshop'||u.mustChangePassword)throw Error('Scope mismatch');
      await page.screenshot({path:out+'/consultant-reloaded.png'});
    });
    const anon=await browser.newContext(),admin=await browser.newContext(),other=await browser.newContext();
    await test('anonymous exact-ID reset denial',async()=>{
      await record(checkpoint,(await anon.request.post(baseUrl+'/api/auth/credential-security',
        {data:{action:'issue-reset',accountId:'CLOSURE-USER'}})).status(),401);
    });
    await test('server branch enforcement',async()=>{
      await record('assigned client history',(await context.request.get(baseUrl+
        '/api/client-history?clientId=CLOSURE-OWN-CLIENT')).status(),200);
      await record('cross-branch client history denied',(await context.request.get(baseUrl+
        '/api/client-history?clientId=CLOSURE-OTHER-CLIENT')).status(),403);
    });
    await test('consultant exact-ID reset denial',async()=>{
      await record(checkpoint,(await context.request.post(baseUrl+'/api/auth/credential-security',
        {data:{action:'issue-reset',accountId:'CLOSURE-ADMIN'}})).status(),403);
    });
    await test('repository and source-map download denial',async()=>{
      for(const p of ['/server.js','/scripts/seed-users.js','/generated-artifacts/security-remediation/report.md',
        '/.git/config','/.env','/assets/test.js.map','/node_modules/pg/package.json'])
        await record('public denial '+p,(await anon.request.get(baseUrl+p)).status(),404,{endpoint:p});
    });
    await test('unrelated session preparation',async()=>{
      await record(checkpoint,(await login(other,'CLOSURE-OTHER',material.password)).status(),200);
    });
    await test('Admin reset rendered workflow',async()=>{
      await record('admin login',(await login(admin,'CLOSURE-ADMIN',material.password)).status(),200);
      const ap=await admin.newPage();page=ap;await ap.goto(baseUrl+'/admin');
      checkpoint='wait for authenticated Admin Portal heading';
      await ap.getByRole('heading',{name:'Admin Portal',exact:true}).waitFor();
      // The user-management screen is a real rendered tab, not a direct API substitute.
      checkpoint='open User Management tab';
      await ap.getByRole('button',{name:/User Management/}).click();
      checkpoint='open exact synthetic account reset';
      const row=ap.locator('tr').filter({hasText:'closure-user'});
      await row.getByTitle('Reset Password').click();
      checkpoint='generate masked private synthetic credential';
      await ap.getByRole('button',{name:'Generate unique temporary password',exact:true}).click();
      const modal=ap.locator('div').filter({has:ap.getByRole('button',{name:'Copy for private delivery',exact:true})})
        .filter({has:ap.getByRole('button',{name:'Generate unique temporary password',exact:true})}).last();
      // Retained in memory only for this synthetic account; never included in screenshots.
      const generated=await ap.locator('input[type="password"][readonly]').inputValue();
      if(generated.length<24)throw Error('Missing private generated credential');
      const seen=[];
      ap.on('response',r=>{if(r.url().endsWith('/api/auth/credential-security')&&r.request().method()==='POST'){
        seen.push(r.status());rows.push({name:'rendered admin reset POST '+seen.length,
          endpoint:'/api/auth/credential-security',status:r.status(),expected:200,
          result:r.status()===200?'PASS':'FAIL'});}});
      checkpoint='submit rendered exact-ID admin reset';
      // Directory icon buttons have the same accessible title. Match the modal's
      // visible text too, rather than producing a strict-locator ambiguity.
      await ap.getByRole('button',{name:'Reset Password',exact:true})
        .filter({hasText:'Reset Password'}).click();
      await ap.getByText(/Temporary password set for closure-user/).first().waitFor({timeout:12000});
      await record('Admin reset rendered workflow',seen.length===2&&seen.every(s=>s===200)?200:0,200,
        {endpoint:'/api/auth/credential-security',responseStatuses:seen,accountId:'CLOSURE-USER',
          maskedInput:true,credentialsInArtifact:false});
      await record('affected session invalidated',(await context.request.get(baseUrl+'/api/auth/me')).status(),401);
      await record('unrelated session continuity',(await other.request.get(baseUrl+'/api/auth/me')).status(),200);
      await record('admin session continuity',(await admin.request.get(baseUrl+'/api/auth/me')).status(),200);
      await record('reset credential restricted login',(await login(context,'CLOSURE-USER',generated)).status(),200);
      await record('reset credential one-use replay',(await login(anon,'CLOSURE-USER',generated)).status(),401);
      await ap.screenshot({path:out+'/admin-reset-complete.png'});
    });
    const responses=[];
    for(const p of ['/api/auth/me','/api/prices','/api/not-a-route']){
      const r=await anon.request.get(baseUrl+p);responses.push(await r.text());
    }
    const files=[];
    async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){
      if(e.isDirectory())await walk(dir+'/'+e.name);else files.push(dir+'/'+e.name);}}
    await walk('dist');
    let markerFound=false;for(const f of files){
      const text=await fs.readFile(f,'utf8');if(markers.some(m=>text.includes(m)))markerFound=true;
    }
    await fs.writeFile(out+'/secret-output-verification.json',JSON.stringify({
      syntheticMarkersOnly:true,configuredSecretsRetrieved:false,
      browserResponses:responses.some(t=>markers.some(m=>t.includes(m)))?'FAIL':'PASS',
      generatedBundles:markerFound?'FAIL':'PASS',bundleFiles:files.length,
      sourceMapsPresent:files.filter(f=>f.endsWith('.map')).length,
      sourceDownloadDenials:rows.filter(r=>r.name.startsWith('public denial')),
      limitations:['Finite tested routes only; not a proof covering every application error path.',
        'No production deployment artifact inspected.'],status:'PARTIAL'},null,2));
    await browser.close();process.exit(0);
  }catch{
    try{await page?.screenshot({path:out+'/browser-failed-checkpoint.png'});}catch{}
    await fs.writeFile(out+'/browser-results.json',JSON.stringify({isolated:true,
      credentialsPersisted:false,results:rows,stoppedAt:checkpoint,status:'FAIL',
      error:'Browser action/assertion failed; private framework error details withheld'},null,2));
    await browser?.close();process.exit(1);
  }
});
