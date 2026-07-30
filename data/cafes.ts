export type CafeDish = {
  id: number;
  name: string;
  description: string;
  price: number;
  image: string;
};

export type Cafe = {
  slug: string;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  logoText: string;
  logoClass: string;
  dishes: CafeDish[];
};

export const cafes: Cafe[] = [
  {
    slug: "smokefactorybbq",
    name: "SmokeFactoryBBQ",
    shortName: "SmokeFactoryBBQ",
    tagline: "Русская кухня и блюда с дымком",
    description: "Сытные домашние блюда, гриль и BBQ от Smoke Factory.",
    logoText: "SF",
    logoClass: "cafe-logo-smoke",
    dishes: [
      { id: 1, name: "Борщ", description: "300 г · сметана отдельно", price: 130, image: "/meal-2.svg" },
      { id: 2, name: "Бефстроганов", description: "320 г · с картофельным пюре", price: 180, image: "/meal-5.svg" },
      { id: 3, name: "Рёбра BBQ", description: "320 г · фирменный соус", price: 300, image: "/meal-4.svg" },
      { id: 4, name: "Куриный шашлык", description: "200 г · овощи и соус", price: 140, image: "/meal-1.svg" },
      { id: 5, name: "Пельмени", description: "300 г · говядина", price: 130, image: "/meal-6.svg" },
      { id: 6, name: "Цезарь с копчёной курицей", description: "200 г", price: 140, image: "/meal-3.svg" }
    ]
  },
  {
    slug: "senya-povar",
    name: "Сеня Повар",
    shortName: "Сеня Повар",
    tagline: "Домашние обеды без лишнего пафоса",
    description: "Простые и понятные блюда на каждый день. Тестовое меню партнёра.",
    logoText: "СП",
    logoClass: "cafe-logo-senya",
    dishes: [
      { id: 101, name: "Куриная котлета с пюре", description: "Домашняя котлета, пюре и соус", price: 170, image: "/meal-1.svg" },
      { id: 102, name: "Макароны по-флотски", description: "Говядина, паста и зелень", price: 160, image: "/meal-5.svg" },
      { id: 103, name: "Сырники со сметаной", description: "4 штуки · сметана отдельно", price: 140, image: "/meal-6.svg" },
      { id: 104, name: "Компот ягодный", description: "500 мл", price: 70, image: "/meal-3.svg" }
    ]
  },
  {
    slug: "kumys-da-kvas",
    name: "Кумыс да квас",
    shortName: "Кумыс да квас",
    tagline: "Восточная кухня и прохладные напитки",
    description: "Небольшое тестовое меню с пловом, выпечкой и напитками.",
    logoText: "КК",
    logoClass: "cafe-logo-kvas",
    dishes: [
      { id: 201, name: "Плов с говядиной", description: "Рис, говядина, морковь и специи", price: 190, image: "/meal-4.svg" },
      { id: 202, name: "Самса с мясом", description: "2 штуки", price: 130, image: "/meal-2.svg" },
      { id: 203, name: "Лагман", description: "Лапша, говядина и овощи", price: 180, image: "/meal-5.svg" },
      { id: 204, name: "Домашний квас", description: "500 мл", price: 80, image: "/meal-3.svg" }
    ]
  }
];

export function getCafe(slug: string) {
  return cafes.find((cafe) => cafe.slug === slug);
}
