#!/usr/bin/env node
/**
 * scripts/create-project.ts
 *
 * projects/ 하위에 새 프로젝트 폴더를 생성합니다.
 * git 동기화 대상과 로컬 전용 프로젝트를 선택할 수 있습니다.
 *
 * 사용법:
 *   node scripts/create-project.ts <name> [git|local]
 *
 * 예시:
 *   node scripts/create-project.ts my-feature           → projects/my-feature/ (git 추적)
 *   node scripts/create-project.ts my-exp local         → projects/local-my-exp/ (Git 미추적)
 *
 * 규칙:
 *   - git  옵션: projects/<name>/          — Git 동기화 대상
 *   - local 옵션: projects/local-<name>/  — Git 미추적 (projects/local-* 패턴으로 자동 처리)
 *
 * 주의: 외부 라이브러리 미사용 (Node.js 내장 모듈만 사용)
 */

import { mkdirSync, existsSync, writeFileSync } from "fs";
import { resolve, join }                        from "path";

// ─── 인수 파싱 ────────────────────────────────────────────────────────────────

const [, , rawName, modeArg] = process.argv;

function printUsage(): void {
  console.log("사용법: node scripts/create-project.ts <name> [git|local]");
  console.log("");
  console.log("  git   (기본값) → projects/<name>/       — Git 동기화 대상");
  console.log("  local          → projects/local-<name>/ — 로컬 전용 (.gitignore 자동 추가)");
  console.log("");
  console.log("예시:");
  console.log("  node scripts/create-project.ts my-api-client");
  console.log("  node scripts/create-project.ts sandbox local");
}

if (!rawName) {
  console.error("오류: 프로젝트 이름이 필요합니다.\n");
  printUsage();
  process.exit(1);
}

// 이름 유효성 검사 (알파벳, 숫자, 하이픈, 언더스코어만 허용)
if (!/^[a-zA-Z0-9_-]+$/.test(rawName)) {
  console.error(`오류: 프로젝트 이름 "${rawName}"에 허용되지 않는 문자가 포함되어 있습니다.`);
  console.error("      알파벳, 숫자, 하이픈(-), 언더스코어(_)만 사용하세요.");
  process.exit(1);
}

const mode = (modeArg ?? "git").toLowerCase();
if (mode !== "git" && mode !== "local") {
  console.error(`오류: 모드는 "git" 또는 "local"만 가능합니다. (입력값: "${modeArg}")\n`);
  printUsage();
  process.exit(1);
}

// ─── 경로 계산 ────────────────────────────────────────────────────────────────

// 스크립트 위치 기준 프로젝트 루트
const PROJECT_ROOT = resolve(import.meta.dirname ?? __dirname, "..");
const PROJECTS_DIR = join(PROJECT_ROOT, "projects");

// local 모드: "local-" 접두어 자동 추가
const folderName = mode === "local" ? `local-${rawName}` : rawName;
const projectDir = join(PROJECTS_DIR, folderName);

// ─── 폴더 생성 ────────────────────────────────────────────────────────────────

// projects/ 루트가 없으면 생성 (보통 존재하지만 안전하게 처리)
if (!existsSync(PROJECTS_DIR)) {
  mkdirSync(PROJECTS_DIR, { recursive: true });
  console.log(`📁 projects/ 폴더 생성됨`);
}

// 이미 존재하는 프로젝트 중복 방지
if (existsSync(projectDir)) {
  console.error(`오류: "projects/${folderName}" 폴더가 이미 존재합니다.`);
  process.exit(1);
}

// 프로젝트 폴더 생성
mkdirSync(projectDir, { recursive: true });

// ─── README.md 생성 (기본 템플릿) ─────────────────────────────────────────────

const syncLabel = mode === "local" ? "로컬 전용 (Git 미추적)" : "Git 동기화 대상";
const readmeContent = `# ${rawName}

> 생성일: ${new Date().toISOString().slice(0, 10)}
> 동기화: **${syncLabel}**

## 개요

이 프로젝트는 JM Agent Team 대시보드의 \`projects/\` 하위 프로젝트입니다.

## 시작 방법

\`\`\`bash
cd projects/${folderName}
# 여기에 시작 방법 작성
\`\`\`
`;

writeFileSync(join(projectDir, "README.md"), readmeContent, "utf-8");

// ─── 완료 메시지 ──────────────────────────────────────────────────────────────

console.log("");
console.log(`✅ 프로젝트 생성 완료!`);
console.log(`   경로  : projects/${folderName}/`);
console.log(`   동기화: ${syncLabel}`);
if (mode === "local") {
  // .gitignore의 projects/local-* 패턴이 이미 이 경로를 커버함 — 개별 추가 불필요
  console.log(`   .gitignore: projects/local-* 패턴으로 자동 무시됨 (별도 추가 없음)`);
}
console.log(`   파일  : projects/${folderName}/README.md`);
console.log("");
console.log(`💡 사용 예:`);
console.log(`   cd projects/${folderName}`);
console.log(`   # 작업을 시작하세요`);
