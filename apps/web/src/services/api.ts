import type { CreateLinkDTO, CreateLinkResponse } from '@sniprl/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export async function checkHealth(): Promise<{ ok: boolean; service: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error('API Health check failed');
  }
  return response.json();
}

export async function createShortLink(payload: CreateLinkDTO): Promise<CreateLinkResponse> {
  const response = await fetch(`${API_BASE_URL}/api/links`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to create short link');
  }

  return response.json();
}
