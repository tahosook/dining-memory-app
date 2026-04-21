# MediaPipe Meal Input Assist Model Asset

Place the local test model at:

- `android/app/src/main/assets/mediapipe/meal-input-assist.task`

This repo intentionally does not commit the actual `.task` model yet.

Current assumptions:

- The Android native bridge reads the classifier from the bundled asset path above.
- The model should expose coarse food labels compatible with the JS normalizer.
- The expected coarse labels are:
  - `ramen`
  - `udon`
  - `soba`
  - `sushi`
  - `curry_rice`
  - `set_meal`
  - `dessert`
  - `drink`
  - `bento`
  - `unknown`
