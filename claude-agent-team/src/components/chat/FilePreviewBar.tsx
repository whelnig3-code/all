"use client";

/**
 * FilePreviewBar — 첨부 파일 미리보기 바
 *
 * 비유: 우편함 위의 서류 접수 트레이. 첨부된 파일들의 썸네일/칩을 표시.
 */

import { T } from "@/lib/ui-tokens";
import type { FileAttachment } from "./useFileUpload";

interface FilePreviewBarProps {
  readonly attachments: readonly FileAttachment[];
  readonly onRemove: (index: number) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function FilePreviewBar({ attachments, onRemove }: FilePreviewBarProps) {
  if (attachments.length === 0) return null;

  return (
    <div
      data-testid="file-preview-bar"
      style={{
        display: "flex",
        gap: 8,
        padding: "8px 12px",
        overflowX: "auto",
        borderBottom: `1px solid ${T.border}`,
        background: "rgba(255,255,255,0.02)",
        flexShrink: 0,
      }}
    >
      {attachments.map((file, index) => (
        <div
          key={`${file.name}-${index}`}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.card,
            flexShrink: 0,
            maxWidth: 200,
          }}
        >
          {/* 이미지 썸네일 또는 파일 아이콘 */}
          {file.type === "image" ? (
            <img
              src={file.data}
              alt={file.name}
              style={{
                width: 32,
                height: 32,
                borderRadius: 4,
                objectFit: "cover",
                flexShrink: 0,
              }}
            />
          ) : (
            <span style={{ fontSize: 16, flexShrink: 0 }}>📄</span>
          )}

          {/* 파일 정보 */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 11,
              color: T.text1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {file.name}
            </div>
            <div style={{ fontSize: 10, color: T.text3 }}>
              {formatFileSize(file.size)}
            </div>
          </div>

          {/* 제거 버튼 */}
          <button
            onClick={() => onRemove(index)}
            aria-label={`${file.name} 제거`}
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: `1px solid ${T.border}`,
              background: T.card,
              color: T.text3,
              cursor: "pointer",
              fontSize: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
