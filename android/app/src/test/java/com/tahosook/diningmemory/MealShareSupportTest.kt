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
  fun `resolves file URIs preserving plus signs and decoding percent-encodings and unicode`() {
    // Normal file URIs
    assertEquals(
      "/data/meal/photo.jpg",
      MealShareSupport.resolveLocalFilePath("file:///data/meal/photo.jpg"),
    )
    // Percent-encoded space
    assertEquals(
      "/data/meal/my photo.jpg",
      MealShareSupport.resolveLocalFilePath("file:///data/meal/my%20photo.jpg"),
    )
    // Percent-encoded plus sign
    assertEquals(
      "/data/meal/a+b.jpg",
      MealShareSupport.resolveLocalFilePath("file:///data/meal/a%2Bb.jpg"),
    )
    // Literal plus sign in URI path (must NOT become space)
    assertEquals(
      "/data/meal/a+b.jpg",
      MealShareSupport.resolveLocalFilePath("file:///data/meal/a+b.jpg"),
    )
    // Unicode / Japanese path in file URI
    assertEquals(
      "/data/meal/ラーメン.jpg",
      MealShareSupport.resolveLocalFilePath("file:///data/meal/ラーメン.jpg"),
    )
    // Percent-encoded Unicode / Japanese path
    assertEquals(
      "/data/meal/ラーメン.jpg",
      MealShareSupport.resolveLocalFilePath("file:///data/meal/%E3%83%A9%E3%83%BC%E3%83%A1%E3%83%B3.jpg"),
    )
    // Unencoded spaces in file URI
    assertEquals(
      "/data/meal/a b.jpg",
      MealShareSupport.resolveLocalFilePath("file:///data/meal/a b.jpg"),
    )
    // file:/ with single slash
    assertEquals(
      "/data/meal/photo.jpg",
      MealShareSupport.resolveLocalFilePath("file:/data/meal/photo.jpg"),
    )
  }

  @Test
  fun `resolves bare paths directly without alteration`() {
    assertEquals(
      "/data/meal/photo.jpg",
      MealShareSupport.resolveLocalFilePath("/data/meal/photo.jpg"),
    )
    assertEquals(
      "/data/meal/my photo.jpg",
      MealShareSupport.resolveLocalFilePath("/data/meal/my photo.jpg"),
    )
    assertEquals(
      "/data/meal/a+b.jpg",
      MealShareSupport.resolveLocalFilePath("/data/meal/a+b.jpg"),
    )
    assertEquals(
      "/data/meal/ラーメン.jpg",
      MealShareSupport.resolveLocalFilePath("/data/meal/ラーメン.jpg"),
    )
  }

  @Test
  fun `rejects non-file URIs, relative paths, and empty or blank inputs`() {
    assertNull(MealShareSupport.resolveLocalFilePath("content://media/external/images/123"))
    assertNull(MealShareSupport.resolveLocalFilePath("CONTENT://custom.provider/file"))
    assertNull(MealShareSupport.resolveLocalFilePath("https://example.com/image.jpg"))
    assertNull(MealShareSupport.resolveLocalFilePath("http://example.com/photo.png"))
    assertNull(MealShareSupport.resolveLocalFilePath("unknown://some/path"))
    assertNull(MealShareSupport.resolveLocalFilePath("relative/path/to/meal.jpg"))
    assertNull(MealShareSupport.resolveLocalFilePath("photo.jpg"))
    assertNull(MealShareSupport.resolveLocalFilePath(null))
    assertNull(MealShareSupport.resolveLocalFilePath(""))
    assertNull(MealShareSupport.resolveLocalFilePath("   "))
  }

  @Test
  fun `handles malformed file URIs gracefully without crashing`() {
    assertEquals(
      "/malformed uri with [brackets]",
      MealShareSupport.resolveLocalFilePath("file://malformed uri with [brackets]"),
    )
    assertEquals(
      "/data/meal/bad%2",
      MealShareSupport.resolveLocalFilePath("file:///data/meal/bad%2"),
    )
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
