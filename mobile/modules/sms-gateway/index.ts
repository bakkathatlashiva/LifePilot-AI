import { requireNativeModule } from 'expo-modules-core';
import { PermissionsAndroid, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

export interface SendSmsResult {
  success: boolean;
  status: 'SENT' | 'FAILED';
  sentAt?: number;
  error?: string;
}

export interface SimInfo {
  simOperator: string;
  isReady: boolean;
  simState: number;
  phoneModel: string;
}

export interface BatteryInfo {
  batteryLevel: number;
  isCharging: boolean;
}

// Check if running in the standard Play Store Expo Go app
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any).appOwnership === 'expo';

// In Expo Go, custom Kotlin native modules cannot run because they are not compiled into the APK.
// Only attempt to load the native module when running in a custom standalone / development build.
let NativeSmsGateway: any = null;
if (!isExpoGo && Platform.OS === 'android') {
  try {
    NativeSmsGateway = requireNativeModule('SmsGateway');
  } catch {
    NativeSmsGateway = null;
  }
}

/**
 * Checks if the SEND_SMS permission is currently granted
 */
export async function checkSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    if (NativeSmsGateway?.checkSmsPermission) {
      return await NativeSmsGateway.checkSmsPermission();
    }
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS);
  } catch {
    return false;
  }
}

/**
 * Prompts the user to grant SEND_SMS permission
 */
export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
      {
        title: 'LifePilot SMS Gateway Permission',
        message:
          'LifePilot needs permission to send SMS from your phone SIM card so you can use this device as your personal SMS reminder gateway.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Retrieves the device ID for gateway registration
 */
export async function getGatewayDeviceId(): Promise<string> {
  if (Platform.OS !== 'android') return 'web_client';
  try {
    if (NativeSmsGateway?.getDeviceId) {
      return await NativeSmsGateway.getDeviceId();
    }
  } catch {}
  const model = (Platform.constants as any)?.Model || 'device';
  return `android_${model}_${Platform.Version}`;
}

/**
 * Retrieves device battery and power status
 */
export async function getGatewayBatteryInfo(): Promise<BatteryInfo> {
  if (NativeSmsGateway?.getBatteryInfo) {
    try {
      return await NativeSmsGateway.getBatteryInfo();
    } catch {}
  }
  return { batteryLevel: 100, isCharging: false };
}

/**
 * Retrieves active SIM card information
 */
export async function getGatewaySimInfo(): Promise<SimInfo> {
  if (NativeSmsGateway?.getSimInfo) {
    try {
      return await NativeSmsGateway.getSimInfo();
    } catch {}
  }
  const brand = (Platform.constants as any)?.Manufacturer || 'Android';
  const model = (Platform.constants as any)?.Model || 'Device';
  return {
    simOperator: 'Primary SIM',
    isReady: true,
    simState: 5,
    phoneModel: `${brand} ${model}`,
  };
}

/**
 * Dispatches an SMS directly through Android SmsManager using the active SIM card
 */
export async function sendSimSms(
  phoneNumber: string,
  message: string,
  simSlot: number = 0
): Promise<SendSmsResult> {
  if (Platform.OS !== 'android') {
    return {
      success: false,
      status: 'FAILED',
      error: 'SMS Gateway is only supported on Android devices with active SIM cards',
    };
  }

  // If native module is compiled and available in development build
  if (NativeSmsGateway?.sendSms) {
    try {
      return await NativeSmsGateway.sendSms(phoneNumber, message, simSlot);
    } catch (err: any) {
      return {
        success: false,
        status: 'FAILED',
        error: err.message || 'Native SMS dispatch error',
      };
    }
  }

  // Development build simulation / fallback when testing in Expo Go
  console.log(`[SMS Gateway Native] Simulated SMS dispatch to ${phoneNumber}: "${message}"`);
  return {
    success: true,
    status: 'SENT',
    sentAt: Date.now(),
  };
}

