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
    assertFalse(MealShareSupport.isContentUri("   "))
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
    assertNull(MealShareSupport.resolveLocalFilePath("   "))
    assertNull(MealShareSupport.resolveLocalFilePath(null))
  }

  @Test
  fun `collects and deduplicates target packages strictly from matching packages`() {
    val collected = MealShareSupport.collectTargetPackages(
      listOf(
        "com.google.android.apps.photos",
        "com.twitter.android",
        "com.twitter.android",
        "  com.example.other  ",
        "",
        "   ",
      ),
    )

    assertEquals(
      setOf("com.google.android.apps.photos", "com.twitter.android", "com.example.other"),
      collected,
    )
  }

  @Test
  fun `returns empty set when matching packages is empty or null`() {
    assertTrue(MealShareSupport.collectTargetPackages(null).isEmpty())
    assertTrue(MealShareSupport.collectTargetPackages(emptyList()).isEmpty())
    assertTrue(MealShareSupport.collectTargetPackages(listOf("  ", "")).isEmpty())
  }
}
