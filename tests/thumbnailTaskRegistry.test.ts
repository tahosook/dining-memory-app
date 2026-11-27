import {
  clearInFlightThumbnailRegistry,
  getInFlightThumbnailPhotoPaths,
  registerInFlightThumbnailGeneration,
  unregisterInFlightThumbnailGeneration,
} from '../src/media/thumbnailTaskRegistry';

describe('thumbnailTaskRegistry', () => {
  beforeEach(() => {
    clearInFlightThumbnailRegistry();
  });

  test('tracks registered photo paths by generation key and clears on unregister', () => {
    registerInFlightThumbnailGeneration('meal-1:file:///meal-1.jpg', 'file:///meal-1.jpg');
    registerInFlightThumbnailGeneration('meal-2:file:///meal-2.jpg', 'file:///meal-2.jpg');

    expect(Array.from(getInFlightThumbnailPhotoPaths())).toEqual([
      'file:///meal-1.jpg',
      'file:///meal-2.jpg',
    ]);

    unregisterInFlightThumbnailGeneration('meal-1:file:///meal-1.jpg');
    expect(Array.from(getInFlightThumbnailPhotoPaths())).toEqual(['file:///meal-2.jpg']);

    clearInFlightThumbnailRegistry();
    expect(getInFlightThumbnailPhotoPaths().size).toBe(0);
  });

  test('ignores empty photo paths and keeps distinct generations sharing a path protected until all finish', () => {
    registerInFlightThumbnailGeneration('meal-1:', '');
    expect(getInFlightThumbnailPhotoPaths().size).toBe(0);

    registerInFlightThumbnailGeneration('meal-1:file:///shared.jpg', 'file:///shared.jpg');
    registerInFlightThumbnailGeneration('meal-2:file:///shared.jpg', 'file:///shared.jpg');

    expect(getInFlightThumbnailPhotoPaths().has('file:///shared.jpg')).toBe(true);

    unregisterInFlightThumbnailGeneration('meal-1:file:///shared.jpg');
    expect(getInFlightThumbnailPhotoPaths().has('file:///shared.jpg')).toBe(true);

    unregisterInFlightThumbnailGeneration('meal-2:file:///shared.jpg');
    expect(getInFlightThumbnailPhotoPaths().has('file:///shared.jpg')).toBe(false);
  });
});
