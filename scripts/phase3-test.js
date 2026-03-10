// Phase 3 통합 테스트: 이미지 업로드 + 상품 등록 (SUSPENSION)
require('dotenv').config();

async function test() {
  const axios = require('axios');
  const FormData = require('form-data');
  const fs = require('fs');
  const bcrypt = require('bcrypt');

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const baseUrl = 'https://api.commerce.naver.com';

  // 1. 토큰 발급
  const timestamp = Date.now();
  const password = clientId + '_' + timestamp;
  const hashed = bcrypt.hashSync(password, clientSecret);
  const signature = Buffer.from(hashed, 'utf-8').toString('base64');

  const tokenResp = await axios.default.post(baseUrl + '/external/v1/oauth2/token', null, {
    params: { grant_type: 'client_credentials', client_id: clientId, timestamp, client_secret_sign: signature, type: 'SELF' },
    timeout: 10000,
  });
  const token = tokenResp.data.access_token;
  console.log('[OK] 토큰 발급 완료');

  // 2. 이미지 업로드
  const form = new FormData();
  form.append('imageFiles', fs.createReadStream('./data/test-image.jpg'), {
    filename: 'test-image.jpg',
    contentType: 'image/jpeg',
  });

  let imageUrl;
  try {
    const uploadResp = await axios.default.post(baseUrl + '/external/v1/product-images/upload', form, {
      headers: { ...form.getHeaders(), Authorization: 'Bearer ' + token },
      timeout: 30000,
    });
    imageUrl = uploadResp.data.images?.[0]?.url;
    console.log('[OK] 이미지 업로드 성공:', imageUrl);
  } catch (err) {
    console.log('[FAIL] 이미지 업로드:', JSON.stringify(err.response?.data || err.message));
    return;
  }

  if (!imageUrl) {
    console.log('[FAIL] 이미지 URL 없음');
    return;
  }

  // 3. 상품 등록 (SUSPENSION)
  const { NaverCommerceApiClient } = require('@smartstore/integrations');
  const client = new NaverCommerceApiClient();

  try {
    const result = await client.registerProduct({
      name: '[테스트-삭제예정] USB-C 충전 케이블 1m',
      statusType: 'SUSPENSION',
      saleType: 'NEW',
      leafCategoryId: '50000803',
      salePrice: 9900,
      stockQuantity: 1,
      images: {
        representativeImage: { url: imageUrl },
      },
      detailContent: '<p>[통합 테스트] 이 상품은 시스템 기능 테스트용이며 실제 판매되지 않습니다.</p>',
      deliveryInfo: {
        deliveryType: 'DELIVERY',
        deliveryAttributeType: 'NORMAL',
        deliveryCompany: 'CJGLS',
        deliveryFee: {
          deliveryFeeType: 'FREE',
          deliveryFeePayType: 'PREPAID',
        },
        claimDeliveryInfo: {
          returnDeliveryFee: 2500,
          exchangeDeliveryFee: 5000,
        },
      },
    });

    console.log('');
    console.log('[OK] === 상품 등록 성공 ===');
    console.log('  originProductNo:', result.originProductNo);
    console.log('  smartstoreChannelProductNo:', result.smartstoreChannelProductNo);
    console.log('  상태: SUSPENSION (판매 중지)');

    // 이중 안전
    try {
      await client.suspendProduct(result.originProductNo);
      console.log('[OK] 판매 중지 재확인');
    } catch (e) {
      console.log('[INFO] 이미 중지 상태');
    }
  } catch (err) {
    console.log('[FAIL] 상품 등록:', JSON.stringify(err.response?.data || err.message)?.substring(0, 300));
  }
}

test().catch(err => console.log('ERROR:', err.message));
