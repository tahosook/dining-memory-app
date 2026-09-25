package com.tahosook.diningmemory

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MediaPipeMealInputAssistSupportTest {
  @Test
  fun `defines default model paths and missing reason`() {
    assertEquals(
      "ai-models",
      MEDIAPIPE_DEFAULT_MODEL_DIR,
    )
    assertEquals(
      "meal-input-assist.task",
      MEDIAPIPE_DEFAULT_MODEL_FILE_NAME,
    )
    assertEquals(
      "MediaPipe meal input assist model file が見つかりません: ai-models/meal-input-assist.task",
      MediaPipeMealInputAssistSupport.buildModelMissingReason(),
    )
  }

  @Test
  fun `builds model load failed reason for empty or invalid model file`() {
    val reason = MediaPipeMealInputAssistSupport.buildModelLoadFailedReason(
      "Model file is not a regular file or is empty: /path/to/meal-input-assist.task"
    )
    assertEquals(
      "MediaPipe meal input assist model file を読み込めませんでした: Model file is not a regular file or is empty: /path/to/meal-input-assist.task",
      reason,
    )
  }

  @Test
  fun `resolves default model file location`() {
    val baseDir = File("/data/user/0/com.tahosook.diningmemory/files")
    val modelFile = MediaPipeMealInputAssistSupport.resolveDefaultModelFile(baseDir)
    assertEquals(
      File("/data/user/0/com.tahosook.diningmemory/files/ai-models/meal-input-assist.task"),
      modelFile,
    )
  }

  @Test
  fun `resolves local file paths from file URIs and bare paths`() {
    assertEquals(
      "/tmp/model.task",
      MediaPipeMealInputAssistSupport.resolveLocalFilePath("file:///tmp/model.task"),
    )
    assertEquals(
      "/tmp/model.task",
      MediaPipeMealInputAssistSupport.resolveLocalFilePath("/tmp/model.task"),
    )
    assertNull(MediaPipeMealInputAssistSupport.resolveLocalFilePath("content://media/external/images/1"))
    assertNull(MediaPipeMealInputAssistSupport.resolveLocalFilePath("https://example.com/model.task"))
    assertNull(MediaPipeMealInputAssistSupport.resolveLocalFilePath("   "))
    assertNull(MediaPipeMealInputAssistSupport.resolveLocalFilePath(null))
  }

  @Test
  fun `computes streaming sha256 checksum correctly`() {
    val tempFile = File.createTempFile("test-sha256", ".task")
    try {
      tempFile.writeText("hello world")
      val hash = MediaPipeMealInputAssistSupport.computeSha256(tempFile)
      assertEquals("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9", hash)
    } finally {
      tempFile.delete()
    }
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
