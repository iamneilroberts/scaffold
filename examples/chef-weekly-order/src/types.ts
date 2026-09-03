export interface FdcNutrient {
  nutrientId: number;
  nutrientName: string;
  unitName: string;
  value: number;
}

export interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodCategory?: string;
  foodNutrients: FdcNutrient[];
}

export interface FdcSearchResponse {
  totalHits: number;
  currentPage: number;
  totalPages: number;
  foods: FdcFood[];
}

export interface NassQuickStatsRow {
  commodity_desc: string;
  statisticcat_desc: string;
  unit_desc: string;
  Value: string;
  year: string;
  state_name: string;
  freq_desc: string;
  reference_period_desc: string;
}

export interface NassQuickStatsResponse {
  data: NassQuickStatsRow[];
}

export interface LocalFarmVendor {
  vendorId: string;
  commodity: string;
  region: string;
  pricePerLb: number;
  compensationPct: number;
}
