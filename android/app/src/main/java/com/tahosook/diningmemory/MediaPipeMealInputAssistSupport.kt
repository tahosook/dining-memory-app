package com.tahosook.diningmemory

import android.content.Context
import java.io.File
import java.io.FileInputStream
import java.net.URI
import java.net.URISyntaxException
import java.security.MessageDigest
import kotlin.math.max
import kotlin.math.min

internal const val MEDIAPIPE_DEFAULT_MODEL_DIR = "ai-models"
internal const val MEDIAPIPE_DEFAULT_MODEL_FILE_NAME = "meal-input-assist.task"
internal const val MEDIAPIPE_DEFAULT_MODEL_RELATIVE_PATH = "$MEDIAPIPE_DEFAULT_MODEL_DIR/$MEDIAPIPE_DEFAULT_MODEL_FILE_NAME"
internal const val MEDIAPIPE_MEAL_INPUT_ASSIST_MODEL_ASSET_PATH = "mediapipe/meal-input-assist.task"
internal const val MEDIAPIPE_MEAL_INPUT_ASSIST_CLASSIFIER_NAME = "mediapipe-image-classifier"

private const val MODEL_MISSING_REASON_PREFIX = "MediaPipe meal input assist model file が見つかりません: "
private const val MODEL_LOAD_FAILED_REASON_PREFIX = "MediaPipe meal input assist model file を読み込めませんでした: "
private const val CLASSIFIER_INIT_FAILED_REASON_PREFIX = "MediaPipe static-image classifier を初期化できませんでした: "
private const val INVALID_PHOTO_URI_REASON_PREFIX = "MediaPipe static-image classifier は file:// または absolute path だけを受け付けます: "
private const val INVALID_FILE_PATH_REASON_PREFIX = "file:// または absolute path だけを受け付けます: "
private const val FILE_NOT_FOUND_REASON_PREFIX = "ファイルが見つかりません: "
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
  fun buildModelMissingReason(modelPath: String = MEDIAPIPE_DEFAULT_MODEL_RELATIVE_PATH): String {
    return "$MODEL_MISSING_REASON_PREFIX$modelPath"
  }

  fun buildModelLoadFailedReason(message: String): String {
    return "$MODEL_LOAD_FAILED_REASON_PREFIX$message"
  }

  fun buildClassifierInitFailedReason(message: String): String {
    return "$CLASSIFIER_INIT_FAILED_REASON_PREFIX$message"
  }

  fun buildInvalidPhotoUriReason(photoUri: String): String {
    return "$INVALID_PHOTO_URI_REASON_PREFIX$photoUri"
  }

  fun buildInvalidFilePathReason(filePathOrUri: String): String {
    return "$INVALID_FILE_PATH_REASON_PREFIX$filePathOrUri"
  }

  fun buildFileNotFoundReason(filePath: String): String {
    return "$FILE_NOT_FOUND_REASON_PREFIX$filePath"
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

  fun resolveDefaultModelFile(context: Context): File {
    return resolveDefaultModelFile(context.filesDir)
  }

  fun resolveDefaultModelFile(baseDir: File): File {
    return File(File(baseDir, MEDIAPIPE_DEFAULT_MODEL_DIR), MEDIAPIPE_DEFAULT_MODEL_FILE_NAME)
  }

  fun resolveLocalFilePath(pathOrUri: String?): String? {
    if (pathOrUri.isNullOrBlank()) {
      return null
    }

    val trimmed = pathOrUri.trim()
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

  fun resolveLocalPhotoPath(photoUri: String): String? = resolveLocalFilePath(photoUri)

  fun computeSha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(8192)
    FileInputStream(file).use { fis ->
      var bytesRead: Int
      while (fis.read(buffer).also { bytesRead = it } != -1) {
        digest.update(buffer, 0, bytesRead)
      }
    }
    val hashBytes = digest.digest()
    return hashBytes.joinToString("") { "%02x".format(it) }
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
