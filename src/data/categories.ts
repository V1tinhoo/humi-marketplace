import type { Category, CategoryId } from "@/types";

export const categories: Category[] = [
  { id: "talk", title: "Just Talk", description: "Sometimes, a good conversation is all you need." },
  { id: "play", title: "Play Together", description: "Find someone to game, laugh, and share the fun." },
  { id: "cultures", title: "Explore Cultures", description: "Discover new perspectives and practice languages." },
  { id: "meet", title: "Meet New People", description: "Connect with people who share your interests." },
];

export const categoryById = (id: CategoryId) => categories.find((c) => c.id === id)!;
