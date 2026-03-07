"""
Add missing items (Set Menu A~D, Lunch Special) and
add 6-language translations (zh/ja/vi/th/ne/ru) to ALL items.
"""
import json
from datetime import datetime

MENU_PATH = r'C:\Users\user\yatai-menu\data\menu.json'

with open(MENU_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

NOW = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

# ============================================================
# 1. Add "lunch" category if not exists
# ============================================================
lunch_cat_exists = any(c['id'] == 'lunch' for c in data['categories'])
if not lunch_cat_exists:
    data['categories'].append({
        "id": "lunch",
        "sort": 0,  # top
        "name": {
            "ko": "점심특선",
            "en": "Lunch Special",
            "zh": "午餐特惠",
            "ja": "ランチスペシャル",
            "vi": "Bua trua dac biet",
            "th": "สเปเชียลมื้อเที่ยง",
            "ne": "लन्च स्पेशल",
            "ru": "Ланч"
        }
    })

# ============================================================
# 2. Add missing items
# ============================================================
existing_ids = {i['id'] for i in data['items']}

new_items = [
    {
        "id": "lunch-donkatsu",
        "category": "lunch",
        "sort": 1,
        "active": True,
        "recommended": True,
        "price": 10000,
        "image": "images/placeholder.webp",
        "available_time": {"start": "11:00", "end": "15:00"},
        "name": {
            "ko": "돈까스백반",
            "en": "Tonkatsu Set Meal",
            "zh": "猪排定食",
            "ja": "とんかつ定食",
            "vi": "Com Tonkatsu",
            "th": "ข้าวทงคัตสึ",
            "ne": "टोन्काट्सु सेट",
            "ru": "Тонкацу обед"
        },
        "description": {
            "ko": "돈까스 + 비빔국수 + 된장찌개 + 샐러드 + 밥 + 반찬",
            "en": "Tonkatsu + Bibim Noodles + Doenjang Soup + Salad + Rice + Side",
            "zh": "猪排+拌面+大酱汤+沙拉+饭+小菜",
            "ja": "とんかつ+ビビン麺+テンジャンチゲ+サラダ+ご飯+おかず",
            "vi": "Tonkatsu + Mi tron + Canh tuong + Salad + Com + Mon phu",
            "th": "ทงคัตสึ+บะหมี่+ซุปเต้าเจี้ยว+สลัด+ข้าว+เครื่องเคียง",
            "ne": "टोन्काट्सु+बिबिम नुडल्स+दोएन्जाङ सुप+सलाद+भात+साइड",
            "ru": "Тонкацу+Лапша+Суп+Салат+Рис+Гарнир"
        },
        "updated_at": NOW
    },
    {
        "id": "set-menu-a",
        "category": "set",
        "sort": 5,
        "active": True,
        "recommended": False,
        "price": 15000,
        "image": "images/placeholder.webp",
        "name": {
            "ko": "세트 A (초밥7pcs + 우동)",
            "en": "Set A (Sushi 7pcs + Udon)",
            "zh": "A套餐 (寿司7个+乌冬)",
            "ja": "Aセット (寿司7貫+うどん)",
            "vi": "Set A (Sushi 7 + Udon)",
            "th": "เซ็ต A (ซูชิ 7 + อุด้ง)",
            "ne": "सेट A (सुशी ७ + उडोन)",
            "ru": "Сет A (Суши 7шт + Удон)"
        },
        "description": {
            "ko": "초밥 7pcs + 우동",
            "en": "Sushi 7pcs + Udon",
            "zh": "寿司7个+乌冬面",
            "ja": "寿司7貫+うどん",
            "vi": "Sushi 7 mieng + Udon",
            "th": "ซูชิ 7 ชิ้น + อุด้ง",
            "ne": "सुशी ७ पिस + उडोन",
            "ru": "Суши 7шт + Удон"
        },
        "updated_at": NOW
    },
    {
        "id": "set-menu-b",
        "category": "set",
        "sort": 6,
        "active": True,
        "recommended": False,
        "price": 15000,
        "image": "images/placeholder.webp",
        "name": {
            "ko": "세트 B (돈까스 + 초밥6pcs + 반우동)",
            "en": "Set B (Tonkatsu + Sushi 6pcs + Half Udon)",
            "zh": "B套餐 (猪排+寿司6个+半乌冬)",
            "ja": "Bセット (とんかつ+寿司6貫+半うどん)",
            "vi": "Set B (Tonkatsu + Sushi 6 + Udon nho)",
            "th": "เซ็ต B (ทงคัตสึ+ซูชิ 6+อุด้งเล็ก)",
            "ne": "सेट B (टोन्काट्सु+सुशी ६+आधा उडोन)",
            "ru": "Сет B (Тонкацу+Суши 6шт+Удон)"
        },
        "description": {
            "ko": "돈까스 + 초밥 6pcs + 반우동",
            "en": "Tonkatsu + Sushi 6pcs + Half Udon",
            "zh": "猪排+寿司6个+半碗乌冬面",
            "ja": "とんかつ+寿司6貫+半うどん",
            "vi": "Tonkatsu + Sushi 6 + Udon nho",
            "th": "ทงคัตสึ + ซูชิ 6 ชิ้น + อุด้งเล็ก",
            "ne": "टोन्काट्सु + सुशी ६ + आधा उडोन",
            "ru": "Тонкацу + Суши 6шт + Удон (половина)"
        },
        "updated_at": NOW
    },
    {
        "id": "set-menu-c",
        "category": "set",
        "sort": 7,
        "active": True,
        "recommended": False,
        "price": 15000,
        "image": "images/placeholder.webp",
        "name": {
            "ko": "세트 C (캘리포니아롤 + 초밥5pcs)",
            "en": "Set C (California Roll + Sushi 5pcs)",
            "zh": "C套餐 (加州卷+寿司5个)",
            "ja": "Cセット (カリフォルニアロール+寿司5貫)",
            "vi": "Set C (California Roll + Sushi 5)",
            "th": "เซ็ต C (แคลิฟอร์เนียโรล+ซูชิ 5)",
            "ne": "सेट C (क्यालिफोर्निया रोल+सुशी ५)",
            "ru": "Сет C (Калифорния+Суши 5шт)"
        },
        "description": {
            "ko": "캘리포니아롤 + 초밥 5pcs",
            "en": "California Roll + Sushi 5pcs",
            "zh": "加州卷+寿司5个",
            "ja": "カリフォルニアロール+寿司5貫",
            "vi": "California Roll + Sushi 5 mieng",
            "th": "แคลิฟอร์เนียโรล + ซูชิ 5 ชิ้น",
            "ne": "क्यालिफोर्निया रोल + सुशी ५",
            "ru": "Калифорния ролл + Суши 5шт"
        },
        "updated_at": NOW
    },
    {
        "id": "set-menu-d",
        "category": "set",
        "sort": 8,
        "active": True,
        "recommended": False,
        "price": 15000,
        "image": "images/placeholder.webp",
        "name": {
            "ko": "세트 D (크런치롤 + 초밥5pcs)",
            "en": "Set D (Crunch Roll + Sushi 5pcs)",
            "zh": "D套餐 (脆卷+寿司5个)",
            "ja": "Dセット (クランチロール+寿司5貫)",
            "vi": "Set D (Crunch Roll + Sushi 5)",
            "th": "เซ็ต D (ครันช์โรล+ซูชิ 5)",
            "ne": "सेट D (क्रन्च रोल+सुशी ५)",
            "ru": "Сет D (Кранч+Суши 5шт)"
        },
        "description": {
            "ko": "크런치롤 + 초밥 5pcs",
            "en": "Crunch Roll + Sushi 5pcs",
            "zh": "脆卷+寿司5个",
            "ja": "クランチロール+寿司5貫",
            "vi": "Crunch Roll + Sushi 5 mieng",
            "th": "ครันช์โรล + ซูชิ 5 ชิ้น",
            "ne": "क्रन्च रोल + सुशी ५",
            "ru": "Кранч ролл + Суши 5шт"
        },
        "updated_at": NOW
    }
]

for ni in new_items:
    if ni['id'] not in existing_ids:
        data['items'].append(ni)
        print(f"  Added: {ni['id']} ({ni['name']['ko']})")

# ============================================================
# 3. Add translations to ALL existing items
# ============================================================
translations = {
    # --- SET ---
    'set-ilpum': {
        'name': {'zh': '精品料理套餐', 'ja': '一品料理セット', 'vi': 'Set mon dac biet', 'th': 'เซ็ตอาหารพิเศษ', 'ne': 'विशेष सेट', 'ru': 'Премиум сет'},
        'desc': {'zh': '玉米黄油、沙拉、活鱼生鱼片(大)、牛肉豆芽、明太子蛋卷、日式辣鸡、寿司(10)、烤鱼、蛤蜊豆腐汤', 'ja': 'コーンバター、サラダ、活魚刺身(大)、牛もやし、明太子卵焼き、和風スパイシーチキン、寿司(10貫)、焼き魚、あさり豆腐湯', 'vi': 'Bo bap, salad, sashimi ca song(L), bo gia do, trung mentaiko, ga cay Nhat, sushi(10), ca nuong, canh dau hu ngheu', 'th': 'ข้าวโพดเนย สลัด ซาชิมิปลาสด(L) เนื้อถั่วงอก ไข่เมนไทโกะ ไก่เผ็ดญี่ปุ่น ซูชิ(10) ปลาย่าง ซุปเต้าหู้หอยลาย', 'ne': 'कर्न बटर, सलाद, ताजा साशिमी(L), बीफ स्प्राउट, मेन्टाइको एग रोल, जापानी चिकन, सुशी(१०), ग्रिल्ड फिश, क्ल्याम टोफु सुप', 'ru': 'Корн-баттер, салат, сашими(Б), говядина с ростками, тамагояки ментайко, курица, суши(10), рыба гриль, суп с тофу'}
    },
    'set-yatai-special': {
        'name': {'zh': '屋台特别套餐 (4人)', 'ja': 'ヤタイスペシャル (4人前)', 'vi': 'Yatai Dac biet (4 nguoi)', 'th': 'ยาไตสเปเชียล (4 คน)', 'ne': 'यातै स्पेशल (४ जना)', 'ru': 'Ятай Спешл (4 чел)'},
        'desc': {'zh': '粥、玉米黄油、煎饼、沙拉、什锦天妇罗、寿司(8)、创意卷(8)、柳叶鱼(4)、鸡翅照烧(4)、辣汤、飞鱼籽卷、鸡肉、银杏', 'ja': 'お粥、コーンバター、チヂミ、サラダ、盛り合わせ天ぷら、寿司(8貫)、フュージョンロール(8)、ししゃも(4)、チキンウイング照り焼き(4)、辛い鍋、とびこ巻き、チキン、銀杏', 'vi': 'Chao, bo bap, banh xeo, salad, tempura tong hop, sushi(8), roll(8), shishamo(4), canh ga teriyaki(4), lau cay, maki trung ca, ga, ngan', 'th': 'ข้าวต้ม ข้าวโพดเนย แพนเค้ก สลัด เทมปุระรวม ซูชิ(8) โรล(8) ชิชาโมะ(4) ปีกไก่เทอริยากิ(4) ซุปเผ็ด โทบิโกะมากิ ไก่ แปะก๊วย', 'ne': 'दलिया, कर्न बटर, प्यानकेक, सलाद, मिश्रित टेम्पुरा, सुशी(८), रोल(८), शिशामो(४), चिकन विङ तेरियाकी(४), पिरो सुप, तोबिको माकी, चिकन, गिन्को', 'ru': 'Каша, корн-баттер, блинчик, салат, темпура ассорти, суши(8), ролл(8), шишамо(4), куриные крылья терияки(4), острый суп, тобико маки, курица, гинкго'}
    },
    'set-a': {
        'name': {'zh': '刺身套餐 A', 'ja': '刺身コース A', 'vi': 'Set Sashimi A', 'th': 'เซ็ตซาชิมิ A', 'ne': 'साशिमी सेट A', 'ru': 'Сашими-сет A'},
        'desc': {'zh': '粥、玉米黄油、沙拉、烤蘑菇、乌冬、3种生鱼片、寿司3个、天妇罗3个、银杏、烤贻贝、辣汤、鱼籽饭、卷', 'ja': 'お粥、コーンバター、サラダ、きのこ焼き、うどん、刺身3種、寿司3貫、天ぷら3品、銀杏、ムール貝焼き、辛い鍋、いくら丼、巻き', 'vi': 'Chao, bo bap, salad, nam nuong, udon, sashimi 3 loai, sushi 3, tempura 3, ngan, hong hop nuong, lau cay, com trung ca, maki', 'th': 'ข้าวต้ม ข้าวโพดเนย สลัด เห็ดย่าง อุด้ง ซาชิมิ3ชนิด ซูชิ3 เทมปุระ3 แปะก๊วย หอยแมลงภู่ย่าง ซุปเผ็ด ข้าวไข่ปลา มากิ', 'ne': 'दलिया, कर्न बटर, सलाद, च्याउ ग्रिल, उडोन, साशिमी ३ प्रकार, सुशी ३, टेम्पुरा ३, गिन्को, ग्रिल्ड मसल, पिरो सुप, रो राइस, माकी', 'ru': 'Каша, корн-баттер, салат, грибы гриль, удон, сашими 3 вида, суши 3, темпура 3, гинкго, мидии гриль, острый суп, икра-рис, маки'}
    },
    'set-b': {
        'name': {'zh': '刺身套餐 B', 'ja': '刺身コース B', 'vi': 'Set Sashimi B', 'th': 'เซ็ตซาชิมิ B', 'ne': 'साशिमी सेट B', 'ru': 'Сашими-сет B'},
        'desc': {'zh': 'A套餐 + 鸡翅照烧 + 牛肉豆芽炒', 'ja': 'Aコース + チキンウイング照り焼き + 牛もやし炒め', 'vi': 'Set A + Canh ga teriyaki + Bo xao gia do', 'th': 'เซ็ต A + ปีกไก่เทอริยากิ + เนื้อผัดถั่วงอก', 'ne': 'सेट A + चिकन विङ तेरियाकी + बीफ स्प्राउट', 'ru': 'Сет A + Куриные крылья терияки + Говядина с ростками'}
    },
    # --- SASHIMI ---
    'sashimi-gwangeo': {
        'name': {'zh': '比目鱼刺身', 'ja': 'ヒラメ刺身', 'vi': 'Sashimi ca bon', 'th': 'ซาชิมิปลากวางอ', 'ne': 'फ्ल्याटफिश साशिमी', 'ru': 'Сашими камбала'}
    },
    'sashimi-ureok': {
        'name': {'zh': '石斑鱼刺身', 'ja': 'メバル刺身', 'vi': 'Sashimi ca mu', 'th': 'ซาชิมิปลาอูร็อค', 'ne': 'रकफिश साशिमी', 'ru': 'Сашими окунь'}
    },
    'sashimi-salmon': {
        'name': {'zh': '三文鱼刺身 (100g)', 'ja': 'サーモン刺身 (100g)', 'vi': 'Sashimi ca hoi (100g)', 'th': 'ซาชิมิแซลมอน (100g)', 'ne': 'सल्मन साशिमी (100g)', 'ru': 'Сашими лосось (100г)'}
    },
    'sashimi-mulhoe': {
        'name': {'zh': '冷拌生鱼片', 'ja': '水刺身', 'vi': 'Goi ca song', 'th': 'มูลฮเว', 'ne': 'मुल्हो', 'ru': 'Мульхве'}
    },
    'sashimi-side': {
        'name': {'zh': '加点辣汤', 'ja': '辛い鍋追加', 'vi': 'Them canh cay', 'th': 'เพิ่มซุปเผ็ด', 'ne': 'पिरो सुप थप', 'ru': 'Доп. острый суп'}
    },
    # --- SASHIMI SET ---
    'sashimi-set-gwangeo': {
        'name': {'zh': '比目鱼刺身套餐', 'ja': 'ヒラメ刺身セット', 'vi': 'Set Sashimi ca bon', 'th': 'เซ็ตซาชิมิปลากวางอ', 'ne': 'फ्ल्याटफिश साशिमी सेट', 'ru': 'Сашими-сет камбала'}
    },
    'sashimi-set-ureok': {
        'name': {'zh': '石斑鱼刺身套餐', 'ja': 'メバル刺身セット', 'vi': 'Set Sashimi ca mu', 'th': 'เซ็ตซาชิมิปลาอูร็อค', 'ne': 'रकफिश साशिमी सेट', 'ru': 'Сашими-сет окунь'}
    },
    'sashimi-set-combo': {
        'name': {'zh': '比目鱼+石斑鱼套餐', 'ja': 'ヒラメ+メバルセット', 'vi': 'Set ca bon + ca mu', 'th': 'เซ็ตปลากวางอ+อูร็อค', 'ne': 'फ्ल्याटफिश+रकफिश सेट', 'ru': 'Камбала+Окунь сет'}
    },
    # --- SUSHI ---
    'sushi-assorted': {
        'name': {'zh': '什锦寿司', 'ja': '盛り合わせ寿司', 'vi': 'Sushi tong hop', 'th': 'ซูชิรวม', 'ne': 'मिश्रित सुशी', 'ru': 'Ассорти суши'}
    },
    'sushi-salmon': {
        'name': {'zh': '三文鱼寿司', 'ja': 'サーモン寿司', 'vi': 'Sushi ca hoi', 'th': 'ซูชิแซลมอน', 'ne': 'सल्मन सुशी', 'ru': 'Суши лосось'}
    },
    'sushi-ureok': {
        'name': {'zh': '石斑鱼寿司', 'ja': 'メバル寿司', 'vi': 'Sushi ca mu', 'th': 'ซูชิปลาอูร็อค', 'ne': 'रकफिश सुशी', 'ru': 'Суши окунь'}
    },
    'sushi-shrimp-soy': {
        'name': {'zh': '酱油虾寿司', 'ja': '醤油エビ寿司', 'vi': 'Sushi tom xi dau', 'th': 'ซูชิกุ้งซีอิ๊ว', 'ne': 'सोया झिँगा सुशी', 'ru': 'Суши креветка в соевом'}
    },
    'sushi-gwangeo': {
        'name': {'zh': '比目鱼寿司', 'ja': 'ヒラメ寿司', 'vi': 'Sushi ca bon', 'th': 'ซูชิปลากวางอ', 'ne': 'फ्ल्याटफिश सुशी', 'ru': 'Суши камбала'}
    },
    'sushi-inari': {
        'name': {'zh': '豆腐皮寿司', 'ja': 'いなり寿司', 'vi': 'Sushi dau hu', 'th': 'ซูชิอินาริ', 'ne': 'इनारी सुशी', 'ru': 'Инари суши'}
    },
    'sushi-eel': {
        'name': {'zh': '海鳗寿司', 'ja': '穴子寿司', 'vi': 'Sushi luon bien', 'th': 'ซูชิปลาไหลทะเล', 'ne': 'इल सुशी', 'ru': 'Суши угорь'}
    },
    'sushi-shrimp': {
        'name': {'zh': '虾寿司', 'ja': 'エビ寿司', 'vi': 'Sushi tom', 'th': 'ซูชิกุ้ง', 'ne': 'झिँगा सुशी', 'ru': 'Суши креветка'}
    },
    'sushi-egg': {
        'name': {'zh': '蛋寿司', 'ja': '玉子寿司', 'vi': 'Sushi trung', 'th': 'ซูชิไข่', 'ne': 'अण्डा सुशी', 'ru': 'Суши тамаго'}
    },
    # --- SUSHI SINGLE ---
    'single-gwangeo': {
        'name': {'zh': '比目鱼', 'ja': 'ヒラメ', 'vi': 'Ca bon', 'th': 'ปลากวางอ', 'ne': 'फ्ल्याटफिश', 'ru': 'Камбала'}
    },
    'single-shrimp-soy': {
        'name': {'zh': '酱油虾', 'ja': '醤油エビ', 'vi': 'Tom xi dau', 'th': 'กุ้งซีอิ๊ว', 'ne': 'सोया झिँगा', 'ru': 'Креветка соевая'}
    },
    'single-egg': {
        'name': {'zh': '蛋', 'ja': '玉子', 'vi': 'Trung', 'th': 'ไข่', 'ne': 'अण्डा', 'ru': 'Тамаго'}
    },
    'single-salmon': {
        'name': {'zh': '三文鱼', 'ja': 'サーモン', 'vi': 'Ca hoi', 'th': 'แซลมอน', 'ne': 'सल्मन', 'ru': 'Лосось'}
    },
    'single-fin': {
        'name': {'zh': '比目鱼鳍', 'ja': 'ヒラメえんがわ', 'vi': 'Vay ca bon', 'th': 'ครีบปลากวางอ', 'ne': 'फ्ल्याटफिश फिन', 'ru': 'Камбала энгава'}
    },
    'single-ureok': {
        'name': {'zh': '石斑鱼', 'ja': 'メバル', 'vi': 'Ca mu', 'th': 'ปลาอูร็อค', 'ne': 'रकफिश', 'ru': 'Окунь'}
    },
    'single-shrimp': {
        'name': {'zh': '虾', 'ja': 'エビ', 'vi': 'Tom', 'th': 'กุ้ง', 'ne': 'झिँगा', 'ru': 'Креветка'}
    },
    'single-inari': {
        'name': {'zh': '豆腐皮', 'ja': 'いなり', 'vi': 'Dau hu', 'th': 'อินาริ', 'ne': 'इनारी', 'ru': 'Инари'}
    },
    'single-eel': {
        'name': {'zh': '海鳗', 'ja': '穴子', 'vi': 'Luon bien', 'th': 'ปลาไหลทะเล', 'ne': 'इल', 'ru': 'Угорь'}
    },
    # --- ROLL ---
    'roll-california': {
        'name': {'zh': '加州卷', 'ja': 'カリフォルニアロール', 'vi': 'Cuon California', 'th': 'แคลิฟอร์เนียโรล', 'ne': 'क्यालिफोर्निया रोल', 'ru': 'Калифорния ролл'}
    },
    'roll-tiger': {
        'name': {'zh': '虎卷', 'ja': 'タイガーロール', 'vi': 'Cuon Tiger', 'th': 'ไทเกอร์โรล', 'ne': 'टाइगर रोल', 'ru': 'Тайгер ролл'}
    },
    'roll-bayisland': {
        'name': {'zh': '海湾岛卷', 'ja': 'ベイアイランドロール', 'vi': 'Cuon Bay Island', 'th': 'เบย์ไอส์แลนด์โรล', 'ne': 'बे आइल्यान्ड रोल', 'ru': 'Бэй Айленд ролл'}
    },
    'roll-crunch': {
        'name': {'zh': '脆卷', 'ja': 'クランチロール', 'vi': 'Cuon Crunch', 'th': 'ครันช์โรล', 'ne': 'क्रन्च रोल', 'ru': 'Кранч ролл'}
    },
    'roll-lionking': {
        'name': {'zh': '狮子王卷', 'ja': 'ライオンキングロール', 'vi': 'Cuon Lion King', 'th': 'ไลอ้อนคิงโรล', 'ne': 'लायन किङ रोल', 'ru': 'Лайон Кинг ролл'}
    },
    'roll-alaska': {
        'name': {'zh': '阿拉斯加卷', 'ja': 'アラスカロール', 'vi': 'Cuon Alaska', 'th': 'อลาสก้าโรล', 'ne': 'अलास्का रोल', 'ru': 'Аляска ролл'}
    },
    'roll-dragon': {
        'name': {'zh': '龙卷', 'ja': 'ドラゴンロール', 'vi': 'Cuon Dragon', 'th': 'ดราก้อนโรล', 'ne': 'ड्रागन रोल', 'ru': 'Дракон ролл'}
    },
    # --- SIGNATURE ---
    'sig-mussel-chili': {
        'name': {'zh': '辣烤贻贝', 'ja': 'ムール貝チリ焼き', 'vi': 'Hong hop nuong ot', 'th': 'หอยแมลงภู่ย่างพริก', 'ne': 'चिली मसल ग्रिल', 'ru': 'Мидии чили гриль'}
    },
    'sig-beef-sprout': {
        'name': {'zh': '牛肉豆芽炒', 'ja': '牛肉もやし炒め', 'vi': 'Bo xao gia do', 'th': 'เนื้อผัดถั่วงอก', 'ne': 'बीफ स्प्राउट भुटेको', 'ru': 'Говядина с ростками'}
    },
    'sig-mentaiko-egg': {
        'name': {'zh': '明太子蛋卷', 'ja': '明太子卵焼き', 'vi': 'Trung cuon mentaiko', 'th': 'ไข่เจียวเมนไทโกะ', 'ne': 'मेन्टाइको अण्डा रोल', 'ru': 'Тамагояки ментайко'}
    },
    'sig-sichuan-wing': {
        'name': {'zh': '四川辣鸡翅', 'ja': '四川チキンウイング', 'vi': 'Canh ga Tu Xuyen', 'th': 'ปีกไก่เสฉวน', 'ne': 'सिचुआन चिकन विङ', 'ru': 'Сычуаньские крылышки'}
    },
    'sig-shrimp-soy': {
        'name': {'zh': '酱油虾', 'ja': 'エビの醤油漬け', 'vi': 'Tom ngam xi dau', 'th': 'กุ้งดองซีอิ๊ว', 'ne': 'सोया झिँगा', 'ru': 'Креветки в соевом'}
    },
    'sig-donkatsu-anju': {
        'name': {'zh': '猪排小菜', 'ja': 'とんかつおつまみ', 'vi': 'Tonkatsu khai vi', 'th': 'ทงคัตสึกับแกล้ม', 'ne': 'टोन्काट्सु स्न्याक', 'ru': 'Тонкацу закуска'}
    },
    'sig-jjukkumi': {
        'name': {'zh': '辣炒小章鱼+素面', 'ja': 'チュクミ炒め+素麺', 'vi': 'Bach tuoc xao cay + mi', 'th': 'หมึกผัดเผ็ด+โซเม็น', 'ne': 'पिरो अक्टोपस+सोमेन', 'ru': 'Осьминог острый+Лапша'}
    },
    'sig-salmon-salad': {
        'name': {'zh': '三文鱼沙拉', 'ja': 'サーモンサラダ', 'vi': 'Salad ca hoi', 'th': 'สลัดแซลมอน', 'ne': 'सल्मन सलाद', 'ru': 'Салат с лососем'}
    },
    # --- GRILL ---
    'grill-jeoneo': {
        'name': {'zh': '烤鲥鱼 (5条)', 'ja': 'コノシロ焼き (5尾)', 'vi': 'Ca jeoneo nuong (5 con)', 'th': 'ปลาจอนอย่าง (5 ตัว)', 'ne': 'जियोनो ग्रिल (५ वटा)', 'ru': 'Рыба гриль (5шт)'}
    },
    'grill-cheongeo': {
        'name': {'zh': '烤青鱼', 'ja': 'ニシン焼き', 'vi': 'Ca trich nuong', 'th': 'ปลาเฮอร์ริ่งย่าง', 'ne': 'हेरिङ ग्रिल', 'ru': 'Сельдь гриль'}
    },
    'grill-samchi': {
        'name': {'zh': '烤马鲛鱼', 'ja': 'サワラ焼き', 'vi': 'Ca thu nuong', 'th': 'ปลาอินทรีย่าง', 'ne': 'म्याकरेल ग्रिल', 'ru': 'Макрель гриль'}
    },
    'grill-mero': {
        'name': {'zh': '烤银鳕鱼 (200g)', 'ja': 'メロ焼き (200g)', 'vi': 'Ca mero nuong (200g)', 'th': 'ปลาเมโรย่าง (200g)', 'ne': 'मेरो ग्रिल (200g)', 'ru': 'Мерлуза гриль (200г)'}
    },
    'grill-shishamo': {
        'name': {'zh': '烤柳叶鱼 (5条)', 'ja': 'ししゃも焼き (5尾)', 'vi': 'Ca shishamo nuong (5)', 'th': 'ปลาชิชาโมะย่าง (5)', 'ne': 'शिशामो ग्रिल (५)', 'ru': 'Шишамо гриль (5шт)'}
    },
    # --- FRIED ---
    'fried-tori-karaage': {
        'name': {'zh': '日式炸鸡', 'ja': '鶏の唐揚げ', 'vi': 'Ga chien karaage', 'th': 'ไก่คาราอาเกะ', 'ne': 'टोरी कराएज', 'ru': 'Тори карааге'}
    },
    'fried-ebi-karaage': {
        'name': {'zh': '炸虾 (面粉)', 'ja': 'エビの唐揚げ (衣)', 'vi': 'Tom chien (bot)', 'th': 'กุ้งทอด (แป้งทอด)', 'ne': 'एबी कराएज (पिठो)', 'ru': 'Креветки (в кляре)'}
    },
    'fried-katsu-shrimp': {
        'name': {'zh': '炸虾排 (面包糠)', 'ja': 'エビカツ (パン粉)', 'vi': 'Tom chien (banh mi)', 'th': 'กุ้งคัตสึ (เกล็ดขนมปัง)', 'ne': 'काट्सु झिँगा (ब्रेडक्रम्ब)', 'ru': 'Креветки кацу (панировка)'}
    },
    'fried-odari-karaage': {
        'name': {'zh': '炸鱿鱼', 'ja': 'イカの唐揚げ', 'vi': 'Muc chien', 'th': 'ปลาหมึกทอด', 'ne': 'स्क्विड कराएज', 'ru': 'Кальмар карааге'}
    },
    # --- MEAL ---
    'meal-katsudon': {
        'name': {'zh': '猪排盖饭', 'ja': 'カツ丼', 'vi': 'Com katsudon', 'th': 'คัตสึด้ง', 'ne': 'काट्सुडन', 'ru': 'Кацудон'}
    },
    'meal-gyudon': {
        'name': {'zh': '牛肉盖饭', 'ja': '牛丼', 'vi': 'Com bo gyudon', 'th': 'กิวด้ง', 'ne': 'ग्युडन', 'ru': 'Гюдон'}
    },
    'meal-kimchidon': {
        'name': {'zh': '泡菜猪排锅', 'ja': 'キムチとんかつ鍋', 'vi': 'Lau kimchi tonkatsu', 'th': 'กิมจิทงคัตสึนาเบะ', 'ne': 'किमची टोन्काट्सु नाबे', 'ru': 'Кимчи тонкацу набэ'}
    },
    'meal-ebidon': {
        'name': {'zh': '虾盖饭', 'ja': 'エビ丼', 'vi': 'Com tom ebidon', 'th': 'เอบิด้ง', 'ne': 'एबिडन', 'ru': 'Эбидон'}
    },
    'meal-chicken-don': {
        'name': {'zh': '炸鸡盖饭', 'ja': 'チキン唐揚げ丼', 'vi': 'Com ga chien', 'th': 'ข้าวไก่คาราอาเกะ', 'ne': 'चिकन कराएज डन', 'ru': 'Чикен карааге дон'}
    },
    'meal-tonkatsu': {
        'name': {'zh': '猪排', 'ja': 'とんかつ', 'vi': 'Tonkatsu', 'th': 'ทงคัตสึ', 'ne': 'टोन्काट्सु', 'ru': 'Тонкацу'}
    },
    'meal-tonkatsu-jp': {
        'name': {'zh': '日式猪排', 'ja': '和風とんかつ', 'vi': 'Tonkatsu Nhat', 'th': 'ทงคัตสึญี่ปุ่น', 'ne': 'जापानी टोन्काट्सु', 'ru': 'Тонкацу японский'}
    },
    'meal-albap': {
        'name': {'zh': '鱼籽石锅饭', 'ja': 'いくら石鍋ご飯', 'vi': 'Com trung ca noi da', 'th': 'ข้าวไข่ปลาหม้อดิน', 'ne': 'रो स्टोन पट भात', 'ru': 'Икра в горшочке'}
    },
    'meal-gwangeo-don': {
        'name': {'zh': '比目鱼刺身盖饭', 'ja': 'ヒラメ海鮮丼', 'vi': 'Com sashimi ca bon', 'th': 'ข้าวซาชิมิปลากวางอ', 'ne': 'फ्ल्याटफिश डन', 'ru': 'Камбала дон'}
    },
    'meal-ureok-don': {
        'name': {'zh': '石斑鱼刺身盖饭', 'ja': 'メバル海鮮丼', 'vi': 'Com sashimi ca mu', 'th': 'ข้าวซาชิมิปลาอูร็อค', 'ne': 'रकफिश डन', 'ru': 'Окунь дон'}
    },
    'meal-tuna-don': {
        'name': {'zh': '金枪鱼刺身盖饭', 'ja': 'マグロ丼', 'vi': 'Com sashimi ca ngu', 'th': 'ข้าวซาชิมิทูน่า', 'ne': 'ट्युना डन', 'ru': 'Тунец дон'}
    },
    'meal-curry-katsu': {
        'name': {'zh': '咖喱猪排盖饭', 'ja': 'カレーカツ丼', 'vi': 'Com ca ri tonkatsu', 'th': 'ข้าวแกงกะหรี่ทงคัตสึ', 'ne': 'करी काट्सु डन', 'ru': 'Карри кацу дон'}
    },
    'meal-altang': {
        'name': {'zh': '鱼籽辣汤', 'ja': 'アルタン(魚卵辛スープ)', 'vi': 'Canh trung ca cay', 'th': 'ซุปไข่ปลาเผ็ด', 'ne': 'अल्ताङ (माछा अण्डा सुप)', 'ru': 'Альтан (острый суп с икрой)'}
    },
    # --- NOODLE ---
    'noodle-inari-udon': {
        'name': {'zh': '豆腐皮乌冬', 'ja': 'きつねうどん', 'vi': 'Udon dau hu', 'th': 'อุด้งอินาริ', 'ne': 'इनारी उडोन', 'ru': 'Удон инари'}
    },
    'noodle-fish-udon': {
        'name': {'zh': '鱼饼乌冬', 'ja': 'おでんうどん', 'vi': 'Udon cha ca', 'th': 'อุด้งลูกชิ้นปลา', 'ne': 'फिशकेक उडोन', 'ru': 'Удон с камабоко'}
    },
    'noodle-shrimp-udon': {
        'name': {'zh': '炸虾乌冬', 'ja': '海老天うどん', 'vi': 'Udon tom tempura', 'th': 'อุด้งกุ้งเทมปุระ', 'ne': 'झिँगा टेम्पुरा उडोन', 'ru': 'Удон темпура'}
    },
    'noodle-tonkotsu': {
        'name': {'zh': '豚骨拉面', 'ja': '豚骨ラーメン', 'vi': 'Mi tonkotsu', 'th': 'ราเม็งทงคตสึ', 'ne': 'टोन्कोत्सु रामेन', 'ru': 'Тонкоцу рамен'}
    },
    'noodle-tantan': {
        'name': {'zh': '担担面', 'ja': '担々麺', 'vi': 'Mi tantan', 'th': 'ตั้นตั้นเม็น', 'ne': 'टान्टान रामेन', 'ru': 'Тантанмэн'}
    },
    'noodle-cold-soba': {
        'name': {'zh': '冷荞麦面', 'ja': '冷たいそば', 'vi': 'Mi soba lanh', 'th': 'โซบะเย็น', 'ne': 'चिसो सोबा', 'ru': 'Холодная соба'}
    },
    'noodle-pan-soba': {
        'name': {'zh': '笊篱荞麦面', 'ja': 'ざるそば', 'vi': 'Mi soba khay', 'th': 'โซบะจาน', 'ne': 'प्यान सोबा', 'ru': 'Дзару соба'}
    },
    'noodle-bibim-soba': {
        'name': {'zh': '拌荞麦面', 'ja': 'ビビンそば', 'vi': 'Mi soba tron', 'th': 'บิบิมโซบะ', 'ne': 'बिबिम सोबा', 'ru': 'Бибим соба'}
    },
    'noodle-yaki-udon': {
        'name': {'zh': '炒乌冬', 'ja': '焼きうどん', 'vi': 'Udon xao', 'th': 'ยากิอุด้ง', 'ne': 'याकी उडोन', 'ru': 'Яки удон'}
    },
    # --- HOTPOT ---
    'hotpot-seodeori': {
        'name': {'zh': '鱼杂火锅', 'ja': 'ソドリ鍋', 'vi': 'Lau ca seodeori', 'th': 'หม้อไฟซอดอรี', 'ne': 'सियोदोरी तातो भाँडो', 'ru': 'Содори набэ'}
    },
    'hotpot-daegu-1': {
        'name': {'zh': '鳕鱼锅 (1人)', 'ja': 'タラ鍋 (1人前)', 'vi': 'Lau ca tuyet (1)', 'th': 'หม้อไฟปลาค็อด (1 คน)', 'ne': 'कड तातो भाँडो (१)', 'ru': 'Набэ из трески (1)'}
    },
    'hotpot-daegu-2': {
        'name': {'zh': '鳕鱼锅 (2人)', 'ja': 'タラ鍋 (2人前)', 'vi': 'Lau ca tuyet (2)', 'th': 'หม้อไฟปลาค็อด (2 คน)', 'ne': 'कड तातो भाँडो (२)', 'ru': 'Набэ из трески (2)'}
    },
    'hotpot-daegu-3': {
        'name': {'zh': '鳕鱼锅 (3人)', 'ja': 'タラ鍋 (3人前)', 'vi': 'Lau ca tuyet (3)', 'th': 'หม้อไฟปลาค็อด (3 คน)', 'ne': 'कड तातो भाँडो (३)', 'ru': 'Набэ из трески (3)'}
    },
    'hotpot-daegu-4': {
        'name': {'zh': '鳕鱼锅 (4人)', 'ja': 'タラ鍋 (4人前)', 'vi': 'Lau ca tuyet (4)', 'th': 'หม้อไฟปลาค็อด (4 คน)', 'ne': 'कड तातो भाँडो (४)', 'ru': 'Набэ из трески (4)'}
    },
    'hotpot-al-goni': {
        'name': {'zh': '鱼籽+内脏火锅', 'ja': 'アル+コニ鍋', 'vi': 'Lau trung ca + long', 'th': 'หม้อไฟไข่ปลา+เครื่องใน', 'ne': 'अल+गोनी तातो भाँडो', 'ru': 'Набэ икра+потроха'}
    },
    'hotpot-clam-tofu': {
        'name': {'zh': '蛤蜊豆腐汤', 'ja': 'あさり豆腐鍋', 'vi': 'Canh dau hu ngheu', 'th': 'ซุปเต้าหู้หอยลาย', 'ne': 'क्ल्याम टोफु सुप', 'ru': 'Суп с тофу и моллюсками'}
    },
    'hotpot-fishcake': {
        'name': {'zh': '鱼糕汤', 'ja': 'おでん鍋', 'vi': 'Canh cha ca', 'th': 'ซุปลูกชิ้นปลา', 'ne': 'फिशकेक सुप', 'ru': 'Суп одэн'}
    },
    # --- DRINK ---
    'drink-soju': {
        'name': {'zh': '烧酒', 'ja': '焼酎', 'vi': 'Soju', 'th': 'โซจู', 'ne': 'सोजु', 'ru': 'Соджу'}
    },
    'drink-beer': {
        'name': {'zh': '啤酒', 'ja': 'ビール', 'vi': 'Bia', 'th': 'เบียร์', 'ne': 'बियर', 'ru': 'Пиво'}
    },
    'drink-soft': {
        'name': {'zh': '饮料', 'ja': 'ソフトドリンク', 'vi': 'Nuoc ngot', 'th': 'น้ำอัดลม', 'ne': 'सफ्ट ड्रिंक', 'ru': 'Напиток'}
    },
    # --- SAKE ---
    'sake-baekhwa-pot': {
        'name': {'zh': '白花水福 壶', 'ja': '百花水福 銚子', 'vi': 'Baekhwa Subog binh', 'th': 'แบกฮวาซูบก กา', 'ne': 'बेकह्वा सुबोक जग', 'ru': 'Пэкхвасубок кувшин'}
    },
    'sake-baekhwa-daepo': {
        'name': {'zh': '白花水福 大杯', 'ja': '百花水福 大杯', 'vi': 'Baekhwa Subog lon', 'th': 'แบกฮวาซูบก แก้วใหญ่', 'ne': 'बेकह्वा सुबोक ठूलो', 'ru': 'Пэкхвасубок бол.'}
    },
    'sake-baekhwa-tokuri': {
        'name': {'zh': '白花水福 德利', 'ja': '百花水福 徳利', 'vi': 'Baekhwa Subog tokuri', 'th': 'แบกฮวาซูบก โทคุริ', 'ne': 'बेकह्वा सुबोक तोकुरी', 'ru': 'Пэкхвасубок токкури'}
    },
    'sake-nihon-pot': {
        'name': {'zh': '日本酒 壶', 'ja': '日本盛半酌 銚子', 'vi': 'Sake Nhat binh', 'th': 'สาเกญี่ปุ่น กา', 'ne': 'जापानी साके जग', 'ru': 'Японское сакэ кувшин'}
    },
    'sake-nihon-daepo': {
        'name': {'zh': '日本酒 大杯', 'ja': '日本盛半酌 大杯', 'vi': 'Sake Nhat lon', 'th': 'สาเกญี่ปุ่น แก้วใหญ่', 'ne': 'जापानी साके ठूलो', 'ru': 'Японское сакэ бол.'}
    },
    'sake-nihon-tokuri': {
        'name': {'zh': '日本酒 德利', 'ja': '日本盛半酌 徳利', 'vi': 'Sake Nhat tokuri', 'th': 'สาเกญี่ปุ่น โทคุริ', 'ne': 'जापानी साके तोकुरी', 'ru': 'Японское сакэ токкури'}
    },
    'packsake-ganbare': {
        'name': {'zh': '加油大叔 (900ml)', 'ja': 'がんばれおとうさん (900ml)', 'vi': 'Ganbare Otousan (900ml)', 'th': 'กันบาเระ (900ml)', 'ne': 'गान्बारे (900ml)', 'ru': 'Ганбарэ (900мл)'}
    },
    'packsake-hakutsumaru': {
        'name': {'zh': '白鹤丸 (900ml)', 'ja': '白鶴まる (900ml)', 'vi': 'Hakutsumaru (900ml)', 'th': 'ฮากุสึมารุ (900ml)', 'ne': 'हाकुत्सुमारु (900ml)', 'ru': 'Хакуцумару (900мл)'}
    },
    # --- EXTRAS ---
    'extras-udon-noodle': {
        'name': {'zh': '加乌冬面', 'ja': 'うどん玉追加', 'vi': 'Them mi udon', 'th': 'เพิ่มเส้นอุด้ง', 'ne': 'उडोन नुडल थप', 'ru': 'Доп. удон'}
    },
    'extras-corn-butter': {
        'name': {'zh': '加玉米黄油', 'ja': 'コーンバター追加', 'vi': 'Them bo bap', 'th': 'เพิ่มข้าวโพดเนย', 'ne': 'कर्न बटर थप', 'ru': 'Доп. корн-баттер'}
    },
    'extras-rice': {
        'name': {'zh': '加米饭', 'ja': 'ご飯追加', 'vi': 'Them com', 'th': 'เพิ่มข้าว', 'ne': 'भात थप', 'ru': 'Доп. рис'}
    },
}

applied = 0
for item in data['items']:
    tid = item['id']
    if tid in translations:
        tr = translations[tid]
        if 'name' in tr:
            item['name'].update(tr['name'])
        if 'desc' in tr and 'description' in item:
            item['description'].update(tr['desc'])
        applied += 1

# ============================================================
# 4. Save
# ============================================================
with open(MENU_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# Verify
langs = ['ko', 'en', 'zh', 'ja', 'vi', 'th', 'ne', 'ru']
print(f'\n=== Results ===')
print(f'Items total: {len(data["items"])}')
print(f'Translations applied: {applied}')
print(f'\nCoverage per language:')
for lang in langs:
    count = sum(1 for i in data['items'] if lang in i['name'])
    print(f'  {lang}: {count}/{len(data["items"])} items')

print('\nDone!')
