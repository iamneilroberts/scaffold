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
