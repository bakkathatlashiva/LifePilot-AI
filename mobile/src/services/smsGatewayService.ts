import api from '../lib/api';
import {
  checkSmsPermission,
  requestSmsPermission,
  getGatewayDeviceId,
  getGatewayBatteryInfo,
  getGatewaySimInfo,
  sendSimSms,
} from '../../modules/sms-gateway';

export interface GatewayState {
  isActive: boolean;
  deviceId: string;
  deviceName: string;
  simOperator: string;
  batteryLevel: number;
  isCharging: boolean;
  lastHeartbeatAt: Date | null;
  jobsProcessed: number;
  jobsFailed: number;
  currentActivity: string;
}

type GatewayListener = (state: GatewayState) => void;

class SmsGatewayEngine {
  private state: GatewayState = {
    isActive: false,
    deviceId: '',
    deviceName: 'Personal Android Phone',
    simOperator: 'Detecting...',
    batteryLevel: 100,
    isCharging: false,
    lastHeartbeatAt: null,
    jobsProcessed: 0,
    jobsFailed: 0,
    currentActivity: 'Gateway Idle',
  };

  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private listeners: Set<GatewayListener> = new Set();

  public subscribe(listener: GatewayListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const copy = { ...this.state };
    for (const listener of this.listeners) {
      listener(copy);
    }
  }

  public getState(): GatewayState {
    return { ...this.state };
  }

  /**
   * Initializes and starts the background SMS gateway worker
   */
  public async start(): Promise<{ success: boolean; message: string }> {
    if (this.state.isActive) {
      return { success: true, message: 'SMS Gateway is already running' };
    }

    // 1. Check or request SMS permission
    const hasPermission = await checkSmsPermission();
    if (!hasPermission) {
      const granted = await requestSmsPermission();
      if (!granted) {
        return {
          success: false,
          message: 'SEND_SMS permission was denied. Cannot start personal SMS gateway.',
        };
      }
    }

    // 2. Gather device, SIM, and battery telemetry
    const deviceId = await getGatewayDeviceId();
    const battery = await getGatewayBatteryInfo();
    const sim = await getGatewaySimInfo();

    this.state.deviceId = deviceId;
    this.state.deviceName = sim.phoneModel || 'Personal Android Gateway';
    this.state.simOperator = sim.simOperator;
    this.state.batteryLevel = battery.batteryLevel;
    this.state.isCharging = battery.isCharging;
    this.state.currentActivity = 'Registering with backend...';
    this.notify();

    // 3. Register device with backend
    try {
      await api.post('/sms/gateway/register', {
        deviceId,
        deviceName: this.state.deviceName,
        simOperator: this.state.simOperator,
        batteryLevel: this.state.batteryLevel,
        isCharging: this.state.isCharging,
      });
    } catch (err: any) {
      this.state.currentActivity = 'Registration error';
      this.notify();
      return {
        success: false,
        message: err?.response?.data?.message || err?.message || 'Failed to register gateway with server',
      };
    }

    // 4. Activate workers
    this.state.isActive = true;
    this.state.lastHeartbeatAt = new Date();
    this.state.currentActivity = 'Listening for pending SMS jobs...';
    this.notify();

    // Start periodic heartbeat (every 45 seconds)
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), 45000);

    // Start periodic polling for jobs (every 8 seconds)
    this.pollTimer = setInterval(() => this.pollAndProcessJobs(), 8000);

    // Run first check immediately
    this.pollAndProcessJobs();

    return { success: true, message: 'Personal SIM SMS Gateway started successfully' };
  }

  /**
   * Stops the gateway polling service
   */
  public async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.pollTimer = null;
    this.heartbeatTimer = null;

    if (this.state.isActive && this.state.deviceId) {
      try {
        await api.post('/sms/gateway/heartbeat', {
          deviceId: this.state.deviceId,
          status: 'PAUSED',
        });
      } catch {}
    }

    this.state.isActive = false;
    this.state.currentActivity = 'Gateway Stopped';
    this.notify();
  }

  public async sendImmediateSms(
    recipientPhone: string,
    message: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.state.currentActivity = `Sending SMS to ${recipientPhone}...`;
      this.notify();

      const result = await sendSimSms(recipientPhone, message);
      if (result.success) {
        this.state.jobsProcessed += 1;
        this.state.currentActivity = `SMS sent to ${recipientPhone}`;
      } else {
        this.state.jobsFailed += 1;
        this.state.currentActivity = `Failed to send: ${result.error || 'Unknown error'}`;
      }
      this.notify();
      return { success: result.success, error: result.error };
    } catch (err: any) {
      this.state.jobsFailed += 1;
      this.state.currentActivity = `Error: ${err?.message || 'Send failure'}`;
      this.notify();
      return { success: false, error: err?.message };
    }
  }

  /**
   * Heartbeat telemetry
   */
  private async sendHeartbeat() {
    if (!this.state.isActive || !this.state.deviceId) return;
    try {
      const battery = await getGatewayBatteryInfo();
      this.state.batteryLevel = battery.batteryLevel;
      this.state.isCharging = battery.isCharging;

      await api.post('/sms/gateway/heartbeat', {
        deviceId: this.state.deviceId,
        batteryLevel: this.state.batteryLevel,
        isCharging: this.state.isCharging,
        status: 'ONLINE',
      });
      this.state.lastHeartbeatAt = new Date();
      this.notify();
    } catch {}
  }

  /**
   * Polls backend for pending jobs and dispatches them via SIM card
   */
  private async pollAndProcessJobs() {
    if (!this.state.isActive || this.isProcessing || !this.state.deviceId) return;

    this.isProcessing = true;
    try {
      const response = await api.get('/sms/gateway/jobs', {
        params: { deviceId: this.state.deviceId, limit: 5 },
      });

      const jobs: any[] = response.data?.data || [];
      if (jobs.length > 0) {
        this.state.currentActivity = `Dispatching ${jobs.length} SMS message(s)...`;
        this.notify();

        for (const job of jobs) {
          try {
            console.log(`[SMS Gateway Engine] Sending SMS job ${job.id} to ${job.recipientPhone}`);
            const result = await sendSimSms(job.recipientPhone, job.message, job.simSlot || 0);

            // Report result back to backend
            await api.post(`/sms/gateway/jobs/${job.id}/result`, {
              deviceId: this.state.deviceId,
              success: result.success,
              error: result.error,
              deliveredAt: result.sentAt ? new Date(result.sentAt).toISOString() : new Date().toISOString(),
              simSlotUsed: job.simSlot || 0,
            });

            if (result.success) {
              this.state.jobsProcessed += 1;
            } else {
              this.state.jobsFailed += 1;
            }
          } catch (jobErr: any) {
            console.error(`[SMS Gateway Engine] Error processing job ${job.id}:`, jobErr);
            this.state.jobsFailed += 1;
            try {
              await api.post(`/sms/gateway/jobs/${job.id}/result`, {
                deviceId: this.state.deviceId,
                success: false,
                error: jobErr?.message || 'Local execution failed',
              });
            } catch {}
          }
        }

        this.state.currentActivity = 'Listening for pending SMS jobs...';
        this.notify();
      }
    } catch (err: any) {
      // Network or connection error; wait for next cycle
    } finally {
      this.isProcessing = false;
    }
  }
}

export const smsGatewayEngine = new SmsGatewayEngine();

