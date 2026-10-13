// Mock-up content for AI Caravan 2026. Every name, company, venue, date and price is invented.

export const announcements = [
  { text: "Early-bird Caravan Passes end 31 October.", cta: "Get tickets", href: "#tickets" },
  { text: "Workshop proposals close 20 October.", cta: "Pitch yours", href: "#contact" },
  { text: "New for 2026: an AI Product Expo with 40+ live demos.", cta: "See the expo", href: "#experiences" },
];

export const nav = [
  { label: "Tracks", href: "#tracks" },
  { label: "Speakers", href: "#speakers" },
  { label: "Agenda", href: "#agenda" },
  { label: "Venue", href: "#venue" },
  { label: "Tickets", href: "#tickets" },
  { label: "FAQ", href: "#faq" },
];

export const partners = [
  "QUETZAL CLOUD",
  "andina·data",
  "Brightloom",
  "Páramo AI",
  "orbita/studio",
  "Cafetal Systems",
  "Lumen & Lathe",
  "KINETICA FORGE",
  "Ceiba Financial",
  "Guadua Labs",
];

export type TrackId = "design" | "management" | "development";

export const tracks: {
  id: TrackId;
  label: string;
  summary: string;
  number: string;
  title: string;
  body: string;
  points: string[];
}[] = [
  {
    id: "design",
    label: "Product design",
    summary: "Interfaces for agents, AI-native patterns and design systems models can read.",
    number: "Track 01",
    title: "Design for people and the agents working beside them",
    body: "See how leading teams prototype with models, design AI interactions people trust, and turn their design systems into something an agent can build from.",
    points: [
      "Patterns for explaining, correcting and undoing AI actions",
      "A token workflow your coding agents actually follow",
      "Research methods that keep pace with weekly releases",
    ],
  },
  {
    id: "management",
    label: "Product management",
    summary: "Roadmaps, pricing and evals when the model changes every quarter.",
    number: "Track 02",
    title: "Plan products on ground that keeps moving",
    body: "Learn how product leaders set strategy, price AI features and write specs when the underlying models improve every few months.",
    points: [
      "A roadmap format built for model volatility",
      "Pricing frameworks for usage-based AI features",
      "Specs an agent can build from without guessing",
    ],
  },
  {
    id: "development",
    label: "Product development",
    summary: "Agentic workflows, eval suites and shipping AI features to production.",
    number: "Track 03",
    title: "Build with AI pair-builders, ship with confidence",
    body: "Engineering leads share what really happens when agents join the codebase: the workflows that stuck, the guardrails that saved them, and the evals that catch regressions.",
    points: [
      "Eval suites that catch regressions before users do",
      "Guardrails for agents inside your CI pipeline",
      "Latency and cost budgets that hold up at scale",
    ],
  },
];

export const stats = [
  { value: "64", label: "Speakers from 14 countries" },
  { value: "48", label: "Talks, panels and workshops" },
  { value: "2,500", label: "Designers, PMs and engineers" },
  { value: "3", label: "Days at 2,640 metres" },
];

export const experiences = [
  {
    title: "Hands-on workshops",
    body: "Twelve 90-minute labs, 25 seats each. Bring a laptop, leave with a working prototype.",
    icon: "flask",
  },
  {
    title: "AI Product Expo",
    body: "40+ teams demo what they shipped this year, with the people who built it standing next to it.",
    icon: "grid",
  },
  {
    title: "Caravana Nocturna",
    body: "Mentor tables by day, a rooftop after-party with live electrónica by night.",
    icon: "music",
  },
] as const;

export const speakers: {
  initials: string;
  name: string;
  role: string;
  track: TrackId;
  talk: string;
  slot: string;
}[] = [
  { initials: "VR", name: "Valentina Ríos Ocampo", role: "VP Product Design, Quetzal Cloud · Medellín", track: "design", talk: "Designing for agents, not just users", slot: "Day 1 · 10:30" },
  { initials: "AO", name: "Amara Okonkwo-Silva", role: "Head of Product, Páramo AI · São Paulo", track: "management", talk: "Roadmaps when the model changes every quarter", slot: "Day 2 · 09:00 · Keynote" },
  { initials: "TA", name: "Tomás Achterberg", role: "Principal Engineer, Brightloom · Amsterdam", track: "development", talk: "Shipping with AI pair-builders: what broke, what stuck", slot: "Day 3 · 09:00" },
  { initials: "HT", name: "Hiroshi Tanabe-Morales", role: "Design Systems Lead, Orbita Studio · Lima", track: "design", talk: "Tokens as a contract between people and models", slot: "Day 2 · 10:30" },
  { initials: "PR", name: "Priya Raman", role: "Group Product Manager, Kinetica Forge · Toronto", track: "management", talk: "Pricing AI features people trust", slot: "Day 2 · 14:30" },
  { initials: "LF", name: "Lucía Fernández Quispe", role: "Director of Engineering, Andina Data · Bogotá", track: "development", talk: "Evals are the new unit tests", slot: "Day 1 · 16:00" },
];

export const trackLabel: Record<TrackId | "all", string> = {
  design: "Design",
  management: "Management",
  development: "Development",
  all: "All tracks",
};

type Session = {
  time: string;
  format: "Keynote" | "Talk" | "Panel" | "Workshop" | "Social";
  track: TrackId | "all";
  title: string;
  who: string;
  room: string;
};

export const agenda: { id: string; label: string; date: string; sessions: Session[] }[] = [
  {
    id: "day1",
    label: "Day 1",
    date: "Tue 17 Nov",
    sessions: [
      { time: "08:00", format: "Social", track: "all", title: "Registration and Colombian coffee", who: "Badge pickup, tinto and arepas in the main lobby", room: "Lobby Altiplano" },
      { time: "09:00", format: "Keynote", track: "all", title: "The product team of 2030 is already here", who: "Valentina Ríos Ocampo, Quetzal Cloud · Tomás Achterberg, Brightloom", room: "Sala Cóndor" },
      { time: "10:30", format: "Talk", track: "design", title: "Designing for agents, not just users", who: "Valentina Ríos Ocampo, Quetzal Cloud", room: "Sala Frailejón" },
      { time: "11:30", format: "Panel", track: "management", title: "Who owns the prompt?", who: "Joaquín Ferreyra (host) · Isabela Nascimento · Marco Bellandi", room: "Sala Cóndor" },
      { time: "13:00", format: "Social", track: "all", title: "Lunch and AI Product Expo opening", who: "40+ live demos open until 18:00", room: "Expo Hall" },
      { time: "14:30", format: "Workshop", track: "design", title: "Prototype an AI feature in 90 minutes", who: "Camila Duarte Herrera, Guadua Labs", room: "Sala Guadua" },
      { time: "16:00", format: "Talk", track: "development", title: "Evals are the new unit tests", who: "Lucía Fernández Quispe, Andina Data", room: "Sala Frailejón" },
      { time: "18:30", format: "Social", track: "all", title: "Welcome drinks on the terrace", who: "Meet the speakers before the city lights come on", room: "Terraza Mirador" },
    ],
  },
  {
    id: "day2",
    label: "Day 2",
    date: "Wed 18 Nov",
    sessions: [
      { time: "09:00", format: "Keynote", track: "management", title: "Roadmaps when the model changes every quarter", who: "Amara Okonkwo-Silva, Páramo AI", room: "Sala Cóndor" },
      { time: "10:30", format: "Talk", track: "design", title: "Tokens as a contract between people and models", who: "Hiroshi Tanabe-Morales, Orbita Studio", room: "Sala Frailejón" },
      { time: "11:30", format: "Workshop", track: "development", title: "From RFC to running agent", who: "Ngozi Adeyemi, Andina Data · Marco Bellandi, Quetzal Cloud", room: "Sala Guadua" },
      { time: "13:00", format: "Social", track: "all", title: "Lunch and mentor tables", who: "Book 20 minutes with a speaker from your track", room: "Expo Hall" },
      { time: "14:30", format: "Talk", track: "management", title: "Pricing AI features people trust", who: "Priya Raman, Kinetica Forge", room: "Sala Frailejón" },
      { time: "16:00", format: "Panel", track: "all", title: "Hiring when every junior has a copilot", who: "Mateo Gutiérrez Lozano (host) · Ngozi Adeyemi · Camila Duarte Herrera", room: "Sala Cóndor" },
      { time: "20:00", format: "Social", track: "all", title: "Caravana Nocturna after-party", who: "Live electrónica, rooftop views, no slides allowed", room: "Terraza Mirador" },
    ],
  },
  {
    id: "day3",
    label: "Day 3",
    date: "Thu 19 Nov",
    sessions: [
      { time: "09:00", format: "Talk", track: "development", title: "Shipping with AI pair-builders: what broke, what stuck", who: "Tomás Achterberg, Brightloom", room: "Sala Cóndor" },
      { time: "10:30", format: "Talk", track: "design", title: "Research at the speed of synthesis", who: "Camila Duarte Herrera, Guadua Labs", room: "Sala Frailejón" },
      { time: "11:30", format: "Workshop", track: "management", title: "Write a spec an agent can build from", who: "Joaquín Ferreyra, Cafetal Systems", room: "Sala Guadua" },
      { time: "13:00", format: "Social", track: "all", title: "Lunch and last call at the expo", who: "Vote for the People’s Demo award", room: "Expo Hall" },
      { time: "14:30", format: "Talk", track: "development", title: "Latency is a design material", who: "Sun-Hee Park, Lumen & Lathe · Andrés Villalba Torres, Kinetica Forge", room: "Sala Frailejón" },
      { time: "16:00", format: "Keynote", track: "all", title: "What we build next", who: "Valentina Ríos Ocampo · Amara Okonkwo-Silva · Lucía Fernández Quispe", room: "Sala Cóndor" },
    ],
  },
];

export const testimonial = {
  eyebrow: "Heard at AI Caravan 2025, Medellín",
  quote:
    "We came for the AI talks and left with a new way of working. Our designers, PMs and engineers finally speak the same language.",
  initials: "DM",
  name: "Daniela Moreno Castaño",
  role: "Head of Product Design, Ceiba Financial",
};

export const venue = {
  name: "Pabellón Altiplano",
  intro:
    "Pabellón Altiplano is a converted textile mill in Bogotá’s creative district: three stages, a glass-roofed expo hall and a terrace facing the eastern hills.",
  facts: [
    { label: "Where", value: "Distrito Altiplano, Bogotá" },
    { label: "From the airport", value: "About 25 minutes by car" },
    { label: "Doors open", value: "Daily from 08:00" },
  ],
  tips: [
    { icon: "plane", title: "Fly in easy", body: "Direct flights land from 30+ cities across the Americas and Europe. Our shuttle runs from the airport every hour on 16 November." },
    { icon: "bed", title: "Stay close", body: "Partner hotels within a 10-minute walk start at USD 95 a night with the code CARAVAN26." },
    { icon: "layers", title: "Pack layers", body: "Expect 9–19 °C and an afternoon shower. Drink water and take day one slowly; the altitude is real." },
  ],
} as const;

export const tiers = [
  {
    id: "day",
    badge: "1 day",
    name: "Day Pass",
    blurb: "Any single day of talks and panels.",
    price: "290",
    note: undefined as string | undefined,
    features: ["All talks and panels on your day", "AI Product Expo access", "Lunch and coffee"],
    cta: "Choose day",
    featured: false,
  },
  {
    id: "caravan",
    badge: "3 days",
    name: "Caravan Pass",
    blurb: "The full route: every day, every track.",
    price: "690",
    note: "Early-bird price until 31 Oct, then USD 840",
    features: ["Every talk, panel and keynote", "Two reserved workshop seats", "Caravana Nocturna after-party", "All session recordings"],
    cta: "Get pass",
    featured: true,
  },
  {
    id: "convoy",
    badge: "5 passes",
    name: "Team Convoy",
    blurb: "Bring your trio: design, product and engineering.",
    price: "2,950",
    note: undefined as string | undefined,
    features: ["Five Caravan Passes", "A private team workshop", "One invoice in COP or USD"],
    cta: "Talk to us",
    featured: false,
  },
];

export const faqs = [
  { q: "Who is AI Caravan for?", a: "Product designers, product managers and engineers at any level who are building, or about to build, AI features. Most attendees work in product teams of 5 to 500 people." },
  { q: "Do I need to code to join a workshop?", a: "No. Each workshop lists its level. Design and management workshops need only a laptop and curiosity; development workshops expect basic command-line comfort." },
  { q: "Which language are the talks in?", a: "About half the sessions are in Spanish and half in English. Main-stage talks have live interpretation both ways and captions on screen." },
  { q: "Is there a student or nonprofit discount?", a: "Yes. Students and nonprofit staff get 60% off any pass, and we fund 40 full scholarships for people from under-represented groups in tech. Join the list below to apply." },
  { q: "Can I transfer my ticket?", a: "Any time up to 48 hours before doors open, free of charge. Just send us the new attendee’s name and email." },
  { q: "How accessible is the venue?", a: "Every stage and room is step-free, with lifts to the terrace, a quiet room, live captions and reserved seating near the front. Tell us what you need when you register." },
];

export const footerColumns = [
  { title: "Program", links: ["Tracks", "Agenda", "Speakers", "Workshops"] },
  { title: "Attend", links: ["Tickets", "Venue", "Travel", "Accessibility"] },
  { title: "Partners", links: ["Become a partner", "Expo floor", "Media kit"] },
  { title: "Community", links: ["Scholarships", "Volunteer", "Code of conduct"] },
  { title: "About", links: ["Past stops", "FAQ", "Contact"] },
];
