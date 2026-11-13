// Shared multilingual ingredient catalog.
// Row: [id, category, en, uz, ko, ru, defaultUnit, gramsPerPiece|null, extra aliases]
// Every language name and alias maps to the same canonical id.

export const CATEGORIES = [
  "vegetables", "fruits", "herbs", "meat", "seafood", "dairy", "eggs", "grains",
  "pasta", "legumes", "nuts", "bakery", "spices", "sauces", "oils", "baking", "drinks", "other",
];

const ROWS = [
  // vegetables
  ["potato", "vegetables", "Potato", "Kartoshka", "감자", "Картофель", "g", 170, ["potatoes", "картошка", "kartoshka", "kartoshkalar", "картофель", "картофеля"]],
  ["onion", "vegetables", "Onion", "Piyoz", "양파", "Лук", "pc", 110, ["onions", "yellow onion", "brown onion", "репчатый лук", "лук репчатый", "piyoz", "piyozlar", "лук", "луковица", "луковицы", "лука"]],
  ["red_onion", "vegetables", "Red onion", "Qizil piyoz", "적양파", "Красный лук", "pc", 110, ["red onions"]],
  ["green_onion", "vegetables", "Green onion", "Ko'k piyoz", "대파", "Зелёный лук", "bunch", 15, ["spring onion", "scallion", "scallions", "spring onions", "파", "쪽파", "ko'kpiyoz", "ko'k piyoz", "зеленый лук", "зелёный лук"]],
  ["garlic", "vegetables", "Garlic", "Sarimsoq", "마늘", "Чеснок", "clove", 5, ["garlic clove", "garlic cloves", "다진 마늘", "chesnok", "chisnok", "chesnog", "zubchik chesnok", "sarimsoq piyoz", "чеснока"]],
  ["carrot", "vegetables", "Carrot", "Sabzi", "당근", "Морковь", "pc", 70, ["carrots", "морковка", "sabzi (carrot)", "sabzi", "sabzilar", "морковь", "моркови"]],
  ["tomato", "vegetables", "Tomato", "Pomidor", "토마토", "Помидор", "pc", 120, ["tomatoes", "томат", "помидоры", "pamidor", "pomidor", "pomidorlar", "помидора"]],
  ["cherry_tomato", "vegetables", "Cherry tomato", "Cherri pomidor", "방울토마토", "Черри", "g", 15, ["cherry tomatoes", "cherri pomidori", "cherri", "черри"]],
  ["cucumber", "vegetables", "Cucumber", "Bodring", "오이", "Огурец", "pc", 200, ["cucumbers", "огурцы", "bodring", "огурец", "огурца"]],
  ["bell_pepper", "vegetables", "Bell pepper", "Bolgar qalampiri", "파프리카", "Болгарский перец", "pc", 150, ["sweet pepper", "capsicum", "bell peppers", "red pepper", "green pepper", "피망", "balgarskiy", "bolgarski", "bolgarskiy", "balgarski", "balgariskiy", "bulg'or qalampiri", "bolgar qalampiri", "svetafor", "перец болгарский", "болгарского перца", "сладкий перец", "paprika qalampir"]],
  ["chili", "vegetables", "Chili pepper", "Achchiq qalampir", "고추", "Острый перец", "pc", 15, ["chili", "chilli", "hot pepper", "jalapeno", "청양고추", "чили", "achchiq qalampir", "qalampir", "острый перец"]],
  ["cabbage", "vegetables", "Cabbage", "Karam", "양배추", "Капуста", "g", 900, ["white cabbage", "karam", "karom", "капуста", "капусты"]],
  ["napa_cabbage", "vegetables", "Napa cabbage", "Pekin karami", "배추", "Пекинская капуста", "g", 1500, ["chinese cabbage"]],
  ["broccoli", "vegetables", "Broccoli", "Brokkoli", "브로콜리", "Брокколи", "g", 300, []],
  ["cauliflower", "vegetables", "Cauliflower", "Gulkaram", "콜리플라워", "Цветная капуста", "g", 600, []],
  ["zucchini", "vegetables", "Zucchini", "Qovoqcha", "애호박", "Кабачок", "pc", 200, ["courgette", "zucchinis", "호박", "kabachki", "kabachok", "кабачки", "кабачка"]],
  ["eggplant", "vegetables", "Eggplant", "Baqlajon", "가지", "Баклажан", "pc", 300, ["aubergine", "eggplants", "baqlajon", "baklajan", "баклажан", "баклажаны"]],
  ["pumpkin", "vegetables", "Pumpkin", "Qovoq", "단호박", "Тыква", "g", 2000, ["squash", "butternut squash"]],
  ["spinach", "vegetables", "Spinach", "Ismaloq", "시금치", "Шпинат", "g", null, ["shpinat", "шпинат"]],
  ["lettuce", "vegetables", "Lettuce", "Salat bargi", "상추", "Салат", "pc", 300, ["salad leaves", "romaine", "rukola", "aysberg", "salat bargi", "руккола", "листья салата"]],
  ["mushroom", "vegetables", "Mushrooms", "Qo'ziqorin", "버섯", "Грибы", "g", 20, ["mushroom", "champignon", "champignons", "шампиньоны", "표고버섯", "양송이", "shampinyon", "shampinyonlar", "qo'ziqorinlar", "грибы", "грибов"]],
  ["corn", "vegetables", "Corn", "Makkajo'xori", "옥수수", "Кукуруза", "g", 150, ["sweetcorn", "sweet corn", "jo'xori", "kukuruza", "кукуруза", "кукурузы"]],
  ["peas", "vegetables", "Green peas", "Ko'k no'xat", "완두콩", "Зелёный горошек", "g", null, ["peas", "frozen peas", "горошек"]],
  ["beet", "vegetables", "Beetroot", "Lavlagi", "비트", "Свёкла", "pc", 150, ["beet", "beets", "свекла"]],
  ["radish", "vegetables", "Radish", "Turp", "무", "Редька", "g", 800, ["daikon", "korean radish", "редис"]],
  ["ginger", "vegetables", "Ginger", "Zanjabil", "생강", "Имбирь", "g", null, ["fresh ginger"]],
  ["celery", "vegetables", "Celery", "Selderey", "셀러리", "Сельдерей", "pc", 40, []],
  ["leek", "vegetables", "Leek", "Porey", "리크", "Лук-порей", "pc", 200, []],
  ["sweet_potato", "vegetables", "Sweet potato", "Shirin kartoshka", "고구마", "Батат", "pc", 200, ["sweet potatoes", "yam"]],
  ["bean_sprouts", "vegetables", "Bean sprouts", "Mosh nihollari", "숙주", "Ростки маша", "g", null, ["콩나물"]],
  // fruits
  ["apple", "fruits", "Apple", "Olma", "사과", "Яблоко", "pc", 180, ["apples", "яблоки", "olma", "яблоко"]],
  ["banana", "fruits", "Banana", "Banan", "바나나", "Банан", "pc", 120, ["bananas", "banan", "бананы"]],
  ["orange", "fruits", "Orange", "Apelsin", "오렌지", "Апельсин", "pc", 150, ["oranges"]],
  ["lemon", "fruits", "Lemon", "Limon", "레몬", "Лимон", "pc", 100, ["lemons", "lemon juice", "лимонный сок", "limon", "лимон", "лимона"]],
  ["lime", "fruits", "Lime", "Laym", "라임", "Лайм", "pc", 65, ["limes", "lime juice"]],
  ["strawberry", "fruits", "Strawberries", "Qulupnay", "딸기", "Клубника", "g", 12, ["strawberry"]],
  ["berries", "fruits", "Berries", "Rezavor mevalar", "베리", "Ягоды", "g", null, ["blueberries", "raspberries", "mixed berries", "malina", "smorodina", "черника", "малина", "клубника"]],
  ["raisins", "fruits", "Raisins", "Mayiz", "건포도", "Изюм", "g", null, ["raisin", "mayiz", "изюм"]],
  ["avocado", "fruits", "Avocado", "Avokado", "아보카도", "Авокадо", "pc", 170, ["avocados"]],
  ["pear", "fruits", "Pear", "Nok", "배", "Груша", "pc", 180, ["pears"]],
  ["dried_apricot", "fruits", "Dried apricots", "Turshak", "말린 살구", "Курага", "g", null, []],
  ["quince", "fruits", "Quince", "Behi", "모과", "Айва", "pc", 250, []],
  // herbs
  ["parsley", "herbs", "Parsley", "Petrushka", "파슬리", "Петрушка", "bunch", 30, ["petrushka", "петрушка", "петрушки"]],
  ["dill", "herbs", "Dill", "Shivit", "딜", "Укроп", "bunch", 30, ["ukrop", "укроп", "укропа", "shivit"]],
  ["coriander", "herbs", "Coriander", "Kashnich", "고수", "Кинза", "bunch", 30, ["cilantro", "fresh coriander", "кориандр зелень", "kinza", "kashnich", "кинзы"]],
  ["basil", "herbs", "Basil", "Rayhon", "바질", "Базилик", "bunch", 20, ["rayhon", "базилик"]],
  ["mint", "herbs", "Mint", "Yalpiz", "민트", "Мята", "bunch", 20, []],
  // meat
  ["beef", "meat", "Beef", "Mol go'shti", "소고기", "Говядина", "g", null, ["ground beef", "minced beef", "beef mince", "steak", "фарш говяжий", "다진 소고기", "mol go'shti", "говядина", "говядины"]],
  ["lamb", "meat", "Lamb", "Qo'y go'shti", "양고기", "Баранина", "g", null, ["mutton", "ground lamb", "qo'y go'shti", "qo'y", "баранина", "баранины"]],
  ["chicken", "meat", "Chicken", "Tovuq", "닭고기", "Курица", "g", null, ["chicken breast", "chicken thighs", "chicken thigh", "chicken legs", "куриное филе", "куриная грудка", "닭가슴살", "닭", "kurinniy file", "kuriniy file", "kurinoe file", "tovuq go'shti", "tovuq file", "tovuq filesi", "tovuq", "курицы", "курица", "филе"]],
  ["pork", "meat", "Pork", "Cho'chqa go'shti", "돼지고기", "Свинина", "g", null, ["pork belly", "ground pork", "삼겹살", "bacon", "бекон", "ham", "ветчина", "베이컨"]],
  ["turkey", "meat", "Turkey", "Kurka go'shti", "칠면조", "Индейка", "g", null, []],
  ["sausage", "meat", "Sausage", "Kolbasa", "소시지", "Колбаса", "g", 60, ["sausages", "сосиски", "sosiska", "sosiskalar", "kolbasa", "колбаса"]],
  ["minced_meat", "meat", "Minced meat", "Qiyma", "다진 고기", "Фарш", "g", null, ["mince", "ground meat", "farsh", "qiyma go'sht", "фарш", "фарша", "мясной фарш"]],
  // seafood
  ["fish", "seafood", "Fish", "Baliq", "생선", "Рыба", "g", null, ["white fish", "cod", "salmon", "tuna", "mackerel", "лосось", "тунец", "연어", "참치", "고등어", "baliq", "рыба", "рыбы", "филе рыбы"]],
  ["shrimp", "seafood", "Shrimp", "Krevetka", "새우", "Креветки", "g", null, ["prawns", "prawn", "shrimps", "krevetka", "krevetkalar", "креветки"]],
  ["squid", "seafood", "Squid", "Kalmar", "오징어", "Кальмар", "g", null, ["calamari"]],
  // dairy
  ["milk", "dairy", "Milk", "Sut", "우유", "Молоко", "ml", null, ["whole milk", "sut", "молоко", "молока"]],
  ["butter", "dairy", "Butter", "Sariyog'", "버터", "Сливочное масло", "g", null, ["unsalted butter", "масло сливочное", "saryog'", "sariyog'", "saryog", "sariyog", "slivochnoe maslo", "сливочного масла"]],
  ["cheese", "dairy", "Cheese", "Pishloq", "치즈", "Сыр", "g", null, ["cheddar", "mozzarella", "parmesan", "grated cheese", "feta", "сыр твердый", "모짜렐라", "sir", "pishloq", "brinza", "suluguni", "parmezan", "gollandskiy sir", "rossiyskiy sir", "сыра", "брынза", "моцарелла", "пармезан"]],
  ["yogurt", "dairy", "Yogurt", "Yogurt", "요거트", "Йогурт", "g", null, ["yoghurt", "greek yogurt", "qatiq", "катык", "kefir yoki qatiq", "йогурт", "йогурта"]],
  ["sour_cream", "dairy", "Sour cream", "Smetana", "사워크림", "Сметана", "g", null, ["smetana", "сметаны"]],
  ["cream", "dairy", "Cream", "Qaymoq", "생크림", "Сливки", "ml", null, ["heavy cream", "double cream", "whipping cream", "slivki", "qaymoq", "сливки", "сливок"]],
  ["cottage_cheese", "dairy", "Cottage cheese", "Tvorog", "코티지 치즈", "Творог", "g", null, ["suzma", "сузьма", "tvarog", "tvorog", "творог", "творога"]],
  ["cream_cheese", "dairy", "Cream cheese", "Krem pishloq", "크림치즈", "Сливочный сыр", "g", null, ["tvorojniy sir", "tvarojniy sir", "slivochniy sir", "творожный сыр", "сливочный сыр", "филадельфия"]],
  // eggs
  ["egg", "eggs", "Eggs", "Tuxum", "달걀", "Яйца", "pc", 50, ["egg", "large eggs", "large egg", "계란", "яйцо", "tuhum", "tuxumlar", "tuhumlar", "tuxum sarig'i", "tuhum sarig'i", "tuxum oqi", "яиц", "яйца", "желток", "желтки"]],
  // grains
  ["rice", "grains", "Rice", "Guruch", "쌀", "Рис", "g", null, ["white rice", "basmati", "jasmine rice", "cooked rice", "devzira", "밥", "рис девзира", "guruch", "рис", "риса"]],
  ["flour", "grains", "Flour", "Un", "밀가루", "Мука", "g", null, ["all-purpose flour", "plain flour", "wheat flour", "мука пшеничная", "un", "muka", "мука", "муки"]],
  ["oats", "grains", "Oats", "Suli", "귀리", "Овсянка", "g", null, ["rolled oats", "oatmeal", "овсяные хлопья"]],
  ["buckwheat", "grains", "Buckwheat", "Grechka", "메밀", "Гречка", "g", null, []],
  ["bulgur", "grains", "Bulgur", "Bulg'ur", "불구르", "Булгур", "g", null, []],
  ["breadcrumbs", "grains", "Breadcrumbs", "Non uvoq", "빵가루", "Панировочные сухари", "g", null, ["panko", "panirovanniy suxarik", "suxarik", "non ushog'i", "панировочные сухари", "сухари"]],
  // pasta
  ["pasta", "pasta", "Pasta", "Makaron", "파스타", "Макароны", "g", null, ["spaghetti", "penne", "fusilli", "macaroni", "спагетти", "makaron", "spagetti", "макароны"]],
  ["noodles", "pasta", "Noodles", "Lag'mon ugrasi", "면", "Лапша", "g", null, ["egg noodles", "ramen", "udon", "rice noodles", "glass noodles", "라면", "국수", "당면", "lag'mon", "ugra", "лапша", "лапши"]],
  // legumes
  ["beans", "legumes", "Beans", "Loviya", "콩", "Фасоль", "g", null, ["kidney beans", "white beans", "black beans", "canned beans"]],
  ["chickpeas", "legumes", "Chickpeas", "No'xat", "병아리콩", "Нут", "g", null, ["garbanzo", "no'xat", "нут"]],
  ["lentils", "legumes", "Lentils", "Yasmiq", "렌틸콩", "Чечевица", "g", null, ["red lentils", "lentil"]],
  ["mung", "legumes", "Mung beans", "Mosh", "녹두", "Маш", "g", null, ["mung"]],
  ["tofu", "legumes", "Tofu", "Tofu", "두부", "Тофу", "g", null, []],
  // nuts
  ["walnut", "nuts", "Walnuts", "Yong'oq", "호두", "Грецкий орех", "g", null, ["walnut", "mag'iz", "magiz", "yong'oq mag'zi", "грецкие орехи", "орехи"]],
  ["almond", "nuts", "Almonds", "Bodom", "아몬드", "Миндаль", "g", null, ["almond"]],
  ["peanut", "nuts", "Peanuts", "Yeryong'oq", "땅콩", "Арахис", "g", null, ["peanut", "peanut butter"]],
  ["sesame", "nuts", "Sesame seeds", "Kunjut", "참깨", "Кунжут", "g", null, ["sesame", "깨"]],
  // bakery
  ["bread", "bakery", "Bread", "Non", "빵", "Хлеб", "pc", 30, ["slice of bread", "toast", "baguette", "lepyoshka", "лепёшка", "non", "baton", "хлеб", "батон"]],
  ["tortilla", "bakery", "Tortilla", "Lavash", "토르티야", "Лаваш", "pc", 60, ["lavash", "wrap", "pita"]],
  // spices
  ["salt", "spices", "Salt", "Tuz", "소금", "Соль", "tsp", null, ["sea salt", "kosher salt", "tuz", "соль", "соли"]],
  ["black_pepper", "spices", "Black pepper", "Qora murch", "후추", "Чёрный перец", "tsp", null, ["pepper", "ground pepper", "ground black pepper", "черный перец", "murch", "muruch", "qora murch", "perets", "перец черный", "черный перец молотый", "молотый перец"]],
  ["cumin", "spices", "Cumin", "Zira", "커민", "Зира", "tsp", null, ["cumin seeds", "кумин"]],
  ["paprika", "spices", "Paprika", "Qizil murch", "파프리카 가루", "Паприка", "tsp", null, ["smoked paprika", "sladkiy paprika", "паприка"]],
  ["chili_flakes", "spices", "Chili flakes", "Qalampir parchasi", "고춧가루", "Хлопья чили", "tsp", null, ["red pepper flakes", "gochugaru", "chili powder"]],
  ["turmeric", "spices", "Turmeric", "Zarchava", "강황", "Куркума", "tsp", null, []],
  ["cinnamon", "spices", "Cinnamon", "Dolchin", "계피", "Корица", "tsp", null, ["koritsa", "dolchin", "корица", "корицы"]],
  ["coriander_seed", "spices", "Ground coriander", "Kashnich urug'i", "고수씨", "Молотый кориандр", "tsp", null, ["coriander seeds"]],
  ["bay_leaf", "spices", "Bay leaf", "Dafna bargi", "월계수 잎", "Лавровый лист", "pc", 0.2, ["bay leaves", "lavr bargi", "lavroviy list", "лавровый лист"]],
  ["oregano", "spices", "Oregano", "Oregano", "오레가노", "Орегано", "tsp", null, ["dried oregano", "italian herbs", "dried herbs"]],
  ["curry", "spices", "Curry powder", "Kari", "카레 가루", "Карри", "tsp", null, ["curry"]],
  // sauces
  ["soy_sauce", "sauces", "Soy sauce", "Soya sousi", "간장", "Соевый соус", "tbsp", null, ["soy", "light soy sauce", "soya", "soya sousi", "соевого соуса"]],
  ["ketchup", "sauces", "Ketchup", "Ketchup", "케첩", "Кетчуп", "tbsp", null, []],
  ["mayonnaise", "sauces", "Mayonnaise", "Mayonez", "마요네즈", "Майонез", "tbsp", null, ["mayo", "mayanez", "mayonez", "majonez", "майонеза"]],
  ["tomato_paste", "sauces", "Tomato paste", "Tomat pastasi", "토마토 페이스트", "Томатная паста", "tbsp", null, ["tomato puree", "tomat", "tamat", "tomat pastasi", "tamat pastasi", "pomidor pastasi", "томатная паста", "томат"]],
  ["tomato_sauce", "sauces", "Tomato sauce", "Tomat sousi", "토마토 소스", "Томатный соус", "ml", null, ["passata", "canned tomatoes", "chopped tomatoes"]],
  ["vinegar", "sauces", "Vinegar", "Sirka", "식초", "Уксус", "tbsp", null, ["rice vinegar", "apple cider vinegar", "uksus", "уксус", "уксуса"]],
  ["mustard", "sauces", "Mustard", "Xantal", "머스터드", "Горчица", "tsp", null, ["gorchitsa", "горчица", "горчицы"]],
  ["gochujang", "sauces", "Gochujang", "Gochujang", "고추장", "Кочхуджан", "tbsp", null, ["korean chili paste"]],
  ["doenjang", "sauces", "Doenjang", "Doenjang", "된장", "Твенджан", "tbsp", null, ["soybean paste"]],
  ["honey", "sauces", "Honey", "Asal", "꿀", "Мёд", "tbsp", null, ["asal", "мёд", "мед", "меда"]],
  ["fish_sauce", "sauces", "Fish sauce", "Baliq sousi", "액젓", "Рыбный соус", "tbsp", null, []],
  ["oyster_sauce", "sauces", "Oyster sauce", "Ustritsa sousi", "굴소스", "Устричный соус", "tbsp", null, []],
  // oils & fats
  ["oil", "oils", "Vegetable oil", "O'simlik yog'i", "식용유", "Растительное масло", "tbsp", null, ["oil", "cooking oil", "sunflower oil", "canola oil", "подсолнечное масло", "yog'", "yog", "o'simlik yog'i", "paxta yog'i", "rastitelnoe maslo", "масло растительное", "растительного масла", "масло"]],
  ["olive_oil", "oils", "Olive oil", "Zaytun moyi", "올리브유", "Оливковое масло", "tbsp", null, ["extra virgin olive oil", "zaytun yog'i", "olivkoviy masla", "olivkovoe maslo", "оливковое масло", "оливкового масла"]],
  ["sesame_oil", "oils", "Sesame oil", "Kunjut yog'i", "참기름", "Кунжутное масло", "tsp", null, []],
  // baking
  ["sugar", "baking", "Sugar", "Shakar", "설탕", "Сахар", "g", null, ["white sugar", "brown sugar", "caster sugar", "shakar", "saxar", "сахар", "сахара"]],
  ["baking_powder", "baking", "Baking powder", "Pishirish kukuni", "베이킹파우더", "Разрыхлитель", "tsp", null, ["razrixlitel", "razrexlitel", "razrixritel", "razrixlitel testa", "разрыхлитель", "разрыхлителя"]],
  ["baking_soda", "baking", "Baking soda", "Soda", "베이킹소다", "Сода", "tsp", null, ["bicarbonate of soda"]],
  ["yeast", "baking", "Yeast", "Xamirturush", "이스트", "Дрожжи", "g", null, ["dry yeast", "instant yeast", "droja", "drojji", "drojja", "дрожжи", "дрожжей"]],
  ["vanilla", "baking", "Vanilla", "Vanil", "바닐라", "Ваниль", "tsp", null, ["vanilla extract", "vanilla sugar", "vanilin", "vanil shakar", "ванилин", "ванильный сахар"]],
  ["cocoa", "baking", "Cocoa powder", "Kakao", "코코아 가루", "Какао", "tbsp", null, ["cocoa", "kakao", "какао"]],
  ["chocolate", "baking", "Chocolate", "Shokolad", "초콜릿", "Шоколад", "g", null, ["dark chocolate", "chocolate chips", "shokolad", "шоколад", "шоколада"]],
  ["starch", "baking", "Cornstarch", "Kraxmal", "전분", "Крахмал", "tbsp", null, ["corn starch", "potato starch", "cornflour", "jo'xori kraxmali", "krahmal", "kraxmal", "крахмал", "крахмала"]],
  // drinks / liquids
  ["water", "drinks", "Water", "Suv", "물", "Вода", "ml", null, ["warm water", "cold water", "boiling water", "suv", "iliq suv", "qaynoq suv", "вода", "воды"]],
  ["stock", "drinks", "Stock", "Sho'rva bulyoni", "육수", "Бульон", "ml", null, ["broth", "chicken stock", "beef stock", "vegetable stock", "bouillon"]],
  ["tea", "drinks", "Tea", "Choy", "차", "Чай", "g", null, ["green tea", "black tea"]],
  ["coffee", "drinks", "Coffee", "Qahva", "커피", "Кофе", "g", null, []],
  ["kimchi", "other", "Kimchi", "Kimchi", "김치", "Кимчи", "g", null, []],
  ["seaweed", "other", "Seaweed", "Dengiz o'ti", "김", "Нори", "pc", 3, ["nori", "laver", "미역"]],
  // general / colloquial items often seen in Uzbek and Russian posts
  ["meat", "meat", "Meat", "Go'sht", "고기", "Мясо", "g", null, ["lahm go'sht", "lahm", "go'shti", "мясо", "мяса", "red meat"]],
  ["spice_mix", "spices", "Mixed spices", "Ziravorlar", "양념", "Специи", "tsp", null, ["ziravor", "ziravorla", "aralash ziravor", "aralash ziravorlar", "spices", "seasoning", "приправа", "приправы", "специи", "priprava"]],
  ["margarine", "oils", "Margarine", "Margarin", "마가린", "Маргарин", "g", null, []],
  ["kefir", "dairy", "Kefir", "Kefir", "케피어", "Кефир", "ml", null, []],
  ["condensed_milk", "dairy", "Condensed milk", "Quyultirilgan sut", "연유", "Сгущёнка", "g", null, ["sgushonka", "sgushenka", "varyonniy sgushonka", "сгущенка", "сгущённое молоко", "сгущенное молоко"]],
  ["gelatin", "baking", "Gelatin", "Jelatin", "젤라틴", "Желатин", "g", null, ["jelatin", "jelatina", "желатин"]],
  ["semolina", "grains", "Semolina", "Manniy yorma", "세몰리나", "Манка", "g", null, ["manniy krupa", "manniy yormasi", "manka", "манная крупа", "манка"]],
  ["cherry", "fruits", "Cherries", "Olcha", "체리", "Вишня", "g", null, ["olcha", "gilos", "вишня", "черешня", "cherry"]],
  ["powdered_sugar", "baking", "Powdered sugar", "Qand upasi", "슈가파우더", "Сахарная пудра", "g", null, ["saxarniy pudra", "saxirniy pudra", "sakharnaya pudra", "сахарная пудра", "icing sugar"]],
  ["olives", "other", "Olives", "Zaytun", "올리브", "Оливки", "g", null, ["zaytun", "маслины", "оливки"]],
];

export const INGREDIENTS = ROWS.map(([id, category, en, uz, ko, ru, unit, gpp, aliases]) => ({
  id, category, names: { en, uz, ko, ru }, unit, gpp, aliases,
}));

export const BY_ID = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));

// Ingredients assumed to be in most kitchens (user can edit in settings).
export const DEFAULT_STAPLES = ["salt", "water", "black_pepper", "oil"];

// Allergen and diet rules: hard exclusions, never ranking weights.
export const ALLERGENS = {
  nuts: ["walnut", "almond", "peanut"],
  peanuts: ["peanut"],
  eggs: ["egg"],
  milk: ["milk", "butter", "cheese", "yogurt", "sour_cream", "cream", "cottage_cheese", "cream_cheese", "kefir", "condensed_milk"],
  seafood: ["fish", "shrimp", "squid", "fish_sauce", "oyster_sauce"],
  shellfish: ["shrimp", "squid", "oyster_sauce"],
  gluten: ["flour", "pasta", "noodles", "bread", "tortilla", "breadcrumbs", "bulgur", "soy_sauce", "yeast", "semolina"],
  soy: ["soy_sauce", "tofu", "doenjang", "gochujang"],
  sesame: ["sesame", "sesame_oil"],
};

export const DIETS = {
  none: [],
  vegetarian: { excludeCategories: ["meat", "seafood"], exclude: ["fish_sauce", "oyster_sauce", "stock"] },
  pescatarian: { excludeCategories: ["meat"], exclude: [] },
  vegan: {
    excludeCategories: ["meat", "seafood", "dairy", "eggs"],
    exclude: ["honey", "fish_sauce", "oyster_sauce", "stock", "mayonnaise"],
  },
};

export const RESTRICTIONS = {
  halal: ["pork"],
  "gluten-free": ALLERGENS.gluten,
  "dairy-free": ALLERGENS.milk,
};

// Ingredient substitutions with an honest note about the effect.
export const SUBSTITUTES = {
  butter: [{ id: "oil", ratio: 0.8, note: "sub_butter_oil" }, { id: "olive_oil", ratio: 0.8, note: "sub_butter_oil" }],
  milk: [{ id: "cream", ratio: 0.5, note: "sub_milk_cream" }, { id: "yogurt", ratio: 1, note: "sub_milk_yogurt" }],
  sour_cream: [{ id: "yogurt", ratio: 1, note: "sub_sourcream_yogurt" }],
  yogurt: [{ id: "sour_cream", ratio: 1, note: "sub_sourcream_yogurt" }],
  cream: [{ id: "milk", ratio: 1, note: "sub_cream_milk" }],
  parsley: [{ id: "coriander", ratio: 1, note: "sub_herb" }, { id: "dill", ratio: 1, note: "sub_herb" }],
  coriander: [{ id: "parsley", ratio: 1, note: "sub_herb" }],
  dill: [{ id: "parsley", ratio: 1, note: "sub_herb" }],
  lemon: [{ id: "lime", ratio: 1, note: "sub_citrus" }, { id: "vinegar", ratio: 0.5, note: "sub_citrus_vinegar" }],
  lime: [{ id: "lemon", ratio: 1, note: "sub_citrus" }],
  green_onion: [{ id: "onion", ratio: 0.5, note: "sub_onion" }, { id: "leek", ratio: 1, note: "sub_onion" }],
  red_onion: [{ id: "onion", ratio: 1, note: "sub_onion" }],
  onion: [{ id: "red_onion", ratio: 1, note: "sub_onion" }, { id: "leek", ratio: 1, note: "sub_onion" }],
  olive_oil: [{ id: "oil", ratio: 1, note: "sub_oil" }],
  oil: [{ id: "olive_oil", ratio: 1, note: "sub_oil" }],
  stock: [{ id: "water", ratio: 1, note: "sub_stock_water" }],
  tomato_paste: [{ id: "tomato_sauce", ratio: 3, note: "sub_tomato" }, { id: "tomato", ratio: 1, note: "sub_tomato" }],
  tomato_sauce: [{ id: "tomato", ratio: 1, note: "sub_tomato" }],
  tomato: [{ id: "tomato_sauce", ratio: 1, note: "sub_tomato" }, { id: "cherry_tomato", ratio: 1, note: "sub_tomato" }],
  breadcrumbs: [{ id: "oats", ratio: 1, note: "sub_crumbs" }],
  honey: [{ id: "sugar", ratio: 1, note: "sub_sweet" }],
  sugar: [{ id: "honey", ratio: 0.75, note: "sub_sweet" }],
  starch: [{ id: "flour", ratio: 2, note: "sub_starch" }],
  baking_powder: [{ id: "baking_soda", ratio: 0.25, note: "sub_bp" }],
  rice: [{ id: "bulgur", ratio: 1, note: "sub_grain" }, { id: "buckwheat", ratio: 1, note: "sub_grain" }],
  pasta: [{ id: "noodles", ratio: 1, note: "sub_pasta" }],
  noodles: [{ id: "pasta", ratio: 1, note: "sub_pasta" }],
  beef: [{ id: "lamb", ratio: 1, note: "sub_meat" }, { id: "meat", ratio: 1, note: "sub_meat" }, { id: "minced_meat", ratio: 1, note: "sub_meat" }],
  meat: [{ id: "beef", ratio: 1, note: "sub_meat" }, { id: "lamb", ratio: 1, note: "sub_meat" }, { id: "chicken", ratio: 1, note: "sub_meat" }],
  margarine: [{ id: "butter", ratio: 1, note: "sub_oil" }],
  kefir: [{ id: "yogurt", ratio: 1, note: "sub_milk_yogurt" }, { id: "milk", ratio: 1, note: "sub_milk_yogurt" }],
  spice_mix: [{ id: "black_pepper", ratio: 1, note: "sub_herb" }],
  lamb: [{ id: "beef", ratio: 1, note: "sub_meat" }],
  minced_meat: [{ id: "beef", ratio: 1, note: "sub_meat" }, { id: "lamb", ratio: 1, note: "sub_meat" }],
  chicken: [{ id: "turkey", ratio: 1, note: "sub_meat" }],
  cheese: [{ id: "cottage_cheese", ratio: 1, note: "sub_cheese" }],
  bell_pepper: [{ id: "zucchini", ratio: 1, note: "sub_veg" }],
  zucchini: [{ id: "eggplant", ratio: 1, note: "sub_veg" }],
};

// Small starter set of plain home recipes. Loaded only when the user asks.
export const SAMPLE_RECIPES = [
  {
    title: "Potato omelette", category: "breakfast", cuisine: "Spanish", difficulty: "easy",
    prepTime: 10, cookTime: 20, servings: 2,
    description: "Sliced potatoes and onion cooked slowly in oil, then set with beaten eggs.",
    ingredients: [
      ["potato", 400, "g", "thinly sliced", true], ["egg", 4, "pc", "", true], ["onion", 1, "pc", "sliced", true],
      ["oil", 4, "tbsp", "", true], ["salt", 1, "tsp", "", true], ["parsley", null, "", "to garnish", false],
    ],
    steps: [
      "Cook the potato and onion in the oil over medium-low heat until soft, about 15 minutes.",
      "Beat the eggs with the salt and stir in the potatoes.",
      "Pour back into the pan and cook until the bottom sets, 4 to 5 minutes.",
      "Turn onto a plate, slide back into the pan and cook the other side for 2 minutes.",
    ],
    timers: [900, 0, 270, 120],
  },
  {
    title: "Vegetable fried rice", category: "dinner", cuisine: "Chinese", difficulty: "easy",
    prepTime: 10, cookTime: 10, servings: 2,
    description: "Day-old rice fried with egg, carrot and onion.",
    ingredients: [
      ["rice", 400, "g", "cooked, preferably cold", true], ["egg", 2, "pc", "", true], ["carrot", 1, "pc", "diced", true],
      ["onion", 1, "pc", "diced", true], ["soy_sauce", 2, "tbsp", "", true], ["oil", 2, "tbsp", "", true],
      ["peas", 80, "g", "", false], ["green_onion", 1, "bunch", "sliced", false],
    ],
    steps: [
      "Heat the oil in a large pan and fry the onion and carrot for 3 minutes.",
      "Push the vegetables aside, add the beaten eggs and scramble.",
      "Add the rice and peas and fry over high heat for 4 minutes.",
      "Season with soy sauce and top with green onion.",
    ],
    timers: [180, 0, 240, 0],
  },
  {
    title: "Potato vegetable soup", category: "lunch", cuisine: "Home", difficulty: "easy",
    prepTime: 10, cookTime: 30, servings: 4,
    description: "A simple soup of potato, carrot and onion.",
    ingredients: [
      ["potato", 500, "g", "cubed", true], ["carrot", 2, "pc", "sliced", true], ["onion", 1, "pc", "diced", true],
      ["celery", 1, "pc", "sliced", true], ["water", 1.5, "l", "or stock", true], ["oil", 2, "tbsp", "", true],
      ["salt", 1, "tsp", "", true], ["dill", 1, "bunch", "chopped", false],
    ],
    steps: [
      "Soften the onion, carrot and celery in the oil for 5 minutes.",
      "Add the potato and water, bring to a boil and simmer for 20 minutes.",
      "Season with salt and finish with dill.",
    ],
    timers: [300, 1200, 0],
  },
  {
    title: "Plov", category: "dinner", cuisine: "Uzbek", difficulty: "medium",
    prepTime: 20, cookTime: 70, servings: 6,
    description: "Rice cooked with lamb, onion, carrot and cumin.",
    ingredients: [
      ["rice", 500, "g", "rinsed", true], ["lamb", 500, "g", "in pieces", true], ["carrot", 500, "g", "cut in strips", true],
      ["onion", 2, "pc", "sliced", true], ["oil", 150, "ml", "", true], ["garlic", 1, "pc", "whole head", true],
      ["cumin", 1, "tsp", "", true], ["salt", 2, "tsp", "", true], ["water", 700, "ml", "", true],
      ["chickpeas", 100, "g", "soaked", false], ["raisins", 30, "g", "", false],
    ],
    steps: [
      "Heat the oil in a heavy pot and brown the lamb.",
      "Add the onion and fry until golden, then add the carrot and cook for 10 minutes.",
      "Add water, cumin, salt, garlic and chickpeas and simmer for 30 minutes.",
      "Spread the rice on top, add water to cover by 1 cm and cook until absorbed.",
      "Gather the rice into a mound, cover and steam on low heat for 20 minutes.",
    ],
    timers: [0, 600, 1800, 0, 1200],
  },
  {
    title: "Shakshuka", category: "breakfast", cuisine: "North African", difficulty: "easy",
    prepTime: 10, cookTime: 20, servings: 2,
    description: "Eggs poached in a spiced tomato and pepper sauce.",
    ingredients: [
      ["egg", 4, "pc", "", true], ["tomato", 4, "pc", "chopped", true], ["bell_pepper", 1, "pc", "diced", true],
      ["onion", 1, "pc", "diced", true], ["garlic", 2, "clove", "minced", true], ["olive_oil", 2, "tbsp", "", true],
      ["paprika", 1, "tsp", "", true], ["cumin", 0.5, "tsp", "", false], ["salt", 1, "tsp", "", true],
      ["coriander", null, "", "to garnish", false],
    ],
    steps: [
      "Cook the onion and pepper in the oil until soft, then add garlic, paprika and cumin.",
      "Add the tomatoes and salt and simmer for 10 minutes.",
      "Make four wells, crack in the eggs, cover and cook until the whites set.",
    ],
    timers: [420, 600, 360],
  },
  {
    title: "Kimchi fried rice", category: "lunch", cuisine: "Korean", difficulty: "easy",
    prepTime: 5, cookTime: 10, servings: 2,
    description: "Rice fried with chopped kimchi and topped with a fried egg.",
    ingredients: [
      ["rice", 400, "g", "cooked", true], ["kimchi", 200, "g", "chopped", true], ["egg", 2, "pc", "", true],
      ["oil", 1, "tbsp", "", true], ["gochujang", 1, "tbsp", "", false], ["sesame_oil", 1, "tsp", "", false],
      ["green_onion", 1, "bunch", "sliced", false], ["seaweed", 2, "pc", "crumbled", false],
    ],
    steps: [
      "Fry the kimchi in the oil for 3 minutes.",
      "Add the rice and gochujang and fry for 4 minutes, then stir in the sesame oil.",
      "Fry the eggs separately and place on top. Finish with green onion and seaweed.",
    ],
    timers: [180, 240, 0],
  },
  {
    title: "Spaghetti with tomato sauce", category: "dinner", cuisine: "Italian", difficulty: "easy",
    prepTime: 5, cookTime: 20, servings: 2,
    description: "Pasta in a garlic and tomato sauce.",
    ingredients: [
      ["pasta", 200, "g", "", true], ["tomato_sauce", 400, "ml", "", true], ["garlic", 2, "clove", "sliced", true],
      ["olive_oil", 2, "tbsp", "", true], ["salt", 1, "tsp", "", true], ["basil", null, "", "to garnish", false],
      ["cheese", 30, "g", "grated", false],
    ],
    steps: [
      "Cook the pasta in salted boiling water until al dente.",
      "Warm the garlic in the oil, add the tomato sauce and simmer for 10 minutes.",
      "Toss the pasta with the sauce and serve with basil and cheese.",
    ],
    timers: [600, 600, 0],
  },
  {
    title: "Overnight oats", category: "breakfast", cuisine: "Home", difficulty: "easy",
    prepTime: 5, cookTime: 0, servings: 1,
    description: "Oats soaked overnight in milk and yogurt.",
    ingredients: [
      ["oats", 50, "g", "", true], ["milk", 120, "ml", "", true], ["yogurt", 60, "g", "", false],
      ["honey", 1, "tbsp", "", false], ["banana", 1, "pc", "sliced", false],
    ],
    steps: ["Mix the oats, milk and yogurt in a jar.", "Cover and refrigerate overnight.", "Top with banana and honey."],
    timers: [0, 0, 0],
  },
];
