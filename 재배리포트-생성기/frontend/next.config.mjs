/** @type {import('next').NextConfig} */
const nextConfig = {
  // 패키징 시: 정적 파일로 export (Next.js 서버 불필요)
  // 개발 시에는 이 설정이 무시됨 (`next dev` 사용)
  output: "export",

  // 정적 export 시 이미지 최적화 비활성화 (서버 없이 동작)
  images: {
    unoptimized: true,
  },

  // 정적 export 시 각 경로에 index.html 생성
  trailingSlash: true,
};

export default nextConfig;
