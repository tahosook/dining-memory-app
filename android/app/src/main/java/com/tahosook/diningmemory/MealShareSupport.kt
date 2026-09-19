package com.tahosook.diningmemory

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

object MealShareSupport {
  fun isContentUri(uriString: String?): Boolean {
    if (uriString.isNullOrBlank()) {
      return false
    }
    return uriString.trim().startsWith("content://", ignoreCase = true)
  }

  private fun decodeUriPath(rawPath: String): String {
    return try {
      // In URI paths, '+' represents a literal '+' character rather than a space (unlike application/x-www-form-urlencoded).
      // Protect '+' by converting it to '%2B' before URLDecoder to prevent it from turning into a space.
      val protectedPath = rawPath.replace("+", "%2B")
      URLDecoder.decode(protectedPath, StandardCharsets.UTF_8.name())
    } catch (_: Exception) {
      rawPath
    }
  }

  fun resolveLocalFilePath(uriString: String?): String? {
    if (uriString.isNullOrBlank()) {
      return null
    }

    val trimmed = uriString.trim()
    if (isContentUri(trimmed)) {
      return null
    }

    // Bare absolute path: return as-is without alteration
    if (trimmed.startsWith("/")) {
      return trimmed
    }

    // Try standard Java URI parsing first (works identically across JVM Unit Tests and Android runtime)
    try {
      val uri = URI(trimmed)
      val scheme = uri.scheme
      if (scheme != null) {
        if (scheme.equals("file", ignoreCase = true)) {
          val path = uri.path
          if (!path.isNullOrEmpty()) {
            return path
          }
          val ssp = uri.schemeSpecificPart
          if (!ssp.isNullOrEmpty()) {
            val normalizedSsp = if (ssp.startsWith("/")) ssp else "/$ssp"
            return decodeUriPath(normalizedSsp)
          }
        } else {
          // Other schemes (http, https, content, etc.) are not local file paths
          return null
        }
      }
    } catch (_: Exception) {
      // Fall through to resilient manual parsing if URI syntax is non-conformant (e.g. unencoded spaces)
    }

    // Resilient fallback for file:// or file:/ URIs that failed strict URI syntax validation
    return if (trimmed.startsWith("file://", ignoreCase = true)) {
      val rawPath = trimmed.substring(7).let { if (it.startsWith("/")) it else "/$it" }
      decodeUriPath(rawPath)
    } else if (trimmed.startsWith("file:/", ignoreCase = true)) {
      val rawPath = trimmed.substring(5).let { if (it.startsWith("/")) it else "/$it" }
      decodeUriPath(rawPath)
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
