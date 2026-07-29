export type MealTemplate = {
  title: string;
  description: string;
  image: string;
  tag: string;
};

export const mealTemplates: MealTemplate[] = [
  {
    title: "Курица терияки с рисом",
    description: "Сочная курица, жасминовый рис, овощи и домашний соус.",
    image: "/meal-1.svg",
    tag: "Сытный обед"
  },
  {
    title: "Бефстроганов с пюре",
    description: "Нежная говядина, сливочный соус и картофельное пюре.",
    image: "/meal-2.svg",
    tag: "Домашняя кухня"
  },
  {
    title: "Лосось и овощи",
    description: "Запечённый лосось, зелёные овощи и лимонный соус.",
    image: "/meal-3.svg",
    tag: "Лёгкий день"
  },
  {
    title: "Кебаб с булгуром",
    description: "Кебаб на углях, булгур, салат и йогуртовый соус.",
    image: "/meal-4.svg",
    tag: "С дымком"
  },
  {
    title: "Паста с курицей",
    description: "Паста, куриное филе, томаты и сливочно-сырный соус.",
    image: "/meal-5.svg",
    tag: "Комфортная еда"
  },
  {
    title: "Плов с говядиной",
    description: "Рассыпчатый рис, говядина, морковь и ароматные специи.",
    image: "/meal-6.svg",
    tag: "Большая порция"
  },
  {
    title: "Котлеты и гречка",
    description: "Домашние котлеты, гречка, грибной соус и свежий салат.",
    image: "/meal-7.svg",
    tag: "Как дома"
  },
  {
    title: "Тайский рис с креветками",
    description: "Жареный рис, креветки, яйцо, овощи и лайм.",
    image: "/meal-8.svg",
    tag: "Вкус Пхукета"
  }
];
