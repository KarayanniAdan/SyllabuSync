import type { Course } from "./mockDeadlineItems";

export type CourseCatalogEntry = {
  name: Course;
  number: string;
  hebrewName: string;
  aliases: string[];
};

export const COURSE_CATALOG: CourseCatalogEntry[] = [
  {
    name: "Numerical Algorithms",
    number: "02340125",
    hebrewName: "אלגוריתמים נומריים",
    aliases: [
      "Numerical Algorithms",
      "Numerical Algorithm",
      "Numerical Algo",
      "Numerical",
      "אלגוריתמים נומריים",
      "אלגו נומריים",
      "02340125",
      "2340125",
      "234125",
    ],
  },
  {
    name: "Introduction to Artificial Intelligence",
    number: "02360501",
    hebrewName: "מבוא לבינה מלאכותית",
    aliases: [
      "Introduction to Artificial Intelligence",
      "Intro to Artificial Intelligence",
      "Intro to AI",
      "Artificial Intelligence",
      "AI",
      "מבוא לבינה מלאכותית",
      "בינה מלאכותית",
      "02360501",
      "2360501",
      "236501",
    ],
  },
  {
    name: "Compilation Theory",
    number: "02360360",
    hebrewName: "תורת הקומפילציה",
    aliases: [
      "Compilation Theory",
      "Theory of Compilation",
      "Compilation",
      "Compilers",
      "תורת הקומפילציה",
      "קומפילציה",
      "02360360",
      "2360360",
      "236360",
    ],
  },
  {
    name: "Physics 2MM",
    number: "01140075",
    hebrewName: "פיסיקה 2ממ",
    aliases: [
      "Physics 2MM",
      "Physics 2 MM",
      "Physics 2",
      "Physics",
      "פיסיקה 2ממ",
      "פיזיקה 2ממ",
      "פיסיקה",
      "פיזיקה",
      "01140075",
      "1140075",
      "114075",
    ],
  },
  {
    name: "Introduction to Computer Networks",
    number: "02360334",
    hebrewName: "מבוא לרשתות מחשבים",
    aliases: [
      "Introduction to Computer Networks",
      "Intro to Computer Networks",
      "Computer Networks",
      "Networks",
      "מבוא לרשתות מחשבים",
      "רשתות מחשבים",
      "02360334",
      "2360334",
      "236334",
    ],
  },
  {
    name: "Introduction to Computer Science",
    number: "02340114/7",
    hebrewName: "מבוא למדעי המחשב",
    aliases: [
      "Introduction to Computer Science",
      "Intro to Computer Science",
      "Intro to CS",
      "Computer Science",
      "מבוא למדעי המחשב",
      "מדעי המחשב",
      "מבוא למדמ\"ח",
      "02340114/7",
      "02340114",
      "02340117",
      "2340114",
      "2340117",
      "234114",
      "234117",
    ],
  },
  {
    name: "Introduction to Set Theory and Automata for CS",
    number: "02340129",
    hebrewName: "מבוא לתורת הקבוצות ואוטומטים למדמ\"ח",
    aliases: [
      "Introduction to Set Theory and Automata for CS",
      "Introduction to Set Theory and Automata",
      "Set Theory and Automata",
      "Set Theory",
      "Automata",
      "מבוא לתורת הקבוצות ואוטומטים",
      "תורת הקבוצות",
      "אוטומטים",
      "matka",
      "מתקא",
      "02340129",
      "2340129",
      "234129",
    ],
  },
  {
    name: "Infinitesimal Calculus 1M",
    number: "01040031",
    hebrewName: "חשבון אינפיניטסימלי 1מ'",
    aliases: [
      "Infinitesimal Calculus 1M",
      "Infinitesimal Calculus",
      "Calculus 1M",
      "Calculus",
      "Infi 1M",
      "Infi",
      "חשבון אינפיניטסימלי 1מ",
      "חשבון אינפיניטסימלי",
      "אינפי 1מ",
      "אינפי",
      "01040031",
      "1040031",
      "104031",
    ],
  },
  {
    name: "Algebra AM",
    number: "01040166",
    hebrewName: "אלגברה אמ'",
    aliases: [
      "Algebra AM",
      "Algebra A M",
      "Algebra",
      "אלגברה אמ",
      "אלגברה",
      "01040166",
      "1040166",
      "104166",
    ],
  },
];

export function courseMatchesSearch(course: CourseCatalogEntry, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [course.name, course.number, course.hebrewName, ...course.aliases].some((term) =>
    term.toLowerCase().includes(normalizedQuery),
  );
}
