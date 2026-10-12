// Read-only public navigation checks. No authentication, purchases or stock writes.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = 'generated-artifacts/public-landing';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  baseURL: `https://${process.env.REPLIT_DEV_DOMAIN}`,
  viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce',
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const result = { scope: 'Public read-only UI; no checkout or authenticated staff workflow', errors: [], checks: [] };
if (process.env.PUBLIC_CHECK_RESUME === '1') {
  const previous = JSON.parse(await readFile(`${output}/checks.json`, 'utf8'));
  result.checks = previous.checks.filter(check => check.passed);
  result.previousFailures = [...(previous.previousFailures || []), ...(previous.failure ? [previous.failure] : [])];
}
page.on('pageerror', error => result.errors.push(error.message));
await context.route('**/api/**', route => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
    result.errors.push(`Unexpected write: ${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  }
  return route.continue();
});
const save = () => writeFile(`${output}/checks.json`, JSON.stringify(result, null, 2));
const check = async (name, run) => {
  if (result.checks.some(check => check.name === name && check.passed)) return;
  await run(); result.checks.push({ name, passed: true }); await save();
};
try {
  await page.goto('/');
  await page.locator('.pub-product').first().waitFor();
  const catalogueText = await page.locator('#products .pub-section-heading p').textContent();
  const total = Number(catalogueText.match(/\d+/)[0]);
  const categories = await page.locator('.pub-category').evaluateAll(nodes => nodes.map(n => ({ href: n.getAttribute('href'), name: n.querySelector('h3').textContent })));
  const productLink = await page.locator('.pub-product .pub-text-link').first().getAttribute('href');
  await check('homepage: four featured products, no placeholder links, usable keyboard focus', async () => {
    assert.equal(await page.locator('.pub-product').count(), 4);
    assert.equal(await page.locator('a[href="#"]').count(), 0);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Skip to content');
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none');
  });
  await page.screenshot({ path: `${output}/desktop.jpg`, type: 'jpeg', quality: 85 });
  await page.screenshot({ path: `${output}/desktop-full.jpg`, type: 'jpeg', quality: 75, fullPage: true });
  await check('staff and distributor entry points open their existing dialogs', async () => {
    for (const [button, heading] of [['Staff Login', 'Staff Access'], ['Distributor Login', 'Distributor Access']]) {
      await page.getByRole('button', { name: button, exact: true }).first().click();
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      await page.keyboard.press('Escape');
    }
  });
  await check('town search includes all three Windhoek outlets; contact links use saved addresses', async () => {
    await page.getByRole('searchbox', { name: 'Search outlets by town or outlet name' }).fill('Windhoek');
    await page.getByText('3 matching outlets.', { exact: false }).waitFor();
    assert.equal(await page.locator('.pub-outlet').count(), 3);
    const links = await page.locator('.pub-outlet a').evaluateAll(nodes => nodes.map(n => n.href));
    assert.equal(links.filter(h => /^tel:\+264\d+$/.test(h)).length, 3);
    for (const href of links.filter(h => h.includes('google.com'))) {
      const destination = new URL(href).searchParams.get('destination');
      assert.match(destination, /Windhoek/);
      assert.match(destination, /Namibia/);
    }
  });
  await check('all category links apply the correct shop filter with a consistent catalogue total', async () => {
    for (const category of categories) {
      await page.goto(category.href);
      await page.getByText(`${total} products available`, { exact: true }).waitFor();
      const button = page.getByRole('button', { name: category.name, exact: true });
      assert.match(await button.getAttribute('class'), /bg-primary/);
      assert.equal(await page.getByText('No products found', { exact: true }).count(), 0);
    }
    result.catalogueTotal = total;
    result.categoryCount = categories.length;
  });
  await check('View product opens the matching product details', async () => {
    await page.goto(productLink);
    await page.getByText('Pack size:', { exact: false }).first().waitFor();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    assert.equal(new URL(page.url()).searchParams.has('product'), false);
  });
  await check('full outlet directory retains 15 listed plus two separately unconfirmed contacts', async () => {
    await page.goto('/outlets');
    await page.getByRole('heading', { name: 'Additional entries awaiting confirmation' }).waitFor();
    assert.equal(await page.locator('.pub-outlet').count(), 17);
    await page.getByRole('searchbox').fill('Nkurenkuru');
    assert.equal(await page.locator('.pub-outlet').count(), 1);
  });
  await check('About and health questionnaire destinations load', async () => {
    for (const path of ['/about', '/checkup']) {
      await page.goto(path);
      await page.locator('h1').waitFor();
      assert.ok((await page.locator('h1').innerText()).length > 0);
    }
  });
  await check('mobile navigation, images and layout at 390px and 320px', async () => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.locator('.pub-product').first().waitFor();
      await page.evaluate(async () => {
        for (const img of document.images) { img.loading = 'eager'; }
        await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
      });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(await page.locator('img').evaluateAll(images => images.filter(i => !i.naturalWidth).map(i => i.src)), []);
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Our Outlets', exact: true }).click();
      assert.equal(new URL(page.url()).pathname, '/outlets');
      await page.goto('/');
      await page.locator('.pub-product').first().waitFor();
      await page.screenshot({ path: `${output}/mobile-${width}.jpg`, type: 'jpeg', quality: 85 });
    }
  });
  assert.deepEqual(result.errors, []);
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.failure = { message: error.message, stack: error.stack, url: page.url() };
  await page.screenshot({ path: `${output}/failure.jpg`, type: 'jpeg', quality: 80 }).catch(() => {});
  process.exitCode = 1;
} finally {
  await save();
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
