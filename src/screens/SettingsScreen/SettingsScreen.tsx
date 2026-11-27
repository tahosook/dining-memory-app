import React, { useCallback } from 'react';
import { ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AiInputAssistSection } from '../../components/screens/SettingsScreen/AiInputAssistSection';
import { AppInfoSection } from '../../components/screens/SettingsScreen/AppInfoSection';
import { DataManagementSection } from '../../components/screens/SettingsScreen/DataManagementSection';
import { MediaPipeDevSection } from '../../components/screens/SettingsScreen/MediaPipeDevSection';
import { PrivacySection } from '../../components/screens/SettingsScreen/PrivacySection';
import { settingsStyles } from '../../components/screens/SettingsScreen/settingsStyles';
import {
  useSettingsAiInputAssist,
  useSettingsDataManagement,
  useSettingsMediaPipeDev,
  useSettingsOtaUpdate,
} from '../../hooks/settings';

export default function SettingsScreen() {
  const aiAssist = useSettingsAiInputAssist();
  const mediaPipeDev = useSettingsMediaPipeDev({
    onRuntimeStatusRefresh: aiAssist.loadLocalAiRuntimeStatus,
  });
  const dataManagement = useSettingsDataManagement();
  const otaUpdate = useSettingsOtaUpdate();

  const {
    loadAiInputAssistSetting,
    reloadLocalAiSection,
    handleDeleteAllModels: deleteAllAiModels,
  } = aiAssist;
  const { loadMediaPipeModelStatus } = mediaPipeDev;

  useFocusEffect(
    useCallback(() => {
      loadAiInputAssistSetting().catch(() => undefined);
      reloadLocalAiSection().catch(() => undefined);
      loadMediaPipeModelStatus().catch(() => undefined);
    }, [loadAiInputAssistSetting, reloadLocalAiSection, loadMediaPipeModelStatus])
  );

  const handleDeleteAllModels = useCallback(
    () => deleteAllAiModels(loadMediaPipeModelStatus),
    [deleteAllAiModels, loadMediaPipeModelStatus]
  );

  return (
    <ScrollView style={settingsStyles.container} contentContainerStyle={settingsStyles.content}>
      <PrivacySection />

      <AiInputAssistSection
        aiAssistState={aiAssist.aiAssistState}
        aiInputAssistEnabled={aiAssist.aiInputAssistEnabled}
        aiAssistSwitchDisabled={aiAssist.aiAssistSwitchDisabled}
        aiAssistDisabledReason={aiAssist.aiAssistDisabledReason}
        modelDownloadProgress={aiAssist.modelDownloadProgress}
        mealInputAssistModelStatus={aiAssist.mealInputAssistModelStatus}
        mealInputAssistModelStatusLoading={aiAssist.mealInputAssistModelStatusLoading}
        localAiRuntimeStatus={aiAssist.localAiRuntimeStatus}
        localAiRuntimeStatusLoading={aiAssist.localAiRuntimeStatusLoading}
        modelActionState={aiAssist.modelActionState}
        visibleModelStatus={aiAssist.visibleModelStatus}
        showDeleteAllModelsAction={aiAssist.showDeleteAllModelsAction}
        runtimeReady={aiAssist.runtimeReady}
        modelReady={aiAssist.modelReady}
        mediaPipeRuntimeReady={aiAssist.mediaPipeRuntimeReady}
        fallbackMediaPipeReady={aiAssist.fallbackMediaPipeReady}
        canSwitchMediaPipeModel={aiAssist.canSwitchMediaPipeModel}
        selectedMediaPipeModelId={aiAssist.selectedMediaPipeModelId}
        onToggleAiInputAssist={aiAssist.handleAiInputAssistToggle}
        onSelectMediaPipeModel={aiAssist.handleSelectMediaPipeModel}
        onModelDownload={aiAssist.handleModelDownload}
        onDeleteAllModels={handleDeleteAllModels}
      />

      {mediaPipeDev.showMediaPipeDevSection ? (
        <MediaPipeDevSection
          mediaPipeModelStatus={mediaPipeDev.mediaPipeModelStatus}
          mediaPipeModelStatusLoading={mediaPipeDev.mediaPipeModelStatusLoading}
          mediaPipeActionState={mediaPipeDev.mediaPipeActionState}
          mediaPipeDownloadProgress={mediaPipeDev.mediaPipeDownloadProgress}
          onDownload={mediaPipeDev.handleMediaPipeDownload}
          onDelete={mediaPipeDev.handleMediaPipeDelete}
        />
      ) : null}

      <DataManagementSection
        backupActionState={dataManagement.backupActionState}
        isBackupBusy={dataManagement.isBackupBusy}
        onExportBackup={dataManagement.handleExportBackup}
        onImportBackup={dataManagement.handleImportBackup}
        onDeleteAllData={dataManagement.handleDeleteAllData}
      />

      <AppInfoSection
        checkingUpdate={otaUpdate.checkingUpdate}
        onCheckUpdate={otaUpdate.handleCheckUpdate}
      />
    </ScrollView>
  );
}
