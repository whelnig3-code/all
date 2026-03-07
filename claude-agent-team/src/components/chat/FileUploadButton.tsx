"use client";

/**
 * FileUploadButton — 📎 파일 첨부 버튼
 *
 * 비유: 우편함 옆의 서류 투입구. 클릭하면 파일 선택 창이 열린다.
 */

import { useRef } from "react";
import { T } from "@/lib/ui-tokens";

const ACCEPT = [
  // 이미지
  "image/jpeg", "image/png", "image/gif", "image/webp",
  // 텍스트
  ".txt", ".md", ".json", ".ts", ".tsx", ".js", ".jsx", ".py", ".css", ".html",
].join(",");

interface FileUploadButtonProps {
  readonly onFiles: (files: File[]) => void;
  readonly disabled?: boolean;
}

export default function FileUploadButton({ onFiles, disabled = false }: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          // 동일 파일 재선택 허용
          e.target.value = "";
        }}
        style={{ display: "none" }}
        aria-hidden="true"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label="파일 첨부"
        title="파일 첨부 (이미지, 텍스트)"
        style={{
          width: 36,
          height: 36,
          minWidth: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          background: "transparent",
          color: disabled ? T.text3 : T.text2,
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 16,
          flexShrink: 0,
          transition: "all 0.15s",
        }}
      >
        📎
      </button>
    </>
  );
}
