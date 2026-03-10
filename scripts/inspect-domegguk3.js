const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: {
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
  });

  // navigator.webdriver 제거
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  // 메인 먼저 접근 (쿠키/세션 획득)
  console.log('1. 메인 페이지 접속...');
  await page.goto('https://domeggook.com', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  console.log('   메인 URL:', page.url());

  // 검색
  console.log('2. 검색 페이지 접속...');
  await page.goto('https://domeggook.com/main/list?q=USB+%EC%BC%80%EC%9D%B4%EB%B8%94', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log('   검색 URL:', page.url());

  if (page.url().includes('error')) {
    console.log('   → 에러 페이지. 카테고리 시도...');
    await page.goto('https://domeggook.com/main/m/list?ctgr=5609', { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    console.log('   카테고리 URL:', page.url());
  }

  if (page.url().includes('error')) {
    console.log('   → 여전히 에러. 다른 URL 시도...');
    // 도매꾹 신규 URL 패턴 탐색
    const urls = [
      'https://domeggook.com/main/goods/list?ctgr=5609',
      'https://domeggook.com/goods/list?ctgr=5609',
      'https://domeggook.com/main/search?keyword=케이블',
    ];
    for (const url of urls) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
      console.log(`   ${url} → ${page.url()}`);
      if (!page.url().includes('error')) break;
    }
  }

  // 현재 페이지 분석
  const html = await page.evaluate(() => document.body.innerHTML);
  console.log('\n=== 현재 페이지 분석 ===');
  console.log('URL:', page.url());
  console.log('HTML 길이:', html.length);

  // 상품 관련 요소 찾기
  const selectors = [
    'ol.lItemList > li', '.lItemList li', 'li[id^="li"]',
    'a.thumb', 'img.thumb', '.item_list li', '.prdList li',
    '[class*="product"]', '[class*="item_"]', '[class*="goods"]',
  ];
  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    if (count > 0) console.log('MATCH:', sel, '→', count);
  }

  // HTML 시작 부분
  console.log('\n=== HTML 앞 3000자 ===');
  console.log(html.substring(0, 3000));

  await browser.close();
})();
