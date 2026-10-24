package com.tahosook.diningmemory

import android.graphics.BitmapFactory
import android.util.Log
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
private const val CLASSIFIER_MAX_RESULTS = 30

class MediaPipeMealInputAssistModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val worker: ExecutorService = Executors.newSingleThreadExecutor()

  @Volatile
  private var classifier: ImageClassifier? = null

  @Volatile
  private var activeModelId: String? = null

  override fun getName(): String = MODULE_NAME

  override fun invalidate() {
    synchronized(this) {
      classifier?.close()
      classifier = null
      activeModelId = null
    }
    worker.shutdown()
    super.invalidate()
  }

  @ReactMethod
  fun getClassifierStatus(promise: Promise) {
    getClassifierStatusForModel(MODEL_ID_COOKING_METHOD_9CLASS, promise)
  }

  @ReactMethod
  fun getClassifierStatusForModel(modelId: String, promise: Promise) {
    worker.execute {
      val status = Arguments.createMap()
      val spec = MediaPipeMealInputAssistSupport.resolveModelSpec(modelId)
      if (spec == null) {
        status.putString("kind", "unavailable")
        status.putString("reason", "Unknown MediaPipe model ID: $modelId")
        promise.resolve(status)
        return@execute
      }

      try {
        ensureClassifier(spec.id)
        status.putString("kind", "ready")
      } catch (error: FileNotFoundException) {
        status.putString("kind", "unavailable")
        val modelFile = MediaPipeMealInputAssistSupport.resolveModelFile(reactApplicationContext, spec)
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
    classifyStaticImageWithModel(photoUri, MODEL_ID_COOKING_METHOD_9CLASS, promise)
  }

  @ReactMethod
  fun classifyStaticImageWithModel(photoUri: String, modelId: String, promise: Promise) {
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

      val spec = MediaPipeMealInputAssistSupport.resolveModelSpec(modelId)
      if (spec == null) {
        bitmap.recycle()
        promise.reject("E_INVALID_MODEL_ID", "Unknown MediaPipe model ID: $modelId")
        return@execute
      }

      try {
        val imageClassifier = try {
          ensureClassifier(spec.id)
        } catch (error: FileNotFoundException) {
          val modelFile = MediaPipeMealInputAssistSupport.resolveModelFile(reactApplicationContext, spec)
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

        promise.resolve(buildClassificationResultMap(photoUri, classifierResult, spec.id))
      } finally {
        bitmap.recycle()
      }
    }
  }

  @Synchronized
  private fun ensureClassifier(modelId: String = MODEL_ID_COOKING_METHOD_9CLASS): ImageClassifier {
    val spec = MediaPipeMealInputAssistSupport.resolveModelSpec(modelId)
      ?: throw IllegalArgumentException("Unknown MediaPipe model ID: $modelId")

    classifier?.let { existingClassifier ->
      if (activeModelId == spec.id) {
        return existingClassifier
      }
      try {
        existingClassifier.close()
      } catch (_: Exception) {
        // ignore close error
      }
      classifier = null
      activeModelId = null
    }

    val modelFile = MediaPipeMealInputAssistSupport.resolveModelFile(reactApplicationContext, spec)
    if (!modelFile.exists() || !modelFile.isFile || modelFile.length() <= 0L) {
      val seeded = MediaPipeMealInputAssistSupport.copyBundledModelAssetIfAvailable(
        reactApplicationContext,
        modelFile,
        spec.assetPath,
      )
      if (!seeded) {
        Log.w(MODULE_NAME, "Failed to seed bundled MediaPipe model asset ${spec.assetPath} to ${modelFile.absolutePath}")
      }
    }

    if (!modelFile.exists()) {
      throw FileNotFoundException(
        MediaPipeMealInputAssistSupport.buildModelMissingReason(modelFile.absolutePath),
      )
    }

    if (!modelFile.isFile || modelFile.length() <= 0L) {
      throw IOException(
        MediaPipeMealInputAssistSupport.buildModelLoadFailedReason(
          "Model file is not a regular file or is empty: ${modelFile.absolutePath}",
        ),
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
      activeModelId = spec.id
    }
  }

  private fun buildClassificationResultMap(
    photoUri: String,
    classifierResult: ImageClassifierResult,
    modelVersion: String? = null,
  ) = Arguments.createMap().apply {
    putString("photoUri", photoUri)
    putArray("categories", buildCategoriesArray(classifierResult))
    putString("classifierName", MEDIAPIPE_MEAL_INPUT_ASSIST_CLASSIFIER_NAME)
    if (modelVersion != null) {
      putString("modelVersion", modelVersion)
    }
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
