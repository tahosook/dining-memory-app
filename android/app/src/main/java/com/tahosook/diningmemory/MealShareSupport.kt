package com.tahosook.diningmemory

import android.net.Uri

object MealShareSupport {
  fun isContentUri(uriString: String?): Boolean {
    if (uriString.isNullOrBlank()) {
      return false
    }
    return uriString.trim().startsWith("content://", ignoreCase = true)
  }

  fun resolveLocalFilePath(uriString: String?): String? {
    if (uriString.isNullOrBlank()) {
      return null
    }

    val trimmed = uriString.trim()
    if (isContentUri(trimmed)) {
      return null
    }

    return try {
      val uri = Uri.parse(trimmed)
      if ("file".equals(uri.scheme, ignoreCase = true)) {
        uri.path ?: trimmed.removePrefix("file://")
      } else if (uri.scheme == null || uri.scheme.isNullOrEmpty()) {
        trimmed
      } else {
        null
      }
    } catch (_: Exception) {
      trimmed.removePrefix("file://")
    }
  }

  fun collectTargetPackages(matchingPackages: Collection<String>?): Set<String> {
    if (matchingPackages == null) {
      return emptySet()
    }

    val result = mutableSetOf<String>()
    matchingPackages.forEach { pkg ->
      val trimmed = pkg.trim()
      if (trimmed.isNotEmpty()) {
        result.add(trimmed)
      }
    }
    return result
  }
}
