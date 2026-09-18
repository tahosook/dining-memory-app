package com.tahosook.diningmemory

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MealShareSupportTest {

  @Test
  fun `correctly identifies content URIs`() {
    assertTrue(MealShareSupport.isContentUri("content://media/external/images/media/123"))
    assertTrue(MealShareSupport.isContentUri("CONTENT://custom.provider/file"))
    assertFalse(MealShareSupport.isContentUri("file:///data/user/0/app/file.jpg"))
    assertFalse(MealShareSupport.isContentUri("/data/user/0/app/file.jpg"))
    assertFalse(MealShareSupport.isContentUri(""))
    assertFalse(MealShareSupport.isContentUri(null))
  }

  @Test
  fun `resolves local file paths from file URIs and bare paths`() {
    assertEquals(
      "/data/user/0/com.app/files/meal.jpg",
      MealShareSupport.resolveLocalFilePath("file:///data/user/0/com.app/files/meal.jpg"),
    )
    assertEquals(
      "/data/user/0/com.app/files/meal.jpg",
      MealShareSupport.resolveLocalFilePath("/data/user/0/com.app/files/meal.jpg"),
    )
    assertNull(MealShareSupport.resolveLocalFilePath("content://media/external/images/123"))
    assertNull(MealShareSupport.resolveLocalFilePath("https://example.com/image.jpg"))
    assertNull(MealShareSupport.resolveLocalFilePath(""))
    assertNull(MealShareSupport.resolveLocalFilePath(null))
  }

  @Test
  fun `collects and deduplicates target packages with fallback`() {
    val collected = MealShareSupport.collectTargetPackages(
      listOf("com.google.android.apps.photos", "com.twitter.android", "com.example.other"),
      listOf("com.twitter.android"),
    )

    assertEquals(
      setOf("com.google.android.apps.photos", "com.twitter.android", "com.example.other"),
      collected,
    )
  }

  @Test
  fun `includes fallback package when matching packages do not contain it`() {
    val collected = MealShareSupport.collectTargetPackages(
      listOf("com.google.android.apps.photos"),
      listOf(MealShareSupport.TWITTER_PACKAGE_NAME),
    )

    assertEquals(
      setOf("com.google.android.apps.photos", "com.twitter.android"),
      collected,
    )
  }
}
