import type { Meal } from '../types/MealTypes';

export type MealDetailRouteParams = {
  meal: Meal;
  meals?: Meal[];
  initialIndex?: number;
};

export type RecordsStackParamList = {
  RecordsList: undefined;
  MealDetail: MealDetailRouteParams;
};

export type RootTabParamList = {
  Camera: undefined;
  Records: undefined;
  Search: undefined;
  Stats: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  MealDetail: MealDetailRouteParams;
};
