import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function signIn(page:Page, username='manager') {
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Staff sign-in'})).toBeVisible();
  await page.getByLabel('Username',{exact:true}).fill(username);
  await page.getByLabel('Password',{exact:true}).fill('browser-test-password');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Open counter'}).click();
  const token=(await (await response).json()).token as string;
  await expect(page.getByRole('button',{name:'Account and stand'})).toBeVisible();
  const tour=page.getByRole('dialog',{name:'Welcome to your counter'});
  await expect(tour).toBeVisible();
  await tour.getByRole('button',{name:'Skip tour'}).click();
  return token;
}
async function addVanilla(page:Page) {
  await page.getByRole('button',{name:'Customize Vanilla',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:/^Double/}).click();
  await dialog.getByRole('button',{name:/^Waffle cone/}).click();
  await dialog.getByRole('button',{name:/^Oreo crumble/}).click();
  await dialog.getByRole('button',{name:'Add to order'}).click();
}

test.beforeEach(async ({ request }) => {
  const response = await request.post('http://127.0.0.1:8001/__test/reset');
  expect(response.ok()).toBe(true);
});

test('login is accessible and reflows on phone and desktop',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Staff sign-in'})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toHaveCount(0);
  const password=page.getByLabel('Password',{exact:true});
  await password.fill('visible-password-check');
  await page.getByRole('button',{name:'Show password'}).click();
  await expect(password).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'Hide password'}).click();
  await expect(password).toHaveAttribute('type','password');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:'test-results/happy-cone-desktop.png',fullPage:true});
  await page.setViewportSize({width:375,height:812});
  await page.screenshot({path:'test-results/happy-cone-phone.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Open counter',exact:true})).toBeVisible();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
});

test('live cashier sale reaches preparation, stock, reporting and day close',async({page})=>{
  const token=await signIn(page); const headers={Authorization:`Bearer ${token}`};
  await page.getByRole('button',{name:'Open business day',exact:true}).click();
  await page.getByLabel('Opening cash float (K)').fill('500');
  await page.getByRole('dialog').getByRole('button',{name:'Open business day',exact:true}).click();
  await expect(page.getByText('Business day open',{exact:true})).toBeVisible();
  const before=await (await page.request.get('/api/inventory',{headers})).json();
  await addVanilla(page);
  await page.getByRole('button',{name:'Take payment',exact:true}).click();
  await page.getByLabel('Cash received (K)').fill('50');
  await expect(page.getByRole('dialog').getByText('K8.00',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Confirm payment',exact:true}).click();
  const receipt=page.getByRole('dialog',{name:'Receipt A001'});
  await expect(receipt.getByRole('heading',{name:'Customer Receipt'})).toHaveCount(0);
  await expect(receipt.getByText('CREAMY HEAVEN LIMITED',{exact:true})).toBeVisible();
  await expect(receipt.getByText('TPIN: 1002681530',{exact:true})).toBeVisible();
  await expect(receipt.getByText('Tel: 0771450074',{exact:true})).toBeVisible();
  await expect(receipt.getByText('Order A001',{exact:true})).toBeVisible();
  await expect(receipt.getByText('VANILLA-DOUBLE',{exact:true})).toBeVisible();
  await expect(receipt.getByText('Mwansa Banda',{exact:true})).toBeVisible();
  await expect(receipt.getByRole('heading',{name:'Tax details'})).toBeVisible();
  await expect(receipt.getByText('TURNOVER TAX (TOT)',{exact:true})).toBeVisible();
  await expect(receipt.getByText('5% of gross sale',{exact:true})).toBeVisible();
  await expect(receipt.getByText('K2.10',{exact:true})).toBeVisible();
  await expect(receipt.getByText(/Tax Invoice|Smart Invoice|SDC|MRC|QR/i)).toHaveCount(0);
  await page.evaluate(()=>{window.print=()=>{throw new Error('Printer unavailable');};});
  await page.getByRole('button',{name:'Print receipt',exact:true}).click();
  await expect(page.getByText('Printing was unavailable. Your sale is saved; reprint it from Sales.')).toBeVisible();
  for (const paper of [{name:'58mm',width:219},{name:'80mm',width:302}]) {
    await page.setViewportSize({width:paper.width,height:900});
    await page.emulateMedia({media:'print'});
    await expect(page.locator('.receipt-print .receipt')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator('.receipt-print .receipt').evaluate((node) => {
      const receipt=node.getBoundingClientRect();
      return [...node.querySelectorAll('.receipt-item-head strong:last-child,.receipt-item-price span:last-child,.receipt-value-row dd')]
        .every(cell=>cell.getBoundingClientRect().right <= receipt.right + 1);
    })).toBe(true);
    await page.screenshot({path:`test-results/happy-cone-receipt-${paper.name}.png`,fullPage:true});
  }
  await page.emulateMedia({media:'screen'});
  await page.setViewportSize({width:1280,height:720});
  const orders=await (await page.request.get('/api/orders',{headers})).json();
  expect(orders).toHaveLength(1);expect(orders[0].total_ngwee).toBe(4200);
  const movements=await (await page.request.get('/api/inventory/movements',{headers})).json();
  const consumed=movements.filter((m:{type:string})=>m.type==='SALE_CONSUMPTION');
  expect(consumed.length).toBeGreaterThanOrEqual(3);
  const after=await (await page.request.get('/api/inventory',{headers})).json();
  expect(after.some((item:{id:string,on_hand:string})=>Number(item.on_hand)<Number(before.find((x:{id:string})=>x.id===item.id).on_hand))).toBe(true);
  await page.getByRole('button',{name:'Done'}).click();
  await page.getByRole('button',{name:'Sales',exact:true}).click();
  const saleRow=page.getByRole('row',{name:/A001/});
  await saleRow.getByRole('button',{name:'Receipt',exact:true}).click();
  const historicReceipt=page.getByRole('dialog',{name:'Receipt A001'});
  await expect(historicReceipt.getByText('VANILLA-DOUBLE',{exact:true})).toBeVisible();
  await expect(historicReceipt.getByText('Mwansa Banda',{exact:true})).toBeVisible();
  await expect(historicReceipt.locator('.receipt-totals').getByText('K42.00',{exact:true})).toBeVisible();
  await historicReceipt.getByRole('button',{name:'Done'}).click();
  await page.getByRole('button',{name:'Prepare',exact:true}).click();
  await page.getByRole('button',{name:'Start preparing'}).click();
  await page.getByRole('button',{name:'Mark ready'}).click();
  await page.getByRole('button',{name:'Mark served'}).click();
  await expect(page.getByText('No ready orders',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reports',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Daily report'})).toBeVisible();
  const summary=await (await page.request.get('/api/reports/daily',{headers})).json();
  expect(summary.net_sales_ngwee).toBe(4200);expect(summary.expected_cash_ngwee).toBe(54200);
  await page.getByRole('button',{name:'Cash day',exact:true}).click();
  await page.getByRole('button',{name:'Close day',exact:true}).click();
  await page.getByRole('dialog').getByLabel(/Actual cash/).fill('542');
  await page.getByRole('dialog').getByRole('button',{name:'Confirm close',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const closed=await (await page.request.get('/api/reports/daily',{headers})).json();expect(closed.variance_ngwee).toBe(0);
  const audit=await (await page.request.get('/api/audit',{headers})).json();
  expect(audit.map((event:{action:string})=>event.action)).toEqual(expect.arrayContaining(['DAY_OPENED','ORDER_CREATED','DAY_CLOSED']));
});

test('a live offline cash order survives reload then syncs once',async({page,context})=>{
  const token=await signIn(page); const headers={Authorization:`Bearer ${token}`};
  await page.getByRole('button',{name:'Open business day',exact:true}).click();
  await page.getByLabel('Opening cash float (K)').fill('500');
  await page.getByRole('dialog').getByRole('button',{name:'Open business day',exact:true}).click();
  await expect(page.getByText('Business day open',{exact:true})).toBeVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();await expect(page.getByRole('button',{name:'Customize Vanilla',exact:true})).toBeVisible();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cachedShell = await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = (await Promise.all(names.map(async name => {
      const cache = await caches.open(name);
      return Promise.all((await cache.keys()).map(async request => ({
        path: new URL(request.url).pathname,
        bytes: (await (await cache.match(request))!.arrayBuffer()).byteLength,
      })));
    }))).flat();
    return entries;
  });
  expect(cachedShell).toEqual(expect.arrayContaining([
    expect.objectContaining({path:'/index.html', bytes:expect.any(Number)}),
    expect.objectContaining({path:expect.stringMatching(/^\/assets\/.*\.js$/), bytes:expect.any(Number)}),
  ]));
  expect(cachedShell.every(entry => entry.bytes > 0)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/You’re offline/)).toBeVisible();
  await addVanilla(page);
  await page.getByRole('button',{name:'Take payment',exact:true}).click();
  await expect(page.getByRole('button',{name:'Mobile money',exact:true})).toBeDisabled();
  await page.getByLabel('Cash received (K)').fill('50');
  await page.getByRole('button',{name:'Save cash order on device'}).click();
  await expect(page.getByRole('dialog').getByText('Pending server acceptance',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'1 to sync'})).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('button',{name:'1 to sync'})).toHaveCount(0);
  const orders=await (await page.request.get('/api/orders',{headers})).json();
  expect(orders.filter((o:{offline:boolean})=>o.offline)).toHaveLength(1);
  await page.reload();
  const again=await (await page.request.get('/api/orders',{headers})).json();
  expect(again.filter((o:{offline:boolean})=>o.offline)).toHaveLength(1);
});

test('server role exposes preparation and rejects financial actions',async({page})=>{
  const token=await signIn(page,'server');
  await expect(page.getByRole('heading',{name:'Preparation queue'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Counter',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Reports',exact:true})).toHaveCount(0);
  const response=await page.request.post('/api/business-day/open',{headers:{Authorization:`Bearer ${token}`},data:{opening_float_ngwee:50000}});
  expect(response.status()).toBe(403);
});

test('owner manages staff access and changes their own password',async({page})=>{
  await signIn(page,'owner');
  await page.getByRole('button',{name:'Settings and information'}).click();
  await expect(page.getByRole('heading',{name:'Staff accounts'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Menu and stock recipes'})).toHaveCount(0);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:'test-results/happy-cone-owner-settings.png',fullPage:true});

  await page.getByRole('button',{name:'Edit details'}).click();
  let settingsDialog=page.getByRole('dialog',{name:'Edit stand details'});
  await settingsDialog.getByLabel('Stand name').fill('Arcades stand');
  await settingsDialog.getByLabel('Location').fill('Great East Road, Lusaka');
  await settingsDialog.getByRole('button',{name:'Save changes'}).click();
  await expect(page.locator('.location').getByText('Arcades stand',{exact:true})).toBeVisible();
  await expect(page.getByText('Great East Road, Lusaka',{exact:true})).toBeVisible();

  await page.getByRole('button',{name:'Edit receipt details'}).click();
  settingsDialog=page.getByRole('dialog',{name:'Edit receipt details'});
  await settingsDialog.getByLabel('Legal business name').fill('CREAMY HEAVEN LIMITED');
  await settingsDialog.getByLabel('TPIN').fill('1002681530');
  await settingsDialog.getByLabel('Contact number').fill('0771450074');
  await settingsDialog.getByLabel('Tax category').fill('TURNOVER TAX (TOT)');
  await settingsDialog.getByLabel('Tax rate (%)').fill('5');
  await settingsDialog.getByLabel('Receipt footer').fill('Thank you. We hope to scoop for you again.');
  expect((await new AxeBuilder({page}).include('dialog').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await settingsDialog.getByRole('button',{name:'Save changes'}).click();
  await expect(page.getByText('1002681530',{exact:true})).toBeVisible();
  await expect(page.getByText('TURNOVER TAX (TOT) · 5%',{exact:true})).toBeVisible();

  await page.getByRole('button',{name:'Edit payment wording'}).click();
  settingsDialog=page.getByRole('dialog',{name:'Edit payment and ticket wording'});
  await settingsDialog.getByLabel('Payment instructions').fill('Confirm every external payment before the sale is completed.');
  await settingsDialog.getByRole('button',{name:'Save changes'}).click();
  await expect(page.getByText('Confirm every external payment before the sale is completed.')).toBeVisible();

  await page.getByRole('button',{name:'Edit activity wording'}).click();
  settingsDialog=page.getByRole('dialog',{name:'Edit activity wording'});
  await settingsDialog.getByLabel('Activity record introduction').fill('Review signed actions for sales, stock, staff and cash.');
  await settingsDialog.getByRole('button',{name:'Save changes'}).click();
  await expect(page.getByText('Review signed actions for sales, stock, staff and cash.')).toBeVisible();

  await page.getByRole('button',{name:'Edit guide'}).click();
  settingsDialog=page.getByRole('dialog',{name:'Edit counter guide'});
  await settingsDialog.getByLabel('From order to served').fill('Take the order, confirm payment, prepare it and call the ticket number.');
  expect((await new AxeBuilder({page}).include('dialog').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await settingsDialog.getByRole('button',{name:'Save changes'}).click();
  await page.getByRole('button',{name:'Open counter guide'}).click();
  await expect(page.getByRole('dialog',{name:'Counter guide'}).getByText('Take the order, confirm payment, prepare it and call the ticket number.')).toBeVisible();
  await page.getByRole('dialog',{name:'Counter guide'}).getByRole('button',{name:'Close dialog'}).click();

  await page.getByRole('button',{name:'Stock',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Stock',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Menu and stock recipes'})).toBeVisible();
  await page.screenshot({path:'test-results/happy-cone-owner-stock.png',fullPage:true});

  await page.getByRole('button',{name:'Add category'}).click();
  let catalogDialog=page.getByRole('dialog',{name:'Add category'});
  await catalogDialog.getByLabel('Category name').fill('Frozen treats');
  await catalogDialog.getByRole('button',{name:'Create category'}).click();
  await expect(page.getByRole('button',{name:/Frozen treats/})).toBeVisible();

  await page.getByRole('button',{name:'Add product'}).click();
  catalogDialog=page.getByRole('dialog',{name:'Add product'});
  await catalogDialog.getByLabel('Product name').fill('Mango sunshine');
  await catalogDialog.getByLabel('Category').selectOption('frozen-treats');
  await catalogDialog.getByText('Optional menu details',{exact:true}).click();
  await catalogDialog.getByLabel('Short description').fill('Bright mango ice cream made for hot afternoons.');
  await catalogDialog.getByRole('button',{name:'Create product'}).click();
  await expect(page.getByText('Bright mango ice cream made for hot afternoons.',{exact:true})).toBeVisible();

  await page.getByRole('button',{name:'Show Mango sunshine details'}).click();
  await page.getByRole('button',{name:'Add variation'}).click();
  catalogDialog=page.getByRole('dialog',{name:'Add variation'});
  await catalogDialog.getByLabel('Name').fill('Single scoop');
  await catalogDialog.getByLabel('Selling price (K)').fill('28.00');
  await catalogDialog.getByLabel('Ingredient 1',{exact:true}).selectOption('vanilla-stock');
  await catalogDialog.getByLabel('Quantity 1',{exact:true}).fill('90');
  expect((await new AxeBuilder({page}).include('dialog').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await catalogDialog.getByRole('button',{name:'Create variation'}).click();
  await expect(page.getByText('K28.00',{exact:true})).toBeVisible();

  await page.getByRole('button',{name:'Show Vanilla details'}).click();
  const vanillaProduct=page.getByRole('article').filter({has:page.getByRole('button',{name:'Hide Vanilla details'})});
  await vanillaProduct.getByRole('button',{name:'Edit Single scoop'}).click();
  catalogDialog=page.getByRole('dialog',{name:'Edit variation'});
  await catalogDialog.getByLabel('Selling price (K)').fill('35.00');
  await catalogDialog.getByLabel('Quantity 1',{exact:true}).fill('120');
  await catalogDialog.getByRole('button',{name:'Save variation'}).click();
  await expect(page.getByText('K35.00',{exact:true})).toBeVisible();

  await page.getByRole('button',{name:'Settings and information'}).click();
  await expect(page.getByRole('heading',{name:'Staff accounts'})).toBeVisible();
  await page.getByRole('button',{name:'Add staff account'}).click();
  const create=page.getByRole('dialog');
  await create.getByLabel('Full name').fill('Evening Server');
  await create.getByLabel('Username').fill('evening-server');
  await create.getByLabel('Role').selectOption('SERVER');
  await create.getByLabel('Temporary password').fill('temporary-password-2026');
  await create.getByRole('button',{name:'Create account'}).click();
  await expect(page.getByText('Evening Server',{exact:true})).toBeVisible();

  await page.getByRole('button',{name:'Edit Evening Server'}).click();
  const edit=page.getByRole('dialog');
  await edit.getByLabel('Account active').uncheck();
  await edit.getByRole('button',{name:'Save account changes'}).click();
  await expect(page.getByRole('row',{name:/Evening Server/}).getByText('Inactive',{exact:true})).toBeVisible();

  await page.getByRole('button',{name:'Account and stand'}).click();
  await page.getByRole('button',{name:'Change password'}).click();
  const password=page.getByRole('dialog');
  await password.getByLabel('Current password').fill('browser-test-password');
  await password.getByLabel('New password',{exact:true}).fill('updated-owner-password');
  await password.getByLabel('Confirm new password').fill('updated-owner-password');
  await password.getByRole('button',{name:'Update password'}).click();
  await expect(page.getByText('Password updated.')).toBeVisible();
});
