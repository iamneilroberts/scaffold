export interface Cook {
  id: string;
  meat: string;
  weightLbs: number;
  smokerTempF: number;
  targetInternalF: number;
  woodType?: string;
  rub?: string;
  status: 'active' | 'completed';
  startedAt: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CookLog {
  id: string;
  cookId: string;
  timestamp: string;
  event: 'temp_check' | 'wrap' | 'spritz' | 'add_wood' | 'adjust_vent' | 'rest' | 'note';
  meatTempF?: number;
  smokerTempF?: number;
  details?: string;
}

export interface Recipe {
  id: string;
  name: string;
  meat: string;
  smokerTempF: number;
  targetInternalF: number;
  woodType: string;
  estimatedMinutesPerLb: number;
  rub?: string;
  steps: string[];
  tips?: string[];
  createdAt: string;
  updatedAt: string;
}
