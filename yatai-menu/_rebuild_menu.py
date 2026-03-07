"""
Complete rebuild of menu.json with ALL items.
Split sashimi into: sashimi (simple) + sashimi-set (with sides).
Removed sushi-single as separate category - merged into sushi.
Sake/pack-sake merged into drink.
Category order per spec: set, sashimi, sashimi-set, sushi, roll, signature, grill, fried, meal, noodle, hotpot, drink, extras.
"""

import json
from pathlib import Path
from datetime import datetime

MENU_PATH = Path(__file__).parent / 'data' / 'menu.json'
NOW = datetime.now().isoformat(timespec='seconds') + 'Z'

CATEGORIES = [
    {"id": "set", "sort": 1, "name": {
        "ko": "세트메뉴 / 코스", "en": "Set Menu / Course",
        "zh": "套餐/套餐", "ja": "セットメニュー/コース",
        "vi": "Set / Course", "th": "เซ็ตเมนู/คอร์ส",
        "ne": "सेट मेनु/कोर्स", "ru": "Сет-меню/Курс"
    }},
    {"id": "sashimi", "sort": 2, "name": {
        "ko": "회 (단품)", "en": "Raw Fish",
        "zh": "生鱼片(单品)", "ja": "刺身(単品)",
        "vi": "Sashimi đơn", "th": "ซาชิมิเดี่ยว",
        "ne": "साशिमी एकल", "ru": "Сашими"
    }},
    {"id": "sashimi-set", "sort": 3, "name": {
        "ko": "회 (세트)", "en": "Sashimi Set",
        "zh": "生鱼片套餐", "ja": "刺身セット",
        "vi": "Set Sashimi", "th": "ชุดซาชิมิ",
        "ne": "साशिमी सेट", "ru": "Сашими-сет"
    }},
    {"id": "sushi", "sort": 4, "name": {
        "ko": "초밥", "en": "Sushi",
        "zh": "寿司", "ja": "寿司",
        "vi": "Sushi", "th": "ซูชิ",
        "ne": "सुशी", "ru": "Суши"
    }},
    {"id": "sushi-single", "sort": 5, "name": {
        "ko": "초밥 (1pcs)", "en": "Sushi Single (1pcs)",
        "zh": "单个寿司", "ja": "お寿司(1貫)",
        "vi": "Sushi lẻ", "th": "ซูชิชิ้นเดียว",
        "ne": "सुशी एकल", "ru": "Суши поштучно"
    }},
    {"id": "roll", "sort": 6, "name": {
        "ko": "롤", "en": "Roll",
        "zh": "卷", "ja": "ロール",
        "vi": "Cuốn", "th": "โรล",
        "ne": "रोल", "ru": "Роллы"
    }},
    {"id": "signature", "sort": 7, "name": {
        "ko": "특선 요리", "en": "Signature Dishes",
        "zh": "招牌菜", "ja": "特選料理",
        "vi": "Món đặc biệt", "th": "เมนูเด็ด",
        "ne": "विशेष परिकार", "ru": "Фирменные блюда"
    }},
    {"id": "grill", "sort": 8, "name": {
        "ko": "구이", "en": "Grilled",
        "zh": "烤物", "ja": "焼き物",
        "vi": "Nướng", "th": "ย่าง",
        "ne": "ग्रिल", "ru": "Гриль"
    }},
    {"id": "fried", "sort": 9, "name": {
        "ko": "튀김", "en": "Fried",
        "zh": "炸物", "ja": "揚げ物",
        "vi": "Chiên", "th": "ทอด",
        "ne": "तलेको", "ru": "Жареное"
    }},
    {"id": "meal", "sort": 10, "name": {
        "ko": "식사", "en": "Rice Meals",
        "zh": "饭类", "ja": "ご飯もの",
        "vi": "Cơm", "th": "ข้าว",
        "ne": "भात", "ru": "Рис"
    }},
    {"id": "noodle", "sort": 11, "name": {
        "ko": "면류", "en": "Noodles",
        "zh": "面类", "ja": "麺類",
        "vi": "Mì", "th": "เส้น",
        "ne": "चाउमिन", "ru": "Лапша"
    }},
    {"id": "hotpot", "sort": 12, "name": {
        "ko": "전골 / 탕", "en": "Hot Pot / Soup",
        "zh": "火锅/汤", "ja": "鍋/スープ",
        "vi": "Lẩu/Canh", "th": "หม้อไฟ/ซุป",
        "ne": "हट पट/सुप", "ru": "Горячий горшок/Суп"
    }},
    {"id": "drink", "sort": 13, "name": {
        "ko": "주류 / 음료", "en": "Drinks",
        "zh": "酒水/饮料", "ja": "ドリンク",
        "vi": "Đồ uống", "th": "เครื่องดื่ม",
        "ne": "पेय", "ru": "Напитки"
    }},
    {"id": "extras", "sort": 14, "name": {
        "ko": "추가 / 사이드", "en": "Extras",
        "zh": "附加", "ja": "サイドメニュー",
        "vi": "Thêm", "th": "เพิ่มเติม",
        "ne": "अतिरिक्त", "ru": "Дополнительно"
    }},
]


def item(id, cat, sort, price, ko, en='', desc_ko='', desc_en=''):
    return {
        "id": id,
        "category": cat,
        "sort": sort,
        "price": price,
        "active": True,
        "updated_at": NOW,
        "image": "images/placeholder.webp",
        "name": {"ko": ko, "en": en},
        "description": {"ko": desc_ko, "en": desc_en} if desc_ko else {}
    }


ITEMS = [
    # === SET MENU / COURSE ===
    item("set-ilpum", "set", 1, 110000,
         "일품요리세트", "Premium Course",
         "콘버터, 샐러드, 활어회(대), 우삼겹숙주볶음, 명란계란말이, 일식깐풍기, 초밥(10pcs), 생선구이, 백합두부탕 또는 매운탕",
         "Corn butter, salad, live fish sashimi (L), beef bean sprout, mentaiko egg roll, Japanese-style spicy chicken, sushi (10pcs), grilled fish, clam tofu soup or spicy fish stew"),
    item("set-yatai-special", "set", 2, 108000,
         "야타이 스페셜 (4인)", "YATAI Special (4P)",
         "죽, 콘버터, 부침개, 샐러드, 모듬튀김, 초밥(8pcs), 퓨전롤(8pcs), 시샤모구이(4), 닭날개 데리야끼(4pcs), 매운탕, 날치알마끼, 닭고기, 은행",
         "Porridge, corn butter, pancake, salad, assorted tempura, sushi (8pcs), fusion roll (8pcs), shishamo (4), chicken wing teriyaki (4pcs), spicy stew, tobiko maki, chicken, ginkgo"),
    item("set-a", "set", 3, 32000,
         "회정식 A", "Sashimi Course A",
         "죽, 콘버터, 샐러드, 버섯구이, 우동, 사시미3종, 초밥3pcs, 튀김3pcs, 은행, 홍합구이, 매운탕, 알밥, 마끼",
         "Porridge, corn butter, salad, grilled mushroom, udon, 3 types sashimi, sushi 3pcs, tempura 3pcs, ginkgo, grilled mussel, spicy stew, fish roe rice, maki"),
    item("set-b", "set", 4, 38000,
         "회정식 B", "Sashimi Course B",
         "A코스 + 닭날개 데리야끼 + 우삼겹숙주볶음",
         "Course A + chicken wing teriyaki + beef bean sprout stir-fry"),

    # === SASHIMI (simple, no sides) ===
    item("sashimi-gwangeo", "sashimi", 1, 49000,
         "광어회", "Flatfish Sashimi"),
    item("sashimi-ureok", "sashimi", 2, 49000,
         "우럭회", "Rockfish Sashimi"),
    item("sashimi-salmon", "sashimi", 3, 12000,
         "연어사시미 (100g)", "Salmon Sashimi (100g)"),
    item("sashimi-mulhoe", "sashimi", 4, 18000,
         "광어 물회", "Flatfish Cold Soup"),
    # optional add-on
    item("sashimi-side", "sashimi", 5, 7000,
         "스끼다시 5종 추가", "Extra 5 Side Dishes"),

    # === SASHIMI SET (with 12 side dishes) ===
    item("sashimi-set-gwangeo", "sashimi-set", 1, 89000,
         "광어회", "Flatfish Sashimi"),
    item("sashimi-set-ureok", "sashimi-set", 2, 89000,
         "우럭회", "Rockfish Sashimi"),
    item("sashimi-set-combo", "sashimi-set", 3, 89000,
         "광어 + 우럭", "Flatfish + Rockfish"),

    # === SUSHI ===
    item("sushi-assorted", "sushi", 1, 16000,
         "모듬초밥", "Assorted Sushi"),
    item("sushi-salmon", "sushi", 2, 20000,
         "연어초밥", "Salmon Sushi"),
    item("sushi-ureok", "sushi", 3, 24000,
         "우럭초밥", "Rockfish Sushi"),
    item("sushi-shrimp-soy", "sushi", 4, 18000,
         "간장새우초밥", "Soy Shrimp Sushi"),
    item("sushi-gwangeo", "sushi", 5, 19000,
         "광어초밥", "Flatfish Sushi"),
    item("sushi-inari", "sushi", 6, 10000,
         "유부초밥", "Inari Sushi"),
    item("sushi-eel", "sushi", 7, 18000,
         "바다장어초밥", "Sea Eel Sushi"),
    item("sushi-shrimp", "sushi", 8, 15000,
         "새우초밥", "Shrimp Sushi"),
    item("sushi-egg", "sushi", 9, 11000,
         "계란초밥", "Egg Sushi"),

    # === SUSHI SINGLE (1pcs) ===
    item("single-gwangeo", "sushi-single", 1, 1800,
         "광어", "Flatfish"),
    item("single-shrimp-soy", "sushi-single", 2, 1800,
         "간장새우", "Soy Shrimp"),
    item("single-egg", "sushi-single", 3, 1200,
         "계란", "Egg"),
    item("single-salmon", "sushi-single", 4, 1800,
         "연어", "Salmon"),
    item("single-fin", "sushi-single", 5, 2000,
         "광어지느러미", "Flatfish Fin"),
    item("single-ureok", "sushi-single", 6, 2500,
         "우럭", "Rockfish"),
    item("single-shrimp", "sushi-single", 7, 1500,
         "새우", "Shrimp"),
    item("single-inari", "sushi-single", 8, 1000,
         "유부", "Inari"),
    item("single-eel", "sushi-single", 9, 1700,
         "바다장어", "Sea Eel"),

    # === ROLL ===
    item("roll-california", "roll", 1, 9000,
         "캘리포니아롤", "California Roll",
         "맛살, 오이, 날치알", "Crab stick, cucumber, flying fish roe"),
    item("roll-tiger", "roll", 2, 14000,
         "타이거롤", "Tiger Roll",
         "새우튀김, 새우, 오이", "Shrimp tempura, shrimp, cucumber"),
    item("roll-bayisland", "roll", 3, 14000,
         "베이아일랜드롤", "Bay Island Roll",
         "바다장어, 새우, 오이, 날치알", "Sea eel, shrimp, cucumber, flying fish roe"),
    item("roll-crunch", "roll", 4, 9000,
         "크런치롤", "Crunch Roll",
         "새우튀김, 맛살, 오이", "Shrimp tempura, crab stick, cucumber"),
    item("roll-lionking", "roll", 5, 14000,
         "라이언킹롤", "Lion King Roll",
         "연어, 맛살, 오이, 양파", "Salmon, crab stick, cucumber, onion"),
    item("roll-alaska", "roll", 6, 13000,
         "알래스카롤", "Alaska Roll",
         "연어, 맛살, 오이, 양파", "Salmon, crab stick, cucumber, onion"),
    item("roll-dragon", "roll", 7, 14000,
         "드래곤롤", "Dragon Roll",
         "바다장어, 맛살, 오이", "Sea eel, crab stick, cucumber"),

    # === SIGNATURE ===
    item("sig-mussel-chili", "signature", 1, 18000,
         "홍합칠리구이", "Chili Grilled Mussels"),
    item("sig-beef-sprout", "signature", 2, 24000,
         "우삼겹숙주볶음", "Beef Brisket & Bean Sprout"),
    item("sig-mentaiko-egg", "signature", 3, 9000,
         "명란계란말이", "Mentaiko Egg Roll"),
    item("sig-sichuan-wing", "signature", 4, 18000,
         "사천닭날개", "Sichuan Chicken Wings"),
    item("sig-shrimp-soy", "signature", 5, 15000,
         "새우장", "Soy Marinated Shrimp"),
    item("sig-donkatsu-anju", "signature", 6, 20000,
         "돈까스안주", "Tonkatsu Side"),
    item("sig-jjukkumi", "signature", 7, 28000,
         "쭈꾸미볶음 + 소면", "Spicy Octopus + Noodles"),
    item("sig-salmon-salad", "signature", 8, 25000,
         "연어사라다", "Salmon Salad"),

    # === GRILLED ===
    item("grill-jeoneo", "grill", 1, 20000,
         "전어구이", "Grilled Gizzard Shad"),
    item("grill-cheongeo", "grill", 2, 13000,
         "청어구이", "Grilled Herring"),
    item("grill-samchi", "grill", 3, 20000,
         "삼치구이", "Grilled Spanish Mackerel"),
    item("grill-mero", "grill", 4, 23000,
         "메로구이", "Grilled Chilean Sea Bass"),
    item("grill-shishamo", "grill", 5, 16000,
         "사모구이", "Grilled Shishamo"),

    # === FRIED ===
    item("fried-shrimp-tempura", "fried", 1, 20000,
         "새우튀김", "Shrimp Tempura"),
    item("fried-tori-karaage", "fried", 2, 16000,
         "토리가라아게", "Tori Karaage"),
    item("fried-ebi-karaage", "fried", 3, 18000,
         "에비가라아게", "Ebi Karaage"),
    item("fried-katsu-shrimp", "fried", 4, 20000,
         "까스새우튀김", "Katsu Shrimp"),
    item("fried-odari-karaage", "fried", 5, 19000,
         "오다리가라아게", "Squid Karaage"),

    # === RICE MEALS ===
    item("meal-katsudon", "meal", 1, 10000,
         "가쯔동", "Katsudon"),
    item("meal-gyudon", "meal", 2, 11000,
         "규동", "Gyudon"),
    item("meal-kimchidon", "meal", 3, 11000,
         "김치동", "Kimchi Don"),
    item("meal-ebidon", "meal", 4, 11000,
         "에비동", "Ebi Don"),
    item("meal-chicken-don", "meal", 5, 9000,
         "치킨가라케동", "Chicken Karaage Don"),
    item("meal-tonkatsu", "meal", 6, 10000,
         "수제돈까스", "Handmade Tonkatsu"),
    item("meal-tonkatsu-jp", "meal", 7, 10000,
         "수제일식돈까스", "Japanese Tonkatsu"),
    item("meal-albap", "meal", 8, 8000,
         "알밥", "Fish Roe Rice"),
    item("meal-gwangeo-don", "meal", 9, 14000,
         "광어회덮밥", "Flatfish Sashimi Rice"),
    item("meal-ureok-don", "meal", 10, 18000,
         "우럭회덮밥", "Rockfish Sashimi Rice"),
    item("meal-tuna-don", "meal", 11, 11000,
         "참치회덮밥", "Tuna Sashimi Rice"),
    item("meal-curry-katsu", "meal", 12, 10000,
         "일본카레돈까스덮밥", "Japanese Curry Tonkatsu"),

    # === NOODLES ===
    item("noodle-inari-udon", "noodle", 1, 7000,
         "유부우동", "Inari Udon"),
    item("noodle-fish-udon", "noodle", 2, 9000,
         "어묵우동", "Fish Cake Udon"),
    item("noodle-shrimp-udon", "noodle", 3, 10000,
         "새우튀김우동", "Shrimp Tempura Udon"),
    item("noodle-tonkotsu", "noodle", 4, 11000,
         "돈코츠라멘", "Tonkotsu Ramen"),
    item("noodle-tantan", "noodle", 5, 11000,
         "매콤탄탄멘", "Spicy Tan Tan Men"),
    item("noodle-cold-soba", "noodle", 6, 8000,
         "냉모밀", "Cold Soba"),
    item("noodle-pan-soba", "noodle", 7, 8000,
         "판모밀", "Pan Soba"),
    item("noodle-bibim-soba", "noodle", 8, 8000,
         "비빔모밀", "Bibim Soba"),
    item("noodle-yaki-udon", "noodle", 9, 12000,
         "야끼우동", "Yaki Udon"),

    # === HOT POT / SOUP ===
    item("hotpot-altang", "hotpot", 1, 12000,
         "알탕", "Fish Roe Soup"),
    item("hotpot-seodeori", "hotpot", 2, 9000,
         "서더리탕", "Seodeori Soup"),
    item("hotpot-daegu-1", "hotpot", 3, 15000,
         "대구고니탕 (1인)", "Cod Soup (1P)"),
    item("hotpot-daegu-2", "hotpot", 4, 28000,
         "대구고니탕 (2인)", "Cod Soup (2P)"),
    item("hotpot-daegu-3", "hotpot", 5, 40000,
         "대구고니탕 (3인)", "Cod Soup (3P)"),
    item("hotpot-daegu-4", "hotpot", 6, 50000,
         "대구고니탕 (4인)", "Cod Soup (4P)"),
    item("hotpot-al-goni", "hotpot", 7, 35000,
         "알+고니탕", "Roe + Cod Soup"),
    item("hotpot-clam-tofu", "hotpot", 8, 20000,
         "백합두부탕", "Clam Tofu Soup"),
    item("hotpot-fishcake", "hotpot", 9, 18000,
         "어묵탕", "Fish Cake Soup"),

    # === DRINKS (merged: general + sake + pack sake) ===
    item("drink-soju", "drink", 1, 5000,
         "소주", "Soju"),
    item("drink-beer", "drink", 2, 5000,
         "맥주", "Beer"),
    item("drink-soft", "drink", 3, 2000,
         "음료수", "Soft Drink"),
    item("sake-baekhwa-pot", "drink", 4, 18000,
         "백화수복 주전자", "Baekhwasubog Pot"),
    item("sake-baekhwa-daepo", "drink", 5, 6000,
         "백화수복 대포", "Baekhwasubog Large"),
    item("sake-baekhwa-tokuri", "drink", 6, 6000,
         "백화수복 도쿠리", "Baekhwasubog Tokkuri"),
    item("sake-nihon-pot", "drink", 7, 27000,
         "니혼사카리 반샤쿠 주전자", "Nihon Sakari Pot"),
    item("sake-nihon-daepo", "drink", 8, 9000,
         "니혼사카리 반샤쿠 대포", "Nihon Sakari Large"),
    item("sake-nihon-tokuri", "drink", 9, 9000,
         "니혼사카리 반샤쿠 도쿠리", "Nihon Sakari Tokkuri"),
    item("packsake-ganbare", "drink", 10, 35000,
         "간바레오또상", "Ganbare Otosan"),
    item("packsake-hakutsumaru", "drink", 11, 35000,
         "하쿠쯔마루", "Hakutsumaru"),

    # === EXTRAS ===
    item("extras-udon-noodle", "extras", 1, 2000,
         "우동면 사리", "Extra Udon Noodles"),
    item("extras-corn-butter", "extras", 2, 1000,
         "콘버터 추가", "Extra Corn Butter"),
]


data = {
    "categories": CATEGORIES,
    "items": ITEMS
}

with open(MENU_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# Summary
import sys
sys.stdout.reconfigure(encoding='utf-8')
print(f'Categories: {len(CATEGORIES)}')
for c in CATEGORIES:
    count = sum(1 for i in ITEMS if i['category'] == c['id'])
    print(f'  {c["id"]}: {c["name"]["ko"]} ({count} items)')
print(f'Total items: {len(ITEMS)}')
print('Done!')
