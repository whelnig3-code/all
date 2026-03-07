"use client";

/**
 * useFileUpload — 채팅 파일 첨부 훅
 *
 * 비유: 우편함(ChatInput)에 서류 투입구(📎)를 설치.
 * 이미지(max 5MB)와 텍스트(max 1MB)를 최대 5개까지 첨부 가능.
 */

import { useState, useCallback } from "react";

const IMAGE_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const TEXT_MAX_SIZE = 1 * 1024 * 1024;   // 1MB
const MAX_FILES = 5;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json", ".ts", ".tsx", ".js", ".jsx", ".py", ".css", ".html"]);

export interface FileAttachment {
  readonly name: string;
  readonly size: number;
  readonly type: "image" | "text";
  /** base64 데이터 (이미지) 또는 텍스트 내용 */
  readonly data: string;
  readonly mimeType: string;
}

function isImageFile(file: File): boolean {
  return IMAGE_TYPES.has(file.type);
}

function isTextFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
  return TEXT_EXTENSIONS.has(ext);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsText(file);
  });
}

export function useFileUpload() {
  const [attachments, setAttachments] = useState<readonly FileAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(async (files: File[]) => {
    setError(null);
    const remaining = MAX_FILES - attachments.length;
    const toProcess = files.slice(0, Math.max(0, remaining));

    const newAttachments: FileAttachment[] = [];

    for (const file of toProcess) {
      if (isImageFile(file)) {
        if (file.size > IMAGE_MAX_SIZE) {
          setError(`이미지 파일은 5MB 이하만 가능합니다: ${file.name}`);
          continue;
        }
        const data = await readFileAsBase64(file);
        newAttachments.push({
          name: file.name,
          size: file.size,
          type: "image",
          data,
          mimeType: file.type,
        });
      } else if (isTextFile(file)) {
        if (file.size > TEXT_MAX_SIZE) {
          setError(`텍스트 파일은 1MB 이하만 가능합니다: ${file.name}`);
          continue;
        }
        const data = await readFileAsText(file);
        newAttachments.push({
          name: file.name,
          size: file.size,
          type: "text",
          data,
          mimeType: file.type || "text/plain",
        });
      }
      // 지원하지 않는 파일 형식은 무시
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, [attachments.length]);

  const removeFile = useCallback((index: number) => {
    setAttachments((prev) => [...prev.slice(0, index), ...prev.slice(index + 1)]);
    setError(null);
  }, []);

  const clearFiles = useCallback(() => {
    setAttachments([]);
    setError(null);
  }, []);

  return { attachments, error, addFiles, removeFile, clearFiles } as const;
}
