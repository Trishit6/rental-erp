/**
 * Deterministic helpers for the large realistic seed dataset.
 *
 * Everything is seeded PRNG (mulberry32) so every `pnpm db:seed` produces the
 * same marketplace — searches, filters and pagination can then be reasoned
 * about, and a bug found on one machine reproduces on another. No random
 * nonsense strings anywhere: names, cities, products and reviews come from
 * curated pools with Indian pricing in INR.
 */

/** mulberry32 — small, fast, deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Random = () => number;

/** Integer in [min, max]. */
export function intBetween(rand: Random, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

/** Pick one element. */
export function pick<T>(rand: Random, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

/** Pick `count` distinct elements (or all if the pool is smaller). */
export function sample<T>(rand: Random, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (pool.length > 0 && out.length < count) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!);
  }
  return out;
}

/** Chance helper: true `probability` of the time. */
export function chance(rand: Random, probability: number): boolean {
  return rand() < probability;
}

/** Convert rupees to integer paise. */
export function paise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** A date `days` from now (fractional days allowed), as a Date. */
export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** A random day within the last `months` months, biased towards recency. */
export function dayWithinLastMonths(rand: Random, months: number, minDaysAgo = 1): Date {
  const maxDays = months * 30;
  const skewed = Math.floor(Math.pow(rand(), 1.6) * (maxDays - minDaysAgo)) + minDaysAgo;
  return daysFromNow(-skewed);
}

/* ------------------------------- name pools -------------------------------- */

export const FIRST_NAMES = [
  "Aarav",
  "Diya",
  "Vihaan",
  "Ananya",
  "Ishaan",
  "Meera",
  "Kabir",
  "Riya",
  "Arjun",
  "Sara",
  "Rohan",
  "Nisha",
  "Aditya",
  "Tara",
  "Nikhil",
  "Pooja",
  "Varun",
  "Ira",
  "Siddharth",
  "Kavya",
  "Rahul",
  "Anjali",
  "Karthik",
  "Divya",
  "Manav",
  "Sneha",
  "Yash",
  "Preeti",
  "Naveen",
  "Shreya",
  "Aryan",
  "Nandini",
  "Dev",
  "Aisha",
  "Gaurav",
  "Lakshmi",
  "Harsh",
  "Neha",
  "Imran",
  "Farah",
];

export const LAST_NAMES = [
  "Sharma",
  "Verma",
  "Kapoor",
  "Mehta",
  "Iyer",
  "Reddy",
  "Nair",
  "Patel",
  "Gupta",
  "Singh",
  "Chopra",
  "Malhotra",
  "Rao",
  "Joshi",
  "Desai",
  "Kulkarni",
  "Menon",
  "Pillai",
  "Bose",
  "Das",
  "Shetty",
  "Rai",
  "Bhat",
  "Khan",
  "Ahmed",
  "Thomas",
  "Varghese",
  "Saxena",
  "Tiwari",
  "Mishra",
];

export const CITIES = [
  {
    name: "Bengaluru",
    areas: ["Indiranagar", "Koramangala", "HSR Layout", "Whitefield", "Jayanagar"],
  },
  { name: "Mumbai", areas: ["Bandra West", "Powai", "Andheri West", "Dadar", "Colaba"] },
  { name: "Delhi", areas: ["Saket", "Hauz Khas", "Dwarka", "Rohini", "Karol Bagh"] },
  { name: "Pune", areas: ["Kothrud", "Baner", "Viman Nagar", "Hinjewadi", "Kharadi"] },
  {
    name: "Hyderabad",
    areas: ["Gachibowli", "Jubilee Hills", "Madhapur", "Kukatpally", "Banjara Hills"],
  },
  { name: "Chennai", areas: ["Adyar", "T. Nagar", "Velachery", "Anna Nagar", "Mylapore"] },
];

export const BIO_TEMPLATES = [
  "Curator of well-kept {thing} with an eye for quality.",
  "Upgrading constantly, so my {thing} find new homes often.",
  "{thing} enthusiast — everything listed is cared for and cleaned.",
  "Renting out my spare {thing} while I travel for work.",
  "Small studio clearing space; every item is tested before listing.",
  "Weekend declutterer. Honest descriptions, fair prices, quick replies.",
];

/** Fill a bio template with a subject word. */
export function makeBio(rand: Random): string {
  const subjects = [
    "electronics",
    "furniture",
    "camera gear",
    "tools",
    "books",
    "party gear",
    "fitness kit",
    "kitchen appliances",
  ];
  const template = pick(rand, BIO_TEMPLATES);
  return template.replace("{thing}", pick(rand, subjects));
}
