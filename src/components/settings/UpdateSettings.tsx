/**
 * Update Settings Component
 * Displays update status and allows manual update checking/installation
 */
import { useEffect, useCallback } from 'react';
import { Download, RefreshCw, Loader2, Rocket, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useUpdateStore } from '@/stores/update';
import { useTranslation } from 'react-i18next';

const COMPACT_BTN = 'h-8 border-border/60 bg-card/40 px-3 text-xs';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function UpdateSettings() {
  const { t } = useTranslation('settings');
  const {
    status,
    currentVersion,
    updateInfo,
    progress,
    error,
    isInitialized,
    autoInstallCountdown,
    init,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    cancelAutoInstall,
    clearError,
  } = useUpdateStore();

  useEffect(() => {
    init();
  }, [init]);

  const handleCheckForUpdates = useCallback(async () => {
    clearError();
    await checkForUpdates();
  }, [checkForUpdates, clearError]);

  const renderStatusIcon = () => {
    switch (status) {
      case 'checking':
      case 'downloading':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'available':
        return <Download className="h-4 w-4 text-primary" />;
      case 'downloaded':
        return <Rocket className="h-4 w-4 text-primary" />;
      case 'error':
        return <RefreshCw className="h-4 w-4 text-destructive" />;
      default:
        return <RefreshCw className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const renderStatusText = () => {
    if (status === 'downloaded' && autoInstallCountdown != null && autoInstallCountdown >= 0) {
      return t('updates.status.autoInstalling', { seconds: autoInstallCountdown });
    }
    switch (status) {
      case 'checking':
        return t('updates.status.checking');
      case 'downloading':
        return t('updates.status.downloading');
      case 'available':
        return t('updates.status.available', { version: updateInfo?.version });
      case 'downloaded':
        return t('updates.status.downloaded', { version: updateInfo?.version });
      case 'error':
        return error || t('updates.status.failed');
      case 'not-available':
        return t('updates.status.latest');
      default:
        return t('updates.status.check');
    }
  };

  const renderAction = () => {
    switch (status) {
      case 'checking':
        return (
          <Button disabled variant="outline" size="sm" className={COMPACT_BTN}>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            {t('updates.action.checking')}
          </Button>
        );
      case 'downloading':
        return (
          <Button disabled variant="outline" size="sm" className={COMPACT_BTN}>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            {t('updates.action.downloading')}
          </Button>
        );
      case 'available':
        return (
          <Button onClick={downloadUpdate} size="sm" className="h-8 border border-transparent px-3 text-xs">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t('updates.action.download')}
          </Button>
        );
      case 'downloaded':
        if (autoInstallCountdown != null && autoInstallCountdown >= 0) {
          return (
            <Button onClick={cancelAutoInstall} size="sm" variant="outline" className={COMPACT_BTN}>
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              {t('updates.action.cancelAutoInstall')}
            </Button>
          );
        }
        return (
          <Button onClick={installUpdate} size="sm" className="h-8 border border-transparent px-3 text-xs">
            <Rocket className="mr-1.5 h-3.5 w-3.5" />
            {t('updates.action.install')}
          </Button>
        );
      case 'error':
        return (
          <Button onClick={handleCheckForUpdates} variant="outline" size="sm" className={COMPACT_BTN}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {t('updates.action.retry')}
          </Button>
        );
      default:
        return (
          <Button onClick={handleCheckForUpdates} variant="outline" size="sm" className={COMPACT_BTN}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {t('updates.action.check')}
          </Button>
        );
    }
  };

  if (!isInitialized) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card/50 to-card/30 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-card/20 px-3 py-2.5">
        <div>
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{t('updates.currentVersion')}</p>
          <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground">v{currentVersion}</p>
        </div>
        {renderStatusIcon()}
      </div>

      <div className="space-y-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-muted-foreground">{renderStatusText()}</p>
        {renderAction()}
      </div>

      {status === 'downloading' && progress && (
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <div className="flex justify-between text-2xs text-muted-foreground">
            <span>{formatBytes(progress.transferred)} / {formatBytes(progress.total)}</span>
            <span>{formatBytes(progress.bytesPerSecond)}/s</span>
          </div>
          <Progress value={progress.percent} className="h-1.5" />
          <p className="text-center text-2xs text-muted-foreground">
            {Math.round(progress.percent)}% complete
          </p>
        </div>
      )}

      {updateInfo && (status === 'available' || status === 'downloaded') && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">Version {updateInfo.version}</p>
            {updateInfo.releaseDate && (
              <p className="text-2xs text-muted-foreground">
                {new Date(updateInfo.releaseDate).toLocaleDateString()}
              </p>
            )}
          </div>
          {updateInfo.releaseNotes && (
            <div className="text-2xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">{t('updates.whatsNew')}</p>
              <p className="whitespace-pre-wrap">{updateInfo.releaseNotes}</p>
            </div>
          )}
        </div>
      )}

      {status === 'error' && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-2xs text-destructive">
          <p className="mb-1 font-medium">{t('updates.errorDetails')}</p>
          <p>{error}</p>
        </div>
      )}

      <p className="text-2xs text-muted-foreground">{t('updates.help')}</p>
      </div>
    </div>
  );
}

export default UpdateSettings;
