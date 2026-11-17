export type Course = {
  title: string;
  image: string;
  nutrition?: Nutrition;
};

export type MealTemplate = {
  title: string;
  description: string;
  image: string;
  tag: string;
  firstCourse: Course;
  secondCourse: Course;
};

const firstCourses: Course[] = [
  { title: "Борщ (сметана, горчица, сало)", image: "/menu/01-borscht.png", nutrition: { calories: 345, protein: 16, fat: 24, carbs: 19, weight: 300 } },
  { title: "Суп грибной с курицей (сухарики)", image: "/menu/02-chicken-mushroom-soup-croutons.png", nutrition: { calories: 280, protein: 20, fat: 16, carbs: 17, weight: 300 } },
  { title: "Суп гороховый (сухарики, жареный бекон)", image: "/menu/03-pea-soup-bacon-croutons.png", nutrition: { calories: 380, protein: 24, fat: 18, carbs: 37, weight: 300 } },
  { title: "Свекольник (сметана, половинка яйца)", image: "/menu/04-svekolnik-sour-cream-egg.png", nutrition: { calories: 300, protein: 17, fat: 18, carbs: 20, weight: 300 } },
  { title: "Куриный бульон с лапшой и яйцом (сухарики)", image: "/menu/05-chicken-noodle-egg-soup-croutons.png", nutrition: { calories: 285, protein: 23, fat: 14, carbs: 16, weight: 300 } },
  { title: "Суп с мясными фрикадельками и рисом (сухарики)", image: "/menu/06-meatball-rice-soup-croutons.png", nutrition: { calories: 310, protein: 16, fat: 18, carbs: 23, weight: 300 } },
  { title: "Суп с куриным филе и овощами (сухарики)", image: "/menu/07-chicken-vegetable-soup-croutons.png", nutrition: { calories: 270, protein: 28, fat: 9, carbs: 15, weight: 300 } },
  { title: "Суп харчо со свининой (сметана, зелень, лепёшка)", image: "/menu/08-pork-kharcho-flatbread.png", nutrition: { calories: 360, protein: 20, fat: 18, carbs: 33, weight: 300 } },
  { title: "Суп со свининой, томлёным перцем и фасолью", image: "/menu/09-pork-pepper-bean-soup.png", nutrition: { calories: 300, protein: 19, fat: 18, carbs: 20, weight: 300 } },
  { title: "Щи (сметана)", image: "/menu/10-shchi-sour-cream.png", nutrition: { calories: 300, protein: 18, fat: 18, carbs: 23, weight: 300 } },
  { title: "Суп сливочно-сырный с курицей (сухарики)", image: "/menu/11-creamy-cheese-chicken-soup.png", nutrition: { calories: 305, protein: 20, fat: 16, carbs: 21, weight: 300 } },
  { title: "Суп рыбный (лимон, зелень)", image: "/menu/12-fish-soup-lemon-herbs.png", nutrition: { calories: 280, protein: 24, fat: 13, carbs: 24, weight: 300 } },
  { title: "Солянка сборная (сметана, лимон)", image: "/menu/13-solyanka-sour-cream-lemon.png", nutrition: { calories: 280, protein: 16, fat: 17, carbs: 13, weight: 300 } },
  { title: "Суп сливочно-грибной с курицей (сухарики)", image: "/menu/14-creamy-mushroom-chicken-soup.png", nutrition: { calories: 280, protein: 21, fat: 15, carbs: 19, weight: 300 } },
  { title: "Суп со свиными рёбрами и томлёным перцем", image: "/menu/15-pork-rib-pepper-soup.png", nutrition: { calories: 270, protein: 16, fat: 17, carbs: 13, weight: 300 } },
  { title: "Суп гречневый со свининой (жареный бекон, грибы)", image: "/menu/16-buckwheat-pork-bacon-mushroom-soup.png", nutrition: { calories: 350, protein: 18, fat: 19, carbs: 27, weight: 300 } },
  { title: "Суп сливочно-куриный с цветной капустой и кукурузой (сухарики)", image: "/menu/17-creamy-chicken-cauliflower-corn-soup.png", nutrition: { calories: 230, protein: 19, fat: 11, carbs: 13, weight: 300 } },
  { title: "Суп со свининой, чечевицей, томлёным перцем и вялеными томатами", image: "/menu/18-pork-lentil-sundried-tomato-soup.png", nutrition: { calories: 400, protein: 25, fat: 20, carbs: 32, weight: 300 } },
  { title: "Суп со свининой и печёными овощами", image: "/menu/19-pork-roasted-vegetable-soup.png", nutrition: { calories: 305, protein: 15, fat: 24, carbs: 21, weight: 300 } },
  { title: "Суп с куриными фрикадельками и овощами (сухарики)", image: "/menu/20-chicken-meatball-vegetable-soup.png", nutrition: { calories: 295, protein: 24, fat: 18, carbs: 9, weight: 300 } },
  { title: "Суп рыбный со шпинатом и томатами (лимон)", image: "/menu/21-fish-spinach-tomato-soup.png", nutrition: { calories: 280, protein: 26, fat: 13, carbs: 13, weight: 300 } },
  { title: "Рассольник (сметана)", image: "/menu/22-rassolnik-sour-cream.png", nutrition: { calories: 400, protein: 19, fat: 19, carbs: 37, weight: 300 } },
  { title: "Суп томатный со свининой (лепёшка)", image: "/menu/23-tomato-pork-soup-flatbread.png", nutrition: { calories: 330, protein: 16, fat: 24, carbs: 13, weight: 300 } },
  { title: "Окрошка с копчёной курицей", image: "/menu/24-okroshka-smoked-chicken.png", nutrition: { calories: 290, protein: 19, fat: 16, carbs: 31, weight: 300 } },
  { title: "Пряный томатный суп с мясным фаршем (чили кон карне, лепёшка)", image: "/menu/25-chili-con-carne-soup-flatbread.png", nutrition: { calories: 380, protein: 19, fat: 29, carbs: 18, weight: 300 } },
  { title: "Суп томатный с морепродуктами (лепёшка, лимон)", image: "/menu/26-tomato-seafood-soup.png", nutrition: { calories: 310, protein: 19, fat: 15, carbs: 35, weight: 300 } },
  { title: "Суп куриный со шпинатом и яйцом (сухарики)", image: "/menu/27-chicken-spinach-egg-soup.png", nutrition: { calories: 315, protein: 21, fat: 14, carbs: 22, weight: 300 } },
  { title: "Суп со свининой и зелёным горошком", image: "/menu/28-pork-green-pea-soup.png", nutrition: { calories: 370, protein: 17, fat: 24, carbs: 20, weight: 300 } },
  { title: "Суп сливочно-рыбный с вялеными томатами", image: "/menu/29-creamy-fish-sundried-tomato-soup.png", nutrition: { calories: 310, protein: 25, fat: 17, carbs: 13, weight: 300 } },
  { title: "Шурпа из свинины (лепёшка, зелень)", image: "/menu/30-pork-shurpa-flatbread.png", nutrition: { calories: 310, protein: 17, fat: 21, carbs: 14, weight: 300 } }
];

const secondCourses: Course[] = [
  { title: "Котлеты куриные с пюре и сливочно-грибным соусом", image: "/menu/31-chicken-cutlets-mashed-potato-mushroom-sauce.png", nutrition: { calories: 650, protein: 42, fat: 39, carbs: 33, weight: 400 } },
  { title: "Тефтели из домашнего фарша в томатно-сметанном соусе с пюре", image: "/menu/32-meatballs-tomato-sour-cream-mashed-potato.png", nutrition: { calories: 640, protein: 27, fat: 39, carbs: 43, weight: 400 } },
  { title: "Картофель, тушённый со свининой и овощами", image: "/menu/33-braised-potato-pork-vegetables.png", nutrition: { calories: 670, protein: 23, fat: 38, carbs: 60, weight: 400 } },
  { title: "Рагу овощное с курицей", image: "/menu/34-chicken-vegetable-stew.png", nutrition: { calories: 540, protein: 27, fat: 33, carbs: 35, weight: 400 } },
  { title: "Рис с куриным филе, запечённым с сыром и грибами", image: "/menu/35-rice-chicken-cheese-mushrooms.png", nutrition: { calories: 700, protein: 41, fat: 34, carbs: 55, weight: 400 } },
  { title: "Перец фаршированный с пюре и соусом «Дзадзики»", image: "/menu/36-stuffed-pepper-mashed-potato-tzatziki.png", nutrition: { calories: 570, protein: 20, fat: 34, carbs: 42, weight: 400 } },
  { title: "Рис со шницелем из курицы и соусом тартар", image: "/menu/37-chicken-schnitzel-rice-tartar.png", nutrition: { calories: 690, protein: 37, fat: 22, carbs: 83, weight: 400 } },
  { title: "Гречка со шницелем из свинины и соусом из печёных овощей", image: "/menu/38-pork-schnitzel-buckwheat-roasted-vegetable-sauce.png", nutrition: { calories: 640, protein: 40, fat: 27, carbs: 61, weight: 400 } },
  { title: "Зраза из домашнего фарша с яйцом и зеленью, гречкой и сливочно-грибным соусом", image: "/menu/39-meat-zrazy-egg-buckwheat-mushroom-sauce.png", nutrition: { calories: 800, protein: 35, fat: 55, carbs: 49, weight: 400 } },
  { title: "Котлеты из двух видов рыб с рисом и икорным соусом", image: "/menu/40-fish-cutlets-rice-caviar-sauce.png", nutrition: { calories: 690, protein: 44, fat: 35, carbs: 45, weight: 400 } },
  { title: "Зраза картофельная с фаршем, овощами и соусом «Сливочный демиглас»", image: "/menu/41-potato-zraza-meat-vegetables-demiglace.png", nutrition: { calories: 650, protein: 15, fat: 41, carbs: 58, weight: 400 } },
  { title: "Рыба, жаренная в кляре, с рисом и соусом «Азиатский чили»", image: "/menu/42-battered-fish-rice-asian-chili.png", nutrition: { calories: 660, protein: 35, fat: 23, carbs: 78, weight: 400 } },
  { title: "Куриная грудка в кляре с картофельным пюре и сливочно-грибным соусом", image: "/menu/43-battered-chicken-mashed-potato-mushroom-sauce.png", nutrition: { calories: 590, protein: 34, fat: 32, carbs: 44, weight: 400 } },
  { title: "Паста с курицей и овощами в томатном соусе", image: "/menu/44-chicken-vegetable-tomato-pasta.png", nutrition: { calories: 500, protein: 26, fat: 23, carbs: 44, weight: 400 } },
  { title: "Паста с запечённым куриным филе в травах и перечным соусом", image: "/menu/45-herb-chicken-pepper-sauce-pasta.png", nutrition: { calories: 590, protein: 44, fat: 21, carbs: 52, weight: 400 } },
  { title: "Жареный рис с креветками и овощами", image: "/menu/46-shrimp-fried-rice-vegetables.png", nutrition: { calories: 620, protein: 26, fat: 25, carbs: 70, weight: 400 } },
  { title: "Карри с креветками, апельсином и рисом", image: "/menu/47-shrimp-orange-curry-rice.png", nutrition: { calories: 620, protein: 20, fat: 31, carbs: 59, weight: 400 } },
  { title: "Запечённая рыба с овощами и соусом «Ромеско»", image: "/menu/48-baked-fish-vegetables-romesco.png", nutrition: { calories: 560, protein: 36, fat: 37, carbs: 24, weight: 400 } },
  { title: "Рулет из свинины с яблоками и перцем, картофелем по-деревенски и соусом BBQ", image: "/menu/49-pork-roulade-apple-pepper-potatoes-bbq.png", nutrition: { calories: 690, protein: 38, fat: 25, carbs: 76, weight: 400 } },
  { title: "Бефстроганов из говядины с картофельным пюре, беконом и солёным огурчиком", image: "/menu/50-beef-stroganoff-mashed-potato-bacon-pickle.png", nutrition: { calories: 650, protein: 32, fat: 42, carbs: 37, weight: 400 } },
  { title: "Рулет из куриного фарша с грибами и плавленым сыром, с картофельным пюре и зеленью", image: "/menu/51-chicken-mince-roulade-mushroom-cheese-mashed-potato.png", nutrition: { calories: 650, protein: 36, fat: 39, carbs: 39, weight: 400 } },
  { title: "Томлёная свинина в соусе «Демиглас» с гречкой", image: "/menu/52-braised-pork-demiglace-buckwheat.png", nutrition: { calories: 660, protein: 42, fat: 27, carbs: 63, weight: 400 } },
  { title: "Рваная свинина с соусом «Харисса» и печёным картофелем", image: "/menu/53-pulled-pork-harissa-baked-potato.png", nutrition: { calories: 690, protein: 29, fat: 34, carbs: 69, weight: 400 } },
  { title: "Ленивые голубцы в томатно-сметанном соусе с картофельным пюре", image: "/menu/54-lazy-cabbage-rolls-mashed-potato.png", nutrition: { calories: 590, protein: 24, fat: 34, carbs: 46, weight: 400 } },
  { title: "Котлеты из домашнего фарша с гречкой и соусом из печёных овощей", image: "/menu/55-meat-cutlets-buckwheat-roasted-vegetable-sauce.png", nutrition: { calories: 700, protein: 33, fat: 39, carbs: 57, weight: 400 } },
  { title: "Рис с утиной грудкой и овощами", image: "/menu/56-rice-duck-breast-vegetables.png", nutrition: { calories: 680, protein: 39, fat: 31, carbs: 57, weight: 400 } },
  { title: "Томлёная говядина с овощами и перечным соусом", image: "/menu/57-braised-beef-vegetables-pepper-sauce.png", nutrition: { calories: 600, protein: 40, fat: 34, carbs: 31, weight: 400 } },
  { title: "Паста «Арраббиата» с рваной свининой", image: "/menu/58-arrabbiata-pulled-pork.png", nutrition: { calories: 520, protein: 28, fat: 18, carbs: 58, weight: 400 } },
  { title: "Запечённая куриная грудка с травами, овощами и трюфельным соусом", image: "/menu/59-baked-chicken-breast-vegetables-truffle-sauce.png", nutrition: { calories: 450, protein: 39, fat: 18, carbs: 26, weight: 400 } },
  { title: "Куриное бедро с огня с овощами и соусом «Чимичурри»", image: "/menu/60-grilled-chicken-thigh-vegetables-chimichurri.png", nutrition: { calories: 530, protein: 25, fat: 37, carbs: 39, weight: 400 } }
];

const MENU_ANCHOR_UTC = Date.UTC(2026, 6, 31);
const MENU_CYCLE_DAYS = firstCourses.length;
let cachedMenuCycle: MealTemplate[] | undefined;

function shuffled<T>(items: T[], seed: number) {
  const result = [...items];
  let state = seed >>> 0;

  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);

    [result[index], result[swapIndex]] = [
      result[swapIndex],
      result[index]
    ];
  }

  return result;
}

function getMenuCycle() {
  if (cachedMenuCycle) return cachedMenuCycle;

  // Repeat one fixed permutation: any 30 consecutive dates must contain
  // all 30 soups and all 30 mains, including across cycle boundaries.
  const normalizedBlock = 0;

  const soups = shuffled(
    firstCourses,
    0x51f15e5d ^ Math.imul(normalizedBlock + 1, 0x9e3779b1)
  );

  const mains = shuffled(
    secondCourses,
    0x7a2d3c49 ^ Math.imul(normalizedBlock + 1, 0x85ebca6b)
  );

  const block = soups.map((firstCourse, index) => {
    const secondCourse = mains[index];

    return {
      title: `${firstCourse.title} + ${secondCourse.title}`,
      description: "Первое и второе блюдо дня",
      image: firstCourse.image,
      tag: "Меню дня",
      firstCourse,
      secondCourse
    };
  });

  cachedMenuCycle = block;

  return block;
}

export function getMealTemplateForDate(isoDate: string): MealTemplate {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return getMenuCycle()[0];
  }

  const [, year, month, day] = match;

  const value = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day)
  );

  const dayIndex = Math.floor(
    (value - MENU_ANCHOR_UTC) / 86_400_000
  );

  const dayInCycle = ((dayIndex % MENU_CYCLE_DAYS) + MENU_CYCLE_DAYS) % MENU_CYCLE_DAYS;

  return getMenuCycle()[dayInCycle];
}

export const mealTemplates = getMenuCycle();

export type Nutrition = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  weight: number;
};

export function getCourseDetails(course: Course, kind: "first" | "second") {
  // Base dish values supplied by the kitchen; optional sour cream/croutons
  // are not included in these values.
  const storedCourse = (kind === "first" ? firstCourses : secondCourses)
    .find((item) => item.image === course.image || item.title === course.title);
  const nutrition = course.nutrition ?? storedCourse?.nutrition;
  if (!nutrition) throw new Error(`Missing nutrition for: ${course.title}`);
  return { ...course, description: "", nutrition: { ...nutrition } };
}

export function getMealNutrition(meal: MealTemplate): Nutrition {
  const first = getCourseDetails(meal.firstCourse, "first").nutrition;
  const second = getCourseDetails(meal.secondCourse, "second").nutrition;
  return {
    calories: first.calories + second.calories,
    protein: first.protein + second.protein,
    fat: first.fat + second.fat,
    carbs: first.carbs + second.carbs,
    weight: first.weight + second.weight
  };
}
