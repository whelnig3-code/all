#!/usr/bin/env python3
"""
OCR 텍스트 추출 스크립트
- PaddleOCR로 이미지에서 텍스트 추출
- 중국어/영어 감지 후 JSON 출력
- 실패 시 lines: [] 반환 (등록 중단 금지)
"""

import sys
import json
import argparse
import re


def detect_lang(text: str) -> str:
    """텍스트 언어 감지 (zh/en/unknown)"""
    # 한자 포함 여부로 중국어 판별
    if re.search(r'[\u4e00-\u9fff\u3400-\u4dbf]', text):
        return 'zh'
    # ASCII 알파벳 비율로 영어 판별
    ascii_count = sum(1 for c in text if c.isascii() and c.isalpha())
    if ascii_count / max(len(text), 1) > 0.5:
        return 'en'
    return 'unknown'


def main():
    parser = argparse.ArgumentParser(description='PaddleOCR 이미지 텍스트 추출')
    parser.add_argument('--image', required=True, help='처리할 이미지 경로')
    args = parser.parse_args()

    try:
        from paddleocr import PaddleOCR  # type: ignore

        # PaddleOCR 초기화 (한/중/영 멀티랭귀지, 각도 보정 활성화)
        ocr = PaddleOCR(use_angle_cls=True, lang='ch', show_log=False)

        result = ocr.ocr(args.image, cls=True)

        lines = []
        if result and result[0]:
            for item in result[0]:
                # item: [[bbox_points], (text, confidence)]
                bbox_points = item[0]
                text_info = item[1]
                text = text_info[0]

                # bbox를 [x1, y1, x2, y2] 형식으로 변환
                x_coords = [p[0] for p in bbox_points]
                y_coords = [p[1] for p in bbox_points]
                bbox = [
                    int(min(x_coords)),
                    int(min(y_coords)),
                    int(max(x_coords)),
                    int(max(y_coords)),
                ]

                lines.append({
                    'text': text,
                    'bbox': bbox,
                    'lang': detect_lang(text),
                })

        print(json.dumps({'lines': lines}, ensure_ascii=False))

    except ImportError:
        # PaddleOCR 미설치 시 빈 결과 반환 (등록 중단 금지)
        sys.stderr.write('[ocr_extract] PaddleOCR 미설치 — 빈 결과 반환\n')
        print(json.dumps({'lines': []}))

    except Exception as e:
        # 모든 오류 시 빈 결과 반환 (등록 중단 금지)
        sys.stderr.write(f'[ocr_extract] 오류: {e}\n')
        print(json.dumps({'lines': []}))


if __name__ == '__main__':
    main()
