import { notificationChannelEndpointsDb, notificationPreferencesDb } from '@/modules/database/index.js';
import { isHarmonyPushConfigured } from '@/modules/notifications/services/harmony-push.service.js';

/** Used by Notifications routes to persist one device and reconcile its channel switch. */
export function registerNotificationEndpoint(input: {
  userId: number; channel: string; endpointId: string; label: string | null;
  metadata: Record<string, unknown>; enabled: boolean;
}) {
  const endpoint = notificationChannelEndpointsDb.upsertEndpoint(input);
  const current = notificationPreferencesDb.getPreferences(input.userId);
  const hasEnabledEndpoint = notificationChannelEndpointsDb.getEnabledEndpoints(input.userId, input.channel).length > 0;
  const preferences = notificationPreferencesDb.updatePreferences(input.userId, {
    ...current, channels: { ...current.channels, [input.channel]: hasEnabledEndpoint },
  });
  return { endpoint, preferences, harmonyPushConfigured: isHarmonyPushConfigured(), harmonyNotificationLevels: true };
}
