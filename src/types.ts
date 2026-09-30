export interface Finding {
  title: string;
  category: "Cabinetry" | "Countertops" | "Layout" | "Finishes & Wear" | "Fixtures & Lighting";
  severity: "Low" | "Medium" | "High";
  detail: string;
}

export interface RoomAnalysisResult {
  score: number;
  roomType: string;
  styleEra: string;
  verdict: string;
  findings: Finding[];
  positives: string[];
  concerns: string[];
  costRange: string;
  costNote: string;
  bottomLine: string;
}

export type ScreenState = 'hero' | 'analyzing' | 'report' | 'booked';

export interface SampleRoom {
  id: string;
  title: string;
  subtitle: string;
  url: string;
}
