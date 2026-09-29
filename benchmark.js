const uniqueNextMeals = Array.from({ length: 100 }, (_, i) => ({
  id: `meal-${i}`,
  photo_thumbnail_path: `path/to/thumb-${i}.jpg`
}));

const current = {};
for (let i = 0; i < 100; i++) {
  current[`meal-${i}`] = `path/to/thumb-${i}.jpg`;
}

// Benchmark 1: Always spread
function alwaysSpread(curr) {
  const next = { ...curr };
  for (const meal of uniqueNextMeals) {
    if (meal.photo_thumbnail_path && !next[meal.id]) {
      next[meal.id] = meal.photo_thumbnail_path;
    }
  }
  return next;
}

// Benchmark 2: Lazy spread
function lazySpread(curr) {
  let next = curr;
  let hasChanges = false;
  for (const meal of uniqueNextMeals) {
    if (meal.photo_thumbnail_path && !curr[meal.id]) {
      if (!hasChanges) {
        next = { ...curr };
        hasChanges = true;
      }
      next[meal.id] = meal.photo_thumbnail_path;
    }
  }
  return next;
}

console.time('alwaysSpread');
for (let i = 0; i < 100000; i++) {
  alwaysSpread(current);
}
console.timeEnd('alwaysSpread');

console.time('lazySpread');
for (let i = 0; i < 100000; i++) {
  lazySpread(current);
}
console.timeEnd('lazySpread');
