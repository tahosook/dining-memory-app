import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Meal } from '../types/MealTypes';

export type RecordsStackParamList = {
  RecordsList: undefined;
  MealDetail: {
    meal: Meal;
  };
};

export type RootTabParamList = {
  Camera: undefined;
  Records: NavigatorScreenParams<RecordsStackParamList> | undefined;
  Search: undefined;
  Stats: undefined;
  Settings: undefined;
};
