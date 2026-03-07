/**
 * path-security.ts — 경로 안전 검증 공유 유틸리티
 *
 * 비유: 건물 출입 검사대. 모든 파일 접근 경로가 이 검사대를 통과해야 하며,
 * 허용된 구역(base 디렉터리) 밖으로 나가는 경로는 차단한다.
 *
 * 사용처: files/route.ts, tools.ts, conversations/[id]/route.ts
 */

import path from "path";

/**
 * 경로를 base 디렉터리 내로 제한합니다.
 *
 * @param filePath 검증할 파일 경로 (상대 또는 절대)
 * @param base     허용 범위의 루트 디렉터리 (절대 경로)
 * @returns        정규화된 절대 경로
 * @throws         base 외부 접근 시 에러
 */
export function resolveSafePath(filePath: string, base: string): string {
  if (!filePath || filePath.trim() === "") {
    throw new Error("Path must not be empty");
  }

  const normalizedBase = path.normalize(base);
  const full = path.isAbsolute(filePath)
    ? filePath
    : path.join(normalizedBase, filePath);
  const resolved = path.normalize(full);

  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error("Access denied: path outside allowed directory");
  }

  return resolved;
}
