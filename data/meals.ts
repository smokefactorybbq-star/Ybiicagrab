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
  { title: "Борщ со свининой", image: "/menu/01_borsch_so_svininoy.png" },
  { title: "Грибной суп с курицей", image: "/menu/02_gribnoy_s_kuritsey.png" },
  { title: "Гороховый суп со свининой", image: "/menu/03_gorohoviy_so_svininoy.png" },
  { title: "Куриный бульон", image: "/menu/04_kuriniy_bulon.png" },
  { title: "Суп с фрикадельками из свинины", image: "/menu/05_sup_s_frikadelkami_svinina.png" },
  { title: "Куриный овощной суп", image: "/menu/06_kuriniy_ovoshnoi.png" },
  { title: "Харчо", image: "/menu/07_harcho.png" },
  { title: "Суп с фасолью и свининой", image: "/menu/08_sup_s_fasolyu_i_svininoy.png" },
  { title: "Куриный суп с рисом", image: "/menu/09_kuriniy_s_risom.png" },
  { title: "Щи с кислой капустой", image: "/menu/10_shchi_s_kisloy_kapustoy.png" },
  { title: "Сливочно-сырный суп с курицей", image: "/menu/11_slivochno_sirniy_s_kuritsey.png" },
  { title: "Рыбный суп", image: "/menu/12_ribniy_sup.png" },
  { title: "Солянка с сосисками", image: "/menu/13_solyanka_s_sosiskami.png" },
  { title: "Суп с копчёными рёбрами и перцем", image: "/menu/14_s_kopchenimi_rebrami_i_percem.png" },
  { title: "Сливочно-рыбный суп с томатами", image: "/menu/15_slivochno_ribniy_s_tomatami.png" },
  { title: "Чечевичный суп со свининой и грибами", image: "/menu/16_chechevica_svinina_griby.png" },
  { title: "Суп с зелёным горошком и свиными рёбрами", image: "/menu/17_zeleniy_goroh_svinie_rebra.png" },
  { title: "Суп с килькой в томате", image: "/menu/18_kilka_v_tomate.png" },
  { title: "Шурпа со свининой", image: "/menu/19_shurpa_so_svininoy.png" },
  { title: "Куриный суп со шпинатом и брокколи", image: "/menu/20_kuriniy_shpinat_brokkoli.png" },
  { title: "Куриный суп с цветной капустой и кукурузой", image: "/menu/21_kuriniy_cvetnaya_kapusta_kukuruza.png" },
  { title: "Суп с зелёным горошком и свининой", image: "/menu/22_zeleniy_goroh_svinina.png" },
  { title: "Суп с куриными фрикадельками и овощами", image: "/menu/23_kurinie_frikadelki_ovoshi.png" },
  { title: "Рыбный суп со шпинатом", image: "/menu/24_ribniy_shpinat.png" },
  { title: "Куриный суп со шпинатом и яйцом", image: "/menu/25_kuriniy_shpinat_yayco.png" },
  { title: "Рассольник", image: "/menu/26_rassolnik.png" },
  { title: "Сливочно-грибной суп с курицей", image: "/menu/27_slivochno_gribnoy_s_kuritsey.png" },
  { title: "Рыбно-томатный суп с рисом и черри", image: "/menu/28_ribno_tomatniy_ris_cherri.png" },
  { title: "Свекольник", image: "/menu/29_svekolnik.png" },
  { title: "Суп со свининой и овощами", image: "/menu/30_svinina_raznie_ovoshi.png" }
];

const secondCourses: Course[] = [
  { title: "Рис с домашними котлетами", image: "/menu/31_ris_domashnie_kotlety.png" },
  { title: "Пюре с куриными котлетами", image: "/menu/32_pure_kurinie_kotlety.png" },
  { title: "Тефтели в томатном соусе с пюре", image: "/menu/33_tefteli_tomat_pure.png" },
  { title: "Макароны с курицей и подливой", image: "/menu/34_makarony_kurica_podliva.png" },
  { title: "Куриное филе с картофелем и грибным соусом", image: "/menu/35_kurinoe_file_kartofel_gribnoy_sous.png" },
  { title: "Тушёный картофель", image: "/menu/36_tusheniy_kartofel.png" },
  { title: "Тушёная капуста", image: "/menu/37_tushenaya_kapusta.png" },
  { title: "Овощное рагу с курицей", image: "/menu/38_ovoshnoe_ragu_s_kuritsey.png" },
  { title: "Рис с куриной грудкой в томатном соусе", image: "/menu/39_ris_kurinaya_grudka_tomatniy_sous.png" },
  { title: "Поджарка из свинины с пюре", image: "/menu/40_podzharka_svinina_pure.png" },
  { title: "Рис с курицей в сливочно-грибном соусе", image: "/menu/41_rice_chicken_creamy_mushroom_sauce.png" },
  { title: "Рис с гуляшом из свинины", image: "/menu/42_rice_pork_goulash.png" },
  { title: "Пюре с куриными фрикадельками в сливочном соусе", image: "/menu/43_mashed_potatoes_chicken_meatballs_cream.png" },
  { title: "Ленивые голубцы с картофельным пюре", image: "/menu/44_lazy_cabbage_rolls_mashed_potatoes.png" },
  { title: "Отварной картофель с тушёной свининой", image: "/menu/45_boiled_potatoes_stewed_pork.png" },
  { title: "Спагетти с курицей в сливочном соусе", image: "/menu/46_spaghetti_chicken_cream_sauce.png" },
  { title: "Азу из свинины с солёными огурцами", image: "/menu/47_pork_azu_pickles.png" },
  { title: "Фаршированный перец с картофельным пюре", image: "/menu/48_half_stuffed_pepper_mashed_potatoes.png" },
  { title: "Куриное филе с овощами", image: "/menu/49_chicken_fillet_vegetables.png" },
  { title: "Печёночные оладьи с пюре", image: "/menu/50_liver_fritters_mashed_potatoes.png" },
  { title: "Куриная отбивная с рисом", image: "/menu/51_chicken_chop_rice.png" },
  { title: "Запечённая рыба с овощами", image: "/menu/52_baked_fish_vegetables.png" },
  { title: "Печень по-строгановски с пюре", image: "/menu/53_liver_stroganoff_mashed_potatoes.png" },
  { title: "Мясные зразы с пюре", image: "/menu/54_meat_zrazy_mashed_potatoes.png" },
  { title: "Отварной картофель с курицей", image: "/menu/55_boiled_potatoes_chicken.png" },
  { title: "Куриная отбивная с пюре", image: "/menu/56_chicken_chop_mashed_potatoes.png" },
  { title: "Картофельные зразы со сливочно-грибным соусом", image: "/menu/57_potato_zrazy_creamy_mushroom_sauce.png" },
  { title: "Свинина, тушённая с овощами", image: "/menu/58_pork_stewed_vegetables.png" },
  { title: "Макароны по-флотски", image: "/menu/59_navy_style_pasta.png" },
  { title: "Запечённая рыба с овощами — вариант шефа", image: "/menu/60_baked_fish_vegetables_variant.png" }
];

const MENU_ANCHOR_UTC = Date.UTC(2026, 6, 31);
const blockCache = new Map<number, MealTemplate[]>();

function shuffled<T>(items: T[], seed: number) {
  const result = [...items];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function getMenuBlock(blockIndex: number) {
  const cached = blockCache.get(blockIndex);
  if (cached) return cached;

  const normalizedBlock = blockIndex >>> 0;
  const soups = shuffled(firstCourses, 0x51f15e5d ^ Math.imul(normalizedBlock + 1, 0x9e3779b1));
  const mains = shuffled(secondCourses, 0x7a2d3c49 ^ Math.imul(normalizedBlock + 1, 0x85ebca6b));
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

  blockCache.set(blockIndex, block);
  return block;
}

export function getMealTemplateForDate(isoDate: string): MealTemplate {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return getMenuBlock(0)[0];

  const [, year, month, day] = match;
  const value = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const dayIndex = Math.floor((value - MENU_ANCHOR_UTC) / 86_400_000);
  const blockIndex = Math.floor(dayIndex / 30);
  const dayInBlock = ((dayIndex % 30) + 30) % 30;
  return getMenuBlock(blockIndex)[dayInBlock];
}

export const mealTemplates = getMenuBlock(0);
