package expo.modules.providerforeground

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Bridges JS calls to the [ProviderForegroundService]. The service keeps the app process alive and
 * declares the `camera`/`dataSync`/`location` foreground-service types so the phone can keep
 * streaming its camera and sensors while backgrounded or with the screen off.
 */
class ProviderForegroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ProviderForeground")

    // Start or update the service. Calling again updates the notification text and the active
    // service-type mask (e.g. when the camera turns on/off mid-session).
    Function("startService") { title: String, text: String, types: List<String> ->
      val context = appContext.reactContext
      if (context != null) {
        val intent = Intent(context, ProviderForegroundService::class.java).apply {
          action = ProviderForegroundService.ACTION_START
          putExtra(ProviderForegroundService.EXTRA_TITLE, title)
          putExtra(ProviderForegroundService.EXTRA_TEXT, text)
          putStringArrayListExtra(ProviderForegroundService.EXTRA_TYPES, ArrayList(types))
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      }
    }

    Function("stopService") {
      val context = appContext.reactContext
      if (context != null) {
        context.stopService(Intent(context, ProviderForegroundService::class.java))
      }
    }
  }
}
