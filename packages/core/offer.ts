import { randomId } from './storage.js';

export type Actionable = 'managed' | 'referral' | 'none';

export interface Compensation {
  kind: string;
  amount: number | null;
  currency?: string;
  basis?: string;
}

export interface Offer {
  offerRef: string;
  product: { title: string; subtitle?: string };
  source: string;
  productType: string;      // required; the OfferSource knows it, Rubric is keyed on it
  identityKey?: string;     // optional; cross-source merge key (unused by v1 examples)
  actionable: Actionable;
  price: { total: number | null; unit?: string; currency: string; incomplete?: boolean };
  economics: { compensation: Compensation | null; endUserPrice: number | null };
  attributes?: Record<string, unknown>;
  badges?: string[];
  links?: { action?: string; verify?: string; detail?: string };
  quotedAt?: string;
  section: string;
  raw?: unknown;
}

export interface OfferSource<Raw> {
  source: string;
  toOffers(raw: Raw): Offer[];
}

export function mintOfferRef(): string {
  return randomId('ofr');
}
