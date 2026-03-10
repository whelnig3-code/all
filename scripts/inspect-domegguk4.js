const { chromium } = require('playwright');
require('dotenv').config();

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1920, height: 1080 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  // 1. 로그인
  console.log('1. 도매꾹 로그인...');
  await page.goto('https://domeggook.com/main/member/login', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  console.log('   로그인 페이지:', page.url());

  // 로그인 폼 입력
  const username = process.env.DOMEGGOOK_USERNAME;
  const password = process.env.DOMEGGOOK_PASSWORD;
  console.log('   계정:', username ? username.slice(0, 3) + '***' : '없음');

  if (username && password) {
    try {
      await page.fill('input[name="txtID"], input#txtID, input[type="text"]', username);
      await page.fill('input[name="txtPW"], input#txtPW, input[type="password"]', password);
      await page.click('button[type="submit"], input[type="submit"], a.btnLogin, .btn_login, button.login');
      await new Promise(r => setTimeout(r, 3000));
      console.log('   로그인 후 URL:', page.url());
    } catch (e) {
      console.log('   로그인 폼 에러:', e.message);
      // 로그인 페이지 HTML 확인
      const loginHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 2000));
      console.log('   로그인 페이지 HTML:', loginHtml.substring(0, 1000));
    }
  }

  // 2. 검색 시도
  console.log('\n2. 검색 시도...');
  await page.goto('https://domeggook.com/main/list?q=USB', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log('   검색 URL:', page.url());

  if (!page.url().includes('error')) {
    console.log('   → 성공!');
    const selectors = ['ol.lItemList > li[id^="li"]', '.lItemList li', 'li[id^="li"]', 'a.thumb'];
    for (const sel of selectors) {
      const count = await page.locator(sel).count();
      if (count > 0) console.log('   MATCH:', sel, '→', count);
    }

    // 상품 데이터 추출
    const products = await page.evaluate(() => {
      const items = document.querySelectorAll('ol.lItemList > li[id^="li"]');
      return Array.from(items).slice(0, 3).map(el => {
        const titleEl = el.querySelector('a.title');
        const imgEl = el.querySelector('a.thumb img');
        const priceEl = el.querySelector('.amtqty .amt b');
        return {
          name: titleEl?.textContent?.trim() ?? '',
          image: imgEl?.getAttribute('src') ?? '',
          price: priceEl?.textContent?.trim() ?? '',
          href: titleEl?.getAttribute('href') ?? '',
        };
      });
    });
    console.log('   상품:', JSON.stringify(products, null, 2));
  } else {
    console.log('   → 여전히 차단됨');

    // 메인 페이지에서 상품 링크 찾기
    console.log('\n3. 메인에서 상품 링크 탐색...');
    await page.goto('https://domeggook.com/main/', { waitUntil: 'networkidle', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));

    const mainLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      return links
        .map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim()?.slice(0, 50) }))
        .filter(l => l.href && (l.href.includes('/main/') || l.href.includes('list') || l.href.includes('category') || l.href.match(/\/\d{5,}/)))
        .slice(0, 30);
    });
    console.log('   메인 링크:', JSON.stringify(mainLinks, null, 2));

    // 메인 페이지의 상품들
    const mainProducts = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs
        .filter(img => {
          const src = img.getAttribute('src') || '';
          return src.includes('thumbnail') || src.includes('product') || src.includes('goods');
        })
        .slice(0, 5)
        .map(img => ({
          src: img.getAttribute('src'),
          alt: img.getAttribute('alt'),
          parentHref: img.closest('a')?.getAttribute('href'),
        }));
    });
    console.log('   메인 상품 이미지:', JSON.stringify(mainProducts, null, 2));
  }

  await browser.close();
})();
