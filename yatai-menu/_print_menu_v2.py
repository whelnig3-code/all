#!/usr/bin/env python
"""Generate PDF + PNG for all V1/V2 menu layouts using Playwright."""
import sys, os, threading, time
sys.stdout.reconfigure(encoding='utf-8')

from http.server import HTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(ROOT, 'print')
os.makedirs(OUT, exist_ok=True)

PORT = 8787
DPI  = 300
SCALE = DPI / 96  # 3.125

# CSS pixels (96 DPI) - Playwright viewport/clip use CSS pixels
# device_scale_factor handles the DPI upscaling automatically
def css_px(mm):
    return round(mm * 96 / 25.4)

# Paper sizes in mm
A3_P_W, A3_P_H = 303, 426
A3_L_W, A3_L_H = 426, 303

class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def start_server():
    os.chdir(ROOT)
    s = HTTPServer(('127.0.0.1', PORT), Q)
    t = threading.Thread(target=s.serve_forever, daemon=True)
    t.start()
    return s

def render_single(page, html_file, w_mm, h_mm, prefix):
    """1-page layout -> PDF + PNG"""
    url = f'http://127.0.0.1:{PORT}/{html_file}'
    vw, vh = css_px(w_mm), css_px(h_mm)

    # PDF
    page.set_viewport_size({'width': vw, 'height': vh})
    page.goto(url, wait_until='networkidle')
    page.wait_for_timeout(800)
    page.pdf(path=os.path.join(OUT, f'{prefix}.pdf'),
             width=f'{w_mm}mm', height=f'{h_mm}mm',
             print_background=True, margin={'top':'0','right':'0','bottom':'0','left':'0'})

    # PNG
    page.set_viewport_size({'width': vw, 'height': vh})
    page.goto(url, wait_until='networkidle')
    page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(OUT, f'{prefix}.png'),
                    clip={'x': 0, 'y': 0, 'width': vw, 'height': vh})
    sz = os.path.getsize(os.path.join(OUT, f'{prefix}.png'))
    print(f'  {prefix}: PDF + PNG ({sz//1024}KB)')

def render_2page(page, html_file, w_mm, h_mm, prefix):
    """2-page layout -> PDF + page1.png + page2.png"""
    url = f'http://127.0.0.1:{PORT}/{html_file}'
    vw, vh = css_px(w_mm), css_px(h_mm)

    # PDF
    page.set_viewport_size({'width': vw, 'height': vh * 2})
    page.goto(url, wait_until='networkidle')
    page.wait_for_timeout(800)
    page.pdf(path=os.path.join(OUT, f'{prefix}.pdf'),
             width=f'{w_mm}mm', height=f'{h_mm}mm',
             print_background=True, margin={'top':'0','right':'0','bottom':'0','left':'0'})

    # PNGs - separate pages
    page.set_viewport_size({'width': vw, 'height': vh * 2})
    page.goto(url, wait_until='networkidle')
    page.wait_for_timeout(800)

    page.screenshot(path=os.path.join(OUT, f'{prefix}-page1.png'),
                    clip={'x': 0, 'y': 0, 'width': vw, 'height': vh})
    page.screenshot(path=os.path.join(OUT, f'{prefix}-page2.png'),
                    clip={'x': 0, 'y': vh, 'width': vw, 'height': vh})
    s1 = os.path.getsize(os.path.join(OUT, f'{prefix}-page1.png'))
    s2 = os.path.getsize(os.path.join(OUT, f'{prefix}-page2.png'))
    print(f'  {prefix}: PDF + p1({s1//1024}KB) + p2({s2//1024}KB)')

def main():
    srv = start_server()
    print(f'Server on :{PORT}, scale={SCALE}')
    print(f'CSS viewport: portrait={css_px(A3_P_W)}x{css_px(A3_P_H)}, landscape={css_px(A3_L_W)}x{css_px(A3_L_H)}')
    time.sleep(0.3)

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(device_scale_factor=SCALE)
        pg = ctx.new_page()

        print('\n=== V1: Improved Current ===')
        render_2page(pg, 'print-v1-portrait-2p.html', A3_P_W, A3_P_H, 'v1-portrait-2page')
        render_2page(pg, 'print-v1-landscape-2p.html', A3_L_W, A3_L_H, 'v1-landscape-2page')
        render_single(pg, 'print-v1-portrait.html', A3_P_W, A3_P_H, 'v1-portrait')
        render_single(pg, 'print-v1-landscape.html', A3_L_W, A3_L_H, 'v1-landscape')

        print('\n=== V2: Izakaya Style ===')
        render_2page(pg, 'print-v2-portrait-2p.html', A3_P_W, A3_P_H, 'v2-portrait-2page')
        render_2page(pg, 'print-v2-landscape-2p.html', A3_L_W, A3_L_H, 'v2-landscape-2page')
        render_single(pg, 'print-v2-portrait.html', A3_P_W, A3_P_H, 'v2-portrait')
        render_single(pg, 'print-v2-landscape.html', A3_L_W, A3_L_H, 'v2-landscape')

        browser.close()

    srv.shutdown()
    print('\nDone!')

if __name__ == '__main__':
    main()
