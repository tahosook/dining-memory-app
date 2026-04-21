package com.tahosook.diningmemory

import java.io.File
import java.net.URI
import java.net.URISyntaxException
import kotlin.math.max
import kotlin.math.min

internal const val MEDIAPIPE_MEAL_INPUT_ASSIST_MODEL_ASSET_PATH = "mediapipe/meal-input-assist.task"
internal const val MEDIAPIPE_MEAL_INPUT_ASSIST_CLASSIFIER_NAME = "mediapipe-image-classifier"

private const val MODEL_MISSING_REASON_PREFIX = "MediaPipe meal input assist model asset が見つかりません: "
private const val CLASSIFIER_INIT_FAILED_REASON_PREFIX = "MediaPipe static-image classifier を初期化できませんでした: "
private const val INVALID_PHOTO_URI_REASON_PREFIX = "MediaPipe static-image classifier は file:// または absolute path だけを受け付けます: "
private const val PHOTO_MISSING_REASON_PREFIX = "MediaPipe static-image classifier が参照する photo が見つかりません: "
private const val PHOTO_DECODE_FAILED_REASON_PREFIX = "MediaPipe static-image classifier 用に photo を decode できませんでした: "
private const val CLASSIFICATION_FAILED_REASON_PREFIX = "MediaPipe static-image classification に失敗しました: "

internal data class MediaPipeCategoryPayload(
  val label: String,
  val score: Double? = null,
  val index: Int? = null,
  val displayName: String? = null,
)

internal object MediaPipeMealInputAssistSupport {
  fun buildModelMissingReason(assetPath: String = MEDIAPIPE_MEAL_INPUT_ASSIST_MODEL_ASSET_PATH): String {
    return "$MODEL_MISSING_REASON_PREFIX$assetPath"
  }

  fun buildClassifierInitFailedReason(message: String): String {
    return "$CLASSIFIER_INIT_FAILED_REASON_PREFIX$message"
  }

  fun buildInvalidPhotoUriReason(photoUri: String): String {
    return "$INVALID_PHOTO_URI_REASON_PREFIX$photoUri"
  }

  fun buildPhotoMissingReason(photoPath: String): String {
    return "$PHOTO_MISSING_REASON_PREFIX$photoPath"
  }

  fun buildPhotoDecodeFailedReason(photoPath: String): String {
    return "$PHOTO_DECODE_FAILED_REASON_PREFIX$photoPath"
  }

  fun buildClassificationFailedReason(message: String): String {
    return "$CLASSIFICATION_FAILED_REASON_PREFIX$message"
  }

  fun resolveLocalPhotoPath(photoUri: String): String? {
    val trimmed = photoUri.trim()
    if (trimmed.isEmpty()) {
      return null
    }

    if (trimmed.startsWith(File.separator)) {
      return trimmed
    }

    val parsedUri = try {
      URI(trimmed)
    } catch (_: IllegalArgumentException) {
      return null
    } catch (_: URISyntaxException) {
      return null
    }

    return if (parsedUri.scheme == "file") {
      parsedUri.path?.takeIf { path ->
        path.isNotBlank() && path.startsWith(File.separator)
      }
    } else {
      null
    }
  }

  fun sanitizeCategories(categories: List<MediaPipeCategoryPayload>): List<MediaPipeCategoryPayload> {
    return categories.mapNotNull { category ->
      val label = category.label.trim()
      if (label.isEmpty()) {
        return@mapNotNull null
      }

      val normalizedScore = category.score?.takeUnless { score -> score.isNaN() }?.let { score ->
        min(1.0, max(0.0, score))
      }
      val normalizedDisplayName = category.displayName?.trim()?.ifBlank { null }

      MediaPipeCategoryPayload(
        label = label,
        score = normalizedScore,
        index = category.index,
        displayName = normalizedDisplayName,
      )
    }
  }
}
