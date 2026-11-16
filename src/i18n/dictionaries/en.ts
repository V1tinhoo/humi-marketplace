/**
 * English copy. To add Portuguese, create `pt.ts` with the same shape
 * (enforced by the `Dictionary` type) and register it in `src/i18n/index.ts`.
 */
export const en = {
  brand: {
    name: "humi",
    tagline: "Real people. Real connections.",
    alt: "A little more human. A little less alone.",
  },
  nav: {
    explore: "Explore",
    howItWorks: "How it works",
    becomeHost: "Become a host",
    login: "Log in",
    signup: "Sign up",
    dashboard: "Dashboard",
    account: "My account",
    logout: "Log out",
  },
  hero: {
    eyebrow: "Real people. Real connections.",
    title: "The world is full of people worth talking to.",
    body: "Find someone real to share a moment with. Talk, play, explore new perspectives, and make meaningful connections.",
    primary: "Find someone to talk to",
    secondary: "Become a host",
  },
  categories: {
    title: "What are you in the mood for?",
    subtitle: "Every conversation starts with a little curiosity. Pick a vibe and see who's around.",
  },
  featured: {
    title: "People worth talking to.",
    subtitle: "A few of the hosts you could meet on HUMI.",
    viewAll: "View all hosts",
    sampleNote: "Sample profiles for demonstration — not real, available hosts.",
  },
  how: {
    title: "Connection is just a few clicks away.",
    steps: [
      { title: "Discover", body: "Find someone who matches your interests." },
      { title: "Choose", body: "Pick your preferred experience and session duration." },
      { title: "Connect", body: "Start a real conversation through audio or video." },
      { title: "Enjoy", body: "Share the moment and leave a review." },
    ],
  },
  host: {
    title: "Your time. Your interests. Your opportunity.",
    body: "Meet new people, share what you love, and earn money by offering your time and conversations.",
    benefits: [
      "Set your own availability.",
      "Choose your interests.",
      "Set your rates within platform limits.",
      "Meet people from around the world.",
      "Receive payments for completed sessions.",
    ],
    cta: "Become a host",
  },
  trust: {
    title: "Real connections start with trust.",
    subtitle: "Safety is at the core of HUMI. Here's how we protect every conversation.",
    items: [
      { title: "Real profiles", body: "Every host has a profile with photo, interests and ratings from completed calls." },
      { title: "Secure payments", body: "Payments are processed by Mercado Pago, a certified payment provider. HUMI never stores card details." },
      { title: "Honest reviews", body: "Only people who completed a session can leave a review." },
      { title: "Report & block", body: "Report or block anyone, any time, from any session or profile." },
      { title: "Community guidelines", body: "Clear rules about respect, consent, and what HUMI is — and isn't." },
      { title: "Privacy first", body: "No public last names, no shared contact details, and you control what you share." },
    ],
    status: "Live",
  },
  finalCta: {
    title: "Someone out there is worth talking to.",
    cta: "Find your connection",
  },
  footer: {
    blurb: "A global marketplace for real conversations and shared moments with people around the world.",
    product: "Product",
    company: "Company",
    legal: "Legal",
    about: "About HUMI",
    safety: "Safety",
    help: "Help Center",
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    guidelines: "Community guidelines",
    cancellation: "Cancellation policy",
    disclaimer:
      "HUMI is a marketplace for paid social conversations between adults (18+). It is not a dating service, therapy, or mental health treatment. If you are in crisis, please contact your local emergency services.",
  },
};

export type Dictionary = typeof en;
