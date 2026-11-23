import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { router } from "expo-router";
import { api } from "./api";

// Configure foreground notification behavior:
// Show banner and badge, but keep sound silent here because the app's in-app chime
// (playNotificationBell) handles foreground sound to avoid duplicate sounds.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

let pendingNavigationPath: string | null = null;
let currentPushToken: string | null = null;

export async function setupAndroidChannels() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("trade-updates", {
    name: "Trade Updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#3ecf8e",
    enableLights: true,
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync("trade-messages", {
    name: "Trade Messages",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#3ecf8e",
    enableLights: true,
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
  });
}

export async function setupNotificationCategories() {
  await Notifications.setNotificationCategoryAsync("trade-action", [
    {
      identifier: "view-trade",
      buttonTitle: "Open Trade Room",
      options: { opensAppToForeground: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync("chat-message", [
    {
      identifier: "open-chat",
      buttonTitle: "Reply in Chat",
      options: { opensAppToForeground: true },
    },
  ]);
}

async function getPlatformDeviceId(): Promise<string | undefined> {
  try {
    if (Platform.OS === "android") {
      return Application.getAndroidId() ?? undefined;
    }
    if (Platform.OS === "ios") {
      return (await Application.getIosIdForVendorAsync()) ?? undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Requests notification permissions (if not already determined) and registers
 * the Expo Push Token with the 2Pescrow backend.
 */
export async function registerDevicePushToken(authenticated: boolean): Promise<string | null> {
  try {
    // Android 13+ requires at least one notification channel before requesting permission.
    if (Platform.OS === "android") {
      await setupAndroidChannels();
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    await setupNotificationCategories().catch(() => undefined);

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      "787dba3c-e58b-41d0-a25b-c6d72769a6aa";

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    currentPushToken = token;

    if (authenticated && token) {
      const deviceId = await getPlatformDeviceId();
      await api("/v1/me/device-tokens", {
        method: "POST",
        body: JSON.stringify({
          token,
          platform: Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web",
          deviceId,
          appVersion: Application.nativeApplicationVersion ?? "1.0.0",
        }),
      }).catch((err) => {
        console.warn("[Push] Failed to register token with backend:", err);
      });
    }

    return token;
  } catch (err) {
    console.warn("[Push] Failed to get expo push token:", err);
    return null;
  }
}

/**
 * Cleanly unregisters this device token on logout or account switch.
 */
export async function unregisterCurrentPushToken() {
  if (!currentPushToken) return;
  try {
    await api("/v1/me/device-tokens", {
      method: "DELETE",
      body: JSON.stringify({ token: currentPushToken }),
    });
  } catch (err) {
    console.warn("[Push] Failed to unregister device token on logout:", err);
  } finally {
    currentPushToken = null;
  }
}

/**
 * Dispatches deep link navigation when tapping a notification.
 */
export function handleNotificationResponse(response: Notifications.NotificationResponse, isAuthenticated: boolean) {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const path =
    (typeof data?.path === "string" ? data.path : null) ??
    (typeof data?.escrowId === "string" ? `/trade/${data.escrowId}` : null);

  if (!path) return;

  if (isAuthenticated) {
    try {
      router.push(path as never);
      pendingNavigationPath = null;
    } catch {
      pendingNavigationPath = path;
    }
  } else {
    pendingNavigationPath = path;
  }
}

/**
 * Called once authentication is confirmed to flush any pending notification click.
 */
export function flushPendingNotificationNavigation() {
  if (pendingNavigationPath) {
    const target = pendingNavigationPath;
    pendingNavigationPath = null;
    try {
      router.push(target as never);
    } catch {
      // Re-queue if router wasn't ready
      pendingNavigationPath = target;
    }
  }
}

/**
 * Initializes listeners for incoming foreground push notifications and user notification responses (clicks).
 */
export function initPushNotificationListeners(opts: {
  onForegroundNotification?: (notif: Notifications.Notification) => void;
  isAuthenticated: () => boolean;
}) {
  // Listen for notification taps / deep links while app is backgrounded
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationResponse(response, opts.isAuthenticated());
  });

  // Check if app was opened from cold start by tapping a push notification
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      handleNotificationResponse(response, opts.isAuthenticated());
    }
  });

  // Listen for foreground notification delivery
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    opts.onForegroundNotification?.(notification);
  });

  return () => {
    responseSubscription.remove();
    receivedSubscription.remove();
  };
}
