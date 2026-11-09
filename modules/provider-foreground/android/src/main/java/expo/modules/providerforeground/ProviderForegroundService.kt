package expo.modules.providerforeground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * A foreground service whose only job is to keep the app process alive and hold the
 * `camera`/`location`/`connectedDevice` foreground-service types while the phone streams (`dataSync`
 * only as a last fallback: Android 15+ allows it 6 hours a day, see [onTimeout]). It runs no logic
 * of its own — the WebRTC peer connection and sensor sockets live in JS and keep running because the
 * process stays foregrounded.
 *
 * START_NOT_STICKY: if the OS kills the service we do NOT silently relaunch it headless (there would
 * be no JS state or camera permission prompt to resume from); the user restarts streaming from the
 * app. The persistent notification reopens the app when tapped.
 */
class ProviderForegroundService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.providerforeground.START"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_TYPES = "types"
    private const val CHANNEL_ID = "provider_streaming"
    private const val NOTIFICATION_ID = 0x50524f56 // "PROV"
    private const val TAG = "ProviderForeground"
  }

  /** The type mask the service currently runs with (0 = not foreground yet). */
  private var currentMask = 0
  private var notification: Notification? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Streaming"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Streaming to the robot controller"
    val types = intent?.getStringArrayListExtra(EXTRA_TYPES) ?: arrayListOf("camera")

    ensureChannel()
    val n = buildNotification(title, text)
    notification = n

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Try the full mask first, then each type on its own, then the always-allowed fallbacks. A
      // refused startForeground() (e.g. camera from the background, a type whose daily time ran out)
      // throws — uncaught, that kills the app, so a refusal must only ever cost us that one type.
      val wanted = typesMask(types)
      val attempts = LinkedHashSet<Int>()
      attempts.add(wanted)
      for (bit in bits(wanted)) attempts.add(bit)
      attempts.add(connectedDeviceMask())
      attempts.add(ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      for (mask in attempts) {
        if (mask == 0) continue
        if (tryStartForeground(n, mask)) return START_NOT_STICKY
      }
      Log.w(TAG, "no foreground-service type was allowed; stopping the service")
      stopSelf()
    } else {
      try { startForeground(NOTIFICATION_ID, n) } catch (e: Exception) { Log.w(TAG, "startForeground failed", e); stopSelf() }
    }
    return START_NOT_STICKY
  }

  private fun tryStartForeground(n: Notification, mask: Int): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    return try {
      startForeground(NOTIFICATION_ID, n, mask)
      currentMask = mask
      true
    } catch (e: Exception) {
      Log.w(TAG, "startForeground(type=$mask) refused: ${e.javaClass.simpleName}: ${e.message}")
      false
    }
  }

  /**
   * Android 15+: a type with a daily time limit (dataSync: 6 h a day) ran out. We must drop it within
   * a few seconds or the system crashes the app (ForegroundServiceDidNotStopInTimeException — what
   * made a streaming phone "suddenly close after a while"). Keep running on the remaining types if
   * there are any, otherwise stop the service; the stream itself keeps going while the app is open,
   * and the app re-asserts the service the next time it comes to the foreground.
   */
  override fun onTimeout(startId: Int, fgsType: Int) {
    Log.w(TAG, "foreground-service type $fgsType hit its time limit")
    val rest = currentMask and fgsType.inv()
    val n = notification
    if (rest != 0 && n != null && tryStartForeground(n, rest)) return
    stopForegroundCompat()
    stopSelf()
  }

  /** Android 14 short-service timeout (we never use that type, but never let it crash the app). */
  @Deprecated("Superseded by onTimeout(Int, Int) on Android 15")
  override fun onTimeout(startId: Int) {
    stopForegroundCompat()
    stopSelf()
  }

  private fun stopForegroundCompat() {
    try {
      stopForeground(Service.STOP_FOREGROUND_REMOVE)
    } catch (_: Exception) { /* not foreground */ }
    currentMask = 0
  }

  private fun bits(mask: Int): List<Int> {
    val out = ArrayList<Int>()
    var m = mask
    while (m != 0) {
      val low = m and -m
      out.add(low)
      m = m and low.inv()
    }
    return out
  }

  private fun connectedDeviceMask(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0

  /** OR together the ServiceInfo type constants for the requested types (API-gated per constant). */
  private fun typesMask(types: List<String>): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
    var mask = 0
    for (t in types) {
      mask = mask or when (t) {
        // camera/microphone types were added in API 30 (R).
        "camera" ->
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0
        "microphone" ->
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
        "location" -> ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        "dataSync" -> ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        "connectedDevice" -> ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        else -> 0
      }
    }
    // Never start with an empty mask on Q+: connectedDevice has no daily time limit (dataSync does,
    // from Android 15 — it stays only as the last fallback in onStartCommand).
    if (mask == 0) mask = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    return mask
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
        val ch = NotificationChannel(CHANNEL_ID, "Streaming", NotificationManager.IMPORTANCE_LOW)
        ch.description = "Phone is streaming its camera and sensors to the robot controller."
        ch.setShowBadge(false)
        mgr.createNotificationChannel(ch)
      }
    }
  }

  private fun buildNotification(title: String, text: String): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val piFlags =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      else PendingIntent.FLAG_UPDATE_CURRENT
    val contentPi =
      if (launch != null) PendingIntent.getActivity(this, 0, launch, piFlags) else null

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(contentPi)
      .build()
  }
}
