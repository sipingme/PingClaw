import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  X,
  Loader2,
  QrCode,
  ExternalLink,
  BookOpen,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  CheckCircle,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useChannelsStore } from '@/stores/channels';

import { hostApiFetch } from '@/lib/host-api';
import { subscribeHostEvent } from '@/lib/host-events';
import { cn } from '@/lib/utils';
import { ACCENT_ICON_SM, SELECTABLE_ACTIVE_OUTLINE, STATUS_SUCCESS } from '@/lib/ui-patterns';
import {
  CHANNEL_ICONS,
  CHANNEL_NAMES,
  CHANNEL_META,
  getPrimaryChannels,
  type ChannelType,
  type ChannelMeta,
  type ChannelConfigField,
} from '@/types/channel';
import {
  buildQrChannelEventName,
  isCanonicalOpenClawAccountId,
  usesPluginManagedQrAccounts,
} from '@/lib/channel-alias';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import telegramIcon from '@/assets/channels/telegram.svg';
import discordIcon from '@/assets/channels/discord.svg';
import whatsappIcon from '@/assets/channels/whatsapp.svg';
import wechatIcon from '@/assets/channels/wechat.svg';
import dingtalkIcon from '@/assets/channels/dingtalk.svg';
import feishuIcon from '@/assets/channels/feishu.svg';
import wecomIcon from '@/assets/channels/wecom.svg';
import qqIcon from '@/assets/channels/qq.svg';

interface ChannelConfigModalProps {
  initialSelectedType?: ChannelType | null;
  configuredTypes?: string[];
  showChannelName?: boolean;
  allowExistingConfig?: boolean;
  allowEditAccountId?: boolean;
  existingAccountIds?: string[];
  initialConfigValues?: Record<string, string>;
  agentId?: string;
  accountId?: string;
  onClose: () => void;
  onChannelSaved?: (channelType: ChannelType) => void | Promise<void>;
}

const CHANNEL_DIALOG_LABEL = 'text-xs font-medium text-foreground/90';
const CHANNEL_DIALOG_INPUT =
  'h-9 rounded-lg border-border/60 bg-surface-input text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40';
const CHANNEL_DIALOG_SECTION = 'space-y-3 rounded-xl border border-border/60 bg-card/30 p-4';

function DialogSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={CHANNEL_DIALOG_SECTION}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {description && <p className="text-2xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function ChannelConfigModal({
  initialSelectedType = null,
  configuredTypes = [],
  showChannelName = true,
  allowExistingConfig = true,
  allowEditAccountId = false,
  existingAccountIds = [],
  initialConfigValues,
  agentId,
  accountId,
  onClose,
  onChannelSaved,
}: ChannelConfigModalProps) {
  const { t } = useTranslation('channels');
  const { fetchChannels } = useChannelsStore();
  const [selectedType, setSelectedType] = useState<ChannelType | null>(initialSelectedType);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [channelName, setChannelName] = useState('');
  const [accountIdInput, setAccountIdInput] = useState(accountId || '');
  const [accountIdError, setAccountIdError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [isExistingConfig, setIsExistingConfig] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);

  const meta: ChannelMeta | null = selectedType ? CHANNEL_META[selectedType] : null;
  const shouldUseCredentialValidation = selectedType !== 'feishu';
  const usesManagedQrAccounts = usesPluginManagedQrAccounts(selectedType);
  const showAccountIdEditor = allowEditAccountId && !usesManagedQrAccounts;
  const resolvedAccountId = usesManagedQrAccounts
    ? (accountId ?? undefined)
    : showAccountIdEditor
      ? accountIdInput.trim()
      : (accountId ?? (agentId ? (agentId === 'main' ? 'default' : agentId) : undefined));
  const shouldLoadExistingConfig = Boolean(
    selectedType && allowExistingConfig && configuredTypes.includes(selectedType)
  );
  const accountIdForConfigLoad = shouldLoadExistingConfig ? resolvedAccountId : undefined;

  useEffect(() => {
    setSelectedType(initialSelectedType);
  }, [initialSelectedType]);

  useEffect(() => {
    setAccountIdInput(accountId || '');
    setAccountIdError(null);
  }, [accountId]);

  useEffect(() => {
    if (!selectedType) {
      setConfigValues({});
      setChannelName('');
      setIsExistingConfig(false);
      setValidationResult(null);
      setQrCode(null);
      setConnecting(false);
      setAccountIdError(null);
      return;
    }

    if (!shouldLoadExistingConfig) {
      setConfigValues({});
      setIsExistingConfig(false);
      setLoadingConfig(false);
      setChannelName(showChannelName ? CHANNEL_NAMES[selectedType] : '');
      return;
    }

    if (initialConfigValues) {
      setConfigValues(initialConfigValues);
      setIsExistingConfig(Object.keys(initialConfigValues).length > 0);
      setLoadingConfig(false);
      setChannelName(showChannelName ? CHANNEL_NAMES[selectedType] : '');
      return;
    }

    let cancelled = false;
    setLoadingConfig(true);
    setChannelName(showChannelName ? CHANNEL_NAMES[selectedType] : '');

    (async () => {
      try {
        const accountParam = accountIdForConfigLoad ? `?accountId=${encodeURIComponent(accountIdForConfigLoad)}` : '';
        const result = await hostApiFetch<{ success: boolean; values?: Record<string, string> }>(
          `/api/channels/config/${encodeURIComponent(selectedType)}${accountParam}`
        );
        if (cancelled) return;

        if (result.success && result.values && Object.keys(result.values).length > 0) {
          setConfigValues(result.values);
          setIsExistingConfig(true);
        } else {
          setConfigValues({});
          setIsExistingConfig(false);
        }
      } catch {
        if (!cancelled) {
          setConfigValues({});
          setIsExistingConfig(false);
        }
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountIdForConfigLoad, initialConfigValues, selectedType, shouldLoadExistingConfig, showChannelName]);

  useEffect(() => {
    if (selectedType && !loadingConfig && showChannelName && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [selectedType, loadingConfig, showChannelName]);

  const finishSave = useCallback(async (channelType: ChannelType) => {
    await fetchChannels();
    await onChannelSaved?.(channelType);
  }, [fetchChannels, onChannelSaved]);

  const finishSaveRef = useRef(finishSave);
  const onCloseRef = useRef(onClose);
  const translateRef = useRef(t);

  useEffect(() => {
    finishSaveRef.current = finishSave;
  }, [finishSave]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    translateRef.current = t;
  }, [t]);

  function normalizeQrImageSource(data: { qr?: string; raw?: string }): string | null {
    const qr = typeof data.qr === 'string' ? data.qr.trim() : '';
    if (qr) {
      if (qr.startsWith('data:image') || qr.startsWith('http://') || qr.startsWith('https://')) {
        return qr;
      }
      return `data:image/png;base64,${qr}`;
    }

    const raw = typeof data.raw === 'string' ? data.raw.trim() : '';
    if (!raw) return null;
    if (raw.startsWith('data:image') || raw.startsWith('http://') || raw.startsWith('https://')) {
      return raw;
    }
    return null;
  }

  useEffect(() => {
    if (!selectedType || meta?.connectionType !== 'qr') return;
    const channelType = selectedType;

    const onQr = (...args: unknown[]) => {
      const data = args[0] as { qr?: string; raw?: string };
      const nextQr = normalizeQrImageSource(data);
      if (!nextQr) return;
      setQrCode(nextQr);
      setConnecting(false);
    };

    const onSuccess = async (...args: unknown[]) => {
      const data = args[0] as { accountId?: string } | undefined;
      void data?.accountId;
      toast.success(translateRef.current('toast.qrConnected', { name: CHANNEL_NAMES[channelType] }));
      try {
        if (channelType === 'whatsapp') {
          const saveResult = await hostApiFetch<{ success?: boolean; error?: string }>('/api/channels/config', {
            method: 'POST',
            body: JSON.stringify({ channelType: 'whatsapp', config: { enabled: true }, accountId: resolvedAccountId }),
          });
          if (!saveResult?.success) {
            throw new Error(saveResult?.error || 'Failed to save WhatsApp config');
          }
        }

        try {
          await finishSaveRef.current(channelType);
        } catch (postSaveError) {
          toast.warning(translateRef.current('toast.savedButRefreshFailed'));
          console.warn('Channel saved but post-save refresh failed:', postSaveError);
        }
        onCloseRef.current();
      } catch (error) {
        toast.error(translateRef.current('toast.configFailed', { error: String(error) }));
        setConnecting(false);
      }
    };

    const onError = (...args: unknown[]) => {
      const err = typeof args[0] === 'string'
        ? args[0]
        : String((args[0] as { message?: string } | undefined)?.message || args[0]);
      toast.error(translateRef.current('toast.qrFailed', { name: CHANNEL_NAMES[channelType], error: err }));
      setQrCode(null);
      setConnecting(false);
    };

    const removeQrListener = subscribeHostEvent(buildQrChannelEventName(channelType, 'qr'), onQr);
    const removeSuccessListener = subscribeHostEvent(buildQrChannelEventName(channelType, 'success'), onSuccess);
    const removeErrorListener = subscribeHostEvent(buildQrChannelEventName(channelType, 'error'), onError);

    return () => {
      removeQrListener();
      removeSuccessListener();
      removeErrorListener();
      hostApiFetch(`/api/channels/${encodeURIComponent(channelType)}/cancel`, {
        method: 'POST',
        body: JSON.stringify(resolvedAccountId ? { accountId: resolvedAccountId } : {}),
      }).catch(() => { });
    };
  }, [meta?.connectionType, resolvedAccountId, selectedType]);

  const handleValidate = async () => {
    if (!selectedType || !shouldUseCredentialValidation) return;

    setValidating(true);
    setValidationResult(null);

    try {
      const result = await hostApiFetch<{
        success: boolean;
        valid?: boolean;
        errors?: string[];
        warnings?: string[];
        details?: Record<string, string>;
      }>('/api/channels/credentials/validate', {
        method: 'POST',
        body: JSON.stringify({ channelType: selectedType, config: configValues }),
      });

      const warnings = result.warnings || [];
      if (result.valid && result.details) {
        const details = result.details;
        if (details.botUsername) warnings.push(`Bot: @${details.botUsername}`);
        if (details.guildName) warnings.push(`Server: ${details.guildName}`);
        if (details.channelName) warnings.push(`Channel: #${details.channelName}`);
      }

      setValidationResult({
        valid: result.valid || false,
        errors: result.errors || [],
        warnings,
      });
    } catch (error) {
      setValidationResult({
        valid: false,
        errors: [String(error)],
        warnings: [],
      });
    } finally {
      setValidating(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedType || !meta) return;

    setConnecting(true);
    setValidationResult(null);

    try {
      if (showAccountIdEditor) {
        const nextAccountId = accountIdInput.trim();
        if (!nextAccountId) {
          const message = t('account.invalidId');
          setAccountIdError(message);
          toast.error(message);
          setConnecting(false);
          return;
        }
        if (!isCanonicalOpenClawAccountId(nextAccountId)) {
          const message = t('account.invalidCanonicalId');
          setAccountIdError(message);
          toast.error(message);
          setConnecting(false);
          return;
        }
        const duplicateExists = existingAccountIds.some((id) => id === nextAccountId && id !== (accountId || '').trim());
        if (duplicateExists) {
          const message = t('account.accountIdExists', { accountId: nextAccountId });
          setAccountIdError(message);
          toast.error(message);
          setConnecting(false);
          return;
        }
        setAccountIdError(null);
      }

      if (meta.connectionType === 'qr') {
        await hostApiFetch(`/api/channels/${encodeURIComponent(selectedType)}/start`, {
          method: 'POST',
          body: JSON.stringify(resolvedAccountId ? { accountId: resolvedAccountId } : {}),
        });
        return;
      }

      if (meta.connectionType === 'token' && shouldUseCredentialValidation) {
        const validationResponse = await hostApiFetch<{
          success: boolean;
          valid?: boolean;
          errors?: string[];
          warnings?: string[];
          details?: Record<string, string>;
        }>('/api/channels/credentials/validate', {
          method: 'POST',
          body: JSON.stringify({ channelType: selectedType, config: configValues }),
        });

        if (!validationResponse.valid) {
          setValidationResult({
            valid: false,
            errors: validationResponse.errors || ['Validation failed'],
            warnings: validationResponse.warnings || [],
          });
          setConnecting(false);
          return;
        }

        const warnings = validationResponse.warnings || [];
        if (validationResponse.details) {
          const details = validationResponse.details;
          if (details.botUsername) warnings.push(`Bot: @${details.botUsername}`);
          if (details.guildName) warnings.push(`Server: ${details.guildName}`);
          if (details.channelName) warnings.push(`Channel: #${details.channelName}`);
        }

        setValidationResult({
          valid: true,
          errors: [],
          warnings,
        });
      }

      const config: Record<string, unknown> = { ...configValues };
      const saveResult = await hostApiFetch<{
        success?: boolean;
        error?: string;
        warning?: string;
      }>('/api/channels/config', {
        method: 'POST',
        body: JSON.stringify({ channelType: selectedType, config, accountId: resolvedAccountId }),
      });
      if (!saveResult?.success) {
        throw new Error(saveResult?.error || 'Failed to save channel config');
      }
      if (typeof saveResult.warning === 'string' && saveResult.warning) {
        toast.warning(saveResult.warning);
      }

      try {
        await finishSave(selectedType);
      } catch (postSaveError) {
        toast.warning(t('toast.savedButRefreshFailed'));
        console.warn('Channel saved but post-save refresh failed:', postSaveError);
      }

      toast.success(t('toast.channelSaved', { name: meta.name }));
      toast.success(t('toast.channelConnecting', { name: meta.name }));
      await new Promise((resolve) => setTimeout(resolve, 800));
      onClose();
    } catch (error) {
      toast.error(t('toast.configFailed', { error: String(error) }));
      setConnecting(false);
    }
  };

  const openDocs = () => {
    if (!meta?.docsUrl) return;
    const url = t(meta.docsUrl);
    try {
      if (window.electron?.openExternal) {
        window.electron.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      window.open(url, '_blank');
    }
  };

  const isFormValid = () => {
    if (!meta) return false;
    return meta.configFields
      .filter((field) => field.required)
      .every((field) => configValues[field.key]?.trim());
  };

  const updateConfigValue = (key: string, value: string) => {
    setConfigValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSecretVisibility = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const dialogTitle = selectedType
    ? isExistingConfig
      ? t('dialog.updateTitle', { name: CHANNEL_NAMES[selectedType] })
      : t('dialog.configureTitle', { name: CHANNEL_NAMES[selectedType] })
    : t('dialog.addTitle');
  const dialogDescription = selectedType && isExistingConfig
    ? t('dialog.existingDesc')
    : meta
      ? t(meta.description.replace('channels:', ''))
      : t('dialog.selectDesc');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-xl backdrop-blur-sm"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className={ACCENT_ICON_SM}>
              {selectedType ? (
                <ChannelLogo type={selectedType} />
              ) : (
                <BookOpen className="h-4 w-4" strokeWidth={2} />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">{dialogTitle}</h2>
              <p className="mt-0.5 text-2xs text-muted-foreground">{dialogDescription}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!selectedType ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {getPrimaryChannels().map((type) => {
                const channelMeta = CHANNEL_META[type];
                const isConfigured = configuredTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={cn(
                      'group flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                      isConfigured
                        ? 'border-primary/30 bg-primary/5 hover:border-primary/40 hover:bg-primary/10'
                        : 'border-border/60 bg-card/50 hover:border-primary/30 hover:bg-card/70',
                    )}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/30">
                      <ChannelLogo type={type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{channelMeta.name}</p>
                        {channelMeta.isPlugin && (
                          <Badge variant="secondary" className="h-5 shrink-0 border-0 bg-muted/50 px-1.5 py-0 text-2xs font-medium shadow-none">
                            {t('pluginBadge')}
                          </Badge>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {t(channelMeta.description.replace('channels:', ''))}
                      </p>
                      <p className="mt-1 text-2xs text-muted-foreground">
                        {channelMeta.connectionType === 'qr' ? t('dialog.qrCode') : t('dialog.token')}
                        {isConfigured ? ` · ${t('configuredBadge')}` : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : qrCode ? (
            <div className="space-y-4 text-center">
              <div className="inline-block rounded-xl border border-border/60 bg-background/40 p-3">
                {qrCode.startsWith('data:image') || qrCode.startsWith('http://') || qrCode.startsWith('https://') ? (
                  <img src={qrCode} alt="Scan QR Code" className="h-56 w-56 rounded-lg object-contain" />
                ) : (
                  <div className="flex h-56 w-56 items-center justify-center rounded-lg bg-background">
                    <QrCode className="h-24 w-24 text-muted-foreground" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('dialog.scanQR', { name: meta?.name })}
              </p>
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-border/60 bg-card/40 px-3 text-xs"
                  onClick={() => {
                    setQrCode(null);
                    void handleConnect();
                  }}
                >
                  {t('dialog.refreshCode')}
                </Button>
              </div>
            </div>
          ) : loadingConfig ? (
            <div className="flex items-center justify-center rounded-xl border border-border/60 bg-card/30 py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">{t('dialog.loadingConfig')}</span>
            </div>
          ) : (
            <div className="space-y-4">
              {isExistingConfig && (
                <div className={cn('flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs', SELECTABLE_ACTIVE_OUTLINE)}>
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>{t('dialog.existingHint')}</span>
                </div>
              )}

              <DialogSection
                title={t('dialog.howToConnect')}
                action={meta?.docsUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 border-border/60 bg-card/40 px-2.5 text-2xs"
                    onClick={openDocs}
                  >
                    <BookOpen className="mr-1 h-3 w-3" />
                    {t('dialog.viewDocs')}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                ) : undefined}
              >
                <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                  {meta?.instructions.map((instruction, index) => (
                    <li key={index}>{t(instruction)}</li>
                  ))}
                </ol>
              </DialogSection>

              {(showChannelName || showAccountIdEditor || (meta?.configFields.length ?? 0) > 0) && (
                <DialogSection
                  title={t('dialog.credentialsSection', { defaultValue: '连接凭证' })}
                  description={t('dialog.credentialsSectionDesc', { defaultValue: '填写频道接入所需的密钥与标识' })}
                >
                  {showChannelName && (
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className={CHANNEL_DIALOG_LABEL}>{t('dialog.channelName')}</Label>
                      <Input
                        ref={firstInputRef}
                        id="name"
                        placeholder={t('dialog.channelNamePlaceholder', { name: meta?.name })}
                        value={channelName}
                        onChange={(event) => setChannelName(event.target.value)}
                        className={CHANNEL_DIALOG_INPUT}
                      />
                    </div>
                  )}

                  {showAccountIdEditor && (
                    <div className="space-y-1.5">
                      <Label htmlFor="account-id" className={CHANNEL_DIALOG_LABEL}>{t('account.customIdLabel')}</Label>
                      <Input
                        id="account-id"
                        value={accountIdInput}
                        onChange={(event) => {
                          setAccountIdInput(event.target.value);
                          if (accountIdError) {
                            setAccountIdError(null);
                          }
                        }}
                        placeholder={t('account.customIdPlaceholder')}
                        className={cn(CHANNEL_DIALOG_INPUT, accountIdError && 'border-destructive/50 focus-visible:ring-destructive/30')}
                      />
                      {accountIdError ? (
                        <p className="text-2xs text-destructive">{accountIdError}</p>
                      ) : (
                        <p className="text-2xs text-muted-foreground">{t('account.customIdHint')}</p>
                      )}
                    </div>
                  )}

                  {meta?.configFields.map((field) => (
                    <ConfigField
                      key={field.key}
                      field={field}
                      value={configValues[field.key] || ''}
                      onChange={(value) => updateConfigValue(field.key, value)}
                      showSecret={showSecrets[field.key] || false}
                      onToggleSecret={() => toggleSecretVisibility(field.key)}
                    />
                  ))}
                </DialogSection>
              )}

              {validationResult && (
                <div
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-xs',
                    validationResult.valid
                      ? STATUS_SUCCESS
                      : 'border-destructive/30 bg-destructive/10 text-destructive',
                  )}
                >
                  <div className="flex items-start gap-2">
                    {validationResult.valid ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <h4 className="font-medium">
                        {validationResult.valid ? t('dialog.credentialsVerified') : t('dialog.validationFailed')}
                      </h4>
                      {validationResult.errors.length > 0 && (
                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-2xs">
                          {validationResult.errors.map((err, index) => (
                            <li key={index}>{err}</li>
                          ))}
                        </ul>
                      )}
                      {validationResult.valid && validationResult.warnings.length > 0 && (
                        <div className="mt-1 space-y-0.5 text-2xs">
                          {validationResult.warnings.map((info, index) => (
                            <p key={index}>{info}</p>
                          ))}
                        </div>
                      )}
                      {!validationResult.valid && validationResult.warnings.length > 0 && (
                        <div className="mt-2 text-2xs text-yellow-600 dark:text-yellow-400">
                          <p className="mb-1 font-medium">{t('dialog.warnings')}</p>
                          <ul className="list-inside list-disc space-y-0.5">
                            {validationResult.warnings.map((warn, index) => (
                              <li key={index}>{warn}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {selectedType && !qrCode && !loadingConfig && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-5 py-3">
            {meta?.connectionType === 'token' && shouldUseCredentialValidation && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidate}
                disabled={validating}
                className="h-8 border-border/60 bg-card/40 px-3 text-xs"
              >
                {validating ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    {t('dialog.validating')}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    {t('dialog.validateConfig')}
                  </>
                )}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                void handleConnect();
              }}
              disabled={connecting || !isFormValid() || (showAccountIdEditor && !accountIdInput.trim())}
              className="h-8 px-3 text-xs"
            >
              {connecting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {meta?.connectionType === 'qr' ? t('dialog.generatingQR') : t('dialog.validatingAndSaving')}
                </>
              ) : meta?.connectionType === 'qr' ? (
                t('dialog.generateQRCode')
              ) : (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  {isExistingConfig ? t('dialog.updateAndReconnect') : t('dialog.saveAndConnect')}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

interface ConfigFieldProps {
  field: ChannelConfigField;
  value: string;
  onChange: (value: string) => void;
  showSecret: boolean;
  onToggleSecret: () => void;
}

function ChannelLogo({ type }: { type: ChannelType }) {
  switch (type) {
    case 'telegram':
      return <img src={telegramIcon} alt="Telegram" className="w-[22px] h-[22px] dark:invert" />;
    case 'discord':
      return <img src={discordIcon} alt="Discord" className="w-[22px] h-[22px] dark:invert" />;
    case 'whatsapp':
      return <img src={whatsappIcon} alt="WhatsApp" className="w-[22px] h-[22px] dark:invert" />;
    case 'wechat':
      return <img src={wechatIcon} alt="WeChat" className="w-[22px] h-[22px] dark:invert" />;
    case 'dingtalk':
      return <img src={dingtalkIcon} alt="DingTalk" className="w-[22px] h-[22px] dark:invert" />;
    case 'feishu':
      return <img src={feishuIcon} alt="Feishu" className="w-[22px] h-[22px] dark:invert" />;
    case 'wecom':
      return <img src={wecomIcon} alt="WeCom" className="w-[22px] h-[22px] dark:invert" />;
    case 'qqbot':
      return <img src={qqIcon} alt="QQ" className="w-[22px] h-[22px] dark:invert" />;
    default:
      return <span className="text-xl">{CHANNEL_ICONS[type] || '💬'}</span>;
  }
}

function ConfigField({ field, value, onChange, showSecret, onToggleSecret }: ConfigFieldProps) {
  const { t } = useTranslation('channels');
  const isPassword = field.type === 'password';

  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.key} className={CHANNEL_DIALOG_LABEL}>
        {t(field.label)}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <div className="flex gap-2">
        <Input
          id={field.key}
          type={isPassword && !showSecret ? 'password' : 'text'}
          placeholder={field.placeholder ? t(field.placeholder) : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(CHANNEL_DIALOG_INPUT, 'font-mono')}
        />
        {isPassword && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onToggleSecret}
            className="h-9 w-9 shrink-0 rounded-lg border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
          >
            {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
      {field.description && (
        <p className="text-2xs leading-relaxed text-muted-foreground">
          {t(field.description)}
        </p>
      )}
      {field.envVar && (
        <p className="font-mono text-2xs text-muted-foreground/80">
          {t('dialog.envVar', { var: field.envVar })}
        </p>
      )}
    </div>
  );
}
