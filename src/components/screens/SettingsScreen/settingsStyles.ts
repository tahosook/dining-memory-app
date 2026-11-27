import { StyleSheet } from 'react-native';
import { Colors } from '../../../constants/Colors';

export const settingsStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text,
  },
  metaText: {
    fontSize: 14,
    color: Colors.gray,
  },
  disabledLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  runtimeStatusCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d7d7d7',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  runtimeStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  runtimeStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  runtimeStatusBadgeReady: {
    backgroundColor: '#dff4e4',
  },
  runtimeStatusBadgeLoading: {
    backgroundColor: '#e5effd',
  },
  runtimeStatusBadgeUnavailable: {
    backgroundColor: '#fde5e5',
  },
  runtimeStatusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  runtimeStatusReason: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text,
  },
  runtimeStatusMode: {
    fontSize: 13,
    color: Colors.gray,
  },
  downloadProgressCard: {
    backgroundColor: '#f5f8ff',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  downloadProgressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#dbe5f5',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d7d7d7',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  dangerOutlineButton: {
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerOutlineButtonText: {
    color: Colors.error,
    fontWeight: '700',
    fontSize: 15,
  },
});
