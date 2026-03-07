"""
Update menu.json with new category structure and roll descriptions.
Changes:
- Reorder/rename categories per new structure
- Remove lunch-special category, merge into set
- Add Tiger Roll and Bay Island Roll
- Remove Bacon Roll (not in new menu)
- Update all roll descriptions with real ingredients
- Rename dish -> signature
- Add hotpot and extras categories
"""

import json
from pathlib import Path
from datetime import datetime

MENU_PATH = Path(__file__).parent / 'data' / 'menu.json'
NOW = datetime.now().isoformat(timespec='seconds') + 'Z'

with open(MENU_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

# --- New categories ---
NEW_CATEGORIES = [
    {"id": "set", "sort": 1, "name": {
        "ko": "세트메뉴 / 코스", "en": "Set Menu / Course",
        "zh": "套餐/套餐", "ja": "セットメニュー/コース",
        "vi": "Set / Course", "th": "เซ็ตเมนู/คอร์ส",
        "ne": "सेट मेनु/कोर्स", "ru": "Сет-меню/Курс"
    }},
    {"id": "sashimi", "sort": 2, "name": {
        "ko": "사시미 / 회", "en": "Sashimi / Raw Fish",
        "zh": "生鱼片", "ja": "刺身",
        "vi": "Sashimi", "th": "ซาชิมิ",
        "ne": "साशिमी", "ru": "Сашими"
    }},
    {"id": "sushi", "sort": 3, "name": {
        "ko": "초밥", "en": "Sushi",
        "zh": "寿司", "ja": "寿司",
        "vi": "Sushi", "th": "ซูชิ",
        "ne": "सुशी", "ru": "Суши"
    }},
    {"id": "roll", "sort": 4, "name": {
        "ko": "롤", "en": "Roll",
        "zh": "卷", "ja": "ロール",
        "vi": "Cuốn", "th": "โรล",
        "ne": "रोल", "ru": "Роллы"
    }},
    {"id": "signature", "sort": 5, "name": {
        "ko": "특선 요리", "en": "Signature Dishes",
        "zh": "招牌菜", "ja": "特選料理",
        "vi": "Món đặc biệt", "th": "เมนูเด็ด",
        "ne": "विशेष परिकार", "ru": "Фирменные блюда"
    }},
    {"id": "grill", "sort": 6, "name": {
        "ko": "구이", "en": "Grilled",
        "zh": "烤物", "ja": "焼き物",
        "vi": "Nướng", "th": "ย่าง",
        "ne": "ग्रिल", "ru": "Гриль"
    }},
    {"id": "fried", "sort": 7, "name": {
        "ko": "튀김", "en": "Fried",
        "zh": "炸物", "ja": "揚げ物",
        "vi": "Chiên", "th": "ทอด",
        "ne": "तलेको", "ru": "Жареное"
    }},
    {"id": "meal", "sort": 8, "name": {
        "ko": "식사", "en": "Rice Meals",
        "zh": "饭类", "ja": "ご飯もの",
        "vi": "Cơm", "th": "ข้าว",
        "ne": "भात", "ru": "Рис"
    }},
    {"id": "noodle", "sort": 9, "name": {
        "ko": "면류", "en": "Noodles",
        "zh": "面类", "ja": "麺類",
        "vi": "Mì", "th": "เส้น",
        "ne": "चाउमिन", "ru": "Лапша"
    }},
    {"id": "hotpot", "sort": 10, "name": {
        "ko": "전골 / 탕", "en": "Hot Pot / Soup",
        "zh": "火锅/汤", "ja": "鍋/スープ",
        "vi": "Lẩu/Canh", "th": "หม้อไฟ/ซุป",
        "ne": "हट पट/सुप", "ru": "Горячий горшок/Суп"
    }},
    {"id": "drink", "sort": 11, "name": {
        "ko": "주류", "en": "Drinks",
        "zh": "酒水", "ja": "ドリンク",
        "vi": "Đồ uống", "th": "เครื่องดื่ม",
        "ne": "पेय", "ru": "Напитки"
    }},
    {"id": "extras", "sort": 12, "name": {
        "ko": "추가 / 사이드", "en": "Extras",
        "zh": "附加", "ja": "サイドメニュー",
        "vi": "Thêm", "th": "เพิ่มเติม",
        "ne": "अतिरिक्त", "ru": "Дополнительно"
    }},
]

data['categories'] = NEW_CATEGORIES

# --- Move lunch-special items into set category ---
for item in data['items']:
    if item['category'] == 'lunch-special':
        item['category'] = 'set'
        item['sort'] = 10 + item['sort']  # after existing set items

# --- Move dish items to signature ---
for item in data['items']:
    if item['category'] == 'dish':
        item['category'] = 'signature'

# --- Remove Bacon Roll ---
data['items'] = [i for i in data['items'] if i['id'] != 'roll-bacon']

# --- Update roll descriptions with real ingredients ---
ROLL_UPDATES = {
    'roll-california': {
        'description': {
            'ko': '맛살, 오이, 날치알',
            'en': 'Crab stick, cucumber, flying fish roe',
            'zh': '蟹棒, 黄瓜, 飞鱼籽',
            'ja': 'カニカマ, きゅうり, とびこ',
            'vi': 'Thanh cua, dưa chuột, trứng cá chuồn',
            'th': 'ปูอัด, แตงกวา, ไข่ปลาบิน',
            'ne': 'क्र्याब स्टिक, काँक्रो, फ्लाइङ फिश रो',
            'ru': 'Крабовая палочка, огурец, икра летучей рыбы'
        }
    },
    'roll-crunch': {
        'description': {
            'ko': '새우튀김, 맛살, 오이, 무순',
            'en': 'Shrimp tempura, crab stick, cucumber, radish sprout',
            'zh': '虾天妇罗, 蟹棒, 黄瓜, 萝卜苗',
            'ja': '海老天ぷら, カニカマ, きゅうり, かいわれ大根',
            'vi': 'Tôm tempura, thanh cua, dưa chuột, mầm cải',
            'th': 'กุ้งเทมปุระ, ปูอัด, แตงกวา, ถั่วงอก',
            'ne': 'झिँगा टेम्पुरा, क्र्याब स्टिक, काँक्रो, मुला स्प्राउट',
            'ru': 'Темпура креветки, крабовая палочка, огурец, ростки редиса'
        }
    },
    'roll-lionking': {
        'description': {
            'ko': '연어, 맛살, 오이, 양파, 날치알, 스페셜소스',
            'en': 'Salmon, crab stick, cucumber, onion, flying fish roe, special sauce',
            'zh': '三文鱼, 蟹棒, 黄瓜, 洋葱, 飞鱼籽, 特制酱',
            'ja': 'サーモン, カニカマ, きゅうり, 玉ねぎ, とびこ, 特製ソース',
            'vi': 'Cá hồi, thanh cua, dưa chuột, hành, trứng cá, sốt đặc biệt',
            'th': 'แซลมอน, ปูอัด, แตงกวา, หัวหอม, ไข่ปลาบิน, ซอสพิเศษ',
            'ne': 'सल्मन, क्र्याब स्टिक, काँक्रो, प्याज, फ्लाइङ फिश रो, स्पेशल सस',
            'ru': 'Лосось, крабовая палочка, огурец, лук, икра, спец. соус'
        }
    },
    'roll-alaska': {
        'description': {
            'ko': '연어, 맛살, 오이, 양파, 날치알, 스페셜소스',
            'en': 'Salmon, crab stick, cucumber, onion, flying fish roe, special sauce',
            'zh': '三文鱼, 蟹棒, 黄瓜, 洋葱, 飞鱼籽, 特制酱',
            'ja': 'サーモン, カニカマ, きゅうり, 玉ねぎ, とびこ, 特製ソース',
            'vi': 'Cá hồi, thanh cua, dưa chuột, hành, trứng cá, sốt đặc biệt',
            'th': 'แซลมอน, ปูอัด, แตงกวา, หัวหอม, ไข่ปลาบิน, ซอสพิเศษ',
            'ne': 'सल्मन, क्र्याब स्टिक, काँक्रो, प्याज, फ्लाइङ फिश रो, स्पेशल सस',
            'ru': 'Лосось, крабовая палочка, огурец, лук, икра, спец. соус'
        }
    },
    'roll-dragon': {
        'description': {
            'ko': '바다장어, 맛살, 오이, 스페셜소스',
            'en': 'Sea eel, crab stick, cucumber, special sauce',
            'zh': '海鳗, 蟹棒, 黄瓜, 特制酱',
            'ja': 'アナゴ, カニカマ, きゅうり, 特製ソース',
            'vi': 'Lươn biển, thanh cua, dưa chuột, sốt đặc biệt',
            'th': 'ปลาไหลทะเล, ปูอัด, แตงกวา, ซอสพิเศษ',
            'ne': 'समुद्री इल, क्र्याब स्टिक, काँक्रो, स्पेशल सस',
            'ru': 'Морской угорь, крабовая палочка, огурец, спец. соус'
        }
    },
}

for item in data['items']:
    if item['id'] in ROLL_UPDATES:
        for key, val in ROLL_UPDATES[item['id']].items():
            item[key] = val
        item['updated_at'] = NOW

# --- Add new roll items: Tiger Roll, Bay Island Roll ---
NEW_ROLLS = [
    {
        "id": "roll-tiger",
        "category": "roll",
        "sort": 2,  # after California
        "price": 13000,
        "active": True,
        "updated_at": NOW,
        "image": "images/placeholder.webp",
        "name": {
            "ko": "타이거롤", "en": "Tiger Roll",
            "zh": "虎卷", "ja": "タイガーロール",
            "vi": "Cuốn Tiger", "th": "ไทเกอร์โรล",
            "ne": "टाइगर रोल", "ru": "Тайгер ролл"
        },
        "description": {
            "ko": "새우튀김, 새우, 오이",
            "en": "Shrimp tempura, shrimp, cucumber",
            "zh": "虾天妇罗, 虾, 黄瓜",
            "ja": "海老天ぷら, エビ, きゅうり",
            "vi": "Tôm tempura, tôm, dưa chuột",
            "th": "กุ้งเทมปุระ, กุ้ง, แตงกวา",
            "ne": "झिँगा टेम्पुरा, झिँगा, काँक्रो",
            "ru": "Темпура креветки, креветка, огурец"
        }
    },
    {
        "id": "roll-bayisland",
        "category": "roll",
        "sort": 3,  # after Tiger
        "price": 14000,
        "active": True,
        "updated_at": NOW,
        "image": "images/placeholder.webp",
        "name": {
            "ko": "베이아일랜드롤", "en": "Bay Island Roll",
            "zh": "海湾岛卷", "ja": "ベイアイランドロール",
            "vi": "Cuốn Bay Island", "th": "เบย์ไอแลนด์โรล",
            "ne": "बे आइल्यान्ड रोल", "ru": "Бэй Айленд ролл"
        },
        "description": {
            "ko": "바다장어, 새우, 오이, 날치알, 스페셜소스",
            "en": "Sea eel, shrimp, cucumber, flying fish roe, special sauce",
            "zh": "海鳗, 虾, 黄瓜, 飞鱼籽, 特制酱",
            "ja": "アナゴ, エビ, きゅうり, とびこ, 特製ソース",
            "vi": "Lươn biển, tôm, dưa chuột, trứng cá, sốt đặc biệt",
            "th": "ปลาไหลทะเล, กุ้ง, แตงกวา, ไข่ปลาบิน, ซอสพิเศษ",
            "ne": "समुद्री इल, झिँगा, काँक्रो, फ्लाइङ फिश रो, स्पेशल सस",
            "ru": "Морской угорь, креветка, огурец, икра, спец. соус"
        }
    },
]

data['items'].extend(NEW_ROLLS)

# --- Re-sort roll items: California(1), Tiger(2), BayIsland(3), Crunch(4), LionKing(5), Alaska(6), Dragon(7) ---
ROLL_SORT = {
    'roll-california': 1,
    'roll-tiger': 2,
    'roll-bayisland': 3,
    'roll-crunch': 4,
    'roll-lionking': 5,
    'roll-alaska': 6,
    'roll-dragon': 7,
}
for item in data['items']:
    if item['id'] in ROLL_SORT:
        item['sort'] = ROLL_SORT[item['id']]

# --- Save ---
with open(MENU_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# Count
cats = {c['id']: c['name']['ko'] for c in data['categories']}
item_count = len(data['items'])
cat_count = len(data['categories'])
print(f'Categories: {cat_count}')
for c in data['categories']:
    count = sum(1 for i in data['items'] if i['category'] == c['id'])
    print(f'  {c["id"]}: {c["name"]["ko"]} ({count} items)')
print(f'Total items: {item_count}')
print('Done!')
