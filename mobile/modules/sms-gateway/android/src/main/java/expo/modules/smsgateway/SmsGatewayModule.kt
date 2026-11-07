package expo.modules.smsgateway

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

class SmsGatewayModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React application context is not available")

  override fun definition() = ModuleDefinition {
    Name("SmsGateway")

    // Check if SEND_SMS permission is granted
    AsyncFunction("checkSmsPermission") {
      val granted = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.SEND_SMS
      ) == PackageManager.PERMISSION_GRANTED
      granted
    }

    // Get unique hardware / persistent Android device ID
    AsyncFunction("getDeviceId") {
      val androidId = Settings.Secure.getString(
        context.contentResolver,
        Settings.Secure.ANDROID_ID
      )
      if (!androidId.isNullOrEmpty()) androidId else "android_${Build.SERIAL ?: UUID.randomUUID().toString().take(12)}"
    }

    // Get battery percentage and charging state
    AsyncFunction("getBatteryInfo") {
      val batteryIntent = context.registerReceiver(
        null,
        IntentFilter(Intent.ACTION_BATTERY_CHANGED)
      )
      val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
      val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
      val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1

      val batteryPct = if (level >= 0 && scale > 0) (level * 100 / scale) else 100
      val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
        status == BatteryManager.BATTERY_STATUS_FULL

      mapOf(
        "batteryLevel" to batteryPct,
        "isCharging" to isCharging
      )
    }

    // Get SIM operator name and availability
    AsyncFunction("getSimInfo") {
      val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
      val simOperator = telephonyManager?.simOperatorName?.ifEmpty {
        telephonyManager.networkOperatorName
      } ?: "Active SIM"

      val isSimReady = telephonyManager?.simState == TelephonyManager.SIM_STATE_READY

      mapOf(
        "simOperator" to simOperator,
        "isReady" to isSimReady,
        "simState" to (telephonyManager?.simState ?: 0),
        "phoneModel" to "${Build.MANUFACTURER} ${Build.MODEL}"
      )
    }

    // Send SMS directly via Android SmsManager using the SIM card
    AsyncFunction("sendSms") { phoneNumber: String, message: String, simSlot: Int?, promise: Promise ->
      try {
        val hasPermission = ContextCompat.checkSelfPermission(
          context,
          Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) {
          promise.reject("PERMISSION_DENIED", "SEND_SMS permission has not been granted by user", null)
          return@AsyncFunction
        }

        val cleanedPhone = phoneNumber.replace(Regex("[\\s\\-\\(\\)]"), "").trim()
        if (cleanedPhone.isEmpty()) {
          promise.reject("INVALID_PHONE", "Recipient phone number is invalid", null)
          return@AsyncFunction
        }

        // Obtain appropriate SmsManager (handling dual-SIM subscriptions if available)
        val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          val systemSmsManager = context.getSystemService(SmsManager::class.java)
          if (simSlot != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            val subManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
            val subList = subManager?.activeSubscriptionInfoList
            val targetSub = subList?.getOrNull(simSlot)
            if (targetSub != null) {
              systemSmsManager.createForSubscriptionId(targetSub.subscriptionId)
            } else {
              systemSmsManager
            }
          } else {
            systemSmsManager
          }
        } else {
          @Suppress("DEPRECATION")
          SmsManager.getDefault()
        }

        val actionId = "SMS_SENT_${UUID.randomUUID()}"
        val sentIntent = PendingIntent.getBroadcast(
          context,
          0,
          Intent(actionId),
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        // Register receiver for delivery confirmation
        val receiver = object : BroadcastReceiver() {
          override fun onReceive(c: Context?, intent: Intent?) {
            try {
              context.unregisterReceiver(this)
            } catch (_: Exception) {}

            when (resultCode) {
              Activity.RESULT_OK -> {
                promise.resolve(
                  mapOf(
                    "success" to true,
                    "status" to "SENT",
                    "sentAt" to System.currentTimeMillis()
                  )
                )
              }
              SmsManager.RESULT_ERROR_NO_SERVICE -> {
                promise.resolve(
                  mapOf(
                    "success" to false,
                    "status" to "FAILED",
                    "error" to "No cellular service available on SIM"
                  )
                )
              }
              SmsManager.RESULT_ERROR_RADIO_OFF -> {
                promise.resolve(
                  mapOf(
                    "success" to false,
                    "status" to "FAILED",
                    "error" to "Device radio / Airplane mode is active"
                  )
                )
              }
              else -> {
                promise.resolve(
                  mapOf(
                    "success" to false,
                    "status" to "FAILED",
                    "error" to "Carrier transmission error (code $resultCode)"
                  )
                )
              }
            }
          }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          context.registerReceiver(receiver, IntentFilter(actionId), Context.RECEIVER_NOT_EXPORTED)
        } else {
          context.registerReceiver(receiver, IntentFilter(actionId))
        }

        // Handle multipart SMS if message length exceeds single SMS limit
        val parts = smsManager.divideMessage(message)
        if (parts.size > 1) {
          val sentIntents = ArrayList<PendingIntent>()
          for (i in parts.indices) {
            sentIntents.add(if (i == parts.size - 1) sentIntent else sentIntent)
          }
          smsManager.sendMultipartTextMessage(cleanedPhone, null, parts, sentIntents, null)
        } else {
          smsManager.sendTextMessage(cleanedPhone, null, message, sentIntent, null)
        }

      } catch (e: Exception) {
        promise.reject("SMS_SEND_EXCEPTION", e.message ?: "Unknown exception while dispatching SMS", e)
      }
    }
  }
}

