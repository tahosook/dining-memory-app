package com.tahosook.diningmemory

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MediaPipeMealInputAssistSupportTest {
  @Test
  fun `uses the fixed bundled model asset path`() {
    assertEquals(
      "mediapipe/meal-input-assist.task",
      MEDIAPIPE_MEAL_INPUT_ASSIST_MODEL_ASSET_PATH,
    )
    assertEquals(
      "MediaPipe meal input assist model asset が見つかりません: mediapipe/meal-input-assist.task",
      MediaPipeMealInputAssistSupport.buildModelMissingReason(),
    )
  }

  @Test
  fun `normalizes supported local photo paths and rejects other schemes`() {
    assertEquals(
      "/tmp/meal-photo.jpg",
      MediaPipeMealInputAssistSupport.resolveLocalPhotoPath("file:///tmp/meal-photo.jpg"),
    )
    assertEquals(
      "/tmp/meal-photo.jpg",
      MediaPipeMealInputAssistSupport.resolveLocalPhotoPath("/tmp/meal-photo.jpg"),
    )
    assertNull(MediaPipeMealInputAssistSupport.resolveLocalPhotoPath("content://media/external/images/1"))
    assertNull(MediaPipeMealInputAssistSupport.resolveLocalPhotoPath("https://example.com/meal.jpg"))
    assertNull(MediaPipeMealInputAssistSupport.resolveLocalPhotoPath("   "))
  }

  @Test
  fun `sanitizes category payloads before they are bridged to js`() {
    val sanitized = MediaPipeMealInputAssistSupport.sanitizeCategories(
      listOf(
        MediaPipeCategoryPayload(
          label = " sushi ",
          score = 1.2,
          index = 1,
          displayName = " Sushi ",
        ),
        MediaPipeCategoryPayload(
          label = " ",
          score = 0.4,
          index = 2,
          displayName = " ",
        ),
        MediaPipeCategoryPayload(
          label = "unknown",
          score = Double.NaN,
        ),
      ),
    )

    assertEquals(
      listOf(
        MediaPipeCategoryPayload(
          label = "sushi",
          score = 1.0,
          index = 1,
          displayName = "Sushi",
        ),
        MediaPipeCategoryPayload(
          label = "unknown",
          score = null,
          index = null,
          displayName = null,
        ),
      ),
      sanitized,
    )
  }
}
