// Approximate food facts per ingredient: [kcal per 100 g, protein g per 100 g, price in Korean won per kg (or litre)].
// Nutrition is for the raw ingredient (standard food-table values, rounded). Prices are rough Korean online-grocery
// levels, not live data: they only make recipe costs comparable, and every price can be changed in Profile.
export const FACTS = {
  // vegetables
  potato: [77, 2, 4000], onion: [40, 1.1, 3000], red_onion: [40, 1.1, 5000], green_onion: [32, 1.8, 7000], garlic: [149, 6.4, 12000], carrot: [41, 0.9, 4000],
  tomato: [18, 0.9, 8000], cherry_tomato: [18, 0.9, 10000], cucumber: [15, 0.7, 6000], bell_pepper: [31, 1, 12000], chili: [40, 1.9, 15000], cabbage: [25, 1.3, 2500],
  napa_cabbage: [16, 1.2, 2500], broccoli: [34, 2.8, 9000], cauliflower: [25, 1.9, 9000], zucchini: [17, 1.2, 5000], eggplant: [25, 1, 7000], pumpkin: [26, 1, 4000],
  spinach: [23, 2.9, 10000], lettuce: [15, 1.4, 12000], mushroom: [22, 3.1, 12000], corn: [86, 3.3, 8000], peas: [81, 5.4, 9000], beet: [43, 1.6, 7000], radish: [16, 0.7, 2500],
  ginger: [80, 1.8, 15000], celery: [16, 0.7, 9000], leek: [61, 1.5, 7000], sweet_potato: [86, 1.6, 6000], bean_sprouts: [30, 3, 4000], turnip: [28, 0.9, 5000], pickles: [11, 0.3, 9000],
  // fruits
  apple: [52, 0.3, 8000], banana: [89, 1.1, 4000], orange: [47, 0.9, 7000], lemon: [29, 1.1, 9000], lime: [30, 0.7, 15000], strawberry: [32, 0.7, 15000], berries: [50, 0.8, 18000],
  raisins: [299, 3.1, 12000], avocado: [160, 2, 15000], pear: [57, 0.4, 8000], dried_apricot: [241, 3.4, 18000], quince: [57, 0.4, 9000], cherry: [50, 1, 20000], mango: [60, 0.8, 12000],
  grapefruit: [42, 0.8, 7000], pineapple: [50, 0.5, 6000], watermelon: [30, 0.6, 3000], kiwi: [61, 1.1, 10000], peach: [39, 0.9, 9000], nectarine: [44, 1.1, 10000], dates: [282, 2.5, 15000],
  prunes: [240, 2.2, 15000], cranberry: [308, 0.1, 20000], pomegranate: [83, 1.7, 12000], plum: [46, 0.7, 10000],
  // herbs
  parsley: [36, 3, 30000], dill: [43, 3.5, 40000], coriander: [23, 2.1, 30000], basil: [23, 3.2, 50000], mint: [44, 3.3, 50000], rosemary: [131, 3.3, 60000], thyme: [101, 5.6, 60000], greens: [30, 2.5, 30000],
  // meat and fish
  beef: [200, 20, 40000], lamb: [280, 17, 35000], chicken: [140, 20, 9000], pork: [240, 17, 15000], turkey: [135, 22, 15000], sausage: [300, 12, 12000], minced_meat: [250, 18, 20000], meat: [220, 19, 30000],
  salami: [400, 22, 30000], prosciutto: [250, 26, 60000], veal: [150, 20, 45000], tail_fat: [800, 2, 20000], ribs: [280, 17, 35000], quail: [190, 20, 25000],
  fish: [150, 20, 20000], shrimp: [85, 20, 25000], squid: [92, 16, 15000], seafood_mix: [85, 16, 15000],
  // dairy and eggs
  milk: [62, 3.2, 2800], butter: [717, 0.9, 20000], cheese: [350, 25, 20000], yogurt: [61, 3.5, 5000], sour_cream: [200, 2.5, 12000], cream: [340, 2, 10000], cottage_cheese: [120, 16, 15000],
  cream_cheese: [340, 6, 18000], kefir: [50, 3, 6000], condensed_milk: [320, 8, 8000], ice_cream: [207, 3.5, 10000], egg: [143, 12.6, 7000],
  // grains, pasta, legumes
  rice: [350, 7, 4000], flour: [364, 10, 2000], oats: [380, 13, 6000], buckwheat: [343, 13, 10000], bulgur: [342, 12, 8000], breadcrumbs: [395, 13, 6000], semolina: [360, 12, 6000], bran: [250, 16, 8000],
  pasta: [370, 13, 4000], noodles: [350, 10, 5000], beans: [333, 23, 10000], chickpeas: [364, 19, 8000], lentils: [352, 25, 9000], mung: [347, 24, 10000], tofu: [76, 8, 5000],
  // nuts and seeds
  walnut: [654, 15, 20000], almond: [579, 21, 18000], peanut: [567, 26, 10000], sesame: [573, 18, 15000], coconut_flakes: [660, 7, 15000], chia: [486, 17, 15000], flax: [534, 18, 10000],
  cashew: [553, 18, 20000], pistachio: [562, 20, 35000], hazelnut: [628, 15, 30000], pumpkin_seeds: [559, 30, 20000], sunflower_seeds: [584, 21, 12000], poppy_seeds: [525, 18, 25000], pine_nuts: [673, 14, 80000],
  // bakery
  bread: [265, 9, 8000], tortilla: [300, 8, 10000], pizza_base: [270, 9, 12000], cookies: [480, 6, 12000],
  // spices
  salt: [0, 0, 1500], black_pepper: [250, 10, 40000], cumin: [375, 18, 40000], paprika: [280, 14, 30000], chili_flakes: [280, 12, 25000], turmeric: [310, 9, 30000], cinnamon: [250, 4, 30000],
  coriander_seed: [300, 12, 30000], bay_leaf: [310, 8, 80000], oregano: [265, 9, 60000], curry: [325, 14, 30000], spice_mix: [280, 10, 30000], nutmeg: [525, 6, 60000],
  // sauces
  soy_sauce: [53, 8, 5000], ketchup: [110, 1.2, 5000], mayonnaise: [680, 1, 7000], tomato_paste: [82, 4.3, 7000], tomato_sauce: [30, 1.3, 5000], vinegar: [18, 0, 3000], mustard: [66, 4, 10000],
  gochujang: [220, 5, 8000], doenjang: [200, 12, 7000], honey: [304, 0.3, 15000], fish_sauce: [35, 5, 8000], oyster_sauce: [51, 1.4, 8000], capers: [23, 2.4, 30000], pomegranate_sauce: [270, 0.5, 20000],
  balsamic: [88, 0.5, 15000], adjika: [60, 2, 15000], jam: [250, 0.4, 9000],
  // oils
  oil: [884, 0, 5000], olive_oil: [884, 0, 15000], sesame_oil: [884, 0, 20000], margarine: [717, 0.2, 8000],
  // baking
  sugar: [387, 0, 2000], baking_powder: [53, 0, 15000], baking_soda: [0, 0, 5000], yeast: [325, 40, 20000], vanilla: [288, 0, 100000], cocoa: [228, 20, 20000], chocolate: [546, 5, 20000],
  starch: [381, 0.3, 5000], gelatin: [335, 86, 60000], powdered_sugar: [389, 0, 5000], sweetener: [0, 0, 15000], protein_powder: [380, 78, 40000], psyllium: [200, 2, 40000], agar: [300, 6, 80000],
  food_coloring: [0, 0, 100000], chocolate_spread: [540, 6, 15000],
  // drinks and other
  water: [0, 0, 0], stock: [5, 0.5, 2000], tea: [1, 0, 50000], coffee: [2, 0.1, 30000], matcha: [324, 30, 100000], tomato_juice: [17, 0.8, 4000], ice: [0, 0, 0],
  kimchi: [23, 1.1, 8000], seaweed: [35, 5, 50000], olives: [115, 0.8, 15000],
};
// Grams of one tablespoon-volume unit differ a lot between oil, flour and spices: grams per millilitre by category.
export const DENSITY = { grains: 0.6, baking: 0.8, spices: 0.5, nuts: 0.6, herbs: 0.2, legumes: 0.8, pasta: 0.5, bakery: 0.4, vegetables: 0.6, fruits: 0.65, meat: 1, seafood: 1, dairy: 1, eggs: 1, sauces: 1.1, oils: 0.92, drinks: 1, other: 0.8 };
// Grams of a bunch, where it is not the usual 40 g of herbs.
export const BUNCH = { green_onion: 100, spinach: 200, lettuce: 150, celery: 300, leek: 250, radish: 250, greens: 60 };
