export type Course = {
  title: string;
  image: string;
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
  { title: "Борщ (сметана, горчица, сало)", image: "/menu/01-borscht.png" },
  { title: "Суп грибной с курицей (сухарики)", image: "/menu/02-chicken-mushroom-soup-croutons.png" },
  { title: "Суп гороховый (сухарики, жареный бекон)", image: "/menu/03-pea-soup-bacon-croutons.png" },
  { title: "Свекольник (сметана, половинка яйца)", image: "/menu/04-svekolnik-sour-cream-egg.png" },
  { title: "Куриный бульон с лапшой и яйцом (сухарики)", image: "/menu/05-chicken-noodle-egg-soup-croutons.png" },
  { title: "Суп с мясными фрикадельками и рисом (сухарики)", image: "/menu/06-meatball-rice-soup-croutons.png" },
  { title: "Суп с куриным филе и овощами (сухарики)", image: "/menu/07-chicken-vegetable-soup-croutons.png" },
  { title: "Суп харчо со свининой (сметана, зелень, лепёшка)", image: "/menu/08-pork-kharcho-flatbread.png" },
  { title: "Суп со свининой, томлёным перцем и фасолью", image: "/menu/09-pork-pepper-bean-soup.png" },
  { title: "Щи (сметана)", image: "/menu/10-shchi-sour-cream.png" },
  { title: "Суп сливочно-сырный с курицей (сухарики)", image: "/menu/11-creamy-cheese-chicken-soup.png" },
  { title: "Суп рыбный (лимон, зелень)", image: "/menu/12-fish-soup-lemon-herbs.png" },
  { title: "Солянка сборная (сметана, лимон)", image: "/menu/13-solyanka-sour-cream-lemon.png" },
  { title: "Суп сливочно-грибной с курицей (сухарики)", image: "/menu/14-creamy-mushroom-chicken-soup.png" },
  { title: "Суп со свиными рёбрами и томлёным перцем", image: "/menu/15-pork-rib-pepper-soup.png" },
  { title: "Суп гречневый со свининой (жареный бекон, грибы)", image: "/menu/16-buckwheat-pork-bacon-mushroom-soup.png" },
  { title: "Суп сливочно-куриный с цветной капустой и кукурузой (сухарики)", image: "/menu/17-creamy-chicken-cauliflower-corn-soup.png" },
  { title: "Суп со свининой, чечевицей, томлёным перцем и вялеными томатами", image: "/menu/18-pork-lentil-sundried-tomato-soup.png" },
  { title: "Суп со свининой и печёными овощами", image: "/menu/19-pork-roasted-vegetable-soup.png" },
  { title: "Суп с куриными фрикадельками и овощами (сухарики)", image: "/menu/20-chicken-meatball-vegetable-soup.png" },
  { title: "Суп рыбный со шпинатом и томатами (лимон)", image: "/menu/21-fish-spinach-tomato-soup.png" },
  { title: "Рассольник (сметана)", image: "/menu/22-rassolnik-sour-cream.png" },
  { title: "Суп томатный со свининой (лепёшка)", image: "/menu/23-tomato-pork-soup-flatbread.png" },
  { title: "Окрошка с копчёной курицей", image: "/menu/24-okroshka-smoked-chicken.png" },
  { title: "Пряный томатный суп с мясным фаршем (чили кон карне, лепёшка)", image: "/menu/25-chili-con-carne-soup-flatbread.png" },
  { title: "Суп томатный с морепродуктами (лепёшка, лимон)", image: "/menu/26-tomato-seafood-soup.png" },
  { title: "Суп куриный со шпинатом и яйцом (сухарики)", image: "/menu/27-chicken-spinach-egg-soup.png" },
  { title: "Суп со свининой и зелёным горошком", image: "/menu/28-pork-green-pea-soup.png" },
  { title: "Суп сливочно-рыбный с вялеными томатами", image: "/menu/29-creamy-fish-sundried-tomato-soup.png" },
  { title: "Шурпа из свинины (лепёшка, зелень)", image: "/menu/30-pork-shurpa-flatbread.png" }
];

const secondCourses: Course[] = [
  { title: "Котлеты куриные с пюре и сливочно-грибным соусом", image: "/menu/31-chicken-cutlets-mashed-potato-mushroom-sauce.png" },
  { title: "Тефтели из домашнего фарша в томатно-сметанном соусе с пюре", image: "/menu/32-meatballs-tomato-sour-cream-mashed-potato.png" },
  { title: "Картофель, тушённый со свининой и овощами", image: "/menu/33-braised-potato-pork-vegetables.png" },
  { title: "Рагу овощное с курицей", image: "/menu/34-chicken-vegetable-stew.png" },
  { title: "Рис с куриным филе, запечённым с сыром и грибами", image: "/menu/35-rice-chicken-cheese-mushrooms.png" },
  { title: "Перец фаршированный с пюре и соусом «Дзадзики»", image: "/menu/36-stuffed-pepper-mashed-potato-tzatziki.png" },
  { title: "Рис со шницелем из курицы и соусом тартар", image: "/menu/37-chicken-schnitzel-rice-tartar.png" },
  { title: "Гречка со шницелем из свинины и соусом из печёных овощей", image: "/menu/38-pork-schnitzel-buckwheat-roasted-vegetable-sauce.png" },
  { title: "Зраза из домашнего фарша с яйцом и зеленью, гречкой и сливочно-грибным соусом", image: "/menu/39-meat-zrazy-egg-buckwheat-mushroom-sauce.png" },
  { title: "Котлеты из двух видов рыб с рисом и икорным соусом", image: "/menu/40-fish-cutlets-rice-caviar-sauce.png" },
  { title: "Зраза картофельная с фаршем, овощами и соусом «Сливочный демиглас»", image: "/menu/41-potato-zraza-meat-vegetables-demiglace.png" },
  { title: "Рыба, жаренная в кляре, с рисом и соусом «Азиатский чили»", image: "/menu/42-battered-fish-rice-asian-chili.png" },
  { title: "Куриная грудка в кляре с картофельным пюре и сливочно-грибным соусом", image: "/menu/43-battered-chicken-mashed-potato-mushroom-sauce.png" },
  { title: "Паста с курицей и овощами в томатном соусе", image: "/menu/44-chicken-vegetable-tomato-pasta.png" },
  { title: "Паста с запечённым куриным филе в травах и перечным соусом", image: "/menu/45-herb-chicken-pepper-sauce-pasta.png" },
  { title: "Жареный рис с креветками и овощами", image: "/menu/46-shrimp-fried-rice-vegetables.png" },
  { title: "Карри с креветками, апельсином и рисом", image: "/menu/47-shrimp-orange-curry-rice.png" },
  { title: "Запечённая рыба с овощами и соусом «Ромеско»", image: "/menu/48-baked-fish-vegetables-romesco.png" },
  { title: "Рулет из свинины с яблоками и перцем, картофелем по-деревенски и соусом BBQ", image: "/menu/49-pork-roulade-apple-pepper-potatoes-bbq.png" },
  { title: "Бефстроганов из говядины с картофельным пюре, беконом и солёным огурчиком", image: "/menu/50-beef-stroganoff-mashed-potato-bacon-pickle.png" },
  { title: "Рулет из куриного фарша с грибами и плавленым сыром, с картофельным пюре и зеленью", image: "/menu/51-chicken-mince-roulade-mushroom-cheese-mashed-potato.png" },
  { title: "Томлёная свинина в соусе «Демиглас» с гречкой", image: "/menu/52-braised-pork-demiglace-buckwheat.png" },
  { title: "Рваная свинина с соусом «Харисса» и печёным картофелем", image: "/menu/53-pulled-pork-harissa-baked-potato.png" },
  { title: "Ленивые голубцы в томатно-сметанном соусе с картофельным пюре", image: "/menu/54-lazy-cabbage-rolls-mashed-potato.png" },
  { title: "Котлеты из домашнего фарша с гречкой и соусом из печёных овощей", image: "/menu/55-meat-cutlets-buckwheat-roasted-vegetable-sauce.png" },
  { title: "Рис с утиной грудкой и овощами", image: "/menu/56-rice-duck-breast-vegetables.png" },
  { title: "Томлёная говядина с овощами и перечным соусом", image: "/menu/57-braised-beef-vegetables-pepper-sauce.png" },
  { title: "Паста «Арраббиата» с рваной свининой", image: "/menu/58-arrabbiata-pulled-pork.png" },
  { title: "Запечённая куриная грудка с травами, овощами и трюфельным соусом", image: "/menu/59-baked-chicken-breast-vegetables-truffle-sauce.png" },
  { title: "Куриное бедро с огня с овощами и соусом «Чимичурри»", image: "/menu/60-grilled-chicken-thigh-vegetables-chimichurri.png" }
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

function stableNumber(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

export function getCourseDetails(course: Course, kind: "first" | "second") {
  const seed = stableNumber(course.title);
  if (kind === "first") {
    const nutrition: Nutrition = {
      calories: 180 + (seed % 121),
      protein: 9 + (seed % 10),
      fat: 7 + (seed % 9),
      carbs: 18 + (seed % 19),
      weight: 300
    };
    return {
      ...course,
      description: `${course.title} — горячее первое блюдо MealPoint. Готовим небольшими партиями из свежих продуктов, без лишней тяжести, чтобы обед оставался сытным и комфортным на каждый день.`,
      nutrition
    };
  }
  const nutrition: Nutrition = {
    calories: 390 + (seed % 191),
    protein: 23 + (seed % 17),
    fat: 13 + (seed % 15),
    carbs: 34 + (seed % 31),
    weight: 400
  };
  return {
    ...course,
    description: `${course.title} — основное блюдо дня. Сбалансированная порция с белком, гарниром и соусом или овощами; рассчитана как полноценная вторая часть ежедневного обеда.`,
    nutrition
  };
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
