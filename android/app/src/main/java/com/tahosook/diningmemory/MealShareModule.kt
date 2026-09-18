package com.tahosook.diningmemory

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.File
import java.io.FileNotFoundException

private const val MODULE_NAME = "MealShare"
private const val TAG = "MealShareModule"

class MealShareModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun shareMeal(options: ReadableMap, promise: Promise) {
    try {
      val title = if (options.hasKey("title")) options.getString("title") else null
      val text = if (options.hasKey("text")) options.getString("text") else null
      val photoUriString = if (options.hasKey("photoUri")) options.getString("photoUri") else null
      val mimeType = if (options.hasKey("mimeType")) options.getString("mimeType") else "image/jpeg"

      val shareIntent = Intent(Intent.ACTION_SEND)

      var contentUri: Uri? = null

      if (!photoUriString.isNullOrBlank()) {
        contentUri = resolveContentUri(photoUriString)
      }

      if (contentUri != null) {
        shareIntent.type = mimeType ?: "image/jpeg"
        shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri)
        shareIntent.clipData = ClipData.newRawUri(null, contentUri)
        shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

        if (!text.isNullOrBlank()) {
          shareIntent.putExtra(Intent.EXTRA_TEXT, text)
        }

        // Grant explicit read URI permissions to target packages (including X/Twitter)
        grantPermissionsToMatchingPackages(shareIntent, contentUri)
      } else {
        shareIntent.type = "text/plain"
        if (!text.isNullOrBlank()) {
          shareIntent.putExtra(Intent.EXTRA_TEXT, text)
        }
      }

      val chooserTitle = title ?: "共有"
      val chooserIntent = Intent.createChooser(shareIntent, chooserTitle)

      val currentActivity = reactContext.currentActivity
      if (currentActivity != null) {
        currentActivity.startActivity(chooserIntent)
      } else {
        chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(chooserIntent)
      }

      val result = Arguments.createMap().apply {
        putBoolean("success", true)
      }
      promise.resolve(result)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to share meal", e)
      promise.reject("SHARE_FAILED", "Failed to open share sheet: ${e.message}", e)
    }
  }

  private fun resolveContentUri(uriString: String): Uri {
    if (MealShareSupport.isContentUri(uriString)) {
      return Uri.parse(uriString)
    }

    val filePath = MealShareSupport.resolveLocalFilePath(uriString)
      ?: throw IllegalArgumentException("Unsupported photo URI scheme: $uriString")

    val file = File(filePath)
    if (!file.exists()) {
      throw FileNotFoundException("Local photo file does not exist at path: $filePath")
    }

    val authority = "${reactContext.packageName}.SharingFileProvider"
    return FileProvider.getUriForFile(reactContext, authority, file)
  }

  private fun grantPermissionsToMatchingPackages(intent: Intent, uri: Uri) {
    try {
      val pm = reactContext.packageManager
      val resolveInfoList = pm.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
      val matchingPackages = resolveInfoList.mapNotNull { it.activityInfo?.packageName }

      val targetPackages = MealShareSupport.collectTargetPackages(matchingPackages)

      for (packageName in targetPackages) {
        try {
          reactContext.grantUriPermission(packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (e: Exception) {
          Log.w(TAG, "Failed to grant URI permission to package: $packageName", e)
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "Error while querying or granting URI permissions", e)
    }
  }
}
