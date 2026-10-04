import { Atkinson_Hyperlegible_Next, Source_Serif_4 } from "next/font/google";

// Mockup v3's two voices: Atkinson Hyperlegible Next for plain language, Source Serif 4 for the law's own words.
const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"] });
const serif4 = Source_Serif_4({ variable: "--font-serif4", subsets: ["latin"] });

export const fontVars = `${atkinson.variable} ${serif4.variable}`;
