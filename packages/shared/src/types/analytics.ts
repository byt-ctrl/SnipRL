export interface ClickEvent {
  id: bigint;
  linkId: bigint;
  clickedAt: Date | string;
  referrer?: string | null;
  deviceType?: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  browser?: string | null;
  os?: string | null;
  country?: string | null;
  city?: string | null;
  ipHash: string;
  isBot: boolean;
}

export interface AnalyticsSeriesItem {
  date: string;
  clicks: number;
}

export interface NamedCountItem {
  name: string;
  count: number;
}

export interface LinkAnalyticsResponse {
  shortCode: string;
  totalClicks: number;
  uniqueClicks: number;
  botClicks: number;
  humanClicks: number;
  clicksOverTime: AnalyticsSeriesItem[];
  topReferrers: NamedCountItem[];
  topCountries: NamedCountItem[];
  deviceBreakdown: NamedCountItem[];
}
