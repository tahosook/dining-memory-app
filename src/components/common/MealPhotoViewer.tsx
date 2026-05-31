import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';

export type MealPhotoViewerPhoto = {
  id: string;
  uri: string;
  title: string;
};

type MealPhotoViewerProps = {
  visible: boolean;
  photos: MealPhotoViewerPhoto[];
  initialIndex: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  testIDPrefix?: string;
};

type PhotoDirection = 'previous' | 'next';

const MAX_SCALE = 4;
const DISMISS_DISTANCE = 120;
const HORIZONTAL_SWIPE_DISTANCE = 80;
const HORIZONTAL_SWIPE_VELOCITY = 650;

function clampIndex(index: number, length: number) {
  if (length <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(index, length - 1));
}

function clampScale(value: number) {
  'worklet';

  return Math.max(1, Math.min(value, MAX_SCALE));
}

export function MealPhotoViewer({
  visible,
  photos,
  initialIndex,
  onClose,
  onIndexChange,
  testIDPrefix = 'meal-photo-viewer',
}: MealPhotoViewerProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(() => clampIndex(initialIndex, photos.length));
  const activePhoto = photos[activeIndex];
  const hasMultiplePhotos = photos.length > 1;
  const positionText = hasMultiplePhotos ? `${activeIndex + 1} / ${photos.length}` : null;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const dismissY = useSharedValue(0);

  const resetTransform = useCallback(() => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    dismissY.value = withSpring(0);
  }, [
    dismissY,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
  ]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setActiveIndex(clampIndex(initialIndex, photos.length));
    resetTransform();
  }, [initialIndex, photos.length, resetTransform, visible]);

  const changePhoto = useCallback(
    (direction: PhotoDirection) => {
      const nextIndex = direction === 'next'
        ? Math.min(activeIndex + 1, photos.length - 1)
        : Math.max(activeIndex - 1, 0);

      if (nextIndex === activeIndex) {
        resetTransform();
        return;
      }

      setActiveIndex(nextIndex);
      resetTransform();
      onIndexChange?.(nextIndex);
    },
    [activeIndex, onIndexChange, photos.length, resetTransform]
  );

  const closeViewer = useCallback(() => {
    resetTransform();
    onClose();
  }, [onClose, resetTransform]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          savedScale.value = scale.value;
        })
        .onUpdate(event => {
          scale.value = clampScale(savedScale.value * event.scale);
        })
        .onEnd(() => {
          if (scale.value <= 1.02) {
            scale.value = withSpring(1);
            savedScale.value = 1;
            translateX.value = withSpring(0);
            translateY.value = withSpring(0);
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
            return;
          }

          savedScale.value = scale.value;
        }),
    [
      savedScale,
      savedTranslateX,
      savedTranslateY,
      scale,
      translateX,
      translateY,
    ]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
        })
        .onUpdate(event => {
          if (scale.value > 1.01) {
            translateX.value = savedTranslateX.value + event.translationX;
            translateY.value = savedTranslateY.value + event.translationY;
            return;
          }

          if (event.translationY > 0 && Math.abs(event.translationY) > Math.abs(event.translationX)) {
            dismissY.value = event.translationY;
          }
        })
        .onEnd(event => {
          if (scale.value > 1.01) {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            return;
          }

          const horizontalSwipe =
            Math.abs(event.translationX) > Math.abs(event.translationY) &&
            (Math.abs(event.translationX) > HORIZONTAL_SWIPE_DISTANCE ||
              Math.abs(event.velocityX) > HORIZONTAL_SWIPE_VELOCITY);

          if (horizontalSwipe && hasMultiplePhotos) {
            const direction = event.translationX < 0 ? 'next' : 'previous';
            runOnJS(changePhoto)(direction);
            return;
          }

          const shouldDismiss =
            event.translationY > DISMISS_DISTANCE &&
            Math.abs(event.translationY) > Math.abs(event.translationX);

          if (shouldDismiss) {
            runOnJS(closeViewer)();
            return;
          }

          dismissY.value = withSpring(0);
        }),
    [
      changePhoto,
      closeViewer,
      dismissY,
      hasMultiplePhotos,
      savedTranslateX,
      savedTranslateY,
      scale,
      translateX,
      translateY,
    ]
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [panGesture, pinchGesture]
  );

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value + dismissY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      animationType="fade"
      onRequestClose={closeViewer}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      testID={`${testIDPrefix}-modal`}
      transparent
      visible={visible}
    >
      <StatusBar style="light" />
      <SafeAreaView style={styles.container} testID={`${testIDPrefix}-container`}>
        <View style={styles.topBar}>
          <View style={styles.titleBlock}>
            {activePhoto ? (
              <Text style={styles.title} numberOfLines={1}>
                {activePhoto.title}
              </Text>
            ) : null}
            {positionText ? (
              <Text style={styles.position} testID={`${testIDPrefix}-position`}>
                {positionText}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            accessibilityLabel="写真ビューアを閉じる"
            onPress={closeViewer}
            style={styles.closeButton}
            testID={`${testIDPrefix}-close-button`}
          >
            <Ionicons name="close" size={28} color={Colors.white} />
          </TouchableOpacity>
        </View>

        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.imageStage, imageAnimatedStyle]}>
            {activePhoto ? (
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: activePhoto.uri }}
                style={[styles.image, { maxWidth: windowWidth }]}
                resizeMode="contain"
                testID={`${testIDPrefix}-image`}
              />
            ) : null}
          </Animated.View>
        </GestureDetector>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  topBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  position: {
    marginTop: 3,
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 13,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  imageStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
