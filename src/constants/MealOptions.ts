export const CUISINE_TYPE_OPTIONS = ['和食', '中華', '洋食', 'その他'] as const;

export type CuisineTypeOption = (typeof CUISINE_TYPE_OPTIONS)[number];
