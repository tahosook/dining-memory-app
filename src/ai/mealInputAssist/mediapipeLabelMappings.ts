import type { CuisineTypeOption } from '../../constants/MealOptions';

type LabelMapping = {
  mealName?: string;
  cuisineType?: CuisineTypeOption;
  excludeFromSuggestions?: boolean;
  axis?: 'main' | 'side' | 'scene';
  cleanName?: string;
};

export const LABEL_MAPPING: Record<string, LabelMapping> = {
  // --- Legacy 9 Classes & Historical Models ---
  ramen: { mealName: 'ラーメン', cuisineType: '中華' },
  udon: { mealName: 'うどん', cuisineType: '和食' },
  soba: { mealName: 'そば', cuisineType: '和食' },
  sushi: { mealName: '寿司', cuisineType: '和食' },
  curry_rice: { mealName: 'カレーライス', cuisineType: '洋食' },
  set_meal: { mealName: '定食', cuisineType: '和食' },
  dessert: { mealName: 'デザート', cuisineType: 'その他' },
  drink: { mealName: '飲み物', cuisineType: 'その他' },
  bento: { mealName: '弁当', cuisineType: '和食' },
  fish_dish: { mealName: '魚料理', cuisineType: '和食' },
  fried_dish: { mealName: '揚げ物', cuisineType: 'その他' },
  meat_dish: { mealName: '肉料理', cuisineType: 'その他' },
  noodles: { mealName: '麺類', cuisineType: 'その他' },
  simmered_dish: { mealName: '煮物', cuisineType: '和食' },
  stir_fry: { mealName: '炒め物', cuisineType: '中華' },
  other_or_exclude: { excludeFromSuggestions: true },

  // --- Universal Dining Scene (7 classes, Issue-23) ---
  home_teishoku_set: { mealName: 'おうち定食', cuisineType: '和食' },
  one_plate_or_curry: { mealName: 'ワンプレート・カレー', cuisineType: '洋食' },
  izakaya_bistro_or_party: { mealName: '晩酌・パーティー', cuisineType: 'その他' },
  noodles_or_single_bowl: { mealName: '麺・単品ボウル', cuisineType: 'その他' },
  dining_out_or_tray_meal: { mealName: '外食・トレイ飯', cuisineType: 'その他' },
  drink_or_bottle_record: { mealName: 'お酒・ドリンク', cuisineType: 'その他' },
  non_food_or_exclude: { excludeFromSuggestions: true },

  // --- Personal Household & Wife's Cooking (8 classes, Issue-23) ---
  wife_multi_dish_teishoku: { mealName: '一汁複数菜・夕定食', cuisineType: '和食' },
  wife_nordic_one_plate: { mealName: '北欧大皿ワンプレート', cuisineType: '洋食' },
  wife_curry_or_ethnic_plate: { mealName: '特製カレー・エスニック皿', cuisineType: '洋食' },
  wife_morning_salmon_natto: { mealName: '焼き鮭＆納豆の和朝食', cuisineType: '和食' },
  wife_bistro_baguette_bal: { mealName: '洋風ビストロ・おうちバル', cuisineType: '洋食' },
  wife_izakaya_small_dishes: { mealName: 'おうち居酒屋・染付晩酌膳', cuisineType: '和食' },
  household_pot_noodles_or_ramen_rice: { mealName: '鍋麺・ラーメンライス', cuisineType: 'その他' },
  special_takeout_party_feast: { mealName: 'テイクアウト宴席', cuisineType: 'その他' },

  // =========================================================================
  // --- Universal Dining 23 Classes (Issue-24) ---
  // =========================================================================
  teishoku_fish: { mealName: '焼き魚定食', cuisineType: '和食' },
  teishoku_pork_ginger_stirfry: { mealName: '生姜焼き・豚肉炒め定食', cuisineType: '和食' },
  teishoku_chicken: { mealName: 'チキンソテー・鶏肉料理定食', cuisineType: '和食' },
  teishoku_fried_meat: { mealName: '唐揚げ・フライ定食', cuisineType: 'その他' },
  teishoku_hamburg: { mealName: 'ハンバーグ定食', cuisineType: '洋食' },
  teishoku_simmered_stew: { mealName: '肉じゃが・煮物定食', cuisineType: '和食' },
  teishoku_general_multi_dish: { mealName: '一汁三菜・おうち定食', cuisineType: '和食' },
  breakfast_japanese_natto: { mealName: '納豆・味噌汁の和朝食', cuisineType: '和食' },
  breakfast_western_toast: { mealName: 'トースト＆目玉焼き朝食', cuisineType: '洋食' },
  noodles_ramen: { mealName: 'ラーメン・中華麺', cuisineType: '中華' },
  noodles_udon: { mealName: 'うどん', cuisineType: '和食' },
  noodles_soba: { mealName: 'そば', cuisineType: '和食' },
  pasta_dishes: { mealName: 'パスタ・スパゲッティ', cuisineType: '洋食' },
  curry_keema: { mealName: '特製キーマカレー', cuisineType: '洋食' },
  curry_hayashi_ethnic: { mealName: 'カレー・ハヤシライス', cuisineType: '洋食' },
  donburi_omurice: { mealName: '丼もの・オムライス', cuisineType: 'その他' },
  fried_rice_pilaf: { mealName: 'チャーハン・炊き込みご飯', cuisineType: '中華' },
  pot_stew_nabe: { mealName: '鍋料理・すき焼き', cuisineType: '和食' },
  izakaya_appetizers: { mealName: 'おうち居酒屋・おつまみ小鉢', cuisineType: '和食' },
  bal_ajillo_pizza: { mealName: 'おうちバル・アヒージョ', cuisineType: '洋食' },
  chuka_gyoza_mapo: { mealName: '餃子・麻婆豆腐', cuisineType: '中華' },
  alcohol_drink_record: { mealName: 'お酒・ドリンク', cuisineType: 'その他' },
  non_food_exclude: { excludeFromSuggestions: true },

  // =========================================================================
  // --- Personal 3-Axis Multi-Label 44 Tags (Issue-25) ---
  // =========================================================================
  // 1. Main Dish (20 tags)
  main_grilled_fish: {
    axis: 'main',
    mealName: '焼き魚定食',
    cleanName: '焼き魚',
    cuisineType: '和食',
  },
  main_pork_ginger_stirfry: {
    axis: 'main',
    mealName: '生姜焼き・豚肉炒め定食',
    cleanName: '生姜焼き',
    cuisineType: '和食',
  },
  main_chicken_dish: {
    axis: 'main',
    mealName: 'チキンソテー・鶏肉料理定食',
    cleanName: 'チキンソテー',
    cuisineType: '和食',
  },
  main_fried_meat: {
    axis: 'main',
    mealName: '唐揚げ・フライ定食',
    cleanName: '唐揚げ',
    cuisineType: 'その他',
  },
  main_hamburg: {
    axis: 'main',
    mealName: 'ハンバーグ定食',
    cleanName: 'ハンバーグ',
    cuisineType: '洋食',
  },
  main_simmered_meat_potato: {
    axis: 'main',
    mealName: '肉じゃが・角煮定食',
    cleanName: '肉じゃが',
    cuisineType: '和食',
  },
  main_keema_curry: {
    axis: 'main',
    mealName: '特製キーマカレー',
    cleanName: '特製キーマカレー',
    cuisineType: '洋食',
  },
  main_curry_hayashi: {
    axis: 'main',
    mealName: 'カレー・ハヤシライス',
    cleanName: 'カレーライス',
    cuisineType: '洋食',
  },
  main_ethnic_gapao: {
    axis: 'main',
    mealName: 'ガパオ・エスニック',
    cleanName: 'ガパオライス',
    cuisineType: '洋食',
  },
  main_ramen: {
    axis: 'main',
    mealName: 'ラーメン・つけ麺',
    cleanName: 'ラーメン',
    cuisineType: '中華',
  },
  main_udon: { axis: 'main', mealName: 'うどん', cleanName: 'うどん', cuisineType: '和食' },
  main_soba: { axis: 'main', mealName: 'そば', cleanName: 'そば', cuisineType: '和食' },
  main_japanese_noodles: {
    axis: 'main',
    mealName: 'うどん・そば',
    cleanName: 'うどん・そば',
    cuisineType: '和食',
  },
  main_pasta: {
    axis: 'main',
    mealName: 'パスタ・スパゲッティ',
    cleanName: 'パスタ',
    cuisineType: '洋食',
  },
  main_gyoza_dimsum: {
    axis: 'main',
    mealName: '焼き餃子・点心',
    cleanName: '焼き餃子',
    cuisineType: '中華',
  },
  main_mapo_chuka: {
    axis: 'main',
    mealName: '麻婆豆腐・中華炒め',
    cleanName: '麻婆豆腐',
    cuisineType: '中華',
  },
  main_hotpot: {
    axis: 'main',
    mealName: '卓上鍋・すき焼き',
    cleanName: '鍋料理',
    cuisineType: '和食',
  },
  main_bal_ajillo: {
    axis: 'main',
    mealName: 'アヒージョ・バル主菜',
    cleanName: 'アヒージョ',
    cuisineType: '洋食',
  },
  main_donburi: { axis: 'main', mealName: '丼もの', cleanName: '丼もの', cuisineType: 'その他' },
  main_fried_rice: {
    axis: 'main',
    mealName: 'チャーハン・炒飯',
    cleanName: 'チャーハン',
    cuisineType: '中華',
  },
  main_sashimi_seafood: {
    axis: 'main',
    mealName: 'お刺身・海鮮',
    cleanName: 'お刺身',
    cuisineType: '和食',
  },

  // 2. Side Dish & Soup (14 tags)
  side_simmered_pumpkin: { axis: 'side', cleanName: 'かぼちゃの煮物' },
  side_kinpira: { axis: 'side', cleanName: 'きんぴらごぼう' },
  side_tonjiru_soup: { axis: 'side', cleanName: '具だくさん豚汁' },
  side_miso_soup: { axis: 'side', cleanName: 'お味噌汁' },
  side_veggie_soup: { axis: 'side', cleanName: '野菜スープ' },
  side_tofu_hiyayakko: { axis: 'side', cleanName: '冷奴' },
  side_natto_pack: { axis: 'side', cleanName: '納豆' },
  side_egg_dish: { axis: 'side', cleanName: 'たまご料理' },
  side_salad_greens: { axis: 'side', cleanName: 'サラダ' },
  side_chikuzenni_root: { axis: 'side', cleanName: '筑前煮' },
  side_sauteed_mushrooms: { axis: 'side', cleanName: '舞茸ソテー' },
  side_pickles_kimchi: { axis: 'side', cleanName: 'お漬物' },
  side_cut_fruit: { axis: 'side', cleanName: 'カットフルーツ' },
  side_izakaya_appetizer: { axis: 'side', cleanName: 'おつまみ小鉢' },
  side_none: { axis: 'side', excludeFromSuggestions: true, cleanName: '' },

  // 3. Scene (10 tags)
  scene_teishoku_multi_dish: { axis: 'scene', cleanName: '一汁三菜・夕定食' },
  scene_one_plate: { axis: 'scene', cleanName: 'ワンプレート' },
  scene_quick_single_meal: { axis: 'scene', cleanName: 'サクッと平日飯' },
  scene_japanese_breakfast: { axis: 'scene', cleanName: '定番の和朝食' },
  scene_western_breakfast: { axis: 'scene', cleanName: 'パンの洋朝食' },
  scene_izakaya_night: { axis: 'scene', cleanName: 'おうち居酒屋・晩酌' },
  scene_weekend_bal: { axis: 'scene', cleanName: '週末おうちバル' },
  scene_holiday_noodles: { axis: 'scene', cleanName: '休日のあつあつ麺' },
  scene_tabletop_hotpot: { axis: 'scene', cleanName: '冬の団らん卓上鍋' },
  scene_party_feast: { axis: 'scene', cleanName: 'ごちそう宴席パーティー' },
};
