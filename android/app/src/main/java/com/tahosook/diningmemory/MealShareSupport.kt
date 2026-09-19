package com.tahosook.diningmemory

import java.net.URLDecoder

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

    return if (trimmed.startsWith("file://", ignoreCase = true)) {
      val rawPath = trimmed.substring(7).let { if (it.startsWith("/")) it else "/$it" }
      try {
        URLDecoder.decode(rawPath, "UTF-8")
      } catch (_: Exception) {
        rawPath
      }
    } else if (trimmed.startsWith("/")) {
      trimmed
    } else {
      null
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
