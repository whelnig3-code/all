"""
YATAI Print Menu Generator

Generates:
  1. menu-portrait.pdf/png (A3 portrait, 1 page)
  2. menu-landscape.pdf/png (A3 landscape, 1 page)
  3. menu-portrait-2page-page1.png + page2.png (A3 portrait, separate)
  4. menu-landscape-2page-page1.png + page2.png (A3 landscape, separate)
  5. table-review-qr-a5.pdf/png (A5 table POP)
  6. table-review-qr-a6.pdf/png (A6 table POP)

Usage: python _print_menu.py
"""

import threading
import http.server
import functools
from pathlib import Path
from playwright.sync_api import sync_playwright

PROJECT = Path(__file__).parent.resolve()
OUT_DIR = PROJECT / 'print'
OUT_DIR.mkdir(exist_ok=True)

A3_PW, A3_PH = 303, 426
A3_LW, A3_LH = 426, 303
A5_W, A5_H = 148, 210
A6_W, A6_H = 105, 148

DPI = 300
MM_TO_INCH = 25.4
PORT = 8787


def mm_to_px(mm):
    return int(mm / MM_TO_INCH * DPI)


def start_server():
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(PROJECT))
    srv = http.server.HTTPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def render_single(browser, html, name, w_mm, h_mm):
    """Render a single-page layout to PDF + PNG."""
    scale = DPI / 96
    vw = int(w_mm / MM_TO_INCH * 96)
    vh = int(h_mm / MM_TO_INCH * 96)

    page = browser.new_page(
        viewport={'width': vw, 'height': vh},
        device_scale_factor=scale)
    page.goto(f'http://127.0.0.1:{PORT}/{html}', wait_until='networkidle')
    page.wait_for_timeout(1500)

    pdf_path = OUT_DIR / f'{name}.pdf'
    page.pdf(path=str(pdf_path), width=f'{w_mm}mm', height=f'{h_mm}mm',
             margin={'top': '0', 'right': '0', 'bottom': '0', 'left': '0'},
             print_background=True)

    png_path = OUT_DIR / f'{name}.png'
    page.screenshot(path=str(png_path), full_page=True, type='png')
    page.close()

    print(f'  {name}.pdf ({pdf_path.stat().st_size//1024} KB)')
    print(f'  {name}.png ({png_path.stat().st_size//1024} KB)')


def render_2page_separate(browser, html, name, w_mm, h_mm):
    """Render a 2-page layout, screenshot each page separately."""
    scale = DPI / 96
    vw = int(w_mm / MM_TO_INCH * 96)
    vh = int(h_mm / MM_TO_INCH * 96)
    full_vh = vh * 2

    page = browser.new_page(
        viewport={'width': vw, 'height': full_vh},
        device_scale_factor=scale)
    page.goto(f'http://127.0.0.1:{PORT}/{html}', wait_until='networkidle')
    page.wait_for_timeout(1500)

    # PDF (multi-page)
    pdf_path = OUT_DIR / f'{name}.pdf'
    page.pdf(path=str(pdf_path), width=f'{w_mm}mm', height=f'{h_mm}mm',
             margin={'top': '0', 'right': '0', 'bottom': '0', 'left': '0'},
             print_background=True)
    print(f'  {name}.pdf ({pdf_path.stat().st_size//1024} KB)')

    # Separate page PNGs using clip
    pw = int(w_mm / MM_TO_INCH * 96 * scale)
    ph = int(h_mm / MM_TO_INCH * 96 * scale)

    for pg_num in [1, 2]:
        png_path = OUT_DIR / f'{name}-page{pg_num}.png'
        page.screenshot(
            path=str(png_path), type='png',
            clip={'x': 0, 'y': (pg_num - 1) * vh, 'width': vw, 'height': vh})
        print(f'  {name}-page{pg_num}.png ({png_path.stat().st_size//1024} KB)')

    page.close()


def render_pop(browser, html, w_mm, h_mm, name):
    """Render table POP card."""
    scale = DPI / 96
    vw = int(w_mm / MM_TO_INCH * 96)
    vh = int(h_mm / MM_TO_INCH * 96)

    # Inject CSS variables for sizing
    css_vars = ''
    if w_mm == A6_W:
        css_vars = """
        :root {
          --card-w: 105mm; --card-h: 148mm; --pad: 8mm; --pad-b: 7mm;
          --hdr-pb: 3mm; --hdr-mb: 2mm;
          --brand-fs: 14pt; --brand-sub-fs: 6pt;
          --title-fs: 16pt; --title-mt: 2.5mm; --title-mb: 2mm;
          --stars-fs: 20pt; --reward-fs: 15pt; --reward-mt: 2mm; --reward-en-fs: 8pt;
          --qr-mt: 2.5mm; --qr-size: 38mm;
          --steps-mt: 2mm; --steps-mb: 2mm;
          --step-fs: 9pt; --step-num-w: 5.5mm; --step-num-fs: 8pt;
          --foot-pt: 2mm; --limit-fs: 7.5pt;
          --hl-mb: 2.5mm;
        }"""
    else:
        css_vars = """
        :root {
          --card-w: 148mm; --card-h: 210mm; --pad: 12mm; --pad-b: 10mm;
          --hdr-pb: 4mm; --hdr-mb: 3mm;
          --brand-fs: 18pt; --brand-sub-fs: 7pt;
          --title-fs: 22pt; --title-mt: 4mm; --title-mb: 3mm;
          --stars-fs: 28pt; --reward-fs: 20pt; --reward-mt: 3mm; --reward-en-fs: 11pt;
          --qr-mt: 4mm; --qr-size: 55mm;
          --steps-mt: 3mm; --steps-mb: 3mm;
          --step-fs: 12pt; --step-num-w: 7mm; --step-num-fs: 10pt;
          --foot-pt: 3mm; --limit-fs: 10pt;
          --hl-mb: 4mm;
        }"""

    page = browser.new_page(
        viewport={'width': vw, 'height': vh},
        device_scale_factor=scale)
    page.goto(f'http://127.0.0.1:{PORT}/{html}', wait_until='networkidle')
    page.add_style_tag(content=css_vars)
    page.wait_for_timeout(800)

    pdf_path = OUT_DIR / f'{name}.pdf'
    page.pdf(path=str(pdf_path), width=f'{w_mm}mm', height=f'{h_mm}mm',
             margin={'top': '0', 'right': '0', 'bottom': '0', 'left': '0'},
             print_background=True)
    print(f'  {name}.pdf ({pdf_path.stat().st_size//1024} KB)')

    png_path = OUT_DIR / f'{name}.png'
    page.screenshot(path=str(png_path), full_page=True, type='png')
    print(f'  {name}.png ({png_path.stat().st_size//1024} KB)')

    page.close()


def main():
    print('YATAI Print Menu Generator')
    print(f'Output: {OUT_DIR}/')
    print(f'DPI: {DPI}\n')

    srv = start_server()
    print(f'Server: http://127.0.0.1:{PORT}\n')

    with sync_playwright() as p:
        browser = p.chromium.launch()

        # 1. Single-page menus
        print('--- PORTRAIT (1 page) ---')
        render_single(browser, 'print-portrait.html', 'menu-portrait', A3_PW, A3_PH)
        print()

        print('--- LANDSCAPE (1 page) ---')
        render_single(browser, 'print-landscape.html', 'menu-landscape', A3_LW, A3_LH)
        print()

        # 2. Two-page menus (separate page PNGs)
        print('--- PORTRAIT (2 pages) ---')
        render_2page_separate(browser, 'print-portrait-2p.html', 'menu-portrait-2page', A3_PW, A3_PH)
        print()

        print('--- LANDSCAPE (2 pages) ---')
        render_2page_separate(browser, 'print-landscape-2p.html', 'menu-landscape-2page', A3_LW, A3_LH)
        print()

        # 3. Table POP
        print('--- TABLE POP (A5) ---')
        render_pop(browser, 'print-table-pop.html', A5_W, A5_H, 'table-review-qr-a5')
        print()

        print('--- TABLE POP (A6) ---')
        render_pop(browser, 'print-table-pop.html', A6_W, A6_H, 'table-review-qr-a6')
        print()

        browser.close()

    srv.shutdown()

    print('Done! All files saved to print/ folder.')
    print()
    print('Files:')
    print('  menu-portrait.pdf/png')
    print('  menu-landscape.pdf/png')
    print('  menu-portrait-2page-page1.png, page2.png')
    print('  menu-landscape-2page-page1.png, page2.png')
    print('  table-review-qr-a5.pdf/png')
    print('  table-review-qr-a6.pdf/png')


if __name__ == '__main__':
    main()
