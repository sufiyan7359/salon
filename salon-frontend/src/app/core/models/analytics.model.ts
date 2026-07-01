export interface AnalyticsSummary {
  servedCounts: { today: number; week: number; month: number };
  avgWaitMinutes: number;
  revenue: { today: number; week: number; month: number };
  peakHours: { hour: number; count: number }[];
  ratings: {
    average: number;
    count: number;
    breakdown: Record<'1' | '2' | '3' | '4' | '5', number>;
  };
}
