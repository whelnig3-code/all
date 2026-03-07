/**
 * 환경변수 유틸리티
 * PROJECT_BASE_DIR 접근을 중앙화하여 20+ 파일의 중복을 제거합니다.
 */

/** 프로젝트 루트 디렉터리 반환 (모든 파일 경로 해석의 기준점) */
export function getProjectBase(): string {
  return process.env.PROJECT_BASE_DIR ?? process.cwd();
}
