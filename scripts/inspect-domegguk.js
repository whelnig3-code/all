const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://domeggook.com/main/category/1702', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));

  console.log('URL:', page.url());

  const selectors = [
    'ol.lItemList > li[id^="li"]',
    '.lItemList li',
    '.item_list li',
    '.product_list li',
    '.goods_list li',
    'ul.item_list > li',
    'div.item_list li',
    'li.item',
    'div.prd_list li',
    'div.list_wrap li',
    '.cate_prd_list li',
    'li[class*="item"]',
    'li[class*="product"]',
    'li[class*="prd"]',
    'div[class*="product"] li',
    'div[class*="item"] li',
    'a[class*="thumb"]',
  ];

  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    if (count > 0) console.log('MATCH:', sel, '→', count, '건');
  }

  // 전체 li 수 확인
  const liCount = await page.locator('li').count();
  console.log('전체 li 수:', liCount);

  // 상품 이미지 찾기
  const imgCount = await page.locator('img[src*="thumbnail"], img[src*="product"], img[src*="prd"], img[src*="goods"]').count();
  console.log('상품 이미지 수:', imgCount);

  // 페이지 HTML 일부 출력
  const bodyHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 5000));
  console.log('\n=== BODY HTML (첫 5000자) ===');
  console.log(bodyHtml);

  await browser.close();
})();
