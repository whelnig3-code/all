#!/usr/bin/env python3
"""
이미지 리디자인 스크립트 (Pillow 기반)
- 1000×1000 정사각형 리사이즈/패딩
- 상단: 흰색 박스 + 제목 텍스트
- 하단: 흰색 박스 + 불릿 포인트
- 인페인팅 금지 — 박스 덮어쓰기만
- 성공: exit(0) / 실패: exit(1)
"""

import sys
import argparse
import os


def load_font(font_path: str | None, size: int):
    """한글 폰트 로드 (없으면 기본 폰트 사용)"""
    from PIL import ImageFont  # type: ignore

    if font_path and os.path.exists(font_path):
        try:
            return ImageFont.truetype(font_path, size)
        except Exception:
            pass

    # 기본 폰트 사용 (한글 미지원일 수 있음)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def resize_to_square(img, size: int = 1000):
    """이미지를 정사각형으로 리사이즈 (흰색 배경 패딩)"""
    from PIL import Image  # type: ignore

    # 비율 유지 리사이즈
    img.thumbnail((size, size), Image.LANCZOS)

    # 흰색 배경 캔버스에 중앙 배치
    canvas = Image.new('RGB', (size, size), (255, 255, 255))
    offset_x = (size - img.width) // 2
    offset_y = (size - img.height) // 2
    canvas.paste(img, (offset_x, offset_y))
    return canvas


def draw_text_box(draw, img_size: int, y_start: float, y_end: float,
                  text: str, font, box_alpha: int = 210):
    """반투명 흰색 박스 위에 텍스트 삽입"""
    from PIL import Image, ImageDraw  # type: ignore

    box_y1 = int(img_size * y_start)
    box_y2 = int(img_size * y_end)
    box_h = box_y2 - box_y1

    # 흰색 반투명 박스 (인페인팅 금지 — 덮어쓰기만)
    overlay = Image.new('RGBA', (img_size, box_h), (255, 255, 255, box_alpha))

    # 텍스트 좌우 패딩
    padding = 20
    # 텍스트를 박스 중앙에 배치
    try:
        bbox = font.getbbox(text)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
    except AttributeError:
        text_w, text_h = font.getsize(text)

    text_x = max(padding, (img_size - text_w) // 2)
    text_y = (box_h - text_h) // 2

    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.text((text_x, text_y), text, fill=(30, 30, 30, 255), font=font)

    return overlay, box_y1


def main():
    parser = argparse.ArgumentParser(description='이미지 리디자인 (텍스트 박스 삽입)')
    parser.add_argument('--input', required=True, help='입력 이미지 경로')
    parser.add_argument('--output', required=True, help='출력 이미지 경로')
    parser.add_argument('--title', required=True, help='상단 제목 텍스트')
    parser.add_argument('--bullets', required=True, help='하단 불릿 포인트 (쉼표 구분, 최대 3개)')
    args = parser.parse_args()

    try:
        from PIL import Image, ImageDraw  # type: ignore

        font_path = os.environ.get('IMAGE_FONT_PATH', '')
        img_size = 1000

        # 이미지 로드 및 정사각형 변환
        img = Image.open(args.input).convert('RGB')
        img = resize_to_square(img, img_size)

        # RGBA로 변환 (합성을 위해)
        base = img.convert('RGBA')

        # 폰트 크기 설정
        title_font = load_font(font_path, 36)
        bullet_font = load_font(font_path, 26)

        # 상단 박스 (18% ~ 22% 영역): 제목
        title_text = args.title[:22]  # 최대 22자
        title_overlay, title_y = draw_text_box(
            None, img_size, 0.18, 0.22, title_text, title_font
        )
        base.paste(title_overlay, (0, title_y), title_overlay)

        # 하단 박스 (72% ~ 78% 영역): 불릿 포인트
        bullets = [b.strip() for b in args.bullets.split(',') if b.strip()][:3]

        if bullets:
            bullet_overlay = Image.new('RGBA', (img_size, int(img_size * 0.28)), (255, 255, 255, 210))
            bullet_draw = ImageDraw.Draw(bullet_overlay)
            box_y1 = int(img_size * 0.72)
            box_h = int(img_size * 0.28)
            line_height = box_h // (len(bullets) + 1)

            for i, bullet in enumerate(bullets):
                bullet_text = f'• {bullet}'
                text_y = line_height * (i + 1) - 13  # 텍스트 높이 보정
                bullet_draw.text((20, text_y), bullet_text, fill=(30, 30, 30, 255), font=bullet_font)

            base.paste(bullet_overlay, (0, box_y1), bullet_overlay)

        # 최종 이미지 저장 (RGB로 변환 후 JPEG 저장)
        output_dir = os.path.dirname(args.output)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        final = base.convert('RGB')
        final.save(args.output, 'JPEG', quality=90)

        sys.exit(0)

    except ImportError:
        sys.stderr.write('[redesign_image] Pillow 미설치 — pip install Pillow\n')
        sys.exit(1)

    except Exception as e:
        sys.stderr.write(f'[redesign_image] 오류: {e}\n')
        sys.exit(1)


if __name__ == '__main__':
    main()
