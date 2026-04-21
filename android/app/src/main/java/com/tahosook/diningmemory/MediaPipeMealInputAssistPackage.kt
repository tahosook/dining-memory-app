package com.tahosook.diningmemory

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

@Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
class MediaPipeMealInputAssistPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): MutableList<NativeModule> {
    return mutableListOf(MediaPipeMealInputAssistModule(reactContext))
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): MutableList<ViewManager<*, *>> {
    return mutableListOf()
  }
}
