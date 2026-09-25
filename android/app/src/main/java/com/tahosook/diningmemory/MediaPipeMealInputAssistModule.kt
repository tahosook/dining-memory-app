package com.tahosook.diningmemory

import android.graphics.BitmapFactory
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.imageclassifier.ImageClassifier
import com.google.mediapipe.tasks.vision.imageclassifier.ImageClassifierResult
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.IOException
import java.nio.channels.FileChannel
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val MODULE_NAME = "MediaPipeMealInputAssist"
private const val CLASSIFIER_MAX_RESULTS = 10

class MediaPipeMealInputAssistModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val worker: ExecutorService = Executors.newSingleThreadExecutor()

  @Volatile
  private var classifier: ImageClassifier? = null

  override fun getName(): String = MODULE_NAME

  override fun invalidate() {
    synchronized(this) {
      classifier?.close()
      classifier = null
    }
    worker.shutdown()
    super.invalidate()
  }

  @ReactMethod
  fun getClassifierStatus(promise: Promise) {
    worker.execute {
      val status = Arguments.createMap()

      try {
        ensureClassifier()
        status.putString("kind", "ready")
      } catch (error: FileNotFoundException) {
        status.putString("kind", "unavailable")
        val modelFile = MediaPipeMealInputAssistSupport.resolveDefaultModelFile(reactApplicationContext)
        status.putString("reason", error.message ?: MediaPipeMealInputAssistSupport.buildModelMissingReason(modelFile.absolutePath))
      } catch (error: Exception) {
        status.putString("kind", "unavailable")
        status.putString(
          "reason",
          MediaPipeMealInputAssistSupport.buildClassifierInitFailedReason(
            error.message ?: error.javaClass.simpleName
          ),
        )
      }

      promise.resolve(status)
    }
  }

  @ReactMethod
  fun verifyFileSha256(filePathOrUri: String, expectedSha256: String, promise: Promise) {
    worker.execute {
      val localPath = MediaPipeMealInputAssistSupport.resolveLocalFilePath(filePathOrUri)
      if (localPath == null) {
        promise.reject(
          "E_INVALID_FILE_PATH",
          MediaPipeMealInputAssistSupport.buildInvalidFilePathReason(filePathOrUri),
        )
        return@execute
      }

      val file = File(localPath)
      if (!file.exists()) {
        promise.reject(
          "E_FILE_NOT_FOUND",
          MediaPipeMealInputAssistSupport.buildFileNotFoundReason(localPath),
        )
        return@execute
      }

      try {
        val computedHash = MediaPipeMealInputAssistSupport.computeSha256(file)
        val matches = computedHash.equals(expectedSha256.trim(), ignoreCase = true)
        promise.resolve(matches)
      } catch (error: Exception) {
        promise.reject(
          "E_HASH_COMPUTATION_FAILED",
          error.message ?: error.javaClass.simpleName,
          error,
        )
      }
    }
  }

  @ReactMethod
  fun computeFileSha256(filePathOrUri: String, promise: Promise) {
    worker.execute {
      val localPath = MediaPipeMealInputAssistSupport.resolveLocalFilePath(filePathOrUri)
      if (localPath == null) {
        promise.reject(
          "E_INVALID_FILE_PATH",
          MediaPipeMealInputAssistSupport.buildInvalidFilePathReason(filePathOrUri),
        )
        return@execute
      }

      val file = File(localPath)
      if (!file.exists()) {
        promise.reject(
          "E_FILE_NOT_FOUND",
          MediaPipeMealInputAssistSupport.buildFileNotFoundReason(localPath),
        )
        return@execute
      }

      try {
        val computedHash = MediaPipeMealInputAssistSupport.computeSha256(file)
        promise.resolve(computedHash)
      } catch (error: Exception) {
        promise.reject(
          "E_HASH_COMPUTATION_FAILED",
          error.message ?: error.javaClass.simpleName,
          error,
        )
      }
    }
  }

  @ReactMethod
  fun classifyStaticImage(photoUri: String, promise: Promise) {
    worker.execute {
      val photoPath = MediaPipeMealInputAssistSupport.resolveLocalPhotoPath(photoUri)
      if (photoPath == null) {
        promise.reject(
          "E_INVALID_PHOTO_URI",
          MediaPipeMealInputAssistSupport.buildInvalidPhotoUriReason(photoUri),
        )
        return@execute
      }

      val photoFile = File(photoPath)
      if (!photoFile.exists()) {
        promise.reject(
          "E_PHOTO_MISSING",
          MediaPipeMealInputAssistSupport.buildPhotoMissingReason(photoPath),
        )
        return@execute
      }

      val bitmap = BitmapFactory.decodeFile(photoPath)
      if (bitmap == null) {
        promise.reject(
          "E_PHOTO_DECODE_FAILED",
          MediaPipeMealInputAssistSupport.buildPhotoDecodeFailedReason(photoPath),
        )
        return@execute
      }

      try {
        val imageClassifier = try {
          ensureClassifier()
        } catch (error: FileNotFoundException) {
          val modelFile = MediaPipeMealInputAssistSupport.resolveDefaultModelFile(reactApplicationContext)
          promise.reject(
            "E_MODEL_MISSING",
            error.message ?: MediaPipeMealInputAssistSupport.buildModelMissingReason(modelFile.absolutePath),
            error,
          )
          return@execute
        } catch (error: IOException) {
          promise.reject(
            "E_MODEL_LOAD_FAILED",
            error.message ?: MediaPipeMealInputAssistSupport.buildModelLoadFailedReason(error.javaClass.simpleName),
            error,
          )
          return@execute
        } catch (error: Exception) {
          promise.reject(
            "E_CLASSIFIER_INIT_FAILED",
            error.message ?: MediaPipeMealInputAssistSupport.buildClassifierInitFailedReason(error.javaClass.simpleName),
            error,
          )
          return@execute
        }

        val mpImage = BitmapImageBuilder(bitmap).build()
        val classifierResult = try {
          imageClassifier.classify(mpImage)
        } catch (error: Exception) {
          promise.reject(
            "E_CLASSIFICATION_FAILED",
            MediaPipeMealInputAssistSupport.buildClassificationFailedReason(
              error.message ?: error.javaClass.simpleName
            ),
            error,
          )
          return@execute
        }

        promise.resolve(buildClassificationResultMap(photoUri, classifierResult))
      } finally {
        bitmap.recycle()
      }
    }
  }

  @Synchronized
  private fun ensureClassifier(): ImageClassifier {
    classifier?.let { existingClassifier ->
      return existingClassifier
    }

    val modelFile = MediaPipeMealInputAssistSupport.resolveDefaultModelFile(reactApplicationContext)
    if (!modelFile.exists()) {
      throw FileNotFoundException(
        MediaPipeMealInputAssistSupport.buildModelMissingReason(modelFile.absolutePath),
      )
    }

    val mappedByteBuffer = try {
      FileInputStream(modelFile).use { fis ->
        fis.channel.map(FileChannel.MapMode.READ_ONLY, 0, modelFile.length())
      }
    } catch (error: IOException) {
      throw IOException(
        MediaPipeMealInputAssistSupport.buildModelLoadFailedReason(
          error.message ?: error.javaClass.simpleName,
        ),
        error,
      )
    }

    val classifierOptions = ImageClassifier.ImageClassifierOptions.builder()
      .setBaseOptions(
        BaseOptions.builder()
          .setModelAssetBuffer(mappedByteBuffer)
          .build(),
      )
      .setRunningMode(RunningMode.IMAGE)
      .setMaxResults(CLASSIFIER_MAX_RESULTS)
      .build()

    return ImageClassifier.createFromOptions(reactApplicationContext, classifierOptions).also { createdClassifier ->
      classifier = createdClassifier
    }
  }

  private fun hasDefaultModelFile(): Boolean {
    return MediaPipeMealInputAssistSupport.resolveDefaultModelFile(reactApplicationContext).exists()
  }

  private fun buildClassificationResultMap(
    photoUri: String,
    classifierResult: ImageClassifierResult,
  ) = Arguments.createMap().apply {
    putString("photoUri", photoUri)
    putArray("categories", buildCategoriesArray(classifierResult))
    putString("classifierName", MEDIAPIPE_MEAL_INPUT_ASSIST_CLASSIFIER_NAME)
  }

  private fun buildCategoriesArray(classifierResult: ImageClassifierResult) = Arguments.createArray().apply {
    val rawCategories = classifierResult.classificationResult().classifications().flatMap { classifications ->
      classifications.categories().map { category ->
        MediaPipeCategoryPayload(
          label = category.categoryName(),
          score = category.score().toDouble(),
          index = category.index(),
          displayName = category.displayName(),
        )
      }
    }

    MediaPipeMealInputAssistSupport.sanitizeCategories(rawCategories).forEach { category ->
      pushMap(Arguments.createMap().apply {
        putString("label", category.label)
        if (category.score != null) {
          putDouble("score", category.score)
        }
        if (category.index != null) {
          putInt("index", category.index)
        }
        if (category.displayName != null) {
          putString("displayName", category.displayName)
        }
      })
    }
  }
}
