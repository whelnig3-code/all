const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 도매꾹 메인에서 카테고리 구조 파악
  await page.goto('https://domeggook.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log('메인 URL:', page.url());

  // 검색 기능 사용 — 더 안정적
  await page.goto('https://domeggook.com/main/list?q=USB+충전+케이블', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log('검색 URL:', page.url());

  // 셀렉터 탐색
  const selectors = [
    'ol.lItemList > li[id^="li"]',
    '.lItemList li',
    'li[id^="li"]',
    'li.item',
    'li[class*="item"]',
    'li[class*="product"]',
    'li[class*="prd"]',
    'div.list_wrap li',
    'a[class*="thumb"]',
    'img[class*="thumb"]',
    '.srchCont li',
    '.prdList li',
    'div[class*="list"] li',
  ];

  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    if (count > 0) console.log('MATCH:', sel, '→', count);
  }

  const liCount = await page.locator('li').count();
  console.log('전체 li:', liCount);

  // body 중 상품 영역 찾기
  const bodyHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 8000));
  console.log('\n=== BODY ===\n', bodyHtml.substring(0, 6000));

  await browser.close();
})();
