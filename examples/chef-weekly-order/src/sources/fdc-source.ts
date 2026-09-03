import { mintOfferRef, actionableFor, type Offer, type OfferSource } from '@scaffold/core';
import { CHEF_RUBRIC } from '../rubric.js';
import type { FdcFood, FdcNutrient, FdcSearchResponse } from '../types.js';

export const fdcSource: OfferSource<FdcSearchResponse> = {
  source: 'usda-fdc',
  toOffers(raw: FdcSearchResponse): Offer[] {
    return raw.foods.map((food: FdcFood) => ({
      offerRef: mintOfferRef(),
      product: { title: food.description, subtitle: `FDC #${food.fdcId}` },
      source: 'usda-fdc',
      productType: 'ingredient-identity',
      actionable: actionableFor(CHEF_RUBRIC, 'usda-fdc'),
      price: { total: null, currency: 'USD', incomplete: true },
      economics: { compensation: null, endUserPrice: null },
      attributes: {
        fdcId: food.fdcId,
        nutrients: Object.fromEntries(
          food.foodNutrients.map((n: FdcNutrient) => [n.nutrientName, { value: n.value, unit: n.unitName }])
        ),
      },
      section: 'ingredients',
      quotedAt: new Date().toISOString(),
    }));
  },
};
