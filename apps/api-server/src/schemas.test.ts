// =============================================
// Zod 스키마 검증 테스트
// =============================================

import {
  createProductSchema,
  shipOrderSchema,
  controlSchema,
  saveCredentialsSchema,
  naverWebhookSchema,
  talkTalkWebhookSchema,
} from './schemas'

describe('createProductSchema', () => {
  const validProduct = {
    source: 'domaegguk',
    sourceProductId: '12345',
    name: '테스트 상품',
    wholesalePrice: 10000,
    shippingFee: 2500,
    naverFeeRate: 0.05,
    targetMarginRate: 0.3,
    images: ['https://example.com/img.jpg'],
  }

  it('유효한 입력 → 성공', () => {
    expect(() => createProductSchema.parse(validProduct)).not.toThrow()
  })

  it('상품명 누락 → 에러', () => {
    const { name: _, ...noName } = validProduct
    expect(() => createProductSchema.parse(noName)).toThrow()
  })

  it('마진율 15% 미만 → 에러 (안전장치)', () => {
    expect(() =>
      createProductSchema.parse({ ...validProduct, targetMarginRate: 0.1 }),
    ).toThrow('마진율 15% 이상')
  })

  it('도매가 0 이하 → 에러', () => {
    expect(() =>
      createProductSchema.parse({ ...validProduct, wholesalePrice: 0 }),
    ).toThrow()
  })

  it('이미지 빈 배열 → 에러', () => {
    expect(() =>
      createProductSchema.parse({ ...validProduct, images: [] }),
    ).toThrow('이미지 1개 이상')
  })

  it('이미지 URL이 아닌 값 → 에러', () => {
    expect(() =>
      createProductSchema.parse({ ...validProduct, images: ['not-a-url'] }),
    ).toThrow()
  })

  it('선택 필드 (description, stockQuantity) 생략 가능', () => {
    const result = createProductSchema.parse(validProduct)
    expect(result.description).toBeUndefined()
    expect(result.stockQuantity).toBeUndefined()
  })
})

describe('shipOrderSchema', () => {
  it('유효한 입력 → 성공', () => {
    expect(() => shipOrderSchema.parse({
      trackingNumber: '123456789',
      courier: 'CJ대한통운',
    })).not.toThrow()
  })

  it('운송장 번호 빈 문자열 → 에러', () => {
    expect(() => shipOrderSchema.parse({
      trackingNumber: '',
      courier: 'CJ대한통운',
    })).toThrow()
  })

  it('택배사 누락 → 에러', () => {
    expect(() => shipOrderSchema.parse({
      trackingNumber: '123456789',
    })).toThrow()
  })
})

describe('controlSchema', () => {
  it('유효한 Kill Switch 키 → 성공', () => {
    expect(() => controlSchema.parse({
      key: 'AUTO_PRICE_ENABLED',
      value: 'true',
    })).not.toThrow()
  })

  it('유효한 SELLER_TYPE 키 → 성공', () => {
    expect(() => controlSchema.parse({
      key: 'SELLER_TYPE',
      value: 'individual',
    })).not.toThrow()
  })

  it('잘못된 키 → 에러', () => {
    expect(() => controlSchema.parse({
      key: 'INVALID_KEY',
      value: 'true',
    })).toThrow()
  })

  it('값 빈 문자열 → 에러', () => {
    expect(() => controlSchema.parse({
      key: 'AUTO_PRICE_ENABLED',
      value: '',
    })).toThrow()
  })
})

describe('saveCredentialsSchema', () => {
  it('유효한 credentials → 성공', () => {
    expect(() => saveCredentialsSchema.parse({
      credentials: { client_id: 'abc', client_secret: 'xyz' },
    })).not.toThrow()
  })

  it('credentials 누락 → 에러', () => {
    expect(() => saveCredentialsSchema.parse({})).toThrow()
  })
})

describe('naverWebhookSchema', () => {
  it('유효한 productOrderId → 성공', () => {
    expect(() => naverWebhookSchema.parse({
      productOrderId: '2024001234',
    })).not.toThrow()
  })

  it('productOrderId 빈 문자열 → 에러', () => {
    expect(() => naverWebhookSchema.parse({
      productOrderId: '',
    })).toThrow()
  })

  it('productOrderId 누락 → 에러', () => {
    expect(() => naverWebhookSchema.parse({})).toThrow()
  })
})

describe('talkTalkWebhookSchema', () => {
  const validPayload = {
    eventType: 'MESSAGE_RECEIVED',
    storeId: 'store-001',
    channelId: 'ch-001',
    customerId: 'cust-001',
    message: '문의합니다',
  }

  it('유효한 입력 → 성공', () => {
    expect(() => talkTalkWebhookSchema.parse(validPayload)).not.toThrow()
  })

  it('messageType 기본값 TEXT 적용', () => {
    const result = talkTalkWebhookSchema.parse(validPayload)
    expect(result.messageType).toBe('TEXT')
  })

  it('잘못된 eventType → 에러', () => {
    expect(() => talkTalkWebhookSchema.parse({
      ...validPayload,
      eventType: 'INVALID_EVENT',
    })).toThrow()
  })

  it('storeId 빈 문자열 → 에러', () => {
    expect(() => talkTalkWebhookSchema.parse({
      ...validPayload,
      storeId: '',
    })).toThrow()
  })

  it('message 생략 가능 (optional)', () => {
    const { message: _, ...noMessage } = validPayload
    expect(() => talkTalkWebhookSchema.parse(noMessage)).not.toThrow()
  })

  it('잘못된 messageType → 에러', () => {
    expect(() => talkTalkWebhookSchema.parse({
      ...validPayload,
      messageType: 'VIDEO',
    })).toThrow()
  })
})
