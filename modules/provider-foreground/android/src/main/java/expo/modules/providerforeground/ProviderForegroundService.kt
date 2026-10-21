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
import androidx.core.app.NotificationCompat

/**
 * A foreground service whose only job is to keep the app process alive and hold the
 * `camera`/`dataSync`/`location` foreground-service types while the phone streams. It runs no logic
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
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Streaming"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Streaming to the robot controller"
    val types = intent?.getStringArrayListExtra(EXTRA_TYPES) ?: arrayListOf("camera", "dataSync")

    ensureChannel()
    val notification = buildNotification(title, text)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, typesMask(types))
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    return START_NOT_STICKY
  }

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
        else -> 0
      }
    }
    // Never start with an empty mask on Q+ — dataSync is always safe (no extra runtime permission).
    if (mask == 0) mask = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
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
