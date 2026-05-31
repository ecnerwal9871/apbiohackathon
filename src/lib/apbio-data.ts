import type { Unit } from "@/lib/types";

export const DAILY_TASKS = [
  "Finish one chapter checkpoint",
  "Run one 25-minute focus block",
  "Review flashcards",
  "Summarize one concept in notes",
  "Do one quiz or FRQ"
];

export const AP_UNITS: Unit[] = [
  {
    id: 1,
    name: "Chemistry of Life",
    difficulty: "hard",
    season: "summer",
    description: "Water, biological molecules, and enzyme fundamentals.",
    chapters: [
      { id: "1.1", title: "Water and Polarity" },
      { id: "1.2", title: "Elements of Life" },
      { id: "1.3", title: "Biological Macromolecules" },
      { id: "1.4", title: "Properties of Enzymes" },
      { id: "1.5", title: "Structure and Function" }
    ],
    resources: [
      { label: "College Board AP Biology", url: "https://apstudents.collegeboard.org/courses/ap-biology" },
      { label: "Khan Academy AP Biology", url: "https://www.khanacademy.org/science/ap-biology" }
    ],
    flashcards: [
      { q: "Why is water polar?", a: "Oxygen attracts electrons more strongly, creating partial charges." },
      { q: "What is enzyme saturation?", a: "When all active sites are occupied and rate plateaus." }
    ]
  },
  {
    id: 2,
    name: "Cell Structure and Function",
    difficulty: "hard",
    season: "summer",
    description: "Cell architecture, membrane systems, and transport.",
    chapters: [
      { id: "2.1", title: "Cell Structure" },
      { id: "2.2", title: "Cell Size and Surface Area" },
      { id: "2.3", title: "Membrane Transport" },
      { id: "2.4", title: "Cell Compartmentalization" }
    ],
    resources: [
      { label: "Bozeman Science AP Biology", url: "https://www.bozemanscience.com/ap-biology/" }
    ],
    flashcards: [
      { q: "Active vs passive transport?", a: "Active uses energy; passive follows gradient." }
    ]
  },
  {
    id: 3,
    name: "Cellular Energetics",
    difficulty: "hard",
    season: "summer",
    description: "Photosynthesis, respiration, ATP flow, and metabolic control.",
    chapters: [
      { id: "3.1", title: "Enzyme Catalysis" },
      { id: "3.2", title: "Photosynthesis" },
      { id: "3.3", title: "Cellular Respiration" },
      { id: "3.4", title: "ATP and Coupled Reactions" },
      { id: "3.5", title: "Metabolic Pathway Regulation" }
    ],
    resources: [
      { label: "Khan AP Energetics", url: "https://www.khanacademy.org/science/ap-biology" }
    ],
    flashcards: [
      { q: "Where does ETC happen?", a: "Inner mitochondrial membrane in eukaryotes." }
    ]
  },
  {
    id: 4,
    name: "Cell Communication and Cell Cycle",
    difficulty: "hard",
    season: "summer",
    description: "Signal pathways, checkpoints, mitosis, and regulation.",
    chapters: [
      { id: "4.1", title: "Signal Transduction" },
      { id: "4.2", title: "Feedback Mechanisms" },
      { id: "4.3", title: "Cell Cycle" },
      { id: "4.4", title: "Mitosis and Regulation" }
    ],
    resources: [
      { label: "AP Central", url: "https://apcentral.collegeboard.org/courses/ap-biology" }
    ],
    flashcards: [
      { q: "What is apoptosis?", a: "Programmed cell death for healthy regulation." }
    ]
  },
  {
    id: 5,
    name: "Heredity",
    difficulty: "medium",
    season: "fall",
    description: "Meiosis, inheritance, probability, and pedigree analysis.",
    chapters: [
      { id: "5.1", title: "Meiosis" },
      { id: "5.2", title: "Mendelian Genetics" },
      { id: "5.3", title: "Non-Mendelian Patterns" },
      { id: "5.4", title: "Chi-Square and Probability" }
    ],
    resources: [
      { label: "Khan Genetics", url: "https://www.khanacademy.org/science/biology/her" }
    ],
    flashcards: [
      { q: "Law of segregation?", a: "Alleles separate during gamete formation." }
    ]
  },
  {
    id: 6,
    name: "Gene Expression and Regulation",
    difficulty: "hard",
    season: "fall",
    description: "DNA replication, transcription, translation, and gene control.",
    chapters: [
      { id: "6.1", title: "DNA and RNA Structure" },
      { id: "6.2", title: "DNA Replication" },
      { id: "6.3", title: "Transcription" },
      { id: "6.4", title: "Translation" },
      { id: "6.5", title: "Gene Regulation and Mutation" }
    ],
    resources: [
      { label: "Central Dogma Review", url: "https://www.khanacademy.org/science/biology/gene-expression-central-dogma" }
    ],
    flashcards: [
      { q: "What is an operon?", a: "Genes controlled together by one promoter in prokaryotes." }
    ]
  },
  {
    id: 7,
    name: "Natural Selection",
    difficulty: "medium",
    season: "winter",
    description: "Evolution mechanisms, allele frequencies, and phylogenies.",
    chapters: [
      { id: "7.1", title: "Natural Selection" },
      { id: "7.2", title: "Hardy-Weinberg" },
      { id: "7.3", title: "Population Genetics" },
      { id: "7.4", title: "Speciation and Phylogeny" }
    ],
    resources: [
      { label: "AP Biology CED PDF", url: "https://apcentral.collegeboard.org/media/pdf/ap-biology-course-and-exam-description.pdf" }
    ],
    flashcards: [
      { q: "Hardy-Weinberg equation?", a: "p^2 + 2pq + q^2 = 1, where p + q = 1." }
    ]
  },
  {
    id: 8,
    name: "Ecology",
    difficulty: "easy",
    season: "spring",
    description: "Population dynamics, ecosystem flow, and conservation.",
    chapters: [
      { id: "8.1", title: "Population Ecology" },
      { id: "8.2", title: "Community Ecology" },
      { id: "8.3", title: "Ecosystem Dynamics" },
      { id: "8.4", title: "Human Impact" }
    ],
    resources: [
      { label: "Ecology Review", url: "https://www.khanacademy.org/science/biology/ecology" }
    ],
    flashcards: [
      { q: "What is the 10 percent rule?", a: "Only around 10 percent of energy transfers each trophic level." }
    ]
  }
];

export const ALL_CHAPTERS = AP_UNITS.flatMap((u) => u.chapters.map((c) => ({ ...c, unitId: u.id })));
