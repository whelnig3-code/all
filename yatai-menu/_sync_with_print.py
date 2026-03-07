"""
Sync menu.json with print-v6-landscape-2p.html (source of truth)
"""
import json
from datetime import datetime, timezone

MENU_PATH = r'C:\Users\user\yatai-menu\data\menu.json'
NOW = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

with open(MENU_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

items_by_id = {i['id']: i for i in data['items']}

def update(item_id, **kwargs):
    if item_id not in items_by_id:
        print(f'  WARNING: {item_id} not found!')
        return
    item = items_by_id[item_id]
    if 'ko' in kwargs:
        item['name']['ko'] = kwargs['ko']
    if 'en' in kwargs:
        item['name']['en'] = kwargs['en']
    if 'price' in kwargs:
        item['price'] = kwargs['price']
    if 'desc_ko' in kwargs:
        if 'description' not in item:
            item['description'] = {}
        item['description']['ko'] = kwargs['desc_ko']
    if 'desc_en' in kwargs:
        if 'description' not in item:
            item['description'] = {}
        item['description']['en'] = kwargs['desc_en']
    if 'recommended' in kwargs:
        item['recommended'] = kwargs['recommended']
    if 'active' in kwargs:
        item['active'] = kwargs['active']
    item['updated_at'] = NOW
    print(f'  Updated: {item_id} -> {item["name"]["ko"]}')

def add_item(item_data):
    if item_data['id'] in items_by_id:
        print(f'  SKIP (exists): {item_data["id"]}')
        return
    item_data['updated_at'] = NOW
    item_data['image'] = 'images/placeholder.webp'
    data['items'].append(item_data)
    items_by_id[item_data['id']] = item_data
    print(f'  Added: {item_data["id"]} ({item_data["name"]["ko"]})')

print('=== Fixing names & prices to match print ===')

# --- SASHIMI ---
update('sashimi-salmon', ko='연어회 (300g)', en='Salmon Sashimi (300g)', price=36000)
update('sashimi-mulhoe', ko='광어물회 (1인)', en='Flatfish Mulhoe (1p)')
update('sashimi-side', ko='매운탕 추가', en='Add Spicy Fish Stew', price=7000)

# --- SUSHI ---
update('sushi-shrimp-soy', ko='간장새우초밥', en='Soy Shrimp Sushi', price=19000)
update('sushi-egg', ko='계란초밥 (10pcs)', en='Egg Sushi (10pcs)')

# --- SUSHI SINGLE ---
update('single-egg', ko='계란초밥', en='Egg Sushi')

# --- ROLL (fix typos to match print) ---
update('roll-california', ko='켈리포니아롤', en='California Roll')
update('roll-alaska', ko='알레스카롤', en='Alaska Roll')
update('roll-dragon', ko='드레곤롤', en='Dragon Roll')

# --- SIGNATURE ---
update('sig-sichuan-wing', ko='사천 닭날개', en='Sichuan Chicken Wings')
update('sig-shrimp-soy', ko='새우장 (10pcs)', en='Soy Marinated Shrimp (10pcs)', price=17000)

# --- GRILL ---
update('grill-mero', ko='메로구이 (200g)', en='Grilled Mero (200g)')
update('grill-shishamo', ko='시샤모구이 (10마리)', en='Grilled Shishamo (10pcs)')

# --- FRIED ---
update('fried-tori-karaage', ko='토리가라아게 (일본식닭다리살튀김)', en='Tori Karaage (Japanese Fried Chicken)')
update('fried-ebi-karaage', ko='새우튀김 (튀김가루)', en='Shrimp Tempura (Batter)', recommended=True)
update('fried-katsu-shrimp', ko='까스새우튀김 (빵가루)', en='Katsu Shrimp (Breaded)')
update('fried-odari-karaage', ko='오다리가라아게 (일본식오징어다리튀김)', en='Squid Karaage (Fried Squid Legs)')

# --- MEAL (Donburi/식사) ---
update('meal-katsudon', ko='가쯔동 (돈까스덮밥)', en='Katsudon (Pork Cutlet Rice Bowl)')
update('meal-gyudon', ko='규동 (소고기덮밥)', en='Gyudon (Beef Rice Bowl)')
update('meal-kimchidon', ko='김치돈까스나베', en='Kimchi Tonkatsu Nabe')
update('meal-ebidon', ko='에비동 (새우튀김덮밥)', en='Ebidon (Shrimp Tempura Rice Bowl)')
update('meal-tonkatsu', ko='수제돈까스', en='Handmade Tonkatsu', recommended=True,
       desc_ko='소스가 뿌려져 있어요', desc_en='Sauce is drizzled on top')
update('meal-tonkatsu-jp', ko='수제일식돈까스', en='Japanese Style Tonkatsu',
       desc_ko='소스를 찍어 먹어요', desc_en='Dip in sauce')
update('meal-albap', ko='뚝배기 알밥', en='Stone Pot Fish Roe Rice')
update('meal-curry-katsu', ko='돈까스카레 덮밥', en='Curry Katsu Rice Bowl')

# --- NOODLE ---
update('noodle-shrimp-udon', ko='왕새우튀김 우동', en='King Shrimp Tempura Udon')
update('noodle-bibim-soba', ko='비빔모밀국수', en='Bibim Soba Noodles', price=9000)

# --- HOTPOT ---
update('hotpot-seodeori', ko='서더리전골', en='Seodeori Hot Pot', price=20000)
update('hotpot-al-goni', ko='알+고니전골', en='Roe + Innards Hot Pot')

# --- SAKE (match print names) ---
update('sake-baekhwa-pot', ko='주전자', en='Pot (Baekhwa)', price=20000)
update('sake-baekhwa-daepo', ko='대포', en='Large Cup (Baekhwa)', price=7000)
update('sake-baekhwa-tokuri', ko='도쿠리', en='Tokuri (Baekhwa)', price=7000)
update('sake-nihon-pot', ko='주전자', en='Pot (Nihon)', price=29000)
update('sake-nihon-daepo', ko='대포', en='Large Cup (Nihon)', price=10000)
update('sake-nihon-tokuri', ko='도쿠리', en='Tokuri (Nihon)', price=10000)
update('packsake-ganbare', ko='간바래오또상 (900ml)', en='Ganbare Otousan (900ml)')
update('packsake-hakutsumaru', ko='하쿠쯔마루 (900ml)', en='Hakutsumaru (900ml)')

# --- DRINK (split) ---
update('drink-soft', ko='콜라', en='Coke')

# --- SET menu names ---
update('set-menu-a', ko='세트 A', en='Set A',
       desc_ko='초밥7pcs + 유부우동', desc_en='Sushi 7pcs + Inari Udon')
update('set-menu-b', ko='세트 B', en='Set B', recommended=True,
       desc_ko='돈까스 + 초밥6pcs + 소우동', desc_en='Tonkatsu + Sushi 6pcs + Small Udon')
update('set-menu-c', ko='세트 C', en='Set C',
       desc_ko='켈리포니아롤 + 초밥5pcs', desc_en='California Roll + Sushi 5pcs')
update('set-menu-d', ko='세트 D', en='Set D',
       desc_ko='크런치롤 + 초밥5pcs', desc_en='Crunch Roll + Sushi 5pcs')

# --- DEACTIVATE items not on print ---
update('set-ilpum', active=False)  # 일품요리세트 - not on print v6

print('\n=== Adding missing items ===')

# 날치알마끼
add_item({
    'id': 'sushi-tobiko-maki', 'category': 'sushi', 'sort': 10, 'active': True,
    'recommended': False, 'price': 6000,
    'name': {'ko': '날치알마끼 (4pcs)', 'en': 'Tobiko Maki (4pcs)',
             'zh': '飞鱼籽卷 (4个)', 'ja': 'とびこ巻き (4個)',
             'vi': 'Maki trung ca chuon (4)', 'th': 'โทบิโกะมากิ (4)',
             'ne': 'तोबिको माकी (४)', 'ru': 'Тобико маки (4шт)'},
    'description': {}
})

# 사케동
add_item({
    'id': 'meal-sakedon', 'category': 'meal', 'sort': 5, 'active': True,
    'recommended': True, 'price': 15000,
    'name': {'ko': '사케동 (일식연어덮밥:간장소스)', 'en': 'Sakedon (Salmon Rice Bowl)',
             'zh': '三文鱼盖饭 (酱油)', 'ja': 'サケ丼 (醤油ソース)',
             'vi': 'Com ca hoi (sot tuong)', 'th': 'ซาเกะด้ง (ซอสโชยุ)',
             'ne': 'साकेडन (सोया सस)', 'ru': 'Сакэдон (соевый соус)'},
    'description': {}
})

# 지라시스시
add_item({
    'id': 'meal-chirashi', 'category': 'meal', 'sort': 6, 'active': True,
    'recommended': False, 'price': 15000,
    'name': {'ko': '지라시스시 (일식회덮밥:간장소스)', 'en': 'Chirashi Sushi (Sashimi Rice Bowl)',
             'zh': '散寿司 (刺身盖饭)', 'ja': 'ちらし寿司 (醤油ソース)',
             'vi': 'Chirashi Sushi (com sashimi)', 'th': 'จิราชิซูชิ (ซาชิมิด้ง)',
             'ne': 'चिराशी सुशी (साशिमी भात)', 'ru': 'Тирасидзуси (сашими дон)'},
    'description': {}
})

# 광어 생선까스
add_item({
    'id': 'meal-fish-katsu', 'category': 'meal', 'sort': 7, 'active': True,
    'recommended': False, 'price': 13000,
    'name': {'ko': '광어 생선까스', 'en': 'Flatfish Katsu',
             'zh': '比目鱼排', 'ja': 'ヒラメフライ',
             'vi': 'Ca bon chien xu', 'th': 'ปลากวางอคัตสึ',
             'ne': 'फ्ल्याटफिश काट्सु', 'ru': 'Камбала кацу'},
    'description': {}
})

# 서더리 탕 (식사용, 전골과 다름)
add_item({
    'id': 'meal-seodeori', 'category': 'meal', 'sort': 12, 'active': True,
    'recommended': False, 'price': 9000,
    'name': {'ko': '서더리 탕', 'en': 'Seodeori Soup',
             'zh': '鱼杂汤', 'ja': 'ソドリスープ',
             'vi': 'Canh ca seodeori', 'th': 'ซุปซอดอรี',
             'ne': 'सियोदोरी सुप', 'ru': 'Суп содори'},
    'description': {}
})

# 대구지리탕
add_item({
    'id': 'hotpot-daegu-jiri', 'category': 'hotpot', 'sort': 6, 'active': True,
    'recommended': False, 'price': 15000,
    'name': {'ko': '대구지리탕 (1인)', 'en': 'Cod Clear Soup (1p)',
             'zh': '鳕鱼清汤 (1人)', 'ja': 'タラちり鍋 (1人前)',
             'vi': 'Canh ca tuyet trong (1)', 'th': 'ซุปปลาค็อดใส (1 คน)',
             'ne': 'कड क्लियर सुप (१)', 'ru': 'Прозрачный суп из трески (1)'},
    'description': {}
})

# 청하
add_item({
    'id': 'drink-cheongha', 'category': 'drink', 'sort': 3, 'active': True,
    'recommended': False, 'price': 7000,
    'name': {'ko': '청하', 'en': 'Cheongha (Rice Wine)',
             'zh': '清河清酒', 'ja': 'チョンハ',
             'vi': 'Cheongha', 'th': 'ชองฮา',
             'ne': 'चियोङहा', 'ru': 'Чхонха'},
    'description': {}
})

# 스프라이트
add_item({
    'id': 'drink-sprite', 'category': 'drink', 'sort': 5, 'active': True,
    'recommended': False, 'price': 2000,
    'name': {'ko': '스프라이트', 'en': 'Sprite',
             'zh': '雪碧', 'ja': 'スプライト',
             'vi': 'Sprite', 'th': 'สไปรท์',
             'ne': 'स्प्राइट', 'ru': 'Спрайт'},
    'description': {}
})

# 소우동 추가
add_item({
    'id': 'extras-small-udon', 'category': 'extras', 'sort': 2, 'active': True,
    'recommended': False, 'price': 2500,
    'name': {'ko': '소우동 추가', 'en': 'Add Small Udon',
             'zh': '加小乌冬', 'ja': '小うどん追加',
             'vi': 'Them udon nho', 'th': 'เพิ่มอุด้งเล็ก',
             'ne': 'सानो उडोन थप', 'ru': 'Доп. мини удон'},
    'description': {}
})

# 공기밥 추가
add_item({
    'id': 'extras-rice-bowl', 'category': 'extras', 'sort': 4, 'active': True,
    'recommended': False, 'price': 1000,
    'name': {'ko': '공기밥 추가', 'en': 'Add Rice Bowl',
             'zh': '加米饭', 'ja': 'ご飯追加',
             'vi': 'Them com', 'th': 'เพิ่มข้าว',
             'ne': 'भात थप', 'ru': 'Доп. рис'},
    'description': {}
})

# Save
with open(MENU_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# Verify
active_count = sum(1 for i in data['items'] if i.get('active', True))
total = len(data['items'])
print(f'\n=== Done ===')
print(f'Total items: {total}')
print(f'Active items: {active_count}')
