const axios = require('axios');
require('dotenv').config();
const API_KEY = process.env.DOMEGGOOK_API_KEY;
const API_URL = 'https://domeggook.com/ssl/api/';

(async () => {
  // 상품 목록 조회
  const params = new URLSearchParams({
    ver: '4.1', mode: 'getItemList', aid: API_KEY,
    market: 'dome', om: 'json', kw: '충전기', sz: '3',
  });
  const listRes = await axios.get(`${API_URL}?${params}`, { timeout: 10000 });
  const items = listRes.data?.domeggook?.list?.item || [];

  if (items.length === 0) {
    console.log('No items found. Response:', JSON.stringify(listRes.data).substring(0, 300));
    return;
  }

  const item = items[0];
  console.log('=== Item:', item.no, item.title, '  price:', item.price);

  // 상세 조회
  const viewParams = new URLSearchParams({
    ver: '4.5', mode: 'getItemView', aid: API_KEY,
    no: item.no, om: 'json',
  });
  const viewRes = await axios.get(`${API_URL}?${viewParams}`, { timeout: 10000 });
  const d = viewRes.data?.domeggook;

  // 전체 키 목록
  console.log('\n=== top-level keys ===');
  console.log(Object.keys(d || {}));

  // detail (제조사, 모델, 원산지, 안전인증)
  console.log('\n=== detail ===');
  console.log(JSON.stringify(d?.detail, null, 2));

  // basis (기본정보, 키워드 등)
  console.log('\n=== basis ===');
  console.log(JSON.stringify(d?.basis, null, 2));

  // option (옵션/사이즈/색상)
  console.log('\n=== option (first 800 chars) ===');
  const optStr = JSON.stringify(d?.option, null, 2);
  console.log(optStr ? optStr.substring(0, 800) : 'null');

  // attr (상품속성 - 재질, 사이즈 등?)
  console.log('\n=== attr ===');
  console.log(JSON.stringify(d?.attr, null, 2)?.substring(0, 1000) || 'null');

  // desc HTML 미리보기
  const html = d?.desc?.contents?.item || '';
  console.log('\n=== desc HTML length:', html.length);
  console.log('desc HTML preview:', html.substring(0, 500));

  // 추가 속성들
  for (const key of Object.keys(d || {})) {
    if (!['detail', 'basis', 'option', 'attr', 'desc', 'deli', 'return', 'img'].includes(key)) {
      const val = JSON.stringify(d[key]);
      if (val && val.length > 2 && val.length < 2000) {
        console.log(`\n=== ${key} ===`);
        console.log(val.substring(0, 500));
      }
    }
  }
})();
