// Phase 3-2: 블로그 포스트 생성 테스트 (게시하지 않음 — 검수용)
require('dotenv').config();

async function test() {
  const core = require('@smartstore/core');

  const input = {
    productName: '다용도 공구세트 48종 DIY 드라이버 렌치 세트',
    category: '공구',
    salePrice: 29900,
    description: '가정용 공구 48종 세트입니다. 드라이버, 렌치, 펜치, 망치 등 기본 공구가 포함되어 있으며, 수납 케이스와 함께 제공됩니다.',
    keywords: ['공구세트', 'DIY', '드라이버세트'],
  };

  // 1. 템플릿 버전 (항상 성공)
  console.log('=====================================================');
  console.log(' 1. 템플릿 기반 블로그 포스트');
  console.log('=====================================================');
  const templatePost = core.buildBlogPostFromTemplate(input);
  console.log('제목:', templatePost.title);
  console.log('태그:', templatePost.tags.join(', '));
  console.log('');
  console.log('--- 본문 (HTML) ---');
  console.log(templatePost.body);
  console.log('');

  // 2. LLM 버전 (Ollama가 켜져 있으면 LLM, 아니면 fallback)
  console.log('=====================================================');
  console.log(' 2. LLM 기반 블로그 포스트 시도');
  console.log('=====================================================');
  const llmPost = await core.generateBlogPost(input);
  console.log('제목:', llmPost.title);
  console.log('태그:', llmPost.tags.join(', '));
  console.log('');
  console.log('--- 본문 ---');
  console.log(llmPost.body);
  console.log('');

  // 3. 상품 설명 생성 테스트 (llmAdapter 주입 필요)
  console.log('=====================================================');
  console.log(' 3. 상품 설명 자동 생성');
  console.log('=====================================================');
  const { llmAdapter } = require('@smartstore/adapters');
  const desc = await core.generateProductDescription({
    productName: input.productName,
    rawDescription: input.description,
    categoryName: input.category,
    salePrice: input.salePrice,
  }, llmAdapter);
  console.log('핵심 특징:');
  desc.highlights.forEach(h => console.log('  •', h));
  console.log('');
  console.log('상세 설명:', desc.detailDescription.substring(0, 200));
  console.log('주의사항:', desc.cautions.substring(0, 100));
  console.log('생성 모델:', desc.generatedBy);
}

test().catch(err => console.log('ERROR:', err.message));
