# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated & worklets & fabric
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.fabric.** { *; }

# llama.rn (JNI & fbjni bindings)
-keep class com.rnllama.** { *; }
-keep class com.facebook.jni.** { *; }

# MediaPipe Tasks Vision & Protocol Buffers (JNI reflection)
-keep class com.google.mediapipe.** { *; }
-keep class * implements com.google.mediapipe.** { *; }
-keep class com.google.protobuf.** { *; }
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite { *; }

# Dining Memory custom native modules
-keep class com.tahosook.diningmemory.** { *; }
