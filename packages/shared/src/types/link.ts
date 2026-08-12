export interface Link {
  id: bigint;
  shortCode: string;
  longUrl: string;
  managementToken: string;
  email?: string | null;
  customAlias: boolean;
  expiresAt?: Date | string | null;
  maxClicks?: number | null;
  passwordHash?: string | null;
  createdAt: Date | string;
}

export interface CreateLinkDTO {
  longUrl: string;
  customAlias?: string;
  expiresAt?: string;
  maxClicks?: number;
  email?: string;
  password?: string;
}

export interface CreateLinkResponse {
  shortCode: string;
  shortUrl: string;
  managementToken: string;
  createdAt: string;
  reused?: boolean;
}

export interface UpdateLinkDTO {
  longUrl?: string;
  expiresAt?: string | null;
  maxClicks?: number | null;
  email?: string | null;
}

export interface LinkStatsResponse {
  shortCode: string;
  longUrl: string;
  createdAt: string;
  expiresAt?: string | null;
  maxClicks?: number | null;
  totalClicks: number;
}
